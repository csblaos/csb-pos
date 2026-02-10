import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getOrderDetail } from "@/lib/orders/queries";

export default async function PrintReceiptPage({
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
    <main className="mx-auto w-[80mm] bg-white p-2 text-[12px] leading-tight text-black">
      <h1 className="text-center text-sm font-semibold">ใบเสร็จรับเงิน</h1>
      <p className="text-center text-[11px]">เลขที่ {order.orderNo}</p>
      <p className="mt-2">ลูกค้า: {order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป"}</p>
      <p>วันที่: {new Date(order.createdAt).toLocaleString("th-TH")}</p>
      <hr className="my-2 border-dashed" />

      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-left">รายการ</th>
            <th className="text-right">จำนวน</th>
            <th className="text-right">รวม</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="py-1">
                {item.productName}
                <div className="text-[10px] text-slate-600">{item.productSku}</div>
              </td>
              <td className="py-1 text-right">
                {item.qty} {item.unitCode}
              </td>
              <td className="py-1 text-right">
                {item.lineTotal.toLocaleString("th-TH")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="my-2 border-dashed" />

      <div className="space-y-1 text-[11px]">
        <p className="flex justify-between">
          <span>ยอดสินค้า</span>
          <span>{order.subtotal.toLocaleString("th-TH")}</span>
        </p>
        <p className="flex justify-between">
          <span>ส่วนลด</span>
          <span>{order.discount.toLocaleString("th-TH")}</span>
        </p>
        <p className="flex justify-between">
          <span>VAT</span>
          <span>{order.vatAmount.toLocaleString("th-TH")}</span>
        </p>
        <p className="flex justify-between">
          <span>ค่าส่ง</span>
          <span>{order.shippingFeeCharged.toLocaleString("th-TH")}</span>
        </p>
        <p className="flex justify-between font-semibold">
          <span>ยอดสุทธิ</span>
          <span>{order.total.toLocaleString("th-TH")} {order.storeCurrency}</span>
        </p>
      </div>

      <hr className="my-2 border-dashed" />
      <p className="text-center text-[11px]">ขอบคุณที่ใช้บริการ</p>
    </main>
  );
}
