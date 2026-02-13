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

const getGridColumnsClass = (tabCount: number) => {
  if (tabCount >= 5) {
    return "grid-cols-5";
  }

  if (tabCount === 4) {
    return "grid-cols-4";
  }

  if (tabCount === 3) {
    return "grid-cols-3";
  }

  if (tabCount === 2) {
    return "grid-cols-2";
  }

  return "grid-cols-1";
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
    <nav
      aria-label="เมนูหลัก"
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 w-full bg-white lg:left-1/2 lg:right-auto lg:max-w-[var(--app-shell-max-width)] lg:-translate-x-1/2"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="pointer-events-auto mx-auto w-full overflow-hidden border-x-0 border-t border-slate-200 bg-white shadow-[0_-1px_0_rgba(148,163,184,0.28),0_-10px_24px_rgba(15,23,42,0.08)]">
        <ul className={`mx-auto grid w-full gap-1.5 px-1.5 py-1.5 ${getGridColumnsClass(visibleTabs.length)}`}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(currentPath, tab.href);

            return (
              <li key={tab.href} className="min-w-0">
                <button
                  type="button"
                  onClick={() => navigateToTab(tab.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex min-h-[58px] w-full min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-1 ${
                    isActive
                      ? "text-slate-900"
                      : "text-slate-500 hover:bg-slate-50/80 hover:text-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.34)]"
                        : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 transition-transform duration-200 ${
                        isActive ? "scale-105" : "scale-100"
                      }`}
                    />
                  </span>
                  <span
                    className={`max-w-full truncate leading-none ${
                      isActive ? "font-semibold text-slate-900" : "font-medium text-slate-500"
                    }`}
                  >
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
