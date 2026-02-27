import Link from "next/link";
import { Bell, ChevronRight, Shield } from "lucide-react";
import { redirect } from "next/navigation";

import { NotificationsInboxPanel } from "@/components/app/notifications-inbox-panel";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";
import { getSession } from "@/lib/auth/session";

export default async function SettingsNotificationsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canViewSettings = isPermissionGranted(permissionKeys, "settings.view");
  const canManageRules = isPermissionGranted(permissionKeys, "settings.update");

  if (!canViewSettings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">การแจ้งเตือน</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link
          href="/settings"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          การแจ้งเตือน
        </h1>
        <p className="text-sm text-slate-500">
          inbox ภายในระบบสำหรับงาน AP due/overdue (มี mute/snooze ราย PO)
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-600">
          งาน cron จะสร้าง/อัปเดตแจ้งเตือนจากกติกา due status เดียวกับ dashboard AP
          และจะเคารพกฎ mute/snooze อัตโนมัติ
        </p>
      </div>

      <NotificationsInboxPanel canManageRules={canManageRules} />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          นำทาง
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/security"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Shield className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                ไปหน้าความปลอดภัยบัญชี
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                ตรวจสถานะรหัสผ่านและ session limit
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Bell className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                กลับหน้าตั้งค่า
              </span>
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
