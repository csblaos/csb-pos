import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import { isPostgresConfigured, type PostgresTransaction } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";

type SuperadminListRow = {
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

type UserSummaryRow = {
  id: string;
  email: string;
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN" | null;
};

type StoreSummaryRow = {
  id: string;
};

const GLOBAL_CONFIG_ID = "global";
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

const toNonNegativeIntOrNull = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
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

export const isPostgresSettingsSystemAdminWriteEnabled = () =>
  isPostgresConfigured();

export const logSettingsSystemAdminWriteFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[settings-admin.write.pg] fallback to turso for ${operation}: ${message}`);
};

const mapSuperadminRows = (rows: SuperadminListRow[]) =>
  rows.map((row) => ({
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

const listSuperadminRows = async (transaction?: PostgresTransaction) =>
  queryMany<SuperadminListRow>(
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
    { transaction },
  );

export async function listSuperadminsAfterWriteFromPostgres() {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  return mapSuperadminRows(await listSuperadminRows());
}

export async function findUserByEmailFromPostgres(email: string) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  return queryOne<UserSummaryRow>(
    `
      select
        id,
        email,
        system_role as "systemRole"
      from users
      where email = :email
      limit 1
    `,
    {
      replacements: { email },
    },
  );
}

export async function findUserByIdFromPostgres(userId: string) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  return queryOne<UserSummaryRow>(
    `
      select
        id,
        email,
        system_role as "systemRole"
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId },
    },
  );
}

export async function findStoreByIdFromPostgres(storeId: string) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  return queryOne<StoreSummaryRow>(
    `
      select id
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );
}

export async function upsertGlobalSessionPolicyInPostgres(input: {
  defaultSessionLimit: number;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  const defaultSessionLimit =
    toPositiveIntOrNull(input.defaultSessionLimit) ?? DEFAULT_SESSION_LIMIT;

  await execute(
    `
      insert into system_config (
        id,
        default_can_create_branches,
        default_max_branches_per_store,
        default_session_limit,
        payment_max_accounts_per_store,
        payment_require_slip_for_lao_qr,
        store_logo_max_size_mb,
        store_logo_auto_resize,
        store_logo_resize_max_width,
        created_at,
        updated_at
      )
      values (
        :id,
        true,
        1,
        :defaultSessionLimit,
        :paymentMaxAccountsPerStore,
        :paymentRequireSlipForLaoQr,
        :storeLogoMaxSizeMb,
        :storeLogoAutoResize,
        :storeLogoResizeMaxWidth,
        current_timestamp,
        current_timestamp
      )
      on conflict (id) do update
      set
        default_session_limit = excluded.default_session_limit,
        updated_at = current_timestamp
    `,
    {
      replacements: {
        id: GLOBAL_CONFIG_ID,
        defaultSessionLimit,
        paymentMaxAccountsPerStore: DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE,
        paymentRequireSlipForLaoQr: DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR,
        storeLogoMaxSizeMb: DEFAULT_STORE_LOGO_MAX_SIZE_MB,
        storeLogoAutoResize: DEFAULT_STORE_LOGO_AUTO_RESIZE,
        storeLogoResizeMaxWidth: DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH,
      },
    },
  );

  return {
    defaultSessionLimit,
  };
}

export async function upsertGlobalStoreLogoPolicyInPostgres(input: {
  maxSizeMb: number;
  autoResize: boolean;
  resizeMaxWidth: number;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  const maxSizeMb =
    toIntInRangeOrNull(input.maxSizeMb, 1, 20) ?? DEFAULT_STORE_LOGO_MAX_SIZE_MB;
  const autoResize =
    typeof input.autoResize === "boolean"
      ? input.autoResize
      : DEFAULT_STORE_LOGO_AUTO_RESIZE;
  const resizeMaxWidth =
    toIntInRangeOrNull(input.resizeMaxWidth, 256, 4096) ??
    DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH;

  await execute(
    `
      insert into system_config (
        id,
        default_can_create_branches,
        default_max_branches_per_store,
        default_session_limit,
        payment_max_accounts_per_store,
        payment_require_slip_for_lao_qr,
        store_logo_max_size_mb,
        store_logo_auto_resize,
        store_logo_resize_max_width,
        created_at,
        updated_at
      )
      values (
        :id,
        true,
        1,
        :defaultSessionLimit,
        :paymentMaxAccountsPerStore,
        :paymentRequireSlipForLaoQr,
        :maxSizeMb,
        :autoResize,
        :resizeMaxWidth,
        current_timestamp,
        current_timestamp
      )
      on conflict (id) do update
      set
        store_logo_max_size_mb = excluded.store_logo_max_size_mb,
        store_logo_auto_resize = excluded.store_logo_auto_resize,
        store_logo_resize_max_width = excluded.store_logo_resize_max_width,
        updated_at = current_timestamp
    `,
    {
      replacements: {
        id: GLOBAL_CONFIG_ID,
        defaultSessionLimit: DEFAULT_SESSION_LIMIT,
        paymentMaxAccountsPerStore: DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE,
        paymentRequireSlipForLaoQr: DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR,
        maxSizeMb,
        autoResize,
        resizeMaxWidth,
      },
    },
  );

  return {
    maxSizeMb,
    autoResize,
    resizeMaxWidth,
  };
}

export async function upsertGlobalPaymentPolicyInPostgres(input: {
  maxAccountsPerStore: number;
  requireSlipForLaoQr: boolean;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  const maxAccountsPerStore =
    toIntInRangeOrNull(input.maxAccountsPerStore, 1, 20) ??
    DEFAULT_PAYMENT_MAX_ACCOUNTS_PER_STORE;
  const requireSlipForLaoQr =
    typeof input.requireSlipForLaoQr === "boolean"
      ? input.requireSlipForLaoQr
      : DEFAULT_PAYMENT_REQUIRE_SLIP_FOR_LAO_QR;

  await execute(
    `
      insert into system_config (
        id,
        default_can_create_branches,
        default_max_branches_per_store,
        default_session_limit,
        payment_max_accounts_per_store,
        payment_require_slip_for_lao_qr,
        store_logo_max_size_mb,
        store_logo_auto_resize,
        store_logo_resize_max_width,
        created_at,
        updated_at
      )
      values (
        :id,
        true,
        1,
        :defaultSessionLimit,
        :maxAccountsPerStore,
        :requireSlipForLaoQr,
        :storeLogoMaxSizeMb,
        :storeLogoAutoResize,
        :storeLogoResizeMaxWidth,
        current_timestamp,
        current_timestamp
      )
      on conflict (id) do update
      set
        payment_max_accounts_per_store = excluded.payment_max_accounts_per_store,
        payment_require_slip_for_lao_qr = excluded.payment_require_slip_for_lao_qr,
        updated_at = current_timestamp
    `,
    {
      replacements: {
        id: GLOBAL_CONFIG_ID,
        defaultSessionLimit: DEFAULT_SESSION_LIMIT,
        maxAccountsPerStore,
        requireSlipForLaoQr,
        storeLogoMaxSizeMb: DEFAULT_STORE_LOGO_MAX_SIZE_MB,
        storeLogoAutoResize: DEFAULT_STORE_LOGO_AUTO_RESIZE,
        storeLogoResizeMaxWidth: DEFAULT_STORE_LOGO_RESIZE_MAX_WIDTH,
      },
    },
  );

  return {
    maxAccountsPerStore,
    requireSlipForLaoQr,
  };
}

export async function createSuperadminInPostgres(input: {
  email: string;
  name: string;
  passwordHash: string;
  createdBy: string;
  canCreateStores: boolean;
  maxStores: number | null;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | null;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  return runInTransaction(async (tx) => {
    const userId = randomUUID();
    await execute(
      `
        insert into users (
          id,
          email,
          name,
          password_hash,
          created_by,
          system_role,
          can_create_stores,
          max_stores,
          can_create_branches,
          max_branches_per_store,
          created_at
        )
        values (
          :id,
          :email,
          :name,
          :passwordHash,
          :createdBy,
          'SUPERADMIN',
          :canCreateStores,
          :maxStores,
          :canCreateBranches,
          :maxBranchesPerStore,
          current_timestamp
        )
      `,
      {
        replacements: {
          id: userId,
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          createdBy: input.createdBy,
          canCreateStores: input.canCreateStores,
          maxStores: input.canCreateStores ? input.maxStores : null,
          canCreateBranches: input.canCreateBranches,
          maxBranchesPerStore:
            input.canCreateBranches === false ? null : input.maxBranchesPerStore,
        },
        transaction: tx,
      },
    );

    return {
      userId,
      superadmins: mapSuperadminRows(await listSuperadminRows(tx)),
    };
  });
}

export async function updateSuperadminConfigInPostgres(input: {
  userId: string;
  canCreateStores: boolean;
  maxStores: number | null;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | null;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  await execute(
    `
      update users
      set
        can_create_stores = :canCreateStores,
        max_stores = :maxStores,
        can_create_branches = :canCreateBranches,
        max_branches_per_store = :maxBranchesPerStore
      where id = :userId
    `,
    {
      replacements: {
        userId: input.userId,
        canCreateStores: input.canCreateStores,
        maxStores: input.canCreateStores ? input.maxStores : null,
        canCreateBranches: input.canCreateBranches,
        maxBranchesPerStore:
          input.canCreateBranches === false ? null : input.maxBranchesPerStore,
      },
    },
  );

  return true;
}

export async function updateSystemAdminUserConfigInPostgres(input: {
  userId: string;
  name?: string;
  systemRole?: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
  canCreateStores?: boolean | null;
  maxStores?: number | null;
  canCreateBranches?: boolean | null;
  maxBranchesPerStore?: number | null;
  sessionLimit?: number | null;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  const assignments: string[] = [];
  const replacements: Record<string, unknown> = { userId: input.userId };

  const setIfDefined = (column: string, key: string, value: unknown) => {
    if (value === undefined) {
      return;
    }
    assignments.push(`${column} = :${key}`);
    replacements[key] = value;
  };

  setIfDefined("name", "name", input.name);
  setIfDefined("system_role", "systemRole", input.systemRole);
  setIfDefined("can_create_stores", "canCreateStores", input.canCreateStores);
  setIfDefined("max_stores", "maxStores", input.maxStores);
  setIfDefined("can_create_branches", "canCreateBranches", input.canCreateBranches);
  setIfDefined("max_branches_per_store", "maxBranchesPerStore", input.maxBranchesPerStore);
  setIfDefined("session_limit", "sessionLimit", input.sessionLimit);

  if (assignments.length === 0) {
    return true;
  }

  await execute(
    `
      update users
      set ${assignments.join(", ")}
      where id = :userId
    `,
    { replacements },
  );

  return true;
}

export async function updateSystemAdminStoreConfigInPostgres(input: {
  storeId: string;
  name?: string;
  storeType?: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
  currency?: string;
  vatEnabled?: boolean;
  vatRate?: number;
  maxBranchesOverride?: number | null;
}) {
  if (!isPostgresSettingsSystemAdminWriteEnabled()) {
    return undefined;
  }

  const assignments: string[] = [];
  const replacements: Record<string, unknown> = { storeId: input.storeId };

  const setIfDefined = (column: string, key: string, value: unknown) => {
    if (value === undefined) {
      return;
    }
    assignments.push(`${column} = :${key}`);
    replacements[key] = value;
  };

  setIfDefined("name", "name", input.name);
  setIfDefined("store_type", "storeType", input.storeType);
  setIfDefined("currency", "currency", input.currency);
  setIfDefined("vat_enabled", "vatEnabled", input.vatEnabled);
  setIfDefined("vat_rate", "vatRate", input.vatRate);
  setIfDefined("max_branches_override", "maxBranchesOverride", input.maxBranchesOverride);

  if (assignments.length === 0) {
    return true;
  }

  await execute(
    `
      update stores
      set ${assignments.join(", ")}
      where id = :storeId
    `,
    { replacements },
  );

  return true;
}
