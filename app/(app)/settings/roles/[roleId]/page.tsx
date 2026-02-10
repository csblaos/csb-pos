import dynamic from "next/dynamic";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

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
        <section className="space-y-4">
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
      <section className="space-y-4">
        <RolePermissionsEditor
          roleId={role.id}
          roleName={role.name}
          locked={Boolean(role.isSystem) && role.name === "Owner"}
          canManage={canManage}
          permissions={allPermissions}
          assignedPermissionKeys={assignedPermissionKeys}
        />

        <Link
          href="/settings/roles"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          กลับไปหน้าบทบาท
        </Link>
      </section>
    );
  } finally {
    finishRenderTimer();
  }
}
