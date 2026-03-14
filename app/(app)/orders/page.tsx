import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getAppShellContext } from "@/lib/app-shell/context";
import { createTranslator } from "@/lib/i18n/translate";
import { startServerRenderTimer } from "@/lib/perf/server";
import {
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getOrderCatalogForStore, type OrderListTab, listOrdersByTab } from "@/lib/orders/queries";

const OrdersManagement = dynamic(
  () => import("@/components/app/orders-management").then((module) => module.OrdersManagement),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground" />
    ),
  },
);

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const finishRenderTimer = startServerRenderTimer("page.orders");

  try {
    const [{ session, permissionKeys }, params] = await Promise.all([
      getAppShellContext(),
      searchParams,
    ]);

    if (!session) {
      redirect("/login");
    }

    if (!session.activeStoreId) {
      redirect("/onboarding");
    }

    const tabParam = params.tab ?? "ALL";
    const tab: OrderListTab =
      tabParam === "PENDING_PAYMENT" || tabParam === "PAID" || tabParam === "SHIPPED"
        ? tabParam
        : "ALL";
    const pageParam = Number(params.page ?? "1");
    const page = Number.isFinite(pageParam) ? pageParam : 1;

    const canView = isPermissionGranted(permissionKeys, "orders.view");
    const canCreate = isPermissionGranted(permissionKeys, "orders.create");
    const canMarkPaid = isPermissionGranted(permissionKeys, "orders.mark_paid");
    const canRequestCancel =
      isPermissionGranted(permissionKeys, "orders.update") ||
      isPermissionGranted(permissionKeys, "orders.cancel") ||
      isPermissionGranted(permissionKeys, "orders.delete");
    const canSelfApproveCancel =
      session.activeRoleName === "Owner" || session.activeRoleName === "Manager";

    const t = createTranslator(session.language);

    if (!canView) {
      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">{t("orders.pageTitle")}</h1>
          <p className="text-sm text-red-600">{t("orders.noPermission")}</p>
        </section>
      );
    }

    const [catalog, ordersPage] = await Promise.all([
      getOrderCatalogForStore(session.activeStoreId),
      listOrdersByTab(session.activeStoreId, tab, { page, pageSize: 20 }),
    ]);

    return (
      <section className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">{t("orders.pageTitle")}</h1>
          {canMarkPaid ? (
            <Link
              href="/orders/cod-reconcile"
              className="inline-flex h-9 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700"
            >
              <span className="sm:hidden">{t("orders.codButtonShort")}</span>
              <span className="hidden sm:inline">{t("orders.codButtonFull")}</span>
            </Link>
          ) : null}
        </header>

        <OrdersManagement
          ordersPage={ordersPage}
          activeTab={tab}
          catalog={catalog}
          language={session.language}
          canCreate={canCreate}
          canRequestCancel={canRequestCancel}
          canSelfApproveCancel={canSelfApproveCancel}
        />

        <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
          {t("orders.backToDashboard")}
        </Link>
      </section>
    );
  } finally {
    finishRenderTimer();
  }
}
