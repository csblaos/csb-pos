import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import {
  evaluateStoreCreationAccess,
  getStoreCreationPolicy,
} from "@/lib/auth/store-creation";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import { fbConnections, orders, storeBranches, storeMembers, waConnections } from "@/lib/db/schema";
import {
  getSuperadminHomeSnapshotInputsFromPostgres,
  logSettingsSystemAdminReadFallback,
} from "@/lib/platform/postgres-settings-admin";
import {
  getGlobalPaymentPolicy,
  getGlobalSessionPolicy,
  getGlobalStoreLogoPolicy,
} from "@/lib/system-config/policy";

const paidStatuses: Array<"PAID" | "PACKED" | "SHIPPED"> = ["PAID", "PACKED", "SHIPPED"];

const toNumber = (value: unknown) => Number(value ?? 0);

export type SuperadminHomeSnapshot = {
  storesNeedAttention: number;
  totalInvitedMembers: number;
  totalSuspendedMembers: number;
  channelErrorStoreCount: number;
  totalTodayOrders: number;
  totalTodaySales: number;
  storeCreationAllowed: boolean;
  storeCreationBlockedReason: string | null;
  globalSessionDefault: number;
  globalBranchDefaultCanCreate: boolean;
  globalBranchDefaultMax: number | null;
  globalStoreLogoPolicy: {
    maxSizeMb: number;
    autoResize: boolean;
    resizeMaxWidth: number;
  };
  globalPaymentPolicy: {
    maxAccountsPerStore: number;
    requireSlipForLaoQr: boolean;
  };
};

async function getSuperadminHomeSnapshotUncached(
  userId: string,
  storeIds: string[],
): Promise<SuperadminHomeSnapshot> {
  let postgresInputs:
    | Awaited<ReturnType<typeof getSuperadminHomeSnapshotInputsFromPostgres>>
    | undefined;

  try {
    postgresInputs = await getSuperadminHomeSnapshotInputsFromPostgres(storeIds);
  } catch (error) {
    logSettingsSystemAdminReadFallback("settings.superadmin.home-snapshot", error);
  }

  const fallbackMetricsPromise = async () => {
    const { db } = await import("@/lib/db/client");
    const [branchRows, memberRows, fbErrorRows, waErrorRows, todayOrderRows, todaySalesRows] =
      await Promise.all([
        db
          .select({ storeId: storeBranches.storeId, count: sql<number>`count(*)` })
          .from(storeBranches)
          .where(inArray(storeBranches.storeId, storeIds))
          .groupBy(storeBranches.storeId),
        db
          .select({
            storeId: storeMembers.storeId,
            status: storeMembers.status,
            count: sql<number>`count(*)`,
          })
          .from(storeMembers)
          .where(inArray(storeMembers.storeId, storeIds))
          .groupBy(storeMembers.storeId, storeMembers.status),
        db
          .select({ storeId: fbConnections.storeId })
          .from(fbConnections)
          .where(and(inArray(fbConnections.storeId, storeIds), eq(fbConnections.status, "ERROR"))),
        db
          .select({ storeId: waConnections.storeId })
          .from(waConnections)
          .where(and(inArray(waConnections.storeId, storeIds), eq(waConnections.status, "ERROR"))),
        db
          .select({ value: sql<number>`count(*)` })
          .from(orders)
          .where(
            and(
              inArray(orders.storeId, storeIds),
              sql`${orders.createdAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
              sql`${orders.createdAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
            ),
          ),
        db
          .select({ value: sql<number>`coalesce(sum(${orders.total}), 0)` })
          .from(orders)
          .where(
            and(
              inArray(orders.storeId, storeIds),
              inArray(orders.status, paidStatuses),
              sql`${orders.paidAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
              sql`${orders.paidAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
            ),
          ),
      ]);

    return {
      branchRows,
      memberRows,
      fbErrorStoreIds: [...new Set(fbErrorRows.map((row) => row.storeId))],
      waErrorStoreIds: [...new Set(waErrorRows.map((row) => row.storeId))],
      totalTodayOrders: toNumber(todayOrderRows[0]?.value),
      totalTodaySales: toNumber(todaySalesRows[0]?.value),
    };
  };

  const [
    metrics,
    storePolicy,
    globalBranchPolicy,
    globalSessionPolicy,
    globalPaymentPolicy,
    globalStoreLogoPolicy,
  ] = await Promise.all([
    postgresInputs ? Promise.resolve(postgresInputs) : fallbackMetricsPromise(),
    getStoreCreationPolicy(userId),
    getGlobalBranchPolicy(),
    getGlobalSessionPolicy(),
    getGlobalPaymentPolicy(),
    getGlobalStoreLogoPolicy(),
  ]);

  const branchRows = metrics.branchRows;
  const memberRows = metrics.memberRows;
  const branchCountByStore = new Map(branchRows.map((row) => [row.storeId, toNumber(row.count)]));
  const memberStatusByStore = new Map<
    string,
    { active: number; invited: number; suspended: number }
  >();

  for (const row of memberRows) {
    const summary = memberStatusByStore.get(row.storeId) ?? {
      active: 0,
      invited: 0,
      suspended: 0,
    };
    const nextCount = toNumber(row.count);

    if (row.status === "ACTIVE") {
      summary.active = nextCount;
    } else if (row.status === "INVITED") {
      summary.invited = nextCount;
    } else if (row.status === "SUSPENDED") {
      summary.suspended = nextCount;
    }

    memberStatusByStore.set(row.storeId, summary);
  }
  const channelErrorStoreIds = new Set([
    ...metrics.fbErrorStoreIds,
    ...metrics.waErrorStoreIds,
  ]);

  const storesNeedAttention = storeIds.filter((storeId) => {
    const branchCount = branchCountByStore.get(storeId) ?? 0;
    const memberSummary = memberStatusByStore.get(storeId) ?? {
      active: 0,
      invited: 0,
      suspended: 0,
    };

    return (
      branchCount === 0 ||
      memberSummary.active === 0 ||
      memberSummary.suspended > 0 ||
      channelErrorStoreIds.has(storeId)
    );
  }).length;

  const totalInvitedMembers = [...memberStatusByStore.values()].reduce(
    (sum, row) => sum + row.invited,
    0,
  );
  const totalSuspendedMembers = [...memberStatusByStore.values()].reduce(
    (sum, row) => sum + row.suspended,
    0,
  );

  const storeAccess = evaluateStoreCreationAccess(storePolicy);

  return {
    storesNeedAttention,
    totalInvitedMembers,
    totalSuspendedMembers,
    channelErrorStoreCount: channelErrorStoreIds.size,
    totalTodayOrders: metrics.totalTodayOrders,
    totalTodaySales: metrics.totalTodaySales,
    storeCreationAllowed: storeAccess.allowed,
    storeCreationBlockedReason: storeAccess.reason ?? null,
    globalSessionDefault: globalSessionPolicy.defaultSessionLimit,
    globalBranchDefaultCanCreate: globalBranchPolicy.defaultCanCreateBranches,
    globalBranchDefaultMax: globalBranchPolicy.defaultMaxBranchesPerStore,
    globalStoreLogoPolicy,
    globalPaymentPolicy,
  };
}

const getCachedSuperadminHomeSnapshot = unstable_cache(
  async (userId: string, storeIdsCsv: string) => {
    const storeIds = storeIdsCsv.split(",").filter(Boolean);
    return getSuperadminHomeSnapshotUncached(userId, storeIds);
  },
  ["settings-superadmin-home-snapshot"],
  { revalidate: 20 },
);

export async function getSuperadminHomeSnapshot(userId: string, storeIds: string[]) {
  const normalizedStoreIds = [...storeIds].sort();
  return getCachedSuperadminHomeSnapshot(userId, normalizedStoreIds.join(","));
}
