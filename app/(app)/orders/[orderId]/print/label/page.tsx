import { notFound, redirect } from "next/navigation";

import { ReceiptPrintActions } from "@/components/app/receipt-print-actions";
import { getSession } from "@/lib/auth/session";
import { currencySymbol, parseStoreCurrency } from "@/lib/finance/store-financial";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getOrderDetail } from "@/lib/orders/queries";

export default async function PrintLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const autoPrintParam = resolvedSearchParams?.autoprint;
  const returnToParam = resolvedSearchParams?.returnTo;
  const autoPrint =
    (typeof autoPrintParam === "string" ? autoPrintParam : autoPrintParam?.[0]) === "1";
  const rawReturnTo =
    typeof returnToParam === "string" ? returnToParam : (returnToParam?.[0] ?? "");
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : null;
  const order = await getOrderDetail(session.activeStoreId, orderId);
  const storeCurrencyDisplay = currencySymbol(parseStoreCurrency(order?.storeCurrency));

  if (!order) {
    notFound();
  }

  return (
    <>
      <style>{`
        @media print {
          header,
          nav[aria-label="เมนูหลัก"] {
            display: none !important;
          }
          main {
            padding: 0 !important;
          }
        }
      `}</style>
      <main className="mx-auto w-[105mm] bg-white p-4 text-black">
        <section className="mx-auto flex min-h-[148mm] flex-col justify-between border bg-white p-4">
          <section>
            <h1 className="text-lg font-semibold">ป้ายจัดส่ง A6</h1>
            <p className="text-sm text-slate-700">ออเดอร์ {order.orderNo}</p>
            <p className="text-sm">สถานะ: {order.status}</p>
          </section>

          <section className="space-y-2">
            <p className="text-xs text-slate-600">ผู้รับ</p>
            <p className="text-base font-medium">
              {order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป"}
            </p>
            <p className="text-sm">โทร: {order.customerPhone || order.contactPhone || "-"}</p>
            <p className="whitespace-pre-wrap text-sm">{order.customerAddress || "-"}</p>
          </section>

          <section className="space-y-1 border-t pt-3 text-sm">
            <p>ขนส่ง: {order.shippingProvider || order.shippingCarrier || "-"}</p>
            <p>Tracking: {order.trackingNo || "-"}</p>
            <p>
              ต้นทุนค่าส่ง: {order.shippingCost.toLocaleString("th-TH")} {storeCurrencyDisplay}
            </p>
          </section>
        </section>
        <ReceiptPrintActions autoPrint={autoPrint} returnTo={returnTo} />
      </main>
    </>
  );
}
