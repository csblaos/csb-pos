"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import { translateSystemAdminApiMessage } from "@/lib/system-admin/i18n";

type SystemSessionPolicyConfigProps = {
  language: AppLanguage;
  initialConfig: {
    defaultSessionLimit: number;
  };
};

export function SystemSessionPolicyConfig({
  initialConfig,
  language,
}: SystemSessionPolicyConfigProps) {
  const [defaultSessionLimit, setDefaultSessionLimit] = useState(
    String(initialConfig.defaultSessionLimit),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(language), [language]);

  const save = async () => {
    const parsed = Number(defaultSessionLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
      setErrorMessage(t("systemAdmin.sessionPolicy.validation.limit"));
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/system-admin/config/session-policy", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        defaultSessionLimit: parsed,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          config?: {
            defaultSessionLimit: number;
          };
        }
      | null;

    if (!response.ok) {
      setErrorMessage(
        translateSystemAdminApiMessage({
          message: data?.message,
          t,
          fallbackKey: "systemAdmin.sessionPolicy.saveFailed",
          overrides: {
            "ข้อมูลตั้งค่าไม่ถูกต้อง": "systemAdmin.sessionPolicy.invalidPayload",
          },
        }),
      );
      setIsSubmitting(false);
      return;
    }

    if (data?.config?.defaultSessionLimit) {
      setDefaultSessionLimit(String(data.config.defaultSessionLimit));
    }

    setSuccessMessage(t("systemAdmin.sessionPolicy.saveSuccess"));
    setIsSubmitting(false);
  };

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-sm font-semibold">{t("systemAdmin.sessionPolicy.title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("systemAdmin.sessionPolicy.description")}
      </p>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-session-limit">
          {t("systemAdmin.sessionPolicy.limitLabel")}
        </label>
        <input
          id="global-session-limit"
          type="number"
          min={1}
          max={10}
          value={defaultSessionLimit}
          onChange={(event) => setDefaultSessionLimit(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting}
        />
      </div>

      <Button className="h-10 w-full" onClick={save} disabled={isSubmitting}>
        {isSubmitting ? t("systemAdmin.sessionPolicy.saving") : t("systemAdmin.sessionPolicy.save")}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </article>
  );
}
