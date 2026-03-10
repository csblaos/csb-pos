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

const pickScenario = (order) => {
  if (
    order.paymentMethod === "COD" &&
    order.status === "SHIPPED" &&
    order.paymentStatus === "COD_PENDING_SETTLEMENT"
  ) {
    return "COD_SETTLEMENT";
  }

  if (order.paymentMethod !== "COD" && order.status === "READY_FOR_PICKUP" && order.paymentStatus !== "PAID") {
    return "PICKUP_PAYMENT_ONLY";
  }

  if (
    order.paymentMethod !== "COD" &&
    order.status === "PICKED_UP_PENDING_PAYMENT" &&
    order.paymentStatus !== "PAID"
  ) {
    return "POST_PICKUP_SETTLEMENT";
  }

  if (order.paymentMethod !== "COD" && order.status === "READY_FOR_PICKUP" && order.paymentStatus === "PAID") {
    return "PICKUP_COMPLETE_PREPAID";
  }

  if (order.paymentMethod !== "COD" && order.status === "PENDING_PAYMENT") {
    return "STANDARD_PENDING_PAYMENT";
  }

  return null;
};

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
          o.payment_status as "paymentStatus",
          o.payment_method as "paymentMethod",
          o.payment_account_id as "paymentAccountId",
          o.payment_slip_url as "paymentSlipUrl",
          o.payment_proof_submitted_at as "paymentProofSubmittedAt",
          o.paid_at as "paidAt",
          o.cod_amount as "codAmount",
          o.total
        from orders o
        where (
          (o.payment_method = 'COD' and o.status = 'SHIPPED' and o.payment_status = 'COD_PENDING_SETTLEMENT')
          or
          (o.payment_method <> 'COD' and o.status in ('PENDING_PAYMENT', 'READY_FOR_PICKUP', 'PICKED_UP_PENDING_PAYMENT'))
        )
        order by o.created_at desc
        limit 20
      `,
      { transaction: tx },
    );

    const order = Array.isArray(orderRows)
      ? orderRows.find((candidate) => pickScenario(candidate))
      : null;
    if (!order?.id || !order?.storeId || !order?.orderNo) {
      throw new Error("No eligible order found for smoke test");
    }

    const scenario = pickScenario(order);
    if (!scenario) {
      throw new Error("Could not determine confirm_paid smoke scenario");
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

    if (
      (scenario === "STANDARD_PENDING_PAYMENT" || scenario === "PICKUP_COMPLETE_PREPAID") &&
      items.length === 0
    ) {
      throw new Error("No order items found for stock-out confirm_paid smoke scenario");
    }

    if (scenario === "COD_SETTLEMENT") {
      await sequelize.query(
        `
          update orders
          set
            payment_status = 'COD_SETTLED',
            cod_settled_at = cast(current_timestamp as text),
            paid_at = coalesce(paid_at, cast(current_timestamp as text)),
            cod_amount = :codAmount
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            orderId: order.id,
            storeId: order.storeId,
            codAmount: Number(order.codAmount ?? 0) > 0 ? order.codAmount : order.total,
          },
        },
      );
    } else if (scenario === "PICKUP_PAYMENT_ONLY" || scenario === "POST_PICKUP_SETTLEMENT") {
      await sequelize.query(
        `
          update orders
          set
            ${scenario === "POST_PICKUP_SETTLEMENT" ? "status = 'PAID'," : ""}
            payment_status = 'PAID',
            payment_method = :paymentMethod,
            payment_account_id = :paymentAccountId,
            payment_slip_url = :paymentSlipUrl,
            payment_proof_submitted_at = :paymentProofSubmittedAt,
            paid_at = coalesce(paid_at, cast(current_timestamp as text))
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            orderId: order.id,
            storeId: order.storeId,
            paymentMethod: order.paymentMethod,
            paymentAccountId: order.paymentAccountId,
            paymentSlipUrl: order.paymentSlipUrl,
            paymentProofSubmittedAt: order.paymentProofSubmittedAt,
          },
        },
      );
    } else {
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
              note:
                scenario === "PICKUP_COMPLETE_PREPAID"
                  ? `smoke release pickup ${order.orderNo}`
                  : `smoke release paid ${order.orderNo}`,
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
              note:
                scenario === "PICKUP_COMPLETE_PREPAID"
                  ? `smoke out pickup ${order.orderNo}`
                  : `smoke out paid ${order.orderNo}`,
            },
          },
        );
      }

      await sequelize.query(
        `
          update orders
          set
            status = 'PAID',
            payment_status = 'PAID',
            payment_method = :paymentMethod,
            payment_account_id = :paymentAccountId,
            paid_at = coalesce(paid_at, cast(current_timestamp as text))
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            orderId: order.id,
            storeId: order.storeId,
            paymentMethod: order.paymentMethod,
            paymentAccountId: order.paymentAccountId,
          },
        },
      );
    }

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
          'order.confirm_paid',
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
          metadata: JSON.stringify({ smoke: true, scenario }),
        },
      },
    );

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:confirm_paid] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:confirm_paid] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
