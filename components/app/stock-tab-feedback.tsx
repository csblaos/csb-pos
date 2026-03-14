"use client";

import { AlertTriangle, FileSearch, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";

function formatLastUpdatedAt(value: string | null, language: AppLanguage) {
  const t = createTranslator(language);
  if (!value) {
    return t("stock.feedback.neverUpdated");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("stock.feedback.neverUpdated");
  }
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return t("stock.feedback.lastUpdated", {
    time: `${hours}:${minutes}`,
  });
}

export function StockTabToolbar({
  language,
  isRefreshing,
  lastUpdatedAt,
  onRefresh,
  refreshLabel,
}: {
  language: AppLanguage;
  isRefreshing: boolean;
  lastUpdatedAt: string | null;
  onRefresh: () => void;
  refreshLabel?: string;
}) {
  const t = createTranslator(language);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] text-slate-500">{formatLastUpdatedAt(lastUpdatedAt, language)}</p>
      <Button
        type="button"
        variant="outline"
        className="h-8 gap-1.5 px-3 text-xs"
        disabled={isRefreshing}
        onClick={onRefresh}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? t("stock.feedback.refreshing") : refreshLabel ?? t("stock.feedback.refreshTab")}
      </Button>
    </div>
  );
}

export function StockTabLoadingState({
  language,
  message,
}: {
  language: AppLanguage;
  message?: string;
}) {
  const t = createTranslator(language);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="h-3 w-full rounded bg-slate-200" />
        <div className="h-3 w-4/5 rounded bg-slate-200" />
      </div>
      <p className="mt-3 text-xs text-slate-500">{message ?? t("stock.feedback.loadingData")}</p>
    </div>
  );
}

export function StockTabErrorState({
  language,
  message,
  onRetry,
}: {
  language: AppLanguage;
  message: string;
  onRetry: () => void;
}) {
  const t = createTranslator(language);
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
      <p className="mt-2 text-sm text-red-700">{message}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 h-8 border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-100"
        onClick={onRetry}
      >
        {t("stock.feedback.retry")}
      </Button>
    </div>
  );
}

export function StockTabEmptyState({
  language,
  title,
  description,
}: {
  language: AppLanguage;
  title: string;
  description?: string;
}) {
  void language;
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
      <FileSearch className="mx-auto h-10 w-10 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}
