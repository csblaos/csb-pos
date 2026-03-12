import "server-only";
import { queryOne } from "@/lib/db/query";
import { getStoreCreationPolicyFromPostgres } from "@/lib/platform/postgres-settings-admin";

export type StoreCreationPolicy = {
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
  canCreateStores: boolean | null;
  maxStores: number | null;
  hasAnyMembership: boolean;
  activeOwnerStoreCount: number;
};

export type StoreCreationAccess = {
  allowed: boolean;
  reason?: string;
};

export async function getStoreCreationPolicy(userId: string): Promise<StoreCreationPolicy> {
  const postgresPolicy = await getStoreCreationPolicyFromPostgres(userId);
  if (postgresPolicy) {
    return postgresPolicy;
  }
  throw new Error("PostgreSQL store creation policy is not available");
}

export function evaluateStoreCreationAccess(policy: StoreCreationPolicy): StoreCreationAccess {
  const isSuperadmin = policy.systemRole === "SUPERADMIN";
  if (!isSuperadmin) {
    return {
      allowed: false,
      reason: "เฉพาะบัญชี SUPERADMIN เท่านั้นที่สร้างร้านใหม่ได้",
    };
  }

  if (policy.canCreateStores !== true) {
    return {
      allowed: false,
      reason: "บัญชีนี้ยังไม่ได้รับสิทธิ์สร้างร้านใหม่",
    };
  }

  if (
    typeof policy.maxStores === "number" &&
    policy.maxStores > 0 &&
    policy.activeOwnerStoreCount >= policy.maxStores
  ) {
    return {
      allowed: false,
      reason: `บัญชีนี้สร้างร้านครบโควตาแล้ว (${policy.maxStores} ร้าน)`,
    };
  }

  return { allowed: true };
}

export async function canUserCreateStore(userId: string): Promise<StoreCreationAccess> {
  const policy = await getStoreCreationPolicy(userId);
  return evaluateStoreCreationAccess(policy);
}

export async function countStoresByOwner(userId: string) {
  const row = await queryOne<{ count: number | string | null }>(
    `
      select count(*)::int as "count"
      from store_members sm
      inner join roles r
        on sm.role_id = r.id
       and sm.store_id = r.store_id
      where
        sm.user_id = :userId
        and sm.status = 'ACTIVE'
        and r.name = 'Owner'
    `,
    {
      replacements: { userId },
    },
  );

  return Number(row?.count ?? 0);
}
