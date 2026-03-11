import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import {
  getStoreFinancialConfigFromPostgres,
  getStorePdfConfigFromPostgres,
  getStoreProfileFromPostgres,
} from "@/lib/platform/postgres-store-settings";
import { createPerfScope } from "@/server/perf/perf";
import {
  getRecentStockMovements,
  getStockProductsPage,
} from "@/server/services/stock.service";
import { getPurchaseOrderListPage } from "@/server/services/purchase.service";
import { listCategories } from "@/lib/products/service";

const StockRecordingForm = dynamic(
  () =>
    import("@/components/app/stock-recording-form").then((module) => module.StockRecordingForm),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลด...
      </div>
    ),
  },
);

const StockInventoryView = dynamic(
  () =>
    import("@/components/app/stock-inventory-view").then((module) => module.StockInventoryView),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลด...
      </div>
    ),
  },
);

const StockMovementHistory = dynamic(
  () =>
    import("@/components/app/stock-movement-history").then(
      (module) => module.StockMovementHistory,
    ),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลด...
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

    const [
      movements,
      purchaseOrderRows,
      stockProductRows,
      storeProfile,
      storeFinancial,
      storePdfConfig,
      categories,
    ] =
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
          getStoreProfileFromPostgres(activeStoreId),
          getStoreFinancialConfigFromPostgres(activeStoreId),
          getStorePdfConfigFromPostgres(activeStoreId),
          listCategories(activeStoreId),
        ]),
      );

    const initialProducts = stockProductRows.slice(0, PRODUCT_PAGE_SIZE);
    const initialHasMoreProducts = stockProductRows.length > PRODUCT_PAGE_SIZE;
    const hasMorePO = purchaseOrderRows.length > PO_PAGE_SIZE;
    const initialPOs = purchaseOrderRows.slice(0, PO_PAGE_SIZE);

    const storeCurrency = storeFinancial?.currency ?? "LAK";
    const storeLogoUrl = storeProfile?.logoUrl ?? null;
    const purchaseOrderPdfConfig = {
      showLogo: storePdfConfig?.pdfShowLogo ?? true,
      showSignature: storePdfConfig?.pdfShowSignature ?? true,
      showNote: storePdfConfig?.pdfShowNote ?? true,
      headerColor: storePdfConfig?.pdfHeaderColor ?? "#f1f5f9",
      companyName: storePdfConfig?.pdfCompanyName ?? null,
      companyAddress: storePdfConfig?.pdfCompanyAddress ?? null,
      companyPhone: storePdfConfig?.pdfCompanyPhone ?? null,
    };
    const storeOutStockThreshold = storeProfile?.outStockThreshold ?? 0;
    const storeLowStockThreshold = storeProfile?.lowStockThreshold ?? 10;
    const params = await searchParams;
    const initialTab = params?.tab === "purchase"
      ? "purchase"
      : params?.tab === "inventory"
        ? "inventory"
        : params?.tab === "history"
          ? "history"
          : "inventory";

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
          recordingTab={
            <StockRecordingForm
              initialProducts={initialProducts}
              canCreate={canPostMovement}
              canAdjust={canAdjust}
              canInbound={canInbound}
            />
          }
          inventoryTab={
            <StockInventoryView
              products={initialProducts}
              categories={categories}
              storeOutStockThreshold={storeOutStockThreshold}
              storeLowStockThreshold={storeLowStockThreshold}
              pageSize={PRODUCT_PAGE_SIZE}
              initialHasMore={initialHasMoreProducts}
            />
          }
          historyTab={<StockMovementHistory movements={movements} />}
          purchaseTab={
            <PurchaseOrderList
              purchaseOrders={initialPOs}
              activeStoreId={activeStoreId}
              userId={session.userId}
              storeCurrency={storeCurrency}
              canCreate={canCreate}
              pageSize={PO_PAGE_SIZE}
              initialHasMore={hasMorePO}
              storeLogoUrl={storeLogoUrl}
              pdfConfig={purchaseOrderPdfConfig}
            />
          }
        />
      </section>
    );
  } finally {
    perf.end();
  }
}
