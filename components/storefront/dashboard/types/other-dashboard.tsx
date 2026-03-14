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

const otherTheme: DashboardTheme = {
  ...defaultDashboardTheme,
  shellClassName: "rounded-2xl border border-violet-200 bg-violet-50/70 p-4 shadow-sm",
  shellTextClassName: "text-violet-950",
  shellSubtleTextClassName: "text-violet-800",
  shellBadgeClassName: "border border-violet-200 bg-white text-violet-900",
  reportButtonClassName:
    "border border-violet-200 bg-white text-violet-900 hover:bg-violet-50 hover:text-violet-700",
  quickActionPrimaryClassName:
    "border border-violet-900 bg-violet-900 text-violet-50 hover:bg-violet-800",
  quickActionSecondaryClassName:
    "border border-violet-200 bg-white text-violet-900 hover:bg-violet-50",
  metricCardClassName: "border border-violet-200 bg-white shadow-sm",
  metricLabelClassName: "text-violet-800/80",
  metricValueClassName: "text-violet-950",
};

export function OtherStorefrontDashboard({
  session,
  dashboardDataPromise,
  canViewOrders,
  canViewInventory,
  canViewReports,
}: StorefrontDashboardProps) {
  return (
    <section className="space-y-4">
      <DashboardHeroCompact session={session} theme={otherTheme} />

      <DashboardMetricsHeader
        canViewReports={canViewReports}
        language={session.language}
        theme={otherTheme}
      />

      <Suspense fallback={<DashboardCardsSkeleton language={session.language} theme={otherTheme} />}>
        <DashboardMetricCards
          dashboardDataPromise={dashboardDataPromise}
          language={session.language}
          theme={otherTheme}
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
