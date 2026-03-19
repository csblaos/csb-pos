import { redirect } from "next/navigation";

import { SuperadminManagement } from "@/components/system-admin/superadmin-management";
import { getSession } from "@/lib/auth/session";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import { createTranslator } from "@/lib/i18n/translate";
import { listSuperadmins } from "@/lib/system-admin/superadmins";

export const dynamic = "force-dynamic";

export default async function SystemAdminClientsConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const [superadmins, globalBranchDefaults] = await Promise.all([
    listSuperadmins(),
    getGlobalBranchPolicy(),
  ]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("systemAdmin.config.clients.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemAdmin.config.clients.pageDescription")}</p>
      </header>

      <SuperadminManagement
        language={session.language}
        superadmins={superadmins}
        globalBranchDefaults={globalBranchDefaults}
      />
    </section>
  );
}
