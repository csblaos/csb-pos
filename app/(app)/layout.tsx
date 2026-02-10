import { redirect } from "next/navigation";

import { BottomTabNav } from "@/components/app/bottom-tab-nav";
import { getSession } from "@/lib/auth/session";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.hasStoreMembership || !session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          ร้าน {session?.activeStoreName ?? "-"}
        </p>
        <p className="text-base font-semibold">ระบบขายหน้าร้าน</p>
      </header>
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <BottomTabNav permissionKeys={permissionKeys} />
    </div>
  );
}
