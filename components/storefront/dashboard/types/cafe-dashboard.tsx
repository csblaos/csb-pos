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

const cafeTheme: DashboardTheme = {
  ...defaultDashboardTheme,
  shellClassName: "rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm",
  shellTextClassName: "text-amber-950",
  shellSubtleTextClassName: "text-amber-800",
  shellBadgeClassName: "border border-amber-200 bg-white text-amber-900",
  reportButtonClassName:
    "border border-amber-200 bg-white text-amber-900 hover:bg-amber-50 hover:text-amber-700",
  quickActionPrimaryClassName:
    "border border-amber-900 bg-amber-900 text-amber-50 hover:bg-amber-800",
  quickActionSecondaryClassName:
    "border border-amber-200 bg-white text-amber-900 hover:bg-amber-50",
  metricCardClassName: "border border-amber-200 bg-white shadow-sm",
  metricLabelClassName: "text-amber-800/80",
  metricValueClassName: "text-amber-950",
};

export function CafeStorefrontDashboard({
  session,
  dashboardDataPromise,
  canViewOrders,
  canViewInventory,
  canViewReports,
}: StorefrontDashboardProps) {
  return (
    <section className="space-y-4">
      <DashboardHeroCompact session={session} theme={cafeTheme} />

      <DashboardMetricsHeader
        canViewReports={canViewReports}
        language={session.language}
        theme={cafeTheme}
      />

      <Suspense fallback={<DashboardCardsSkeleton language={session.language} theme={cafeTheme} />}>
        <DashboardMetricCards
          dashboardDataPromise={dashboardDataPromise}
          language={session.language}
          theme={cafeTheme}
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
