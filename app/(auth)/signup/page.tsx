import { redirect } from "next/navigation";

import { SignupForm } from "@/components/app/signup-form";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";
import { getStorefrontEntryRoute } from "@/lib/storefront/routing";

export default async function SignupPage() {
  const session = await getSession();
  if (session) {
    const systemRole = await getUserSystemRole(session.userId);
    if (systemRole === "SYSTEM_ADMIN") {
      redirect("/system-admin");
    }

    if (!session.hasStoreMembership || !session.activeStoreId) {
      redirect("/onboarding");
    }

    const permissionKeys = await getUserPermissionsForCurrentSession();
    redirect(getStorefrontEntryRoute(session.activeStoreType, permissionKeys));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-blue-600">SaaS POS</p>
        <h1 className="text-2xl font-semibold tracking-tight">สมัครสมาชิก</h1>
        <p className="text-sm text-muted-foreground">
          สร้างบัญชีเพื่อเริ่มตั้งค่าร้านค้า
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
