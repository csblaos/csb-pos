export const storeTypeValues = [
  "ONLINE_RETAIL",
  "RESTAURANT",
  "CAFE",
  "OTHER",
] as const;

export type StoreType = (typeof storeTypeValues)[number];

export const DEFAULT_STORE_TYPE: StoreType = "ONLINE_RETAIL";

export function normalizeStoreType(
  storeType: StoreType | null | undefined,
): StoreType {
  return storeType ?? DEFAULT_STORE_TYPE;
}

