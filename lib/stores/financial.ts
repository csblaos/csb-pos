import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import {
  defaultStoreCurrency,
  defaultStoreVatMode,
  parseStoreCurrency,
  parseStoreVatMode,
  parseSupportedCurrencies,
  type StoreCurrency,
  type StoreVatMode,
} from "@/lib/finance/store-financial";

export type StoreFinancialConfig = {
  currency: StoreCurrency;
  supportedCurrencies: StoreCurrency[];
  vatEnabled: boolean;
  vatRate: number;
  vatMode: StoreVatMode;
};

const normalizeVatRate = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10000) {
    return 0;
  }

  return value;
};

export async function getStoreFinancialConfig(storeId: string): Promise<StoreFinancialConfig | null> {
  try {
    const [row] = await db
      .select({
        currency: stores.currency,
        supportedCurrencies: stores.supportedCurrencies,
        vatEnabled: stores.vatEnabled,
        vatRate: stores.vatRate,
        vatMode: stores.vatMode,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!row) {
      return null;
    }

    const baseCurrency = parseStoreCurrency(row.currency, defaultStoreCurrency);

    return {
      currency: baseCurrency,
      supportedCurrencies: parseSupportedCurrencies(row.supportedCurrencies, baseCurrency),
      vatEnabled: Boolean(row.vatEnabled),
      vatRate: normalizeVatRate(row.vatRate),
      vatMode: parseStoreVatMode(row.vatMode, defaultStoreVatMode),
    };
  } catch {
    const [row] = await db
      .select({
        currency: stores.currency,
        vatEnabled: stores.vatEnabled,
        vatRate: stores.vatRate,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!row) {
      return null;
    }

    const baseCurrency = parseStoreCurrency(row.currency, defaultStoreCurrency);

    return {
      currency: baseCurrency,
      supportedCurrencies: [baseCurrency],
      vatEnabled: Boolean(row.vatEnabled),
      vatRate: normalizeVatRate(row.vatRate),
      vatMode: defaultStoreVatMode,
    };
  }
}
