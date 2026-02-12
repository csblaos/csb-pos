import { redirect } from "next/navigation";

import { StorefrontDashboardByType } from "@/components/storefront/dashboard/registry";
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

export default async function DashboardPage() {
  const perf = createPerfScope("page.dashboard", "render");

  try {
    const [session, permissionKeys] = await perf.step("sessionAndPermissions.parallel", async () =>
      Promise.all([getSession(), getUserPermissionsForCurrentSession()]),
    );

    if (!session) {
      redirect("/login");
    }

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

    const activeStoreId = session.activeStoreId;

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
      <StorefrontDashboardByType
        storeType={session.activeStoreType}
        session={session}
        dashboardDataPromise={dashboardDataPromise}
        canViewInventory={canViewInventory}
        canViewReports={canViewReports}
      />
    );
  } finally {
    perf.end();
  }
}
