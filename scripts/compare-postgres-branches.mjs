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

const compareTable = async ({ tableName, sourceSql, targetSql }) => {
  const [sourceRows, targetRows] = await Promise.all([
    fetchSourceRows(sourceSql),
    fetchTargetRows(targetSql),
  ]);

  if (asComparableJson(sourceRows) !== asComparableJson(targetRows)) {
    throw new Error(`parity mismatch table=${tableName}`);
  }

  return sourceRows.length;
};

const run = async () => {
  try {
    await target.authenticate();

    const summary = {
      branch_policy: await compareTable({
        tableName: "branch_policy",
        sourceSql: `
          select
            id,
            default_can_create_branches as "defaultCanCreateBranches",
            default_max_branches_per_store as "defaultMaxBranchesPerStore"
          from system_config
          where id = 'global'
        `,
        targetSql: `
          select
            id,
            default_can_create_branches as "defaultCanCreateBranches",
            default_max_branches_per_store as "defaultMaxBranchesPerStore"
          from system_config
          where id = 'global'
        `,
      }),
      user_branch_overrides: await compareTable({
        tableName: "user_branch_overrides",
        sourceSql: `
          select
            id,
            system_role as "systemRole",
            can_create_branches as "canCreateBranches",
            max_branches_per_store as "maxBranchesPerStore"
          from users
          order by id asc
        `,
        targetSql: `
          select
            id,
            system_role as "systemRole",
            can_create_branches as "canCreateBranches",
            max_branches_per_store as "maxBranchesPerStore"
          from users
          order by id asc
        `,
      }),
      store_branch_overrides: await compareTable({
        tableName: "store_branch_overrides",
        sourceSql: `
          select
            id,
            max_branches_override as "maxBranchesOverride"
          from stores
          order by id asc
        `,
        targetSql: `
          select
            id,
            max_branches_override as "maxBranchesOverride"
          from stores
          order by id asc
        `,
      }),
      store_branches: await compareTable({
        tableName: "store_branches",
        sourceSql: `
          select
            id,
            store_id as "storeId",
            name,
            code,
            address,
            source_branch_id as "sourceBranchId",
            sharing_mode as "sharingMode",
            sharing_config as "sharingConfig",
            created_at as "createdAt"
          from store_branches
          order by created_at asc, id asc
        `,
        targetSql: `
          select
            id,
            store_id as "storeId",
            name,
            code,
            address,
            source_branch_id as "sourceBranchId",
            sharing_mode as "sharingMode",
            sharing_config as "sharingConfig",
            created_at as "createdAt"
          from store_branches
          order by created_at asc, id asc
        `,
      }),
      store_member_branches: await compareTable({
        tableName: "store_member_branches",
        sourceSql: `
          select
            store_id as "storeId",
            user_id as "userId",
            branch_id as "branchId",
            created_at as "createdAt"
          from store_member_branches
          order by created_at asc, store_id asc, user_id asc, branch_id asc
        `,
        targetSql: `
          select
            store_id as "storeId",
            user_id as "userId",
            branch_id as "branchId",
            created_at as "createdAt"
          from store_member_branches
          order by created_at asc, store_id asc, user_id asc, branch_id asc
        `,
      }),
    };

    console.log(`[pg:branches] parity ok ${JSON.stringify(summary)}`);
  } catch (error) {
    console.error("[pg:branches] parity failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await target.close();
  }
};

await run();
