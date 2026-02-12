import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";

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
  const [userRow, membershipRow] = await Promise.all([
    db
      .select({
        systemRole: users.systemRole,
        canCreateStores: users.canCreateStores,
        maxStores: users.maxStores,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        membershipCount: sql<number>`count(*)`,
        activeOwnerStoreCount: sql<number>`
          coalesce(sum(case
            when ${storeMembers.status} = 'ACTIVE' and ${roles.name} = 'Owner' then 1
            else 0
          end), 0)
        `,
      })
      .from(storeMembers)
      .innerJoin(roles, eq(storeMembers.roleId, roles.id))
      .where(eq(storeMembers.userId, userId)),
  ]);

  return {
    systemRole: userRow[0]?.systemRole ?? "USER",
    canCreateStores:
      typeof userRow[0]?.canCreateStores === "boolean"
        ? userRow[0].canCreateStores
        : null,
    maxStores:
      typeof userRow[0]?.maxStores === "number" && userRow[0].maxStores > 0
        ? userRow[0].maxStores
        : null,
    hasAnyMembership: Number(membershipRow[0]?.membershipCount ?? 0) > 0,
    activeOwnerStoreCount: Number(membershipRow[0]?.activeOwnerStoreCount ?? 0),
  };
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
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(storeMembers)
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .where(
      and(
        eq(storeMembers.userId, userId),
        eq(storeMembers.status, "ACTIVE"),
        eq(roles.name, "Owner"),
      ),
    );

  return Number(row?.count ?? 0);
}
