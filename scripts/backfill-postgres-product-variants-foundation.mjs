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

const backfillProductModelAttributes = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      model_id as "modelId",
      code,
      name,
      sort_order as "sortOrder",
      created_at as "createdAt"
    from product_model_attributes
    order by id asc
  `);

  await upsertRows({
    tableName: "product_model_attributes",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      modelId: row.modelId,
      code: row.code,
      name: row.name,
      sortOrder: Number(row.sortOrder ?? 0),
      createdAt: row.createdAt ?? null,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "model_id", paramName: "modelId" },
      { columnName: "code", paramName: "code" },
      { columnName: "name", paramName: "name" },
      { columnName: "sort_order", paramName: "sortOrder" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillProductModelAttributeValues = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      attribute_id as "attributeId",
      code,
      name,
      sort_order as "sortOrder",
      created_at as "createdAt"
    from product_model_attribute_values
    order by id asc
  `);

  await upsertRows({
    tableName: "product_model_attribute_values",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      attributeId: row.attributeId,
      code: row.code,
      name: row.name,
      sortOrder: Number(row.sortOrder ?? 0),
      createdAt: row.createdAt ?? null,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "attribute_id", paramName: "attributeId" },
      { columnName: "code", paramName: "code" },
      { columnName: "name", paramName: "name" },
      { columnName: "sort_order", paramName: "sortOrder" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    await target.transaction(async (tx) => {
      await backfillProductModelAttributes(tx);
      await backfillProductModelAttributeValues(tx);
    });

    const [attributes, values] = await Promise.all([
      countTargetRows("product_model_attributes"),
      countTargetRows("product_model_attribute_values"),
    ]);

    console.info(
      `[pg:backfill:product-variants-foundation] done product_model_attributes=${attributes} product_model_attribute_values=${values}`,
    );
  } catch (error) {
    console.error("[pg:backfill:product-variants-foundation] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
