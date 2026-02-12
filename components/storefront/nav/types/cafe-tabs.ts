import { LayoutGrid, ReceiptText, Settings } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const cafeStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/orders", label: "ออเดอร์คาเฟ่", icon: ReceiptText, permission: "orders.view" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, permission: "settings.view" },
];

