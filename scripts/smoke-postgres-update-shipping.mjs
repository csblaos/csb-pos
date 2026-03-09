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
    const [rows] = await sequelize.query(
      `
        select id, store_id as "storeId"
        from orders
        where status <> 'CANCELLED'
        order by created_at desc
        limit 1
      `,
      { transaction: tx },
    );

    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order?.id || !order?.storeId) {
      throw new Error("No order found for smoke test");
    }

    await sequelize.query(
      `
        update orders
        set
          shipping_carrier = 'SMOKE-CARRIER',
          tracking_no = 'SMOKE-TRACKING',
          shipping_cost = 1234
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
          'order.update_shipping',
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
    console.info("[pg:smoke:update_shipping] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:update_shipping] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
