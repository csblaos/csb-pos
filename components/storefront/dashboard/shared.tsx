import Link from "next/link";

import type { AppSession } from "@/lib/auth/session-types";
import { currencySymbol, type StoreCurrency } from "@/lib/finance/store-financial";
import { getAppLanguageLocale, resolveAppLanguage } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import type { DashboardViewData } from "@/server/services/dashboard.service";

export type StorefrontDashboardProps = {
  session: AppSession;
  dashboardDataPromise: Promise<DashboardViewData>;
  canViewOrders: boolean;
  canViewInventory: boolean;
  canViewReports: boolean;
};

export type DashboardTheme = {
  shellClassName: string;
  shellTextClassName: string;
  shellSubtleTextClassName: string;
  shellBadgeClassName: string;
  reportButtonClassName: string;
  quickActionPrimaryClassName: string;
  quickActionSecondaryClassName: string;
  metricCardClassName: string;
  metricLabelClassName: string;
  metricValueClassName: string;
};

export const defaultDashboardTheme: DashboardTheme = {
  shellClassName: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
  shellTextClassName: "text-slate-900",
  shellSubtleTextClassName: "text-slate-500",
  shellBadgeClassName: "border border-slate-200 bg-slate-50 text-slate-700",
  reportButtonClassName:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900",
  quickActionPrimaryClassName:
    "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
  quickActionSecondaryClassName:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  metricCardClassName: "border border-slate-200 bg-white shadow-sm",
  metricLabelClassName: "text-slate-500",
  metricValueClassName: "text-slate-950",
};

export function DashboardHeroCompact({
  session,
  theme = defaultDashboardTheme,
}: {
  session: AppSession;
  theme?: DashboardTheme;
}) {
  const language = resolveAppLanguage(session.language);
  const t = createTranslator(language);
  return (
    <div className={theme.shellClassName}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`text-xs font-medium uppercase tracking-[0.18em] ${theme.shellSubtleTextClassName}`}>
            {t("dashboard.heroEyebrow")}
          </p>
          <h1 className={`mt-1 text-xl font-semibold ${theme.shellTextClassName}`}>
            {session.displayName}
          </h1>
          <p className={`mt-1 text-sm ${theme.shellSubtleTextClassName}`}>
            {t("dashboard.heroDescription")}
          </p>
        </div>
        <div
          className={`inline-flex h-fit items-center rounded-full px-3 py-1.5 text-xs font-medium ${theme.shellBadgeClassName}`}
        >
          {session.activeRoleName ?? "—"}
        </div>
      </div>
    </div>
  );
}

export function DashboardMetricsHeader({
  canViewReports,
  language,
  theme = defaultDashboardTheme,
}: {
  canViewReports: boolean;
  language: AppSession["language"];
  theme?: DashboardTheme;
}) {
  const t = createTranslator(language);
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className={`text-sm font-semibold ${theme.shellTextClassName}`}>{t("dashboard.summaryTitle")}</h2>
        <p className={`text-xs ${theme.shellSubtleTextClassName}`}>
          {t("dashboard.summaryDescription")}
        </p>
      </div>
      {canViewReports ? (
        <Link
          href="/reports"
          className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${theme.reportButtonClassName}`}
        >
          {t("dashboard.viewReports")}
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardCardsSkeleton({
  language = "th",
  theme = defaultDashboardTheme,
}: {
  language?: AppSession["language"];
  theme?: DashboardTheme;
}) {
  const t = createTranslator(language);
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        t("dashboard.metric.todaySales"),
        t("dashboard.metric.ordersToday"),
        t("dashboard.metric.pendingPayment"),
        t("dashboard.metric.lowStock"),
      ].map((label) => (
        <div key={label} className={`rounded-2xl p-4 ${theme.metricCardClassName}`}>
          <p className={`text-xs ${theme.metricLabelClassName}`}>{label}</p>
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export async function DashboardMetricCards({
  dashboardDataPromise,
  language,
  theme = defaultDashboardTheme,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
  language: AppSession["language"];
  theme?: DashboardTheme;
}) {
  const t = createTranslator(language);
  const locale = getAppLanguageLocale(resolveAppLanguage(language));
  const dashboardData = await dashboardDataPromise;
  const metrics = [
    {
      label: t("dashboard.metric.todaySales"),
      value: dashboardData.metrics.todaySales.toLocaleString(locale),
      suffix: "LAK",
    },
    {
      label: t("dashboard.metric.ordersToday"),
      value: dashboardData.metrics.ordersCountToday.toLocaleString(locale),
      suffix: t("dashboard.unit.items"),
    },
    {
      label: t("dashboard.metric.pendingPayment"),
      value: dashboardData.metrics.pendingPaymentCount.toLocaleString(locale),
      suffix: t("dashboard.unit.items"),
    },
    {
      label: t("dashboard.metric.lowStock"),
      value: dashboardData.metrics.lowStockCount.toLocaleString(locale),
      suffix: t("dashboard.unit.items"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className={`rounded-2xl p-4 ${theme.metricCardClassName}`}>
          <p className={`text-xs ${theme.metricLabelClassName}`}>{metric.label}</p>
          <p className={`mt-1 text-2xl font-semibold leading-tight ${theme.metricValueClassName}`}>
            {metric.value}
          </p>
          <p className={`mt-1 text-[11px] ${theme.metricLabelClassName}`}>{metric.suffix}</p>
        </div>
      ))}
    </div>
  );
}

export async function CodReconcileReminder({
  dashboardDataPromise,
  language,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
  language: AppSession["language"];
}) {
  const t = createTranslator(language);
  const locale = getAppLanguageLocale(resolveAppLanguage(language));
  const dashboardData = await dashboardDataPromise;
  const pendingCount = dashboardData.metrics.pendingCodReconcileCount;

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-950">{t("dashboard.cod.title")}</p>
          <p className="text-xs text-sky-800/90">
            {t("dashboard.cod.description")}
          </p>
        </div>
        <Link
          href="/orders/cod-reconcile"
          className="text-xs font-semibold text-sky-900 transition-colors hover:text-sky-700"
        >
          {t("dashboard.cod.cta")}
        </Link>
      </div>
      <div className="mt-3 rounded-xl border border-sky-200/80 bg-white/80 px-3 py-2">
        <p className="text-[11px] text-sky-800/80">{t("dashboard.cod.currentPending")}</p>
        <p className="text-2xl font-semibold text-sky-950">
          {pendingCount.toLocaleString(locale)}
        </p>
        <p className="text-[11px] text-sky-800/90">{t("dashboard.unit.items")}</p>
      </div>
      {pendingCount === 0 ? (
        <p className="mt-2 text-sm text-sky-800/90">{t("dashboard.cod.empty")}</p>
      ) : null}
    </div>
  );
}

export function LowStockSkeleton({ language = "th" }: { language?: AppSession["language"] }) {
  const t = createTranslator(language);
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium">{t("dashboard.lowStock.titleWithThreshold")}</p>
      <div className="mt-2 space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

export async function LowStock({
  dashboardDataPromise,
  language,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
  language: AppSession["language"];
}) {
  const t = createTranslator(language);
  const locale = getAppLanguageLocale(resolveAppLanguage(language));
  const dashboardData = await dashboardDataPromise;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("dashboard.lowStock.title")}</p>
          <p className="text-xs text-slate-500">{t("dashboard.lowStock.description")}</p>
        </div>
        <Link
          href="/stock"
          className="text-xs font-semibold text-slate-700 transition-colors hover:text-slate-900"
        >
          {t("dashboard.lowStock.cta")}
        </Link>
      </div>
      {dashboardData.lowStockItems.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.lowStock.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {dashboardData.lowStockItems.slice(0, 5).map((item) => (
            <li
              key={item.productId}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {item.sku} · {item.name}
                  </p>
                  <p className="text-xs text-slate-500">{item.baseUnitCode}</p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="font-semibold text-rose-700">
                    {item.available.toLocaleString(locale)}
                  </p>
                  <p className="text-[11px] text-slate-500">{t("dashboard.lowStock.remaining")}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtPrice(amount: number, currency: StoreCurrency, language: AppSession["language"]) {
  return `${currencySymbol(currency)}${amount.toLocaleString(
    getAppLanguageLocale(resolveAppLanguage(language)),
  )}`;
}

function formatDate(dateValue: string | null, language: AppSession["language"]): string {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString(getAppLanguageLocale(resolveAppLanguage(language)), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PurchaseApReminderSkeleton({
  language = "th",
}: {
  language?: AppSession["language"];
}) {
  const t = createTranslator(language);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800">{t("dashboard.ap.title")}</p>
      <div className="mt-2 space-y-2">
        <div className="h-4 w-56 animate-pulse rounded bg-amber-200/70" />
        <div className="h-4 w-48 animate-pulse rounded bg-amber-200/70" />
        <div className="h-4 w-full animate-pulse rounded bg-amber-200/70" />
      </div>
    </div>
  );
}

export async function PurchaseApReminder({
  dashboardDataPromise,
  language,
}: {
  dashboardDataPromise: Promise<DashboardViewData>;
  language: AppSession["language"];
}) {
  const t = createTranslator(language);
  const locale = getAppLanguageLocale(resolveAppLanguage(language));
  const dashboardData = await dashboardDataPromise;
  const reminder = dashboardData.purchaseApReminder;
  const hasReminder =
    reminder.summary.overdueCount > 0 || reminder.summary.dueSoonCount > 0;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-900">{t("dashboard.ap.title")}</p>
          <p className="text-xs text-amber-800/90">{t("dashboard.ap.description")}</p>
        </div>
        <Link
          href="/stock?tab=purchase"
          className="text-xs font-semibold text-amber-900 transition-colors hover:text-amber-700"
        >
          {t("dashboard.ap.cta")}
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2">
          <p className="text-[11px] text-amber-800/80">{t("dashboard.ap.overdue")}</p>
          <p className="text-lg font-semibold text-amber-950">
            {reminder.summary.overdueCount.toLocaleString(locale)}
          </p>
          <p className="text-[11px] text-amber-800/90">
            {fmtPrice(reminder.summary.overdueOutstandingBase, reminder.storeCurrency, language)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2">
          <p className="text-[11px] text-amber-800/80">{t("dashboard.ap.dueSoon")}</p>
          <p className="text-lg font-semibold text-amber-950">
            {reminder.summary.dueSoonCount.toLocaleString(locale)}
          </p>
          <p className="text-[11px] text-amber-800/90">
            {fmtPrice(reminder.summary.dueSoonOutstandingBase, reminder.storeCurrency, language)}
          </p>
        </div>
      </div>

      {!hasReminder ? (
        <p className="mt-2 text-sm text-amber-800/90">{t("dashboard.ap.empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-xs text-amber-950">
          {reminder.summary.items.map((item) => (
            <li key={item.poId} className="rounded-lg border border-amber-200 bg-white px-2.5 py-2">
              <p className="font-medium">
                {item.poNumber} · {item.supplierName}
              </p>
              <p className="text-amber-800/90">
                {item.dueStatus === "OVERDUE"
                  ? t("dashboard.ap.overdueDays", { days: Math.abs(item.daysUntilDue) })
                  : t("dashboard.ap.dueInDays", { days: item.daysUntilDue })}
                {" · "}
                {t("dashboard.ap.dueLabel")}
                {" "}
                {formatDate(item.dueDate, language)}
                {" · "}
                {t("dashboard.ap.outstandingLabel")}
                {" "}
                {fmtPrice(item.outstandingBase, reminder.storeCurrency, language)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
