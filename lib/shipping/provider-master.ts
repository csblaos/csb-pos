export type ShippingProviderSeed = {
  code: string;
  displayName: string;
  sortOrder: number;
};

export const DEFAULT_SHIPPING_PROVIDER_SEEDS: ShippingProviderSeed[] = [
  { code: "HOUNGALOUN", displayName: "Houngaloun", sortOrder: 10 },
  { code: "ANOUSITH", displayName: "Anousith", sortOrder: 20 },
  { code: "MIXAY", displayName: "Mixay", sortOrder: 30 },
];
