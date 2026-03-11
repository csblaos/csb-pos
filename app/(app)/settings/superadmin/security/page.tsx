import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  PlugZap,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { queryMany, queryOne } from "@/lib/db/query";

const toNumber = (value: unknown) => Number(value ?? 0);

export default async function SettingsSuperadminSecurityPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const storeIds = memberships.map((membership) => membership.storeId);

  const [
    mustChangePasswordTotalRow,
    invitedTotalRow,
    suspendedRows,
    elevatedRoleRows,
    fbErrorRows,
    waErrorRows,
  ] = await Promise.all([
    queryOne<{ value: number | string }>(
      `
        select count(distinct u.id) as "value"
        from store_members sm
        inner join users u on sm.user_id = u.id
        where
          sm.store_id in (:storeIds)
          and sm.status = 'ACTIVE'
          and u.must_change_password = true
      `,
      { replacements: { storeIds } },
    ),
    queryOne<{ value: number | string }>(
      `
        select count(*) as "value"
        from store_members
        where store_id in (:storeIds) and status = 'INVITED'
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{ storeId: string; storeName: string; count: number | string }>(
      `
        select
          sm.store_id as "storeId",
          s.name as "storeName",
          count(*) as "count"
        from store_members sm
        inner join stores s on sm.store_id = s.id
        where sm.store_id in (:storeIds) and sm.status = 'SUSPENDED'
        group by sm.store_id, s.name
        order by count(*) desc
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{
      userId: string;
      userName: string;
      email: string;
      systemRole: "SUPERADMIN" | "SYSTEM_ADMIN";
    }>(
      `
        select
          u.id as "userId",
          u.name as "userName",
          u.email,
          u.system_role as "systemRole"
        from store_members sm
        inner join users u on sm.user_id = u.id
        where
          sm.store_id in (:storeIds)
          and sm.status = 'ACTIVE'
          and u.system_role in ('SUPERADMIN', 'SYSTEM_ADMIN')
        group by u.id, u.name, u.email, u.system_role
        order by u.name asc
        limit 30
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{ storeId: string; storeName: string; pageName: string | null }>(
      `
        select
          fb.store_id as "storeId",
          s.name as "storeName",
          fb.page_name as "pageName"
        from fb_connections fb
        inner join stores s on fb.store_id = s.id
        where fb.store_id in (:storeIds) and fb.status = 'ERROR'
        order by s.name asc
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{ storeId: string; storeName: string; phoneNumber: string | null }>(
      `
        select
          wa.store_id as "storeId",
          s.name as "storeName",
          wa.phone_number as "phoneNumber"
        from wa_connections wa
        inner join stores s on wa.store_id = s.id
        where wa.store_id in (:storeIds) and wa.status = 'ERROR'
        order by s.name asc
      `,
      { replacements: { storeIds } },
    ),
  ]);

  const totalMustChangeUsers = toNumber(mustChangePasswordTotalRow?.value);
  const totalInvitedRows = toNumber(invitedTotalRow?.value);
  const totalSuspendedMembers = suspendedRows.reduce((sum, row) => sum + toNumber(row.count), 0);
  const channelErrorStoreIds = new Set([
    ...fbErrorRows.map((row) => row.storeId),
    ...waErrorRows.map((row) => row.storeId),
  ]);

  const riskItems: string[] = [];
  if (totalMustChangeUsers > 0) {
    riskItems.push(
      `มีผู้ใช้บังคับเปลี่ยนรหัสผ่าน ${totalMustChangeUsers.toLocaleString("th-TH")} คน`,
    );
  }
  if (totalSuspendedMembers > 0) {
    riskItems.push(`พบสมาชิกสถานะ SUSPENDED ${totalSuspendedMembers.toLocaleString("th-TH")} คน`);
  }
  if (totalInvitedRows > 0) {
    riskItems.push(`มีคำเชิญค้าง ${totalInvitedRows.toLocaleString("th-TH")} รายการ`);
  }
  if (channelErrorStoreIds.size > 0) {
    riskItems.push(
      `มีร้านที่เชื่อมต่อช่องทางผิดพลาด ${channelErrorStoreIds.size.toLocaleString("th-TH")} ร้าน`,
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Security & Compliance
        </h1>
        <p className="text-sm text-slate-500">
          ตรวจสอบความเสี่ยงด้านผู้ใช้ สิทธิ์ และการเชื่อมต่อของร้านทั้งหมดที่คุณดูแล
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ผู้ใช้ต้องเปลี่ยนรหัสผ่าน</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalMustChangeUsers.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">สมาชิก SUSPENDED</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalSuspendedMembers.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">คำเชิญค้าง</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalInvitedRows.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">ร้านที่มี channel error</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {channelErrorStoreIds.size.toLocaleString("th-TH")}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Risk Signals</p>
          <p className="mt-0.5 text-xs text-slate-500">รายการสัญญาณที่ควรติดตามก่อน</p>
        </div>
        {riskItems.length === 0 ? (
          <p className="px-4 py-4 text-sm text-emerald-700">ยังไม่พบสัญญาณความเสี่ยงสำคัญ</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {riskItems.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-start gap-2 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm text-slate-700">{item}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">บัญชีสิทธิ์สูง (Elevated Access)</p>
          <p className="mt-0.5 text-xs text-slate-500">ผู้ใช้ที่มี role ระดับ SUPERADMIN/SYSTEM_ADMIN</p>
        </div>
        {elevatedRoleRows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">ไม่พบบัญชีสิทธิ์สูงในขอบเขตร้านที่ดูแล</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {elevatedRoleRows.map((row) => (
              <li key={row.userId} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{row.userName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.email} • {row.systemRole}
                </p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/audit-log"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">เปิด Audit Log</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ไล่เหตุการณ์ย้อนหลังแบบละเอียด</span>
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
              <span className="block truncate text-sm font-medium text-slate-900">ไป Access Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                จัดการผู้ใช้ที่เสี่ยงและ role ของร้าน
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
              <span className="block truncate text-sm font-medium text-slate-900">ไปหน้าการเชื่อมต่อช่องทาง</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจและแก้ FB/WA ที่สถานะผิดพลาด
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                กลับหน้า Home ของผู้ดูแล
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
