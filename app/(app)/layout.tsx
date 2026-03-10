import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppTopNav } from "@/components/app/app-top-nav";
import { BottomTabNav } from "@/components/app/bottom-tab-nav";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { stores } from "@/lib/db/schema";
import {
  getStoreShellProfileFromPostgres,
  logAuthRbacReadFallback,
} from "@/lib/platform/postgres-auth-rbac";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";
import { getStorefrontLayoutPreset } from "@/lib/storefront/layout/registry";
import { normalizeStoreType } from "@/lib/storefront/types";

const getTursoDb = async () => (await import("@/lib/db/client")).db;

const getActiveStoreProfile = async (storeId: string) => {
  try {
    const postgresProfile = await getStoreShellProfileFromPostgres(storeId);
    if (postgresProfile !== undefined) {
      return postgresProfile ?? null;
    }
  } catch (error) {
    logAuthRbacReadFallback("app-shell.store-profile", error);
  }

  const db = await getTursoDb();
  return db
    .select({
      name: stores.name,
      logoUrl: stores.logoUrl,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole === "SYSTEM_ADMIN") {
    redirect("/system-admin");
  }

  if (!session.hasStoreMembership || !session.activeStoreId) {
    if (systemRole === "SUPERADMIN") {
      redirect("/onboarding");
    }
    redirect("/login");
  }

  const [permissionKeys, activeStoreProfile] = await Promise.all([
    getUserPermissionsForCurrentSession(),
    getActiveStoreProfile(session.activeStoreId),
  ]);
  const activeStoreType = normalizeStoreType(session.activeStoreType);
  const layoutPreset = getStorefrontLayoutPreset(activeStoreType);
  const activeStoreName = activeStoreProfile?.name ?? session.activeStoreName ?? "-";

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col ${layoutPreset.appBgClassName} min-[1200px]:max-w-[var(--app-shell-max-width-desktop)] min-[1200px]:border-x min-[1200px]:shadow-sm`}
    >
      <header
        className={`sticky top-0 z-10 border-b px-4 py-3 backdrop-blur md:px-6 min-[1200px]:px-8 ${layoutPreset.headerBgClassName}`}
      >
        <AppTopNav
          activeStoreName={activeStoreName}
          activeStoreLogoUrl={activeStoreProfile?.logoUrl ?? null}
          activeBranchName={session.activeBranchName}
          shellTitle={layoutPreset.shellTitle}
          canViewNotifications={
            permissionKeys.includes("*") || permissionKeys.includes("settings.view")
          }
        />
        {layoutPreset.modeNoteText ? (
          <p className={`mt-2 text-xs ${layoutPreset.modeNoteClassName}`}>
            {layoutPreset.modeNoteText}
          </p>
        ) : null}
      </header>
      <main className="flex-1 px-4 pb-[calc(var(--bottom-tab-nav-height)+env(safe-area-inset-bottom)+1rem)] pt-4 md:px-6 min-[1200px]:px-8 min-[1200px]:pb-[calc(var(--bottom-tab-nav-height)+1.5rem)]">
        {children}
      </main>
      <BottomTabNav permissionKeys={permissionKeys} storeType={activeStoreType} />
    </div>
  );
}
