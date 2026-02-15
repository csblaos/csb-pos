import Link from "next/link";
import { Bell, CheckCircle2, ChevronRight, Shield } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

type NotificationTopic = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

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

  if (!canViewSettings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">การแจ้งเตือน</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const topics: NotificationTopic[] = [
    {
      id: "orders",
      title: "ออเดอร์และการชำระเงิน",
      description: "แจ้งเมื่อมีออเดอร์ใหม่หรือสถานะชำระเงินเปลี่ยน",
      enabled: isPermissionGranted(permissionKeys, "orders.view"),
    },
    {
      id: "stock",
      title: "สต็อกและสินค้าใกล้หมด",
      description: "แจ้งเมื่อสินค้าต่ำกว่าจุดเตือนหรือมีการปรับสต็อกสำคัญ",
      enabled: isPermissionGranted(permissionKeys, "stock.view"),
    },
    {
      id: "members",
      title: "ผู้ใช้และสิทธิ์",
      description: "แจ้งเมื่อมีการเชิญสมาชิก ปรับสิทธิ์ หรือระงับบัญชี",
      enabled: isPermissionGranted(permissionKeys, "members.view"),
    },
    {
      id: "reports",
      title: "สรุปรายวัน",
      description: "แจ้งสรุปยอดขายรายวันและสถานะร้าน",
      enabled: isPermissionGranted(permissionKeys, "reports.view"),
    },
  ];

  const enabledTopics = topics.filter((topic) => topic.enabled);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">การแจ้งเตือน</h1>
        <p className="text-sm text-slate-500">สรุปช่องทางแจ้งเตือนที่บัญชีนี้สามารถใช้งานได้ในร้านปัจจุบัน</p>
      </header>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          ช่องทางแจ้งเตือน
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">In-App</p>
                <p className="mt-0.5 text-xs text-slate-500">แสดงแจ้งเตือนภายในระบบทันที</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                เปิดใช้งาน
              </span>
            </li>
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Email</p>
                <p className="mt-0.5 text-xs text-slate-500">สำหรับรายงานสรุปรายวันและเหตุการณ์สำคัญ</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                กำลังพัฒนา
              </span>
            </li>
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Push Mobile</p>
                <p className="mt-0.5 text-xs text-slate-500">แจ้งเตือนด่วนสำหรับผู้ดูแลและพนักงานหน้าร้าน</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                แผนถัดไป
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          ประเภทการแจ้งเตือนที่รับได้
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              เปิดใช้งานตามสิทธิ์แล้ว {enabledTopics.length.toLocaleString("th-TH")} จาก {topics.length.toLocaleString("th-TH")} รายการ
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {topics.map((topic) => (
              <li key={topic.id} className="flex min-h-14 items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{topic.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{topic.description}</p>
                </div>
                {topic.enabled ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    รับได้
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    ยังไม่เปิดสิทธิ์
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">นำทาง</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/security"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Shield className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">ไปหน้าความปลอดภัยบัญชี</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">ตรวจสถานะรหัสผ่านและ session limit</span>
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
              <span className="block truncate text-sm font-medium text-slate-900">กลับหน้าตั้งค่า</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">กลับไปรายการตั้งค่าทั้งหมด</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-600">
          หมายเหตุ: หน้าแจ้งเตือนนี้เป็นสรุปความพร้อมใช้งานตามสิทธิ์ปัจจุบัน โดยการตั้งค่าแบบละเอียดรายคนจะเพิ่มในรอบถัดไป
        </p>
      </div>
    </section>
  );
}
