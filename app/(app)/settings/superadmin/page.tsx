import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ClipboardList,
  Gauge,
  PlugZap,
  Settings2,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { getSuperadminHomeSnapshot } from "@/lib/superadmin/home-dashboard";

function SuperadminOverviewFallback({ totalStores }: { totalStores: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalStores.toLocaleString("th-TH")}
          </p>
        </article>
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-slate-100" />
          </article>
        ))}
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
          <div className="mt-1 h-3 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-5 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-1 h-3 w-40 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-1 h-3 w-5/6 animate-pulse rounded bg-slate-100" />
      </article>
    </>
  );
}

async function SuperadminOverviewPanels({
  userId,
  storeIds,
  totalStores,
}: {
  userId: string;
  storeIds: string[];
  totalStores: number;
}) {
  const snapshot = await getSuperadminHomeSnapshot(userId, storeIds);
  const cacheDriver = process.env.REDIS_DRIVER?.trim() || "unknown";

  const alerts: string[] = [];
  if (snapshot.storesNeedAttention > 0) {
    alerts.push(`มีร้านที่ควรตรวจสอบ ${snapshot.storesNeedAttention.toLocaleString("th-TH")} ร้าน`);
  }
  if (snapshot.channelErrorStoreCount > 0) {
    alerts.push(
      `พบช่องทางเชื่อมต่อผิดพลาด ${snapshot.channelErrorStoreCount.toLocaleString("th-TH")} ร้าน`,
    );
  }
  if (snapshot.totalSuspendedMembers > 0) {
    alerts.push(
      `พบสมาชิกสถานะ SUSPENDED ${snapshot.totalSuspendedMembers.toLocaleString("th-TH")} คน`,
    );
  }
  if (snapshot.totalInvitedMembers > 0) {
    alerts.push(`มีคำเชิญค้าง ${snapshot.totalInvitedMembers.toLocaleString("th-TH")} คน`);
  }
  if (!snapshot.storeCreationAllowed && snapshot.storeCreationBlockedReason) {
    alerts.push(snapshot.storeCreationBlockedReason);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalStores.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านที่ต้องตรวจสอบ</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {snapshot.storesNeedAttention.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ออเดอร์วันนี้</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {snapshot.totalTodayOrders.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ยอดขายวันนี้ (รวม)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {snapshot.totalTodaySales.toLocaleString("th-TH")}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">System Health</p>
          <p className="mt-0.5 text-xs text-slate-500">สถานะระบบหลักสำหรับตัดสินใจแก้ไขได้เร็ว</p>
        </div>
        <ul className="divide-y divide-slate-100">
          <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Database</p>
              <p className="text-xs text-slate-500">เชื่อมต่อฐานข้อมูลสำหรับ Superadmin</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              พร้อมใช้งาน
            </span>
          </li>
          <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Cache</p>
              <p className="text-xs text-slate-500">driver: {cacheDriver}</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              ปกติ
            </span>
          </li>
          <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Messaging Channel</p>
              <p className="text-xs text-slate-500">สถานะ FB/WA รวมทุกสโตร์</p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                snapshot.channelErrorStoreCount > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {snapshot.channelErrorStoreCount > 0
                ? `ต้องตรวจสอบ ${snapshot.channelErrorStoreCount.toLocaleString("th-TH")} ร้าน`
                : "ปกติ"}
            </span>
          </li>
        </ul>
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Alerts</p>
          <p className="mt-0.5 text-xs text-slate-500">รายการที่ควรจัดการก่อน</p>
        </div>
        {alerts.length === 0 ? (
          <p className="px-4 py-4 text-sm text-emerald-700">ยังไม่พบความเสี่ยงสำคัญในรอบนี้</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {alerts.map((alert, index) => (
              <li key={`${alert}-${index}`} className="flex items-start gap-2 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm text-slate-700">{alert}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Global Policy Snapshot</p>
        <p className="mt-2 text-xs text-slate-500">
          Session default: {snapshot.globalSessionDefault.toLocaleString("th-TH")} เครื่องต่อผู้ใช้
        </p>
        <p className="text-xs text-slate-500">
          Branch default:{" "}
          {snapshot.globalBranchDefaultCanCreate ? "อนุญาตให้สร้างสาขา" : "ไม่อนุญาตสร้างสาขา"}{" "}
          {snapshot.globalBranchDefaultMax === null
            ? "(ไม่จำกัด)"
            : `(สูงสุด ${snapshot.globalBranchDefaultMax.toLocaleString("th-TH")} สาขา/ร้าน)`}
        </p>
        <p className="text-xs text-slate-500">
          Store logo: สูงสุด {snapshot.globalStoreLogoPolicy.maxSizeMb.toLocaleString("th-TH")} MB /
          resize {snapshot.globalStoreLogoPolicy.autoResize ? "เปิด" : "ปิด"} / กว้างสุด{" "}
          {snapshot.globalStoreLogoPolicy.resizeMaxWidth.toLocaleString("th-TH")} px
        </p>
      </article>
    </>
  );
}

export default async function SettingsSuperadminRootPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const storeIds = memberships.map((membership) => membership.storeId);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <p className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Superadmin Home
        </p>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Superadmin Center</h1>
        <p className="text-sm text-slate-500">
          ศูนย์ควบคุมงานปฏิบัติการ สิทธิ์ ความปลอดภัย และโควตาของร้านทั้งหมดในหน้าเดียว
        </p>
      </header>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Quick Actions
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/stores"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                Operations & Governance
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                จัดการร้าน/สาขาและตรวจสถานะร้านที่ต้องแก้ไข
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/users"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">Access Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                จัดการผู้ใช้ สิทธิ์ และ role template ข้ามร้าน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/security"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                Security & Compliance
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจความเสี่ยง สิทธิ์ และเหตุการณ์ผิดปกติ
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/quotas"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                Quota & Billing Control
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจการใช้โควตาและรายการที่ใกล้เต็ม
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/global-config"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                Global Configuration
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ค่ากลางของระบบ เช่น session/branch/logo policy
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/audit-log"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">Audit Log</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจ timeline เหตุการณ์ล่าสุด
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/integrations"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <PlugZap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                Channel Integrations
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจสถานะการเชื่อมต่อ FB/WA ของแต่ละร้าน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                กลับหน้าเลือกร้าน / เปลี่ยนสาขา
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ออกจากโหมดผู้ดูแลกลับหน้าปฏิบัติงาน
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <Suspense fallback={<SuperadminOverviewFallback totalStores={memberships.length} />}>
        <SuperadminOverviewPanels
          userId={session.userId}
          storeIds={storeIds}
          totalStores={memberships.length}
        />
      </Suspense>
    </section>
  );
}
