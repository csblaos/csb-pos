import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getPreferredAuthorizedRoute } from "@/lib/rbac/navigation";
import {
  getDashboardViewData,
  type DashboardViewData,
} from "@/server/services/dashboard.service";
import { createPerfScope } from "@/server/perf/perf";

const emptyDashboardData: DashboardViewData = {
  metrics: {
    todaySales: 0,
    ordersCountToday: 0,
    pendingPaymentCount: 0,
    lowStockCount: 0,
  },
  lowStockItems: [],
};

function TodaySalesSkeleton() {
  return (
    <p className="mt-1 text-sm text-white/80">
      ยอดขายวันนี้ <span className="inline-block h-4 w-24 animate-pulse rounded bg-white/30" />
    </p>
  );
}

async function TodaySales({
  dashboardDataPromise,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
}) {
  const dashboardData = await dashboardDataPromise;

  return (
    <p className="mt-1 text-sm text-white/80">
      ยอดขายวันนี้ {dashboardData.metrics.todaySales.toLocaleString("th-TH")} บาท
    </p>
  );
}

function DashboardCardsSkeleton({ activeRoleName }: { activeRoleName: string | null | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {["ออเดอร์วันนี้", "รอชำระ", "สินค้าใกล้หมด"].map((label) => (
        <div key={label} className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">บทบาทในร้าน</p>
        <p className="mt-1 text-sm font-medium">{activeRoleName ?? "ยังไม่มีบทบาท"}</p>
      </div>
    </div>
  );
}

async function DashboardCards({
  dashboardDataPromise,
  activeRoleName,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
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

function LowStockSkeleton() {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium">สินค้าใกล้หมด (≤ 10 หน่วยหลัก)</p>
      <div className="mt-2 space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

async function LowStock({
  dashboardDataPromise,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
}) {
  const dashboardData = await dashboardDataPromise;

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium">สินค้าใกล้หมด (≤ 10 หน่วยหลัก)</p>
      {dashboardData.lowStockItems.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">ยังไม่มีสินค้าใกล้หมด</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {dashboardData.lowStockItems.slice(0, 5).map((item) => (
            <li key={item.productId}>
              {item.sku} - {item.name}: {item.available.toLocaleString("th-TH")}{" "}
              {item.baseUnitCode}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const perf = createPerfScope("page.dashboard", "render");

  try {
    const [session, permissionKeys] = await perf.step("sessionAndPermissions.parallel", async () =>
      Promise.all([getSession(), getUserPermissionsForCurrentSession()]),
    );

    const canView = isPermissionGranted(permissionKeys, "dashboard.view");
    const canViewInventory = isPermissionGranted(permissionKeys, "inventory.view");
    const canViewReports = isPermissionGranted(permissionKeys, "reports.view");

    if (!canView) {
      const fallbackRoute = getPreferredAuthorizedRoute(permissionKeys);
      if (fallbackRoute && fallbackRoute !== "/dashboard") {
        redirect(fallbackRoute);
      }

      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">แดชบอร์ด</h1>
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงแดชบอร์ด</p>
        </section>
      );
    }

    const activeStoreId = session?.activeStoreId;

    const dashboardDataPromise = activeStoreId
      ? perf.step("service.getDashboardViewData", async () =>
          getDashboardViewData({
            storeId: activeStoreId,
            thresholdBase: 10,
            useCache: true,
          }),
        )
      : Promise.resolve(emptyDashboardData);

    return (
      <section className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-5 text-white">
          <p className="text-sm text-white/80">สวัสดี</p>
          <h1 className="text-xl font-semibold">{session?.displayName}</h1>
          <Suspense fallback={<TodaySalesSkeleton />}>
            <TodaySales dashboardDataPromise={dashboardDataPromise} />
          </Suspense>
        </div>

        <Suspense fallback={<DashboardCardsSkeleton activeRoleName={session?.activeRoleName} />}>
          <DashboardCards
            dashboardDataPromise={dashboardDataPromise}
            activeRoleName={session?.activeRoleName}
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
  } finally {
    perf.end();
  }
}
