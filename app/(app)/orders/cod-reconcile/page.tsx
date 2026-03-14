import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";

const OrdersCodReconcile = dynamic(
  () =>
    import("@/components/app/orders-cod-reconcile").then(
      (module) => module.OrdersCodReconcile,
    ),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลดหน้า COD Reconcile...
      </div>
    ),
  },
);

export default async function OrdersCodReconcilePage() {
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
  const canMarkPaid = isPermissionGranted(permissionKeys, "orders.mark_paid");

  if (!canView || !canMarkPaid) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">COD Reconcile</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">COD Reconcile รายวัน</h1>
        <p className="text-sm text-muted-foreground">
          ปิดยอด COD หลายรายการในหน้าเดียว เพื่อลดงานตรวจมือและกันยอดตกหล่น
        </p>
      </header>

      <OrdersCodReconcile />
    </section>
  );
}
