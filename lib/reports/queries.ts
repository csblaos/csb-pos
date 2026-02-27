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
} from "@/lib/db/schema";
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
  currentCostCogs: number;
  shippingCost: number;
  grossProfit: number;
  currentCostGrossProfit: number;
  grossProfitDeltaVsCurrentCost: number;
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

  const revenue = Number(revenueRows[0]?.value ?? 0);
  const cogs = Number(cogsRows[0]?.value ?? 0);
  const currentCostCogs = Number(currentCostCogsRows[0]?.value ?? 0);
  const shippingCost = Number(shippingRows[0]?.value ?? 0);
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

export async function getPurchaseFxDeltaSummary(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseFxDeltaSummary> {
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
    pendingRateCount: Number(summaryRows[0]?.pendingRateCount ?? 0),
    pendingRateUnpaidCount: Number(summaryRows[0]?.pendingRateUnpaidCount ?? 0),
    lockedCount: Number(summaryRows[0]?.lockedCount ?? 0),
    changedRateCount: Number(summaryRows[0]?.changedRateCount ?? 0),
    totalRateDeltaBase: Number(summaryRows[0]?.totalRateDeltaBase ?? 0),
    recentLocks: recentRows.map((row) => ({
      id: row.id,
      poNumber: row.poNumber,
      supplierName: row.supplierName,
      purchaseCurrency: row.purchaseCurrency as "LAK" | "THB" | "USD",
      exchangeRateInitial: row.exchangeRateInitial,
      exchangeRate: row.exchangeRate,
      exchangeRateLockedAt: row.exchangeRateLockedAt,
      paymentStatus: row.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
    })),
  };
}

export async function getOutstandingPurchaseRows(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseOutstandingRow[]> {
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
    grandTotalBase: Number(row.grandTotalBase ?? 0),
    totalPaidBase: Number(row.totalPaidBase ?? 0),
    outstandingBase: Number(row.outstandingBase ?? 0),
    ageDays: Number(row.ageDays ?? 0),
    fxDeltaBase: Number(row.fxDeltaBase ?? 0),
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
