import { Boxes, LayoutGrid, ReceiptText, Settings, Warehouse } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const onlineStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/orders", label: "ออเดอร์", icon: ReceiptText, permission: "orders.view" },
  { href: "/stock", label: "สต็อก", icon: Warehouse, permission: "inventory.view" },
  { href: "/products", label: "สินค้า", icon: Boxes, permission: "products.view" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, permission: "settings.view" },
];

