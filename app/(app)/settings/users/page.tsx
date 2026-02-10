import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { UsersManagement } from "@/components/app/users-management";
import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

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

  if (!canView) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">ผู้ใช้และสมาชิกทีม</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const members = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      roleId: roles.id,
      roleName: roles.name,
      status: storeMembers.status,
      joinedAt: storeMembers.createdAt,
    })
    .from(storeMembers)
    .innerJoin(users, eq(storeMembers.userId, users.id))
    .innerJoin(roles, eq(storeMembers.roleId, roles.id))
    .where(eq(storeMembers.storeId, session.activeStoreId))
    .orderBy(asc(users.name));

  const roleOptions = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.storeId, session.activeStoreId))
    .orderBy(asc(roles.name));

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">ผู้ใช้และสมาชิกทีม</h1>
        <p className="text-sm text-muted-foreground">จัดการสมาชิก, บทบาท และสถานะผู้ใช้งานในร้าน</p>
      </header>

      <UsersManagement
        members={members}
        roles={roleOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />

      <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปหน้าตั้งค่า
      </Link>
    </section>
  );
}
