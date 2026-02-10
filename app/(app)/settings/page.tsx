import Link from "next/link";
import { LogoutButton } from "@/components/app/logout-button";
import { getSession } from "@/lib/auth/session";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";

export default async function SettingsPage() {
  const session = await getSession();
  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canViewSettings = isPermissionGranted(permissionKeys, "settings.view");
  const canViewUsers = isPermissionGranted(permissionKeys, "members.view");
  const canViewRoles = isPermissionGranted(permissionKeys, "rbac.roles.view");
  const canViewUnits = isPermissionGranted(permissionKeys, "units.view");
  const canViewReports = isPermissionGranted(permissionKeys, "reports.view");

  if (!canViewSettings) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงหน้าตั้งค่า</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">ข้อมูลบัญชีและสิทธิ์การใช้งาน</p>
      </div>

      <article className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium">บัญชีผู้ใช้</p>
        <p className="mt-1 text-sm text-muted-foreground">{session?.displayName}</p>
        <p className="text-sm text-muted-foreground">
          บทบาท: {session?.activeRoleName ?? "ยังไม่มี"}
        </p>
      </article>

      <article className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium">สิทธิ์ที่มี</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {permissionKeys.map((permissionKey) => (
            <li key={permissionKey}>{permissionKey}</li>
          ))}
        </ul>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium">การจัดการทีมงาน</p>

        {canViewUsers ? (
          <Link
            href="/settings/users"
            className="block rounded-lg border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            ผู้ใช้และสมาชิกทีม
          </Link>
        ) : null}

        {canViewRoles ? (
          <Link
            href="/settings/roles"
            className="block rounded-lg border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            บทบาทและสิทธิ์
          </Link>
        ) : null}

        {canViewUnits ? (
          <Link
            href="/settings/units"
            className="block rounded-lg border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            หน่วยสินค้า
          </Link>
        ) : null}

        {canViewReports ? (
          <Link
            href="/reports"
            className="block rounded-lg border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            รายงาน
          </Link>
        ) : null}

        {!canViewUsers && !canViewRoles && !canViewUnits && !canViewReports ? (
          <p className="text-sm text-muted-foreground">
            บัญชีนี้ไม่มีสิทธิ์จัดการสมาชิก บทบาท หน่วยสินค้า หรือรายงาน
          </p>
        ) : null}
      </article>

      <LogoutButton />
    </section>
  );
}
