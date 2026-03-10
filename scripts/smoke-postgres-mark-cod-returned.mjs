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
          o.payment_status as "paymentStatus",
          o.shipping_cost as "shippingCost",
          o.cod_fee as "codFee"
        from orders o
        where o.payment_method = 'COD'
          and o.status <> 'CANCELLED'
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
    if (!order?.id || !order?.storeId || !order?.orderNo) {
      throw new Error("No COD order with items found for mark_cod_returned smoke test");
    }

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
    if (items.length === 0) {
      throw new Error("No order items found for mark_cod_returned smoke test");
    }

    await sequelize.query(
      `
        update orders
        set
          status = 'SHIPPED',
          payment_status = 'COD_PENDING_SETTLEMENT'
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
            'RETURN',
            :qtyBase,
            'RETURN',
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
            note: `smoke cod return ${order.orderNo}`,
          },
        },
      );
    }

    const normalizedCodFee = 1000;
    const nextCodFee = Math.max(0, Number(order.codFee ?? 0)) + normalizedCodFee;
    const nextShippingCost = Math.max(0, Number(order.shippingCost ?? 0)) + normalizedCodFee;
    const normalizedCodReturnNote = "smoke cod return";

    await sequelize.query(
      `
        update orders
        set
          status = 'COD_RETURNED',
          payment_status = 'FAILED',
          cod_amount = 0,
          cod_settled_at = null,
          cod_fee = :codFee,
          cod_return_note = :codReturnNote,
          shipping_cost = :shippingCost,
          cod_returned_at = cast(current_timestamp as text)
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          orderId: order.id,
          storeId: order.storeId,
          codFee: nextCodFee,
          codReturnNote: normalizedCodReturnNote,
          shippingCost: nextShippingCost,
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
          'order.mark_cod_returned',
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
            fromStatus: "SHIPPED",
            toStatus: "COD_RETURNED",
            fromPaymentStatus: order.paymentStatus,
            toPaymentStatus: "FAILED",
            stockReturnItems: items.length,
            codFeeAdded: normalizedCodFee,
            codFeeTotal: nextCodFee,
            codReturnNote: normalizedCodReturnNote,
            shippingCostTotal: nextShippingCost,
          }),
        },
      },
    );

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:mark_cod_returned] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:mark_cod_returned] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
