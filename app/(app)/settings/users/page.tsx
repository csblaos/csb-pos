import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { ChevronRight, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { UsersManagement } from "@/components/app/users-management";
import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
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
  canLinkExisting,
}: {
  storeId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canLinkExisting: boolean;
}) {
  const userCreators = alias(users, "user_creators");
  const memberAdders = alias(users, "member_adders");

  const [members, roleOptions, globalSessionPolicy] = await Promise.all([
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
    getGlobalSessionPolicy(),
  ]);

  return (
    <UsersManagement
      members={members}
      roles={roleOptions}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canLinkExisting={canLinkExisting}
      defaultSessionLimit={globalSessionPolicy.defaultSessionLimit}
    />
  );
}

export default async function SettingsUsersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "members.view");
  const canCreate = isPermissionGranted(permissionKeys, "members.create");
  const canUpdate = isPermissionGranted(permissionKeys, "members.update");
  const systemRole = await getUserSystemRole(session.userId);
  const canLinkExisting = systemRole === "SUPERADMIN";

  if (!canView) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ผู้ใช้และสมาชิกทีม</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          ผู้ใช้และสมาชิกทีม
        </h1>
        <p className="text-sm text-slate-500">จัดการสมาชิก, บทบาท และสถานะผู้ใช้งานในร้าน</p>
      </header>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          จัดการสมาชิก
        </p>
      </div>
      <Suspense fallback={<UsersManagementFallback />}>
        <UsersManagementContent
          storeId={session.activeStoreId}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canLinkExisting={canLinkExisting}
        />
      </Suspense>

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
              <Users className="h-4 w-4" />
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
