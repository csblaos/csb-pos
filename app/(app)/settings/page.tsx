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
  type LucideIcon,
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

type ChannelStatus = keyof typeof channelStatusLabels;

type UserCapability = {
  id: string;
  title: string;
  description: string;
  granted: boolean;
};

type SettingsLinkItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  visible: boolean;
};

function ChannelStatusPill({ status }: { status: ChannelStatus }) {
  const toneClassName =
    status === "CONNECTED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "ERROR"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}
    >
      {channelStatusLabels[status]}
    </span>
  );
}

function SettingsLinkRow({
  href,
  title,
  description,
  icon: Icon,
}: Omit<SettingsLinkItem, "id" | "visible">) {
  return (
    <Link
      href={href}
      className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
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

  const settingsLinks: SettingsLinkItem[] = [
    {
      id: "store-profile",
      href: "/settings/store",
      title: "ข้อมูลร้าน",
      description: "ชื่อร้าน โลโก้ ที่อยู่ และช่องทางติดต่อ",
      icon: Store,
      visible: true,
    },
    {
      id: "switch-store",
      href: "/stores",
      title: "เลือกร้าน / เปลี่ยนร้าน",
      description: isSuperadmin ? "สลับร้านหรือสร้างร้านใหม่" : "สลับร้านที่กำลังใช้งาน",
      icon: Settings2,
      visible: true,
    },
    {
      id: "users",
      href: "/settings/users",
      title: "ผู้ใช้และสมาชิก",
      description: "จัดการสมาชิกทีมและสถานะผู้ใช้งาน",
      icon: Users,
      visible: canViewUsers,
    },
    {
      id: "roles",
      href: "/settings/roles",
      title: "บทบาทและสิทธิ์",
      description: "กำหนดสิทธิ์การเข้าถึงของแต่ละตำแหน่ง",
      icon: Shield,
      visible: canViewRoles,
    },
    {
      id: "units",
      href: "/settings/units",
      title: "หน่วยสินค้า",
      description: "จัดการหน่วยพื้นฐาน เช่น PCS, PACK, BOX",
      icon: Settings2,
      visible: canViewUnits,
    },
    {
      id: "reports",
      href: "/reports",
      title: "รายงาน",
      description: "ดูภาพรวมยอดขายและแนวโน้ม",
      icon: PlugZap,
      visible: canViewReports,
    },
  ];

  const storeTypeLabel = storeSummary
    ? storeTypeLabels[storeSummary.storeType] ?? storeSummary.storeType
    : "ยังไม่ระบุ";

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">การตั้งค่า</h1>
        <p className="text-sm text-slate-500">จัดการร้าน ทีมงาน สิทธิ์ และการเชื่อมต่อจากที่เดียว</p>
      </header>

      <div className="space-y-4">
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            บัญชีและร้าน
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              <li className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Store className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {session?.activeStoreName ?? "ยังไม่ได้เลือกร้าน"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {storeTypeLabel} • {storeSummary?.currency ?? "-"}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {session?.activeRoleName ?? "ไม่มีบทบาท"}
                </span>
              </li>

              <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">ที่อยู่ร้าน</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {storeSummary?.address?.trim() ? storeSummary.address : "ยังไม่ระบุ"}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-slate-500">System: {systemRole}</span>
              </li>

              <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">เบอร์โทรร้าน</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {storeSummary?.phoneNumber?.trim() ? storeSummary.phoneNumber : "ยังไม่ระบุ"}
                  </p>
                </div>
                {!canUpdateSettings ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    สิทธิ์ดูอย่างเดียว
                  </span>
                ) : null}
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            การจัดการ
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {settingsLinks
                .filter((item) => item.visible)
                .map((item) => (
                  <li key={item.id}>
                    <SettingsLinkRow
                      href={item.href}
                      title={item.title}
                      description={item.description}
                      icon={item.icon}
                    />
                  </li>
                ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            การเชื่อมต่อช่องทาง
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {canViewConnections ? (
              <ul className="divide-y divide-slate-100">
                <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">Facebook Page</p>
                    <p className="truncate text-xs text-slate-500">
                      {fbConnection?.pageName?.trim() ? fbConnection.pageName : "ยังไม่ผูกเพจ"}
                    </p>
                  </div>
                  <ChannelStatusPill status={fbStatus} />
                </li>
                <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">WhatsApp</p>
                    <p className="truncate text-xs text-slate-500">
                      {waConnection?.phoneNumber?.trim()
                        ? waConnection.phoneNumber
                        : "ยังไม่ผูกหมายเลข"}
                    </p>
                  </div>
                  <ChannelStatusPill status={waStatus} />
                </li>
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-500">
                บัญชีนี้ไม่มีสิทธิ์ดูสถานะการเชื่อมต่อช่องทาง
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            สิทธิ์ของบัญชี
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">
                ใช้งานได้ {grantedCapabilitiesCount} จาก {userCapabilities.length} รายการ
              </p>
              <p className="mt-0.5 text-xs text-slate-500">อ้างอิงตามบทบาทในร้านที่กำลังใช้งาน</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {userCapabilities.map((capability) => (
                <li
                  key={capability.id}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{capability.title}</p>
                    <p className="truncate text-xs text-slate-500">{capability.description}</p>
                  </div>
                  <span
                    className={
                      capability.granted
                        ? "inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                        : "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700"
                    }
                  >
                    {capability.granted ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5" />
                    )}
                    {capability.granted ? "ทำได้" : "ไม่มีสิทธิ์"}
                  </span>
                </li>
              ))}
            </ul>
            <details className="border-t border-slate-100 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                ดูรหัสสิทธิ์แบบเทคนิค
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {permissionKeys.map((permissionKey) => (
                  <li key={permissionKey}>{permissionKey}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>

        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            ความปลอดภัย
          </p>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start gap-2 text-sm text-slate-700">
              <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              ออกจากระบบหลังใช้งาน เพื่อความปลอดภัยของบัญชี
            </div>
            <div className="sm:max-w-[220px]">
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
