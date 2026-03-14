import Link from "next/link";

import { defaultAppLanguage } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";

type AccountStatus = "INVITED" | "SUSPENDED" | "NO_ACTIVE_STORE";

const normalizeStatus = (
  rawStatus: string | string[] | undefined,
): AccountStatus => {
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  if (status === "INVITED" || status === "SUSPENDED" || status === "NO_ACTIVE_STORE") {
    return status;
  }
  return "NO_ACTIVE_STORE";
};

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const t = createTranslator(defaultAppLanguage);
  const params = await searchParams;
  const status = normalizeStatus(params.status);
  const statusContent: Record<
    AccountStatus,
    { title: string; description: string; badgeClassName: string }
  > = {
    INVITED: {
      title: t("auth.accountStatus.invitedTitle"),
      description: t("auth.accountStatus.invitedDescription"),
      badgeClassName: "border-amber-300 bg-amber-50 text-amber-700",
    },
    SUSPENDED: {
      title: t("auth.accountStatus.suspendedTitle"),
      description: t("auth.accountStatus.suspendedDescription"),
      badgeClassName: "border-rose-300 bg-rose-50 text-rose-700",
    },
    NO_ACTIVE_STORE: {
      title: t("auth.accountStatus.noStoreTitle"),
      description: t("auth.accountStatus.noStoreDescription"),
      badgeClassName: "border-slate-300 bg-slate-50 text-slate-700",
    },
  };
  const content = statusContent[status];

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-blue-600">SaaS POS</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.accountStatus.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.accountStatus.pageDescription")}</p>
      </div>

      <div className={`rounded-xl border p-4 ${content.badgeClassName}`}>
        <p className="text-sm font-semibold">{content.title}</p>
        <p className="mt-2 text-sm">{content.description}</p>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        {t("auth.accountStatus.help")}
      </div>

      <div className="flex justify-center">
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
        >
          {t("auth.accountStatus.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
