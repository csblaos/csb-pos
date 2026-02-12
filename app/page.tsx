import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";
import { getPreferredAuthorizedRoute } from "@/lib/rbac/navigation";
import { redirect } from "next/navigation";

export default async function HomePage() {
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
  redirect(getPreferredAuthorizedRoute(permissionKeys) ?? "/dashboard");
}
