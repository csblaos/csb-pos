import type { StorefrontLayoutPreset } from "@/lib/storefront/layout/types";
import { cafeLayoutPreset } from "@/lib/storefront/layout/types/cafe";
import { onlineLayoutPreset } from "@/lib/storefront/layout/types/online";
import { otherLayoutPreset } from "@/lib/storefront/layout/types/other";
import { restaurantLayoutPreset } from "@/lib/storefront/layout/types/restaurant";
import { normalizeStoreType, type StoreType } from "@/lib/storefront/types";

const layoutPresetByStoreType: Record<StoreType, StorefrontLayoutPreset> = {
  ONLINE_RETAIL: onlineLayoutPreset,
  RESTAURANT: restaurantLayoutPreset,
  CAFE: cafeLayoutPreset,
  OTHER: otherLayoutPreset,
};

export function getStorefrontLayoutPreset(
  storeType: StoreType | null | undefined,
) {
  const activeStoreType = normalizeStoreType(storeType);
  return layoutPresetByStoreType[activeStoreType];
}

