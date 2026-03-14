import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountLanguageSettings } from "@/components/app/account-language-settings";
import { getSession } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n/translate";
import { getUserPermissionsForCurrentSession, isPermissionGranted } from "@/lib/rbac/access";

export default async function SettingsLanguagePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const permissionKeys = await getUserPermissionsForCurrentSession();
  const canViewSettings = isPermissionGranted(permissionKeys, "settings.view");
  const t = createTranslator(session.language);

  if (!canViewSettings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t("settings.language.pageTitle")}</h1>
        <p className="text-sm text-red-600">{t("settings.language.noPermission")}</p>
        <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
          {t("settings.language.backToSettings")}
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          {t("settings.language.pageTitle")}
        </h1>
        <p className="text-sm text-slate-500">{t("settings.language.pageDescription")}</p>
      </header>

      <AccountLanguageSettings initialLanguage={session.language} />
    </section>
  );
}
