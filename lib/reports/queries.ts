import { and, eq, inArray, sql } from "drizzle-orm";

import { redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { db } from "@/lib/db/client";
import { orderItems, orders, products } from "@/lib/db/schema";
import { getLowStockProducts, getStoreStockThresholds } from "@/lib/inventory/queries";
import { timeAsync, timeDbQuery } from "@/lib/perf/server";

const paidStatuses = ["PAID", "PACKED", "SHIPPED"] as const;

export type DashboardMetrics = {
  todaySales: number;
  ordersCountToday: number;
  pendingPaymentCount: number;
  lowStockCount: number;
};

export type SalesSummary = {
  salesToday: number;
  salesThisMonth: number;
};

export type TopProductRow = {
  productId: string;
  sku: string;
  name: string;
  qtyBaseSold: number;
  revenue: number;
  cogs: number;
};

export type SalesByChannelRow = {
  channel: "WALK_IN" | "FACEBOOK" | "WHATSAPP";
  orderCount: number;
  salesTotal: number;
};

export type GrossProfitSummary = {
  revenue: number;
  cogs: number;
  shippingCost: number;
  grossProfit: number;
};

const DASHBOARD_METRICS_TTL_SECONDS = 20;

function dashboardMetricsCacheKey(storeId: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return `reports:dashboard_metrics:${storeId}:${dayKey}`;
}

async function fetchDashboardMetrics(storeId: string): Promise<DashboardMetrics> {
  const [todaySalesRow, ordersCountRow, pendingRow, lowStockRows] = await Promise.all([
    timeDbQuery("reports.dashboard.todaySales", async () =>
      db
        .select({
          value: sql<number>`coalesce(sum(${orders.total}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.status, paidStatuses),
            sql`${orders.paidAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
            sql`${orders.paidAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
          ),
        ),
    ),
    timeDbQuery("reports.dashboard.ordersCount", async () =>
      db
        .select({
          value: sql<number>`count(*)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            sql`${orders.createdAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
            sql`${orders.createdAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
          ),
        ),
    ),
    timeDbQuery("reports.dashboard.pendingPayment", async () =>
      db
        .select({
          value: sql<number>`count(*)`,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.status, "PENDING_PAYMENT"))),
    ),
    getStoreStockThresholds(storeId).then((thresholds) =>
      getLowStockProducts(storeId, thresholds),
    ),
  ]);

  return {
    todaySales: Number(todaySalesRow[0]?.value ?? 0),
    ordersCountToday: Number(ordersCountRow[0]?.value ?? 0),
    pendingPaymentCount: Number(pendingRow[0]?.value ?? 0),
    lowStockCount: lowStockRows.length,
  };
}

export async function getDashboardMetrics(storeId: string): Promise<DashboardMetrics> {
  return timeAsync("reports.dashboard.metrics.total", async () => {
    const cacheKey = dashboardMetricsCacheKey(storeId);
    const cached = await redisGetJson<DashboardMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    const metrics = await fetchDashboardMetrics(storeId);
    await redisSetJson(cacheKey, metrics, DASHBOARD_METRICS_TTL_SECONDS);
    return metrics;
  });
}

export async function getSalesSummary(storeId: string): Promise<SalesSummary> {
  const [todayRow, monthRow] = await Promise.all([
    timeDbQuery("reports.salesSummary.today", async () =>
      db
        .select({
          value: sql<number>`coalesce(sum(${orders.total}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.status, paidStatuses),
            sql`${orders.paidAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
            sql`${orders.paidAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
          ),
        ),
    ),
    timeDbQuery("reports.salesSummary.month", async () =>
      db
        .select({
          value: sql<number>`coalesce(sum(${orders.total}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.status, paidStatuses),
            sql`${orders.paidAt} >= datetime('now', 'localtime', 'start of month', 'utc')`,
            sql`${orders.paidAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
          ),
        ),
    ),
  ]);

  return {
    salesToday: Number(todayRow[0]?.value ?? 0),
    salesThisMonth: Number(monthRow[0]?.value ?? 0),
  };
}

export async function getTopProducts(
  storeId: string,
  limit = 10,
): Promise<TopProductRow[]> {
  const rows = await timeDbQuery("reports.topProducts", async () =>
    db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        qtyBaseSold: sql<number>`coalesce(sum(${orderItems.qtyBase}), 0)`,
        revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`,
        cogs: sql<number>`coalesce(sum(${orderItems.qtyBase} * ${orderItems.costBaseAtSale}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses)))
      .groupBy(products.id, products.sku, products.name)
      .orderBy(sql`sum(${orderItems.lineTotal}) desc`)
      .limit(limit),
  );

  return rows.map((row) => ({
    ...row,
    qtyBaseSold: Number(row.qtyBaseSold ?? 0),
    revenue: Number(row.revenue ?? 0),
    cogs: Number(row.cogs ?? 0),
  }));
}

export async function getSalesByChannel(storeId: string): Promise<SalesByChannelRow[]> {
  const rows = await timeDbQuery("reports.salesByChannel", async () =>
    db
      .select({
        channel: orders.channel,
        orderCount: sql<number>`count(*)`,
        salesTotal: sql<number>`coalesce(sum(${orders.total}), 0)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses)))
      .groupBy(orders.channel)
      .orderBy(sql`sum(${orders.total}) desc`),
  );

  return rows.map((row) => ({
    channel: row.channel,
    orderCount: Number(row.orderCount ?? 0),
    salesTotal: Number(row.salesTotal ?? 0),
  }));
}

export async function getGrossProfitSummary(
  storeId: string,
): Promise<GrossProfitSummary> {
  const [revenueRows, cogsRows, shippingRows] = await Promise.all([
    timeDbQuery("reports.grossProfit.revenue", async () =>
      db
        .select({ value: sql<number>`coalesce(sum(${orders.total}), 0)` })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses))),
    ),
    timeDbQuery("reports.grossProfit.cogs", async () =>
      db
        .select({
          value: sql<number>`coalesce(sum(${orderItems.qtyBase} * ${orderItems.costBaseAtSale}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses))),
    ),
    timeDbQuery("reports.grossProfit.shipping", async () =>
      db
        .select({ value: sql<number>`coalesce(sum(${orders.shippingCost}), 0)` })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses))),
    ),
  ]);

  const revenue = Number(revenueRows[0]?.value ?? 0);
  const cogs = Number(cogsRows[0]?.value ?? 0);
  const shippingCost = Number(shippingRows[0]?.value ?? 0);

  return {
    revenue,
    cogs,
    shippingCost,
    grossProfit: revenue - cogs - shippingCost,
  };
}
