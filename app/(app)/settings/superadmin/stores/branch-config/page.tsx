import Link from "next/link";
import { Building2, ChevronRight, Settings2, ShieldCheck, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { StoresManagement } from "@/components/app/stores-management";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";

export default async function SettingsSuperadminBranchConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const activeStoreId = session.activeStoreId ?? memberships[0].storeId;

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <p className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Superadmin Workspace
        </p>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">ตั้งค่าสาขา</h1>
        <p className="text-sm text-slate-500">จัดการสาขาของทุกร้านในความดูแลจากหน้าจัดการแยกจากผู้ใช้ทั่วไป</p>
      </header>

      <StoresManagement
        memberships={memberships}
        activeStoreId={activeStoreId}
        activeBranchId={session.activeBranchId}
        isSuperadmin
        canCreateStore={false}
        createStoreBlockedReason={null}
        storeQuotaSummary={null}
        mode="branch-config"
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">เลือกเมนูจัดการร้านหรือสาขา</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/stores/store-config"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไปหน้าตั้งค่าร้าน</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">สลับไปจัดการระดับร้าน</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                กลับหน้าเลือกร้าน / เปลี่ยนสาขา
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ออกจากโหมดผู้ดูแลกลับหน้าใช้งานรายวัน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
