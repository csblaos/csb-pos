import { LayoutGrid, ReceiptText, Settings } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const restaurantStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/orders", labelKey: "nav.foodQueue", icon: ReceiptText, permission: "orders.view" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, permission: "settings.view" },
];
