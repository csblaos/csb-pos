import { LayoutGrid, Settings, Store } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const otherStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/settings/stores", label: "ร้าน", icon: Store, permission: "stores.view" },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, permission: "settings.view" },
];
