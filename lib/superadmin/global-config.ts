import "server-only";

import { getSuperadminGlobalConfigOverviewFromPostgres } from "@/lib/platform/postgres-settings-admin";

export async function getSuperadminGlobalConfigOverview(storeIds: string[]) {
  return (await getSuperadminGlobalConfigOverviewFromPostgres(storeIds)) ?? {
    storeOverrideCount: 0,
    superadminOverrideCount: 0,
    storeOverrideRows: [],
    superadminOverrideRows: [],
  };
}
