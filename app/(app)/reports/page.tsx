import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import {
  getGrossProfitSummary,
  getSalesByChannel,
  getSalesSummary,
  getTopProducts,
} from "@/lib/reports/queries";

const channelLabel: Record<"WALK_IN" | "FACEBOOK" | "WHATSAPP", string> = {
  WALK_IN: "Walk-in",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
};

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "reports.view");

  if (!canView) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">รายงาน</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงรายงาน</p>
      </section>
    );
  }

  const [salesSummary, topProducts, salesByChannel, grossProfit] = await Promise.all([
    getSalesSummary(session.activeStoreId),
    getTopProducts(session.activeStoreId, 10),
    getSalesByChannel(session.activeStoreId),
    getGrossProfitSummary(session.activeStoreId),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">รายงาน</h1>
        <p className="text-sm text-muted-foreground">ยอดขาย กำไรขั้นต้น และสินค้าขายดี</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">ยอดขายวันนี้</p>
          <p className="mt-1 text-xl font-semibold">{salesSummary.salesToday.toLocaleString("th-TH")}</p>
        </article>
        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">ยอดขายเดือนนี้</p>
          <p className="mt-1 text-xl font-semibold">{salesSummary.salesThisMonth.toLocaleString("th-TH")}</p>
        </article>
      </div>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">กำไรขั้นต้น</h2>
        <p className="text-sm">รายรับ: {grossProfit.revenue.toLocaleString("th-TH")}</p>
        <p className="text-sm">ต้นทุนสินค้า: {grossProfit.cogs.toLocaleString("th-TH")}</p>
        <p className="text-sm">ต้นทุนค่าส่ง: {grossProfit.shippingCost.toLocaleString("th-TH")}</p>
        <p className="text-sm font-semibold">กำไรขั้นต้น: {grossProfit.grossProfit.toLocaleString("th-TH")}</p>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">ยอดขายตามช่องทาง</h2>
        <div className="space-y-1 text-sm">
          {salesByChannel.length === 0 ? (
            <p className="text-muted-foreground">ยังไม่มีข้อมูล</p>
          ) : (
            salesByChannel.map((row) => (
              <p key={row.channel}>
                {channelLabel[row.channel]}: {row.salesTotal.toLocaleString("th-TH")} ({row.orderCount.toLocaleString("th-TH")} ออเดอร์)
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
                  ขาย {item.qtyBaseSold.toLocaleString("th-TH")} หน่วยฐาน • รายได้ {item.revenue.toLocaleString("th-TH")} • ต้นทุน {item.cogs.toLocaleString("th-TH")}
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
