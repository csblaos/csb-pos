import Link from "next/link";
import { ChevronRight, Settings2, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { StoreShippingProvidersSettings } from "@/components/app/store-shipping-providers-settings";
import { getSession } from "@/lib/auth/session";
import { queryMany } from "@/lib/db/query";
import { getStoreProfileFromPostgres } from "@/lib/platform/postgres-store-settings";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

const parseAliases = (raw: string | null | undefined) => {
  if (!raw) {
    return [];
  }
  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) {
      return [];
    }
    return decoded
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
};

export default async function SettingsStoreShippingProvidersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.activeStoreId) {
    redirect("/onboarding");
  }
  const activeStoreId = session.activeStoreId;

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "settings.view");
  const canUpdate = isPermissionGranted(permissionKeys, "stores.update");

  if (!canView) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ผู้ให้บริการขนส่ง</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const [store, providerRows] = await Promise.all([
    getStoreProfileFromPostgres(activeStoreId),
    queryMany<{
      id: string;
      code: string;
      displayName: string;
      branchName: string | null;
      aliases: string | null;
      active: boolean | null;
      sortOrder: number | null;
      createdAt: string;
    }>(
      `
        select
          id,
          code,
          display_name as "displayName",
          branch_name as "branchName",
          aliases,
          active,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from shipping_providers
        where store_id = :storeId
        order by sort_order asc, display_name asc, created_at asc
      `,
      {
        replacements: { storeId: activeStoreId },
      },
    ),
  ]);

  if (!store) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ผู้ให้บริการขนส่ง</h1>
        <p className="text-sm text-red-600">ไม่พบข้อมูลร้านที่กำลังใช้งาน</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const initialProviders = providerRows.map((row) => ({
    ...row,
    aliases: parseAliases(row.aliases),
    active: row.active === true,
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
  }));

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">ผู้ให้บริการขนส่ง</h1>
        <p className="text-sm text-slate-500">
          จัดการรายการขนส่งของร้าน {store.name} สำหรับใช้ในหน้า POS และ flow ออนไลน์
        </p>
      </header>

      <StoreShippingProvidersSettings initialProviders={initialProviders} canUpdate={canUpdate} />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          นำทาง
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/store"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับข้อมูลร้าน</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                จัดการโปรไฟล์ร้านและการเงินร้าน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับหน้าตั้งค่า</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">กลับไปรายการตั้งค่าทั้งหมด</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
