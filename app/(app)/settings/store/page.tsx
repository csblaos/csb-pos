import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { StoreProfileSettings } from "@/components/app/store-profile-settings";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

export default async function SettingsStorePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canView = isPermissionGranted(permissionKeys, "settings.view");
  const canUpdate = isPermissionGranted(permissionKeys, "settings.update");

  if (!canView) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">ข้อมูลร้าน</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  const [store] = await db
    .select({
      id: stores.id,
      name: stores.name,
      logoName: stores.logoName,
      logoUrl: stores.logoUrl,
      address: stores.address,
      phoneNumber: stores.phoneNumber,
    })
    .from(stores)
    .where(eq(stores.id, session.activeStoreId))
    .limit(1);

  if (!store) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">ข้อมูลร้าน</h1>
        <p className="text-sm text-red-600">ไม่พบข้อมูลร้านที่กำลังใช้งาน</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          กลับไปหน้าตั้งค่า
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">ข้อมูลร้าน</h1>
        <p className="text-sm text-muted-foreground">
          จัดการชื่อร้าน โลโก้ ที่อยู่ และข้อมูลติดต่อของร้านที่กำลังใช้งาน
        </p>
      </header>

      <StoreProfileSettings
        storeId={store.id}
        storeName={store.name}
        initialLogoName={store.logoName}
        initialLogoUrl={store.logoUrl}
        initialAddress={store.address}
        initialPhoneNumber={store.phoneNumber}
        canUpdate={canUpdate}
      />
    </section>
  );
}
