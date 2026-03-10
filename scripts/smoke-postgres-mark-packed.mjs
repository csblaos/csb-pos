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
          o.status,
          o.payment_method as "paymentMethod",
          o.payment_status as "paymentStatus"
        from orders o
        where (
          o.status = 'PAID'
          or (o.payment_method = 'COD' and o.status = 'PENDING_PAYMENT' and o.payment_status = 'COD_PENDING_SETTLEMENT')
        )
          and exists (
            select 1
            from order_items oi
            where oi.order_id = o.id
          )
        order by o.created_at desc
        limit 20
      `,
      { transaction: tx },
    );

    const order = Array.isArray(orderRows) ? orderRows[0] : null;
    if (!order?.id || !order?.storeId || !order?.orderNo) {
      throw new Error("No eligible order found for mark_packed smoke test");
    }

    const canPackCodFromPending =
      order.paymentMethod === "COD" &&
      order.status === "PENDING_PAYMENT" &&
      order.paymentStatus === "COD_PENDING_SETTLEMENT";

    const [itemRows] = await sequelize.query(
      `
        select
          product_id as "productId",
          qty_base as "qtyBase"
        from order_items
        where order_id = :orderId
        order by id asc
      `,
      {
        transaction: tx,
        replacements: {
          orderId: order.id,
        },
      },
    );

    const items = Array.isArray(itemRows) ? itemRows : [];

    if (canPackCodFromPending) {
      for (const item of items) {
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
              :type,
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
              type: "RELEASE",
              qtyBase: item.qtyBase,
              orderId: order.id,
              note: `smoke release packed cod ${order.orderNo}`,
            },
          },
        );

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
              :type,
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
              type: "OUT",
              qtyBase: item.qtyBase,
              orderId: order.id,
              note: `smoke out packed cod ${order.orderNo}`,
            },
          },
        );
      }
    }

    await sequelize.query(
      `
        update orders
        set
          status = 'PACKED'
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          orderId: order.id,
          storeId: order.storeId,
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
          'order.mark_packed',
          'order',
          :orderId,
          'SUCCESS',
          cast(:metadata as jsonb),
          cast(current_timestamp as text)
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: order.storeId,
          orderId: order.id,
          metadata: JSON.stringify({
            smoke: true,
            fromStatus: order.status,
            toStatus: "PACKED",
            stockOutItems: canPackCodFromPending ? items.length : 0,
          }),
        },
      },
    );

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:mark_packed] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:mark_packed] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
