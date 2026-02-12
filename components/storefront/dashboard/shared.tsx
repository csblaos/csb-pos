import type { AppSession } from "@/lib/auth/session-types";
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

