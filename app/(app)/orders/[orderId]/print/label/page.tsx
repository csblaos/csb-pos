import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getOrderDetail } from "@/lib/orders/queries";

export default async function PrintLabelPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  if (!isPermissionGranted(permissionKeys, "orders.view")) {
    redirect("/orders");
  }

  const { orderId } = await params;
  const order = await getOrderDetail(session.activeStoreId, orderId);

  if (!order) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-[148mm] w-[105mm] flex-col justify-between border bg-white p-4 text-black">
      <section>
        <h1 className="text-lg font-semibold">ป้ายจัดส่ง A6</h1>
        <p className="text-sm text-slate-700">ออเดอร์ {order.orderNo}</p>
        <p className="text-sm">สถานะ: {order.status}</p>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-slate-600">ผู้รับ</p>
        <p className="text-base font-medium">{order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป"}</p>
        <p className="text-sm">โทร: {order.customerPhone || order.contactPhone || "-"}</p>
        <p className="whitespace-pre-wrap text-sm">{order.customerAddress || "-"}</p>
      </section>

      <section className="space-y-1 border-t pt-3 text-sm">
        <p>ขนส่ง: {order.shippingCarrier || "-"}</p>
        <p>Tracking: {order.trackingNo || "-"}</p>
        <p>ต้นทุนค่าส่ง: {order.shippingCost.toLocaleString("th-TH")} {order.storeCurrency}</p>
      </section>
    </main>
  );
}
