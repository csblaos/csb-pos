import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { timeDb } from "@/server/perf/perf";
import { orders } from "@/lib/db/schema";
import { getLowStockProducts, type LowStockItem } from "@/lib/inventory/queries";

const paidStatuses = ["PAID", "PACKED", "SHIPPED"] as const;

export async function getTodaySales(storeId: string) {
  const [row] = await timeDb("dashboard.repo.todaySales", async () =>
    db
      .select({
        value: sql<number>`coalesce(sum(${orders.total}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          inArray(orders.status, paidStatuses),
          sql`date(${orders.paidAt}) = date('now', 'localtime')`,
        ),
      ),
  );

  return Number(row?.value ?? 0);
}

export async function getOrdersCountToday(storeId: string) {
  const [row] = await timeDb("dashboard.repo.ordersCountToday", async () =>
    db
      .select({
        value: sql<number>`count(*)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          sql`date(${orders.createdAt}) = date('now', 'localtime')`,
        ),
      ),
  );

  return Number(row?.value ?? 0);
}

export async function getPendingPaymentCount(storeId: string) {
  const [row] = await timeDb("dashboard.repo.pendingPaymentCount", async () =>
    db
      .select({
        value: sql<number>`count(*)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.status, "PENDING_PAYMENT"))),
  );

  return Number(row?.value ?? 0);
}

export async function getLowStockItemsByStore(
  storeId: string,
  thresholdBase: number,
): Promise<LowStockItem[]> {
  return timeDb("dashboard.repo.lowStockItems", async () =>
    getLowStockProducts(storeId, thresholdBase),
  );
}
