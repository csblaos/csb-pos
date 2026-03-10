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
    const [sourceRows] = await sequelize.query(
      `
        select
          p.id as "productId",
          p.store_id as "storeId",
          p.base_unit_id as "unitId",
          p.price_base as "priceBase",
          p.cost_base as "costBase",
          s.currency as "storeCurrency",
          u.id as "userId"
        from products p
        inner join stores s
          on s.id = p.store_id
        cross join lateral (
          select id
          from users
          order by created_at asc
          limit 1
        ) u
        where p.active = true
        order by p.created_at desc
        limit 1
      `,
      { transaction: tx },
    );

    const source = Array.isArray(sourceRows) ? sourceRows[0] : null;
    if (
      !source?.productId ||
      !source?.storeId ||
      !source?.unitId ||
      !source?.userId ||
      !source?.storeCurrency
    ) {
      throw new Error("No eligible source row found for create_order smoke test");
    }

    const priceBase = Number(source.priceBase ?? 0);
    const costBase = Number(source.costBase ?? 0);

    const reserveOrderId = randomUUID();
    const outOrderId = randomUUID();
    const reserveOrderNo = `SMOKE-RESERVE-${Date.now()}`;
    const outOrderNo = `SMOKE-OUT-${Date.now()}`;

    await sequelize.query(
      `
        insert into orders (
          id,
          store_id,
          order_no,
          channel,
          status,
          contact_id,
          customer_name,
          customer_phone,
          customer_address,
          subtotal,
          discount,
          vat_amount,
          shipping_fee_charged,
          total,
          payment_currency,
          payment_method,
          payment_status,
          payment_account_id,
          shipping_provider,
          shipping_carrier,
          shipping_cost,
          paid_at,
          created_by
        )
        values
          (
            :reserveOrderId,
            :storeId,
            :reserveOrderNo,
            'WALK_IN',
            'PENDING_PAYMENT',
            null,
            'Smoke Reserve',
            null,
            null,
            :priceBase,
            0,
            0,
            0,
            :priceBase,
            :storeCurrency,
            'ON_CREDIT',
            'UNPAID',
            null,
            null,
            null,
            0,
            null,
            :userId
          ),
          (
            :outOrderId,
            :storeId,
            :outOrderNo,
            'WALK_IN',
            'PAID',
            null,
            'Smoke Out',
            null,
            null,
            :priceBase,
            0,
            0,
            0,
            :priceBase,
            :storeCurrency,
            'CASH',
            'PAID',
            null,
            null,
            null,
            0,
            cast(current_timestamp as text),
            :userId
          )
      `,
      {
        transaction: tx,
        replacements: {
          reserveOrderId,
          reserveOrderNo,
          outOrderId,
          outOrderNo,
          storeId: source.storeId,
          priceBase,
          storeCurrency: source.storeCurrency,
          userId: source.userId,
        },
      },
    );

    await sequelize.query(
      `
        insert into order_items (
          id,
          order_id,
          product_id,
          unit_id,
          qty,
          qty_base,
          price_base_at_sale,
          cost_base_at_sale,
          line_total
        )
        values
          (
            :reserveItemId,
            :reserveOrderId,
            :productId,
            :unitId,
            1,
            1,
            :priceBase,
            :costBase,
            :priceBase
          ),
          (
            :outItemId,
            :outOrderId,
            :productId,
            :unitId,
            1,
            1,
            :priceBase,
            :costBase,
            :priceBase
          )
      `,
      {
        transaction: tx,
        replacements: {
          reserveItemId: randomUUID(),
          outItemId: randomUUID(),
          reserveOrderId,
          outOrderId,
          productId: source.productId,
          unitId: source.unitId,
          priceBase,
          costBase,
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
        values
          (
            :reserveMovementId,
            :storeId,
            :productId,
            'RESERVE',
            1,
            'ORDER',
            :reserveOrderId,
            :reserveNote,
            :userId
          ),
          (
            :outMovementId,
            :storeId,
            :productId,
            'OUT',
            1,
            'ORDER',
            :outOrderId,
            :outNote,
            :userId
          )
      `,
      {
        transaction: tx,
        replacements: {
          reserveMovementId: randomUUID(),
          outMovementId: randomUUID(),
          storeId: source.storeId,
          productId: source.productId,
          reserveOrderId,
          outOrderId,
          reserveNote: `smoke reserve order ${reserveOrderNo}`,
          outNote: `smoke out order ${outOrderNo}`,
          userId: source.userId,
        },
      },
    );

    await sequelize.query(
      `
        insert into audit_events (
          id,
          scope,
          store_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          result,
          metadata,
          occurred_at
        )
        values
          (
            :reserveAuditId,
            'STORE',
            :storeId,
            :userId,
            'order.create',
            'order',
            :reserveOrderId,
            'SUCCESS',
            cast(:reserveMetadata as jsonb),
            cast(current_timestamp as text)
          ),
          (
            :outAuditId,
            'STORE',
            :storeId,
            :userId,
            'order.create',
            'order',
            :outOrderId,
            'SUCCESS',
            cast(:outMetadata as jsonb),
            cast(current_timestamp as text)
          )
      `,
      {
        transaction: tx,
        replacements: {
          reserveAuditId: randomUUID(),
          outAuditId: randomUUID(),
          storeId: source.storeId,
          userId: source.userId,
          reserveOrderId,
          outOrderId,
          reserveMetadata: JSON.stringify({
            smoke: true,
            paymentMethod: "ON_CREDIT",
            stockReservedOnCreate: true,
            stockOutOnCreate: false,
          }),
          outMetadata: JSON.stringify({
            smoke: true,
            paymentMethod: "CASH",
            stockReservedOnCreate: false,
            stockOutOnCreate: true,
          }),
        },
      },
    );

    const [checkRows] = await sequelize.query(
      `
        select
          sum(case when type = 'RESERVE' then 1 else 0 end)::int as "reserveCount",
          sum(case when type = 'OUT' then 1 else 0 end)::int as "outCount"
        from inventory_movements
        where ref_type = 'ORDER'
          and ref_id in (:reserveOrderId, :outOrderId)
      `,
      {
        transaction: tx,
        replacements: {
          reserveOrderId,
          outOrderId,
        },
      },
    );

    const checks = Array.isArray(checkRows) ? checkRows[0] : null;
    if (Number(checks?.reserveCount ?? 0) !== 1 || Number(checks?.outCount ?? 0) !== 1) {
      throw new Error("Create order smoke validation failed");
    }

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:create_order] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:create_order] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
