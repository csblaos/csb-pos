import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  PlugZap,
  Settings2,
  Shield,
  Store,
  Users,
} from "lucide-react";

import { LogoutButton } from "@/components/app/logout-button";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { db } from "@/lib/db/client";
import { fbConnections, stores, waConnections } from "@/lib/db/schema";
import {
  getUserPermissionsForCurrentSession,
  isPermissionGranted,
} from "@/lib/rbac/access";

const storeTypeLabels = {
  ONLINE_RETAIL: "Online POS",
  RESTAURANT: "Restaurant POS",
  CAFE: "Cafe POS",
  OTHER: "Other POS",
} as const;

const channelStatusLabels = {
  DISCONNECTED: "ยังไม่เชื่อมต่อ",
  CONNECTED: "เชื่อมต่อแล้ว",
  ERROR: "พบปัญหา",
} as const;

const quickActionLinkClassName =
  "flex min-h-11 items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50";

type ChannelStatus = keyof typeof channelStatusLabels;

type UserCapability = {
  id: string;
  title: string;
  description: string;
  granted: boolean;
};

function ChannelBadge({
  label,
  status,
}: {
  label: string;
  status: ChannelStatus;
}) {
  const tone =
    status === "CONNECTED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "ERROR"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-sm">{channelStatusLabels[status]}</p>
    </div>
  );
}

export default async function SettingsPage() {
  const [session, permissionKeys] = await Promise.all([
    getSession(),
    getUserPermissionsForCurrentSession(),
  ]);
  const systemRole = session ? await getUserSystemRole(session.userId) : "USER";
  const isSuperadmin = systemRole === "SUPERADMIN";
  const canViewSettings = isPermissionGranted(permissionKeys, "settings.view");
  const canViewUsers = isPermissionGranted(permissionKeys, "members.view");
  const canViewRoles = isPermissionGranted(permissionKeys, "rbac.roles.view");
  const canViewUnits = isPermissionGranted(permissionKeys, "units.view");
  const canViewReports = isPermissionGranted(permissionKeys, "reports.view");
  const canViewConnections = isPermissionGranted(permissionKeys, "connections.view");
  const canUpdateSettings = isPermissionGranted(permissionKeys, "settings.update");

  if (!canViewSettings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์เข้าถึงหน้าตั้งค่า</p>
      </section>
    );
  }

  const activeStoreId = session?.activeStoreId ?? null;

  const [storeSummary, fbConnection, waConnection] = activeStoreId
    ? await Promise.all([
        db
          .select({
            name: stores.name,
            storeType: stores.storeType,
            currency: stores.currency,
            address: stores.address,
            phoneNumber: stores.phoneNumber,
          })
          .from(stores)
          .where(eq(stores.id, activeStoreId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        canViewConnections
          ? db
              .select({
                status: fbConnections.status,
                pageName: fbConnections.pageName,
              })
              .from(fbConnections)
              .where(eq(fbConnections.storeId, activeStoreId))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : Promise.resolve(null),
        canViewConnections
          ? db
              .select({
                status: waConnections.status,
                phoneNumber: waConnections.phoneNumber,
              })
              .from(waConnections)
              .where(eq(waConnections.storeId, activeStoreId))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : Promise.resolve(null),
      ])
    : [null, null, null];

  const fbStatus: ChannelStatus = fbConnection?.status ?? "DISCONNECTED";
  const waStatus: ChannelStatus = waConnection?.status ?? "DISCONNECTED";
  const userCapabilities: UserCapability[] = [
    {
      id: "settings.view",
      title: "เข้าหน้าตั้งค่า",
      description: "ดูข้อมูลตั้งค่าร้านและบัญชี",
      granted: canViewSettings,
    },
    {
      id: "settings.update",
      title: "แก้ไขข้อมูลร้าน",
      description: "เปลี่ยนชื่อร้าน โลโก้ ที่อยู่ และข้อมูลพื้นฐาน",
      granted: canUpdateSettings,
    },
    {
      id: "members.view",
      title: "ดูสมาชิกทีม",
      description: "ดูรายชื่อผู้ใช้และสมาชิกในร้าน",
      granted: canViewUsers,
    },
    {
      id: "rbac.roles.view",
      title: "จัดการบทบาทและสิทธิ์",
      description: "กำหนดว่าแต่ละตำแหน่งทำอะไรได้บ้าง",
      granted: canViewRoles,
    },
    {
      id: "units.view",
      title: "จัดการหน่วยสินค้า",
      description: "ตั้งค่าหน่วยสินค้า เช่น ชิ้น แพ็ค กล่อง",
      granted: canViewUnits,
    },
    {
      id: "reports.view",
      title: "ดูรายงาน",
      description: "ดูยอดขายและข้อมูลสรุปผลการขาย",
      granted: canViewReports,
    },
    {
      id: "connections.view",
      title: "ดูการเชื่อมต่อช่องทาง",
      description: "ตรวจสอบสถานะ Facebook Page และ WhatsApp",
      granted: canViewConnections,
    },
  ];
  const grantedCapabilitiesCount = userCapabilities.filter(
    (capability) => capability.granted,
  ).length;

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white">
        <p className="text-xs text-slate-200">Settings Dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold">ตั้งค่าร้านและบัญชี</h1>
        <p className="mt-2 text-sm text-slate-200">
          จัดการข้อมูลร้าน ทีมงาน สิทธิ์ และสถานะการเชื่อมต่อจากหน้าเดียว
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
            ร้าน: {session?.activeStoreName ?? "ยังไม่ได้เลือกร้าน"}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
            บทบาท: {session?.activeRoleName ?? "ยังไม่มี"}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
            System Role: {systemRole}
          </span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-sky-700" />
            <p className="text-sm font-semibold">ภาพรวมร้านที่กำลังใช้งาน</p>
          </div>

          {storeSummary ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border bg-slate-50 px-3 py-2">
                <p className="text-xs text-muted-foreground">ประเภทร้าน</p>
                <p className="text-sm font-medium">
                  {storeTypeLabels[storeSummary.storeType] ?? storeSummary.storeType}
                </p>
              </div>
              <div className="rounded-lg border bg-slate-50 px-3 py-2">
                <p className="text-xs text-muted-foreground">สกุลเงิน</p>
                <p className="text-sm font-medium">{storeSummary.currency}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 px-3 py-2">
                <p className="text-xs text-muted-foreground">ที่อยู่ร้าน</p>
                <p className="text-sm font-medium">{storeSummary.address ?? "ยังไม่ระบุ"}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 px-3 py-2">
                <p className="text-xs text-muted-foreground">เบอร์โทรร้าน</p>
                <p className="text-sm font-medium">{storeSummary.phoneNumber ?? "ยังไม่ระบุ"}</p>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
              ยังไม่พบข้อมูลร้านที่กำลังใช้งาน
            </p>
          )}

          {canViewConnections ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <ChannelBadge label="Facebook Page" status={fbStatus} />
              <ChannelBadge label="WhatsApp" status={waStatus} />
            </div>
          ) : (
            <p className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
              บัญชีนี้ไม่มีสิทธิ์ดูสถานะการเชื่อมต่อช่องทาง
            </p>
          )}
        </article>

        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-violet-700" />
            <p className="text-sm font-semibold">Quick Actions</p>
          </div>

          <Link
            href="/settings/store"
            className={quickActionLinkClassName}
          >
            ข้อมูลร้าน
            <ChevronRight className="h-[18px] w-[18px]" />
          </Link>

          <Link
            href="/stores"
            className={quickActionLinkClassName}
          >
            เลือกร้าน / เปลี่ยนร้าน{isSuperadmin ? " / สร้างร้าน" : ""}
            <ChevronRight className="h-[18px] w-[18px]" />
          </Link>

          {canViewUsers ? (
            <Link
              href="/settings/users"
              className={quickActionLinkClassName}
            >
              จัดการผู้ใช้และสมาชิก
              <ChevronRight className="h-[18px] w-[18px]" />
            </Link>
          ) : null}

          {canViewRoles ? (
            <Link
              href="/settings/roles"
              className={quickActionLinkClassName}
            >
              จัดการบทบาทและสิทธิ์
              <ChevronRight className="h-[18px] w-[18px]" />
            </Link>
          ) : null}

          {canViewUnits ? (
            <Link
              href="/settings/units"
              className={quickActionLinkClassName}
            >
              จัดการหน่วยสินค้า
              <ChevronRight className="h-[18px] w-[18px]" />
            </Link>
          ) : null}

          {canViewReports ? (
            <Link
              href="/reports"
              className={quickActionLinkClassName}
            >
              ไปหน้ารายงาน
              <ChevronRight className="h-[18px] w-[18px]" />
            </Link>
          ) : null}

          {!canUpdateSettings ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลร้าน
            </p>
          ) : null}
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-semibold">สิทธิ์การใช้งาน</p>
          </div>
          <p className="text-xs text-muted-foreground">สิ่งที่บัญชีนี้ใช้งานได้ในร้านปัจจุบัน</p>
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            ใช้งานได้ {grantedCapabilitiesCount} จาก {userCapabilities.length} รายการ
          </p>
          <ul className="divide-y rounded-lg border bg-slate-50">
            {userCapabilities.map((capability) => (
              <li
                key={capability.id}
                className="flex items-start justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{capability.title}</p>
                  <p className="text-xs text-muted-foreground">{capability.description}</p>
                </div>
                <span
                  className={
                    capability.granted
                      ? "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                      : "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                  }
                >
                  {capability.granted ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <CircleAlert className="h-3.5 w-3.5" />
                  )}
                  {capability.granted ? "ทำได้" : "ยังไม่มีสิทธิ์"}
                </span>
              </li>
            ))}
          </ul>
          <details className="rounded-lg border bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">
              ดูรหัสสิทธิ์แบบเทคนิค (สำหรับผู้ดูแลระบบ)
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {permissionKeys.map((permissionKey) => (
                <li key={permissionKey}>{permissionKey}</li>
              ))}
            </ul>
          </details>
        </article>

        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-700" />
            <p className="text-sm font-semibold">สถานะบัญชี</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-700">
              ชื่อผู้ใช้: <span className="font-medium">{session?.displayName ?? "-"}</span>
            </p>
            <p className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-700">
              ร้านที่ใช้งาน: <span className="font-medium">{session?.activeStoreName ?? "-"}</span>
            </p>
            <p className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-700">
              ระบบ: <span className="font-medium">{systemRole}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
              เข้าถึง Settings ได้
            </p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {canUpdateSettings ? (
                <>
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                  แก้ไข Settings ได้
                </>
              ) : (
                <>
                  <CircleAlert className="mr-1 inline h-3.5 w-3.5" />
                  ดูได้อย่างเดียว
                </>
              )}
            </p>
          </div>
        </article>
      </div>

      <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <PlugZap className="h-4 w-4 text-slate-500" />
          ออกจากระบบเมื่อใช้งานเสร็จ เพื่อความปลอดภัยของบัญชี
        </div>
        <div className="w-full sm:w-auto sm:max-w-[220px]">
          <LogoutButton />
        </div>
      </article>
    </section>
  );
}
