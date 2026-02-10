import Link from "next/link";
import { redirect } from "next/navigation";

import { UnitsManagement } from "@/components/app/units-management";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { listUnits } from "@/lib/products/service";

export default async function SettingsUnitsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "units.view");
  const canCreate = isPermissionGranted(permissionKeys, "units.create");

  if (!canView) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">หน่วยสินค้า</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const units = await listUnits();

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">หน่วยสินค้า</h1>
        <p className="text-sm text-muted-foreground">จัดการรายการหน่วยพื้นฐาน เช่น PCS, PACK, BOX</p>
      </header>

      <UnitsManagement units={units} canCreate={canCreate} />

      <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปหน้าตั้งค่า
      </Link>
    </section>
  );
}
