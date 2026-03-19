"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Settings } from "lucide-react";

import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";

const prefetchRoutes = ["/system-admin", "/system-admin/config", "/system-admin/config/clients"];

const isTabActive = (pathname: string, href: string) => {
  if (href === "/system-admin") {
    return pathname === "/system-admin";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

export function SystemAdminBottomNav({ language }: { language: AppLanguage }) {
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const currentPath = optimisticPath ?? pathname;
  const t = useMemo(() => createTranslator(language), [language]);
  const tabs = useMemo(
    () => [
      { href: "/system-admin", label: t("systemAdmin.nav.dashboard"), icon: LayoutGrid },
      { href: "/system-admin/config", label: t("systemAdmin.nav.config"), icon: Settings },
    ],
    [t],
  );

  useEffect(() => {
    prefetchRoutes.forEach((href) => {
      router.prefetch(href);
    });
  }, [router]);

  useEffect(() => {
    setOptimisticPath(null);
  }, [pathname]);

  const navigateToTab = (href: string) => {
    if (isTabActive(pathname, href)) {
      if (pathname !== href) {
        setOptimisticPath(href);
        startTransition(() => {
          router.push(href);
        });
        return;
      }

      startTransition(() => {
        router.refresh();
      });
      return;
    }

    setOptimisticPath(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full -translate-x-1/2 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 min-[1200px]:max-w-[var(--app-shell-max-width-desktop)] min-[1200px]:px-4">
      <div className="border-t bg-white/95 backdrop-blur min-[1200px]:rounded-2xl min-[1200px]:border min-[1200px]:shadow-sm">
        <ul className="mx-auto grid w-full grid-cols-2 gap-1 p-1 min-[1200px]:gap-2 min-[1200px]:p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(currentPath, tab.href);

            return (
              <li key={tab.href}>
                <button
                  type="button"
                  onClick={() => navigateToTab(tab.href)}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] min-[1200px]:min-h-14 min-[1200px]:text-xs ${
                    isActive
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-500"
                  } w-full`}
                >
                  <Icon className="h-4 w-4 min-[1200px]:h-5 min-[1200px]:w-5" />
                  <span>{tab.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
