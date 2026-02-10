import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { startServerRenderTimer } from "@/lib/perf/server";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getOrderCatalogForStore, type OrderListTab, listOrdersByTab } from "@/lib/orders/queries";

const OrdersManagement = dynamic(
  () => import("@/components/app/orders-management").then((module) => module.OrdersManagement),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลดหน้าจัดการออเดอร์...
      </div>
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
    const session = await getSession();
    if (!session) {
      redirect("/login");
    }

    if (!session.activeStoreId) {
      redirect("/onboarding");
    }

    const params = await searchParams;
    const tabParam = params.tab ?? "ALL";
    const tab: OrderListTab =
      tabParam === "PENDING_PAYMENT" || tabParam === "PAID" || tabParam === "SHIPPED"
        ? tabParam
        : "ALL";
    const pageParam = Number(params.page ?? "1");
    const page = Number.isFinite(pageParam) ? pageParam : 1;

    const permissionKeys = await getUserPermissionsForCurrentSession();
    const canView = isPermissionGranted(permissionKeys, "orders.view");
    const canCreate = isPermissionGranted(permissionKeys, "orders.create");

    if (!canView) {
      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">รายการขาย</h1>
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงโมดูลออเดอร์</p>
        </section>
      );
    }

    const [catalog, ordersPage] = await Promise.all([
      getOrderCatalogForStore(session.activeStoreId),
      listOrdersByTab(session.activeStoreId, tab, { page, pageSize: 20 }),
    ]);

    return (
      <section className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">รายการขาย</h1>
          <p className="text-sm text-muted-foreground">
            สร้างออเดอร์ จัดการสถานะ และติดตามยอดขาย
          </p>
        </header>

        <OrdersManagement
          ordersPage={ordersPage}
          activeTab={tab}
          catalog={catalog}
          canCreate={canCreate}
        />

        <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปแดชบอร์ด
        </Link>
      </section>
    );
  } finally {
    finishRenderTimer();
  }
}
