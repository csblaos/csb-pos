import {
  isPostgresConfigured,
} from "@/lib/db/sequelize";
import {
  getNextVariantSortOrderByModelNameFromPostgres,
  getStoreProductSummaryCountsFromPostgres,
  getStoreProductThresholdsFromPostgres,
  listCategoriesFromPostgres,
  listStoreProductModelNamesFromPostgres,
  listStoreProductsFromPostgres,
  listStoreProductsPageFromPostgres,
  listUnitsFromPostgres,
  listVariantLabelsByModelNameFromPostgres,
} from "@/lib/platform/postgres-products-onboarding";
import {
  parseVariantOptions,
  type ProductVariantOption,
} from "@/lib/products/variant-options";
import { resolveProductImageUrl } from "@/lib/storage/r2";

export type UnitOption = {
  id: string;
  code: string;
  nameTh: string;
  scope: "SYSTEM" | "STORE";
  storeId: string | null;
};

export type ProductConversionView = {
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
  pricePerUnit: number | null;
};

export type ProductCostTrackingSource = "MANUAL" | "PURCHASE_ORDER" | "UNKNOWN";

export type ProductCostTracking = {
  source: ProductCostTrackingSource;
  updatedAt: string | null;
  actorName: string | null;
  reason: string | null;
  reference: string | null;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  modelId: string | null;
  modelName: string | null;
  variantLabel: string | null;
  variantOptionsJson: string | null;
  variantOptions: ProductVariantOption[];
  variantSortOrder: number;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitNameTh: string;
  priceBase: number;
  costBase: number;
  outStockThreshold: number | null;
  lowStockThreshold: number | null;
  stockOnHand: number;
  stockReserved: number;
  stockAvailable: number;
  costTracking: ProductCostTracking;
  active: boolean;
  createdAt: string;
  conversions: ProductConversionView[];
};

export type ProductStatusFilter = "all" | "active" | "inactive";
export type ProductSortOption =
  | "newest"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc";

export type ProductPageResult = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProductSummaryCounts = {
  total: number;
  active: number;
  inactive: number;
};

export type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

const assertProductsPostgresReady = () => {
  if (!isPostgresConfigured()) {
    throw new Error("products PostgreSQL read path ยังไม่พร้อมใช้งาน");
  }
};

const normalizeProduct = (item: ProductListItem): ProductListItem => ({
  ...item,
  variantOptions: parseVariantOptions(item.variantOptionsJson),
  imageUrl: resolveProductImageUrl(item.imageUrl),
  active: Boolean(item.active),
  conversions: [...item.conversions].sort(
    (a, b) => a.multiplierToBase - b.multiplierToBase,
  ),
});

export async function listUnits(storeId: string): Promise<UnitOption[]> {
  assertProductsPostgresReady();
  return (await listUnitsFromPostgres(storeId)) ?? [];
}

export async function listStoreProducts(
  storeId: string,
  search?: string,
): Promise<ProductListItem[]> {
  assertProductsPostgresReady();
  const items = await listStoreProductsFromPostgres(storeId, search);
  return (items ?? []).map(normalizeProduct);
}

export async function listStoreProductsPage({
  storeId,
  search,
  categoryId,
  status = "all",
  sort = "newest",
  page = 1,
  pageSize = 30,
}: {
  storeId: string;
  search?: string;
  categoryId?: string;
  status?: ProductStatusFilter;
  sort?: ProductSortOption;
  page?: number;
  pageSize?: number;
}): Promise<ProductPageResult> {
  assertProductsPostgresReady();
  const result = await listStoreProductsPageFromPostgres({
    storeId,
    search,
    categoryId,
    status,
    sort,
    page,
    pageSize,
  });

  return {
    items: (result?.items ?? []).map(normalizeProduct),
    total: result?.total ?? 0,
    page: result?.page ?? Math.max(1, Math.trunc(page)),
    pageSize: result?.pageSize ?? Math.min(100, Math.max(1, Math.trunc(pageSize))),
  };
}

export async function getStoreProductSummaryCounts(
  storeId: string,
): Promise<ProductSummaryCounts> {
  assertProductsPostgresReady();
  return (
    (await getStoreProductSummaryCountsFromPostgres(storeId)) ?? {
      total: 0,
      active: 0,
      inactive: 0,
    }
  );
}

export async function listStoreProductModelNames({
  storeId,
  search,
  limit = 10,
}: {
  storeId: string;
  search?: string;
  limit?: number;
}): Promise<string[]> {
  assertProductsPostgresReady();
  return (
    (await listStoreProductModelNamesFromPostgres({
      storeId,
      search,
      limit,
    })) ?? []
  );
}

export async function getNextVariantSortOrderByModelName({
  storeId,
  modelName,
}: {
  storeId: string;
  modelName: string;
}): Promise<number> {
  assertProductsPostgresReady();
  return (
    (await getNextVariantSortOrderByModelNameFromPostgres({
      storeId,
      modelName,
    })) ?? 0
  );
}

export async function listVariantLabelsByModelName({
  storeId,
  modelName,
  search,
  limit = 5,
}: {
  storeId: string;
  modelName: string;
  search?: string;
  limit?: number;
}): Promise<string[]> {
  assertProductsPostgresReady();
  return (
    (await listVariantLabelsByModelNameFromPostgres({
      storeId,
      modelName,
      search,
      limit,
    })) ?? []
  );
}

export async function getStoreProductThresholds(
  storeId: string,
): Promise<{ outStockThreshold: number; lowStockThreshold: number }> {
  assertProductsPostgresReady();
  return (
    (await getStoreProductThresholdsFromPostgres(storeId)) ?? {
      outStockThreshold: 0,
      lowStockThreshold: 10,
    }
  );
}

export async function listCategories(storeId: string): Promise<CategoryItem[]> {
  assertProductsPostgresReady();
  return (await listCategoriesFromPostgres(storeId)) ?? [];
}
