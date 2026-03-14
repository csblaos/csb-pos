import Link from "next/link";
import { ChevronRight, Gauge, Settings2, ShieldCheck, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { SuperadminPaymentPolicyConfig } from "@/components/app/superadmin-payment-policy-config";
import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { getGlobalBranchPolicy } from "@/lib/branches/policy";
import {
  getGlobalPaymentPolicy,
  getGlobalSessionPolicy,
  getGlobalStoreLogoPolicy,
} from "@/lib/system-config/policy";
import { getSuperadminGlobalConfigOverview } from "@/lib/superadmin/global-config";

export default async function SettingsSuperadminGlobalConfigPage() {
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

  const storeIds = memberships.map((membership) => membership.storeId);

  const [
    globalBranchPolicy,
    globalSessionPolicy,
    globalPaymentPolicy,
    globalStoreLogoPolicy,
    overview,
  ] = await Promise.all([
    getGlobalBranchPolicy(),
    getGlobalSessionPolicy(),
    getGlobalPaymentPolicy(),
    getGlobalStoreLogoPolicy(),
    getSuperadminGlobalConfigOverview(storeIds),
  ]);
  const {
    storeOverrideCount,
    superadminOverrideCount,
    storeOverrideRows,
    superadminOverrideRows,
  } = overview;

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          {t("superadmin.globalConfig.title")}
        </h1>
        <p className="text-sm text-slate-500">{t("superadmin.globalConfig.description")}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.globalConfig.metric.sessionDefault")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {globalSessionPolicy.defaultSessionLimit.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.globalConfig.metric.branchDefault")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {globalBranchPolicy.defaultCanCreateBranches
              ? t("superadmin.globalConfig.branchAllowed")
              : t("superadmin.globalConfig.branchDisallowed")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {globalBranchPolicy.defaultMaxBranchesPerStore === null
              ? t("superadmin.globalConfig.branchUnlimited")
              : t("superadmin.globalConfig.branchMax", {
                  count: globalBranchPolicy.defaultMaxBranchesPerStore.toLocaleString(locale),
                })}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.globalConfig.metric.storeOverrides")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {storeOverrideCount.toLocaleString(locale)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t("superadmin.globalConfig.metric.storeOverridesHint")}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.globalConfig.metric.superadminOverrides")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {superadminOverrideCount.toLocaleString(locale)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t("superadmin.globalConfig.metric.superadminOverridesHint")}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("superadmin.globalConfig.defaults.title")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("superadmin.globalConfig.defaults.description")}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          <li className="px-4 py-3 text-sm text-slate-700">
            {t("superadmin.globalConfig.defaults.sessionLimit")}:{" "}
            <span className="font-medium">
              {t("superadmin.globalConfig.defaults.sessionLimitValue", {
                count: globalSessionPolicy.defaultSessionLimit.toLocaleString(locale),
              })}
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            {t("superadmin.globalConfig.defaults.branchCreation")}:{" "}
            <span className="font-medium">
              {globalBranchPolicy.defaultCanCreateBranches
                ? t("superadmin.globalConfig.defaults.branchCreationAllowed")
                : t("superadmin.globalConfig.defaults.branchCreationDisallowed")}
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            {t("superadmin.globalConfig.defaults.branchQuota")}:{" "}
            <span className="font-medium">
              {globalBranchPolicy.defaultMaxBranchesPerStore === null
                ? t("superadmin.globalConfig.branchUnlimited")
                : t("superadmin.globalConfig.branchMax", {
                    count: globalBranchPolicy.defaultMaxBranchesPerStore.toLocaleString(locale),
                  })}
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            {t("superadmin.globalConfig.defaults.paymentPolicy")}:{" "}
            <span className="font-medium">
              {t("superadmin.globalConfig.defaults.paymentPolicyValue", {
                count: globalPaymentPolicy.maxAccountsPerStore.toLocaleString(locale),
              })}{" "}
              •{" "}
              {globalPaymentPolicy.requireSlipForLaoQr
                ? t("superadmin.globalConfig.defaults.requireQrSlip")
                : t("superadmin.globalConfig.defaults.optionalQrSlip")}
            </span>
          </li>
          <li className="px-4 py-3 text-sm text-slate-700">
            {t("superadmin.globalConfig.defaults.logoUpload")}:{" "}
            <span className="font-medium">
              {t("superadmin.globalConfig.defaults.logoUploadValue", {
                size: globalStoreLogoPolicy.maxSizeMb.toLocaleString(locale),
                autoResize: globalStoreLogoPolicy.autoResize
                  ? t("superadmin.globalConfig.enabled")
                  : t("superadmin.globalConfig.disabled"),
                width: globalStoreLogoPolicy.resizeMaxWidth.toLocaleString(locale),
              })}
            </span>
          </li>
        </ul>
      </article>

      <SuperadminPaymentPolicyConfig initialConfig={globalPaymentPolicy} />

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("superadmin.globalConfig.overrides.title")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("superadmin.globalConfig.overrides.description")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {t("superadmin.globalConfig.overrides.storeTitle")}
            </p>
            {storeOverrideRows.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">{t("superadmin.globalConfig.overrides.storeEmpty")}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {storeOverrideRows.map((store) => (
                  <li key={store.id} className="text-xs text-slate-700">
                    {store.name} •{" "}
                    {t("superadmin.globalConfig.overrides.storeItem", {
                      count: store.maxBranchesOverride?.toLocaleString(locale) ?? "-",
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {t("superadmin.globalConfig.overrides.superadminTitle")}
            </p>
            {superadminOverrideRows.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("superadmin.globalConfig.overrides.superadminEmpty")}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {superadminOverrideRows.map((user) => (
                  <li key={user.userId} className="text-xs text-slate-700">
                    {user.name} •{" "}
                    {t("superadmin.globalConfig.overrides.superadminItem", {
                      branch:
                        user.maxBranchesPerStore === null
                          ? t("superadmin.globalConfig.default")
                          : user.maxBranchesPerStore.toLocaleString(locale),
                      session:
                        user.sessionLimit === null
                          ? t("superadmin.globalConfig.default")
                          : user.sessionLimit.toLocaleString(locale),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.globalConfig.linksTitle")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/quotas"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.globalConfig.links.quotas.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.globalConfig.links.quotas.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/security"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.globalConfig.links.security.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.globalConfig.links.security.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.globalConfig.links.center.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.globalConfig.links.center.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.globalConfig.links.storeSwitcher.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.globalConfig.links.storeSwitcher.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
