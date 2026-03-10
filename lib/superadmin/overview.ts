import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { fbConnections, orders, storeBranches, storeMembers, waConnections } from "@/lib/db/schema";
import {
  getSuperadminOverviewMetricsFromPostgres,
  logSettingsSystemAdminReadFallback,
} from "@/lib/platform/postgres-settings-admin";

const paidStatuses: Array<"PAID" | "PACKED" | "SHIPPED"> = ["PAID", "PACKED", "SHIPPED"];

const toNumber = (value: unknown) => Number(value ?? 0);

export async function getSuperadminOverviewMetrics(storeIds: string[]) {
  try {
    const postgresMetrics = await getSuperadminOverviewMetricsFromPostgres(storeIds);
    if (postgresMetrics) {
      return postgresMetrics;
    }
  } catch (error) {
    logSettingsSystemAdminReadFallback("settings.superadmin.overview", error);
  }

  const { db } = await import("@/lib/db/client");
  const [branchRows, memberRows, todaySalesRows, todayOrdersRows, fbRows, waRows] =
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
        .select({ storeId: fbConnections.storeId })
        .from(fbConnections)
        .where(and(inArray(fbConnections.storeId, storeIds), eq(fbConnections.status, "CONNECTED"))),
      db
        .select({ storeId: waConnections.storeId })
        .from(waConnections)
        .where(and(inArray(waConnections.storeId, storeIds), eq(waConnections.status, "CONNECTED"))),
    ]);

  return {
    branchRows,
    memberRows,
    todaySales: toNumber(todaySalesRows[0]?.value),
    todayOrders: toNumber(todayOrdersRows[0]?.value),
    connectedFbStoreIds: [...new Set(fbRows.map((row) => row.storeId))],
    connectedWaStoreIds: [...new Set(waRows.map((row) => row.storeId))],
  };
}
