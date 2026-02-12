import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { roles, storeBranches, storeMembers, stores, systemConfig, users } from "@/lib/db/schema";

export const GLOBAL_BRANCH_CONFIG_ID = "global";
const DEFAULT_GLOBAL_BRANCH_MAX = 1;

export type BranchLimitSource =
  | "STORE_OVERRIDE"
  | "SUPERADMIN_OVERRIDE"
  | "GLOBAL_DEFAULT"
  | "UNLIMITED";

export type GlobalBranchPolicy = {
  defaultCanCreateBranches: boolean;
  defaultMaxBranchesPerStore: number | null;
};

export type BranchCreationPolicy = {
  storeExists: boolean;
  isSuperadmin: boolean;
  isStoreOwner: boolean;
  currentBranchCount: number;
  globalDefaultCanCreateBranches: boolean;
  globalDefaultMaxBranchesPerStore: number | null;
  superadminCanCreateBranchesOverride: boolean | null;
  superadminMaxBranchesPerStoreOverride: number | null;
  storeMaxBranchesOverride: number | null;
  effectiveCanCreateBranches: boolean;
  effectiveMaxBranchesPerStore: number | null;
  effectiveLimitSource: BranchLimitSource;
};

export type BranchCreationAccess = {
  allowed: boolean;
  reason?: string;
};

const toNonNegativeIntOrNull = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
};

const toBooleanOrNull = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
};

const resolveMaxBranchesPerStore = (params: {
  storeMaxBranchesOverride: number | null;
  superadminMaxBranchesPerStoreOverride: number | null;
  globalDefaultMaxBranchesPerStore: number | null;
}) => {
  if (params.storeMaxBranchesOverride !== null) {
    return {
      effectiveMaxBranchesPerStore: params.storeMaxBranchesOverride,
      effectiveLimitSource: "STORE_OVERRIDE" as const,
    };
  }

  if (params.superadminMaxBranchesPerStoreOverride !== null) {
    return {
      effectiveMaxBranchesPerStore: params.superadminMaxBranchesPerStoreOverride,
      effectiveLimitSource: "SUPERADMIN_OVERRIDE" as const,
    };
  }

  if (params.globalDefaultMaxBranchesPerStore !== null) {
    return {
      effectiveMaxBranchesPerStore: params.globalDefaultMaxBranchesPerStore,
      effectiveLimitSource: "GLOBAL_DEFAULT" as const,
    };
  }

  return {
    effectiveMaxBranchesPerStore: null,
    effectiveLimitSource: "UNLIMITED" as const,
  };
};

export async function getGlobalBranchPolicy(): Promise<GlobalBranchPolicy> {
  const [row] = await db
    .select({
      defaultCanCreateBranches: systemConfig.defaultCanCreateBranches,
      defaultMaxBranchesPerStore: systemConfig.defaultMaxBranchesPerStore,
    })
    .from(systemConfig)
    .where(eq(systemConfig.id, GLOBAL_BRANCH_CONFIG_ID))
    .limit(1);

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

export async function upsertGlobalBranchPolicy(input: GlobalBranchPolicy) {
  const defaultCanCreateBranches = input.defaultCanCreateBranches;
  const defaultMaxBranchesPerStore = toNonNegativeIntOrNull(input.defaultMaxBranchesPerStore);

  await db
    .insert(systemConfig)
    .values({
      id: GLOBAL_BRANCH_CONFIG_ID,
      defaultCanCreateBranches,
      defaultMaxBranchesPerStore,
      updatedAt: sql`(CURRENT_TIMESTAMP)`,
    })
    .onConflictDoUpdate({
      target: systemConfig.id,
      set: {
        defaultCanCreateBranches,
        defaultMaxBranchesPerStore,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    });
}

export async function getBranchCreationPolicy(
  userId: string,
  storeId: string,
): Promise<BranchCreationPolicy> {
  const [globalPolicy, userRows, storeRows, ownerRows, branchCountRows] = await Promise.all([
    getGlobalBranchPolicy(),
    db
      .select({
        systemRole: users.systemRole,
        canCreateBranches: users.canCreateBranches,
        maxBranchesPerStore: users.maxBranchesPerStore,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        id: stores.id,
        maxBranchesOverride: stores.maxBranchesOverride,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)` })
      .from(storeMembers)
      .innerJoin(roles, eq(storeMembers.roleId, roles.id))
      .where(
        and(
          eq(storeMembers.userId, userId),
          eq(storeMembers.storeId, storeId),
          eq(storeMembers.status, "ACTIVE"),
          eq(roles.name, "Owner"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(storeBranches)
      .where(eq(storeBranches.storeId, storeId)),
  ]);

  const userRow = userRows[0];
  const storeRow = storeRows[0];
  const isSuperadmin = userRow?.systemRole === "SUPERADMIN";
  const isStoreOwner = Number(ownerRows[0]?.count ?? 0) > 0;

  const superadminCanCreateBranchesOverride = toBooleanOrNull(userRow?.canCreateBranches);
  const superadminMaxBranchesPerStoreOverride = toNonNegativeIntOrNull(
    userRow?.maxBranchesPerStore,
  );
  const storeMaxBranchesOverride = toNonNegativeIntOrNull(storeRow?.maxBranchesOverride);

  const effectiveCanCreateBranches =
    superadminCanCreateBranchesOverride ?? globalPolicy.defaultCanCreateBranches;

  const { effectiveMaxBranchesPerStore, effectiveLimitSource } = resolveMaxBranchesPerStore({
    storeMaxBranchesOverride,
    superadminMaxBranchesPerStoreOverride,
    globalDefaultMaxBranchesPerStore: globalPolicy.defaultMaxBranchesPerStore,
  });

  return {
    storeExists: Boolean(storeRow),
    isSuperadmin,
    isStoreOwner,
    currentBranchCount: Number(branchCountRows[0]?.count ?? 0),
    globalDefaultCanCreateBranches: globalPolicy.defaultCanCreateBranches,
    globalDefaultMaxBranchesPerStore: globalPolicy.defaultMaxBranchesPerStore,
    superadminCanCreateBranchesOverride,
    superadminMaxBranchesPerStoreOverride,
    storeMaxBranchesOverride,
    effectiveCanCreateBranches,
    effectiveMaxBranchesPerStore,
    effectiveLimitSource,
  };
}

export function evaluateBranchCreationAccess(policy: BranchCreationPolicy): BranchCreationAccess {
  if (!policy.storeExists) {
    return {
      allowed: false,
      reason: "ไม่พบร้านค้า",
    };
  }

  if (!policy.isSuperadmin) {
    return {
      allowed: false,
      reason: "เฉพาะบัญชี SUPERADMIN เท่านั้นที่สร้างสาขาได้",
    };
  }

  if (!policy.isStoreOwner) {
    return {
      allowed: false,
      reason: "ต้องเป็น Owner ของร้านก่อนจึงจะสร้างสาขาได้",
    };
  }

  if (!policy.effectiveCanCreateBranches) {
    return {
      allowed: false,
      reason: "บัญชีนี้ยังไม่ได้รับสิทธิ์สร้างสาขา",
    };
  }

  if (
    policy.effectiveMaxBranchesPerStore !== null &&
    policy.currentBranchCount >= policy.effectiveMaxBranchesPerStore
  ) {
    return {
      allowed: false,
      reason: `สาขาครบโควตาแล้ว (${policy.effectiveMaxBranchesPerStore} สาขา)`,
    };
  }

  return { allowed: true };
}

export function formatBranchQuotaSummary(policy: BranchCreationPolicy) {
  const sourceLabel =
    policy.effectiveLimitSource === "STORE_OVERRIDE"
      ? "Store Override"
      : policy.effectiveLimitSource === "SUPERADMIN_OVERRIDE"
        ? "Superadmin Override"
        : policy.effectiveLimitSource === "GLOBAL_DEFAULT"
          ? "Global Default"
          : "Unlimited";

  const quotaLabel =
    policy.effectiveMaxBranchesPerStore === null
      ? "ไม่จำกัด"
      : `${policy.currentBranchCount.toLocaleString("th-TH")} / ${policy.effectiveMaxBranchesPerStore.toLocaleString("th-TH")} สาขา`;

  return `${quotaLabel} (${sourceLabel})`;
}

export async function listBranchesByStore(storeId: string) {
  return db
    .select({
      id: storeBranches.id,
      storeId: storeBranches.storeId,
      name: storeBranches.name,
      code: storeBranches.code,
      address: storeBranches.address,
      createdAt: storeBranches.createdAt,
    })
    .from(storeBranches)
    .where(eq(storeBranches.storeId, storeId))
    .orderBy(storeBranches.createdAt, storeBranches.name);
}
