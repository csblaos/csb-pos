import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { SystemAdminBottomNav } from "@/components/system-admin/system-admin-bottom-nav";
import { SystemAdminLogoutButton } from "@/components/system-admin/system-admin-logout-button";
import { MenuBackButton } from "@/components/ui/menu-back-button";

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

  return (
    <div className="mx-auto flex min-h-dvh w-full flex-col bg-slate-50 lg:max-w-6xl lg:border-x lg:shadow-sm">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <MenuBackButton
              roots={["/system-admin", "/system-admin/config"]}
              className="-ml-1 h-8 rounded-full px-2.5 text-xs"
              showLabelOnMobile
              keepSpaceWhenHidden
            />
            <SystemAdminLogoutButton />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">POS System Admin</p>
            <p className="text-base font-semibold tracking-tight">ศูนย์จัดการระบบกลาง</p>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4 lg:px-6 lg:pb-32">{children}</main>
      <SystemAdminBottomNav />
    </div>
  );
}
