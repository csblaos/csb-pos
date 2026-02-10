import Link from "next/link";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getDashboardViewData } from "@/server/services/dashboard.service";
import { createPerfScope } from "@/server/perf/perf";

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
      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">แดชบอร์ด</h1>
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงแดชบอร์ด</p>
        </section>
      );
    }

    const activeStoreId = session?.activeStoreId;

    const dashboardData = activeStoreId
      ? await perf.step("service.getDashboardViewData", async () =>
          getDashboardViewData({
            storeId: activeStoreId,
            thresholdBase: 10,
            useCache: true,
          }),
        )
      : {
          metrics: {
            todaySales: 0,
            ordersCountToday: 0,
            pendingPaymentCount: 0,
            lowStockCount: 0,
          },
          lowStockItems: [],
        };

    return (
      <section className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-5 text-white">
          <p className="text-sm text-white/80">สวัสดี</p>
          <h1 className="text-xl font-semibold">{session?.displayName}</h1>
          <p className="mt-1 text-sm text-white/80">
            ยอดขายวันนี้ {dashboardData.metrics.todaySales.toLocaleString("th-TH")} บาท
          </p>
        </div>

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
            <p className="mt-1 text-sm font-medium">
              {session?.activeRoleName ?? "ยังไม่มีบทบาท"}
            </p>
          </div>
        </div>

        {canViewInventory ? (
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
