import "server-only";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { createPerfScope, timePerf } from "@/server/perf/perf";
import {
  getLowStockItemsByStore,
  getOrdersCountToday,
  getPendingPaymentCount,
  getTodaySales,
} from "@/server/repositories/dashboard.repo";
import type { LowStockItem } from "@/lib/inventory/queries";

export type DashboardSummary = {
  todaySales: number;
  ordersCountToday: number;
  pendingPaymentCount: number;
  lowStockCount: number;
};

export type DashboardViewData = {
  metrics: DashboardSummary;
  lowStockItems: LowStockItem[];
};

const DASHBOARD_CACHE_TTL_SECONDS = 20;

const dashboardSummaryCacheKey = (storeId: string, thresholdBase: number) => {
  const dayKey = new Date().toISOString().slice(0, 10);
  return `dashboard:summary:${storeId}:${thresholdBase}:${dayKey}`;
};

export async function invalidateDashboardSummaryCache(
  storeId: string,
  thresholdBase = 10,
) {
  await redisDelete(dashboardSummaryCacheKey(storeId, thresholdBase));
}

export async function getDashboardViewData(params: {
  storeId: string;
  thresholdBase?: number;
  useCache?: boolean;
}): Promise<DashboardViewData> {
  const thresholdBase = params.thresholdBase ?? 10;
  const useCache = params.useCache ?? true;
  const cacheKey = dashboardSummaryCacheKey(params.storeId, thresholdBase);

  return timePerf("dashboard.service.getViewData.total", async () => {
    const scope = createPerfScope("dashboard.service.getViewData");

    try {
      if (useCache) {
        const cached = await scope.step("cache.read", async () =>
          redisGetJson<DashboardViewData>(cacheKey),
        );
        if (cached) {
          return cached;
        }
      }

      const [todaySales, ordersCountToday, pendingPaymentCount, lowStockItems] =
        await scope.step("repo.parallel", async () =>
          Promise.all([
            getTodaySales(params.storeId),
            getOrdersCountToday(params.storeId),
            getPendingPaymentCount(params.storeId),
            getLowStockItemsByStore(params.storeId, thresholdBase),
          ]),
        );

      const response: DashboardViewData = {
        metrics: {
          todaySales,
          ordersCountToday,
          pendingPaymentCount,
          lowStockCount: lowStockItems.length,
        },
        lowStockItems,
      };

      if (useCache) {
        await scope.step("cache.write", async () =>
          redisSetJson(cacheKey, response, DASHBOARD_CACHE_TTL_SECONDS),
        );
      }

      return response;
    } finally {
      scope.end();
    }
  });
}
