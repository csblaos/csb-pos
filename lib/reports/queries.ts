import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { db } from "@/lib/db/client";
import {
  orderItems,
  orders,
  products,
  purchaseOrderItems,
  purchaseOrderPayments,
  purchaseOrders,
  stores,
} from "@/lib/db/schema";
import { getLowStockProducts, getStoreStockThresholds } from "@/lib/inventory/queries";
import { timeAsync, timeDbQuery } from "@/lib/perf/server";

const paidStatuses = ["PAID", "PACKED", "SHIPPED"] as const;
const pendingStatuses = [
  "PENDING_PAYMENT",
  "READY_FOR_PICKUP",
  "PICKED_UP_PENDING_PAYMENT",
] as const;

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
  currentCostCogs: number;
  shippingCost: number;
  grossProfit: number;
  currentCostGrossProfit: number;
  grossProfitDeltaVsCurrentCost: number;
};

export type CodByProviderRow = {
  provider: string;
  pendingCount: number;
  pendingAmount: number;
  settledCount: number;
  settledAmount: number;
  returnedCount: number;
  returnedShippingLoss: number;
  returnedCodFee: number;
  netAmount: number;
};

export type CodOverviewSummary = {
  pendingCount: number;
  pendingAmount: number;
  settledTodayCount: number;
  settledTodayAmount: number;
  returnedTodayCount: number;
  returnedTodayShippingLoss: number;
  returnedTodayCodFee: number;
  settledAllCount: number;
  settledAllAmount: number;
  returnedCount: number;
  returnedShippingLoss: number;
  returnedCodFee: number;
  netAmount: number;
  byProvider: CodByProviderRow[];
};

export type PurchaseFxDeltaSummary = {
  pendingRateCount: number;
  pendingRateUnpaidCount: number;
  lockedCount: number;
  changedRateCount: number;
  totalRateDeltaBase: number;
  recentLocks: {
    id: string;
    poNumber: string;
    supplierName: string | null;
    purchaseCurrency: "LAK" | "THB" | "USD";
    exchangeRateInitial: number;
    exchangeRate: number;
    exchangeRateLockedAt: string | null;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  }[];
};

export type PurchaseOutstandingRow = {
  poId: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  dueDate: string | null;
  receivedAt: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  grandTotalBase: number;
  totalPaidBase: number;
  outstandingBase: number;
  ageDays: number;
  fxDeltaBase: number;
  exchangeRateInitial: number;
  exchangeRate: number;
  exchangeRateLockedAt: string | null;
};

export type PurchaseApAgingSummary = {
  totalOutstandingBase: number;
  bucket0To30: {
    count: number;
    amountBase: number;
  };
  bucket31To60: {
    count: number;
    amountBase: number;
  };
  bucket61Plus: {
    count: number;
    amountBase: number;
  };
  suppliers: {
    supplierName: string;
    outstandingBase: number;
    fxDeltaBase: number;
    poCount: number;
  }[];
};

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;

type PostgresReportsReadContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
};

type NumericValue = number | string | null | undefined;

type PurchaseOutstandingPostgresRow = Omit<PurchaseOutstandingRow, "ageDays"> & {
  grandTotalBase: NumericValue;
  totalPaidBase: NumericValue;
  outstandingBase: NumericValue;
  fxDeltaBase: NumericValue;
  exchangeRateInitial: NumericValue;
  exchangeRate: NumericValue;
  ageDays: NumericValue;
};

type ReportDateBounds = {
  todayStartUtc: string;
  tomorrowStartUtc: string;
  monthStartUtc: string;
};

const DASHBOARD_METRICS_TTL_SECONDS = 20;
const REPORTS_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const REPORTS_PAID_STATUS_SQL = "('PAID', 'PACKED', 'SHIPPED')";
const REPORTS_PENDING_STATUS_SQL =
  "('PENDING_PAYMENT', 'READY_FOR_PICKUP', 'PICKED_UP_PENDING_PAYMENT')";

const toNumber = (value: NumericValue) => Number(value ?? 0);

const getReportDateBounds = (): ReportDateBounds => {
  const now = new Date();
  const shifted = new Date(now.getTime() + REPORTS_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const date = shifted.getUTCDate();

  return {
    todayStartUtc: new Date(Date.UTC(year, month, date) - REPORTS_UTC_OFFSET_MS).toISOString(),
    tomorrowStartUtc: new Date(
      Date.UTC(year, month, date + 1) - REPORTS_UTC_OFFSET_MS,
    ).toISOString(),
    monthStartUtc: new Date(Date.UTC(year, month, 1) - REPORTS_UTC_OFFSET_MS).toISOString(),
  };
};

const getPostgresReportsReadContext = async (): Promise<PostgresReportsReadContext | null> => {
  if (process.env.POSTGRES_REPORTS_READ_ENABLED !== "1") {
    return null;
  }

  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    return null;
  }

  return {
    queryMany,
    queryOne,
  };
};

export const logReportsReadFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[reports.read.pg] fallback to turso for ${operation}: ${message}`);
};

function dashboardMetricsCacheKey(storeId: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return `reports:dashboard_metrics:${storeId}:${dayKey}`;
}

export async function getReportStoreCurrency(
  storeId: string,
): Promise<"LAK" | "THB" | "USD"> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const row = await timeDbQuery("reports.store.currency.pg", async () =>
        pg.queryOne<{ currency: "LAK" | "THB" | "USD" | null }>(
          `
            select currency
            from stores
            where id = :storeId
            limit 1
          `,
          {
            replacements: { storeId },
          },
        ),
      );
      return (row?.currency ?? "LAK") as "LAK" | "THB" | "USD";
    } catch (error) {
      logReportsReadFallback("getReportStoreCurrency", error);
    }
  }

  const [storeRow] = await db
    .select({ currency: stores.currency })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  return (storeRow?.currency ?? "LAK") as "LAK" | "THB" | "USD";
}

async function fetchDashboardMetrics(storeId: string): Promise<DashboardMetrics> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const bounds = getReportDateBounds();
      const [todaySalesRow, ordersCountRow, pendingRow, lowStockRows] = await Promise.all([
        timeDbQuery("reports.dashboard.todaySales.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(total), 0) as value
              from orders
              where store_id = :storeId
                and status in ${REPORTS_PAID_STATUS_SQL}
                and paid_at >= :todayStartUtc
                and paid_at < :tomorrowStartUtc
            `,
            {
              replacements: {
                storeId,
                todayStartUtc: bounds.todayStartUtc,
                tomorrowStartUtc: bounds.tomorrowStartUtc,
              },
            },
          ),
        ),
        timeDbQuery("reports.dashboard.ordersCount.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select count(*) as value
              from orders
              where store_id = :storeId
                and created_at >= :todayStartUtc
                and created_at < :tomorrowStartUtc
            `,
            {
              replacements: {
                storeId,
                todayStartUtc: bounds.todayStartUtc,
                tomorrowStartUtc: bounds.tomorrowStartUtc,
              },
            },
          ),
        ),
        timeDbQuery("reports.dashboard.pendingPayment.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select count(*) as value
              from orders
              where store_id = :storeId
                and status in ${REPORTS_PENDING_STATUS_SQL}
            `,
            {
              replacements: { storeId },
            },
          ),
        ),
        getStoreStockThresholds(storeId).then((thresholds) =>
          getLowStockProducts(storeId, thresholds),
        ),
      ]);

      return {
        todaySales: toNumber(todaySalesRow?.value),
        ordersCountToday: toNumber(ordersCountRow?.value),
        pendingPaymentCount: toNumber(pendingRow?.value),
        lowStockCount: lowStockRows.length,
      };
    } catch (error) {
      logReportsReadFallback("fetchDashboardMetrics", error);
    }
  }

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
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, pendingStatuses))),
    ),
    getStoreStockThresholds(storeId).then((thresholds) =>
      getLowStockProducts(storeId, thresholds),
    ),
  ]);

  return {
    todaySales: toNumber(todaySalesRow[0]?.value),
    ordersCountToday: toNumber(ordersCountRow[0]?.value),
    pendingPaymentCount: toNumber(pendingRow[0]?.value),
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
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const bounds = getReportDateBounds();
      const [todayRow, monthRow] = await Promise.all([
        timeDbQuery("reports.salesSummary.today.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(total), 0) as value
              from orders
              where store_id = :storeId
                and status in ${REPORTS_PAID_STATUS_SQL}
                and paid_at >= :todayStartUtc
                and paid_at < :tomorrowStartUtc
            `,
            {
              replacements: {
                storeId,
                todayStartUtc: bounds.todayStartUtc,
                tomorrowStartUtc: bounds.tomorrowStartUtc,
              },
            },
          ),
        ),
        timeDbQuery("reports.salesSummary.month.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(total), 0) as value
              from orders
              where store_id = :storeId
                and status in ${REPORTS_PAID_STATUS_SQL}
                and paid_at >= :monthStartUtc
                and paid_at < :tomorrowStartUtc
            `,
            {
              replacements: {
                storeId,
                monthStartUtc: bounds.monthStartUtc,
                tomorrowStartUtc: bounds.tomorrowStartUtc,
              },
            },
          ),
        ),
      ]);

      return {
        salesToday: toNumber(todayRow?.value),
        salesThisMonth: toNumber(monthRow?.value),
      };
    } catch (error) {
      logReportsReadFallback("getSalesSummary", error);
    }
  }

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
    salesToday: toNumber(todayRow[0]?.value),
    salesThisMonth: toNumber(monthRow[0]?.value),
  };
}

export async function getTopProducts(
  storeId: string,
  limit = 10,
): Promise<TopProductRow[]> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const rows = await timeDbQuery("reports.topProducts.pg", async () =>
        pg.queryMany<TopProductRow & { qtyBaseSold: NumericValue; revenue: NumericValue; cogs: NumericValue }>(
          `
            select
              p.id as "productId",
              p.sku as "sku",
              p.name as "name",
              coalesce(sum(oi.qty_base), 0) as "qtyBaseSold",
              coalesce(sum(oi.line_total), 0) as "revenue",
              coalesce(sum(oi.qty_base * oi.cost_base_at_sale), 0) as "cogs"
            from order_items oi
            inner join orders o on oi.order_id = o.id
            inner join products p on oi.product_id = p.id
            where o.store_id = :storeId
              and o.status in ${REPORTS_PAID_STATUS_SQL}
            group by p.id, p.sku, p.name
            order by coalesce(sum(oi.line_total), 0) desc
            limit :limit
          `,
          {
            replacements: {
              storeId,
              limit,
            },
          },
        ),
      );

      return rows.map((row) => ({
        productId: row.productId,
        sku: row.sku,
        name: row.name,
        qtyBaseSold: toNumber(row.qtyBaseSold),
        revenue: toNumber(row.revenue),
        cogs: toNumber(row.cogs),
      }));
    } catch (error) {
      logReportsReadFallback("getTopProducts", error);
    }
  }

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
    qtyBaseSold: toNumber(row.qtyBaseSold),
    revenue: toNumber(row.revenue),
    cogs: toNumber(row.cogs),
  }));
}

export async function getSalesByChannel(storeId: string): Promise<SalesByChannelRow[]> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const rows = await timeDbQuery("reports.salesByChannel.pg", async () =>
        pg.queryMany<SalesByChannelRow & { orderCount: NumericValue; salesTotal: NumericValue }>(
          `
            select
              channel as "channel",
              count(*) as "orderCount",
              coalesce(sum(total), 0) as "salesTotal"
            from orders
            where store_id = :storeId
              and status in ${REPORTS_PAID_STATUS_SQL}
            group by channel
            order by coalesce(sum(total), 0) desc
          `,
          {
            replacements: { storeId },
          },
        ),
      );

      return rows.map((row) => ({
        channel: row.channel,
        orderCount: toNumber(row.orderCount),
        salesTotal: toNumber(row.salesTotal),
      }));
    } catch (error) {
      logReportsReadFallback("getSalesByChannel", error);
    }
  }

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
    orderCount: toNumber(row.orderCount),
    salesTotal: toNumber(row.salesTotal),
  }));
}

export async function getGrossProfitSummary(
  storeId: string,
): Promise<GrossProfitSummary> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const [revenueRow, cogsRow, currentCostCogsRow, shippingRow] = await Promise.all([
        timeDbQuery("reports.grossProfit.revenue.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(total), 0) as value
              from orders
              where store_id = :storeId
                and status in ${REPORTS_PAID_STATUS_SQL}
            `,
            {
              replacements: { storeId },
            },
          ),
        ),
        timeDbQuery("reports.grossProfit.cogs.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(oi.qty_base * oi.cost_base_at_sale), 0) as value
              from order_items oi
              inner join orders o on oi.order_id = o.id
              where o.store_id = :storeId
                and o.status in ${REPORTS_PAID_STATUS_SQL}
            `,
            {
              replacements: { storeId },
            },
          ),
        ),
        timeDbQuery("reports.grossProfit.currentCostCogs.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(oi.qty_base * p.cost_base), 0) as value
              from order_items oi
              inner join orders o on oi.order_id = o.id
              inner join products p on oi.product_id = p.id
              where o.store_id = :storeId
                and o.status in ${REPORTS_PAID_STATUS_SQL}
            `,
            {
              replacements: { storeId },
            },
          ),
        ),
        timeDbQuery("reports.grossProfit.shipping.pg", async () =>
          pg.queryOne<{ value: NumericValue }>(
            `
              select coalesce(sum(shipping_cost), 0) as value
              from orders
              where store_id = :storeId
                and status in ${REPORTS_PAID_STATUS_SQL}
            `,
            {
              replacements: { storeId },
            },
          ),
        ),
      ]);

      const revenue = toNumber(revenueRow?.value);
      const cogs = toNumber(cogsRow?.value);
      const currentCostCogs = toNumber(currentCostCogsRow?.value);
      const shippingCost = toNumber(shippingRow?.value);
      const grossProfit = revenue - cogs - shippingCost;
      const currentCostGrossProfit = revenue - currentCostCogs - shippingCost;

      return {
        revenue,
        cogs,
        currentCostCogs,
        shippingCost,
        grossProfit,
        currentCostGrossProfit,
        grossProfitDeltaVsCurrentCost: grossProfit - currentCostGrossProfit,
      };
    } catch (error) {
      logReportsReadFallback("getGrossProfitSummary", error);
    }
  }

  const [revenueRows, cogsRows, currentCostCogsRows, shippingRows] = await Promise.all([
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
    timeDbQuery("reports.grossProfit.currentCostCogs", async () =>
      db
        .select({
          value: sql<number>`coalesce(sum(${orderItems.qtyBase} * ${products.costBase}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses))),
    ),
    timeDbQuery("reports.grossProfit.shipping", async () =>
      db
        .select({ value: sql<number>`coalesce(sum(${orders.shippingCost}), 0)` })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, paidStatuses))),
    ),
  ]);

  const revenue = toNumber(revenueRows[0]?.value);
  const cogs = toNumber(cogsRows[0]?.value);
  const currentCostCogs = toNumber(currentCostCogsRows[0]?.value);
  const shippingCost = toNumber(shippingRows[0]?.value);
  const grossProfit = revenue - cogs - shippingCost;
  const currentCostGrossProfit = revenue - currentCostCogs - shippingCost;

  return {
    revenue,
    cogs,
    currentCostCogs,
    shippingCost,
    grossProfit,
    currentCostGrossProfit,
    grossProfitDeltaVsCurrentCost: grossProfit - currentCostGrossProfit,
  };
}

export async function getCodOverviewSummary(
  storeId: string,
): Promise<CodOverviewSummary> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const bounds = getReportDateBounds();
      const [overview, byProviderRows] = await Promise.all([
        timeDbQuery("reports.cod.overview.pg", async () =>
          pg.queryOne<{
            pendingCount: NumericValue;
            pendingAmount: NumericValue;
            settledTodayCount: NumericValue;
            settledTodayAmount: NumericValue;
            returnedTodayCount: NumericValue;
            returnedTodayShippingLoss: NumericValue;
            returnedTodayCodFee: NumericValue;
            settledAllCount: NumericValue;
            settledAllAmount: NumericValue;
            returnedCount: NumericValue;
            returnedShippingLoss: NumericValue;
            returnedCodFee: NumericValue;
          }>(
            `
              select
                coalesce(sum(case
                  when status = 'SHIPPED'
                    and payment_status = 'COD_PENDING_SETTLEMENT'
                  then 1 else 0 end), 0) as "pendingCount",
                coalesce(sum(case
                  when status = 'SHIPPED'
                    and payment_status = 'COD_PENDING_SETTLEMENT'
                  then case when cod_amount > 0 then cod_amount else total end
                  else 0 end), 0) as "pendingAmount",
                coalesce(sum(case
                  when payment_status = 'COD_SETTLED'
                    and cod_settled_at >= :todayStartUtc
                    and cod_settled_at < :tomorrowStartUtc
                  then 1 else 0 end), 0) as "settledTodayCount",
                coalesce(sum(case
                  when payment_status = 'COD_SETTLED'
                    and cod_settled_at >= :todayStartUtc
                    and cod_settled_at < :tomorrowStartUtc
                  then case when cod_amount > 0 then cod_amount else total end
                  else 0 end), 0) as "settledTodayAmount",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                    and cod_returned_at >= :todayStartUtc
                    and cod_returned_at < :tomorrowStartUtc
                  then 1 else 0 end), 0) as "returnedTodayCount",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                    and cod_returned_at >= :todayStartUtc
                    and cod_returned_at < :tomorrowStartUtc
                  then shipping_cost
                  else 0 end), 0) as "returnedTodayShippingLoss",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                    and cod_returned_at >= :todayStartUtc
                    and cod_returned_at < :tomorrowStartUtc
                  then cod_fee
                  else 0 end), 0) as "returnedTodayCodFee",
                coalesce(sum(case
                  when payment_status = 'COD_SETTLED'
                  then 1 else 0 end), 0) as "settledAllCount",
                coalesce(sum(case
                  when payment_status = 'COD_SETTLED'
                  then case when cod_amount > 0 then cod_amount else total end
                  else 0 end), 0) as "settledAllAmount",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                  then 1 else 0 end), 0) as "returnedCount",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                  then shipping_cost
                  else 0 end), 0) as "returnedShippingLoss",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                  then cod_fee
                  else 0 end), 0) as "returnedCodFee"
              from orders
              where store_id = :storeId
                and payment_method = 'COD'
            `,
            {
              replacements: {
                storeId,
                todayStartUtc: bounds.todayStartUtc,
                tomorrowStartUtc: bounds.tomorrowStartUtc,
              },
            },
          ),
        ),
        timeDbQuery("reports.cod.byProvider.pg", async () =>
          pg.queryMany<CodByProviderRow & {
            pendingCount: NumericValue;
            pendingAmount: NumericValue;
            settledCount: NumericValue;
            settledAmount: NumericValue;
            returnedCount: NumericValue;
            returnedShippingLoss: NumericValue;
            returnedCodFee: NumericValue;
          }>(
            `
              select
                coalesce(nullif(trim(shipping_provider), ''), nullif(trim(shipping_carrier), ''), 'ไม่ระบุ') as provider,
                coalesce(sum(case
                  when status = 'SHIPPED'
                    and payment_status = 'COD_PENDING_SETTLEMENT'
                  then 1 else 0 end), 0) as "pendingCount",
                coalesce(sum(case
                  when status = 'SHIPPED'
                    and payment_status = 'COD_PENDING_SETTLEMENT'
                  then case when cod_amount > 0 then cod_amount else total end
                  else 0 end), 0) as "pendingAmount",
                coalesce(sum(case
                  when payment_status = 'COD_SETTLED'
                  then 1 else 0 end), 0) as "settledCount",
                coalesce(sum(case
                  when payment_status = 'COD_SETTLED'
                  then case when cod_amount > 0 then cod_amount else total end
                  else 0 end), 0) as "settledAmount",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                  then 1 else 0 end), 0) as "returnedCount",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                  then shipping_cost
                  else 0 end), 0) as "returnedShippingLoss",
                coalesce(sum(case
                  when status = 'COD_RETURNED'
                  then cod_fee
                  else 0 end), 0) as "returnedCodFee"
              from orders
              where store_id = :storeId
                and payment_method = 'COD'
              group by provider
              order by coalesce(sum(case
                when payment_status = 'COD_SETTLED'
                then case when cod_amount > 0 then cod_amount else total end
                else 0 end), 0) desc
            `,
            {
              replacements: { storeId },
            },
          ),
        ),
      ]);

      const pendingCount = toNumber(overview?.pendingCount);
      const pendingAmount = toNumber(overview?.pendingAmount);
      const settledTodayCount = toNumber(overview?.settledTodayCount);
      const settledTodayAmount = toNumber(overview?.settledTodayAmount);
      const returnedTodayCount = toNumber(overview?.returnedTodayCount);
      const returnedTodayShippingLoss = toNumber(overview?.returnedTodayShippingLoss);
      const returnedTodayCodFee = toNumber(overview?.returnedTodayCodFee);
      const settledAllCount = toNumber(overview?.settledAllCount);
      const settledAllAmount = toNumber(overview?.settledAllAmount);
      const returnedCount = toNumber(overview?.returnedCount);
      const returnedShippingLoss = toNumber(overview?.returnedShippingLoss);
      const returnedCodFee = toNumber(overview?.returnedCodFee);
      const byProvider: CodByProviderRow[] = byProviderRows.map((row) => {
        const settledAmount = toNumber(row.settledAmount);
        const providerReturnedShippingLoss = toNumber(row.returnedShippingLoss);
        const providerReturnedCodFee = toNumber(row.returnedCodFee);
        return {
          provider: row.provider,
          pendingCount: toNumber(row.pendingCount),
          pendingAmount: toNumber(row.pendingAmount),
          settledCount: toNumber(row.settledCount),
          settledAmount,
          returnedCount: toNumber(row.returnedCount),
          returnedShippingLoss: providerReturnedShippingLoss,
          returnedCodFee: providerReturnedCodFee,
          netAmount: settledAmount - providerReturnedShippingLoss,
        };
      });

      return {
        pendingCount,
        pendingAmount,
        settledTodayCount,
        settledTodayAmount,
        returnedTodayCount,
        returnedTodayShippingLoss,
        returnedTodayCodFee,
        settledAllCount,
        settledAllAmount,
        returnedCount,
        returnedShippingLoss,
        returnedCodFee,
        netAmount: settledAllAmount - returnedShippingLoss,
        byProvider,
      };
    } catch (error) {
      logReportsReadFallback("getCodOverviewSummary", error);
    }
  }

  const providerExpr = sql<string>`coalesce(
    nullif(trim(${orders.shippingProvider}), ''),
    nullif(trim(${orders.shippingCarrier}), ''),
    'ไม่ระบุ'
  )`;

  const codAmountExpr = sql<number>`case
    when ${orders.codAmount} > 0 then ${orders.codAmount}
    else ${orders.total}
  end`;

  const [overviewRows, byProviderRows] = await Promise.all([
    timeDbQuery("reports.cod.overview", async () =>
      db
        .select({
          pendingCount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'SHIPPED'
              and ${orders.paymentStatus} = 'COD_PENDING_SETTLEMENT'
            then 1 else 0 end), 0)`,
          pendingAmount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'SHIPPED'
              and ${orders.paymentStatus} = 'COD_PENDING_SETTLEMENT'
            then ${codAmountExpr}
            else 0 end), 0)`,
          settledTodayCount: sql<number>`coalesce(sum(case
            when ${orders.paymentStatus} = 'COD_SETTLED'
              and ${orders.codSettledAt} >= datetime('now', 'localtime', 'start of day', 'utc')
              and ${orders.codSettledAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')
            then 1 else 0 end), 0)`,
          settledTodayAmount: sql<number>`coalesce(sum(case
            when ${orders.paymentStatus} = 'COD_SETTLED'
              and ${orders.codSettledAt} >= datetime('now', 'localtime', 'start of day', 'utc')
              and ${orders.codSettledAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')
            then ${codAmountExpr}
            else 0 end), 0)`,
          returnedTodayCount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
              and ${orders.codReturnedAt} >= datetime('now', 'localtime', 'start of day', 'utc')
              and ${orders.codReturnedAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')
            then 1 else 0 end), 0)`,
          returnedTodayShippingLoss: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
              and ${orders.codReturnedAt} >= datetime('now', 'localtime', 'start of day', 'utc')
              and ${orders.codReturnedAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')
            then ${orders.shippingCost}
            else 0 end), 0)`,
          returnedTodayCodFee: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
              and ${orders.codReturnedAt} >= datetime('now', 'localtime', 'start of day', 'utc')
              and ${orders.codReturnedAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')
            then ${orders.codFee}
            else 0 end), 0)`,
          settledAllCount: sql<number>`coalesce(sum(case
            when ${orders.paymentStatus} = 'COD_SETTLED'
            then 1 else 0 end), 0)`,
          settledAllAmount: sql<number>`coalesce(sum(case
            when ${orders.paymentStatus} = 'COD_SETTLED'
            then ${codAmountExpr}
            else 0 end), 0)`,
          returnedCount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
            then 1 else 0 end), 0)`,
          returnedShippingLoss: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
            then ${orders.shippingCost}
            else 0 end), 0)`,
          returnedCodFee: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
            then ${orders.codFee}
            else 0 end), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.paymentMethod, "COD"))),
    ),
    timeDbQuery("reports.cod.byProvider", async () =>
      db
        .select({
          provider: providerExpr,
          pendingCount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'SHIPPED'
              and ${orders.paymentStatus} = 'COD_PENDING_SETTLEMENT'
            then 1 else 0 end), 0)`,
          pendingAmount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'SHIPPED'
              and ${orders.paymentStatus} = 'COD_PENDING_SETTLEMENT'
            then ${codAmountExpr}
            else 0 end), 0)`,
          settledCount: sql<number>`coalesce(sum(case
            when ${orders.paymentStatus} = 'COD_SETTLED'
            then 1 else 0 end), 0)`,
          settledAmount: sql<number>`coalesce(sum(case
            when ${orders.paymentStatus} = 'COD_SETTLED'
            then ${codAmountExpr}
            else 0 end), 0)`,
          returnedCount: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
            then 1 else 0 end), 0)`,
          returnedShippingLoss: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
            then ${orders.shippingCost}
            else 0 end), 0)`,
          returnedCodFee: sql<number>`coalesce(sum(case
            when ${orders.status} = 'COD_RETURNED'
            then ${orders.codFee}
            else 0 end), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.paymentMethod, "COD")))
        .groupBy(providerExpr)
        .orderBy(desc(sql`coalesce(sum(case
          when ${orders.paymentStatus} = 'COD_SETTLED'
          then ${codAmountExpr}
          else 0 end), 0)`)),
    ),
  ]);

  const overview = overviewRows[0];
  const pendingCount = toNumber(overview?.pendingCount);
  const pendingAmount = toNumber(overview?.pendingAmount);
  const settledTodayCount = toNumber(overview?.settledTodayCount);
  const settledTodayAmount = toNumber(overview?.settledTodayAmount);
  const returnedTodayCount = toNumber(overview?.returnedTodayCount);
  const returnedTodayShippingLoss = toNumber(overview?.returnedTodayShippingLoss);
  const returnedTodayCodFee = toNumber(overview?.returnedTodayCodFee);
  const settledAllCount = toNumber(overview?.settledAllCount);
  const settledAllAmount = toNumber(overview?.settledAllAmount);
  const returnedCount = toNumber(overview?.returnedCount);
  const returnedShippingLoss = toNumber(overview?.returnedShippingLoss);
  const returnedCodFee = toNumber(overview?.returnedCodFee);

  const byProvider: CodByProviderRow[] = byProviderRows.map((row) => {
    const settledAmount = toNumber(row.settledAmount);
    const returnedShippingLoss = toNumber(row.returnedShippingLoss);
    const returnedCodFee = toNumber(row.returnedCodFee);
    return {
      provider: row.provider,
      pendingCount: toNumber(row.pendingCount),
      pendingAmount: toNumber(row.pendingAmount),
      settledCount: toNumber(row.settledCount),
      settledAmount,
      returnedCount: toNumber(row.returnedCount),
      returnedShippingLoss,
      returnedCodFee,
      netAmount: settledAmount - returnedShippingLoss,
    };
  });

  return {
    pendingCount,
    pendingAmount,
    settledTodayCount,
    settledTodayAmount,
    returnedTodayCount,
    returnedTodayShippingLoss,
    returnedTodayCodFee,
    settledAllCount,
    settledAllAmount,
    returnedCount,
    returnedShippingLoss,
    returnedCodFee,
    netAmount: settledAllAmount - returnedShippingLoss,
    byProvider,
  };
}

export async function getPurchaseFxDeltaSummary(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseFxDeltaSummary> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const [summaryRow, recentRows] = await Promise.all([
        timeDbQuery("reports.purchaseFx.summary.pg", async () =>
          pg.queryOne<{
            pendingRateCount: NumericValue;
            pendingRateUnpaidCount: NumericValue;
            lockedCount: NumericValue;
            changedRateCount: NumericValue;
            totalRateDeltaBase: NumericValue;
          }>(
            `
              select
                coalesce(sum(case
                  when status = 'RECEIVED'
                    and purchase_currency <> :storeCurrency
                    and exchange_rate_locked_at is null
                  then 1 else 0 end), 0) as "pendingRateCount",
                coalesce(sum(case
                  when status = 'RECEIVED'
                    and purchase_currency <> :storeCurrency
                    and exchange_rate_locked_at is null
                    and payment_status = 'UNPAID'
                  then 1 else 0 end), 0) as "pendingRateUnpaidCount",
                coalesce(sum(case
                  when purchase_currency <> :storeCurrency
                    and exchange_rate_locked_at is not null
                  then 1 else 0 end), 0) as "lockedCount",
                coalesce(sum(case
                  when purchase_currency <> :storeCurrency
                    and exchange_rate_locked_at is not null
                    and exchange_rate <> exchange_rate_initial
                  then 1 else 0 end), 0) as "changedRateCount",
                coalesce(sum(case
                  when purchase_currency <> :storeCurrency
                    and exchange_rate_locked_at is not null
                  then (
                    (exchange_rate - exchange_rate_initial) * coalesce((
                      select sum(
                        poi.unit_cost_purchase * case
                          when poi.qty_received > 0 then poi.qty_received
                          else poi.qty_ordered
                        end
                      )
                      from purchase_order_items poi
                      where poi.purchase_order_id = purchase_orders.id
                    ), 0)
                  )
                  else 0 end), 0) as "totalRateDeltaBase"
              from purchase_orders
              where store_id = :storeId
            `,
            {
              replacements: {
                storeId,
                storeCurrency,
              },
            },
          ),
        ),
        timeDbQuery("reports.purchaseFx.recentLocks.pg", async () =>
          pg.queryMany<PurchaseFxDeltaSummary["recentLocks"][number] & {
            exchangeRateInitial: NumericValue;
            exchangeRate: NumericValue;
          }>(
            `
              select
                id,
                po_number as "poNumber",
                supplier_name as "supplierName",
                purchase_currency as "purchaseCurrency",
                exchange_rate_initial as "exchangeRateInitial",
                exchange_rate as "exchangeRate",
                exchange_rate_locked_at as "exchangeRateLockedAt",
                payment_status as "paymentStatus"
              from purchase_orders
              where store_id = :storeId
                and purchase_currency <> :storeCurrency
                and exchange_rate_locked_at is not null
              order by exchange_rate_locked_at desc
              limit 5
            `,
            {
              replacements: {
                storeId,
                storeCurrency,
              },
            },
          ),
        ),
      ]);

      return {
        pendingRateCount: toNumber(summaryRow?.pendingRateCount),
        pendingRateUnpaidCount: toNumber(summaryRow?.pendingRateUnpaidCount),
        lockedCount: toNumber(summaryRow?.lockedCount),
        changedRateCount: toNumber(summaryRow?.changedRateCount),
        totalRateDeltaBase: toNumber(summaryRow?.totalRateDeltaBase),
        recentLocks: recentRows.map((row) => ({
          id: row.id,
          poNumber: row.poNumber,
          supplierName: row.supplierName,
          purchaseCurrency: row.purchaseCurrency,
          exchangeRateInitial: toNumber(row.exchangeRateInitial),
          exchangeRate: toNumber(row.exchangeRate),
          exchangeRateLockedAt: row.exchangeRateLockedAt,
          paymentStatus: row.paymentStatus,
        })),
      };
    } catch (error) {
      logReportsReadFallback("getPurchaseFxDeltaSummary", error);
    }
  }

  const [summaryRows, recentRows] = await Promise.all([
    timeDbQuery("reports.purchaseFx.summary", async () =>
      db
        .select({
          pendingRateCount: sql<number>`coalesce(sum(case
            when ${purchaseOrders.status} = 'RECEIVED'
              and ${purchaseOrders.purchaseCurrency} <> ${storeCurrency}
              and ${purchaseOrders.exchangeRateLockedAt} is null
            then 1 else 0 end), 0)`,
          pendingRateUnpaidCount: sql<number>`coalesce(sum(case
            when ${purchaseOrders.status} = 'RECEIVED'
              and ${purchaseOrders.purchaseCurrency} <> ${storeCurrency}
              and ${purchaseOrders.exchangeRateLockedAt} is null
              and ${purchaseOrders.paymentStatus} = 'UNPAID'
            then 1 else 0 end), 0)`,
          lockedCount: sql<number>`coalesce(sum(case
            when ${purchaseOrders.purchaseCurrency} <> ${storeCurrency}
              and ${purchaseOrders.exchangeRateLockedAt} is not null
            then 1 else 0 end), 0)`,
          changedRateCount: sql<number>`coalesce(sum(case
            when ${purchaseOrders.purchaseCurrency} <> ${storeCurrency}
              and ${purchaseOrders.exchangeRateLockedAt} is not null
              and ${purchaseOrders.exchangeRate} <> ${purchaseOrders.exchangeRateInitial}
            then 1 else 0 end), 0)`,
          totalRateDeltaBase: sql<number>`coalesce(sum(case
            when ${purchaseOrders.purchaseCurrency} <> ${storeCurrency}
              and ${purchaseOrders.exchangeRateLockedAt} is not null
            then (
              (${purchaseOrders.exchangeRate} - ${purchaseOrders.exchangeRateInitial}) * coalesce((
                select sum(
                  ${purchaseOrderItems.unitCostPurchase} * case
                    when ${purchaseOrderItems.qtyReceived} > 0 then ${purchaseOrderItems.qtyReceived}
                    else ${purchaseOrderItems.qtyOrdered}
                  end
                )
                from ${purchaseOrderItems}
                where ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
              ), 0)
            )
            else 0 end), 0)`,
        })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.storeId, storeId)),
    ),
    timeDbQuery("reports.purchaseFx.recentLocks", async () =>
      db
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          supplierName: purchaseOrders.supplierName,
          purchaseCurrency: purchaseOrders.purchaseCurrency,
          exchangeRateInitial: purchaseOrders.exchangeRateInitial,
          exchangeRate: purchaseOrders.exchangeRate,
          exchangeRateLockedAt: purchaseOrders.exchangeRateLockedAt,
          paymentStatus: purchaseOrders.paymentStatus,
        })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.storeId, storeId),
            sql`${purchaseOrders.purchaseCurrency} <> ${storeCurrency}`,
            sql`${purchaseOrders.exchangeRateLockedAt} is not null`,
          ),
        )
        .orderBy(sql`${purchaseOrders.exchangeRateLockedAt} desc`)
        .limit(5),
    ),
  ]);

  return {
    pendingRateCount: toNumber(summaryRows[0]?.pendingRateCount),
    pendingRateUnpaidCount: toNumber(summaryRows[0]?.pendingRateUnpaidCount),
    lockedCount: toNumber(summaryRows[0]?.lockedCount),
    changedRateCount: toNumber(summaryRows[0]?.changedRateCount),
    totalRateDeltaBase: toNumber(summaryRows[0]?.totalRateDeltaBase),
    recentLocks: recentRows.map((row) => ({
      id: row.id,
      poNumber: row.poNumber,
      supplierName: row.supplierName,
      purchaseCurrency: row.purchaseCurrency as "LAK" | "THB" | "USD",
      exchangeRateInitial: toNumber(row.exchangeRateInitial),
      exchangeRate: toNumber(row.exchangeRate),
      exchangeRateLockedAt: row.exchangeRateLockedAt,
      paymentStatus: row.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
    })),
  };
}

export async function getOutstandingPurchaseRows(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseOutstandingRow[]> {
  const pg = await getPostgresReportsReadContext();
  if (pg) {
    try {
      const rows = await timeDbQuery("reports.purchaseOutstanding.rows.pg", async () =>
        pg.queryMany<PurchaseOutstandingPostgresRow>(
          `
            select
              po.id as "poId",
              po.po_number as "poNumber",
              po.supplier_name as "supplierName",
              po.purchase_currency as "purchaseCurrency",
              po.due_date as "dueDate",
              po.received_at as "receivedAt",
              po.payment_status as "paymentStatus",
              po.exchange_rate_initial as "exchangeRateInitial",
              po.exchange_rate as "exchangeRate",
              po.exchange_rate_locked_at as "exchangeRateLockedAt",
              (
                coalesce((
                  select sum(poi.unit_cost_base * poi.qty_ordered)
                  from purchase_order_items poi
                  where poi.purchase_order_id = po.id
                ), 0) + po.shipping_cost + po.other_cost
              ) as "grandTotalBase",
              (
                coalesce((
                  select sum(case
                    when pop.entry_type = 'PAYMENT' then pop.amount_base
                    when pop.entry_type = 'REVERSAL' then -pop.amount_base
                    else 0
                  end)
                  from purchase_order_payments pop
                  where pop.purchase_order_id = po.id
                ), 0)
              ) as "totalPaidBase",
              (
                (
                  coalesce((
                    select sum(poi.unit_cost_base * poi.qty_ordered)
                    from purchase_order_items poi
                    where poi.purchase_order_id = po.id
                  ), 0) + po.shipping_cost + po.other_cost
                ) - coalesce((
                  select sum(case
                    when pop.entry_type = 'PAYMENT' then pop.amount_base
                    when pop.entry_type = 'REVERSAL' then -pop.amount_base
                    else 0
                  end)
                  from purchase_order_payments pop
                  where pop.purchase_order_id = po.id
                ), 0)
              ) as "outstandingBase",
              greatest(floor(extract(epoch from (
                timezone('UTC', now()) - coalesce(
                  po.due_date::timestamp,
                  po.received_at::timestamptz at time zone 'UTC',
                  po.created_at::timestamptz at time zone 'UTC'
                )
              )) / 86400), 0) as "ageDays",
              case
                when po.purchase_currency <> :storeCurrency
                  and po.exchange_rate_locked_at is not null
                  and po.exchange_rate <> po.exchange_rate_initial
                then (
                  (po.exchange_rate - po.exchange_rate_initial) * coalesce((
                    select sum(
                      poi.unit_cost_purchase * case
                        when poi.qty_received > 0 then poi.qty_received
                        else poi.qty_ordered
                      end
                    )
                    from purchase_order_items poi
                    where poi.purchase_order_id = po.id
                  ), 0)
                )
                else 0
              end as "fxDeltaBase"
            from purchase_orders po
            where po.store_id = :storeId
              and po.status = 'RECEIVED'
              and (
                (
                  coalesce((
                    select sum(poi.unit_cost_base * poi.qty_ordered)
                    from purchase_order_items poi
                    where poi.purchase_order_id = po.id
                  ), 0) + po.shipping_cost + po.other_cost
                ) - coalesce((
                  select sum(case
                    when pop.entry_type = 'PAYMENT' then pop.amount_base
                    when pop.entry_type = 'REVERSAL' then -pop.amount_base
                    else 0
                  end)
                  from purchase_order_payments pop
                  where pop.purchase_order_id = po.id
                ), 0)
              ) > 0
            order by po.due_date desc nulls last, po.received_at desc nulls last
          `,
          {
            replacements: {
              storeId,
              storeCurrency,
            },
          },
        ),
      );

      return rows.map((row) => ({
        poId: row.poId,
        poNumber: row.poNumber,
        supplierName: row.supplierName,
        purchaseCurrency: row.purchaseCurrency,
        dueDate: row.dueDate,
        receivedAt: row.receivedAt,
        paymentStatus: row.paymentStatus,
        grandTotalBase: toNumber(row.grandTotalBase),
        totalPaidBase: toNumber(row.totalPaidBase),
        outstandingBase: toNumber(row.outstandingBase),
        ageDays: toNumber(row.ageDays),
        fxDeltaBase: toNumber(row.fxDeltaBase),
        exchangeRateInitial: toNumber(row.exchangeRateInitial),
        exchangeRate: toNumber(row.exchangeRate),
        exchangeRateLockedAt: row.exchangeRateLockedAt,
      }));
    } catch (error) {
      logReportsReadFallback("getOutstandingPurchaseRows", error);
    }
  }

  const rows = await timeDbQuery("reports.purchaseOutstanding.rows", async () =>
    db
      .select({
        poId: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        supplierName: purchaseOrders.supplierName,
        purchaseCurrency: purchaseOrders.purchaseCurrency,
        dueDate: purchaseOrders.dueDate,
        receivedAt: purchaseOrders.receivedAt,
        paymentStatus: purchaseOrders.paymentStatus,
        exchangeRateInitial: purchaseOrders.exchangeRateInitial,
        exchangeRate: purchaseOrders.exchangeRate,
        exchangeRateLockedAt: purchaseOrders.exchangeRateLockedAt,
        grandTotalBase: sql<number>`(
          coalesce((
            SELECT sum(${purchaseOrderItems.unitCostBase} * ${purchaseOrderItems.qtyOrdered})
            FROM ${purchaseOrderItems}
            WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
          ), 0) + ${purchaseOrders.shippingCost} + ${purchaseOrders.otherCost}
        )`,
        totalPaidBase: sql<number>`(
          coalesce((
            SELECT sum(case
              when ${purchaseOrderPayments.entryType} = 'PAYMENT' then ${purchaseOrderPayments.amountBase}
              when ${purchaseOrderPayments.entryType} = 'REVERSAL' then -${purchaseOrderPayments.amountBase}
              else 0
            end)
            FROM ${purchaseOrderPayments}
            WHERE ${purchaseOrderPayments.purchaseOrderId} = ${purchaseOrders.id}
          ), 0)
        )`,
        outstandingBase: sql<number>`(
          (
            coalesce((
              SELECT sum(${purchaseOrderItems.unitCostBase} * ${purchaseOrderItems.qtyOrdered})
              FROM ${purchaseOrderItems}
              WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
            ), 0) + ${purchaseOrders.shippingCost} + ${purchaseOrders.otherCost}
          ) - coalesce((
            SELECT sum(case
              when ${purchaseOrderPayments.entryType} = 'PAYMENT' then ${purchaseOrderPayments.amountBase}
              when ${purchaseOrderPayments.entryType} = 'REVERSAL' then -${purchaseOrderPayments.amountBase}
              else 0
            end)
            FROM ${purchaseOrderPayments}
            WHERE ${purchaseOrderPayments.purchaseOrderId} = ${purchaseOrders.id}
          ), 0)
        )`,
        ageDays: sql<number>`cast(case
          when julianday('now') - julianday(coalesce(${purchaseOrders.dueDate}, ${purchaseOrders.receivedAt}, ${purchaseOrders.createdAt})) < 0 then 0
          else julianday('now') - julianday(coalesce(${purchaseOrders.dueDate}, ${purchaseOrders.receivedAt}, ${purchaseOrders.createdAt}))
        end as integer)`,
        fxDeltaBase: sql<number>`case
          when ${purchaseOrders.purchaseCurrency} <> ${storeCurrency}
            and ${purchaseOrders.exchangeRateLockedAt} is not null
            and ${purchaseOrders.exchangeRate} <> ${purchaseOrders.exchangeRateInitial}
          then (
            (${purchaseOrders.exchangeRate} - ${purchaseOrders.exchangeRateInitial}) * coalesce((
              SELECT sum(
                ${purchaseOrderItems.unitCostPurchase} * case
                  when ${purchaseOrderItems.qtyReceived} > 0 then ${purchaseOrderItems.qtyReceived}
                  else ${purchaseOrderItems.qtyOrdered}
                end
              )
              FROM ${purchaseOrderItems}
              WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
            ), 0)
          )
          else 0
        end`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.storeId, storeId),
          eq(purchaseOrders.status, "RECEIVED"),
          sql`(
            (
              coalesce((
                SELECT sum(${purchaseOrderItems.unitCostBase} * ${purchaseOrderItems.qtyOrdered})
                FROM ${purchaseOrderItems}
                WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
              ), 0) + ${purchaseOrders.shippingCost} + ${purchaseOrders.otherCost}
            ) - coalesce((
              SELECT sum(case
                when ${purchaseOrderPayments.entryType} = 'PAYMENT' then ${purchaseOrderPayments.amountBase}
                when ${purchaseOrderPayments.entryType} = 'REVERSAL' then -${purchaseOrderPayments.amountBase}
                else 0
              end)
              FROM ${purchaseOrderPayments}
              WHERE ${purchaseOrderPayments.purchaseOrderId} = ${purchaseOrders.id}
            ), 0)
          ) > 0`,
        ),
      )
      .orderBy(desc(purchaseOrders.dueDate), desc(purchaseOrders.receivedAt)),
  );

  return rows.map((row) => ({
    poId: row.poId,
    poNumber: row.poNumber,
    supplierName: row.supplierName,
    purchaseCurrency: row.purchaseCurrency as "LAK" | "THB" | "USD",
    dueDate: row.dueDate,
    receivedAt: row.receivedAt,
    paymentStatus: row.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
    grandTotalBase: toNumber(row.grandTotalBase),
    totalPaidBase: toNumber(row.totalPaidBase),
    outstandingBase: toNumber(row.outstandingBase),
    ageDays: toNumber(row.ageDays),
    fxDeltaBase: toNumber(row.fxDeltaBase),
    exchangeRateInitial: Number(row.exchangeRateInitial ?? 1),
    exchangeRate: Number(row.exchangeRate ?? 1),
    exchangeRateLockedAt: row.exchangeRateLockedAt,
  }));
}

export async function getPurchaseApAgingSummary(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseApAgingSummary> {
  const outstandingRows = await getOutstandingPurchaseRows(storeId, storeCurrency);

  const summary: PurchaseApAgingSummary = {
    totalOutstandingBase: 0,
    bucket0To30: { count: 0, amountBase: 0 },
    bucket31To60: { count: 0, amountBase: 0 },
    bucket61Plus: { count: 0, amountBase: 0 },
    suppliers: [],
  };

  const supplierMap = new Map<
    string,
    {
      outstandingBase: number;
      fxDeltaBase: number;
      poCount: number;
    }
  >();

  for (const row of outstandingRows) {
    summary.totalOutstandingBase += row.outstandingBase;
    if (row.ageDays <= 30) {
      summary.bucket0To30.count += 1;
      summary.bucket0To30.amountBase += row.outstandingBase;
    } else if (row.ageDays <= 60) {
      summary.bucket31To60.count += 1;
      summary.bucket31To60.amountBase += row.outstandingBase;
    } else {
      summary.bucket61Plus.count += 1;
      summary.bucket61Plus.amountBase += row.outstandingBase;
    }

    const supplierName = row.supplierName?.trim() || "ไม่ระบุซัพพลายเออร์";
    const current = supplierMap.get(supplierName) ?? {
      outstandingBase: 0,
      fxDeltaBase: 0,
      poCount: 0,
    };
    current.outstandingBase += row.outstandingBase;
    current.fxDeltaBase += row.fxDeltaBase;
    current.poCount += 1;
    supplierMap.set(supplierName, current);
  }

  summary.suppliers = Array.from(supplierMap.entries())
    .map(([supplierName, value]) => ({
      supplierName,
      outstandingBase: value.outstandingBase,
      fxDeltaBase: value.fxDeltaBase,
      poCount: value.poCount,
    }))
    .sort((a, b) => b.outstandingBase - a.outstandingBase);

  return summary;
}
