export const storeCurrencyValues = ["LAK", "THB", "USD"] as const;
export type StoreCurrency = (typeof storeCurrencyValues)[number];

export const storeVatModeValues = ["EXCLUSIVE", "INCLUSIVE"] as const;
export type StoreVatMode = (typeof storeVatModeValues)[number];

const storeCurrencySet = new Set<string>(storeCurrencyValues);

export const defaultStoreCurrency: StoreCurrency = "LAK";
export const defaultStoreVatMode: StoreVatMode = "EXCLUSIVE";

export function isStoreCurrency(value: unknown): value is StoreCurrency {
  return typeof value === "string" && storeCurrencySet.has(value);
}

export function parseStoreCurrency(value: unknown, fallback: StoreCurrency = defaultStoreCurrency) {
  return isStoreCurrency(value) ? value : fallback;
}

export function parseStoreVatMode(value: unknown, fallback: StoreVatMode = defaultStoreVatMode) {
  return value === "INCLUSIVE" || value === "EXCLUSIVE" ? value : fallback;
}

export function parseSupportedCurrencies(
  rawValue: unknown,
  baseCurrency: StoreCurrency,
): StoreCurrency[] {
  const parsed = (() => {
    if (Array.isArray(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      try {
        const fromJson = JSON.parse(rawValue) as unknown;
        return Array.isArray(fromJson) ? fromJson : [];
      } catch {
        return [];
      }
    }

    return [];
  })();

  const dedupe = new Set<StoreCurrency>();
  for (const item of parsed) {
    if (isStoreCurrency(item)) {
      dedupe.add(item);
    }
  }

  if (!dedupe.has(baseCurrency)) {
    dedupe.add(baseCurrency);
  }

  if (dedupe.size === 0) {
    dedupe.add(baseCurrency);
  }

  return storeCurrencyValues.filter((currency) => dedupe.has(currency));
}

export function serializeSupportedCurrencies(currencies: StoreCurrency[]) {
  return JSON.stringify(currencies);
}

export function currencyLabel(currency: StoreCurrency) {
  if (currency === "LAK") {
    return "LAK";
  }

  if (currency === "THB") {
    return "THB";
  }

  return "USD";
}

const CURRENCY_SYMBOLS: Record<StoreCurrency, string> = {
  LAK: "₭",
  THB: "฿",
  USD: "$",
};

export function currencySymbol(currency: StoreCurrency): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export function vatModeLabel(mode: StoreVatMode) {
  return mode === "INCLUSIVE" ? "รวม VAT" : "ไม่รวม VAT";
}
