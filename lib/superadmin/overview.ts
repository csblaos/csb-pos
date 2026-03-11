import "server-only";

import { getSuperadminOverviewMetricsFromPostgres } from "@/lib/platform/postgres-settings-admin";

export async function getSuperadminOverviewMetrics(storeIds: string[]) {
  return (await getSuperadminOverviewMetricsFromPostgres(storeIds)) ?? {
    branchRows: [],
    memberRows: [],
    todaySales: 0,
    todayOrders: 0,
    connectedFbStoreIds: [],
    connectedWaStoreIds: [],
  };
}
