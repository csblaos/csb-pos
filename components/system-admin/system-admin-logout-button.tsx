"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authFetch, clearClientAuthToken } from "@/lib/auth/client-token";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import { clearNewOrderDraftState } from "@/lib/orders/new-order-draft";
import { clearPurchaseLocalStorage } from "@/lib/purchases/client-storage";

export function SystemAdminLogoutButton({ language }: { language: AppLanguage }) {
  const router = useRouter();
  const t = useMemo(() => createTranslator(language), [language]);

  const onLogout = async () => {
    try {
      await authFetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      clearClientAuthToken();
      clearPurchaseLocalStorage();
      clearNewOrderDraftState();
    }

    router.replace("/login");
    router.refresh();
  };

  return (
    <Button
      variant="outline"
      className="h-9 w-9 p-0"
      onClick={onLogout}
      aria-label={t("systemAdmin.layout.logout")}
    >
      <Power className="h-4 w-4" />
      <span className="sr-only">{t("systemAdmin.layout.logout")}</span>
    </Button>
  );
}
