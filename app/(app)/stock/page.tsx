import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { createPerfScope } from "@/server/perf/perf";
import { getStockOverview } from "@/server/services/stock.service";

const StockLedger = dynamic(
  () => import("@/components/app/stock-ledger").then((module) => module.StockLedger),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลดหน้าสต็อก...
      </div>
    ),
  },
);

export default async function StockPage() {
  const perf = createPerfScope("page.stock", "render");

  try {
    const [session, permissionKeys] = await perf.step("sessionAndPermissions.parallel", async () =>
      Promise.all([getSession(), getUserPermissionsForCurrentSession()]),
    );

    if (!session) {
      redirect("/login");
    }

    if (!session.activeStoreId) {
      redirect("/onboarding");
    }
    const activeStoreId = session.activeStoreId;

    const canView = isPermissionGranted(permissionKeys, "inventory.view");
    const canCreate = isPermissionGranted(permissionKeys, "inventory.create");
    const canInbound = isPermissionGranted(permissionKeys, "inventory.in");
    const canAdjust = isPermissionGranted(permissionKeys, "inventory.adjust");
    const canPostMovement = canCreate && (canInbound || canAdjust);

    if (!canView) {
      return (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold">สต็อก</h1>
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงโมดูลสต็อก</p>
        </section>
      );
    }

    const { products, movements: recentMovements } = await perf.step(
      "service.getStockOverview",
      async () =>
        getStockOverview({
          storeId: activeStoreId,
          movementLimit: 30,
          useCache: true,
        }),
    );

    return (
      <section className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">สต็อก</h1>
          <p className="text-sm text-muted-foreground">
            จัดการรับเข้า ปรับสต็อก และตรวจสอบยอดคงเหลือสินค้า
          </p>
        </header>

        <StockLedger
          products={products}
          recentMovements={recentMovements}
          canCreate={canPostMovement}
          canAdjust={canAdjust}
          canInbound={canInbound}
        />
      </section>
    );
  } finally {
    perf.end();
  }
}
