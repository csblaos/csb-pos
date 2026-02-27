import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getReportsViewData } from "@/server/services/reports.service";

const channelLabel: Record<"WALK_IN" | "FACEBOOK" | "WHATSAPP", string> = {
  WALK_IN: "Walk-in",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
};
const fmtSigned = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("th-TH")}`;

export default async function ReportsPage() {
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

  const canView = isPermissionGranted(permissionKeys, "reports.view");

  if (!canView) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">รายงาน</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงรายงาน</p>
      </section>
    );
  }

  const {
    storeCurrency,
    salesSummary,
    topProducts,
    salesByChannel,
    grossProfit,
    purchaseFx,
    purchaseApAging,
  } =
    await getReportsViewData({
      storeId: session.activeStoreId,
      topProductsLimit: 10,
      useCache: true,
    });

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">รายงาน</h1>
        <p className="text-sm text-muted-foreground">ยอดขาย กำไรขั้นต้น และสินค้าขายดี</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">ยอดขายวันนี้</p>
          <p className="mt-1 text-xl font-semibold">
            {salesSummary.salesToday.toLocaleString("th-TH")} {storeCurrency}
          </p>
        </article>
        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">ยอดขายเดือนนี้</p>
          <p className="mt-1 text-xl font-semibold">
            {salesSummary.salesThisMonth.toLocaleString("th-TH")} {storeCurrency}
          </p>
        </article>
      </div>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">กำไรขั้นต้น</h2>
        <p className="text-sm">รายรับ: {grossProfit.revenue.toLocaleString("th-TH")} {storeCurrency}</p>
        <p className="text-xs text-muted-foreground">แบบรับรู้จริง (snapshot ตอนขาย)</p>
        <p className="text-sm">ต้นทุนสินค้า: {grossProfit.cogs.toLocaleString("th-TH")} {storeCurrency}</p>
        <p className="text-sm">ต้นทุนค่าส่ง: {grossProfit.shippingCost.toLocaleString("th-TH")} {storeCurrency}</p>
        <p className="text-sm font-semibold">
          กำไรขั้นต้น: {grossProfit.grossProfit.toLocaleString("th-TH")} {storeCurrency}
        </p>
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">แบบประเมินด้วยต้นทุนปัจจุบัน (Current Cost Preview)</p>
          <p className="text-sm">
            ต้นทุนสินค้า (ประเมิน): {grossProfit.currentCostCogs.toLocaleString("th-TH")} {storeCurrency}
          </p>
          <p className="text-sm font-semibold">
            กำไรขั้นต้น (ประเมิน): {grossProfit.currentCostGrossProfit.toLocaleString("th-TH")} {storeCurrency}
          </p>
          <p className="text-xs text-muted-foreground">
            ส่วนต่างเทียบแบบรับรู้จริง: {fmtSigned(grossProfit.grossProfitDeltaVsCurrentCost)} {storeCurrency}
          </p>
        </div>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">ผลต่างอัตราแลกเปลี่ยน (PO)</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p>รอปิดเรท: {purchaseFx.pendingRateCount.toLocaleString("th-TH")}</p>
          <p>รอปิดเรทและยังไม่ชำระ: {purchaseFx.pendingRateUnpaidCount.toLocaleString("th-TH")}</p>
          <p>ปิดเรทแล้ว: {purchaseFx.lockedCount.toLocaleString("th-TH")}</p>
          <p>มีส่วนต่างเรท: {purchaseFx.changedRateCount.toLocaleString("th-TH")}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          ผลรวมผลต่างมูลค่า (เรทจริง - เรทตั้งต้น): {fmtSigned(purchaseFx.totalRateDeltaBase)} {storeCurrency}
        </p>
        {purchaseFx.recentLocks.length > 0 ? (
          <div className="space-y-1 pt-1 text-xs">
            {purchaseFx.recentLocks.map((item) => {
              const deltaRate = item.exchangeRate - item.exchangeRateInitial;
              return (
                <p key={item.id}>
                  {item.poNumber}
                  {item.supplierName ? ` · ${item.supplierName}` : ""}
                  {" · "}
                  {item.purchaseCurrency} {item.exchangeRateInitial}→{item.exchangeRate}
                  {" ("}
                  {fmtSigned(deltaRate)}
                  {")"}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ยังไม่มีรายการปิดเรท</p>
        )}
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">AP Aging (เจ้าหนี้ค้างจ่าย)</h2>
          <Link
            href="/api/stock/purchase-orders/outstanding/export-csv"
            prefetch={false}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Export CSV
          </Link>
        </div>
        <p className="text-sm">
          ยอดค้างรวม: {purchaseApAging.totalOutstandingBase.toLocaleString("th-TH")} {storeCurrency}
        </p>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="font-medium">0-30 วัน</p>
            <p>{purchaseApAging.bucket0To30.count.toLocaleString("th-TH")} ใบ</p>
            <p>{purchaseApAging.bucket0To30.amountBase.toLocaleString("th-TH")} {storeCurrency}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="font-medium">31-60 วัน</p>
            <p>{purchaseApAging.bucket31To60.count.toLocaleString("th-TH")} ใบ</p>
            <p>{purchaseApAging.bucket31To60.amountBase.toLocaleString("th-TH")} {storeCurrency}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-2">
            <p className="font-medium">61+ วัน</p>
            <p>{purchaseApAging.bucket61Plus.count.toLocaleString("th-TH")} ใบ</p>
            <p>{purchaseApAging.bucket61Plus.amountBase.toLocaleString("th-TH")} {storeCurrency}</p>
          </div>
        </div>
        {purchaseApAging.suppliers.length > 0 ? (
          <div className="space-y-1 pt-1 text-xs">
            {purchaseApAging.suppliers.slice(0, 5).map((supplier) => (
              <p key={supplier.supplierName}>
                {supplier.supplierName} · ค้าง {supplier.outstandingBase.toLocaleString("th-TH")} {storeCurrency}
                {" · FX "}
                {fmtSigned(supplier.fxDeltaBase)} {storeCurrency}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่มี PO ค้างชำระ</p>
        )}
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">ยอดขายตามช่องทาง</h2>
        <div className="space-y-1 text-sm">
          {salesByChannel.length === 0 ? (
            <p className="text-muted-foreground">ยังไม่มีข้อมูล</p>
          ) : (
            salesByChannel.map((row) => (
              <p key={row.channel}>
                {channelLabel[row.channel]}: {row.salesTotal.toLocaleString("th-TH")} {storeCurrency} ({row.orderCount.toLocaleString("th-TH")} ออเดอร์)
              </p>
            ))
          )}
        </div>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สินค้าขายดี</h2>
        <div className="space-y-2">
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
          ) : (
            topProducts.map((item) => (
              <div key={item.productId} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">{item.sku} - {item.name}</p>
                <p className="text-xs text-muted-foreground">
                  ขาย {item.qtyBaseSold.toLocaleString("th-TH")} หน่วยฐาน • รายได้ {item.revenue.toLocaleString("th-TH")} {storeCurrency} • ต้นทุน {item.cogs.toLocaleString("th-TH")} {storeCurrency}
                </p>
              </div>
            ))
          )}
        </div>
      </article>

      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปแดชบอร์ด
      </Link>
    </section>
  );
}
