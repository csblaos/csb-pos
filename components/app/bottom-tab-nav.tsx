"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function BottomTabNav({ permissionKeys }: BottomTabNavProps) {
  const pathname = usePathname();
  const visibleTabs = tabs.filter((tab) => hasPermission(permissionKeys, tab.permission));

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 backdrop-blur">
      <ul
        className={`grid gap-1 ${
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
          const isActive =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs ${
                  isActive
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-slate-500"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
