import Link from "next/link";

import type { AppSession } from "@/lib/auth/session-types";
import { currencySymbol, type StoreCurrency } from "@/lib/finance/store-financial";
import type { DashboardViewData } from "@/server/services/dashboard.service";

export type StorefrontDashboardProps = {
  session: AppSession;
  dashboardDataPromise: Promise<DashboardViewData>;
  canViewInventory: boolean;
  canViewReports: boolean;
};

export function TodaySalesSkeleton({ className }: { className?: string }) {
  return (
    <p className={className ?? "mt-1 text-sm text-white/80"}>
      ยอดขายวันนี้ <span className="inline-block h-4 w-24 animate-pulse rounded bg-white/30" />
    </p>
  );
}

export async function TodaySales({
  dashboardDataPromise,
  className,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
  className?: string;
}) {
  const dashboardData = await dashboardDataPromise;

  return (
    <p className={className ?? "mt-1 text-sm text-white/80"}>
      ยอดขายวันนี้ {dashboardData.metrics.todaySales.toLocaleString("th-TH")} บาท
    </p>
  );
}

export function DashboardCardsSkeleton({
  activeRoleName,
}: {
  activeRoleName: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {["ออเดอร์วันนี้", "รอชำระ", "สินค้าใกล้หมด"].map((label) => (
        <div key={label} className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">บทบาทในร้าน</p>
        <p className="mt-1 text-sm font-medium">{activeRoleName ?? "ยังไม่มีบทบาท"}</p>
      </div>
    </div>
  );
}

export function LowStockSkeleton() {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium">สินค้าใกล้หมด (≤ 10 หน่วยหลัก)</p>
      <div className="mt-2 space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

export async function LowStock({
  dashboardDataPromise,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
}) {
  const dashboardData = await dashboardDataPromise;

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium">สินค้าใกล้หมด (≤ 10 หน่วยหลัก)</p>
      {dashboardData.lowStockItems.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">ยังไม่มีสินค้าใกล้หมด</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {dashboardData.lowStockItems.slice(0, 5).map((item) => (
            <li key={item.productId}>
              {item.sku} - {item.name}: {item.available.toLocaleString("th-TH")}{" "}
              {item.baseUnitCode}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtPrice(amount: number, currency: StoreCurrency): string {
  return `${currencySymbol(currency)}${amount.toLocaleString("th-TH")}`;
}

function formatDate(dateValue: string | null): string {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PurchaseApReminderSkeleton() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">งานเจ้าหนี้ค้างชำระ</p>
      <div className="mt-2 space-y-2">
        <div className="h-4 w-56 animate-pulse rounded bg-amber-200/70" />
        <div className="h-4 w-48 animate-pulse rounded bg-amber-200/70" />
        <div className="h-4 w-full animate-pulse rounded bg-amber-200/70" />
      </div>
    </div>
  );
}

export async function PurchaseApReminder({
  dashboardDataPromise,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
}) {
  const dashboardData = await dashboardDataPromise;
  const reminder = dashboardData.purchaseApReminder;
  const hasReminder =
    reminder.summary.overdueCount > 0 || reminder.summary.dueSoonCount > 0;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-amber-900">
          งานเจ้าหนี้ค้างชำระ (AP)
        </p>
        <Link
          href="/stock?tab=purchase"
          className="text-xs font-medium text-amber-800 hover:underline"
        >
          ไปหน้า PO
        </Link>
      </div>
      <p className="mt-1 text-xs text-amber-800/90">
        เลยกำหนด {reminder.summary.overdueCount.toLocaleString("th-TH")} รายการ
        {" · "}
        ใกล้ครบกำหนด {reminder.summary.dueSoonCount.toLocaleString("th-TH")} รายการ
      </p>
      <p className="text-xs text-amber-800/90">
        ยอดเลยกำหนด{" "}
        {fmtPrice(reminder.summary.overdueOutstandingBase, reminder.storeCurrency)}
        {" · "}
        ยอดใกล้ครบกำหนด{" "}
        {fmtPrice(reminder.summary.dueSoonOutstandingBase, reminder.storeCurrency)}
      </p>

      {!hasReminder ? (
        <p className="mt-2 text-sm text-amber-800/90">
          ตอนนี้ไม่มีรายการ PO ที่ใกล้ครบกำหนดหรือเลยกำหนด
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-xs text-amber-950">
          {reminder.summary.items.map((item) => (
            <li key={item.poId} className="rounded-lg border border-amber-200 bg-white px-2.5 py-2">
              <p className="font-medium">
                {item.poNumber} · {item.supplierName}
              </p>
              <p className="text-amber-800/90">
                {item.dueStatus === "OVERDUE"
                  ? `เลยกำหนด ${Math.abs(item.daysUntilDue)} วัน`
                  : `ครบกำหนดใน ${item.daysUntilDue} วัน`}
                {" · due "}
                {formatDate(item.dueDate)}
                {" · ค้าง "}
                {fmtPrice(item.outstandingBase, reminder.storeCurrency)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
