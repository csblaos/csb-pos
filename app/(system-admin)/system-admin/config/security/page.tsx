import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n/translate";

export default async function SystemAdminSecurityPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("systemAdmin.config.security.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemAdmin.config.security.pageDescription")}</p>
      </header>

      <article className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">{t("systemAdmin.config.security.currentStatusTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("systemAdmin.config.security.currentStatusDescription")}</p>
      </article>
    </section>
  );
}
