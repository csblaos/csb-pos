import { redirect } from "next/navigation";

import { SystemBranchPolicyConfig } from "@/components/system-admin/system-branch-policy-config";
import { SystemSessionPolicyConfig } from "@/components/system-admin/system-session-policy-config";
import { SystemStoreLogoPolicyConfig } from "@/components/system-admin/system-store-logo-policy-config";
import { getSession } from "@/lib/auth/session";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import { createTranslator } from "@/lib/i18n/translate";
import { getGlobalSessionPolicy, getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";

export default async function SystemAdminSystemConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const [branchPolicy, sessionPolicy, storeLogoPolicy] = await Promise.all([
    getGlobalBranchPolicy(),
    getGlobalSessionPolicy(),
    getGlobalStoreLogoPolicy(),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("systemAdmin.config.system.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemAdmin.config.system.pageDescription")}</p>
      </header>

      <SystemBranchPolicyConfig initialConfig={branchPolicy} language={session.language} />
      <SystemSessionPolicyConfig initialConfig={sessionPolicy} language={session.language} />
      <SystemStoreLogoPolicyConfig initialConfig={storeLogoPolicy} language={session.language} />
    </section>
  );
}
