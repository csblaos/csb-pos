import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import { isPostgresConfigured } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";

const DEFAULT_GLOBAL_BRANCH_MAX = 1;

type GlobalBranchPolicyRow = {
  defaultCanCreateBranches: boolean | null;
  defaultMaxBranchesPerStore: number | string | null;
};

type BranchPolicyUserRow = {
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN" | null;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | string | null;
};

type BranchPolicyStoreRow = {
  id: string;
  maxBranchesOverride: number | string | null;
};

type CountRow = {
  count: number | string | null;
};

export type PostgresStoreBranchRow = {
  id: string;
  storeId: string;
  name: string;
  code: string | null;
  address: string | null;
  sourceBranchId: string | null;
  sharingMode: string | null;
  sharingConfig: string | null;
  createdAt: string;
};

type BranchAccessRow = {
  branchId: string;
};

export type PostgresBranchCreationPolicyInputs = {
  globalPolicy: {
    defaultCanCreateBranches: boolean;
    defaultMaxBranchesPerStore: number | null;
  };
  user: {
    systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
    canCreateBranches: boolean | null;
    maxBranchesPerStore: number | null;
  } | null;
  store: {
    id: string;
    maxBranchesOverride: number | null;
  } | null;
  isStoreOwner: boolean;
  currentBranchCount: number;
};

export type ReplaceMemberBranchAccessInput = {
  userId: string;
  storeId: string;
  mode: "ALL" | "SELECTED";
  branchIds: string[];
};

const isPostgresBranchesEnabled = () =>
  process.env.POSTGRES_BRANCHES_ENABLED === "1" && isPostgresConfigured();

export const logBranchesFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[branches.pg] fallback to turso for ${operation}: ${message}`);
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

export async function getGlobalBranchPolicyFromPostgres() {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  const row = await queryOne<GlobalBranchPolicyRow>(
    `
      select
        default_can_create_branches as "defaultCanCreateBranches",
        default_max_branches_per_store as "defaultMaxBranchesPerStore"
      from system_config
      where id = 'global'
      limit 1
    `,
  );

  if (!row) {
    return {
      defaultCanCreateBranches: true,
      defaultMaxBranchesPerStore: DEFAULT_GLOBAL_BRANCH_MAX,
    };
  }

  return {
    defaultCanCreateBranches:
      typeof row.defaultCanCreateBranches === "boolean"
        ? row.defaultCanCreateBranches
        : true,
    defaultMaxBranchesPerStore:
      row.defaultMaxBranchesPerStore === null
        ? null
        : toNonNegativeIntOrNull(row.defaultMaxBranchesPerStore) ?? DEFAULT_GLOBAL_BRANCH_MAX,
  };
}

export async function upsertGlobalBranchPolicyInPostgres(input: {
  defaultCanCreateBranches: boolean;
  defaultMaxBranchesPerStore: number | null;
}) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  await execute(
    `
      insert into system_config (
        id,
        default_can_create_branches,
        default_max_branches_per_store,
        created_at,
        updated_at
      )
      values (
        'global',
        :defaultCanCreateBranches,
        :defaultMaxBranchesPerStore,
        current_timestamp,
        current_timestamp
      )
      on conflict (id) do update
      set
        default_can_create_branches = excluded.default_can_create_branches,
        default_max_branches_per_store = excluded.default_max_branches_per_store,
        updated_at = current_timestamp
    `,
    {
      replacements: {
        defaultCanCreateBranches: input.defaultCanCreateBranches,
        defaultMaxBranchesPerStore: input.defaultMaxBranchesPerStore,
      },
    },
  );

  return true;
}

export async function loadBranchCreationPolicyInputsFromPostgres(
  userId: string,
  storeId: string,
): Promise<PostgresBranchCreationPolicyInputs | undefined> {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  const [globalPolicy, userRow, storeRow, ownerRow, branchCountRow] = await Promise.all([
    getGlobalBranchPolicyFromPostgres(),
    queryOne<BranchPolicyUserRow>(
      `
        select
          system_role as "systemRole",
          can_create_branches as "canCreateBranches",
          max_branches_per_store as "maxBranchesPerStore"
        from users
        where id = :userId
        limit 1
      `,
      {
        replacements: { userId },
      },
    ),
    queryOne<BranchPolicyStoreRow>(
      `
        select
          id,
          max_branches_override as "maxBranchesOverride"
        from stores
        where id = :storeId
        limit 1
      `,
      {
        replacements: { storeId },
      },
    ),
    queryOne<CountRow>(
      `
        select count(*)::int as "count"
        from store_members sm
        inner join roles r on sm.role_id = r.id
        where
          sm.user_id = :userId
          and sm.store_id = :storeId
          and sm.status = 'ACTIVE'
          and r.name = 'Owner'
      `,
      {
        replacements: { userId, storeId },
      },
    ),
    queryOne<CountRow>(
      `
        select count(*)::int as "count"
        from store_branches
        where store_id = :storeId
      `,
      {
        replacements: { storeId },
      },
    ),
  ]);

  return {
    globalPolicy:
      globalPolicy ?? {
        defaultCanCreateBranches: true,
        defaultMaxBranchesPerStore: DEFAULT_GLOBAL_BRANCH_MAX,
      },
    user: userRow
      ? {
          systemRole:
            userRow.systemRole === "SUPERADMIN" ||
            userRow.systemRole === "SYSTEM_ADMIN" ||
            userRow.systemRole === "USER"
              ? userRow.systemRole
              : "USER",
          canCreateBranches:
            typeof userRow.canCreateBranches === "boolean" ? userRow.canCreateBranches : null,
          maxBranchesPerStore: toNonNegativeIntOrNull(userRow.maxBranchesPerStore),
        }
      : null,
    store: storeRow
      ? {
          id: storeRow.id,
          maxBranchesOverride: toNonNegativeIntOrNull(storeRow.maxBranchesOverride),
        }
      : null,
    isStoreOwner: Number(ownerRow?.count ?? 0) > 0,
    currentBranchCount: Number(branchCountRow?.count ?? 0),
  };
}

export async function getBranchByIdFromPostgres(storeId: string, branchId: string) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  return queryOne<PostgresStoreBranchRow>(
    `
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
      where store_id = :storeId and id = :branchId
      limit 1
    `,
    {
      replacements: { storeId, branchId },
    },
  );
}

export async function getBranchByNameFromPostgres(storeId: string, name: string) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  return queryOne<{ id: string }>(
    `
      select id
      from store_branches
      where store_id = :storeId and name = :name
      limit 1
    `,
    {
      replacements: { storeId, name },
    },
  );
}

export async function getBranchByCodeFromPostgres(storeId: string, code: string) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  return queryOne<{ id: string }>(
    `
      select id
      from store_branches
      where store_id = :storeId and code = :code
      limit 1
    `,
    {
      replacements: { storeId, code },
    },
  );
}

export async function listBranchesByStoreFromPostgres(storeId: string) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  return queryMany<PostgresStoreBranchRow>(
    `
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
      where store_id = :storeId
      order by created_at asc, name asc
    `,
    {
      replacements: { storeId },
    },
  );
}

export async function ensureMainBranchExistsInPostgres(storeId: string) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  const existing = await getBranchByCodeFromPostgres(storeId, "MAIN");
  if (existing) {
    return getBranchByIdFromPostgres(storeId, existing.id);
  }

  await execute(
    `
      insert into store_branches (
        id,
        store_id,
        name,
        code,
        address,
        source_branch_id,
        sharing_mode,
        sharing_config,
        created_at
      )
      values (
        :branchId,
        :storeId,
        'สาขาหลัก',
        'MAIN',
        null,
        null,
        'MAIN',
        null,
        current_timestamp
      )
      on conflict do nothing
    `,
    {
      replacements: {
        branchId: randomUUID(),
        storeId,
      },
    },
  );

  const created = await getBranchByCodeFromPostgres(storeId, "MAIN");
  if (!created) {
    throw new Error("ไม่สามารถสร้างสาขาหลักได้");
  }

  return getBranchByIdFromPostgres(storeId, created.id);
}

export async function createBranchInPostgres(input: {
  storeId: string;
  name: string;
  code: string | null;
  address: string | null;
  sourceBranchId: string | null;
  sharingMode: "BALANCED" | "FULL_SYNC" | "INDEPENDENT";
  sharingConfig: string;
}) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  const branchId = randomUUID();
  await execute(
    `
      insert into store_branches (
        id,
        store_id,
        name,
        code,
        address,
        source_branch_id,
        sharing_mode,
        sharing_config,
        created_at
      )
      values (
        :branchId,
        :storeId,
        :name,
        :code,
        :address,
        :sourceBranchId,
        :sharingMode,
        :sharingConfig,
        current_timestamp
      )
    `,
    {
      replacements: {
        branchId,
        ...input,
      },
    },
  );

  return branchId;
}

export async function getMemberBranchAccessFromPostgres(userId: string, storeId: string) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  const rows = await queryMany<BranchAccessRow>(
    `
      select branch_id as "branchId"
      from store_member_branches
      where store_id = :storeId and user_id = :userId
      order by branch_id asc
    `,
    {
      replacements: { userId, storeId },
    },
  );

  const branchIds = rows.map((row) => row.branchId);
  if (branchIds.length === 0) {
    return { mode: "ALL" as const, branchIds: [] };
  }

  return { mode: "SELECTED" as const, branchIds };
}

export async function replaceMemberBranchAccessInPostgres(
  params: ReplaceMemberBranchAccessInput,
) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  return runInTransaction(async (tx) => {
    if (params.mode === "ALL") {
      await execute(
        `
          delete from store_member_branches
          where store_id = :storeId and user_id = :userId
        `,
        {
          replacements: {
            storeId: params.storeId,
            userId: params.userId,
          },
          transaction: tx,
        },
      );
      return true as const;
    }

    const dedupedBranchIds = [...new Set(params.branchIds.map((id) => id.trim()).filter(Boolean))];
    if (dedupedBranchIds.length === 0) {
      throw new Error("REQUIRE_BRANCH_SELECTION");
    }

    const branchRows = await queryMany<{ id: string }>(
      `
        select id
        from store_branches
        where store_id = :storeId and id in (:branchIds)
      `,
      {
        replacements: {
          storeId: params.storeId,
          branchIds: dedupedBranchIds,
        },
        transaction: tx,
      },
    );

    if (branchRows.length !== dedupedBranchIds.length) {
      throw new Error("INVALID_BRANCH_SELECTION");
    }

    await execute(
      `
        delete from store_member_branches
        where store_id = :storeId and user_id = :userId
      `,
      {
        replacements: {
          storeId: params.storeId,
          userId: params.userId,
        },
        transaction: tx,
      },
    );

    const replacements: Record<string, unknown> = {
      storeId: params.storeId,
      userId: params.userId,
    };
    const valuesSql = dedupedBranchIds
      .map((branchId, index) => {
        const key = `branchId${index}`;
        replacements[key] = branchId;
        return `(:storeId, :userId, :${key}, current_timestamp)`;
      })
      .join(", ");

    await execute(
      `
        insert into store_member_branches (
          store_id,
          user_id,
          branch_id,
          created_at
        )
        values ${valuesSql}
      `,
      {
        replacements,
        transaction: tx,
      },
    );

    return true as const;
  });
}

export async function canMemberAccessBranchInPostgres(
  userId: string,
  storeId: string,
  branchId: string,
) {
  if (!isPostgresBranchesEnabled()) {
    return undefined;
  }

  const [targetBranch, access] = await Promise.all([
    getBranchByIdFromPostgres(storeId, branchId),
    getMemberBranchAccessFromPostgres(userId, storeId),
  ]);

  if (!targetBranch) {
    return false;
  }

  if (!access || access.mode === "ALL") {
    return true;
  }

  return access.branchIds.includes(branchId);
}
