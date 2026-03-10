import "server-only";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import {
  getCodOverviewSummary,
  getGrossProfitSummary,
  getOutstandingPurchaseRows,
  getPurchaseApAgingSummary,
  getPurchaseFxDeltaSummary,
  getReportStoreCurrency,
  getSalesByChannel,
  getSalesSummary,
  getTopProducts,
  type GrossProfitSummary,
  type CodOverviewSummary,
  type PurchaseApAgingSummary,
  type PurchaseFxDeltaSummary,
  type PurchaseOutstandingRow,
  type SalesByChannelRow,
  type SalesSummary,
  type TopProductRow,
} from "@/lib/reports/queries";

const REPORTS_OVERVIEW_TTL_SECONDS = 20;

const reportsOverviewCacheKey = (storeId: string, topProductsLimit: number) => {
  const dayKey = new Date().toISOString().slice(0, 10);
  return `reports:overview:${storeId}:${topProductsLimit}:${dayKey}`;
};

export type ReportsViewData = {
  storeCurrency: string;
  salesSummary: SalesSummary;
  topProducts: TopProductRow[];
  salesByChannel: SalesByChannelRow[];
  grossProfit: GrossProfitSummary;
  codOverview: CodOverviewSummary;
  purchaseFx: PurchaseFxDeltaSummary;
  purchaseApAging: PurchaseApAgingSummary;
};

export async function invalidateReportsOverviewCache(
  storeId: string,
  topProductsLimit = 10,
) {
  await redisDelete(reportsOverviewCacheKey(storeId, topProductsLimit));
}

export async function getReportsViewData(params: {
  storeId: string;
  topProductsLimit?: number;
  useCache?: boolean;
}): Promise<ReportsViewData> {
  const topProductsLimit = params.topProductsLimit ?? 10;
  const useCache = params.useCache ?? true;
  const cacheKey = reportsOverviewCacheKey(params.storeId, topProductsLimit);

  if (useCache) {
    const cached = await redisGetJson<ReportsViewData>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const [salesSummary, topProducts, salesByChannel, grossProfit, codOverview, storeCurrency] =
    await Promise.all([
      getSalesSummary(params.storeId),
      getTopProducts(params.storeId, topProductsLimit),
      getSalesByChannel(params.storeId),
      getGrossProfitSummary(params.storeId),
      getCodOverviewSummary(params.storeId),
      getReportStoreCurrency(params.storeId),
    ]);
  const [purchaseFx, purchaseApAging] = await Promise.all([
    getPurchaseFxDeltaSummary(params.storeId, storeCurrency),
    getPurchaseApAgingSummary(params.storeId, storeCurrency),
  ]);

  const response: ReportsViewData = {
    storeCurrency,
    salesSummary,
    topProducts,
    salesByChannel,
    grossProfit,
    codOverview,
    purchaseFx,
    purchaseApAging,
  };

  if (useCache) {
    await redisSetJson(cacheKey, response, REPORTS_OVERVIEW_TTL_SECONDS);
  }

  return response;
}

export async function getOutstandingPurchaseRowsForExport(storeId: string) {
  const storeCurrency = await getReportStoreCurrency(storeId);
  const rows = await getOutstandingPurchaseRows(storeId, storeCurrency);
  return {
    storeCurrency,
    rows,
  } satisfies { storeCurrency: string; rows: PurchaseOutstandingRow[] };
}
