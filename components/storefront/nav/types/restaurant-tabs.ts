import { LayoutGrid, ReceiptText, Settings } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const restaurantStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/orders", label: "คิวอาหาร", icon: ReceiptText, permission: "orders.view" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, permission: "settings.view" },
];

