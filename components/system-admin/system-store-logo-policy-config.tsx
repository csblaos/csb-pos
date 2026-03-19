"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import { translateSystemAdminApiMessage } from "@/lib/system-admin/i18n";

type SystemStoreLogoPolicyConfigProps = {
  language: AppLanguage;
  initialConfig: {
    maxSizeMb: number;
    autoResize: boolean;
    resizeMaxWidth: number;
  };
};

export function SystemStoreLogoPolicyConfig({
  initialConfig,
  language,
}: SystemStoreLogoPolicyConfigProps) {
  const [maxSizeMb, setMaxSizeMb] = useState(String(initialConfig.maxSizeMb));
  const [autoResize, setAutoResize] = useState(initialConfig.autoResize);
  const [resizeMaxWidth, setResizeMaxWidth] = useState(String(initialConfig.resizeMaxWidth));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(language), [language]);

  const save = async () => {
    const parsedMaxSizeMb = Number(maxSizeMb);
    const parsedResizeMaxWidth = Number(resizeMaxWidth);

    if (!Number.isInteger(parsedMaxSizeMb) || parsedMaxSizeMb < 1 || parsedMaxSizeMb > 20) {
      setErrorMessage(t("systemAdmin.storeLogoPolicy.validation.maxSize"));
      setSuccessMessage(null);
      return;
    }

    if (
      !Number.isInteger(parsedResizeMaxWidth) ||
      parsedResizeMaxWidth < 256 ||
      parsedResizeMaxWidth > 4096
    ) {
      setErrorMessage(t("systemAdmin.storeLogoPolicy.validation.resizeWidth"));
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/system-admin/config/store-logo-policy", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxSizeMb: parsedMaxSizeMb,
        autoResize,
        resizeMaxWidth: parsedResizeMaxWidth,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          config?: {
            maxSizeMb: number;
            autoResize: boolean;
            resizeMaxWidth: number;
          };
        }
      | null;

    if (!response.ok) {
      setErrorMessage(
        translateSystemAdminApiMessage({
          message: data?.message,
          t,
          fallbackKey: "systemAdmin.storeLogoPolicy.saveFailed",
          overrides: {
            "ข้อมูลตั้งค่าไม่ถูกต้อง": "systemAdmin.storeLogoPolicy.invalidPayload",
          },
        }),
      );
      setIsSubmitting(false);
      return;
    }

    if (data?.config) {
      setMaxSizeMb(String(data.config.maxSizeMb));
      setAutoResize(data.config.autoResize);
      setResizeMaxWidth(String(data.config.resizeMaxWidth));
    }

    setSuccessMessage(t("systemAdmin.storeLogoPolicy.saveSuccess"));
    setIsSubmitting(false);
  };

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-sm font-semibold">{t("systemAdmin.storeLogoPolicy.title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("systemAdmin.storeLogoPolicy.description")}
      </p>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-store-logo-max-size">
          {t("systemAdmin.storeLogoPolicy.maxSizeLabel")}
        </label>
        <input
          id="global-store-logo-max-size"
          type="number"
          min={1}
          max={20}
          value={maxSizeMb}
          onChange={(event) => setMaxSizeMb(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting}
        />
      </div>

      <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>{t("systemAdmin.storeLogoPolicy.autoResize")}</span>
        <input
          type="checkbox"
          checked={autoResize}
          onChange={(event) => setAutoResize(event.target.checked)}
          disabled={isSubmitting}
        />
      </label>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-store-logo-resize-width">
          {t("systemAdmin.storeLogoPolicy.resizeWidthLabel")}
        </label>
        <input
          id="global-store-logo-resize-width"
          type="number"
          min={256}
          max={4096}
          value={resizeMaxWidth}
          onChange={(event) => setResizeMaxWidth(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting || !autoResize}
        />
      </div>

      <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
        {t("systemAdmin.storeLogoPolicy.hint")}
      </p>

      <Button className="h-10 w-full" onClick={save} disabled={isSubmitting}>
        {isSubmitting ? t("systemAdmin.storeLogoPolicy.saving") : t("systemAdmin.storeLogoPolicy.save")}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </article>
  );
}
