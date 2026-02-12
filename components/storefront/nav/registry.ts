import type { StorefrontNavTab } from "@/components/storefront/nav/types";
import { cafeStorefrontTabs } from "@/components/storefront/nav/types/cafe-tabs";
import { onlineStorefrontTabs } from "@/components/storefront/nav/types/online-tabs";
import { otherStorefrontTabs } from "@/components/storefront/nav/types/other-tabs";
import { restaurantStorefrontTabs } from "@/components/storefront/nav/types/restaurant-tabs";
import { normalizeStoreType, type StoreType } from "@/lib/storefront/types";

const tabsByStoreType: Record<StoreType, StorefrontNavTab[]> = {
  ONLINE_RETAIL: onlineStorefrontTabs,
  RESTAURANT: restaurantStorefrontTabs,
  CAFE: cafeStorefrontTabs,
  OTHER: otherStorefrontTabs,
};

export function getStorefrontTabs(storeType: StoreType | null | undefined) {
  const activeStoreType = normalizeStoreType(storeType);
  return tabsByStoreType[activeStoreType];
}

