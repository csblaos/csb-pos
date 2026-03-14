import { Suspense } from "react";

import {
  CodReconcileReminder,
  DashboardHeroCompact,
  DashboardMetricsHeader,
  DashboardMetricCards,
  DashboardCardsSkeleton,
  LowStock,
  LowStockSkeleton,
  PurchaseApReminder,
  PurchaseApReminderSkeleton,
  type StorefrontDashboardProps,
} from "@/components/storefront/dashboard/shared";

export function OnlineStorefrontDashboard({
  session,
  dashboardDataPromise,
  canViewOrders,
  canViewInventory,
  canViewReports,
}: StorefrontDashboardProps) {
  return (
    <section className="space-y-4">
      <DashboardHeroCompact session={session} />

      <DashboardMetricsHeader canViewReports={canViewReports} language={session.language} />

      <Suspense fallback={<DashboardCardsSkeleton language={session.language} />}>
        <DashboardMetricCards
          dashboardDataPromise={dashboardDataPromise}
          language={session.language}
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
