import "server-only";

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;

type PostgresSettingsAdminContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
};

type SuperadminRow = {
  userId: string;
  email: string;
  name: string;
  canCreateStores: boolean | null;
  maxStores: number | string | null;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | string | null;
  activeOwnerStoreCount: number | string | null;
  createdAt: string;
};

type DashboardStatsRow = {
  totalClients: number | string | null;
  totalStores: number | string | null;
  totalUsers: number | string | null;
  totalActiveMembers: number | string | null;
  totalSuspendedMembers: number | string | null;
  totalClientsCanCreateStores: number | string | null;
  totalUnlimitedClients: number | string | null;
};

type StoreCreationPolicyRow = {
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN" | null;
  canCreateStores: boolean | null;
  maxStores: number | string | null;
  membershipCount: number | string | null;
  activeOwnerStoreCount: number | string | null;
};

type StoreBranchCountRow = {
  storeId: string;
  count: number | string | null;
};

type StoreMemberStatusCountRow = {
  storeId: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  count: number | string | null;
};

type ScalarValueRow = {
  value: number | string | null;
};

type StoreConnectionRow = {
  storeId: string;
};

type StoreOverrideRow = {
  id: string;
  name: string;
  maxBranchesOverride: number | string | null;
};

type SuperadminOverrideRow = {
  userId: string;
  name: string;
  email: string;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | string | null;
  sessionLimit: number | string | null;
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toNonNegativeIntOrNull = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const getTodayUtcRange = () => {
  const now = new Date();
  const todayStartUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  return {
    todayStartUtc: todayStartUtc.toISOString(),
    tomorrowStartUtc: tomorrowStartUtc.toISOString(),
  };
};

const isPostgresSettingsSystemAdminReadEnabled = () =>
  process.env.POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED === "1";

const getPostgresSettingsAdminContext = async (): Promise<PostgresSettingsAdminContext | null> => {
  if (!isPostgresSettingsSystemAdminReadEnabled()) {
    return null;
  }

  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    return null;
  }

  return {
    queryMany,
    queryOne,
  };
};

export const logSettingsSystemAdminReadFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[settings-admin.read.pg] fallback to turso for ${operation}: ${message}`);
};

export async function listSuperadminsFromPostgres() {
  const pg = await getPostgresSettingsAdminContext();
  if (!pg) {
    return undefined;
  }

  const rows = await pg.queryMany<SuperadminRow>(
    `
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
  );

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name,
    canCreateStores: row.canCreateStores === true,
    maxStores:
      typeof toNonNegativeIntOrNull(row.maxStores) === "number" &&
      toNonNegativeIntOrNull(row.maxStores)! > 0
        ? toNonNegativeIntOrNull(row.maxStores)
        : null,
    canCreateBranches:
      typeof row.canCreateBranches === "boolean" ? row.canCreateBranches : null,
    maxBranchesPerStore: toNonNegativeIntOrNull(row.maxBranchesPerStore),
    activeOwnerStoreCount: Number(row.activeOwnerStoreCount ?? 0),
    createdAt: row.createdAt,
  }));
}

export async function getSystemAdminDashboardStatsFromPostgres() {
  const pg = await getPostgresSettingsAdminContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<DashboardStatsRow>(
    `
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
          where
            system_role = 'SUPERADMIN'
            and can_create_stores = true
            and max_stores is null
        ) as "totalUnlimitedClients"
    `,
  );

  return {
    totalClients: Number(row?.totalClients ?? 0),
    totalStores: Number(row?.totalStores ?? 0),
    totalUsers: Number(row?.totalUsers ?? 0),
    totalActiveMembers: Number(row?.totalActiveMembers ?? 0),
    totalSuspendedMembers: Number(row?.totalSuspendedMembers ?? 0),
    totalClientsCanCreateStores: Number(row?.totalClientsCanCreateStores ?? 0),
    totalUnlimitedClients: Number(row?.totalUnlimitedClients ?? 0),
  };
}

export async function getStoreCreationPolicyFromPostgres(userId: string) {
  const pg = await getPostgresSettingsAdminContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StoreCreationPolicyRow>(
    `
      select
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
      where u.id = :userId
      limit 1
    `,
    {
      replacements: { userId },
    },
  );

  return {
    systemRole: row?.systemRole ?? "USER",
    canCreateStores:
      typeof row?.canCreateStores === "boolean" ? row.canCreateStores : null,
    maxStores:
      typeof toNonNegativeIntOrNull(row?.maxStores) === "number" &&
      toNonNegativeIntOrNull(row?.maxStores)! > 0
        ? toNonNegativeIntOrNull(row?.maxStores)
        : null,
    hasAnyMembership: Number(row?.membershipCount ?? 0) > 0,
    activeOwnerStoreCount: Number(row?.activeOwnerStoreCount ?? 0),
  };
}

export async function getSuperadminOverviewMetricsFromPostgres(storeIds: string[]) {
  const pg = await getPostgresSettingsAdminContext();
  if (!pg || storeIds.length === 0) {
    return undefined;
  }

  const { todayStartUtc, tomorrowStartUtc } = getTodayUtcRange();

  const [branchRows, memberRows, todaySalesRow, todayOrdersRow, fbRows, waRows] =
    await Promise.all([
      pg.queryMany<StoreBranchCountRow>(
        `
          select
            store_id as "storeId",
            count(*) as "count"
          from store_branches
          where store_id in (:storeIds)
          group by store_id
        `,
        { replacements: { storeIds } },
      ),
      pg.queryMany<StoreMemberStatusCountRow>(
        `
          select
            store_id as "storeId",
            status,
            count(*) as "count"
          from store_members
          where store_id in (:storeIds)
          group by store_id, status
        `,
        { replacements: { storeIds } },
      ),
      pg.queryOne<ScalarValueRow>(
        `
          select coalesce(sum(total), 0) as "value"
          from orders
          where
            store_id in (:storeIds)
            and status in ('PAID', 'PACKED', 'SHIPPED')
            and paid_at >= :todayStartUtc
            and paid_at < :tomorrowStartUtc
        `,
        { replacements: { storeIds, todayStartUtc, tomorrowStartUtc } },
      ),
      pg.queryOne<ScalarValueRow>(
        `
          select count(*) as "value"
          from orders
          where
            store_id in (:storeIds)
            and created_at >= :todayStartUtc
            and created_at < :tomorrowStartUtc
        `,
        { replacements: { storeIds, todayStartUtc, tomorrowStartUtc } },
      ),
      pg.queryMany<StoreConnectionRow>(
        `
          select distinct store_id as "storeId"
          from fb_connections
          where store_id in (:storeIds) and status = 'CONNECTED'
        `,
        { replacements: { storeIds } },
      ),
      pg.queryMany<StoreConnectionRow>(
        `
          select distinct store_id as "storeId"
          from wa_connections
          where store_id in (:storeIds) and status = 'CONNECTED'
        `,
        { replacements: { storeIds } },
      ),
    ]);

  return {
    branchRows,
    memberRows,
    todaySales: Number(todaySalesRow?.value ?? 0),
    todayOrders: Number(todayOrdersRow?.value ?? 0),
    connectedFbStoreIds: [...new Set(fbRows.map((row) => row.storeId))],
    connectedWaStoreIds: [...new Set(waRows.map((row) => row.storeId))],
  };
}

export async function getSuperadminHomeSnapshotInputsFromPostgres(storeIds: string[]) {
  const pg = await getPostgresSettingsAdminContext();
  if (!pg || storeIds.length === 0) {
    return undefined;
  }

  const { todayStartUtc, tomorrowStartUtc } = getTodayUtcRange();

  const [branchRows, memberRows, fbErrorRows, waErrorRows, todayOrderRow, todaySalesRow] =
    await Promise.all([
      pg.queryMany<StoreBranchCountRow>(
        `
          select
            store_id as "storeId",
            count(*) as "count"
          from store_branches
          where store_id in (:storeIds)
          group by store_id
        `,
        { replacements: { storeIds } },
      ),
      pg.queryMany<StoreMemberStatusCountRow>(
        `
          select
            store_id as "storeId",
            status,
            count(*) as "count"
          from store_members
          where store_id in (:storeIds)
          group by store_id, status
        `,
        { replacements: { storeIds } },
      ),
      pg.queryMany<StoreConnectionRow>(
        `
          select distinct store_id as "storeId"
          from fb_connections
          where store_id in (:storeIds) and status = 'ERROR'
        `,
        { replacements: { storeIds } },
      ),
      pg.queryMany<StoreConnectionRow>(
        `
          select distinct store_id as "storeId"
          from wa_connections
          where store_id in (:storeIds) and status = 'ERROR'
        `,
        { replacements: { storeIds } },
      ),
      pg.queryOne<ScalarValueRow>(
        `
          select count(*) as "value"
          from orders
          where
            store_id in (:storeIds)
            and created_at >= :todayStartUtc
            and created_at < :tomorrowStartUtc
        `,
        { replacements: { storeIds, todayStartUtc, tomorrowStartUtc } },
      ),
      pg.queryOne<ScalarValueRow>(
        `
          select coalesce(sum(total), 0) as "value"
          from orders
          where
            store_id in (:storeIds)
            and status in ('PAID', 'PACKED', 'SHIPPED')
            and paid_at >= :todayStartUtc
            and paid_at < :tomorrowStartUtc
        `,
        { replacements: { storeIds, todayStartUtc, tomorrowStartUtc } },
      ),
    ]);

  return {
    branchRows,
    memberRows,
    fbErrorStoreIds: [...new Set(fbErrorRows.map((row) => row.storeId))],
    waErrorStoreIds: [...new Set(waErrorRows.map((row) => row.storeId))],
    totalTodayOrders: Number(todayOrderRow?.value ?? 0),
    totalTodaySales: Number(todaySalesRow?.value ?? 0),
  };
}

export async function getSuperadminGlobalConfigOverviewFromPostgres(storeIds: string[]) {
  const pg = await getPostgresSettingsAdminContext();
  if (!pg || storeIds.length === 0) {
    return undefined;
  }

  const [
    storeOverrideCountRow,
    superadminOverrideCountRow,
    storeOverrideRows,
    superadminOverrideRows,
  ] = await Promise.all([
    pg.queryOne<ScalarValueRow>(
      `
        select count(*) as "value"
        from stores
        where id in (:storeIds) and max_branches_override is not null
      `,
      { replacements: { storeIds } },
    ),
    pg.queryOne<ScalarValueRow>(
      `
        select count(distinct u.id) as "value"
        from store_members sm
        inner join users u on sm.user_id = u.id
        where
          sm.store_id in (:storeIds)
          and u.system_role = 'SUPERADMIN'
          and (
            u.can_create_branches is not null
            or u.max_branches_per_store is not null
            or u.session_limit is not null
          )
      `,
      { replacements: { storeIds } },
    ),
    pg.queryMany<StoreOverrideRow>(
      `
        select
          id,
          name,
          max_branches_override as "maxBranchesOverride"
        from stores
        where id in (:storeIds) and max_branches_override is not null
        order by name asc
        limit 30
      `,
      { replacements: { storeIds } },
    ),
    pg.queryMany<SuperadminOverrideRow>(
      `
        select
          u.id as "userId",
          u.name,
          u.email,
          u.can_create_branches as "canCreateBranches",
          u.max_branches_per_store as "maxBranchesPerStore",
          u.session_limit as "sessionLimit"
        from store_members sm
        inner join users u on sm.user_id = u.id
        where
          sm.store_id in (:storeIds)
          and u.system_role = 'SUPERADMIN'
          and (
            u.can_create_branches is not null
            or u.max_branches_per_store is not null
            or u.session_limit is not null
          )
        group by
          u.id,
          u.name,
          u.email,
          u.can_create_branches,
          u.max_branches_per_store,
          u.session_limit
        order by u.name asc
        limit 50
      `,
      { replacements: { storeIds } },
    ),
  ]);

  return {
    storeOverrideCount: Number(storeOverrideCountRow?.value ?? 0),
    superadminOverrideCount: Number(superadminOverrideCountRow?.value ?? 0),
    storeOverrideRows: storeOverrideRows.map((row) => ({
      id: row.id,
      name: row.name,
      maxBranchesOverride: toNonNegativeIntOrNull(row.maxBranchesOverride),
    })),
    superadminOverrideRows: superadminOverrideRows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      canCreateBranches:
        typeof row.canCreateBranches === "boolean" ? row.canCreateBranches : null,
      maxBranchesPerStore: toNonNegativeIntOrNull(row.maxBranchesPerStore),
      sessionLimit: toNonNegativeIntOrNull(row.sessionLimit),
    })),
  };
}
