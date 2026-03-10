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

const compareModelQuery = async ({ label, storeId, modelName, sourceSql, targetSql }) => {
  const compiledSourceSql = sourceSql
    .replaceAll(":storeId", `'${storeId}'`)
    .replaceAll(":modelName", `'${modelName.replaceAll("'", "''")}'`);
  const compiledTargetSql = targetSql
    .replaceAll(":storeId", `'${storeId}'`)
    .replaceAll(":modelName", `'${modelName.replaceAll("'", "''")}'`);

  await compareRows({
    label: `${label} store=${storeId} model=${modelName}`,
    sourceSql: compiledSourceSql,
    targetSql: compiledTargetSql,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    const attributesCount = await compareRows({
      label: "product_model_attributes",
      sourceSql: `
        select
          id,
          model_id as "modelId",
          code,
          name,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from product_model_attributes
        order by id asc
      `,
      targetSql: `
        select
          id,
          model_id as "modelId",
          code,
          name,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from product_model_attributes
        order by id asc
      `,
    });

    const valuesCount = await compareRows({
      label: "product_model_attribute_values",
      sourceSql: `
        select
          id,
          attribute_id as "attributeId",
          code,
          name,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from product_model_attribute_values
        order by id asc
      `,
      targetSql: `
        select
          id,
          attribute_id as "attributeId",
          code,
          name,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from product_model_attribute_values
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
        label: "product_models.list",
        storeId: store.id,
        sourceSql: `
          select
            pm.name
          from product_models pm
          left join products p
            on p.model_id = pm.id
            and p.store_id = :storeId
          where pm.store_id = :storeId
          group by pm.id, pm.name
          order by count(p.id) desc, pm.name asc
        `,
        targetSql: `
          select
            pm.name
          from product_models pm
          left join products p
            on p.model_id = pm.id
            and p.store_id = :storeId
          where pm.store_id = :storeId
          group by pm.id, pm.name
          order by count(p.id) desc, pm.name asc
        `,
      });

      const modelRows = await fetchSourceRows(`
        select name
        from product_models
        where store_id = '${store.id}'
        order by name asc
      `);

      for (const model of modelRows) {
        await compareModelQuery({
          label: "product_models.next_sort_order",
          storeId: store.id,
          modelName: model.name,
          sourceSql: `
            select
              coalesce(max(p.variant_sort_order), -1) + 1 as "nextSortOrder"
            from product_models pm
            left join products p
              on p.model_id = pm.id
              and p.store_id = :storeId
            where pm.store_id = :storeId and pm.name = :modelName
          `,
          targetSql: `
            select
              coalesce(max(p.variant_sort_order), -1) + 1 as "nextSortOrder"
            from product_models pm
            left join products p
              on p.model_id = pm.id
              and p.store_id = :storeId
            where pm.store_id = :storeId and pm.name = :modelName
          `,
        });

        await compareModelQuery({
          label: "product_models.variant_labels",
          storeId: store.id,
          modelName: model.name,
          sourceSql: `
            select
              p.variant_label as "variantLabel"
            from product_models pm
            inner join products p
              on p.model_id = pm.id
              and p.store_id = :storeId
            where
              pm.store_id = :storeId
              and pm.name = :modelName
              and p.variant_label is not null
              and length(trim(p.variant_label)) > 0
            group by p.variant_label
            order by count(p.id) desc, p.variant_label asc
          `,
          targetSql: `
            select
              p.variant_label as "variantLabel"
            from product_models pm
            inner join products p
              on p.model_id = pm.id
              and p.store_id = :storeId
            where
              pm.store_id = :storeId
              and pm.name = :modelName
              and p.variant_label is not null
              and length(trim(p.variant_label)) > 0
            group by p.variant_label
            order by count(p.id) desc, p.variant_label asc
          `,
        });
      }
    }

    console.info(
      `[pg:compare:product-variants-foundation] parity ok product_model_attributes=${attributesCount} product_model_attribute_values=${valuesCount} stores=${storeRows.length}`,
    );
  } catch (error) {
    console.error("[pg:compare:product-variants-foundation] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
