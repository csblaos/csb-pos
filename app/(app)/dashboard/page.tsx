import { redirect } from "next/navigation";

import { StorefrontDashboardByType } from "@/components/storefront/dashboard/registry";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createTranslator } from "@/lib/i18n/translate";
import {
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
    pendingCodReconcileCount: 0,
  },
  lowStockItems: [],
  purchaseApReminder: {
    storeCurrency: "LAK",
    summary: {
      overdueCount: 0,
      dueSoonCount: 0,
      overdueOutstandingBase: 0,
      dueSoonOutstandingBase: 0,
      items: [],
    },
  },
};

export default async function DashboardPage() {
  const perf = createPerfScope("page.dashboard", "render");

  try {
    const { session, permissionKeys, activeStoreType } = await perf.step(
      "sessionAndPermissions.parallel",
      async () => getAppShellContext(),
    );

    if (!session) {
      redirect("/login");
    }

    const canView = isPermissionGranted(permissionKeys, "dashboard.view");
    const canViewOrders = isPermissionGranted(permissionKeys, "orders.view");
    const canViewInventory = isPermissionGranted(permissionKeys, "inventory.view");
    const canViewReports = isPermissionGranted(permissionKeys, "reports.view");
    const t = createTranslator(session.language);

    if (!canView) {
      const fallbackRoute = getPreferredAuthorizedRoute(permissionKeys);
      if (fallbackRoute && fallbackRoute !== "/dashboard") {
        redirect(fallbackRoute);
      }

      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>
          <p className="text-sm text-red-600">{t("dashboard.noPermission")}</p>
        </section>
      );
    }

    const activeStoreId = session.activeStoreId;

    const dashboardDataPromise = activeStoreId
      ? perf.step("service.getDashboardViewData", async () =>
          getDashboardViewData({
            storeId: activeStoreId,
            useCache: true,
          }),
        )
      : Promise.resolve(emptyDashboardData);

    return (
      <StorefrontDashboardByType
        storeType={activeStoreType}
        session={session}
        dashboardDataPromise={dashboardDataPromise}
        canViewOrders={canViewOrders}
        canViewInventory={canViewInventory}
        canViewReports={canViewReports}
      />
    );
  } finally {
    perf.end();
  }
}
