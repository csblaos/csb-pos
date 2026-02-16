import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { currencySymbol } from "@/lib/finance/store-financial";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getPurchaseOrderDetail } from "@/server/services/purchase.service";

const printableStatuses = new Set(["ORDERED", "SHIPPED", "RECEIVED", "CANCELLED"] as const);

export default async function PrintPurchaseOrderPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  if (!isPermissionGranted(permissionKeys, "inventory.view")) {
    redirect("/stock");
  }

  const { poId } = await params;
  const po = await getPurchaseOrderDetail(poId, session.activeStoreId);
  if (!printableStatuses.has(po.status as "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED")) {
    redirect("/stock");
  }

  const [storeRow] = await db
    .select({
      name: stores.name,
      address: stores.address,
      phoneNumber: stores.phoneNumber,
      currency: stores.currency,
    })
    .from(stores)
    .where(eq(stores.id, session.activeStoreId))
    .limit(1);

  if (!storeRow) {
    notFound();
  }

  const symbol = currencySymbol(storeRow.currency);
  const formatMoney = (value: number) => `${symbol}${value.toLocaleString("th-TH")}`;
  const grandTotal = po.totalCostBase + po.shippingCost + po.otherCost;

  return (
    <main className="mx-auto w-full max-w-[210mm] bg-white p-6 text-black sm:p-8 print:max-w-none print:p-0">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <p className="text-xs text-slate-500">Purchase Order</p>
        <h1 className="text-2xl font-semibold">ใบสั่งซื้อ (PO)</h1>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">{storeRow.name}</p>
            <p className="text-slate-600">{storeRow.address || "-"}</p>
            <p className="text-slate-600">โทร {storeRow.phoneNumber || "-"}</p>
          </div>
          <div className="space-y-1 text-sm sm:text-right">
            <p>
              <span className="text-slate-500">เลขที่ PO:</span> {po.poNumber}
            </p>
            <p>
              <span className="text-slate-500">วันที่สร้าง:</span>{" "}
              {new Date(po.createdAt).toLocaleDateString("th-TH")}
            </p>
            <p>
              <span className="text-slate-500">วันที่ยืนยัน:</span>{" "}
              {po.orderedAt
                ? new Date(po.orderedAt).toLocaleDateString("th-TH")
                : "-"}
            </p>
            <p>
              <span className="text-slate-500">ซัพพลายเออร์:</span>{" "}
              {po.supplierName || "-"}
            </p>
          </div>
        </div>
      </header>

      <section>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-2">รายการ</th>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2 text-right">จำนวน</th>
              <th className="px-2 py-2 text-right">ราคา/หน่วย</th>
              <th className="px-2 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="px-2 py-2">{item.productName}</td>
                <td className="px-2 py-2 text-slate-600">{item.productSku}</td>
                <td className="px-2 py-2 text-right">{item.qtyOrdered.toLocaleString("th-TH")}</td>
                <td className="px-2 py-2 text-right">{formatMoney(item.unitCostBase)}</td>
                <td className="px-2 py-2 text-right">
                  {formatMoney(item.unitCostBase * item.qtyOrdered)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-5 ml-auto w-full max-w-xs space-y-1 text-sm">
        <p className="flex justify-between">
          <span className="text-slate-600">ยอดสินค้า</span>
          <span>{formatMoney(po.totalCostBase)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-slate-600">ค่าขนส่ง</span>
          <span>{formatMoney(po.shippingCost)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-slate-600">ค่าอื่นๆ</span>
          <span>{formatMoney(po.otherCost)}</span>
        </p>
        <p className="flex justify-between border-t border-slate-300 pt-1 text-base font-semibold">
          <span>ยอดรวมทั้งสิ้น</span>
          <span>{formatMoney(grandTotal)}</span>
        </p>
      </section>

      <section className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-2 font-medium">หมายเหตุ</p>
          <p className="min-h-16 rounded border border-slate-300 p-2 text-slate-700">
            {po.note || "-"}
          </p>
        </div>
        <div className="space-y-6">
          <div>
            <p className="mb-7 border-b border-slate-400" />
            <p className="text-center text-xs text-slate-600">ผู้อนุมัติ / ผู้สั่งซื้อ</p>
          </div>
          <div>
            <p className="mb-7 border-b border-slate-400" />
            <p className="text-center text-xs text-slate-600">ซัพพลายเออร์</p>
          </div>
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-slate-500 print:hidden">
        ใช้คำสั่งพิมพ์ของเบราว์เซอร์ (Cmd+P) เพื่อพิมพ์หรือบันทึกเป็น PDF
      </p>
    </main>
  );
}
