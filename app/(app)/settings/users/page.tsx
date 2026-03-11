import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { UsersManagement } from "@/components/app/users-management";
import { ensureMainBranchExists } from "@/lib/branches/access";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { queryMany } from "@/lib/db/query";
import { listStoreBranchesFromPostgres } from "@/lib/platform/postgres-auth-rbac";
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
  await ensureMainBranchExists(storeId);

  const [members, roleOptions, branches, globalSessionPolicy] = await Promise.all([
    queryMany<{
      userId: string;
      email: string;
      name: string;
      systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
      mustChangePassword: boolean;
      sessionLimit: number | string | null;
      createdByUserId: string | null;
      createdByName: string | null;
      roleId: string;
      roleName: string;
      status: "ACTIVE" | "INVITED" | "SUSPENDED";
      joinedAt: string;
      addedByUserId: string | null;
      addedByName: string | null;
    }>(
      `
        select
          u.id as "userId",
          u.email,
          u.name,
          u.system_role as "systemRole",
          u.must_change_password as "mustChangePassword",
          u.session_limit as "sessionLimit",
          u.created_by as "createdByUserId",
          creator.name as "createdByName",
          r.id as "roleId",
          r.name as "roleName",
          sm.status as "status",
          sm.created_at as "joinedAt",
          sm.added_by as "addedByUserId",
          adder.name as "addedByName"
        from store_members sm
        inner join users u on sm.user_id = u.id
        inner join roles r on sm.role_id = r.id and sm.store_id = r.store_id
        left join users creator on u.created_by = creator.id
        left join users adder on sm.added_by = adder.id
        where sm.store_id = :storeId
        order by u.name asc
      `,
      { replacements: { storeId } },
    ).then((rows) =>
      rows.map((row) => ({
        ...row,
        mustChangePassword: row.mustChangePassword === true,
        sessionLimit:
          typeof row.sessionLimit === "number"
            ? row.sessionLimit
            : typeof row.sessionLimit === "string" && row.sessionLimit.trim().length > 0
              ? Number(row.sessionLimit)
              : null,
      })),
    ),
    queryMany<{ id: string; name: string }>(
      `
        select id, name
        from roles
        where store_id = :storeId
        order by name asc
      `,
      { replacements: { storeId } },
    ),
    listStoreBranchesFromPostgres(storeId).then((rows) => rows ?? []),
    getGlobalSessionPolicy(),
  ]);

  return (
    <UsersManagement
      members={members}
      roles={roleOptions}
      branches={branches}
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

      {systemRole === "SUPERADMIN" ? (
        <div className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-800">ต้องการจัดการผู้ใช้หลายร้าน?</p>
          <p className="mt-0.5 text-xs text-blue-700">
            ใช้หน้า Superadmin เพื่อสลับร้านและจัดการผู้ใช้ข้ามร้านได้เร็วขึ้น
          </p>
          <Link
            href="/settings/superadmin/users"
            className="mt-2 inline-flex items-center text-xs font-semibold text-blue-800 hover:underline"
          >
            ไปหน้า Superadmin: จัดการผู้ใช้
          </Link>
        </div>
      ) : null}

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
