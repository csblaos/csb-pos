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

const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }
  return fallback;
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

const backfillSystemConfig = async (tx) => {
  const rows = await fetchSourceRows(`
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
  `);

  await upsertRows({
    tableName: "system_config",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      defaultCanCreateBranches: toBoolean(row.defaultCanCreateBranches, true),
      defaultMaxBranchesPerStore: Number(row.defaultMaxBranchesPerStore ?? 1),
      defaultSessionLimit: Number(row.defaultSessionLimit ?? 1),
      paymentMaxAccountsPerStore: Number(row.paymentMaxAccountsPerStore ?? 5),
      paymentRequireSlipForLaoQr: toBoolean(row.paymentRequireSlipForLaoQr, true),
      storeLogoMaxSizeMb: Number(row.storeLogoMaxSizeMb ?? 5),
      storeLogoAutoResize: toBoolean(row.storeLogoAutoResize, true),
      storeLogoResizeMaxWidth: Number(row.storeLogoResizeMaxWidth ?? 1280),
      createdAt: row.createdAt ?? new Date().toISOString(),
      updatedAt: row.updatedAt ?? row.createdAt ?? new Date().toISOString(),
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "default_can_create_branches", paramName: "defaultCanCreateBranches" },
      { columnName: "default_max_branches_per_store", paramName: "defaultMaxBranchesPerStore" },
      { columnName: "default_session_limit", paramName: "defaultSessionLimit" },
      { columnName: "payment_max_accounts_per_store", paramName: "paymentMaxAccountsPerStore" },
      {
        columnName: "payment_require_slip_for_lao_qr",
        paramName: "paymentRequireSlipForLaoQr",
      },
      { columnName: "store_logo_max_size_mb", paramName: "storeLogoMaxSizeMb" },
      { columnName: "store_logo_auto_resize", paramName: "storeLogoAutoResize" },
      { columnName: "store_logo_resize_max_width", paramName: "storeLogoResizeMaxWidth" },
      { columnName: "created_at", paramName: "createdAt" },
      { columnName: "updated_at", paramName: "updatedAt" },
    ],
    tx,
  });
};

const backfillPermissions = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      key,
      resource,
      action
    from permissions
    order by key asc
  `);

  await upsertRows({
    tableName: "permissions",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      key: row.key,
      resource: row.resource,
      action: row.action,
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "key", paramName: "key" },
      { columnName: "resource", paramName: "resource" },
      { columnName: "action", paramName: "action" },
    ],
    tx,
  });
};

const backfillRoles = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      id,
      store_id as "storeId",
      name,
      is_system as "isSystem",
      created_at as "createdAt"
    from roles
    order by created_at asc, id asc
  `);

  await upsertRows({
    tableName: "roles",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      name: row.name,
      isSystem: toBoolean(row.isSystem, false),
      createdAt: row.createdAt ?? new Date().toISOString(),
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "name", paramName: "name" },
      { columnName: "is_system", paramName: "isSystem" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillStoreMembers = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      store_id as "storeId",
      user_id as "userId",
      role_id as "roleId",
      status,
      added_by as "addedBy",
      created_at as "createdAt"
    from store_members
    order by created_at asc, store_id asc, user_id asc
  `);

  await upsertRows({
    tableName: "store_members",
    conflictColumns: ["store_id", "user_id"],
    rows: rows.map((row) => ({
      storeId: row.storeId,
      userId: row.userId,
      roleId: row.roleId,
      status: row.status,
      addedBy: row.addedBy ?? null,
      createdAt: row.createdAt ?? new Date().toISOString(),
    })),
    columns: [
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "user_id", paramName: "userId" },
      { columnName: "role_id", paramName: "roleId" },
      { columnName: "status", paramName: "status" },
      { columnName: "added_by", paramName: "addedBy" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillStoreBranches = async (tx) => {
  const rows = await fetchSourceRows(`
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
  `);

  await upsertRows({
    tableName: "store_branches",
    conflictColumns: ["id"],
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      name: row.name,
      code: row.code ?? null,
      address: row.address ?? null,
      sourceBranchId: row.sourceBranchId ?? null,
      sharingMode: row.sharingMode ?? null,
      sharingConfig: row.sharingConfig ?? null,
      createdAt: row.createdAt ?? new Date().toISOString(),
    })),
    columns: [
      { columnName: "id", paramName: "id" },
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "name", paramName: "name" },
      { columnName: "code", paramName: "code" },
      { columnName: "address", paramName: "address" },
      { columnName: "source_branch_id", paramName: "sourceBranchId" },
      { columnName: "sharing_mode", paramName: "sharingMode" },
      { columnName: "sharing_config", paramName: "sharingConfig" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillStoreMemberBranches = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      store_id as "storeId",
      user_id as "userId",
      branch_id as "branchId",
      created_at as "createdAt"
    from store_member_branches
    order by created_at asc, store_id asc, user_id asc, branch_id asc
  `);

  await upsertRows({
    tableName: "store_member_branches",
    conflictColumns: ["store_id", "user_id", "branch_id"],
    rows: rows.map((row) => ({
      storeId: row.storeId,
      userId: row.userId,
      branchId: row.branchId,
      createdAt: row.createdAt ?? new Date().toISOString(),
    })),
    columns: [
      { columnName: "store_id", paramName: "storeId" },
      { columnName: "user_id", paramName: "userId" },
      { columnName: "branch_id", paramName: "branchId" },
      { columnName: "created_at", paramName: "createdAt" },
    ],
    tx,
  });
};

const backfillRolePermissions = async (tx) => {
  const rows = await fetchSourceRows(`
    select
      role_id as "roleId",
      permission_id as "permissionId"
    from role_permissions
    order by role_id asc, permission_id asc
  `);

  await upsertRows({
    tableName: "role_permissions",
    conflictColumns: ["role_id", "permission_id"],
    rows: rows.map((row) => ({
      roleId: row.roleId,
      permissionId: row.permissionId,
    })),
    columns: [
      { columnName: "role_id", paramName: "roleId" },
      { columnName: "permission_id", paramName: "permissionId" },
    ],
    tx,
  });
};

const run = async () => {
  try {
    await target.authenticate();

    await target.transaction(async (tx) => {
      await backfillSystemConfig(tx);
      await backfillPermissions(tx);
      await backfillRoles(tx);
      await backfillStoreMembers(tx);
      await backfillStoreBranches(tx);
      await backfillStoreMemberBranches(tx);
      await backfillRolePermissions(tx);
    });

    const counts = {
      system_config: await countTargetRows("system_config"),
      permissions: await countTargetRows("permissions"),
      roles: await countTargetRows("roles"),
      store_members: await countTargetRows("store_members"),
      store_branches: await countTargetRows("store_branches"),
      store_member_branches: await countTargetRows("store_member_branches"),
      role_permissions: await countTargetRows("role_permissions"),
    };

    console.info("[pg-auth-rbac-backfill] done");
    console.info(JSON.stringify(counts, null, 2));
  } catch (error) {
    console.error(
      `[pg-auth-rbac-backfill] failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  } finally {
    await target.close();
  }
};

void run();
