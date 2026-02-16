import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { listCategories, listStoreProducts, listUnits } from "@/lib/products/service";
import { getStoreFinancialConfig } from "@/lib/stores/financial";

const ProductsManagement = dynamic(
  () =>
    import("@/components/app/products-management").then(
      (module) => module.ProductsManagement,
    ),
  {
    loading: () => (
      <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        กำลังโหลดหน้าจัดการสินค้า...
      </div>
    ),
  },
);

export default async function ProductsPage() {
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

  const canView = isPermissionGranted(permissionKeys, "products.view");
  const canCreate = isPermissionGranted(permissionKeys, "products.create");
  const canUpdate = isPermissionGranted(permissionKeys, "products.update");
  const canArchive =
    isPermissionGranted(permissionKeys, "products.archive") ||
    isPermissionGranted(permissionKeys, "products.delete");
  const canViewCost = isPermissionGranted(permissionKeys, "products.cost.view");
  const canUpdateCost = isPermissionGranted(permissionKeys, "products.cost.update");

  if (!canView) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงโมดูลสินค้า</p>
      </section>
    );
  }

  const [products, units, categories, financial] = await Promise.all([
    listStoreProducts(session.activeStoreId),
    listUnits(session.activeStoreId),
    listCategories(session.activeStoreId),
    getStoreFinancialConfig(session.activeStoreId),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <p className="text-sm text-muted-foreground">ค้นหา สร้าง แก้ไข และปิดใช้งานสินค้า</p>
      </header>

      <ProductsManagement
        products={products}
        units={units}
        categories={categories}
        currency={financial?.currency ?? "LAK"}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canArchive={canArchive}
        canViewCost={canViewCost}
        canUpdateCost={canUpdateCost}
      />
    </section>
  );
}
