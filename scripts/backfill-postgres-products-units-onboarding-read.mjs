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

const backfillProductCategories = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      name,
      sort_order as "sortOrder",
      created_at as "createdAt"
    from product_categories
    order by id asc
  `);

  await upsertRows({
    tableName: "product_categories",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      name: row.name,
      sortOrder: Number(row.sortOrder ?? 0),
      createdAt: row.createdAt ?? null,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "name", paramName: "name" },
      { columnName: "sort_order", paramName: "sortOrder" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillProductModels = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      name,
      category_id as "categoryId",
      image_url as "imageUrl",
      description,
      active,
      created_at as "createdAt"
    from product_models
    order by id asc
  `);

  await upsertRows({
    tableName: "product_models",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      name: row.name,
      categoryId: row.categoryId ?? null,
      imageUrl: row.imageUrl ?? null,
      description: row.description ?? null,
      active: row.active === 1 || row.active === true,
      createdAt: row.createdAt ?? null,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "name", paramName: "name" },
      { columnName: "category_id", paramName: "categoryId" },
      { columnName: "image_url", paramName: "imageUrl" },
      { columnName: "description", paramName: "description" },
      { columnName: "active", paramName: "active" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillProductUnits = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      product_id as "productId",
      unit_id as "unitId",
      multiplier_to_base as "multiplierToBase",
      price_per_unit as "pricePerUnit"
    from product_units
    order by id asc
  `);

  await upsertRows({
    tableName: "product_units",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      unitId: row.unitId,
      multiplierToBase: Number(row.multiplierToBase ?? 0),
      pricePerUnit:
        row.pricePerUnit === null || row.pricePerUnit === undefined
          ? null
          : Number(row.pricePerUnit),
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "product_id", paramName: "productId" },
      { columnName: "unit_id", paramName: "unitId" },
      { columnName: "multiplier_to_base", paramName: "multiplierToBase" },
      { columnName: "price_per_unit", paramName: "pricePerUnit" },
    ],
    tx,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    await target.transaction(async (tx) => {
      await backfillProductCategories(tx);
      await backfillProductModels(tx);
      await backfillProductUnits(tx);
    });

    const [productCategories, productModels, productUnits] = await Promise.all([
      countTargetRows("product_categories"),
      countTargetRows("product_models"),
      countTargetRows("product_units"),
    ]);

    console.info(
      `[pg:backfill:products-units-onboarding-read] done product_categories=${productCategories} product_models=${productModels} product_units=${productUnits}`,
    );
  } catch (error) {
    console.error("[pg:backfill:products-units-onboarding-read] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
