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

const normalizeScalar = (value) => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return Number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
  return value ?? null;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }
  return normalizeScalar(value);
};

const asComparableJson = (value) => JSON.stringify(normalizeValue(value));

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const fetchTargetRows = async (sql) => {
  const [rows] = await target.query(sql);
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
};

const compareRows = async ({ label, sourceSql, targetSql }) => {
  const [sourceRows, targetRows] = await Promise.all([
    fetchSourceRows(sourceSql),
    fetchTargetRows(targetSql),
  ]);

  if (asComparableJson(sourceRows) !== asComparableJson(targetRows)) {
    throw new Error(`parity mismatch ${label}`);
  }

  return sourceRows.length;
};

const compareStoreQuery = async ({ label, storeId, sourceSql, targetSql }) => {
  const compiledSourceSql = sourceSql.replaceAll(":storeId", `'${storeId}'`);
  const compiledTargetSql = targetSql.replaceAll(":storeId", `'${storeId}'`);

  await compareRows({
    label: `${label} store=${storeId}`,
    sourceSql: compiledSourceSql,
    targetSql: compiledTargetSql,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    const productCategoriesCount = await compareRows({
      label: "product_categories",
      sourceSql: `
        select
          id,
          store_id as "storeId",
          name,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from product_categories
        order by id asc
      `,
      targetSql: `
        select
          id,
          store_id as "storeId",
          name,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from product_categories
        order by id asc
      `,
    });

    const productModelsCount = await compareRows({
      label: "product_models",
      sourceSql: `
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
      `,
      targetSql: `
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
      `,
    });

    const productUnitsCount = await compareRows({
      label: "product_units",
      sourceSql: `
        select
          id,
          product_id as "productId",
          unit_id as "unitId",
          multiplier_to_base as "multiplierToBase",
          price_per_unit as "pricePerUnit"
        from product_units
        order by id asc
      `,
      targetSql: `
        select
          id,
          product_id as "productId",
          unit_id as "unitId",
          multiplier_to_base as "multiplierToBase",
          price_per_unit as "pricePerUnit"
        from product_units
        order by id asc
      `,
    });

    const storeRows = await fetchSourceRows(`
      select id
      from stores
      order by id asc
    `);

    for (const store of storeRows) {
      await compareStoreQuery({
        label: "units.list",
        storeId: store.id,
        sourceSql: `
          select
            id,
            code,
            name_th as "nameTh",
            scope,
            store_id as "storeId"
          from units
          where scope = 'SYSTEM' or (scope = 'STORE' and store_id = :storeId)
          order by case when scope = 'STORE' then 0 else 1 end, code asc
        `,
        targetSql: `
          select
            id,
            code,
            name_th as "nameTh",
            scope,
            store_id as "storeId"
          from units
          where scope = 'SYSTEM' or (scope = 'STORE' and store_id = :storeId)
          order by case when scope = 'STORE' then 0 else 1 end, code asc
        `,
      });

      await compareStoreQuery({
        label: "categories.list",
        storeId: store.id,
        sourceSql: `
          select
            pc.id,
            pc.name,
            pc.sort_order as "sortOrder",
            count(p.id) as "productCount"
          from product_categories pc
          left join products p
            on p.category_id = pc.id
            and p.store_id = :storeId
          where pc.store_id = :storeId
          group by pc.id, pc.name, pc.sort_order
          order by pc.sort_order asc, pc.name asc
        `,
        targetSql: `
          select
            pc.id,
            pc.name,
            pc.sort_order as "sortOrder",
            count(p.id) as "productCount"
          from product_categories pc
          left join products p
            on p.category_id = pc.id
            and p.store_id = :storeId
          where pc.store_id = :storeId
          group by pc.id, pc.name, pc.sort_order
          order by pc.sort_order asc, pc.name asc
        `,
      });

      await compareStoreQuery({
        label: "products.summary-counts",
        storeId: store.id,
        sourceSql: `
          select
            count(*) as total,
            coalesce(sum(case when active = 1 then 1 else 0 end), 0) as active
          from products
          where store_id = :storeId
        `,
        targetSql: `
          select
            count(*) as total,
            coalesce(sum(case when active = true then 1 else 0 end), 0) as active
          from products
          where store_id = :storeId
        `,
      });

      await compareStoreQuery({
        label: "products.thresholds",
        storeId: store.id,
        sourceSql: `
          select
            out_stock_threshold as "outStockThreshold",
            low_stock_threshold as "lowStockThreshold"
          from stores
          where id = :storeId
          limit 1
        `,
        targetSql: `
          select
            out_stock_threshold as "outStockThreshold",
            low_stock_threshold as "lowStockThreshold"
          from stores
          where id = :storeId
          limit 1
        `,
      });

      await compareStoreQuery({
        label: "onboarding.channels.status",
        storeId: store.id,
        sourceSql: `
          select
            coalesce((select status from fb_connections where store_id = :storeId limit 1), 'DISCONNECTED') as facebook,
            coalesce((select status from wa_connections where store_id = :storeId limit 1), 'DISCONNECTED') as whatsapp
        `,
        targetSql: `
          select
            coalesce((select status from fb_connections where store_id = :storeId limit 1), 'DISCONNECTED') as facebook,
            coalesce((select status from wa_connections where store_id = :storeId limit 1), 'DISCONNECTED') as whatsapp
        `,
      });

      for (const status of ["all", "active", "inactive"]) {
        const sourceWhere =
          status === "active"
            ? `store_id = :storeId and active = 1`
            : status === "inactive"
              ? `store_id = :storeId and active = 0`
              : `store_id = :storeId`;

        const targetWhere =
          status === "active"
            ? `store_id = :storeId and active = true`
            : status === "inactive"
              ? `store_id = :storeId and active = false`
              : `store_id = :storeId`;

        await compareStoreQuery({
          label: `products.page.ids status=${status}`,
          storeId: store.id,
          sourceSql: `
            select id
            from products
            where ${sourceWhere}
            order by created_at desc, name asc
            limit 30
            offset 0
          `,
          targetSql: `
            select id
            from products
            where ${targetWhere}
            order by created_at desc, name asc
            limit 30
            offset 0
          `,
        });
      }
    }

    console.info(
      `[pg:compare:products-units-onboarding-read] parity ok stores=${storeRows.length} product_categories=${productCategoriesCount} product_models=${productModelsCount} product_units=${productUnitsCount}`,
    );
  } catch (error) {
    console.error("[pg:compare:products-units-onboarding-read] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
