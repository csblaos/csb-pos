import Link from "next/link";
import { ChevronRight, Settings2 } from "lucide-react";
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
  const canUpdate = isPermissionGranted(permissionKeys, "units.update");
  const canDelete = isPermissionGranted(permissionKeys, "units.delete");

  if (!canView) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">หน่วยสินค้า</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const units = await listUnits(session.activeStoreId);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">หน่วยสินค้า</h1>
        <p className="text-sm text-slate-500">
          จัดการหน่วยของร้านและหน่วยมาตรฐานจากระบบ เช่น PCS, PACK, BOX
        </p>
      </header>

      <UnitsManagement
        units={units}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          นำทาง
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับหน้าตั้งค่า</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                กลับไปรายการตั้งค่าทั้งหมด
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
