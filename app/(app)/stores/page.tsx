import Link from "next/link";
import { redirect } from "next/navigation";

import { StoresManagement } from "@/components/app/stores-management";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import {
  evaluateStoreCreationAccess,
  getStoreCreationPolicy,
} from "@/lib/auth/store-creation";
import { getUserSystemRole } from "@/lib/auth/system-admin";

export default async function StoresPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const systemRole = await getUserSystemRole(session.userId);
  const isSuperadmin = systemRole === "SUPERADMIN";

  let canCreateStore = false;
  let createStoreBlockedReason: string | null = null;
  let storeQuotaSummary: string | null = null;

  if (isSuperadmin) {
    const policy = await getStoreCreationPolicy(session.userId);
    const access = evaluateStoreCreationAccess(policy);

    canCreateStore = access.allowed;
    createStoreBlockedReason = access.reason ?? null;
    storeQuotaSummary =
      typeof policy.maxStores === "number"
        ? `โควตาร้านของบัญชีนี้: ${policy.activeOwnerStoreCount.toLocaleString("th-TH")} / ${policy.maxStores.toLocaleString("th-TH")} ร้าน`
        : `โควตาร้านของบัญชีนี้: ไม่จำกัด (ปัจจุบัน ${policy.activeOwnerStoreCount.toLocaleString("th-TH")} ร้าน)`;
  }

  const activeStoreId = session.activeStoreId ?? memberships[0].storeId;

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">จัดการร้านที่เข้าถึงได้</h1>
        <p className="text-sm text-muted-foreground">
          สลับร้านที่ใช้งาน และสร้างร้านเพิ่มสำหรับบัญชี SUPERADMIN
        </p>
      </header>

      <StoresManagement
        memberships={memberships}
        activeStoreId={activeStoreId}
        isSuperadmin={isSuperadmin}
        canCreateStore={canCreateStore}
        createStoreBlockedReason={createStoreBlockedReason}
        storeQuotaSummary={storeQuotaSummary}
      />

      <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
        กลับไปหน้าตั้งค่า
      </Link>
    </section>
  );
}
