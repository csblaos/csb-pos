import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/app/login-form";
import { getSession } from "@/lib/auth/session";
import { getUserSystemRole } from "@/lib/auth/system-admin";
import { defaultAppLanguage } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { getUserPermissionsForCurrentSession } from "@/lib/rbac/access";
import { getStorefrontEntryRoute } from "@/lib/storefront/routing";

export default async function LoginPage() {
  const t = createTranslator(defaultAppLanguage);
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
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.login.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.login.description")}</p>
      </div>
      <LoginForm language={defaultAppLanguage} />
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.login.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-blue-700 hover:underline">
          {t("auth.login.signupLink")}
        </Link>
      </p>
    </div>
  );
}
