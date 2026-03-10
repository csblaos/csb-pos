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

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const countTargetRows = async (tableName) => {
  const [rows] = await target.query(`select count(*)::int as value from ${tableName}`);
  return Array.isArray(rows) ? Number(rows[0]?.value ?? 0) : 0;
};

const upsertRows = async ({ tableName, columns, conflictColumns, rows, tx }) => {
  if (rows.length === 0) {
    return;
  }

  const insertColumns = columns.map((column) => column.columnName).join(", ");
  const insertValues = columns.map((column) => `:${column.paramName}`).join(", ");
  const conflictTarget = `(${conflictColumns.join(", ")})`;
  const updateColumns = columns
    .filter((column) => !conflictColumns.includes(column.columnName))
    .map((column) => `${column.columnName} = excluded.${column.columnName}`)
    .join(",\n            ");

  const sql =
    updateColumns.length > 0
      ? `
          insert into ${tableName} (${insertColumns})
          values (${insertValues})
          on conflict ${conflictTarget} do update set
                  ${updateColumns}
        `
      : `
          insert into ${tableName} (${insertColumns})
          values (${insertValues})
          on conflict ${conflictTarget} do nothing
        `;

  for (const row of rows) {
    await target.query(sql, {
      transaction: tx,
      replacements: row,
    });
  }
};

const backfillFbConnections = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      status,
      page_name as "pageName",
      page_id as "pageId",
      connected_at as "connectedAt"
    from fb_connections
    order by id asc
  `);

  await upsertRows({
    tableName: "fb_connections",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      status: row.status ?? "DISCONNECTED",
      pageName: row.pageName ?? null,
      pageId: row.pageId ?? null,
      connectedAt: row.connectedAt ?? null,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "status", paramName: "status" },
      { columnName: "page_name", paramName: "pageName" },
      { columnName: "page_id", paramName: "pageId" },
      { columnName: "connected_at", paramName: "connectedAt" },
    ],
    tx,
  });
};

const backfillWaConnections = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      status,
      phone_number as "phoneNumber",
      connected_at as "connectedAt"
    from wa_connections
    order by id asc
  `);

  await upsertRows({
    tableName: "wa_connections",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      status: row.status ?? "DISCONNECTED",
      phoneNumber: row.phoneNumber ?? null,
      connectedAt: row.connectedAt ?? null,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "status", paramName: "status" },
      { columnName: "phone_number", paramName: "phoneNumber" },
      { columnName: "connected_at", paramName: "connectedAt" },
    ],
    tx,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    await target.transaction(async (tx) => {
      await backfillFbConnections(tx);
      await backfillWaConnections(tx);
    });

    const [fbConnections, waConnections] = await Promise.all([
      countTargetRows("fb_connections"),
      countTargetRows("wa_connections"),
    ]);

    console.info(
      `[pg:backfill:settings-system-admin-read] done fb_connections=${fbConnections} wa_connections=${waConnections}`,
    );
  } catch (error) {
    console.error("[pg:backfill:settings-system-admin-read] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
