import "server-only";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import {
  getGrossProfitSummary,
  getSalesByChannel,
  getSalesSummary,
  getTopProducts,
  type GrossProfitSummary,
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
  salesSummary: SalesSummary;
  topProducts: TopProductRow[];
  salesByChannel: SalesByChannelRow[];
  grossProfit: GrossProfitSummary;
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

  const [salesSummary, topProducts, salesByChannel, grossProfit] = await Promise.all([
    getSalesSummary(params.storeId),
    getTopProducts(params.storeId, topProductsLimit),
    getSalesByChannel(params.storeId),
    getGrossProfitSummary(params.storeId),
  ]);

  const response: ReportsViewData = {
    salesSummary,
    topProducts,
    salesByChannel,
    grossProfit,
  };

  if (useCache) {
    await redisSetJson(cacheKey, response, REPORTS_OVERVIEW_TTL_SECONDS);
  }

  return response;
}
