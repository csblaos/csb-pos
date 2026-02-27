import "server-only";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import { createPerfScope, timePerf } from "@/server/perf/perf";
import {
  getPurchaseApDueReminders,
  type PurchaseApReminderSummary,
} from "@/server/services/purchase-ap.service";
import {
  getLowStockItemsByStore,
  getOrdersCountToday,
  getPendingPaymentCount,
  getTodaySales,
} from "@/server/repositories/dashboard.repo";
import {
  getStoreStockThresholds,
  type LowStockItem,
  type StoreStockThresholds,
} from "@/lib/inventory/queries";

export type DashboardSummary = {
  todaySales: number;
  ordersCountToday: number;
  pendingPaymentCount: number;
  lowStockCount: number;
};

export type DashboardViewData = {
  metrics: DashboardSummary;
  lowStockItems: LowStockItem[];
  purchaseApReminder: {
    storeCurrency: "LAK" | "THB" | "USD";
    summary: PurchaseApReminderSummary;
  };
};

const DASHBOARD_CACHE_TTL_SECONDS = 20;

const dashboardSummaryCacheKey = (
  storeId: string,
  thresholds: StoreStockThresholds,
) => {
  const dayKey = new Date().toISOString().slice(0, 10);
  return `dashboard:summary:${storeId}:${thresholds.outStockThreshold}:${thresholds.lowStockThreshold}:${dayKey}`;
};

export async function invalidateDashboardSummaryCache(
  storeId: string,
) {
  const thresholds = await getStoreStockThresholds(storeId);
  await redisDelete(dashboardSummaryCacheKey(storeId, thresholds));
}

export async function getDashboardViewData(params: {
  storeId: string;
  useCache?: boolean;
}): Promise<DashboardViewData> {
  const useCache = params.useCache ?? true;
  const thresholds = await getStoreStockThresholds(params.storeId);
  const cacheKey = dashboardSummaryCacheKey(params.storeId, thresholds);

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

      const [todaySales, ordersCountToday, pendingPaymentCount, lowStockItems, purchaseApReminder] =
        await scope.step("repo.parallel", async () =>
          Promise.all([
            getTodaySales(params.storeId),
            getOrdersCountToday(params.storeId),
            getPendingPaymentCount(params.storeId),
            getLowStockItemsByStore(params.storeId, thresholds),
            getPurchaseApDueReminders({
              storeId: params.storeId,
              limit: 5,
            }),
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
        purchaseApReminder,
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
