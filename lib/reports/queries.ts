import { redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { getLowStockProducts, getStoreStockThresholds } from "@/lib/inventory/queries";
import { timeAsync, timeDbQuery } from "@/lib/perf/server";

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

const getPostgresReportsReadContext = async (): Promise<PostgresReportsReadContext> => {
  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL reports read path is not configured");
  }

  return {
    queryMany,
    queryOne,
  };
};

function dashboardMetricsCacheKey(storeId: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return `reports:dashboard_metrics:${storeId}:${dayKey}`;
}

export async function getReportStoreCurrency(
  storeId: string,
): Promise<"LAK" | "THB" | "USD"> {
  const pg = await getPostgresReportsReadContext();
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
}

async function fetchDashboardMetrics(storeId: string): Promise<DashboardMetrics> {
  const pg = await getPostgresReportsReadContext();
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
}

export async function getTopProducts(
  storeId: string,
  limit = 10,
): Promise<TopProductRow[]> {
  const pg = await getPostgresReportsReadContext();
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
}

export async function getSalesByChannel(storeId: string): Promise<SalesByChannelRow[]> {
  const pg = await getPostgresReportsReadContext();
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
}

export async function getGrossProfitSummary(
  storeId: string,
): Promise<GrossProfitSummary> {
  const pg = await getPostgresReportsReadContext();
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
}

export async function getCodOverviewSummary(
  storeId: string,
): Promise<CodOverviewSummary> {
  const pg = await getPostgresReportsReadContext();
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
}

export async function getPurchaseFxDeltaSummary(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseFxDeltaSummary> {
  const pg = await getPostgresReportsReadContext();
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
}

export async function getOutstandingPurchaseRows(
  storeId: string,
  storeCurrency: "LAK" | "THB" | "USD",
): Promise<PurchaseOutstandingRow[]> {
  const pg = await getPostgresReportsReadContext();
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
    exchangeRateInitial: toNumber(row.exchangeRateInitial || 1),
    exchangeRate: toNumber(row.exchangeRate || 1),
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
