import { randomUUID } from "node:crypto";

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;
type PostgresExecute = typeof import("@/lib/db/query").execute;

type PostgresAuthRbacContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
  execute: PostgresExecute;
};

type GlobalSessionPolicyRow = {
  defaultSessionLimit: number | string | null;
};

type GlobalStoreLogoPolicyRow = {
  maxSizeMb: number | string | null;
  autoResize: boolean | null;
  resizeMaxWidth: number | string | null;
};

type GlobalPaymentPolicyRow = {
  maxAccountsPerStore: number | string | null;
  requireSlipForLaoQr: boolean | null;
};

type UserSessionLimitRow = {
  sessionLimit: number | string | null;
};

type SystemRoleRow = {
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN" | null;
};

type MembershipRow = {
  roleId: string;
  roleName: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

type PermissionCatalogRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
};

type ActiveMembershipRow = {
  storeId: string;
  storeName: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
  roleId: string;
  roleName: string;
};

type MembershipStatusRow = {
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

type CancelApproverRow = {
  userId: string;
  name: string | null;
  email: string | null;
  passwordHash: string;
  roleName: string | null;
};

type StoreShellProfileRow = {
  name: string;
  logoUrl: string | null;
};

type StoreBranchRow = {
  id: string;
  storeId: string;
  name: string;
  code: string | null;
  address: string | null;
  createdAt: string;
};

type BranchAccessRow = {
  branchId: string;
};

const DEFAULT_SESSION_LIMIT = 1;
const DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE = 5;
const DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR = true;
const DEFAULT_STORE_LOGO_MAX_SIZE_MB = 5;
const DEFAULT_STORE_LOGO_AUTO_RESIZE = true;
const DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH = 1280;

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

const toPositiveIntOrNull = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toIntInRangeOrNull = (
  value: number | string | null | undefined,
  min: number,
  max: number,
) => {
  const parsed = toNumber(value);
  return typeof parsed === "number" &&
    Number.isInteger(parsed) &&
    parsed >= min &&
    parsed <= max
    ? parsed
    : null;
};

const getPostgresAuthRbacContext = async (): Promise<PostgresAuthRbacContext | null> => {
  const [{ queryMany, queryOne, execute }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    return null;
  }

  return {
    queryMany,
    queryOne,
    execute,
  };
};

export const logAuthRbacReadFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[auth-rbac.read.pg] fallback to turso for ${operation}: ${message}`);
};

export async function getGlobalSessionPolicyFromPostgres() {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<GlobalSessionPolicyRow>(
    `
      select default_session_limit as "defaultSessionLimit"
      from system_config
      where id = 'global'
      limit 1
    `,
  );

  return {
    defaultSessionLimit:
      toPositiveIntOrNull(row?.defaultSessionLimit) ?? DEFAULT_SESSION_LIMIT,
  };
}

export async function getGlobalStoreLogoPolicyFromPostgres() {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<GlobalStoreLogoPolicyRow>(
    `
      select
        store_logo_max_size_mb as "maxSizeMb",
        store_logo_auto_resize as "autoResize",
        store_logo_resize_max_width as "resizeMaxWidth"
      from system_config
      where id = 'global'
      limit 1
    `,
  );

  return {
    maxSizeMb:
      toIntInRangeOrNull(row?.maxSizeMb, 1, 20) ?? DEFAULT_STORE_LOGO_MAX_SIZE_MB,
    autoResize:
      typeof row?.autoResize === "boolean"
        ? row.autoResize
        : DEFAULT_STORE_LOGO_AUTO_RESIZE,
    resizeMaxWidth:
      toIntInRangeOrNull(row?.resizeMaxWidth, 256, 4096) ??
      DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH,
  };
}

export async function getGlobalPaymentPolicyFromPostgres() {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<GlobalPaymentPolicyRow>(
    `
      select
        payment_max_accounts_per_store as "maxAccountsPerStore",
        payment_require_slip_for_lao_qr as "requireSlipForLaoQr"
      from system_config
      where id = 'global'
      limit 1
    `,
  );

  return {
    maxAccountsPerStore:
      toIntInRangeOrNull(row?.maxAccountsPerStore, 1, 20) ??
      DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE,
    requireSlipForLaoQr:
      typeof row?.requireSlipForLaoQr === "boolean"
        ? row.requireSlipForLaoQr
        : DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR,
  };
}

export async function getUserSessionLimitOverrideFromPostgres(userId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<UserSessionLimitRow>(
    `
      select session_limit as "sessionLimit"
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId },
    },
  );

  return toPositiveIntOrNull(row?.sessionLimit);
}

export async function getUserSystemRoleFromPostgres(userId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<SystemRoleRow>(
    `
      select system_role as "systemRole"
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId },
    },
  );

  if (
    row?.systemRole === "SUPERADMIN" ||
    row?.systemRole === "SYSTEM_ADMIN" ||
    row?.systemRole === "USER"
  ) {
    return row.systemRole;
  }

  return "USER";
}

export async function getPermissionCatalogFromPostgres() {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  return pg.queryMany<PermissionCatalogRow>(
    `
      select
        id,
        key,
        resource,
        action
      from permissions
      order by key asc
    `,
  );
}

export async function getMembershipFromPostgres(userId: string, storeId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const membership = await pg.queryOne<MembershipRow>(
    `
      select
        r.id as "roleId",
        r.name as "roleName",
        sm.status as "status"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      where
        sm.store_id = :storeId
        and sm.user_id = :userId
        and sm.status = 'ACTIVE'
      limit 1
    `,
    {
      replacements: {
        storeId,
        userId,
      },
    },
  );

  return membership ?? null;
}

export async function getAllPermissionKeysFromPostgres() {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const rows = await pg.queryMany<{ key: string }>(
    `
      select key
      from permissions
      order by key asc
    `,
  );

  return rows.map((row) => row.key);
}

export async function getRolePermissionKeysFromPostgres(roleId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const rows = await pg.queryMany<{ key: string }>(
    `
      select p.key as "key"
      from role_permissions rp
      inner join permissions p on rp.permission_id = p.id
      where rp.role_id = :roleId
      order by p.key asc
    `,
    {
      replacements: { roleId },
    },
  );

  return rows.map((row) => row.key);
}

export async function findPrimaryMembershipFromPostgres(userId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const membership = await pg.queryOne<ActiveMembershipRow>(
    `
      select
        sm.store_id as "storeId",
        s.name as "storeName",
        s.store_type as "storeType",
        r.id as "roleId",
        r.name as "roleName"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      inner join stores s on sm.store_id = s.id
      where sm.user_id = :userId and sm.status = 'ACTIVE'
      order by sm.created_at asc
      limit 1
    `,
    {
      replacements: { userId },
    },
  );

  return membership ?? null;
}

export async function findActiveMembershipByStoreFromPostgres(
  userId: string,
  storeId: string,
) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const membership = await pg.queryOne<ActiveMembershipRow>(
    `
      select
        sm.store_id as "storeId",
        s.name as "storeName",
        s.store_type as "storeType",
        r.id as "roleId",
        r.name as "roleName"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      inner join stores s on sm.store_id = s.id
      where
        sm.user_id = :userId
        and sm.store_id = :storeId
        and sm.status = 'ACTIVE'
      limit 1
    `,
    {
      replacements: {
        userId,
        storeId,
      },
    },
  );

  return membership ?? null;
}

export async function listActiveMembershipsFromPostgres(userId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  return pg.queryMany<ActiveMembershipRow>(
    `
      select
        sm.store_id as "storeId",
        s.name as "storeName",
        s.store_type as "storeType",
        r.id as "roleId",
        r.name as "roleName"
      from store_members sm
      inner join roles r on sm.role_id = r.id
      inner join stores s on sm.store_id = s.id
      where sm.user_id = :userId and sm.status = 'ACTIVE'
      order by s.name asc
    `,
    {
      replacements: { userId },
    },
  );
}

export async function getUserMembershipFlagsFromPostgres(userId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const rows = await pg.queryMany<MembershipStatusRow>(
    `
      select status
      from store_members
      where user_id = :userId
    `,
    {
      replacements: { userId },
    },
  );

  return {
    hasActiveMembership: rows.some((row) => row.status === "ACTIVE"),
    hasInvitedMembership: rows.some((row) => row.status === "INVITED"),
    hasSuspendedMembership: rows.some((row) => row.status === "SUSPENDED"),
  };
}

export async function getStoreShellProfileFromPostgres(storeId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StoreShellProfileRow>(
    `
      select
        name,
        logo_url as "logoUrl"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  return row ?? null;
}

export async function getMainBranchFromPostgres(storeId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<StoreBranchRow>(
    `
      select
        id,
        store_id as "storeId",
        name,
        code,
        address,
        created_at as "createdAt"
      from store_branches
      where store_id = :storeId and code = 'MAIN'
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  return row ?? null;
}

export async function ensureMainBranchExistsInPostgres(storeId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const existing = await getMainBranchFromPostgres(storeId);
  if (existing) {
    return existing;
  }

  await pg.execute(
    `
      insert into store_branches (
        id,
        store_id,
        name,
        code,
        address,
        source_branch_id,
        sharing_mode,
        sharing_config
      )
      values (
        :id,
        :storeId,
        'สาขาหลัก',
        'MAIN',
        null,
        null,
        'MAIN',
        null
      )
      on conflict do nothing
    `,
    {
      replacements: {
        id: randomUUID(),
        storeId,
      },
    },
  );

  const created = await getMainBranchFromPostgres(storeId);
  if (created) {
    return created;
  }

  throw new Error("ไม่สามารถสร้างสาขาหลักได้");
}

export async function listStoreBranchesFromPostgres(storeId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  return pg.queryMany<StoreBranchRow>(
    `
      select
        id,
        store_id as "storeId",
        name,
        code,
        address,
        created_at as "createdAt"
      from store_branches
      where store_id = :storeId
      order by created_at asc, name asc
    `,
    {
      replacements: { storeId },
    },
  );
}

export async function getMemberBranchAccessFromPostgres(userId: string, storeId: string) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const rows = await pg.queryMany<BranchAccessRow>(
    `
      select branch_id as "branchId"
      from store_member_branches
      where store_id = :storeId and user_id = :userId
      order by branch_id asc
    `,
    {
      replacements: {
        storeId,
        userId,
      },
    },
  );

  const branchIds = rows.map((row) => row.branchId);
  if (branchIds.length === 0) {
    return {
      mode: "ALL" as const,
      branchIds: [],
    };
  }

  return {
    mode: "SELECTED" as const,
    branchIds,
  };
}

export async function findActiveCancelApproverByEmailFromPostgres(
  storeId: string,
  email: string,
) {
  const pg = await getPostgresAuthRbacContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<CancelApproverRow>(
    `
      select
        u.id as "userId",
        u.name,
        u.email,
        u.password_hash as "passwordHash",
        r.name as "roleName"
      from users u
      inner join store_members sm
        on sm.user_id = u.id
       and sm.store_id = :storeId
       and sm.status = 'ACTIVE'
      inner join roles r
        on sm.role_id = r.id
       and sm.store_id = r.store_id
      where lower(u.email) = lower(:email)
      limit 1
    `,
    {
      replacements: {
        storeId,
        email,
      },
    },
  );

  return row ?? null;
}
