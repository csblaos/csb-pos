import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { roles, storeMembers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

export default async function SettingsRolesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "rbac.roles.view");
  const canManage = isPermissionGranted(permissionKeys, "rbac.roles.update");

  if (!canView) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">บทบาทและสิทธิ์</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const roleRows = await db
    .select({
      id: roles.id,
      name: roles.name,
      isSystem: roles.isSystem,
      createdAt: roles.createdAt,
    })
    .from(roles)
    .where(eq(roles.storeId, session.activeStoreId))
    .orderBy(asc(roles.name));

  const memberCountRows = await db
    .select({
      roleId: storeMembers.roleId,
      count: sql<number>`count(*)`,
    })
    .from(storeMembers)
    .where(eq(storeMembers.storeId, session.activeStoreId))
    .groupBy(storeMembers.roleId);

  const memberCountMap = new Map(memberCountRows.map((row) => [row.roleId, Number(row.count)]));

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">บทบาทและสิทธิ์</h1>
        <p className="text-sm text-muted-foreground">กำหนดสิทธิ์ใช้งานของแต่ละบทบาทในร้าน</p>
      </header>

      <div className="space-y-3">
        {roleRows.map((role) => {
          const locked = Boolean(role.isSystem) && role.name === "Owner";

          return (
            <article key={role.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{role.name}</p>
                  <p className="text-xs text-muted-foreground">
                    สมาชิก {memberCountMap.get(role.id) ?? 0} คน
                  </p>
                  {locked ? (
                    <p className="mt-1 text-xs text-amber-700">บทบาทระบบ (ล็อก)</p>
                  ) : null}
                </div>

                <Link
                  href={`/settings/roles/${role.id}`}
                  prefetch={false}
                  className={`text-sm font-medium ${
                    canManage ? "text-blue-700 hover:underline" : "text-slate-500"
                  }`}
                >
                  ดูรายละเอียด
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปหน้าตั้งค่า
      </Link>
    </section>
  );
}
