import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { db } from "@/lib/db/client";
import { fbConnections, storeMembers, stores, users, waConnections } from "@/lib/db/schema";

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
    mustChangePasswordTotalRows,
    invitedTotalRows,
    suspendedRows,
    elevatedRoleRows,
    fbErrorRows,
    waErrorRows,
  ] = await Promise.all([
    db
      .select({ value: sql<number>`count(distinct ${users.id})` })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(
        and(
          inArray(storeMembers.storeId, storeIds),
          eq(storeMembers.status, "ACTIVE"),
          eq(users.mustChangePassword, true),
        ),
      ),
    db
      .select({ value: sql<number>`count(*)` })
      .from(storeMembers)
      .where(and(inArray(storeMembers.storeId, storeIds), eq(storeMembers.status, "INVITED"))),
    db
      .select({
        storeId: storeMembers.storeId,
        storeName: stores.name,
        count: sql<number>`count(*)`,
      })
      .from(storeMembers)
      .innerJoin(stores, eq(storeMembers.storeId, stores.id))
      .where(and(inArray(storeMembers.storeId, storeIds), eq(storeMembers.status, "SUSPENDED")))
      .groupBy(storeMembers.storeId, stores.name)
      .orderBy(desc(sql<number>`count(*)`)),
    db
      .select({
        userId: users.id,
        userName: users.name,
        email: users.email,
        systemRole: users.systemRole,
      })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(
        and(
          inArray(storeMembers.storeId, storeIds),
          eq(storeMembers.status, "ACTIVE"),
          inArray(users.systemRole, ["SUPERADMIN", "SYSTEM_ADMIN"]),
        ),
      )
      .groupBy(users.id, users.name, users.email, users.systemRole)
      .orderBy(users.name)
      .limit(30),
    db
      .select({
        storeId: fbConnections.storeId,
        storeName: stores.name,
        pageName: fbConnections.pageName,
      })
      .from(fbConnections)
      .innerJoin(stores, eq(fbConnections.storeId, stores.id))
      .where(
        and(inArray(fbConnections.storeId, storeIds), eq(fbConnections.status, "ERROR")),
      )
      .orderBy(stores.name),
    db
      .select({
        storeId: waConnections.storeId,
        storeName: stores.name,
        phoneNumber: waConnections.phoneNumber,
      })
      .from(waConnections)
      .innerJoin(stores, eq(waConnections.storeId, stores.id))
      .where(
        and(inArray(waConnections.storeId, storeIds), eq(waConnections.status, "ERROR")),
      )
      .orderBy(stores.name),
  ]);

  const totalMustChangeUsers = toNumber(mustChangePasswordTotalRows[0]?.value);
  const totalInvitedRows = toNumber(invitedTotalRows[0]?.value);
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
