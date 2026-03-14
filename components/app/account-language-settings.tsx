"use client";

import { CheckCircle2, Globe2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authFetch, setClientAuthToken } from "@/lib/auth/client-token";
import { appLanguageValues, type AppLanguage } from "@/lib/i18n/types";
import { createTranslator } from "@/lib/i18n/translate";
import { getAppLanguageLabel } from "@/lib/i18n/config";

type AccountLanguageSettingsProps = {
  initialLanguage: AppLanguage;
};

type UpdateLanguageResponse = {
  ok?: boolean;
  message?: string;
  warning?: string | null;
  token?: string;
  user?: {
    preferredLanguage?: string;
  };
};

export function AccountLanguageSettings({
  initialLanguage,
}: AccountLanguageSettingsProps) {
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(initialLanguage);
  const [savedLanguage, setSavedLanguage] = useState<AppLanguage>(initialLanguage);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(savedLanguage), [savedLanguage]);
  const isDirty = selectedLanguage !== savedLanguage;

  const status = isDirty
    ? {
        label: t("settings.language.unsaved"),
        className: "border-amber-200 bg-amber-50 text-amber-700",
      }
    : {
        label: t("settings.language.saved"),
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };

  const saveLanguage = async () => {
    setErrorMessage(null);
    setWarningMessage(null);
    setSuccessMessage(null);

    if (!isDirty) {
      setSuccessMessage(t("settings.language.noChanges"));
      return;
    }

    setIsSaving(true);

    try {
      const response = await authFetch("/api/settings/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_language",
          language: selectedLanguage,
        }),
      });

      const data = (await response.json().catch(() => null)) as UpdateLanguageResponse | null;
      if (!response.ok) {
        setErrorMessage(data?.message ?? t("settings.language.saveFailed"));
        return;
      }

      const nextLanguage = (data?.user?.preferredLanguage ?? selectedLanguage) as AppLanguage;
      setSelectedLanguage(nextLanguage);
      setSavedLanguage(nextLanguage);
      setWarningMessage(data?.warning ?? null);
      setSuccessMessage(t("settings.language.savedMessage"));

      if (data?.token) {
        setClientAuthToken(data.token);
      }

      router.refresh();
    } catch {
      setErrorMessage(t("settings.language.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Globe2 className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{t("settings.language.cardTitle")}</h2>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("settings.language.cardDescription")}</p>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {t("settings.language.current")}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {getAppLanguageLabel(savedLanguage).nativeLabel}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">{t("settings.language.select")}</p>
          <div className="grid gap-2">
            {appLanguageValues.map((languageOption) => {
              const label = getAppLanguageLabel(languageOption);
              const isSelected = selectedLanguage === languageOption;

              return (
                <button
                  key={languageOption}
                  type="button"
                  onClick={() => setSelectedLanguage(languageOption)}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-blue-300 bg-blue-50 text-blue-900"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                  disabled={isSaving}
                >
                  <span>
                    <span className="block text-sm font-medium">{label.nativeLabel}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {label.englishLabel}
                    </span>
                  </span>
                  {isSelected ? <CheckCircle2 className="h-4 w-4 text-blue-600" /> : null}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">{t("settings.language.hint")}</p>
        </div>

        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        {warningMessage ? <p className="text-sm text-amber-700">{warningMessage}</p> : null}
        {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}

        <div className="flex justify-end">
          <Button
            type="button"
            className="h-11 min-w-[180px] rounded-xl"
            disabled={isSaving}
            onClick={saveLanguage}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("settings.language.saving")}
              </>
            ) : (
              t("settings.language.save")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
