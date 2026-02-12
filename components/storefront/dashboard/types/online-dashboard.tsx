import Link from "next/link";
import { Suspense } from "react";

import {
  DashboardCardsSkeleton,
  LowStock,
  LowStockSkeleton,
  TodaySales,
  TodaySalesSkeleton,
  type StorefrontDashboardProps,
} from "@/components/storefront/dashboard/shared";

async function OnlineDashboardCards({
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

export function OnlineStorefrontDashboard({
  session,
  dashboardDataPromise,
  canViewInventory,
  canViewReports,
}: StorefrontDashboardProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-5 text-white">
        <p className="text-sm text-white/80">สวัสดี</p>
        <h1 className="text-xl font-semibold">{session.displayName}</h1>
        <Suspense fallback={<TodaySalesSkeleton />}>
          <TodaySales dashboardDataPromise={dashboardDataPromise} />
        </Suspense>
      </div>

      <Suspense fallback={<DashboardCardsSkeleton activeRoleName={session.activeRoleName} />}>
        <OnlineDashboardCards
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
        <Link href="/reports" className="text-sm font-medium text-blue-700 hover:underline">
          ดูรายงานเพิ่มเติม
        </Link>
      ) : null}
    </section>
  );
}

