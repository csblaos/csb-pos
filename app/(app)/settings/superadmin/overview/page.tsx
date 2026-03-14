import Link from "next/link";
import { BarChart3, ChevronRight, PlugZap, Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { getSuperadminOverviewMetrics } from "@/lib/superadmin/overview";

const toNumber = (value: unknown) => Number(value ?? 0);

export default async function SettingsSuperadminOverviewPage() {
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

  const { branchRows, memberRows, todaySales, todayOrders, connectedFbStoreIds, connectedWaStoreIds } =
    await getSuperadminOverviewMetrics(storeIds);

  const branchCountByStore = new Map(branchRows.map((row) => [row.storeId, toNumber(row.count)]));
  const activeMembersByStore = new Map<string, number>();

  for (const row of memberRows) {
    if (row.status !== "ACTIVE") {
      continue;
    }
    activeMembersByStore.set(row.storeId, toNumber(row.count));
  }

  const totalStores = memberships.length;
  const totalBranches = memberships.reduce(
    (sum, membership) => sum + (branchCountByStore.get(membership.storeId) ?? 0),
    0,
  );
  const totalActiveMembers = memberships.reduce(
    (sum, membership) => sum + (activeMembersByStore.get(membership.storeId) ?? 0),
    0,
  );
  const connectedFbStoreCount = new Set(connectedFbStoreIds).size;
  const connectedWaStoreCount = new Set(connectedWaStoreIds).size;

  const topStoresByMembers = [...memberships]
    .map((membership) => ({
      ...membership,
      activeMembers: activeMembersByStore.get(membership.storeId) ?? 0,
      branchCount: branchCountByStore.get(membership.storeId) ?? 0,
    }))
    .sort((a, b) => b.activeMembers - a.activeMembers)
    .slice(0, 5);

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          {t("superadmin.overview.title")}
        </h1>
        <p className="text-sm text-slate-500">{t("superadmin.overview.description")}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.overview.metric.totalStores")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalStores.toLocaleString(locale)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.overview.metric.totalBranches")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalBranches.toLocaleString(locale)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.overview.metric.activeMembers")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalActiveMembers.toLocaleString(locale)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.overview.metric.ordersToday")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{todayOrders.toLocaleString(locale)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.overview.metric.todaySales")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{todaySales.toLocaleString(locale)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.overview.metric.connectedChannels")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {connectedFbStoreCount.toLocaleString(locale)} / {connectedWaStoreCount.toLocaleString(locale)}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("superadmin.overview.topStores.title")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("superadmin.overview.topStores.description")}</p>
        </div>
        {topStoresByMembers.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{t("superadmin.overview.topStores.empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {topStoresByMembers.map((store) => (
              <li key={store.storeId} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Store className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{store.storeName}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t("superadmin.overview.topStores.summary", {
                      members: store.activeMembers.toLocaleString(locale),
                      branches: store.branchCount.toLocaleString(locale),
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.overview.linksTitle")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/integrations"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <PlugZap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.overview.links.integrations.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.overview.links.integrations.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.overview.links.center.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.overview.links.center.description")}
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
                {t("superadmin.overview.links.storeSwitcher.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.overview.links.storeSwitcher.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
