import Link from "next/link";
import { redirect } from "next/navigation";

import { ProductsManagement } from "@/components/app/products-management";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { listStoreProducts, listUnits } from "@/lib/products/service";

export default async function ProductsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "products.view");
  const canCreate = isPermissionGranted(permissionKeys, "products.create");
  const canUpdate = isPermissionGranted(permissionKeys, "products.update");
  const canArchive =
    isPermissionGranted(permissionKeys, "products.archive") ||
    isPermissionGranted(permissionKeys, "products.delete");
  const canManageUnits =
    isPermissionGranted(permissionKeys, "units.view") ||
    isPermissionGranted(permissionKeys, "units.create");

  if (!canView) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">สินค้า</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงโมดูลสินค้า</p>
      </section>
    );
  }

  const [products, units] = await Promise.all([
    listStoreProducts(session.activeStoreId),
    listUnits(),
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
        canCreate={canCreate}
        canUpdate={canUpdate}
        canArchive={canArchive}
        canManageUnits={canManageUnits}
      />

      <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปหน้าตั้งค่า
      </Link>
    </section>
  );
}
