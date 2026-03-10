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

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const countTargetRows = async (tableName) => {
  const [rows] = await target.query(`select count(*)::int as value from ${tableName}`);
  return Array.isArray(rows) ? Number(rows[0]?.value ?? 0) : 0;
};

const backfillPurchaseOrders = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      po_number as "poNumber",
      supplier_name as "supplierName",
      supplier_contact as "supplierContact",
      purchase_currency as "purchaseCurrency",
      exchange_rate as "exchangeRate",
      exchange_rate_initial as "exchangeRateInitial",
      exchange_rate_locked_at as "exchangeRateLockedAt",
      exchange_rate_locked_by as "exchangeRateLockedBy",
      exchange_rate_lock_note as "exchangeRateLockNote",
      payment_status as "paymentStatus",
      paid_at as "paidAt",
      paid_by as "paidBy",
      payment_reference as "paymentReference",
      payment_note as "paymentNote",
      due_date as "dueDate",
      shipping_cost as "shippingCost",
      other_cost as "otherCost",
      other_cost_note as "otherCostNote",
      status,
      ordered_at as "orderedAt",
      expected_at as "expectedAt",
      shipped_at as "shippedAt",
      received_at as "receivedAt",
      cancelled_at as "cancelledAt",
      tracking_info as "trackingInfo",
      note,
      created_by as "createdBy",
      updated_by as "updatedBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from purchase_orders
    order by created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into purchase_orders (
            id,
            store_id,
            po_number,
            supplier_name,
            supplier_contact,
            purchase_currency,
            exchange_rate,
            exchange_rate_initial,
            exchange_rate_locked_at,
            exchange_rate_locked_by,
            exchange_rate_lock_note,
            payment_status,
            paid_at,
            paid_by,
            payment_reference,
            payment_note,
            due_date,
            shipping_cost,
            other_cost,
            other_cost_note,
            status,
            ordered_at,
            expected_at,
            shipped_at,
            received_at,
            cancelled_at,
            tracking_info,
            note,
            created_by,
            updated_by,
            created_at,
            updated_at
          )
          values (
            :id,
            :storeId,
            :poNumber,
            :supplierName,
            :supplierContact,
            :purchaseCurrency,
            :exchangeRate,
            :exchangeRateInitial,
            :exchangeRateLockedAt,
            :exchangeRateLockedBy,
            :exchangeRateLockNote,
            :paymentStatus,
            :paidAt,
            :paidBy,
            :paymentReference,
            :paymentNote,
            :dueDate,
            :shippingCost,
            :otherCost,
            :otherCostNote,
            :status,
            :orderedAt,
            :expectedAt,
            :shippedAt,
            :receivedAt,
            :cancelledAt,
            :trackingInfo,
            :note,
            :createdBy,
            :updatedBy,
            :createdAt,
            :updatedAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            po_number = excluded.po_number,
            supplier_name = excluded.supplier_name,
            supplier_contact = excluded.supplier_contact,
            purchase_currency = excluded.purchase_currency,
            exchange_rate = excluded.exchange_rate,
            exchange_rate_initial = excluded.exchange_rate_initial,
            exchange_rate_locked_at = excluded.exchange_rate_locked_at,
            exchange_rate_locked_by = excluded.exchange_rate_locked_by,
            exchange_rate_lock_note = excluded.exchange_rate_lock_note,
            payment_status = excluded.payment_status,
            paid_at = excluded.paid_at,
            paid_by = excluded.paid_by,
            payment_reference = excluded.payment_reference,
            payment_note = excluded.payment_note,
            due_date = excluded.due_date,
            shipping_cost = excluded.shipping_cost,
            other_cost = excluded.other_cost,
            other_cost_note = excluded.other_cost_note,
            status = excluded.status,
            ordered_at = excluded.ordered_at,
            expected_at = excluded.expected_at,
            shipped_at = excluded.shipped_at,
            received_at = excluded.received_at,
            cancelled_at = excluded.cancelled_at,
            tracking_info = excluded.tracking_info,
            note = excluded.note,
            created_by = excluded.created_by,
            updated_by = excluded.updated_by,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId,
            poNumber: row.poNumber,
            supplierName: row.supplierName ?? null,
            supplierContact: row.supplierContact ?? null,
            purchaseCurrency: row.purchaseCurrency,
            exchangeRate: Number(row.exchangeRate ?? 1),
            exchangeRateInitial: Number(row.exchangeRateInitial ?? 1),
            exchangeRateLockedAt: row.exchangeRateLockedAt ?? null,
            exchangeRateLockedBy: row.exchangeRateLockedBy ?? null,
            exchangeRateLockNote: row.exchangeRateLockNote ?? null,
            paymentStatus: row.paymentStatus,
            paidAt: row.paidAt ?? null,
            paidBy: row.paidBy ?? null,
            paymentReference: row.paymentReference ?? null,
            paymentNote: row.paymentNote ?? null,
            dueDate: row.dueDate ?? null,
            shippingCost: Number(row.shippingCost ?? 0),
            otherCost: Number(row.otherCost ?? 0),
            otherCostNote: row.otherCostNote ?? null,
            status: row.status,
            orderedAt: row.orderedAt ?? null,
            expectedAt: row.expectedAt ?? null,
            shippedAt: row.shippedAt ?? null,
            receivedAt: row.receivedAt ?? null,
            cancelledAt: row.cancelledAt ?? null,
            trackingInfo: row.trackingInfo ?? null,
            note: row.note ?? null,
            createdBy: row.createdBy ?? null,
            updatedBy: row.updatedBy ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillPurchaseOrderItems = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      purchase_order_id as "purchaseOrderId",
      product_id as "productId",
      qty_ordered as "qtyOrdered",
      qty_received as "qtyReceived",
      unit_cost_purchase as "unitCostPurchase",
      unit_cost_base as "unitCostBase",
      landed_cost_per_unit as "landedCostPerUnit"
    from purchase_order_items
    order by purchase_order_id asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into purchase_order_items (
            id,
            purchase_order_id,
            product_id,
            qty_ordered,
            qty_received,
            unit_cost_purchase,
            unit_cost_base,
            landed_cost_per_unit
          )
          values (
            :id,
            :purchaseOrderId,
            :productId,
            :qtyOrdered,
            :qtyReceived,
            :unitCostPurchase,
            :unitCostBase,
            :landedCostPerUnit
          )
          on conflict (id) do update set
            purchase_order_id = excluded.purchase_order_id,
            product_id = excluded.product_id,
            qty_ordered = excluded.qty_ordered,
            qty_received = excluded.qty_received,
            unit_cost_purchase = excluded.unit_cost_purchase,
            unit_cost_base = excluded.unit_cost_base,
            landed_cost_per_unit = excluded.landed_cost_per_unit
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            purchaseOrderId: row.purchaseOrderId,
            productId: row.productId,
            qtyOrdered: Number(row.qtyOrdered ?? 0),
            qtyReceived: Number(row.qtyReceived ?? 0),
            unitCostPurchase: Number(row.unitCostPurchase ?? 0),
            unitCostBase: Number(row.unitCostBase ?? 0),
            landedCostPerUnit: Number(row.landedCostPerUnit ?? 0),
          },
        },
      );
    }
  });

  return rows.length;
};

const backfillPurchaseOrderPayments = async () => {
  const rows = await fetchSourceRows(`
    select
      id,
      purchase_order_id as "purchaseOrderId",
      store_id as "storeId",
      entry_type as "entryType",
      amount_base as "amountBase",
      paid_at as "paidAt",
      reference,
      note,
      reversed_payment_id as "reversedPaymentId",
      created_by as "createdBy",
      created_at as "createdAt"
    from purchase_order_payments
    order by paid_at asc, created_at asc, id asc
  `);

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
        `
          insert into purchase_order_payments (
            id,
            purchase_order_id,
            store_id,
            entry_type,
            amount_base,
            paid_at,
            reference,
            note,
            reversed_payment_id,
            created_by,
            created_at
          )
          values (
            :id,
            :purchaseOrderId,
            :storeId,
            :entryType,
            :amountBase,
            :paidAt,
            :reference,
            :note,
            :reversedPaymentId,
            :createdBy,
            :createdAt
          )
          on conflict (id) do update set
            purchase_order_id = excluded.purchase_order_id,
            store_id = excluded.store_id,
            entry_type = excluded.entry_type,
            amount_base = excluded.amount_base,
            paid_at = excluded.paid_at,
            reference = excluded.reference,
            note = excluded.note,
            reversed_payment_id = excluded.reversed_payment_id,
            created_by = excluded.created_by,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            purchaseOrderId: row.purchaseOrderId,
            storeId: row.storeId,
            entryType: row.entryType,
            amountBase: Number(row.amountBase ?? 0),
            paidAt: row.paidAt,
            reference: row.reference ?? null,
            note: row.note ?? null,
            reversedPaymentId: row.reversedPaymentId ?? null,
            createdBy: row.createdBy ?? null,
            createdAt: row.createdAt,
          },
        },
      );
    }
  });

  return rows.length;
};

try {
  await Promise.all([target.authenticate(), source.execute("select 1 as ok")]);

  const counts = {
    purchase_orders: await backfillPurchaseOrders(),
    purchase_order_items: await backfillPurchaseOrderItems(),
    purchase_order_payments: await backfillPurchaseOrderPayments(),
  };

  const targetCounts = {
    purchase_orders: await countTargetRows("purchase_orders"),
    purchase_order_items: await countTargetRows("purchase_order_items"),
    purchase_order_payments: await countTargetRows("purchase_order_payments"),
  };

  console.info(
    `[pg:backfill] purchase_orders source=${counts.purchase_orders} target=${targetCounts.purchase_orders}`,
  );
  console.info(
    `[pg:backfill] purchase_order_items source=${counts.purchase_order_items} target=${targetCounts.purchase_order_items}`,
  );
  console.info(
    `[pg:backfill] purchase_order_payments source=${counts.purchase_order_payments} target=${targetCounts.purchase_order_payments}`,
  );
  console.info("[pg:backfill] purchase read done");
} catch (error) {
  console.error("[pg:backfill] purchase read failed");
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
