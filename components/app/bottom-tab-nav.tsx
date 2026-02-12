"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, LayoutGrid, ReceiptText, Settings, Warehouse } from "lucide-react";

type BottomTabNavProps = {
  permissionKeys: string[];
};

const tabs = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/orders", label: "ออเดอร์", icon: ReceiptText, permission: "orders.view" },
  { href: "/stock", label: "สต็อก", icon: Warehouse, permission: "inventory.view" },
  { href: "/products", label: "สินค้า", icon: Boxes, permission: "products.view" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, permission: "settings.view" },
];

const hasPermission = (permissionKeys: string[], key: string) =>
  permissionKeys.includes("*") || permissionKeys.includes(key);

const isTabActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function BottomTabNav({ permissionKeys }: BottomTabNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const [, startTransition] = useTransition();
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
    <nav className="fixed bottom-0 left-1/2 z-20 w-full -translate-x-1/2 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 lg:max-w-[var(--app-shell-max-width)] lg:px-4">
      <div className="border-t bg-white/95 backdrop-blur lg:rounded-2xl lg:border lg:shadow-sm">
        <ul
          className={`mx-auto grid w-full gap-1 p-1 lg:max-w-4xl lg:gap-2 lg:p-2 ${
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
              <li key={tab.href}>
                <button
                  type="button"
                  onClick={() => navigateToTab(tab.href)}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] lg:min-h-14 lg:text-xs ${
                    isActive
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-500"
                  } w-full`}
                >
                  <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
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
