import "server-only";
import { listSuperadminsFromPostgres } from "@/lib/platform/postgres-settings-admin";

export type SuperadminItem = {
  userId: string;
  email: string;
  name: string;
  canCreateStores: boolean;
  maxStores: number | null;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | null;
  activeOwnerStoreCount: number;
  createdAt: string;
};

export async function listSuperadmins(): Promise<SuperadminItem[]> {
  const postgresRows = await listSuperadminsFromPostgres();
  if (postgresRows) {
    return postgresRows;
  }
  throw new Error("POSTGRES_SETTINGS_SYSTEM_ADMIN_READ_ENABLED is required for superadmin list");
}
