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

  const sourceJson = asComparableJson(sourceRows);
  const targetJson = asComparableJson(targetRows);

  if (sourceJson !== targetJson) {
    throw new Error(`parity mismatch table=${tableName}`);
  }

  return sourceRows.length;
};

const run = async () => {
  try {
    await target.authenticate();

    const summary = {
      system_config: await compareTable({
        tableName: "system_config",
        sourceSql: `
          select
            id,
            default_can_create_branches as "defaultCanCreateBranches",
            default_max_branches_per_store as "defaultMaxBranchesPerStore",
            default_session_limit as "defaultSessionLimit",
            payment_max_accounts_per_store as "paymentMaxAccountsPerStore",
            payment_require_slip_for_lao_qr as "paymentRequireSlipForLaoQr",
            store_logo_max_size_mb as "storeLogoMaxSizeMb",
            store_logo_auto_resize as "storeLogoAutoResize",
            store_logo_resize_max_width as "storeLogoResizeMaxWidth",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from system_config
          order by id asc
        `,
        targetSql: `
          select
            id,
            default_can_create_branches as "defaultCanCreateBranches",
            default_max_branches_per_store as "defaultMaxBranchesPerStore",
            default_session_limit as "defaultSessionLimit",
            payment_max_accounts_per_store as "paymentMaxAccountsPerStore",
            payment_require_slip_for_lao_qr as "paymentRequireSlipForLaoQr",
            store_logo_max_size_mb as "storeLogoMaxSizeMb",
            store_logo_auto_resize as "storeLogoAutoResize",
            store_logo_resize_max_width as "storeLogoResizeMaxWidth",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from system_config
          order by id asc
        `,
      }),
      permissions: await compareTable({
        tableName: "permissions",
        sourceSql: `
          select id, key, resource, action
          from permissions
          order by key asc
        `,
        targetSql: `
          select id, key, resource, action
          from permissions
          order by key asc
        `,
      }),
      roles: await compareTable({
        tableName: "roles",
        sourceSql: `
          select
            id,
            store_id as "storeId",
            name,
            is_system as "isSystem",
            created_at as "createdAt"
          from roles
          order by created_at asc, id asc
        `,
        targetSql: `
          select
            id,
            store_id as "storeId",
            name,
            is_system as "isSystem",
            created_at as "createdAt"
          from roles
          order by created_at asc, id asc
        `,
      }),
      store_members: await compareTable({
        tableName: "store_members",
        sourceSql: `
          select
            store_id as "storeId",
            user_id as "userId",
            role_id as "roleId",
            status,
            added_by as "addedBy",
            created_at as "createdAt"
          from store_members
          order by created_at asc, store_id asc, user_id asc
        `,
        targetSql: `
          select
            store_id as "storeId",
            user_id as "userId",
            role_id as "roleId",
            status,
            added_by as "addedBy",
            created_at as "createdAt"
          from store_members
          order by created_at asc, store_id asc, user_id asc
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
      role_permissions: await compareTable({
        tableName: "role_permissions",
        sourceSql: `
          select
            role_id as "roleId",
            permission_id as "permissionId"
          from role_permissions
          order by role_id asc, permission_id asc
        `,
        targetSql: `
          select
            role_id as "roleId",
            permission_id as "permissionId"
          from role_permissions
          order by role_id asc, permission_id asc
        `,
      }),
    };

    console.info(
      `[pg-auth-rbac-compare] parity ok systemConfig=${summary.system_config} permissions=${summary.permissions} roles=${summary.roles} storeMembers=${summary.store_members} storeBranches=${summary.store_branches}`,
    );
  } catch (error) {
    console.error(
      `[pg-auth-rbac-compare] failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  } finally {
    await target.close();
  }
};

void run();
