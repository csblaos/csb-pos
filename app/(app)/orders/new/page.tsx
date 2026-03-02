import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { startServerRenderTimer } from "@/lib/perf/server";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getOrderCatalogForStore } from "@/lib/orders/queries";

const OrdersManagement = dynamic(
  () => import("@/components/app/orders-management").then((module) => module.OrdersManagement),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลดฟอร์มสร้างออเดอร์...
      </div>
    ),
  },
);

export default async function NewOrderPage() {
  const finishRenderTimer = startServerRenderTimer("page.orders.new");

  try {
    const [session, permissionKeys] = await Promise.all([
      getSession(),
      getUserPermissionsForCurrentSession(),
    ]);

    if (!session) {
      redirect("/login");
    }

    if (!session.activeStoreId) {
      redirect("/onboarding");
    }

    const canView = isPermissionGranted(permissionKeys, "orders.view");
    const canCreate = isPermissionGranted(permissionKeys, "orders.create");

    if (!canView) {
      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">สร้างออเดอร์ใหม่</h1>
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงโมดูลออเดอร์</p>
          <Link href="/orders" className="text-sm font-medium text-blue-700 hover:underline">
            กลับไปหน้ารายการขาย
          </Link>
        </section>
      );
    }

    const catalog = await getOrderCatalogForStore(session.activeStoreId);

    return (
      <section>
        <OrdersManagement mode="create-only" catalog={catalog} canCreate={canCreate} />
      </section>
    );
  } finally {
    finishRenderTimer();
  }
}
