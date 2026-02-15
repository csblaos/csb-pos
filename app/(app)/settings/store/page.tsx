import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronRight, Store, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";

import { StoreFinancialSettings } from "@/components/app/store-financial-settings";
import { StoreProfileSettings } from "@/components/app/store-profile-settings";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { getStoreFinancialConfig } from "@/lib/stores/financial";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

export default async function SettingsStorePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "settings.view");
  const canUpdate = isPermissionGranted(permissionKeys, "settings.update");
  const canUpdateFinancial = canUpdate || isPermissionGranted(permissionKeys, "stores.update");

  if (!canView) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ข้อมูลร้าน</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const [store, financial] = await Promise.all([
    db
      .select({
        id: stores.id,
        name: stores.name,
        logoName: stores.logoName,
        logoUrl: stores.logoUrl,
        address: stores.address,
        phoneNumber: stores.phoneNumber,
      })
      .from(stores)
      .where(eq(stores.id, session.activeStoreId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getStoreFinancialConfig(session.activeStoreId),
  ]);

  if (!store) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ข้อมูลร้าน</h1>
        <p className="text-sm text-red-600">ไม่พบข้อมูลร้านที่กำลังใช้งาน</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">ข้อมูลร้าน</h1>
        <p className="text-sm text-slate-500">จัดการชื่อร้าน โลโก้ ที่อยู่ และข้อมูลติดต่อของร้านนี้</p>
      </header>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          โปรไฟล์ร้าน
        </p>
      </div>
      <StoreProfileSettings
        storeId={store.id}
        storeName={store.name}
        initialLogoName={store.logoName}
        initialLogoUrl={store.logoUrl}
        initialAddress={store.address}
        initialPhoneNumber={store.phoneNumber}
        canUpdate={canUpdate}
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          การเงินร้าน
        </p>
      </div>
      <StoreFinancialSettings
        initialCurrency={financial?.currency ?? "LAK"}
        initialSupportedCurrencies={financial?.supportedCurrencies ?? ["LAK"]}
        initialVatEnabled={financial?.vatEnabled ?? false}
        initialVatRate={financial?.vatRate ?? 700}
        initialVatMode={financial?.vatMode ?? "EXCLUSIVE"}
        canUpdate={canUpdateFinancial}
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          นำทาง
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/store/payments"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <WalletCards className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">จัดการบัญชีรับเงิน</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                เพิ่มบัญชีธนาคาร/PromptPay และตั้งบัญชีหลัก
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
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
