import Link from "next/link";
import { Settings2, ShieldCheck, Store, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n/translate";

export default async function SystemAdminConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const menus = [
    {
      href: "/system-admin/config/clients",
      title: t("systemAdmin.config.menu.clients.title"),
      description: t("systemAdmin.config.menu.clients.description"),
      icon: Users,
    },
    {
      href: "/system-admin/config/system",
      title: t("systemAdmin.config.menu.system.title"),
      description: t("systemAdmin.config.menu.system.description"),
      icon: Settings2,
    },
    {
      href: "/system-admin/config/stores-users",
      title: t("systemAdmin.config.menu.storesUsers.title"),
      description: t("systemAdmin.config.menu.storesUsers.description"),
      icon: Store,
    },
    {
      href: "/system-admin/config/security",
      title: t("systemAdmin.config.menu.security.title"),
      description: t("systemAdmin.config.menu.security.description"),
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("systemAdmin.config.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemAdmin.config.description")}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {menus.map((menu) => {
          const Icon = menu.icon;

          return (
            <Link
              key={menu.href}
              href={menu.href}
              prefetch
              className="rounded-xl border bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/40"
            >
              <Icon className="h-5 w-5 text-blue-700" />
              <h2 className="mt-3 text-sm font-semibold">{menu.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{menu.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
