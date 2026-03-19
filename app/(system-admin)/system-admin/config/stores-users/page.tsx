import { redirect } from "next/navigation";

import { SystemStoreUserConfig } from "@/components/system-admin/system-store-user-config";
import { getSession } from "@/lib/auth/session";
import { queryMany } from "@/lib/db/query";
import { createTranslator } from "@/lib/i18n/translate";

type StoreType = "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
type SystemRole = "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";

export default async function SystemAdminStoresUsersConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const [rawStoreRows, rawUserRows] = await Promise.all([
    queryMany<{
      id: string;
      name: string;
      storeType: string | null;
      currency: string | null;
      vatEnabled: boolean | null;
      vatRate: number | null;
      maxBranchesOverride: number | null;
      createdAt: string;
    }>(
      `
        select
          id,
          name,
          store_type as "storeType",
          currency,
          vat_enabled as "vatEnabled",
          vat_rate as "vatRate",
          max_branches_override as "maxBranchesOverride",
          created_at as "createdAt"
        from stores
        order by created_at desc
      `,
    ),
    queryMany<{
      id: string;
      email: string;
      name: string;
      systemRole: string | null;
      canCreateStores: boolean | null;
      maxStores: number | null;
      canCreateBranches: boolean | null;
      maxBranchesPerStore: number | null;
      sessionLimit: number | null;
      createdAt: string;
    }>(
      `
        select
          id,
          email,
          name,
          system_role as "systemRole",
          can_create_stores as "canCreateStores",
          max_stores as "maxStores",
          can_create_branches as "canCreateBranches",
          max_branches_per_store as "maxBranchesPerStore",
          session_limit as "sessionLimit",
          created_at as "createdAt"
        from users
        order by name asc, created_at asc
      `,
    ),
  ]);

  const storeRows = rawStoreRows.map((row) => ({
    ...row,
    storeType: (
      row.storeType === "ONLINE_RETAIL" ||
      row.storeType === "RESTAURANT" ||
      row.storeType === "CAFE" ||
      row.storeType === "OTHER"
        ? row.storeType
        : "OTHER"
    ) as StoreType,
    currency: row.currency ?? "LAK",
    vatEnabled: row.vatEnabled === true,
    vatRate: typeof row.vatRate === "number" ? row.vatRate : 0,
  }));

  const userRows = rawUserRows.map((row) => ({
    ...row,
    systemRole: (
      row.systemRole === "SUPERADMIN" ||
      row.systemRole === "SYSTEM_ADMIN" ||
      row.systemRole === "USER"
        ? row.systemRole
        : "USER"
    ) as SystemRole,
  }));

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("systemAdmin.config.storesUsers.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemAdmin.config.storesUsers.pageDescription")}</p>
      </header>

      <SystemStoreUserConfig language={session.language} stores={storeRows} users={userRows} />
    </section>
  );
}
