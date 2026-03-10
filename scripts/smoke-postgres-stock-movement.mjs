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
      throw new Error("No eligible source row found for stock_movement smoke test");
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
        values
          (
            :inId,
            :storeId,
            :productId,
            'IN',
            2,
            'MANUAL',
            null,
            'smoke in',
            :userId
          ),
          (
            :adjustId,
            :storeId,
            :productId,
            'ADJUST',
            -1,
            'MANUAL',
            null,
            'smoke adjust decrease',
            :userId
          ),
          (
            :returnId,
            :storeId,
            :productId,
            'RETURN',
            1,
            'RETURN',
            null,
            'smoke return',
            :userId
          )
      `,
      {
        transaction: tx,
        replacements: {
          inId: randomUUID(),
          adjustId: randomUUID(),
          returnId: randomUUID(),
          storeId: source.storeId,
          productId: source.productId,
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
            :auditInId,
            'STORE',
            :storeId,
            :userId,
            'stock.movement.create',
            'inventory_movement',
            :movementInId,
            'SUCCESS',
            cast(:metadataIn as jsonb),
            cast(current_timestamp as text)
          ),
          (
            :auditAdjustId,
            'STORE',
            :storeId,
            :userId,
            'stock.movement.create',
            'inventory_movement',
            :movementAdjustId,
            'SUCCESS',
            cast(:metadataAdjust as jsonb),
            cast(current_timestamp as text)
          ),
          (
            :auditReturnId,
            'STORE',
            :storeId,
            :userId,
            'stock.movement.create',
            'inventory_movement',
            :movementReturnId,
            'SUCCESS',
            cast(:metadataReturn as jsonb),
            cast(current_timestamp as text)
          )
      `,
      {
        transaction: tx,
        replacements: {
          auditInId: randomUUID(),
          auditAdjustId: randomUUID(),
          auditReturnId: randomUUID(),
          storeId: source.storeId,
          userId: source.userId,
          movementInId: "smoke-in",
          movementAdjustId: "smoke-adjust",
          movementReturnId: "smoke-return",
          metadataIn: JSON.stringify({ smoke: true, movementType: "IN" }),
          metadataAdjust: JSON.stringify({
            smoke: true,
            movementType: "ADJUST",
            adjustMode: "DECREASE",
          }),
          metadataReturn: JSON.stringify({ smoke: true, movementType: "RETURN" }),
        },
      },
    );

    const [balanceRows] = await sequelize.query(
      `
        select
          coalesce(sum(case
            when type = 'IN' then qty_base
            when type = 'RETURN' then qty_base
            when type = 'OUT' then -qty_base
            when type = 'ADJUST' then qty_base
            else 0
          end), 0)::int as "onHand",
          coalesce(sum(case
            when type = 'RESERVE' then qty_base
            when type = 'RELEASE' then -qty_base
            else 0
          end), 0)::int as "reserved"
        from inventory_movements
        where store_id = :storeId
          and product_id = :productId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: source.storeId,
          productId: source.productId,
        },
      },
    );

    const balance = Array.isArray(balanceRows) ? balanceRows[0] : null;
    const onHand = Number(balance?.onHand ?? 0);
    const reserved = Number(balance?.reserved ?? 0);
    const available = onHand - reserved;

    if (available < 2) {
      throw new Error("Stock movement smoke validation failed");
    }

    throw new Error("ROLLBACK_SMOKE");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_SMOKE") {
    console.info("[pg:smoke:stock_movement] ok (transaction rolled back)");
    process.exit(0);
  }

  console.error("[pg:smoke:stock_movement] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await sequelize.close();
  } catch {}
}
