import { LayoutGrid, Settings, Store } from "lucide-react";

import type { StorefrontNavTab } from "@/components/storefront/nav/types";

export const otherStorefrontTabs: StorefrontNavTab[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutGrid, permission: "dashboard.view" },
  { href: "/settings/stores", labelKey: "nav.store", icon: Store, permission: "stores.view" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, permission: "settings.view" },
];
