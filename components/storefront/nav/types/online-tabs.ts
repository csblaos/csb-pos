import { Boxes, LayoutGrid, ReceiptText, Settings, Warehouse } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const onlineStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/orders", labelKey: "nav.orders", icon: ReceiptText, permission: "orders.view" },
  { href: "/stock", labelKey: "nav.stock", icon: Warehouse, permission: "inventory.view" },
  { href: "/products", labelKey: "nav.products", icon: Boxes, permission: "products.view" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, permission: "settings.view" },
];
