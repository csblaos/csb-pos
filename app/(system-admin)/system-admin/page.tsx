import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSession } from "@/lib/auth/session";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import {
  getSystemAdminDashboardStats,
  type SystemAdminDashboardStats,
} from "@/lib/system-admin/dashboard";
import { listSuperadmins, type SuperadminItem } from "@/lib/system-admin/superadmins";

function DashboardStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border bg-white p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

async function DashboardStatsCards({
  statsPromise,
  language,
  locale,
}: {
  statsPromise: Promise<SystemAdminDashboardStats>;
  language: AppLanguage;
  locale: string;
}) {
  const stats = await statsPromise;
  const t = createTranslator(language);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">{t("systemAdmin.dashboard.metric.totalClients")}</p>
        <p className="mt-1 text-2xl font-semibold">{stats.totalClients.toLocaleString(locale)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">{t("systemAdmin.dashboard.metric.totalStores")}</p>
        <p className="mt-1 text-2xl font-semibold">{stats.totalStores.toLocaleString(locale)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">{t("systemAdmin.dashboard.metric.totalUsers")}</p>
        <p className="mt-1 text-2xl font-semibold">{stats.totalUsers.toLocaleString(locale)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">{t("systemAdmin.dashboard.metric.activeMembers")}</p>
        <p className="mt-1 text-2xl font-semibold">
          {stats.totalActiveMembers.toLocaleString(locale)}
        </p>
      </div>
    </div>
  );
}

function TopClientsSkeleton() {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-lg border p-3">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-52 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

async function TopClientsList({
  superadminsPromise,
  language,
  locale,
}: {
  superadminsPromise: Promise<SuperadminItem[]>;
  language: AppLanguage;
  locale: string;
}) {
  const superadmins = await superadminsPromise;
  const t = createTranslator(language);
  const topClients = [...superadmins]
    .sort((a, b) => b.activeOwnerStoreCount - a.activeOwnerStoreCount)
    .slice(0, 5);

  if (topClients.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("systemAdmin.dashboard.topClientsEmpty")}</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {topClients.map((item) => (
        <li key={item.userId} className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("systemAdmin.dashboard.ownerStoreSummary", {
              count: item.activeOwnerStoreCount.toLocaleString(locale),
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}

function StorePermissionSummarySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-5 w-full animate-pulse rounded bg-slate-200" />
      ))}
    </div>
  );
}

async function StorePermissionSummary({
  statsPromise,
  language,
  locale,
}: {
  statsPromise: Promise<SystemAdminDashboardStats>;
  language: AppLanguage;
  locale: string;
}) {
  const stats = await statsPromise;
  const t = createTranslator(language);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t("systemAdmin.dashboard.permissionSummary.clientsCanCreateStores", {
          count: stats.totalClientsCanCreateStores.toLocaleString(locale),
        })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("systemAdmin.dashboard.permissionSummary.unlimitedClients", {
          count: stats.totalUnlimitedClients.toLocaleString(locale),
        })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("systemAdmin.dashboard.permissionSummary.suspendedMembers", {
          count: stats.totalSuspendedMembers.toLocaleString(locale),
        })}
      </p>
    </div>
  );
}

export default async function SystemAdminDashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const t = createTranslator(session.language);
  const locale = getAppLanguageLocale(session.language);
  const statsPromise = getSystemAdminDashboardStats();
  const superadminsPromise = listSuperadmins();

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("systemAdmin.dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemAdmin.dashboard.description")}</p>
      </header>

      <Suspense fallback={<DashboardStatsCardsSkeleton />}>
        <DashboardStatsCards statsPromise={statsPromise} language={session.language} locale={locale} />
      </Suspense>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <article className="rounded-xl border bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("systemAdmin.dashboard.topClientsTitle")}</h2>
            <Link
              href="/system-admin/config/clients"
              prefetch
              className="text-sm text-blue-700 hover:underline"
            >
              {t("systemAdmin.dashboard.manageClients")}
            </Link>
          </div>

          <Suspense fallback={<TopClientsSkeleton />}>
            <TopClientsList
              superadminsPromise={superadminsPromise}
              language={session.language}
              locale={locale}
            />
          </Suspense>
        </article>

        <article className="space-y-2 rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">{t("systemAdmin.dashboard.permissionSummaryTitle")}</h2>
          <Suspense fallback={<StorePermissionSummarySkeleton />}>
            <StorePermissionSummary
              statsPromise={statsPromise}
              language={session.language}
              locale={locale}
            />
          </Suspense>
          <Link
            href="/system-admin/config"
            prefetch
            className="inline-block text-sm text-blue-700 hover:underline"
          >
            {t("systemAdmin.dashboard.openSystemConfig")}
          </Link>
        </article>
      </div>
    </section>
  );
}
