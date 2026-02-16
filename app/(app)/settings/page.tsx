import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Lock,
  Package,
  PackageCheck,
  PlugZap,
  Settings2,
  Shield,
  Store,
  Tags,
  UserRound,
  Users,
  WalletCards,
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
import { buildUserCapabilities } from "@/lib/settings/account-capabilities";

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

type SettingsLinkItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  visible: boolean;
  badgeText?: string;
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
  badgeText,
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
      {badgeText ? (
        <span className="inline-flex shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700">
          {badgeText}
        </span>
      ) : null}
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
  const canViewProducts = isPermissionGranted(permissionKeys, "products.view");
  const canViewReports = isPermissionGranted(permissionKeys, "reports.view");
  const canViewConnections = isPermissionGranted(permissionKeys, "connections.view");
  const canUpdateSettings = isPermissionGranted(permissionKeys, "settings.update");
  const userCapabilities = buildUserCapabilities(permissionKeys);
  const grantedCapabilitiesCount = userCapabilities.filter((capability) => capability.granted).length;

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

  const managementLinks: SettingsLinkItem[] = [
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
      href: "/settings/stores",
      title: "เลือกร้าน / เปลี่ยนร้าน",
      description: "สลับร้าน/สาขาในร้านที่กำลังเลือก",
      icon: Settings2,
      visible: true,
    },
    {
      id: "payment-accounts",
      href: "/settings/store/payments",
      title: "บัญชีรับเงิน",
      description: "จัดการบัญชีธนาคารและ QR โอนเงินของร้าน",
      icon: WalletCards,
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
      id: "reports",
      href: "/reports",
      title: "รายงาน",
      description: "ดูภาพรวมยอดขายและแนวโน้ม",
      icon: PlugZap,
      visible: canViewReports,
    },
  ];

  const productSettingsLinks: SettingsLinkItem[] = [
    {
      id: "categories",
      href: "/settings/categories",
      title: "หมวดหมู่สินค้า",
      description: "จัดกลุ่มสินค้า เช่น อาหาร เครื่องดื่ม ขนม",
      icon: Tags,
      visible: canViewProducts,
    },
    {
      id: "stock-thresholds",
      href: "/settings/stock",
      title: "ตั้งค่าแจ้งเตือนสต็อก",
      description: "กำหนดเกณฑ์สต็อกหมดและสต็อกต่ำของร้าน",
      icon: PackageCheck,
      visible: canViewProducts,
    },
    {
      id: "units",
      href: "/settings/units",
      title: "หน่วยสินค้า",
      description: "จัดการหน่วยพื้นฐาน เช่น PCS, PACK, BOX",
      icon: Package,
      visible: canViewUnits,
    },
  ];

  const accountLinks: SettingsLinkItem[] = [

    {
      id: "account-profile",
      href: "/settings/profile",
      title: "โปรไฟล์บัญชี",
      description: "แก้ไขชื่อผู้ใช้และตรวจสอบข้อมูลล็อกอิน",
      icon: UserRound,
      visible: true,
    },
    {
      id: "account-permissions",
      href: "/settings/permissions",
      title: "สิทธิ์ของบัญชี",
      description: `ใช้งานได้ ${grantedCapabilitiesCount} รายการ`,
      icon: CheckCircle2,
      visible: true,
    },
    {
      id: "account-security",
      href: "/settings/security",
      title: "ความปลอดภัยบัญชี",
      description: "จัดการความปลอดภัยและออกจากระบบ",
      icon: Lock,
      visible: true,
    },
    {
      id: "account-notifications",
      href: "/settings/notifications",
      title: "การแจ้งเตือน",
      description: "ตั้งค่าช่องทางและประเภทการแจ้งเตือน",
      icon: Bell,
      visible: true,
    },
  ];

  const adminLinks: SettingsLinkItem[] = [
    {
      id: "superadmin-stores",
      href: "/settings/superadmin",
      title: "Superadmin Center",
      description: "จัดการร้าน สาขา และผู้ใช้ข้ามร้านในพื้นที่แยก",
      icon: Shield,
      visible: isSuperadmin,
      badgeText: "SUPERADMIN",
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
        {adminLinks.some((item) => item.visible) ? (
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              พื้นที่ผู้ดูแล
            </p>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {adminLinks
                  .filter((item) => item.visible)
                  .map((item) => (
                    <li key={item.id}>
                      <SettingsLinkRow
                        href={item.href}
                        title={item.title}
                        description={item.description}
                        icon={item.icon}
                        badgeText={item.badgeText}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}

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
              {managementLinks
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

        {productSettingsLinks.some((item) => item.visible) && (
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              ตั้งค่าสินค้า
            </p>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {productSettingsLinks
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
        )}

        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            บัญชีของฉัน
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {accountLinks
                .filter((item) => item.visible)
                .map((item) => (
                  <li key={item.id}>
                    <SettingsLinkRow
                      href={item.href}
                      title={item.title}
                      description={item.description}
                      icon={item.icon}
                      badgeText={item.badgeText}
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
