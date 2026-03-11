import "server-only";
import { getSystemAdminDashboardStatsFromPostgres } from "@/lib/platform/postgres-settings-admin";

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
  const postgresStats = await getSystemAdminDashboardStatsFromPostgres();
  if (postgresStats) {
    return postgresStats;
  }
  throw new Error("POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED is required for system admin dashboard");
}
