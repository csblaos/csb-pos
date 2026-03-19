import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { SystemAdminBottomNav } from "@/components/system-admin/system-admin-bottom-nav";
import { SystemAdminLogoutButton } from "@/components/system-admin/system-admin-logout-button";
import { MenuBackButton } from "@/components/ui/menu-back-button";
import { createTranslator } from "@/lib/i18n/translate";

export default async function SystemAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole !== "SYSTEM_ADMIN") {
    redirect("/");
  }

  const t = createTranslator(session.language);

  return (
    <div className="mx-auto flex min-h-dvh w-full flex-col bg-slate-50 min-[1200px]:max-w-[var(--app-shell-max-width-desktop)] min-[1200px]:border-x min-[1200px]:shadow-sm">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur md:px-6 min-[1200px]:px-8">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <MenuBackButton
              roots={["/system-admin", "/system-admin/config"]}
              className="-ml-1 h-8 rounded-full px-2.5 text-xs"
              showLabelOnMobile
              keepSpaceWhenHidden
            />
            <SystemAdminLogoutButton language={session.language} />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t("systemAdmin.layout.eyebrow")}</p>
            <p className="text-base font-semibold tracking-tight">{t("systemAdmin.layout.title")}</p>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4 md:px-6 min-[1200px]:px-8 min-[1200px]:pb-32">
        {children}
      </main>
      <SystemAdminBottomNav language={session.language} />
    </div>
  );
}
