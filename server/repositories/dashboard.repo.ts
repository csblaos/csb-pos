import "server-only";

import { queryOne } from "@/lib/db/query";
import { timeDb } from "@/server/perf/perf";
import {
  getLowStockProducts,
  type LowStockItem,
  type StoreStockThresholds,
} from "@/lib/inventory/queries";

const paidStatuses = ["PAID", "PACKED", "SHIPPED"] as const;
const pendingStatuses = ["PENDING_PAYMENT", "READY_FOR_PICKUP"] as const;

const getVientianeDayRangeUtc = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vientiane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayLocal = formatter.format(new Date());
  const startUtc = new Date(`${todayLocal}T00:00:00+07:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return {
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
  };
};

export async function getTodaySales(storeId: string) {
  const { startUtc, endUtc } = getVientianeDayRangeUtc();
  const row = await timeDb("dashboard.repo.todaySales", async () =>
    queryOne<{ value: number | string | null }>(
      `
        select coalesce(sum(total), 0) as value
        from orders
        where
          store_id = :storeId
          and status in (:paidStatuses)
          and paid_at is not null
          and paid_at::timestamptz >= :startUtc::timestamptz
          and paid_at::timestamptz < :endUtc::timestamptz
      `,
      {
        replacements: {
          storeId,
          paidStatuses: [...paidStatuses],
          startUtc,
          endUtc,
        },
      },
    ),
  );

  return Number(row?.value ?? 0);
}

export async function getOrdersCountToday(storeId: string) {
  const { startUtc, endUtc } = getVientianeDayRangeUtc();
  const row = await timeDb("dashboard.repo.ordersCountToday", async () =>
    queryOne<{ value: number | string | null }>(
      `
        select count(*)::int as value
        from orders
        where
          store_id = :storeId
          and created_at::timestamptz >= :startUtc::timestamptz
          and created_at::timestamptz < :endUtc::timestamptz
      `,
      {
        replacements: { storeId, startUtc, endUtc },
      },
    ),
  );

  return Number(row?.value ?? 0);
}

export async function getPendingPaymentCount(storeId: string) {
  const row = await timeDb("dashboard.repo.pendingPaymentCount", async () =>
    queryOne<{ value: number | string | null }>(
      `
        select count(*)::int as value
        from orders
        where
          store_id = :storeId
          and status in (:pendingStatuses)
      `,
      {
        replacements: { storeId, pendingStatuses: [...pendingStatuses] },
      },
    ),
  );

  return Number(row?.value ?? 0);
}

export async function getLowStockItemsByStore(
  storeId: string,
  thresholds: StoreStockThresholds,
): Promise<LowStockItem[]> {
  return timeDb("dashboard.repo.lowStockItems", async () =>
    getLowStockProducts(storeId, thresholds),
  );
}
