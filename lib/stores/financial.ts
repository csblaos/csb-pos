import "server-only";

import {
  type StoreCurrency,
  type StoreVatMode,
} from "@/lib/finance/store-financial";
import { getStoreFinancialConfigFromPostgres } from "@/lib/platform/postgres-store-settings";

export type StoreFinancialConfig = {
  currency: StoreCurrency;
  supportedCurrencies: StoreCurrency[];
  vatEnabled: boolean;
  vatRate: number;
  vatMode: StoreVatMode;
};

export async function getStoreFinancialConfig(storeId: string): Promise<StoreFinancialConfig | null> {
  const financial = await getStoreFinancialConfigFromPostgres(storeId);
  return financial ?? null;
}
