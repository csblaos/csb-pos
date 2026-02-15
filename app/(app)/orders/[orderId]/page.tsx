import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrderDetailView } from "@/components/app/order-detail-view";
import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import {
  buildOrderMessageTemplate,
  buildWhatsappDeepLink,
  FACEBOOK_INBOX_URL,
  isWithin24Hours,
} from "@/lib/orders/messages";
import { getOrderDetail } from "@/lib/orders/queries";

export default async function OrderDetailPage({
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
  const canView = isPermissionGranted(permissionKeys, "orders.view");

  if (!canView) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">รายละเอียดออเดอร์</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/orders" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้ารายการขาย
        </Link>
      </section>
    );
  }

  const { orderId } = await params;
  const order = await getOrderDetail(session.activeStoreId, orderId);

  if (!order) {
    notFound();
  }

  const message = buildOrderMessageTemplate({
    orderNo: order.orderNo,
    total: order.total,
    currency: order.paymentCurrency,
    customerName: order.customerName ?? order.contactDisplayName,
  });

  const within24h = isWithin24Hours(order.contactLastInboundAt);
  const waDeepLink = order.contactPhone
    ? buildWhatsappDeepLink(order.contactPhone, message)
    : null;

  return (
    <section className="space-y-4">
      <OrderDetailView
        order={order}
        messaging={{
          within24h,
          template: message,
          waDeepLink,
          facebookInboxUrl: FACEBOOK_INBOX_URL,
        }}
        canUpdate={isPermissionGranted(permissionKeys, "orders.update")}
        canMarkPaid={isPermissionGranted(permissionKeys, "orders.mark_paid")}
        canPack={isPermissionGranted(permissionKeys, "orders.pack")}
        canShip={isPermissionGranted(permissionKeys, "orders.ship")}
        canCancel={
          isPermissionGranted(permissionKeys, "orders.cancel") ||
          isPermissionGranted(permissionKeys, "orders.delete")
        }
      />

      <Link href="/orders" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปหน้ารายการขาย
      </Link>
    </section>
  );
}
