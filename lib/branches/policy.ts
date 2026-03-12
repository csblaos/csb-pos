import "server-only";

import {
  getGlobalBranchPolicyFromPostgres,
  listBranchesByStoreFromPostgres,
  loadBranchCreationPolicyInputsFromPostgres,
  upsertGlobalBranchPolicyInPostgres,
} from "@/lib/platform/postgres-branches";

export const GLOBAL_BRANCH_CONFIG_ID = "global";

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
  const postgresPolicy = await getGlobalBranchPolicyFromPostgres();
  if (postgresPolicy === undefined) {
    throw new Error("PostgreSQL branch policy is not available");
  }
  return postgresPolicy;
}

export async function upsertGlobalBranchPolicy(input: GlobalBranchPolicy) {
  const defaultCanCreateBranches = input.defaultCanCreateBranches;
  const defaultMaxBranchesPerStore = toNonNegativeIntOrNull(input.defaultMaxBranchesPerStore);

  const updated = await upsertGlobalBranchPolicyInPostgres({
    defaultCanCreateBranches,
    defaultMaxBranchesPerStore,
  });
  if (updated === undefined) {
    throw new Error("PostgreSQL branch policy update is not available");
  }
}

export async function getBranchCreationPolicy(
  userId: string,
  storeId: string,
): Promise<BranchCreationPolicy> {
  const postgresInputs = await loadBranchCreationPolicyInputsFromPostgres(userId, storeId);
  if (postgresInputs === undefined) {
    throw new Error("PostgreSQL branch creation policy is not available");
  }

  const isSuperadmin = postgresInputs.user?.systemRole === "SUPERADMIN";
  const superadminCanCreateBranchesOverride = toBooleanOrNull(
    postgresInputs.user?.canCreateBranches,
  );
  const superadminMaxBranchesPerStoreOverride = toNonNegativeIntOrNull(
    postgresInputs.user?.maxBranchesPerStore,
  );
  const storeMaxBranchesOverride = toNonNegativeIntOrNull(
    postgresInputs.store?.maxBranchesOverride,
  );

  const effectiveCanCreateBranches =
    superadminCanCreateBranchesOverride ?? postgresInputs.globalPolicy.defaultCanCreateBranches;

  const { effectiveMaxBranchesPerStore, effectiveLimitSource } = resolveMaxBranchesPerStore({
    storeMaxBranchesOverride,
    superadminMaxBranchesPerStoreOverride,
    globalDefaultMaxBranchesPerStore: postgresInputs.globalPolicy.defaultMaxBranchesPerStore,
  });

  return {
    storeExists: Boolean(postgresInputs.store),
    isSuperadmin,
    isStoreOwner: postgresInputs.isStoreOwner,
    currentBranchCount: postgresInputs.currentBranchCount,
    globalDefaultCanCreateBranches: postgresInputs.globalPolicy.defaultCanCreateBranches,
    globalDefaultMaxBranchesPerStore: postgresInputs.globalPolicy.defaultMaxBranchesPerStore,
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
  const postgresBranches = await listBranchesByStoreFromPostgres(storeId);
  if (postgresBranches === undefined) {
    throw new Error("PostgreSQL branch list is not available");
  }
  return postgresBranches;
}
