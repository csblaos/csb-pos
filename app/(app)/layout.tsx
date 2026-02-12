import Link from "next/link";
import { redirect } from "next/navigation";

import { BottomTabNav } from "@/components/app/bottom-tab-nav";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";

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

  return (
    <div className="mx-auto flex min-h-dvh w-full flex-col bg-slate-50 lg:max-w-[var(--app-shell-max-width)] lg:border-x lg:shadow-sm">
      <header className="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              ร้าน {session?.activeStoreName ?? "-"}
            </p>
            <p className="text-base font-semibold">ระบบขายหน้าร้าน</p>
          </div>
          <Link
            href="/stores"
            className="rounded-md border px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            เปลี่ยนร้าน
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4 lg:px-6 lg:pb-32">{children}</main>
      <BottomTabNav permissionKeys={permissionKeys} />
    </div>
  );
}
