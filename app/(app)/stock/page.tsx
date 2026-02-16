import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { parseStoreCurrency } from "@/lib/finance/store-financial";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { createPerfScope } from "@/server/perf/perf";
import {
  getRecentStockMovements,
  getStockProductsPage,
} from "@/server/services/stock.service";
import { getPurchaseOrderListPage } from "@/server/services/purchase.service";

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

const PurchaseOrderList = dynamic(
  () =>
    import("@/components/app/purchase-order-list").then(
      (module) => module.PurchaseOrderList,
    ),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลด...
      </div>
    ),
  },
);

const StockTabs = dynamic(
  () =>
    import("@/components/app/stock-tabs").then((module) => module.StockTabs),
);

export default async function StockPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
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

    const PRODUCT_PAGE_SIZE = 20;
    const PO_PAGE_SIZE = 20;

    const [movements, purchaseOrderRows, stockProductRows, storeRow] =
      await perf.step("service.getStockAndPO", async () =>
        Promise.all([
          getRecentStockMovements({
            storeId: activeStoreId,
            limit: 30,
          }),
          getPurchaseOrderListPage(activeStoreId, PO_PAGE_SIZE + 1, 0),
          getStockProductsPage({
            storeId: activeStoreId,
            limit: PRODUCT_PAGE_SIZE + 1,
            offset: 0,
          }),
          db
            .select({ currency: stores.currency })
            .from(stores)
            .where(eq(stores.id, activeStoreId))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        ]),
      );

    const hasMoreProducts = stockProductRows.length > PRODUCT_PAGE_SIZE;
    const initialProducts = stockProductRows.slice(0, PRODUCT_PAGE_SIZE);
    const hasMorePO = purchaseOrderRows.length > PO_PAGE_SIZE;
    const initialPOs = purchaseOrderRows.slice(0, PO_PAGE_SIZE);

    const storeCurrency = parseStoreCurrency(storeRow?.currency);
    const params = await searchParams;
    const initialTab = params?.tab === "purchase" ? "purchase" : "stock";

    return (
      <section className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">สต็อก</h1>
          <p className="text-sm text-muted-foreground">
            จัดการรับเข้า ปรับสต็อก สั่งซื้อ และตรวจสอบยอดคงเหลือ
          </p>
        </header>

        <StockTabs
          initialTab={initialTab}
          stockTab={
            <StockLedger
              products={initialProducts}
              recentMovements={movements}
              canCreate={canPostMovement}
              canAdjust={canAdjust}
              canInbound={canInbound}
              productPageSize={PRODUCT_PAGE_SIZE}
              initialHasMoreProducts={hasMoreProducts}
            />
          }
          purchaseTab={
            <PurchaseOrderList
              purchaseOrders={initialPOs}
              storeCurrency={storeCurrency}
              canCreate={canCreate}
              pageSize={PO_PAGE_SIZE}
              initialHasMore={hasMorePO}
            />
          }
        />
      </section>
    );
  } finally {
    perf.end();
  }
}
