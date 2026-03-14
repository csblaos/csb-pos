import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Gauge,
  PlugZap,
  Settings2,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/auth/session-db";
import { queryMany } from "@/lib/db/query";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";

const toNumber = (value: unknown) => Number(value ?? 0);

export default async function SettingsSuperadminStoresPage() {
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
  const [storeRows, branchRows, memberRows, fbErrorRows, waErrorRows] = await Promise.all([
    queryMany<{
      id: string;
      name: string;
      storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
    }>(
      `
        select
          id,
          name,
          store_type as "storeType"
        from stores
        where id in (:storeIds)
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{ storeId: string; count: number | string }>(
      `
        select store_id as "storeId", count(*) as "count"
        from store_branches
        where store_id in (:storeIds)
        group by store_id
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{
      storeId: string;
      status: "ACTIVE" | "INVITED" | "SUSPENDED";
      count: number | string;
    }>(
      `
        select store_id as "storeId", status, count(*) as "count"
        from store_members
        where store_id in (:storeIds)
        group by store_id, status
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{ storeId: string }>(
      `
        select store_id as "storeId"
        from fb_connections
        where store_id in (:storeIds) and status = 'ERROR'
      `,
      { replacements: { storeIds } },
    ),
    queryMany<{ storeId: string }>(
      `
        select store_id as "storeId"
        from wa_connections
        where store_id in (:storeIds) and status = 'ERROR'
      `,
      { replacements: { storeIds } },
    ),
  ]);

  const branchCountByStore = new Map(branchRows.map((row) => [row.storeId, toNumber(row.count)]));
  const memberSummaryByStore = new Map<
    string,
    { active: number; invited: number; suspended: number }
  >();

  for (const row of memberRows) {
    const summary = memberSummaryByStore.get(row.storeId) ?? {
      active: 0,
      invited: 0,
      suspended: 0,
    };
    const count = toNumber(row.count);
    if (row.status === "ACTIVE") {
      summary.active = count;
    } else if (row.status === "INVITED") {
      summary.invited = count;
    } else if (row.status === "SUSPENDED") {
      summary.suspended = count;
    }
    memberSummaryByStore.set(row.storeId, summary);
  }

  const channelErrorStoreIds = new Set([
    ...fbErrorRows.map((row) => row.storeId),
    ...waErrorRows.map((row) => row.storeId),
  ]);

  const governanceRows = storeRows
    .map((store) => {
      const branchCount = branchCountByStore.get(store.id) ?? 0;
      const memberSummary = memberSummaryByStore.get(store.id) ?? {
        active: 0,
        invited: 0,
        suspended: 0,
      };
      const hasChannelError = channelErrorStoreIds.has(store.id);
      const needsAttention =
        branchCount === 0 ||
        memberSummary.active === 0 ||
        memberSummary.suspended > 0 ||
        hasChannelError;
      return {
        ...store,
        branchCount,
        ...memberSummary,
        hasChannelError,
        needsAttention,
      };
    })
    .sort((a, b) => {
      const byAttention = Number(b.needsAttention) - Number(a.needsAttention);
      if (byAttention !== 0) {
        return byAttention;
      }
      return a.name.localeCompare(b.name, "th");
    });

  const totalBranches = governanceRows.reduce((sum, row) => sum + row.branchCount, 0);
  const totalActiveMembers = governanceRows.reduce((sum, row) => sum + row.active, 0);
  const storesNeedAttention = governanceRows.filter((row) => row.needsAttention).length;

  return (
    <section className="space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          {t("superadmin.stores.title")}
        </h1>
        <p className="text-sm text-slate-500">{t("superadmin.stores.description")}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.stores.metric.totalStores")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {governanceRows.length.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.stores.metric.totalBranches")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalBranches.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.stores.metric.activeMembers")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalActiveMembers.toLocaleString(locale)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{t("superadmin.stores.metric.needsAttention")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {storesNeedAttention.toLocaleString(locale)}
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("superadmin.stores.board.title")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("superadmin.stores.board.description")}</p>
        </div>
        {governanceRows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{t("superadmin.stores.board.empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {governanceRows.map((row) => (
              <li key={row.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.storeType} • สาขา {row.branchCount.toLocaleString("th-TH")} • ACTIVE{" "}
                      {row.active.toLocaleString("th-TH")} • INVITED {row.invited.toLocaleString("th-TH")} •
                      SUSPENDED {row.suspended.toLocaleString("th-TH")}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      row.needsAttention
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {row.needsAttention
                      ? t("superadmin.stores.board.attention")
                      : t("superadmin.stores.board.normal")}
                  </span>
                </div>

                {row.needsAttention ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p className="inline-flex items-center gap-1 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("superadmin.stores.board.issues")}
                    </p>
                    <p className="mt-1">
                      {row.branchCount === 0 ? `${t("superadmin.stores.board.issue.noBranches")} • ` : ""}
                      {row.active === 0 ? `${t("superadmin.stores.board.issue.noActiveMembers")} • ` : ""}
                      {row.suspended > 0
                        ? `${t("superadmin.stores.board.issue.suspended", {
                            count: row.suspended.toLocaleString(locale),
                          })} • `
                        : ""}
                      {row.hasChannelError ? t("superadmin.stores.board.issue.channelError") : ""}
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.stores.menuTitle")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/stores/store-config"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Store className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.menu.storeConfig.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.menu.storeConfig.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/stores/branch-config"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.menu.branchConfig.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.menu.branchConfig.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/users"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.menu.users.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.menu.users.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/security"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.menu.security.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.menu.security.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.stores.analyticsTitle")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/superadmin/overview"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.analytics.overview.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.analytics.overview.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/integrations"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <PlugZap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.analytics.integrations.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.analytics.integrations.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/audit-log"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.analytics.audit.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.analytics.audit.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/quotas"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.analytics.quotas.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.analytics.quotas.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/settings/superadmin/global-config"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.analytics.globalConfig.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.analytics.globalConfig.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("superadmin.stores.linksTitle")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link
            href="/settings/stores"
            className="group flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Building2 className="h-4 w-4" />
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

          <Link
            href="/settings"
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {t("superadmin.stores.links.settings.title")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {t("superadmin.stores.links.settings.description")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
