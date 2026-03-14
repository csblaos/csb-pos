import Link from "next/link";
import { redirect } from "next/navigation";

import { getAppShellContext } from "@/lib/app-shell/context";
import { getAppLanguageLocale } from "@/lib/i18n/config";
import { createTranslator, formatNumberByLanguage } from "@/lib/i18n/translate";
import { isPermissionGranted } from "@/lib/rbac/access";
import { getReportsViewData } from "@/server/services/reports.service";

const getChannelLabel = (
  channel: "WALK_IN" | "FACEBOOK" | "WHATSAPP",
  t: ReturnType<typeof createTranslator>,
) =>
  channel === "WALK_IN"
    ? t("reports.channels.walkIn")
    : channel === "FACEBOOK"
      ? t("reports.channels.facebook")
      : t("reports.channels.whatsapp");

function ReportsHeader({
  t,
}: {
  t: ReturnType<typeof createTranslator>;
}) {
  return (
    <header className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Analytics
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">
            {t("reports.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("reports.pageDescription")}</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
        >
          {t("reports.backDashboard")}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {t("reports.range.today")}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {t("reports.range.thisMonth")}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {t("reports.range.systemLifetime")}
        </span>
      </div>
    </header>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "slate" | "emerald" | "sky" | "amber";
}) {
  const toneClassName =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/70"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50/70"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50/80"
          : "border-slate-200 bg-white";

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClassName}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function StatList({
  items,
}: {
  items: { label: string; value: string; tone?: "default" | "danger" | "success" }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-xl border px-3 py-2 ${
            item.tone === "danger"
              ? "border-rose-200 bg-rose-50/70"
              : item.tone === "success"
                ? "border-emerald-200 bg-emerald-50/70"
                : "border-slate-200 bg-slate-50/70"
          }`}
        >
          <p className="text-[11px] text-slate-500">{item.label}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function HorizontalBarList({
  rows,
  valueFormatter,
  emptyLabel,
}: {
  rows: { id: string; label: string; value: number; meta: string }[];
  valueFormatter: (value: number) => string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = `${Math.max((row.value / maxValue) * 100, 6)}%`;
        return (
          <div key={row.id} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{row.label}</p>
                <p className="text-xs text-slate-500">{row.meta}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-950">
                {valueFormatter(row.value)}
              </p>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-slate-900" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SplitBar({
  revenue,
  cogs,
  shippingCost,
  t,
}: {
  revenue: number;
  cogs: number;
  shippingCost: number;
  t: ReturnType<typeof createTranslator>;
}) {
  const total = Math.max(revenue, 1);
  const cogsWidth = Math.min((cogs / total) * 100, 100);
  const shippingWidth = Math.min((shippingCost / total) * 100, 100 - cogsWidth);
  const profitWidth = Math.max(100 - cogsWidth - shippingWidth, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-rose-400" style={{ width: `${cogsWidth}%` }} />
        <div className="bg-amber-400" style={{ width: `${shippingWidth}%` }} />
        <div className="bg-emerald-500" style={{ width: `${profitWidth}%` }} />
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-rose-400" />
          {t("reports.stats.cogs")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-400" />
          {t("reports.stats.shippingCost")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500" />
          {t("reports.stats.grossProfit")}
        </span>
      </div>
    </div>
  );
}

export default async function ReportsPage() {
  const { session, permissionKeys, language } = await getAppShellContext();
  if (!session) {
    redirect("/login");
  }

  if (!session.activeStoreId) {
    redirect("/onboarding");
  }

  const t = createTranslator(language);

  if (!isPermissionGranted(permissionKeys, "reports.view")) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">{t("reports.pageTitle")}</h1>
        <p className="text-sm text-red-600">{t("reports.noPermission")}</p>
      </section>
    );
  }

  const locale = getAppLanguageLocale(language);
  const fmtNumber = (value: number) => formatNumberByLanguage(language, value);
  const fmtSigned = (value: number) =>
    `${value > 0 ? "+" : value < 0 ? "-" : ""}${fmtNumber(Math.abs(value))}`;
  const fmtCurrency = (value: number, currency: string) => `${fmtNumber(value)} ${currency}`;

  const {
    storeCurrency,
    salesSummary,
    topProducts,
    salesByChannel,
    grossProfit,
    codOverview,
    purchaseFx,
    purchaseApAging,
  } = await getReportsViewData({
    storeId: session.activeStoreId,
    topProductsLimit: 10,
    useCache: true,
  });

  const topProductRows = topProducts.slice(0, 6).map((item) => ({
    id: item.productId,
    label: `${item.sku} · ${item.name}`,
    value: item.revenue,
    meta: t("reports.topProducts.meta", {
      qty: fmtNumber(item.qtyBaseSold),
      cogs: fmtCurrency(item.cogs, storeCurrency),
    }),
  }));

  const channelRows = salesByChannel.map((row) => ({
    id: row.channel,
    label: getChannelLabel(row.channel, t),
    value: row.salesTotal,
    meta: t("reports.common.ordersCount", { count: fmtNumber(row.orderCount) }),
  }));

  return (
    <section className="space-y-5">
      <ReportsHeader t={t} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          label={t("reports.summary.todaySales")}
          value={fmtCurrency(salesSummary.salesToday, storeCurrency)}
          hint={t("reports.summary.todaySalesHint")}
          tone="slate"
        />
        <SummaryCard
          label={t("reports.summary.monthSales")}
          value={fmtCurrency(salesSummary.salesThisMonth, storeCurrency)}
          hint={t("reports.summary.monthSalesHint")}
          tone="sky"
        />
        <SummaryCard
          label={t("reports.summary.grossProfit")}
          value={fmtCurrency(grossProfit.grossProfit, storeCurrency)}
          hint={t("reports.summary.grossProfitHint")}
          tone="emerald"
        />
        <SummaryCard
          label={t("reports.summary.codNet")}
          value={fmtCurrency(codOverview.netAmount, storeCurrency)}
          hint={t("reports.summary.codNetHint")}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={t("reports.sections.salesOverview.title")}
          subtitle={t("reports.sections.salesOverview.subtitle")}
        >
          <div className="space-y-4">
            <StatList
              items={[
                {
                  label: t("reports.stats.salesToday"),
                  value: fmtCurrency(salesSummary.salesToday, storeCurrency),
                },
                {
                  label: t("reports.stats.salesThisMonth"),
                  value: fmtCurrency(salesSummary.salesThisMonth, storeCurrency),
                },
              ]}
            />
            <HorizontalBarList
              rows={channelRows}
              valueFormatter={(value) => fmtCurrency(value, storeCurrency)}
              emptyLabel={t("reports.empty.salesByChannel")}
            />
          </div>
        </SectionCard>

        <SectionCard
          title={t("reports.sections.topProducts.title")}
          subtitle={t("reports.sections.topProducts.subtitle")}
        >
          <HorizontalBarList
            rows={topProductRows}
            valueFormatter={(value) => fmtCurrency(value, storeCurrency)}
            emptyLabel={t("reports.empty.topProducts")}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title={t("reports.sections.grossProfit.title")}
          subtitle={t("reports.sections.grossProfit.subtitle")}
        >
          <div className="space-y-4">
            <StatList
              items={[
                {
                  label: t("reports.stats.revenue"),
                  value: fmtCurrency(grossProfit.revenue, storeCurrency),
                },
                {
                  label: t("reports.stats.cogs"),
                  value: fmtCurrency(grossProfit.cogs, storeCurrency),
                },
                {
                  label: t("reports.stats.shippingCost"),
                  value: fmtCurrency(grossProfit.shippingCost, storeCurrency),
                },
                {
                  label: t("reports.stats.grossProfit"),
                  value: fmtCurrency(grossProfit.grossProfit, storeCurrency),
                  tone: grossProfit.grossProfit >= 0 ? "success" : "danger",
                },
              ]}
            />
            <SplitBar
              revenue={grossProfit.revenue}
              cogs={grossProfit.cogs}
              shippingCost={grossProfit.shippingCost}
              t={t}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-700">{t("reports.currentCost.title")}</p>
              <p className="mt-1 text-sm text-slate-600">
                {t("reports.currentCost.cogs", {
                  value: fmtCurrency(grossProfit.currentCostCogs, storeCurrency),
                })}
              </p>
              <p className="text-sm font-semibold text-slate-950">
                {t("reports.currentCost.grossProfit", {
                  value: fmtCurrency(grossProfit.currentCostGrossProfit, storeCurrency),
                })}
              </p>
              <p className="text-xs text-slate-500">
                {t("reports.currentCost.delta", {
                  value: `${fmtSigned(grossProfit.grossProfitDeltaVsCurrentCost)} ${storeCurrency}`,
                })}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t("reports.sections.cod.title")}
          subtitle={t("reports.sections.cod.subtitle")}
        >
          <div className="space-y-4">
            <StatList
              items={[
                {
                  label: t("reports.stats.codPendingCount"),
                  value: t("reports.common.ordersCount", {
                    count: fmtNumber(codOverview.pendingCount),
                  }),
                },
                {
                  label: t("reports.stats.codPendingAmount"),
                  value: fmtCurrency(codOverview.pendingAmount, storeCurrency),
                },
                {
                  label: t("reports.stats.codSettledTodayCount"),
                  value: t("reports.common.ordersCount", {
                    count: fmtNumber(codOverview.settledTodayCount),
                  }),
                },
                {
                  label: t("reports.stats.codSettledTodayAmount"),
                  value: fmtCurrency(codOverview.settledTodayAmount, storeCurrency),
                  tone: "success",
                },
                {
                  label: t("reports.stats.codReturnedTodayCount"),
                  value: t("reports.common.ordersCount", {
                    count: fmtNumber(codOverview.returnedTodayCount),
                  }),
                  tone: codOverview.returnedTodayCount > 0 ? "danger" : "default",
                },
                {
                  label: t("reports.stats.codReturnedShippingLoss"),
                  value: fmtCurrency(codOverview.returnedTodayShippingLoss, storeCurrency),
                  tone: codOverview.returnedTodayShippingLoss > 0 ? "danger" : "default",
                },
              ]}
            />
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
              <p className="text-[11px] text-sky-800">{t("reports.cod.netTitle")}</p>
              <p className="mt-1 text-xl font-semibold text-sky-950">
                {fmtCurrency(codOverview.netAmount, storeCurrency)}
              </p>
              <p className="text-xs text-sky-800/90">
                {t("reports.cod.netDetail", {
                  settled: fmtCurrency(codOverview.settledAllAmount, storeCurrency),
                  returned: fmtCurrency(codOverview.returnedCodFee, storeCurrency),
                })}
              </p>
            </div>
            {codOverview.byProvider.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{t("reports.cod.byProviderTitle")}</p>
                {codOverview.byProvider.slice(0, 5).map((row) => (
                  <div
                    key={row.provider}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-slate-900">{row.provider}</p>
                    <p className="text-xs text-slate-500">
                      {t("reports.cod.providerSummary", {
                        pending: fmtNumber(row.pendingCount),
                        settled: fmtNumber(row.settledCount),
                        returned: fmtNumber(row.returnedCount),
                      })}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700">
                      {t("reports.cod.providerNet", {
                        value: fmtCurrency(row.netAmount, storeCurrency),
                      })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("reports.empty.cod")}</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title={t("reports.sections.fx.title")}
          subtitle={t("reports.sections.fx.subtitle")}
        >
          <div className="space-y-4">
            <StatList
              items={[
                {
                  label: t("reports.stats.fxPendingRateCount"),
                  value: fmtNumber(purchaseFx.pendingRateCount),
                },
                {
                  label: t("reports.stats.fxPendingRateUnpaidCount"),
                  value: fmtNumber(purchaseFx.pendingRateUnpaidCount),
                },
                {
                  label: t("reports.stats.fxLockedCount"),
                  value: fmtNumber(purchaseFx.lockedCount),
                },
                {
                  label: t("reports.stats.fxChangedRateCount"),
                  value: fmtNumber(purchaseFx.changedRateCount),
                },
              ]}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500">{t("reports.fx.totalDeltaTitle")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {fmtSigned(purchaseFx.totalRateDeltaBase)} {storeCurrency}
              </p>
            </div>
            {purchaseFx.recentLocks.length > 0 ? (
              <div className="space-y-2">
                {purchaseFx.recentLocks.slice(0, 5).map((item) => {
                  const deltaRate = item.exchangeRate - item.exchangeRateInitial;
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {item.poNumber}
                        {item.supplierName ? ` · ${item.supplierName}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t("reports.fx.recentLockLine", {
                          currency: item.purchaseCurrency,
                          initial: item.exchangeRateInitial.toLocaleString(locale),
                          next: item.exchangeRate.toLocaleString(locale),
                          delta: fmtSigned(deltaRate),
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("reports.empty.fxLocks")}</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={t("reports.sections.apAging.title")}
          subtitle={t("reports.sections.apAging.subtitle")}
          action={
            <Link
              href="/api/stock/purchase-orders/outstanding/export-csv"
              prefetch={false}
              className="text-xs font-semibold text-blue-700 transition-colors hover:text-blue-900"
            >
              {t("reports.ap.exportCsv")}
            </Link>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500">{t("reports.ap.totalOutstanding")}</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {fmtCurrency(purchaseApAging.totalOutstandingBase, storeCurrency)}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-800">{t("reports.ap.bucket0to30")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {t("reports.common.documentsCount", {
                    count: fmtNumber(purchaseApAging.bucket0To30.count),
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  {fmtCurrency(purchaseApAging.bucket0To30.amountBase, storeCurrency)}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-900">
                  {t("reports.ap.bucket31to60")}
                </p>
                <p className="mt-1 text-sm font-semibold text-amber-950">
                  {t("reports.common.documentsCount", {
                    count: fmtNumber(purchaseApAging.bucket31To60.count),
                  })}
                </p>
                <p className="text-xs text-amber-800/80">
                  {fmtCurrency(purchaseApAging.bucket31To60.amountBase, storeCurrency)}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-medium text-rose-900">
                  {t("reports.ap.bucket61plus")}
                </p>
                <p className="mt-1 text-sm font-semibold text-rose-950">
                  {t("reports.common.documentsCount", {
                    count: fmtNumber(purchaseApAging.bucket61Plus.count),
                  })}
                </p>
                <p className="text-xs text-rose-800/80">
                  {fmtCurrency(purchaseApAging.bucket61Plus.amountBase, storeCurrency)}
                </p>
              </div>
            </div>
            {purchaseApAging.suppliers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{t("reports.ap.topSuppliers")}</p>
                {purchaseApAging.suppliers.slice(0, 5).map((supplier) => (
                  <div
                    key={supplier.supplierName}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="text-sm font-medium text-slate-900">{supplier.supplierName}</p>
                    <p className="text-xs text-slate-500">
                      {t("reports.ap.supplierSummary", {
                        outstanding: fmtCurrency(supplier.outstandingBase, storeCurrency),
                        fx: `${fmtSigned(supplier.fxDeltaBase)} ${storeCurrency}`,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("reports.empty.outstandingPo")}</p>
            )}
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
