import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { storeMembers, stores, users } from "@/lib/db/schema";
import {
  getSystemAdminDashboardStatsFromPostgres,
  logSettingsSystemAdminReadFallback,
} from "@/lib/platform/postgres-settings-admin";

export type SystemAdminDashboardStats = {
  totalClients: number;
  totalStores: number;
  totalUsers: number;
  totalActiveMembers: number;
  totalSuspendedMembers: number;
  totalClientsCanCreateStores: number;
  totalUnlimitedClients: number;
};

export async function getSystemAdminDashboardStats(): Promise<SystemAdminDashboardStats> {
  try {
    const postgresStats = await getSystemAdminDashboardStatsFromPostgres();
    if (postgresStats) {
      return postgresStats;
    }
  } catch (error) {
    logSettingsSystemAdminReadFallback("system-admin.dashboard", error);
  }

  const { db } = await import("@/lib/db/client");
  const [
    clientRow,
    storeRow,
    userRow,
    activeMemberRow,
    suspendedMemberRow,
    clientCanCreateRow,
    unlimitedClientRow,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.systemRole, "SUPERADMIN")),
    db.select({ count: sql<number>`count(*)` }).from(stores),
    db.select({ count: sql<number>`count(*)` }).from(users),
    db
      .select({ count: sql<number>`count(*)` })
      .from(storeMembers)
      .where(eq(storeMembers.status, "ACTIVE")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(storeMembers)
      .where(eq(storeMembers.status, "SUSPENDED")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        and(eq(users.systemRole, "SUPERADMIN"), eq(users.canCreateStores, true)),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        and(
          eq(users.systemRole, "SUPERADMIN"),
          eq(users.canCreateStores, true),
          isNull(users.maxStores),
        ),
      ),
  ]);

  return {
    totalClients: Number(clientRow[0]?.count ?? 0),
    totalStores: Number(storeRow[0]?.count ?? 0),
    totalUsers: Number(userRow[0]?.count ?? 0),
    totalActiveMembers: Number(activeMemberRow[0]?.count ?? 0),
    totalSuspendedMembers: Number(suspendedMemberRow[0]?.count ?? 0),
    totalClientsCanCreateStores: Number(clientCanCreateRow[0]?.count ?? 0),
    totalUnlimitedClients: Number(unlimitedClientRow[0]?.count ?? 0),
  };
}
