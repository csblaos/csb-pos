import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  CheckCircle2,
  ChevronRight,
  Lock,
  ShieldAlert,
  Smartphone,
  UserRound,
} from "lucide-react";
import { redirect } from "next/navigation";

import { AccountPasswordSettings } from "@/components/app/account-password-settings";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { getGlobalSessionPolicy } from "@/lib/system-config/policy";

function formatThaiDateTime(value: string | null) {
  if (!value) {
    return "ยังไม่พบประวัติ";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function SettingsSecurityPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canViewSettings = isPermissionGranted(permissionKeys, "settings.view");

  if (!canViewSettings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ความปลอดภัยบัญชี</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const [account, globalSessionPolicy] = await Promise.all([
    db
      .select({
        name: users.name,
        email: users.email,
        mustChangePassword: users.mustChangePassword,
        passwordUpdatedAt: users.passwordUpdatedAt,
        sessionLimit: users.sessionLimit,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getGlobalSessionPolicy(),
  ]);

  if (!account) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ความปลอดภัยบัญชี</h1>
        <p className="text-sm text-red-600">ไม่พบบัญชีผู้ใช้ที่กำลังใช้งาน</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const effectiveSessionLimit = account.sessionLimit ?? globalSessionPolicy.defaultSessionLimit;
  const passwordStatus = account.mustChangePassword ? "ต้องเปลี่ยนรหัสผ่าน" : "ปกติ";
  const passwordStatusToneClassName = account.mustChangePassword
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">ความปลอดภัยบัญชี</h1>
        <p className="text-sm text-slate-500">ตรวจสอบสถานะรหัสผ่านและขีดจำกัดการใช้งานอุปกรณ์ของบัญชีนี้</p>
      </header>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          บัญชีที่กำลังใช้งาน
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{account.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{account.email}</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                User
              </span>
            </li>
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">สถานะรหัสผ่าน</p>
                <p className="mt-0.5 text-xs text-slate-500">อัปเดตล่าสุด {formatThaiDateTime(account.passwordUpdatedAt)}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${passwordStatusToneClassName}`}
              >
                {passwordStatus}
              </span>
            </li>
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">ขีดจำกัดอุปกรณ์</p>
                <p className="mt-0.5 text-xs text-slate-500">รวมทุก session ของผู้ใช้นี้</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                สูงสุด {effectiveSessionLimit.toLocaleString("th-TH")} เครื่อง
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          เปลี่ยนรหัสผ่าน
        </p>
        <AccountPasswordSettings mustChangePassword={account.mustChangePassword} />
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          คำแนะนำ
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            <li className="flex min-h-14 items-start gap-3 px-4 py-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">ออกจากระบบเมื่อใช้อุปกรณ์สาธารณะ</p>
                <p className="mt-0.5 text-xs text-slate-500">ลดความเสี่ยงจาก session ค้างในเบราว์เซอร์</p>
              </div>
            </li>
            <li className="flex min-h-14 items-start gap-3 px-4 py-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">เปลี่ยนรหัสผ่านทันทีเมื่อพบการใช้งานผิดปกติ</p>
                <p className="mt-0.5 text-xs text-slate-500">หากเข้าใช้งานจากเครื่องที่ไม่คุ้นเคย ควรรีเซ็ตทันที</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/profile"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไปหน้าโปรไฟล์บัญชี</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">แก้ไขชื่อผู้ใช้และข้อมูลบัญชี</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/notifications"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Smartphone className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไปหน้าการแจ้งเตือน</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">จัดการช่องทางที่ต้องการรับแจ้ง</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Lock className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">กลับหน้าตั้งค่า</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">กลับไปรายการตั้งค่าทั้งหมด</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
