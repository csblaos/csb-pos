import Link from "next/link";
import { redirect } from "next/navigation";

import { BottomTabNav } from "@/components/app/bottom-tab-nav";
import { MenuBackButton } from "@/components/ui/menu-back-button";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";
import { getStorefrontLayoutPreset } from "@/lib/storefront/layout/registry";
import { normalizeStoreType } from "@/lib/storefront/types";

function StoreSwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 10l1.2-4.2A1.5 1.5 0 0 1 5.64 4.7h12.72a1.5 1.5 0 0 1 1.44 1.08L21 10" />
      <path d="M4 10h16v7.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V10Z" />
      <path d="M9 14h6" />
      <path d="M17.6 6.4h2.9" />
      <path d="m19.2 4.8 1.3 1.6-1.3 1.6" />
    </svg>
  );
}

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
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const activeStoreType = normalizeStoreType(session.activeStoreType);
  const layoutPreset = getStorefrontLayoutPreset(activeStoreType);

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col ${layoutPreset.appBgClassName} lg:max-w-[var(--app-shell-max-width)] lg:border-x lg:shadow-sm`}
    >
      <header
        className={`sticky top-0 z-10 border-b px-4 py-3 backdrop-blur lg:px-6 ${layoutPreset.headerBgClassName}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MenuBackButton
              roots={["/dashboard", "/orders", "/stock", "/products", "/settings", "/stores", "/reports"]}
              className="-ml-1 shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {session.activeStoreName ?? "-"}
              </p>
              <p className="mt-1 truncate sm:hidden">
                <span className="inline-flex max-w-full items-center rounded-full border bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {layoutPreset.shellTitle}
                </span>
              </p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {layoutPreset.shellTitle}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Link
              href="/stores"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-xs"
            >
              <StoreSwitchIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span>เปลี่ยนร้าน</span>
            </Link>
          </div>
        </div>
        {layoutPreset.modeNoteText ? (
          <p className={`mt-2 text-xs ${layoutPreset.modeNoteClassName}`}>
            {layoutPreset.modeNoteText}
          </p>
        ) : null}
      </header>
      <main className="flex-1 px-4 pb-28 pt-4 lg:px-6 lg:pb-32">{children}</main>
      <BottomTabNav permissionKeys={permissionKeys} storeType={activeStoreType} />
    </div>
  );
}
