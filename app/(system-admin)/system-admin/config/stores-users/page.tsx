import { asc, desc } from "drizzle-orm";

import { SystemStoreUserConfig } from "@/components/system-admin/system-store-user-config";
import { db } from "@/lib/db/client";
import { stores, users } from "@/lib/db/schema";

export default async function SystemAdminStoresUsersConfigPage() {
  const [storeRows, userRows] = await Promise.all([
    db
      .select({
        id: stores.id,
        name: stores.name,
        storeType: stores.storeType,
        currency: stores.currency,
        vatEnabled: stores.vatEnabled,
        vatRate: stores.vatRate,
        maxBranchesOverride: stores.maxBranchesOverride,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .orderBy(desc(stores.createdAt)),
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        systemRole: users.systemRole,
        canCreateStores: users.canCreateStores,
        maxStores: users.maxStores,
        canCreateBranches: users.canCreateBranches,
        maxBranchesPerStore: users.maxBranchesPerStore,
        sessionLimit: users.sessionLimit,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.name), asc(users.createdAt)),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Store & User Config</h1>
        <p className="text-sm text-muted-foreground">
          SYSTEM_ADMIN สามารถตั้งค่าร้านทั้งหมด และผู้ใช้ทั้งหมดได้จากหน้านี้
        </p>
      </header>

      <SystemStoreUserConfig stores={storeRows} users={userRows} />
    </section>
  );
}
