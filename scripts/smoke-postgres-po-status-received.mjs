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
          p.cost_base as "costBase",
          p.price_base as "priceBase",
          u.id as "userId"
        from products p
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
    if (!source?.productId || !source?.storeId || !source?.userId) {
      throw new Error("No eligible source row found for po_status_received smoke test");
    }

    const poId = randomUUID();
    const poItemId = randomUUID();
    const poNumber = `SMOKE-RECV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const nextCostBase = Number(source.costBase ?? 0) + 20;

    await sequelize.query(
      `
        insert into purchase_orders (
          id,
          store_id,
          po_number,
          purchase_currency,
          exchange_rate,
          exchange_rate_initial,
          payment_status,
          shipping_cost,
          other_cost,
          status,
          ordered_at,
          shipped_at,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          :poId,
          :storeId,
          :poNumber,
          'LAK',
          1,
          1,
          'UNPAID',
          0,
          0,
          'SHIPPED',
          cast(current_timestamp as text),
          cast(current_timestamp as text),
          :userId,
          :userId,
          cast(current_timestamp as text),
          cast(current_timestamp as text)
        )
      `,
      {
        transaction: tx,
        replacements: {
          poId,
          storeId: source.storeId,
          poNumber,
          userId: source.userId,
        },
      },
    );

    await sequelize.query(
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
          :poItemId,
          :poId,
          :productId,
          3,
          0,
          :unitCostPurchase,
          :unitCostBase,
          0
        )
      `,
      {
        transaction: tx,
        replacements: {
          poItemId,
          poId,
          productId: source.productId,
          unitCostPurchase: Number(source.priceBase ?? 0),
          unitCostBase: Number(source.priceBase ?? 0),
        },
      },
    );

    await sequelize.query(
      `
        update purchase_order_items
        set
          qty_received = 3,
          landed_cost_per_unit = :landedCostPerUnit
        where id = :poItemId
      `,
      {
        transaction: tx,
        replacements: {
          poItemId,
          landedCostPerUnit: nextCostBase,
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
          :movementId,
          :storeId,
          :productId,
          'IN',
          3,
          'PURCHASE',
          :poId,
          'smoke purchase received status',
          :userId
        )
      `,
      {
        transaction: tx,
        replacements: {
          movementId: randomUUID(),
          storeId: source.storeId,
          productId: source.productId,
          poId,
          userId: source.userId,
        },
      },
    );

    await sequelize.query(
      `
        update products
        set cost_base = :nextCostBase
        where id = :productId
      `,
      {
        transaction: tx,
        replacements: {
          productId: source.productId,
          nextCostBase,
        },
      },
    );

    await sequelize.query(
      `
        update purchase_orders
        set
          status = 'RECEIVED',
          received_at = cast(current_timestamp as text)
        where id = :poId
      `,
      {
        transaction: tx,
        replacements: { poId },
      },
    );

    const [checkRows] = await sequelize.query(
      `
        select
          po.status as "status",
          count(*) filter (where im.ref_type = 'PURCHASE' and im.ref_id = :poId)::int as "movementCount",
          max(poi.qty_received)::int as "qtyReceived"
        from purchase_orders po
        left join purchase_order_items poi
          on poi.purchase_order_id = po.id
        left join inventory_movements im
          on im.ref_id = po.id
        where po.id = :poId
        group by po.status
      `,
      {
        transaction: tx,
        replacements: { poId },
      },
    );

    const checks = Array.isArray(checkRows) ? checkRows[0] : null;
    if (
      checks?.status !== "RECEIVED" ||
      Number(checks?.movementCount ?? 0) < 1 ||
      Number(checks?.qtyReceived ?? 0) !== 3
    ) {
      throw new Error("PO receive status smoke validation failed");
    }

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:po_status_received] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:po_status_received] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
