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

const asComparableJson = (value) => JSON.stringify(value);

const normalizeBalanceRows = (rows) =>
  rows.map((row) => {
    const onHand = Number(row.onHand ?? 0);
    const reserved = Number(row.reserved ?? 0);
    return {
      productId: String(row.productId),
      onHand,
      reserved,
      available: onHand - reserved,
    };
  });

const fetchStoreIds = async () => {
  const result = await source.execute(`select id from stores order by id asc`);
  return result.rows.map((row) => String(row.id));
};

const fetchSourceInventoryBalances = async (storeId) => {
  const result = await source.execute({
    sql: `
      select
        product_id as "productId",
        coalesce(sum(case
          when type = 'IN' then qty_base
          when type = 'RETURN' then qty_base
          when type = 'OUT' then -qty_base
          when type = 'ADJUST' then qty_base
          else 0
        end), 0) as "onHand",
        coalesce(sum(case
          when type = 'RESERVE' then qty_base
          when type = 'RELEASE' then -qty_base
          else 0
        end), 0) as "reserved"
      from inventory_movements
      where store_id = ?
      group by product_id
      order by product_id asc
    `,
    args: [storeId],
  });

  return normalizeBalanceRows(result.rows.map((row) => ({ ...row })));
};

const fetchTargetInventoryBalances = async (storeId) => {
  const [rows] = await target.query(
    `
      select
        product_id as "productId",
        coalesce(sum(case
          when type = 'IN' then qty_base
          when type = 'RETURN' then qty_base
          when type = 'OUT' then -qty_base
          when type = 'ADJUST' then qty_base
          else 0
        end), 0) as "onHand",
        coalesce(sum(case
          when type = 'RESERVE' then qty_base
          when type = 'RELEASE' then -qty_base
          else 0
        end), 0) as "reserved"
      from inventory_movements
      where store_id = :storeId
      group by product_id
      order by product_id asc
    `,
    {
      replacements: { storeId },
    },
  );

  return normalizeBalanceRows(Array.isArray(rows) ? rows : []);
};

const normalizeOrderStockState = (row) => {
  const reserveCount = Number(row?.reserveCount ?? 0);
  const releaseCount = Number(row?.releaseCount ?? 0);
  const outCount = Number(row?.outCount ?? 0);

  return {
    hasStockOutFromOrder: outCount > 0,
    hasActiveReserve: reserveCount > releaseCount,
  };
};

const fetchOrderIds = async () => {
  const result = await source.execute(`
    select id
    from orders
    order by created_at asc, id asc
  `);

  return result.rows.map((row) => String(row.id));
};

const fetchSourceOrderStockState = async (storeId, orderId) => {
  const result = await source.execute({
    sql: `
      select
        coalesce(sum(case when type = 'RESERVE' then 1 else 0 end), 0) as "reserveCount",
        coalesce(sum(case when type = 'RELEASE' then 1 else 0 end), 0) as "releaseCount",
        coalesce(sum(case when type = 'OUT' then 1 else 0 end), 0) as "outCount"
      from inventory_movements
      where store_id = ?
        and ref_type = 'ORDER'
        and ref_id = ?
    `,
    args: [storeId, orderId],
  });

  return normalizeOrderStockState(result.rows[0] ?? null);
};

const fetchTargetOrderStockState = async (storeId, orderId) => {
  const [rows] = await target.query(
    `
      select
        coalesce(sum(case when type = 'RESERVE' then 1 else 0 end), 0) as "reserveCount",
        coalesce(sum(case when type = 'RELEASE' then 1 else 0 end), 0) as "releaseCount",
        coalesce(sum(case when type = 'OUT' then 1 else 0 end), 0) as "outCount"
      from inventory_movements
      where store_id = :storeId
        and ref_type = 'ORDER'
        and ref_id = :orderId
    `,
    {
      replacements: {
        storeId,
        orderId,
      },
    },
  );

  return normalizeOrderStockState(Array.isArray(rows) ? rows[0] : null);
};

try {
  await Promise.all([target.authenticate(), source.execute("select 1 as ok")]);

  const storeIds = await fetchStoreIds();
  const orderIds = await fetchOrderIds();
  const mismatches = [];

  for (const storeId of storeIds) {
    const [sourceBalances, targetBalances] = await Promise.all([
      fetchSourceInventoryBalances(storeId),
      fetchTargetInventoryBalances(storeId),
    ]);

    console.info(
      `[pg:compare:inventory] balances store=${storeId} source=${sourceBalances.length} target=${targetBalances.length}`,
    );

    if (asComparableJson(sourceBalances) !== asComparableJson(targetBalances)) {
      mismatches.push({
        type: "inventory-balances",
        storeId,
        source: sourceBalances.slice(0, 10),
        target: targetBalances.slice(0, 10),
      });
    }
  }

  for (const orderId of orderIds) {
    const orderStoreResult = await source.execute({
      sql: `select store_id as "storeId" from orders where id = ? limit 1`,
      args: [orderId],
    });
    const storeId = orderStoreResult.rows[0]?.storeId ? String(orderStoreResult.rows[0].storeId) : null;
    if (!storeId) {
      continue;
    }

    const [sourceState, targetState] = await Promise.all([
      fetchSourceOrderStockState(storeId, orderId),
      fetchTargetOrderStockState(storeId, orderId),
    ]);

    if (asComparableJson(sourceState) !== asComparableJson(targetState)) {
      mismatches.push({
        type: "order-stock-state",
        storeId,
        orderId,
        source: sourceState,
        target: targetState,
      });
    }
  }

  if (mismatches.length > 0) {
    console.error(`[pg:compare:inventory] mismatch count=${mismatches.length}`);
    console.error(JSON.stringify(mismatches.slice(0, 5), null, 2));
    process.exitCode = 1;
  } else {
    console.info(
      `[pg:compare:inventory] parity ok stores=${storeIds.length} orders=${orderIds.length}`,
    );
  }
} catch (error) {
  console.error("[pg:compare:inventory] failed");
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
