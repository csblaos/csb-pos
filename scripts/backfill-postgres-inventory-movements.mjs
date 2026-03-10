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

const fetchSourceRows = async () => {
  const result = await source.execute(`
    select
      id,
      store_id as "storeId",
      product_id as "productId",
      type,
      qty_base as "qtyBase",
      ref_type as "refType",
      ref_id as "refId",
      note,
      created_by as "createdBy",
      created_at as "createdAt"
    from inventory_movements
    order by created_at asc, id asc
  `);

  return result.rows.map((row) => ({ ...row }));
};

const countTargetRows = async () => {
  const [rows] = await target.query(`select count(*)::int as value from inventory_movements`);
  return Array.isArray(rows) ? Number(rows[0]?.value ?? 0) : 0;
};

try {
  await target.authenticate();
  await source.execute("select 1 as health_check");

  const rows = await fetchSourceRows();

  await target.transaction(async (tx) => {
    for (const row of rows) {
      await target.query(
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
            created_by,
            created_at
          )
          values (
            :id,
            :storeId,
            :productId,
            :type,
            :qtyBase,
            :refType,
            :refId,
            :note,
            :createdBy,
            :createdAt
          )
          on conflict (id) do update set
            store_id = excluded.store_id,
            product_id = excluded.product_id,
            type = excluded.type,
            qty_base = excluded.qty_base,
            ref_type = excluded.ref_type,
            ref_id = excluded.ref_id,
            note = excluded.note,
            created_by = excluded.created_by,
            created_at = excluded.created_at
        `,
        {
          transaction: tx,
          replacements: {
            id: row.id,
            storeId: row.storeId,
            productId: row.productId,
            type: row.type,
            qtyBase: Number(row.qtyBase ?? 0),
            refType: row.refType,
            refId: row.refId ?? null,
            note: row.note ?? null,
            createdBy: row.createdBy ?? null,
            createdAt: row.createdAt,
          },
        },
      );
    }
  });

  const targetCount = await countTargetRows();
  console.info(`[pg:backfill] inventory_movements source=${rows.length} target=${targetCount}`);
  console.info("[pg:backfill] inventory_movements done");
} catch (error) {
  console.error("[pg:backfill] inventory_movements failed");
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
