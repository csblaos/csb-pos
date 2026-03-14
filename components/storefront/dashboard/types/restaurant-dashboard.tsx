import { Suspense } from "react";

import {
  CodReconcileReminder,
  type DashboardTheme,
  DashboardHeroCompact,
  DashboardMetricsHeader,
  DashboardMetricCards,
  DashboardCardsSkeleton,
  LowStock,
  LowStockSkeleton,
  PurchaseApReminder,
  PurchaseApReminderSkeleton,
  defaultDashboardTheme,
  type StorefrontDashboardProps,
} from "@/components/storefront/dashboard/shared";

const restaurantTheme: DashboardTheme = {
  ...defaultDashboardTheme,
  shellClassName: "rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm",
  shellTextClassName: "text-rose-950",
  shellSubtleTextClassName: "text-rose-800",
  shellBadgeClassName: "border border-rose-200 bg-white text-rose-900",
  reportButtonClassName:
    "border border-rose-200 bg-white text-rose-900 hover:bg-rose-50 hover:text-rose-700",
  quickActionPrimaryClassName:
    "border border-rose-900 bg-rose-900 text-rose-50 hover:bg-rose-800",
  quickActionSecondaryClassName:
    "border border-rose-200 bg-white text-rose-900 hover:bg-rose-50",
  metricCardClassName: "border border-rose-200 bg-white shadow-sm",
  metricLabelClassName: "text-rose-800/80",
  metricValueClassName: "text-rose-950",
};

export function RestaurantStorefrontDashboard({
  session,
  dashboardDataPromise,
  canViewOrders,
  canViewInventory,
  canViewReports,
}: StorefrontDashboardProps) {
  return (
    <section className="space-y-4">
      <DashboardHeroCompact session={session} theme={restaurantTheme} />

      <DashboardMetricsHeader
        canViewReports={canViewReports}
        language={session.language}
        theme={restaurantTheme}
      />

      <Suspense
        fallback={<DashboardCardsSkeleton language={session.language} theme={restaurantTheme} />}
      >
        <DashboardMetricCards
          dashboardDataPromise={dashboardDataPromise}
          language={session.language}
          theme={restaurantTheme}
        />
      </Suspense>

      {canViewOrders ? (
        <Suspense fallback={<PurchaseApReminderSkeleton language={session.language} />}>
          <CodReconcileReminder
            dashboardDataPromise={dashboardDataPromise}
            language={session.language}
          />
        </Suspense>
      ) : null}

      {canViewInventory ? (
        <Suspense fallback={<PurchaseApReminderSkeleton language={session.language} />}>
          <PurchaseApReminder
            dashboardDataPromise={dashboardDataPromise}
            language={session.language}
          />
        </Suspense>
      ) : null}

      {canViewInventory ? (
        <Suspense fallback={<LowStockSkeleton language={session.language} />}>
          <LowStock dashboardDataPromise={dashboardDataPromise} language={session.language} />
        </Suspense>
      ) : null}
    </section>
  );
}
