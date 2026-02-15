import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ChevronRight, KeyRound, ShieldCheck, Store, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { StoresManagement } from "@/components/app/stores-management";
import { UsersManagement } from "@/components/app/users-management";
import { ensureMainBranchExists } from "@/lib/branches/access";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { db } from "@/lib/db/client";
import { roles, storeBranches, storeMembers, users } from "@/lib/db/schema";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getGlobalSessionPolicy } from "@/lib/system-config/policy";

function UsersManagementFallback() {
  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />
      </article>
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        </div>
        <ul className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="flex items-center gap-3 px-4 py-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

async function UsersManagementContent({
  storeId,
  canCreate,
  canUpdate,
  defaultSessionLimit,
}: {
  storeId: string;
  canCreate: boolean;
  canUpdate: boolean;
  defaultSessionLimit: number;
}) {
  const userCreators = alias(users, "user_creators");
  const memberAdders = alias(users, "member_adders");
  await ensureMainBranchExists(storeId);

  const [members, roleOptions, branches] = await Promise.all([
    db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        systemRole: users.systemRole,
        mustChangePassword: users.mustChangePassword,
        sessionLimit: users.sessionLimit,
        createdByUserId: users.createdBy,
        createdByName: userCreators.name,
        roleId: roles.id,
        roleName: roles.name,
        status: storeMembers.status,
        joinedAt: storeMembers.createdAt,
        addedByUserId: storeMembers.addedBy,
        addedByName: memberAdders.name,
      })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .innerJoin(roles, eq(storeMembers.roleId, roles.id))
      .leftJoin(userCreators, eq(users.createdBy, userCreators.id))
      .leftJoin(memberAdders, eq(storeMembers.addedBy, memberAdders.id))
      .where(eq(storeMembers.storeId, storeId))
      .orderBy(asc(users.name)),
    db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.storeId, storeId))
      .orderBy(asc(roles.name)),
    db
      .select({ id: storeBranches.id, name: storeBranches.name, code: storeBranches.code })
      .from(storeBranches)
      .where(eq(storeBranches.storeId, storeId))
      .orderBy(asc(storeBranches.createdAt), asc(storeBranches.name)),
  ]);

  return (
    <UsersManagement
      members={members}
      roles={roleOptions}
      branches={branches}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canLinkExisting
      defaultSessionLimit={defaultSessionLimit}
    />
  );
}

export default async function SettingsSuperadminUsersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  if (!session.activeStoreId) {
    redirect("/settings/stores");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "members.view");
  const canCreate = isPermissionGranted(permissionKeys, "members.create");
  const canUpdate = isPermissionGranted(permissionKeys, "members.update");

  if (!canView) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Superadmin: จัดการผู้ใช้</h1>
        <p className="text-sm text-red-600">
          คุณไม่มีสิทธิ์ดูสมาชิกของร้านที่กำลังเลือก กรุณาเปลี่ยนร้านหรือปรับสิทธิ์ก่อน
        </p>
        <Link href="/settings/stores" className="text-sm font-medium text-blue-700 hover:underline">
          ไปหน้าเลือกร้าน / เปลี่ยนสาขา
        </Link>
      </section>
    );
  }

  const [storeMemberStatusRows, globalSessionPolicy] = await Promise.all([
    db
      .select({
        status: storeMembers.status,
        count: sql<number>`count(*)`,
      })
      .from(storeMembers)
      .where(eq(storeMembers.storeId, session.activeStoreId))
      .groupBy(storeMembers.status),
    getGlobalSessionPolicy(),
  ]);

  const activeCount =
    Number(storeMemberStatusRows.find((row) => row.status === "ACTIVE")?.count ?? 0);
  const invitedCount =
    Number(storeMemberStatusRows.find((row) => row.status === "INVITED")?.count ?? 0);
  const suspendedCount =
    Number(storeMemberStatusRows.find((row) => row.status === "SUSPENDED")?.count ?? 0);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <p className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Superadmin Workspace
        </p>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">จัดการผู้ใช้ข้ามร้าน</h1>
        <p className="text-sm text-slate-500">
          เลือกร้านที่ต้องการด้านล่าง แล้วจัดการสมาชิกของร้านนั้นได้ทันที
        </p>
      </header>

      <StoresManagement
        memberships={memberships}
        activeStoreId={session.activeStoreId}
        activeBranchId={session.activeBranchId}
        isSuperadmin
        canCreateStore={false}
        createStoreBlockedReason={null}
        storeQuotaSummary={null}
        mode="quick"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">สมาชิก ACTIVE</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {activeCount.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">คำเชิญค้าง</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {invitedCount.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">สมาชิก SUSPENDED</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {suspendedCount.toLocaleString("th-TH")}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Session Default</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {globalSessionPolicy.defaultSessionLimit.toLocaleString("th-TH")}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Role Template (แนะนำ)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            ใช้เป็น baseline เวลาตั้งสิทธิ์ เพื่อให้การกำหนด role เร็วและสม่ำเสมอทุกสาขา
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Owner</p>
            <p className="mt-1 text-xs text-slate-500">
              เข้าถึงการตั้งค่าร้าน สาขา โควตา และจัดการสมาชิกทั้งหมดของร้าน
            </p>
          </li>
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Admin</p>
            <p className="mt-1 text-xs text-slate-500">
              จัดการผู้ใช้ สินค้า สต็อก และออเดอร์ โดยไม่แตะ policy ระดับระบบ
            </p>
          </li>
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Manager</p>
            <p className="mt-1 text-xs text-slate-500">
              โฟกัสงานปฏิบัติการประจำวัน อนุมัติออเดอร์ ดูรายงาน และควบคุมสต็อก
            </p>
          </li>
          <li className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Cashier</p>
            <p className="mt-1 text-xs text-slate-500">
              ใช้งานขายหน้าร้าน/หน้าบ้านเป็นหลัก ไม่มีสิทธิ์แก้ค่าหลักของระบบ
            </p>
          </li>
        </ul>
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          จัดการสมาชิกของร้านที่เลือกอยู่
        </p>
      </div>

      <Suspense fallback={<UsersManagementFallback />}>
        <UsersManagementContent
          storeId={session.activeStoreId}
          canCreate={canCreate}
          canUpdate={canUpdate}
          defaultSessionLimit={globalSessionPolicy.defaultSessionLimit}
        />
      </Suspense>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับ Superadmin Center</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ไปหน้าหลักการจัดการของ Superadmin</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/roles"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <KeyRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไปจัดการสิทธิ์ (Roles)</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ปรับ role ของร้านที่เลือกอยู่</span>
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
