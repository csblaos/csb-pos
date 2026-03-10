import "./load-local-env.mjs";

import { randomUUID } from "node:crypto";

import { Sequelize } from "sequelize";

const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sanitizeDatabaseUrl = (value) => {
  const trimmed = value.trim();

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

const sequelize = new Sequelize(sanitizeDatabaseUrl(databaseUrl), {
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

try {
  await sequelize.authenticate();

  await sequelize.transaction(async (tx) => {
    const [orderRows] = await sequelize.query(
      `
        select
          o.id,
          o.store_id as "storeId",
          o.order_no as "orderNo",
          o.payment_method as "paymentMethod"
        from orders o
        where o.status <> 'CANCELLED'
          and exists (
            select 1
            from order_items oi
            where oi.order_id = o.id
          )
        order by o.created_at desc
        limit 1
      `,
      { transaction: tx },
    );

    const order = Array.isArray(orderRows) ? orderRows[0] : null;
    if (!order?.id || !order?.storeId || !order?.orderNo || !order?.paymentMethod) {
      throw new Error("No order with items found for smoke test");
    }

    const [itemRows] = await sequelize.query(
      `
        select
          product_id as "productId",
          qty_base as "qtyBase"
        from order_items
        where order_id = :orderId
        order by id asc
        limit 1
      `,
      {
        transaction: tx,
        replacements: {
          orderId: order.id,
        },
      },
    );

    const item = Array.isArray(itemRows) ? itemRows[0] : null;
    if (!item?.productId || typeof item.qtyBase !== "number") {
      throw new Error("No order item found for smoke test");
    }

    await sequelize.query(
      `
        insert into inventory_movements (
          id,
          store_id,
          product_id,
          type,
          qty_base,
          ref_type,
          ref_id,
          note,
          created_by
        )
        values (
          :id,
          :storeId,
          :productId,
          'RESERVE',
          :qtyBase,
          'ORDER',
          :orderId,
          :note,
          null
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: order.storeId,
          productId: item.productId,
          qtyBase: item.qtyBase,
          orderId: order.id,
          note: `smoke reserve ${order.orderNo}`,
        },
      },
    );

    await sequelize.query(
      `
        update orders
        set
          status = 'PENDING_PAYMENT',
          payment_status = :paymentStatus
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          orderId: order.id,
          storeId: order.storeId,
          paymentStatus:
            order.paymentMethod === "COD" ? "COD_PENDING_SETTLEMENT" : "UNPAID",
        },
      },
    );

    await sequelize.query(
      `
        insert into audit_events (
          id,
          scope,
          store_id,
          action,
          entity_type,
          entity_id,
          result,
          metadata,
          occurred_at
        )
        values (
          :id,
          'STORE',
          :storeId,
          'order.submit_for_payment',
          'order',
          :orderId,
          'SUCCESS',
          cast(:metadata as jsonb),
          current_timestamp
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: order.storeId,
          orderId: order.id,
          metadata: JSON.stringify({ smoke: true }),
        },
      },
    );

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:submit_for_payment] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:submit_for_payment] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
