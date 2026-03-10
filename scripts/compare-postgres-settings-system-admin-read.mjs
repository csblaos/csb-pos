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

const run = async () => {
  try {
    await target.authenticate();

    const fbCount = await compareRows({
      label: "fb_connections",
      sourceSql: `
        select
          id,
          store_id as "storeId",
          status,
          page_name as "pageName",
          page_id as "pageId",
          connected_at as "connectedAt"
        from fb_connections
        order by id asc
      `,
      targetSql: `
        select
          id,
          store_id as "storeId",
          status,
          page_name as "pageName",
          page_id as "pageId",
          connected_at as "connectedAt"
        from fb_connections
        order by id asc
      `,
    });

    const waCount = await compareRows({
      label: "wa_connections",
      sourceSql: `
        select
          id,
          store_id as "storeId",
          status,
          phone_number as "phoneNumber",
          connected_at as "connectedAt"
        from wa_connections
        order by id asc
      `,
      targetSql: `
        select
          id,
          store_id as "storeId",
          status,
          phone_number as "phoneNumber",
          connected_at as "connectedAt"
        from wa_connections
        order by id asc
      `,
    });

    const superadminCount = await compareRows({
      label: "system_admin.list_superadmins",
      sourceSql: `
        select
          u.id as "userId",
          u.email,
          u.name,
          u.can_create_stores as "canCreateStores",
          u.max_stores as "maxStores",
          u.can_create_branches as "canCreateBranches",
          u.max_branches_per_store as "maxBranchesPerStore",
          coalesce(sum(case
            when sm.status = 'ACTIVE' and r.name = 'Owner' then 1
            else 0
          end), 0) as "activeOwnerStoreCount",
          u.created_at as "createdAt"
        from users u
        left join store_members sm on sm.user_id = u.id
        left join roles r on sm.role_id = r.id and sm.store_id = r.store_id
        where u.system_role = 'SUPERADMIN'
        group by
          u.id,
          u.email,
          u.name,
          u.can_create_stores,
          u.max_stores,
          u.can_create_branches,
          u.max_branches_per_store,
          u.created_at
        order by u.name asc
      `,
      targetSql: `
        select
          u.id as "userId",
          u.email,
          u.name,
          u.can_create_stores as "canCreateStores",
          u.max_stores as "maxStores",
          u.can_create_branches as "canCreateBranches",
          u.max_branches_per_store as "maxBranchesPerStore",
          coalesce(sum(case
            when sm.status = 'ACTIVE' and r.name = 'Owner' then 1
            else 0
          end), 0) as "activeOwnerStoreCount",
          u.created_at as "createdAt"
        from users u
        left join store_members sm on sm.user_id = u.id
        left join roles r on sm.role_id = r.id and sm.store_id = r.store_id
        where u.system_role = 'SUPERADMIN'
        group by
          u.id,
          u.email,
          u.name,
          u.can_create_stores,
          u.max_stores,
          u.can_create_branches,
          u.max_branches_per_store,
          u.created_at
        order by u.name asc
      `,
    });

    const [sourceStatsRows, targetStatsRows] = await Promise.all([
      fetchSourceRows(`
        select
          (select count(*) from users where system_role = 'SUPERADMIN') as "totalClients",
          (select count(*) from stores) as "totalStores",
          (select count(*) from users) as "totalUsers",
          (select count(*) from store_members where status = 'ACTIVE') as "totalActiveMembers",
          (select count(*) from store_members where status = 'SUSPENDED') as "totalSuspendedMembers",
          (
            select count(*)
            from users
            where system_role = 'SUPERADMIN' and can_create_stores = 1
          ) as "totalClientsCanCreateStores",
          (
            select count(*)
            from users
            where system_role = 'SUPERADMIN' and can_create_stores = 1 and max_stores is null
          ) as "totalUnlimitedClients"
      `),
      fetchTargetRows(`
        select
          (select count(*) from users where system_role = 'SUPERADMIN') as "totalClients",
          (select count(*) from stores) as "totalStores",
          (select count(*) from users) as "totalUsers",
          (select count(*) from store_members where status = 'ACTIVE') as "totalActiveMembers",
          (select count(*) from store_members where status = 'SUSPENDED') as "totalSuspendedMembers",
          (
            select count(*)
            from users
            where system_role = 'SUPERADMIN' and can_create_stores = true
          ) as "totalClientsCanCreateStores",
          (
            select count(*)
            from users
            where system_role = 'SUPERADMIN' and can_create_stores = true and max_stores is null
          ) as "totalUnlimitedClients"
      `),
    ]);

    if (asComparableJson(sourceStatsRows) !== asComparableJson(targetStatsRows)) {
      throw new Error("parity mismatch system_admin.dashboard_stats");
    }

    const [sourcePolicyRows, targetPolicyRows] = await Promise.all([
      fetchSourceRows(`
        select
          u.id as "userId",
          u.system_role as "systemRole",
          u.can_create_stores as "canCreateStores",
          u.max_stores as "maxStores",
          (
            select count(*)
            from store_members sm
            where sm.user_id = u.id
          ) as "membershipCount",
          (
            select coalesce(sum(case
              when sm.status = 'ACTIVE' and r.name = 'Owner' then 1
              else 0
            end), 0)
            from store_members sm
            inner join roles r on sm.role_id = r.id
            where sm.user_id = u.id
          ) as "activeOwnerStoreCount"
        from users u
        where u.system_role in ('SUPERADMIN', 'SYSTEM_ADMIN')
        order by u.id asc
      `),
      fetchTargetRows(`
        select
          u.id as "userId",
          u.system_role as "systemRole",
          u.can_create_stores as "canCreateStores",
          u.max_stores as "maxStores",
          (
            select count(*)
            from store_members sm
            where sm.user_id = u.id
          ) as "membershipCount",
          (
            select coalesce(sum(case
              when sm.status = 'ACTIVE' and r.name = 'Owner' then 1
              else 0
            end), 0)
            from store_members sm
            inner join roles r on sm.role_id = r.id
            where sm.user_id = u.id
          ) as "activeOwnerStoreCount"
        from users u
        where u.system_role in ('SUPERADMIN', 'SYSTEM_ADMIN')
        order by u.id asc
      `),
    ]);

    if (asComparableJson(sourcePolicyRows) !== asComparableJson(targetPolicyRows)) {
      throw new Error("parity mismatch system_admin.store_creation_policy");
    }

    console.info(
      `[pg:compare:settings-system-admin-read] parity ok fb_connections=${fbCount} wa_connections=${waCount} superadmins=${superadminCount} policyUsers=${sourcePolicyRows.length}`,
    );
  } catch (error) {
    console.error("[pg:compare:settings-system-admin-read] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await target.close();
    source.close();
  }
};

await run();
