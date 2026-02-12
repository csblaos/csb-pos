import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { SystemAdminBottomNav } from "@/components/system-admin/system-admin-bottom-nav";
import { SystemAdminLogoutButton } from "@/components/system-admin/system-admin-logout-button";

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
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">POS System Admin</p>
            <p className="text-base font-semibold">ศูนย์จัดการระบบกลาง</p>
          </div>
          <SystemAdminLogoutButton />
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4 lg:px-6 lg:pb-32">{children}</main>
      <SystemAdminBottomNav />
    </div>
  );
}
