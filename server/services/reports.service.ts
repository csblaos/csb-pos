import "server-only";

import { eq } from "drizzle-orm";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
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
  storeCurrency: string;
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

  const [salesSummary, topProducts, salesByChannel, grossProfit, storeRow] = await Promise.all([
    getSalesSummary(params.storeId),
    getTopProducts(params.storeId, topProductsLimit),
    getSalesByChannel(params.storeId),
    getGrossProfitSummary(params.storeId),
    db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, params.storeId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const response: ReportsViewData = {
    storeCurrency: storeRow?.currency ?? "LAK",
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
