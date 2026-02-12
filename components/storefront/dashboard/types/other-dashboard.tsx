import Link from "next/link";
import { Suspense } from "react";
import { AppWindow } from "lucide-react";

import {
  DashboardCardsSkeleton,
  LowStock,
  LowStockSkeleton,
  TodaySales,
  TodaySalesSkeleton,
  type StorefrontDashboardProps,
} from "@/components/storefront/dashboard/shared";

async function OtherDashboardCards({
  dashboardDataPromise,
  activeRoleName,
}: {
  dashboardDataPromise: StorefrontDashboardProps["dashboardDataPromise"];
  activeRoleName: string | null | undefined;
}) {
  const dashboardData = await dashboardDataPromise;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">ออเดอร์วันนี้</p>
        <p className="mt-1 text-2xl font-semibold">
          {dashboardData.metrics.ordersCountToday.toLocaleString("th-TH")}
        </p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">รอชำระ</p>
        <p className="mt-1 text-2xl font-semibold">
          {dashboardData.metrics.pendingPaymentCount.toLocaleString("th-TH")}
        </p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">สินค้าใกล้หมด</p>
        <p className="mt-1 text-2xl font-semibold">
          {dashboardData.metrics.lowStockCount.toLocaleString("th-TH")}
        </p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">บทบาทในร้าน</p>
        <p className="mt-1 text-sm font-medium">{activeRoleName ?? "ยังไม่มีบทบาท"}</p>
      </div>
    </div>
  );
}

export function OtherStorefrontDashboard({
  session,
  dashboardDataPromise,
  canViewInventory,
  canViewReports,
}: StorefrontDashboardProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-100 via-indigo-50 to-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Other POS</p>
            <h1 className="mt-1 text-xl font-semibold text-violet-950">{session.displayName}</h1>
          </div>
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-900 text-violet-50">
            <AppWindow className="h-5 w-5" />
          </div>
        </div>
        <Suspense fallback={<TodaySalesSkeleton className="mt-1 text-sm text-violet-800/80" />}>
          <TodaySales
            dashboardDataPromise={dashboardDataPromise}
            className="mt-1 text-sm text-violet-800"
          />
        </Suspense>
      </div>

      <Suspense fallback={<DashboardCardsSkeleton activeRoleName={session.activeRoleName} />}>
        <OtherDashboardCards
          dashboardDataPromise={dashboardDataPromise}
          activeRoleName={session.activeRoleName}
        />
      </Suspense>

      {canViewInventory ? (
        <Suspense fallback={<LowStockSkeleton />}>
          <LowStock dashboardDataPromise={dashboardDataPromise} />
        </Suspense>
      ) : null}

      {canViewReports ? (
        <Link href="/reports" className="text-sm font-medium text-violet-800 hover:underline">
          ดูรายงานเพิ่มเติม
        </Link>
      ) : null}
    </section>
  );
}

