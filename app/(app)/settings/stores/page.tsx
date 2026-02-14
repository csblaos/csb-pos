import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { StoresManagement } from "@/components/app/stores-management";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import {
  evaluateStoreCreationAccess,
  getStoreCreationPolicy,
} from "@/lib/auth/store-creation";
import { getUserSystemRole } from "@/lib/auth/system-admin";

export default async function SettingsStoresPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const systemRole = await getUserSystemRole(session.userId);
  const isSuperadmin = systemRole === "SUPERADMIN";

  let canCreateStore = false;
  let createStoreBlockedReason: string | null = null;
  let storeQuotaSummary: string | null = null;

  if (isSuperadmin) {
    const policy = await getStoreCreationPolicy(session.userId);
    const access = evaluateStoreCreationAccess(policy);

    canCreateStore = access.allowed;
    createStoreBlockedReason = access.reason ?? null;
    storeQuotaSummary =
      typeof policy.maxStores === "number"
        ? `โควตาร้านของบัญชีนี้: ${policy.activeOwnerStoreCount.toLocaleString("th-TH")} / ${policy.maxStores.toLocaleString("th-TH")} ร้าน`
        : `โควตาร้านของบัญชีนี้: ไม่จำกัด (ปัจจุบัน ${policy.activeOwnerStoreCount.toLocaleString("th-TH")} ร้าน)`;
  }

  const activeStoreId = session.activeStoreId ?? memberships[0].storeId;

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">เลือกร้าน / เปลี่ยนร้าน</h1>
        <p className="text-sm text-slate-500">สลับร้านที่กำลังใช้งาน และจัดการร้านเพิ่มเติมสำหรับ SUPERADMIN</p>
      </header>

      <StoresManagement
        memberships={memberships}
        activeStoreId={activeStoreId}
        activeBranchId={session.activeBranchId}
        isSuperadmin={isSuperadmin}
        canCreateStore={canCreateStore}
        createStoreBlockedReason={createStoreBlockedReason}
        storeQuotaSummary={storeQuotaSummary}
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
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
