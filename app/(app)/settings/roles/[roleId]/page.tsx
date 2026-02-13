import dynamic from "next/dynamic";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ChevronRight, Shield } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { permissions, rolePermissions, roles } from "@/lib/db/schema";
import { timeDbQuery, startServerRenderTimer } from "@/lib/perf/server";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getPermissionCatalog } from "@/lib/rbac/queries";

const RolePermissionsEditor = dynamic(
  () =>
    import("@/components/app/role-permissions-editor").then(
      (module) => module.RolePermissionsEditor,
    ),
  {
    loading: () => (
      <article className="rounded-xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
        กำลังโหลดตัวแก้ไขสิทธิ์...
      </article>
    ),
  },
);

function RoleDetailContentFallback() {
  return (
    <>
      <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
      </article>

      <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </article>
    </>
  );
}

async function RoleDetailContent({
  roleId,
  storeId,
  canManage,
}: {
  roleId: string;
  storeId: string;
  canManage: boolean;
}) {
  const [role] = await timeDbQuery("roles.detail.role", async () =>
    db
      .select({
        id: roles.id,
        name: roles.name,
        isSystem: roles.isSystem,
      })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.storeId, storeId)))
      .limit(1),
  );

  if (!role) {
    notFound();
  }

  const [allPermissions, assigned] = await Promise.all([
    getPermissionCatalog(),
    timeDbQuery("roles.detail.assignedPermissions", async () =>
      db
        .select({
          key: permissions.key,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, role.id)),
    ),
  ]);

  const assignedPermissionKeys = assigned.map((permission) => permission.key);

  return (
    <>
      <RolePermissionsEditor
        roleId={role.id}
        roleName={role.name}
        locked={Boolean(role.isSystem) && role.name === "Owner"}
        canManage={canManage}
        permissions={allPermissions}
        assignedPermissionKeys={assignedPermissionKeys}
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/roles"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Shield className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับหน้าบทบาท</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                กลับไปรายการบทบาททั้งหมด
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </>
  );
}

export default async function SettingsRoleDetailPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const finishRenderTimer = startServerRenderTimer("page.settings.roles.detail");

  try {
    const session = await getSession();
    if (!session) {
      redirect("/login");
    }

    const storeId = session.activeStoreId;
    if (!storeId) {
      redirect("/onboarding");
    }

    const permissionKeys = await getUserPermissionsForCurrentSession();
    const canView = isPermissionGranted(permissionKeys, "rbac.roles.view");
    const canManage = isPermissionGranted(permissionKeys, "rbac.roles.update");

    if (!canView) {
      return (
        <section className="space-y-3">
          <h1 className="text-xl font-semibold">แก้ไขบทบาท</h1>
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
          <Link
            href="/settings/roles"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            กลับไปหน้าบทบาท
          </Link>
        </section>
      );
    }

    const { roleId } = await params;

    return (
      <section className="space-y-5">
        <header className="space-y-1 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            รายละเอียดบทบาท
          </p>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">จัดการสิทธิ์บทบาท</h1>
          <p className="text-sm text-slate-500">กำหนดสิทธิ์ของบทบาทให้ตรงตามการทำงานจริง</p>
        </header>

        <Suspense fallback={<RoleDetailContentFallback />}>
          <RoleDetailContent roleId={roleId} storeId={storeId} canManage={canManage} />
        </Suspense>
      </section>
    );
  } finally {
    finishRenderTimer();
  }
}
