import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { StoreInventorySettings } from "@/components/app/store-inventory-settings";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

export default async function SettingsStockPage() {
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
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">ตั้งค่าแจ้งเตือนสต็อก</h1>
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์ดูหน้านี้</p>
      </section>
    );
  }

  const [store] = await db
    .select({
      outStockThreshold: stores.outStockThreshold,
      lowStockThreshold: stores.lowStockThreshold,
    })
    .from(stores)
    .where(eq(stores.id, session.activeStoreId))
    .limit(1);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">ตั้งค่าแจ้งเตือนสต็อก</h1>
        <p className="text-sm text-muted-foreground">
          ตั้งค่าเกณฑ์สต็อกหมดและสต็อกต่ำสำหรับร้านนี้
        </p>
      </header>

      <StoreInventorySettings
        initialOutStockThreshold={store?.outStockThreshold ?? 0}
        initialLowStockThreshold={store?.lowStockThreshold ?? 10}
        canUpdate={canUpdate}
      />
    </section>
  );
}
