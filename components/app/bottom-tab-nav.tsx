"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getStorefrontTabs } from "@/components/storefront/nav/registry";
import { type StoreType } from "@/lib/storefront/types";

type BottomTabNavProps = {
  permissionKeys: string[];
  storeType?: StoreType | null;
};

const hasPermission = (permissionKeys: string[], key: string) =>
  permissionKeys.includes("*") || permissionKeys.includes(key);

const isTabActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const getCompactLabel = (label: string, href: string) => {
  if (href === "/orders") {
    return "ออเดอร์";
  }

  if (href === "/dashboard") {
    return "หน้าหลัก";
  }

  return label;
};

export function BottomTabNav({ permissionKeys, storeType }: BottomTabNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const tabs = getStorefrontTabs(storeType);
  const visibleTabs = tabs.filter((tab) => hasPermission(permissionKeys, tab.permission));
  const currentPath = optimisticPath ?? pathname;

  useEffect(() => {
    visibleTabs.forEach((tab) => {
      router.prefetch(tab.href);
    });
  }, [router, visibleTabs]);

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

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full -translate-x-1/2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 lg:max-w-[var(--app-shell-max-width)] lg:px-4">
      <div className="mx-auto rounded-2xl border border-slate-200/90 bg-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <ul
          className={`mx-auto grid w-full gap-1.5 p-1.5 lg:max-w-4xl lg:gap-2 lg:p-2 ${
            visibleTabs.length >= 5
              ? "grid-cols-5"
              : visibleTabs.length === 4
              ? "grid-cols-4"
              : visibleTabs.length === 3
                ? "grid-cols-3"
                : visibleTabs.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
          }`}
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(currentPath, tab.href);

            return (
              <li key={tab.href} className="min-w-0">
                <button
                  type="button"
                  onClick={() => navigateToTab(tab.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex min-h-[52px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] transition-all duration-150 ease-out lg:min-h-14 lg:px-3 lg:py-3 lg:text-xs ${
                    isActive
                      ? "text-blue-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 transition-transform duration-150 lg:h-[18px] lg:w-[18px] ${
                      isActive ? "scale-105" : "scale-100"
                    }`}
                  />
                  <span className="max-w-full truncate font-medium leading-none">
                    <span className="sm:hidden">{getCompactLabel(tab.label, tab.href)}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
