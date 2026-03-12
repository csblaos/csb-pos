import { redirect } from "next/navigation";

import { AppTopNav } from "@/components/app/app-top-nav";
import { BottomTabNav } from "@/components/app/bottom-tab-nav";
import { getAppShellContext } from "@/lib/app-shell/context";
import { getStorefrontLayoutPreset } from "@/lib/storefront/layout/registry";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const {
    session,
    systemRole,
    permissionKeys,
    activeStoreProfile,
    activeStoreType,
    activeStoreName,
    canViewNotifications,
  } = await getAppShellContext();

  if (!session) {
    redirect("/login");
  }

  if (systemRole === "SYSTEM_ADMIN") {
    redirect("/system-admin");
  }

  if (!session.hasStoreMembership || !session.activeStoreId) {
    if (systemRole === "SUPERADMIN") {
      redirect("/onboarding");
    }
    redirect("/login");
  }

  const layoutPreset = getStorefrontLayoutPreset(activeStoreType);

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
          canViewNotifications={canViewNotifications}
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
