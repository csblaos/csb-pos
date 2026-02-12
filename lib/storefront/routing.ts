import { getPreferredAuthorizedRoute } from "@/lib/rbac/navigation";
import { normalizeStoreType, type StoreType } from "@/lib/storefront/types";

export function getStorefrontEntryRoute(
  storeType: StoreType | null | undefined,
  permissionKeys: string[],
) {
  const activeStoreType = normalizeStoreType(storeType);

  if (activeStoreType === "ONLINE_RETAIL") {
    return getPreferredAuthorizedRoute(permissionKeys) ?? "/dashboard";
  }

  return "/dashboard";
}

