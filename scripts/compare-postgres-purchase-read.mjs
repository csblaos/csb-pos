import "./load-local-env.mjs";

import { createClient } from "@libsql/client";
import { Sequelize } from "sequelize";

const sourceDatabaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const sourceAuthToken = process.env.TURSO_AUTH_TOKEN;
const targetDatabaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!targetDatabaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sanitizeDatabaseUrl = (databaseUrl) => {
  const trimmed = databaseUrl.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslrootcert");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("uselibpqcompat");
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const sslMode = (process.env.POSTGRES_SSL_MODE ?? "require").trim().toLowerCase();
const shouldUseSsl = sslMode !== "disable" && sslMode !== "off" && sslMode !== "false";
const rejectUnauthorized =
  (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "0").trim() === "1";

const source = createClient({
  url: sourceDatabaseUrl,
  authToken: sourceAuthToken,
});

const target = new Sequelize(sanitizeDatabaseUrl(targetDatabaseUrl), {
  dialect: "postgres",
  logging: false,
  dialectOptions: shouldUseSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});

const normalizeScalar = (value) => {
  if (typeof value === "number") {
    return Number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
  return value;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }
  return normalizeScalar(value);
};

const asComparableJson = (value) => JSON.stringify(normalizeValue(value));

const fetchSourceRows = async (sql, args = []) => {
  const result = await source.execute({ sql, args });
  return result.rows.map((row) => ({ ...row }));
};

const fetchTargetRows = async (sql, replacements = {}) => {
  const [rows] = await target.query(sql, { replacements });
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
};

const getPurchaseStoreIds = async () => {
  const rows = await fetchSourceRows(`
    select distinct store_id as "storeId"
    from purchase_orders
    order by store_id asc
  `);
  return rows.map((row) => String(row.storeId));
};

const getStoreCurrencyMap = async () => {
  const rows = await fetchSourceRows(`
    select id, currency
    from stores
    order by id asc
  `);

  return new Map(rows.map((row) => [String(row.id), String(row.currency ?? "LAK")]));
};

const fetchSourcePurchaseList = async (storeId) =>
  fetchSourceRows(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.due_date as "dueDate",
        po.status as "status",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.created_at as "createdAt",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = ?
      order by po.created_at desc
    `,
    [storeId],
  );

const fetchTargetPurchaseList = async (storeId) =>
  fetchTargetRows(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.due_date as "dueDate",
        po.status as "status",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.created_at as "createdAt",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = :storeId
      order by po.created_at desc
    `,
    { storeId },
  );

const fetchPurchaseIds = async () => {
  const rows = await fetchSourceRows(`
    select id, store_id as "storeId"
    from purchase_orders
    order by created_at asc, id asc
  `);
  return rows.map((row) => ({
    id: String(row.id),
    storeId: String(row.storeId),
  }));
};

const fetchSourcePurchaseDetail = async (poId, storeId) => {
  const [mainRow] = await fetchSourceRows(
    `
      select
        po.id as "id",
        po.store_id as "storeId",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.supplier_contact as "supplierContact",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate as "exchangeRate",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.exchange_rate_locked_by as "exchangeRateLockedBy",
        po.exchange_rate_lock_note as "exchangeRateLockNote",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.paid_by as "paidBy",
        po.payment_reference as "paymentReference",
        po.payment_note as "paymentNote",
        po.due_date as "dueDate",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.other_cost_note as "otherCostNote",
        po.status as "status",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.tracking_info as "trackingInfo",
        po.note as "note",
        po.created_by as "createdBy",
        po.updated_by as "updatedBy",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt",
        created_user.name as "createdByName",
        paid_user.name as "paidByName"
      from purchase_orders po
      left join users created_user
        on created_user.id = po.created_by
      left join users paid_user
        on paid_user.id = po.paid_by
      where po.id = ?
        and po.store_id = ?
      limit 1
    `,
    [poId, storeId],
  );

  if (!mainRow) {
    return null;
  }

  const [items, paymentEntries] = await Promise.all([
    fetchSourceRows(
      `
        select
          poi.id as "id",
          poi.purchase_order_id as "purchaseOrderId",
          poi.product_id as "productId",
          poi.qty_ordered as "qtyOrdered",
          poi.qty_received as "qtyReceived",
          poi.unit_cost_purchase as "unitCostPurchase",
          poi.unit_cost_base as "unitCostBase",
          poi.landed_cost_per_unit as "landedCostPerUnit",
          p.name as "productName",
          p.sku as "productSku"
        from purchase_order_items poi
        inner join products p
          on p.id = poi.product_id
        where poi.purchase_order_id = ?
        order by poi.id asc
      `,
      [poId],
    ),
    fetchSourceRows(
      `
        select
          pop.id as "id",
          pop.purchase_order_id as "purchaseOrderId",
          pop.store_id as "storeId",
          pop.entry_type as "entryType",
          pop.amount_base as "amountBase",
          pop.paid_at as "paidAt",
          pop.reference as "reference",
          pop.note as "note",
          pop.reversed_payment_id as "reversedPaymentId",
          pop.created_by as "createdBy",
          pop.created_at as "createdAt",
          u.name as "createdByName"
        from purchase_order_payments pop
        left join users u
          on u.id = pop.created_by
        where pop.purchase_order_id = ?
        order by pop.paid_at desc, pop.created_at desc
      `,
      [poId],
    ),
  ]);

  return {
    ...mainRow,
    items,
    paymentEntries,
  };
};

const fetchTargetPurchaseDetail = async (poId, storeId) => {
  const [mainRow] = await fetchTargetRows(
    `
      select
        po.id as "id",
        po.store_id as "storeId",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.supplier_contact as "supplierContact",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate as "exchangeRate",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.exchange_rate_locked_by as "exchangeRateLockedBy",
        po.exchange_rate_lock_note as "exchangeRateLockNote",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.paid_by as "paidBy",
        po.payment_reference as "paymentReference",
        po.payment_note as "paymentNote",
        po.due_date as "dueDate",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.other_cost_note as "otherCostNote",
        po.status as "status",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.tracking_info as "trackingInfo",
        po.note as "note",
        po.created_by as "createdBy",
        po.updated_by as "updatedBy",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt",
        created_user.name as "createdByName",
        paid_user.name as "paidByName"
      from purchase_orders po
      left join users created_user
        on created_user.id = po.created_by
      left join users paid_user
        on paid_user.id = po.paid_by
      where po.id = :poId
        and po.store_id = :storeId
      limit 1
    `,
    { poId, storeId },
  );

  if (!mainRow) {
    return null;
  }

  const [items, paymentEntries] = await Promise.all([
    fetchTargetRows(
      `
        select
          poi.id as "id",
          poi.purchase_order_id as "purchaseOrderId",
          poi.product_id as "productId",
          poi.qty_ordered as "qtyOrdered",
          poi.qty_received as "qtyReceived",
          poi.unit_cost_purchase as "unitCostPurchase",
          poi.unit_cost_base as "unitCostBase",
          poi.landed_cost_per_unit as "landedCostPerUnit",
          p.name as "productName",
          p.sku as "productSku"
        from purchase_order_items poi
        inner join products p
          on p.id = poi.product_id
        where poi.purchase_order_id = :poId
        order by poi.id asc
      `,
      { poId },
    ),
    fetchTargetRows(
      `
        select
          pop.id as "id",
          pop.purchase_order_id as "purchaseOrderId",
          pop.store_id as "storeId",
          pop.entry_type as "entryType",
          pop.amount_base as "amountBase",
          pop.paid_at as "paidAt",
          pop.reference as "reference",
          pop.note as "note",
          pop.reversed_payment_id as "reversedPaymentId",
          pop.created_by as "createdBy",
          pop.created_at as "createdAt",
          u.name as "createdByName"
        from purchase_order_payments pop
        left join users u
          on u.id = pop.created_by
        where pop.purchase_order_id = :poId
        order by pop.paid_at desc, pop.created_at desc
      `,
      { poId },
    ),
  ]);

  return {
    ...mainRow,
    items,
    paymentEntries,
  };
};

const fetchSourcePendingRateQueue = async (storeId, storeCurrency) =>
  fetchSourceRows(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.received_at as "receivedAt",
        po.expected_at as "expectedAt",
        po.due_date as "dueDate",
        po.payment_status as "paymentStatus",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = ?
        and po.status = 'RECEIVED'
        and po.purchase_currency <> ?
        and po.exchange_rate_locked_at is null
      order by po.received_at desc, po.created_at desc
    `,
    [storeId, storeCurrency],
  );

const fetchTargetPendingRateQueue = async (storeId, storeCurrency) =>
  fetchTargetRows(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.received_at as "receivedAt",
        po.expected_at as "expectedAt",
        po.due_date as "dueDate",
        po.payment_status as "paymentStatus",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = :storeId
        and po.status = 'RECEIVED'
        and po.purchase_currency <> :storeCurrency
        and po.exchange_rate_locked_at is null
      order by po.received_at desc, po.created_at desc
    `,
    { storeId, storeCurrency },
  );

try {
  await Promise.all([target.authenticate(), source.execute("select 1 as ok")]);

  const storeIds = await getPurchaseStoreIds();
  const purchaseIds = await fetchPurchaseIds();
  const storeCurrencyMap = await getStoreCurrencyMap();
  const mismatches = [];

  for (const storeId of storeIds) {
    const [sourceList, targetList] = await Promise.all([
      fetchSourcePurchaseList(storeId),
      fetchTargetPurchaseList(storeId),
    ]);

    console.info(
      `[pg:compare:purchase] list store=${storeId} source=${sourceList.length} target=${targetList.length}`,
    );

    if (asComparableJson(sourceList) !== asComparableJson(targetList)) {
      mismatches.push({
        type: "purchase-list",
        storeId,
        source: sourceList.slice(0, 5),
        target: targetList.slice(0, 5),
      });
    }
  }

  for (const purchase of purchaseIds) {
    const [sourceDetail, targetDetail] = await Promise.all([
      fetchSourcePurchaseDetail(purchase.id, purchase.storeId),
      fetchTargetPurchaseDetail(purchase.id, purchase.storeId),
    ]);

    if (asComparableJson(sourceDetail) !== asComparableJson(targetDetail)) {
      mismatches.push({
        type: "purchase-detail",
        storeId: purchase.storeId,
        poId: purchase.id,
        source: sourceDetail,
        target: targetDetail,
      });
    }
  }

  for (const storeId of storeIds) {
    const storeCurrency = storeCurrencyMap.get(storeId) ?? "LAK";
    const [sourceQueue, targetQueue] = await Promise.all([
      fetchSourcePendingRateQueue(storeId, storeCurrency),
      fetchTargetPendingRateQueue(storeId, storeCurrency),
    ]);

    console.info(
      `[pg:compare:purchase] pending-rate store=${storeId} source=${sourceQueue.length} target=${targetQueue.length}`,
    );

    if (asComparableJson(sourceQueue) !== asComparableJson(targetQueue)) {
      mismatches.push({
        type: "pending-rate-queue",
        storeId,
        source: sourceQueue.slice(0, 5),
        target: targetQueue.slice(0, 5),
      });
    }
  }

  if (mismatches.length > 0) {
    console.error(`[pg:compare:purchase] mismatch count=${mismatches.length}`);
    console.error(JSON.stringify(mismatches.slice(0, 5), null, 2));
    process.exitCode = 1;
  } else {
    console.info(
      `[pg:compare:purchase] parity ok stores=${storeIds.length} purchaseOrders=${purchaseIds.length}`,
    );
  }
} catch (error) {
  console.error("[pg:compare:purchase] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await target.close();
  } catch {}
  try {
    source.close();
  } catch {}
}
