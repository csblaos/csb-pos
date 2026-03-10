import "server-only";

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import { storeMembers, stores, users } from "@/lib/db/schema";
import {
  getSuperadminGlobalConfigOverviewFromPostgres,
  logSettingsSystemAdminReadFallback,
} from "@/lib/platform/postgres-settings-admin";

export async function getSuperadminGlobalConfigOverview(storeIds: string[]) {
  try {
    const postgresOverview = await getSuperadminGlobalConfigOverviewFromPostgres(storeIds);
    if (postgresOverview) {
      return postgresOverview;
    }
  } catch (error) {
    logSettingsSystemAdminReadFallback("settings.superadmin.global-config", error);
  }

  const { db } = await import("@/lib/db/client");
  const [
    storeOverrideCountRows,
    superadminOverrideCountRows,
    storeOverrideRows,
    superadminOverrideRows,
  ] = await Promise.all([
    db
      .select({ value: stores.id })
      .from(stores)
      .where(and(inArray(stores.id, storeIds), isNotNull(stores.maxBranchesOverride))),
    db
      .select({ value: users.id })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(
        and(
          inArray(storeMembers.storeId, storeIds),
          eq(users.systemRole, "SUPERADMIN"),
          or(
            isNotNull(users.canCreateBranches),
            isNotNull(users.maxBranchesPerStore),
            isNotNull(users.sessionLimit),
          ),
        ),
      )
      .groupBy(users.id),
    db
      .select({
        id: stores.id,
        name: stores.name,
        maxBranchesOverride: stores.maxBranchesOverride,
      })
      .from(stores)
      .where(and(inArray(stores.id, storeIds), isNotNull(stores.maxBranchesOverride)))
      .orderBy(stores.name)
      .limit(30),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        canCreateBranches: users.canCreateBranches,
        maxBranchesPerStore: users.maxBranchesPerStore,
        sessionLimit: users.sessionLimit,
      })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(
        and(
          inArray(storeMembers.storeId, storeIds),
          eq(users.systemRole, "SUPERADMIN"),
          or(
            isNotNull(users.canCreateBranches),
            isNotNull(users.maxBranchesPerStore),
            isNotNull(users.sessionLimit),
          ),
        ),
      )
      .groupBy(
        users.id,
        users.name,
        users.email,
        users.canCreateBranches,
        users.maxBranchesPerStore,
        users.sessionLimit,
      )
      .orderBy(users.name)
      .limit(50),
  ]);

  return {
    storeOverrideCount: storeOverrideCountRows.length,
    superadminOverrideCount: superadminOverrideCountRows.length,
    storeOverrideRows,
    superadminOverrideRows,
  };
}
