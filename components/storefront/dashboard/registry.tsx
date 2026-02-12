import { CafeStorefrontDashboard } from "@/components/storefront/dashboard/types/cafe-dashboard";
import { OnlineStorefrontDashboard } from "@/components/storefront/dashboard/types/online-dashboard";
import { OtherStorefrontDashboard } from "@/components/storefront/dashboard/types/other-dashboard";
import { RestaurantStorefrontDashboard } from "@/components/storefront/dashboard/types/restaurant-dashboard";
import type { StorefrontDashboardProps } from "@/components/storefront/dashboard/shared";
import { normalizeStoreType, type StoreType } from "@/lib/storefront/types";

type StorefrontDashboardByTypeProps = StorefrontDashboardProps & {
  storeType: StoreType | null | undefined;
};

export function StorefrontDashboardByType({
  storeType,
  ...props
}: StorefrontDashboardByTypeProps) {
  const activeStoreType = normalizeStoreType(storeType);

  if (activeStoreType === "CAFE") {
    return <CafeStorefrontDashboard {...props} />;
  }

  if (activeStoreType === "RESTAURANT") {
    return <RestaurantStorefrontDashboard {...props} />;
  }

  if (activeStoreType === "OTHER") {
    return <OtherStorefrontDashboard {...props} />;
  }

  return <OnlineStorefrontDashboard {...props} />;
}

