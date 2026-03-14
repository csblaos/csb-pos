import Link from "next/link";
import { ChevronRight, Settings2, ShieldCheck, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { StoresManagement } from "@/components/app/stores-management";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import {
  evaluateStoreCreationAccess,
  getStoreCreationPolicy,
} from "@/lib/auth/store-creation";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";

export default async function SettingsSuperadminStoreConfigPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const locale = getAppLanguageLocale(session.language);

  const memberships = await listActiveMemberships(session.userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const policy = await getStoreCreationPolicy(session.userId);
  const access = evaluateStoreCreationAccess(policy);
  const canCreateStore = access.allowed;
  const createStoreBlockedReason = access.reason ?? null;
  const storeQuotaSummary =
    typeof policy.maxStores === "number"
      ? t("superadmin.stores.storeConfig.quotaLimited", {
          current: policy.activeOwnerStoreCount.toLocaleString(locale),
          max: policy.maxStores.toLocaleString(locale),
        })
      : t("superadmin.stores.storeConfig.quotaUnlimited", {
          current: policy.activeOwnerStoreCount.toLocaleString(locale),
        });

  const activeStoreId = session.activeStoreId ?? memberships[0].storeId;

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <p className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("superadmin.workspaceBadge")}
        </p>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">{t("superadmin.stores.storeConfig.pageTitle")}</h1>
        <p className="text-sm text-slate-500">{t("superadmin.stores.storeConfig.pageDescription")}</p>
      </header>

      <StoresManagement
        language={session.language}
        memberships={memberships}
        activeStoreId={activeStoreId}
        activeBranchId={session.activeBranchId}
        isSuperadmin
        canCreateStore={canCreateStore}
        createStoreBlockedReason={createStoreBlockedReason}
        storeQuotaSummary={storeQuotaSummary}
        mode="store-config"
      />

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("superadmin.stores.linksTitle")}</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{t("superadmin.stores.links.center.title")}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{t("superadmin.stores.links.center.description")}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.links.storeSwitcher.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.links.storeSwitcher.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
