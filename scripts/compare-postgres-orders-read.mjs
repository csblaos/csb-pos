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

const orderListTabs = [
  { name: "ALL", statuses: null },
  {
    name: "PENDING_PAYMENT",
    statuses: ["PENDING_PAYMENT", "READY_FOR_PICKUP", "PICKED_UP_PENDING_PAYMENT"],
  },
  { name: "PAID", statuses: ["PAID", "PACKED"] },
  { name: "SHIPPED", statuses: ["SHIPPED", "COD_RETURNED"] },
];

const normalizeJsonValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    try {
      return normalizeJsonValue(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeJsonValue(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const booleanLikeKeys = new Set(["isDefault", "isActive", "storeVatEnabled"]);

const normalizeScalarByKey = (key, value) => {
  if (!booleanLikeKeys.has(key)) {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }

  return value;
};

const normalizeRow = (row) =>
  Object.keys(row)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      const value = row[key];
      if (Array.isArray(value)) {
        acc[key] = value.map((item) => (item && typeof item === "object" ? normalizeRow(item) : item));
      } else if (value && typeof value === "object") {
        acc[key] = normalizeRow(value);
      } else {
        acc[key] = normalizeScalarByKey(key, value);
      }
      return acc;
    }, {});

const asComparableJson = (value) => JSON.stringify(normalizeRow(value));

const fetchSourceRows = async (sql, args = []) => {
  const result = await source.execute({ sql, args });
  return result.rows.map((row) => ({ ...row }));
};

const fetchTargetRows = async (sql, replacements = {}) => {
  const [rows] = await target.query(sql, { replacements });
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
};

const fetchSourceQrAccounts = async (storeId) =>
  fetchSourceRows(
    `
      select
        id,
        display_name as "displayName",
        account_type as "accountType",
        bank_name as "bankName",
        account_name as "accountName",
        account_number as "accountNumber",
        qr_image_url as "qrImageUrl",
        is_default as "isDefault",
        is_active as "isActive"
      from store_payment_accounts
      where store_id = ?
        and is_active = 1
        and account_type = 'LAO_QR'
      order by is_default desc, created_at asc, id asc
    `,
    [storeId],
  );

const fetchTargetQrAccounts = async (storeId) =>
  fetchTargetRows(
    `
      select
        id,
        display_name as "displayName",
        account_type as "accountType",
        bank_name as "bankName",
        account_name as "accountName",
        account_number as "accountNumber",
        qr_image_url as "qrImageUrl",
        is_default as "isDefault",
        is_active as "isActive"
      from store_payment_accounts
      where store_id = :storeId
        and is_active = true
        and account_type = 'LAO_QR'
      order by is_default desc, created_at asc, id asc
    `,
    { storeId },
  );

const getStoreIds = async () => {
  const rows = await fetchSourceRows(`
    select distinct store_id as "storeId"
    from orders
    order by store_id asc
  `);
  return rows.map((row) => String(row.storeId));
};

const buildSourceOrderListQuery = (statuses) => {
  const statusSql =
    statuses && statuses.length > 0
      ? `and o.status in (${statuses.map(() => "?").join(", ")})`
      : "";

  return `
    select
      o.id,
      o.order_no as "orderNo",
      o.channel,
      o.status,
      o.payment_status as "paymentStatus",
      o.customer_name as "customerName",
      c.display_name as "contactDisplayName",
      o.total,
      o.payment_currency as "paymentCurrency",
      o.payment_method as "paymentMethod",
      o.created_at as "createdAt",
      o.paid_at as "paidAt",
      o.shipped_at as "shippedAt"
    from orders o
    left join contacts c on o.contact_id = c.id
    where o.store_id = ?
    ${statusSql}
    order by o.created_at desc, o.id asc
  `;
};

const buildTargetOrderListQuery = (statuses) => {
  const statusSql =
    statuses && statuses.length > 0
      ? "and o.status in (:statuses)"
      : "";

  return `
    select
      o.id,
      o.order_no as "orderNo",
      o.channel,
      o.status,
      o.payment_status as "paymentStatus",
      o.customer_name as "customerName",
      c.display_name as "contactDisplayName",
      o.total,
      o.payment_currency as "paymentCurrency",
      o.payment_method as "paymentMethod",
      o.created_at as "createdAt",
      o.paid_at as "paidAt",
      o.shipped_at as "shippedAt"
    from orders o
    left join contacts c on o.contact_id = c.id
    where o.store_id = :storeId
    ${statusSql}
    order by o.created_at desc, o.id asc
  `;
};

const fetchSourceOrderDetail = async (storeId, orderId) => {
  const mainRows = await fetchSourceRows(
    `
      select
        o.id,
        o.order_no as "orderNo",
        o.channel,
        o.status,
        o.payment_status as "paymentStatus",
        o.contact_id as "contactId",
        c.display_name as "contactDisplayName",
        c.phone as "contactPhone",
        c.last_inbound_at as "contactLastInboundAt",
        o.customer_name as "customerName",
        o.customer_phone as "customerPhone",
        o.customer_address as "customerAddress",
        o.subtotal,
        o.discount,
        o.vat_amount as "vatAmount",
        o.shipping_fee_charged as "shippingFeeCharged",
        o.total,
        o.payment_currency as "paymentCurrency",
        o.payment_method as "paymentMethod",
        o.payment_account_id as "paymentAccountId",
        spa.display_name as "paymentAccountDisplayName",
        spa.bank_name as "paymentAccountBankName",
        spa.account_number as "paymentAccountNumber",
        spa.qr_image_url as "paymentAccountQrImageUrl",
        o.payment_slip_url as "paymentSlipUrl",
        o.payment_proof_submitted_at as "paymentProofSubmittedAt",
        o.shipping_provider as "shippingProvider",
        o.shipping_label_status as "shippingLabelStatus",
        o.shipping_label_url as "shippingLabelUrl",
        o.shipping_label_file_key as "shippingLabelFileKey",
        o.shipping_request_id as "shippingRequestId",
        o.shipping_carrier as "shippingCarrier",
        o.tracking_no as "trackingNo",
        o.shipping_cost as "shippingCost",
        o.cod_amount as "codAmount",
        o.cod_fee as "codFee",
        o.cod_return_note as "codReturnNote",
        o.cod_settled_at as "codSettledAt",
        o.cod_returned_at as "codReturnedAt",
        o.paid_at as "paidAt",
        o.shipped_at as "shippedAt",
        o.created_by as "createdBy",
        u.name as "createdByName",
        o.created_at as "createdAt",
        s.currency as "storeCurrency",
        s.vat_mode as "storeVatMode",
        s.vat_enabled as "storeVatEnabled"
      from orders o
      inner join stores s on o.store_id = s.id
      left join contacts c on o.contact_id = c.id
      left join store_payment_accounts spa on o.payment_account_id = spa.id
      left join users u on o.created_by = u.id
      where o.store_id = ?
        and o.id = ?
      limit 1
    `,
    [storeId, orderId],
  );

  const main = mainRows[0] ?? null;
  if (!main) {
    return null;
  }

  const [items, cancelRows] = await Promise.all([
    fetchSourceRows(
      `
        select
          oi.id,
          p.id as "productId",
          p.sku as "productSku",
          p.name as "productName",
          u.id as "unitId",
          u.code as "unitCode",
          u.name_th as "unitNameTh",
          oi.qty,
          oi.qty_base as "qtyBase",
          oi.price_base_at_sale as "priceBaseAtSale",
          oi.cost_base_at_sale as "costBaseAtSale",
          oi.line_total as "lineTotal"
        from order_items oi
        inner join products p on oi.product_id = p.id
        inner join units u on oi.unit_id = u.id
        where oi.order_id = ?
        order by p.name asc, oi.id asc
      `,
      [orderId],
    ),
    fetchSourceRows(
      `
        select
          occurred_at as "approvedAt",
          actor_name as "cancelledByName",
          metadata
        from audit_events
        where scope = 'STORE'
          and store_id = ?
          and action = 'order.cancel'
          and entity_type = 'order'
          and entity_id = ?
          and result = 'SUCCESS'
        order by occurred_at desc
        limit 1
      `,
      [storeId, orderId],
    ),
  ]);

  const cancelRow = cancelRows[0] ?? null;
  let cancelApproval = null;
  if (cancelRow) {
    const metadata = normalizeJsonValue(cancelRow.metadata);
    cancelApproval = {
      approvedAt: cancelRow.approvedAt,
      cancelReason: typeof metadata?.cancelReason === "string" ? metadata.cancelReason : null,
      approvedByName: typeof metadata?.approvedByName === "string" ? metadata.approvedByName : null,
      approvedByRole: typeof metadata?.approvedByRole === "string" ? metadata.approvedByRole : null,
      approvedByEmail:
        typeof metadata?.approvedByEmail === "string" ? metadata.approvedByEmail : null,
      cancelledByName: cancelRow.cancelledByName ?? null,
      approvalMode:
        metadata?.approvalMode === "MANAGER_PASSWORD" || metadata?.approvalMode === "SELF_SLIDE"
          ? metadata.approvalMode
          : null,
    };
  }

  return {
    ...main,
    storeVatEnabled:
      typeof main.storeVatEnabled === "number" ? main.storeVatEnabled !== 0 : Boolean(main.storeVatEnabled),
    cancelApproval,
    items,
  };
};

const fetchTargetOrderDetail = async (storeId, orderId) => {
  const mainRows = await fetchTargetRows(
    `
      select
        o.id,
        o.order_no as "orderNo",
        o.channel,
        o.status,
        o.payment_status as "paymentStatus",
        o.contact_id as "contactId",
        c.display_name as "contactDisplayName",
        c.phone as "contactPhone",
        c.last_inbound_at as "contactLastInboundAt",
        o.customer_name as "customerName",
        o.customer_phone as "customerPhone",
        o.customer_address as "customerAddress",
        o.subtotal,
        o.discount,
        o.vat_amount as "vatAmount",
        o.shipping_fee_charged as "shippingFeeCharged",
        o.total,
        o.payment_currency as "paymentCurrency",
        o.payment_method as "paymentMethod",
        o.payment_account_id as "paymentAccountId",
        spa.display_name as "paymentAccountDisplayName",
        spa.bank_name as "paymentAccountBankName",
        spa.account_number as "paymentAccountNumber",
        spa.qr_image_url as "paymentAccountQrImageUrl",
        o.payment_slip_url as "paymentSlipUrl",
        o.payment_proof_submitted_at as "paymentProofSubmittedAt",
        o.shipping_provider as "shippingProvider",
        o.shipping_label_status as "shippingLabelStatus",
        o.shipping_label_url as "shippingLabelUrl",
        o.shipping_label_file_key as "shippingLabelFileKey",
        o.shipping_request_id as "shippingRequestId",
        o.shipping_carrier as "shippingCarrier",
        o.tracking_no as "trackingNo",
        o.shipping_cost as "shippingCost",
        o.cod_amount as "codAmount",
        o.cod_fee as "codFee",
        o.cod_return_note as "codReturnNote",
        o.cod_settled_at as "codSettledAt",
        o.cod_returned_at as "codReturnedAt",
        o.paid_at as "paidAt",
        o.shipped_at as "shippedAt",
        o.created_by as "createdBy",
        u.name as "createdByName",
        o.created_at as "createdAt",
        s.currency as "storeCurrency",
        s.vat_mode as "storeVatMode",
        s.vat_enabled as "storeVatEnabled"
      from orders o
      inner join stores s on o.store_id = s.id
      left join contacts c on o.contact_id = c.id
      left join store_payment_accounts spa on o.payment_account_id = spa.id
      left join users u on o.created_by = u.id
      where o.store_id = :storeId
        and o.id = :orderId
      limit 1
    `,
    { storeId, orderId },
  );

  const main = mainRows[0] ?? null;
  if (!main) {
    return null;
  }

  const [items, cancelRows] = await Promise.all([
    fetchTargetRows(
      `
        select
          oi.id,
          p.id as "productId",
          p.sku as "productSku",
          p.name as "productName",
          u.id as "unitId",
          u.code as "unitCode",
          u.name_th as "unitNameTh",
          oi.qty,
          oi.qty_base as "qtyBase",
          oi.price_base_at_sale as "priceBaseAtSale",
          oi.cost_base_at_sale as "costBaseAtSale",
          oi.line_total as "lineTotal"
        from order_items oi
        inner join products p on oi.product_id = p.id
        inner join units u on oi.unit_id = u.id
        where oi.order_id = :orderId
        order by p.name asc, oi.id asc
      `,
      { orderId },
    ),
    fetchTargetRows(
      `
        select
          occurred_at as "approvedAt",
          actor_name as "cancelledByName",
          metadata
        from audit_events
        where scope = 'STORE'
          and store_id = :storeId
          and action = 'order.cancel'
          and entity_type = 'order'
          and entity_id = :orderId
          and result = 'SUCCESS'
        order by occurred_at desc
        limit 1
      `,
      { storeId, orderId },
    ),
  ]);

  const cancelRow = cancelRows[0] ?? null;
  let cancelApproval = null;
  if (cancelRow) {
    const metadata = normalizeJsonValue(cancelRow.metadata);
    cancelApproval = {
      approvedAt: cancelRow.approvedAt,
      cancelReason: typeof metadata?.cancelReason === "string" ? metadata.cancelReason : null,
      approvedByName: typeof metadata?.approvedByName === "string" ? metadata.approvedByName : null,
      approvedByRole: typeof metadata?.approvedByRole === "string" ? metadata.approvedByRole : null,
      approvedByEmail:
        typeof metadata?.approvedByEmail === "string" ? metadata.approvedByEmail : null,
      cancelledByName: cancelRow.cancelledByName ?? null,
      approvalMode:
        metadata?.approvalMode === "MANAGER_PASSWORD" || metadata?.approvalMode === "SELF_SLIDE"
          ? metadata.approvalMode
          : null,
    };
  }

  return {
    ...main,
    storeVatEnabled: Boolean(main.storeVatEnabled),
    cancelApproval,
    items,
  };
};

const collectMismatches = (sourceValue, targetValue, limit = 3) => {
  const mismatches = [];
  const max = Math.min(sourceValue.length, targetValue.length, limit);

  for (let index = 0; index < max; index += 1) {
    if (asComparableJson(sourceValue[index]) !== asComparableJson(targetValue[index])) {
      mismatches.push({
        index,
        source: sourceValue[index],
        target: targetValue[index],
      });
    }
  }

  return mismatches;
};

try {
  await Promise.all([target.authenticate(), source.execute("select 1 as ok")]);

  const storeIds = await getStoreIds();
  const mismatches = [];
  const detailOrderIds = new Map();

  for (const storeId of storeIds) {
    const [sourceQrAccounts, targetQrAccounts] = await Promise.all([
      fetchSourceQrAccounts(storeId),
      fetchTargetQrAccounts(storeId),
    ]);

    console.info(
      `[pg:compare] qr-accounts store=${storeId} source=${sourceQrAccounts.length} target=${targetQrAccounts.length}`,
    );

    if (asComparableJson(sourceQrAccounts) !== asComparableJson(targetQrAccounts)) {
      mismatches.push({
        type: "qr-accounts",
        storeId,
        source: sourceQrAccounts,
        target: targetQrAccounts,
      });
    }

    for (const tab of orderListTabs) {
      const sourceRows = await fetchSourceRows(
        buildSourceOrderListQuery(tab.statuses),
        tab.statuses ? [storeId, ...tab.statuses] : [storeId],
      );
      const targetRows = await fetchTargetRows(buildTargetOrderListQuery(tab.statuses), {
        storeId,
        statuses: tab.statuses ?? [],
      });

      const sourceJson = asComparableJson(sourceRows);
      const targetJson = asComparableJson(targetRows);

      console.info(
        `[pg:compare] orders-list store=${storeId} tab=${tab.name} source=${sourceRows.length} target=${targetRows.length}`,
      );

      if (sourceJson !== targetJson) {
        mismatches.push({
          type: "orders-list",
          storeId,
          tab: tab.name,
          sample: collectMismatches(sourceRows, targetRows),
        });
      }

      if (tab.name === "ALL") {
        for (const row of sourceRows) {
          detailOrderIds.set(String(row.id), storeId);
        }
      }
    }
  }

  for (const [orderId, storeId] of detailOrderIds.entries()) {
    const [sourceDetail, targetDetail] = await Promise.all([
      fetchSourceOrderDetail(storeId, orderId),
      fetchTargetOrderDetail(storeId, orderId),
    ]);

    const sourceJson = asComparableJson(sourceDetail);
    const targetJson = asComparableJson(targetDetail);

    if (sourceJson !== targetJson) {
      mismatches.push({
        type: "order-detail",
        storeId,
        orderId,
        source: sourceDetail,
        target: targetDetail,
      });
    }
  }

  if (mismatches.length > 0) {
    console.error(`[pg:compare] mismatch count=${mismatches.length}`);
    console.error(JSON.stringify(mismatches.slice(0, 5), null, 2));
    process.exitCode = 1;
  } else {
    console.info(
      `[pg:compare] parity ok stores=${storeIds.length} orderDetails=${detailOrderIds.size}`,
    );
  }
} catch (error) {
  console.error("[pg:compare] failed");
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
