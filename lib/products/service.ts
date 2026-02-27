import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import { getInventoryBalancesByStoreForProducts } from "@/lib/inventory/queries";
import {
  auditEvents,
  productCategories,
  productModels,
  productUnits,
  products,
  units,
} from "@/lib/db/schema";
import {
  parseVariantOptions,
  type ProductVariantOption,
} from "@/lib/products/variant-options";

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
export type ProductSortOption = "newest" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

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

type ProductRowWithConversion = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  modelId: string | null;
  modelName: string | null;
  variantLabel: string | null;
  variantOptionsJson: string | null;
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
  active: boolean;
  createdAt: string;
  conversionUnitId: string | null;
  conversionUnitCode: string | null;
  conversionUnitNameTh: string | null;
  multiplierToBase: number | null;
};

export async function listUnits(storeId: string): Promise<UnitOption[]> {
  const rows = await db
    .select({
      id: units.id,
      code: units.code,
      nameTh: units.nameTh,
      scope: units.scope,
      storeId: units.storeId,
    })
    .from(units)
    .where(
      or(
        eq(units.scope, "SYSTEM"),
        and(eq(units.scope, "STORE"), eq(units.storeId, storeId)),
      ),
    )
    .orderBy(sql`case when ${units.scope} = 'STORE' then 0 else 1 end`, asc(units.code));

  return rows;
}

const mapProductRows = (rows: ProductRowWithConversion[]): ProductListItem[] => {
  const productMap = new Map<string, ProductListItem>();

  for (const row of rows) {
    const current = productMap.get(row.id);
    if (!current) {
      productMap.set(row.id, {
        id: row.id,
        sku: row.sku,
        name: row.name,
        barcode: row.barcode,
        modelId: row.modelId,
        modelName: row.modelName,
        variantLabel: row.variantLabel,
        variantOptionsJson: row.variantOptionsJson,
        variantOptions: parseVariantOptions(row.variantOptionsJson),
        variantSortOrder: row.variantSortOrder,
        imageUrl: row.imageUrl,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        baseUnitId: row.baseUnitId,
        baseUnitCode: row.baseUnitCode,
        baseUnitNameTh: row.baseUnitNameTh,
        priceBase: row.priceBase,
        costBase: row.costBase,
        outStockThreshold: row.outStockThreshold ?? null,
        lowStockThreshold: row.lowStockThreshold ?? null,
        stockOnHand: 0,
        stockReserved: 0,
        stockAvailable: 0,
        costTracking: {
          source: "UNKNOWN",
          updatedAt: null,
          actorName: null,
          reason: null,
          reference: null,
        },
        active: Boolean(row.active),
        createdAt: row.createdAt,
        conversions: [],
      });
    }

    if (
      row.conversionUnitId &&
      row.conversionUnitCode &&
      row.conversionUnitNameTh &&
      row.multiplierToBase !== null
    ) {
      const item = productMap.get(row.id);
      if (item) {
        item.conversions.push({
          unitId: row.conversionUnitId,
          unitCode: row.conversionUnitCode,
          unitNameTh: row.conversionUnitNameTh,
          multiplierToBase: row.multiplierToBase,
        });
      }
    }
  }

  const productsList = [...productMap.values()];
  productsList.forEach((item) => {
    item.conversions.sort((a, b) => a.multiplierToBase - b.multiplierToBase);
  });

  return productsList;
};

const parseAuditMetadata = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const getMetadataText = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

async function getLatestCostTrackingByProductIds(
  storeId: string,
  productIds: string[],
): Promise<Map<string, ProductCostTracking>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      entityId: auditEvents.entityId,
      action: auditEvents.action,
      actorName: auditEvents.actorName,
      metadata: auditEvents.metadata,
      occurredAt: auditEvents.occurredAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.storeId, storeId),
        eq(auditEvents.entityType, "product"),
        inArray(auditEvents.entityId, productIds),
        inArray(auditEvents.action, [
          "product.cost.manual_update",
          "product.cost.auto_from_po",
        ]),
      ),
    )
    .orderBy(desc(auditEvents.occurredAt));

  const trackingByProductId = new Map<string, ProductCostTracking>();
  for (const row of rows) {
    if (!row.entityId || trackingByProductId.has(row.entityId)) continue;
    const metadata = parseAuditMetadata(row.metadata);
    const source: ProductCostTrackingSource =
      row.action === "product.cost.manual_update"
        ? "MANUAL"
        : row.action === "product.cost.auto_from_po"
          ? "PURCHASE_ORDER"
          : "UNKNOWN";

    trackingByProductId.set(row.entityId, {
      source,
      updatedAt: row.occurredAt ?? null,
      actorName: row.actorName ?? null,
      reason:
        source === "MANUAL"
          ? getMetadataText(metadata, "reason")
          : getMetadataText(metadata, "note"),
      reference:
        source === "PURCHASE_ORDER"
          ? getMetadataText(metadata, "poNumber")
          : null,
    });
  }

  return trackingByProductId;
}

const buildProductsWhere = ({
  storeId,
  search,
  categoryId,
  status,
}: {
  storeId: string;
  search?: string;
  categoryId?: string;
  status?: ProductStatusFilter;
}) => {
  let whereClause = eq(products.storeId, storeId);
  const keyword = search?.trim();
  const normalizedCategoryId = categoryId?.trim();

  if (keyword) {
    whereClause = and(
      whereClause,
      or(
        like(products.name, `%${keyword}%`),
        like(products.sku, `%${keyword}%`),
        like(products.barcode, `%${keyword}%`),
        like(products.variantLabel, `%${keyword}%`),
      ),
    )!;
  }

  if (normalizedCategoryId) {
    whereClause = and(whereClause, eq(products.categoryId, normalizedCategoryId))!;
  }

  if (status === "active") {
    whereClause = and(whereClause, eq(products.active, true))!;
  } else if (status === "inactive") {
    whereClause = and(whereClause, eq(products.active, false))!;
  }

  return whereClause;
};

async function listStoreProductsByIds(
  storeId: string,
  productIds: string[],
): Promise<ProductListItem[]> {
  if (productIds.length === 0) return [];

  const baseUnits = alias(units, "base_units");
  const conversionUnits = alias(units, "conversion_units");

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      barcode: products.barcode,
      modelId: products.modelId,
      modelName: productModels.name,
      variantLabel: products.variantLabel,
      variantOptionsJson: products.variantOptionsJson,
      variantSortOrder: products.variantSortOrder,
      imageUrl: products.imageUrl,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      baseUnitId: products.baseUnitId,
      baseUnitCode: baseUnits.code,
      baseUnitNameTh: baseUnits.nameTh,
      priceBase: products.priceBase,
      costBase: products.costBase,
      outStockThreshold: products.outStockThreshold,
      lowStockThreshold: products.lowStockThreshold,
      active: products.active,
      createdAt: products.createdAt,
      conversionUnitId: conversionUnits.id,
      conversionUnitCode: conversionUnits.code,
      conversionUnitNameTh: conversionUnits.nameTh,
      multiplierToBase: productUnits.multiplierToBase,
    })
    .from(products)
    .innerJoin(baseUnits, eq(products.baseUnitId, baseUnits.id))
    .leftJoin(productModels, eq(products.modelId, productModels.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productUnits, eq(productUnits.productId, products.id))
    .leftJoin(conversionUnits, eq(productUnits.unitId, conversionUnits.id))
    .where(and(eq(products.storeId, storeId), inArray(products.id, productIds)));
  const [balances, costTrackingByProductId] = await Promise.all([
    getInventoryBalancesByStoreForProducts(storeId, productIds),
    getLatestCostTrackingByProductIds(storeId, productIds),
  ]);

  const items = mapProductRows(rows);
  const balanceByProductId = new Map(balances.map((balance) => [balance.productId, balance]));

  return items.map((item) => {
    const balance = balanceByProductId.get(item.id);
    return {
      ...item,
      stockOnHand: balance?.onHand ?? 0,
      stockReserved: balance?.reserved ?? 0,
      stockAvailable: balance?.available ?? 0,
      costTracking: costTrackingByProductId.get(item.id) ?? item.costTracking,
    };
  });
}

export async function listStoreProducts(
  storeId: string,
  search?: string,
): Promise<ProductListItem[]> {
  const whereClause = buildProductsWhere({ storeId, search });
  const idRows = await db
    .select({ id: products.id })
    .from(products)
    .where(whereClause)
    .orderBy(desc(products.createdAt), asc(products.name));

  const orderedIds = idRows.map((row) => row.id);
  const items = await listStoreProductsByIds(storeId, orderedIds);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return orderedIds.flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });
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
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const whereClause = buildProductsWhere({
    storeId,
    search,
    categoryId,
    status,
  });

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(products)
    .where(whereClause);
  const total = Number(countRow?.total ?? 0);

  const idRows =
    sort === "name-asc"
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(whereClause)
          .orderBy(asc(products.name), desc(products.createdAt))
          .limit(safePageSize)
          .offset(offset)
      : sort === "name-desc"
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(whereClause)
          .orderBy(desc(products.name), desc(products.createdAt))
          .limit(safePageSize)
          .offset(offset)
      : sort === "price-asc"
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(whereClause)
          .orderBy(asc(products.priceBase), asc(products.name))
          .limit(safePageSize)
          .offset(offset)
      : sort === "price-desc"
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(whereClause)
          .orderBy(desc(products.priceBase), asc(products.name))
          .limit(safePageSize)
          .offset(offset)
      : await db
          .select({ id: products.id })
          .from(products)
          .where(whereClause)
          .orderBy(desc(products.createdAt), asc(products.name))
          .limit(safePageSize)
          .offset(offset);
  const orderedIds = idRows.map((row) => row.id);
  const items = await listStoreProductsByIds(storeId, orderedIds);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return {
    items: orderedIds.flatMap((id) => {
      const item = itemById.get(id);
      return item ? [item] : [];
    }),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function getStoreProductSummaryCounts(
  storeId: string,
): Promise<ProductSummaryCounts> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(case when ${products.active} = 1 then 1 else 0 end)`,
    })
    .from(products)
    .where(eq(products.storeId, storeId));

  const total = Number(row?.total ?? 0);
  const active = Number(row?.active ?? 0);

  return {
    total,
    active,
    inactive: Math.max(total - active, 0),
  };
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
  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit)));
  const keyword = search?.trim();

  const whereClause = keyword
    ? and(eq(productModels.storeId, storeId), like(productModels.name, `%${keyword}%`))
    : eq(productModels.storeId, storeId);

  const rows = await db
    .select({
      name: productModels.name,
      usageCount: sql<number>`count(${products.id})`,
    })
    .from(productModels)
    .leftJoin(
      products,
      and(eq(products.modelId, productModels.id), eq(products.storeId, storeId)),
    )
    .where(whereClause)
    .groupBy(productModels.id, productModels.name)
    .orderBy(sql`count(${products.id}) desc`, asc(productModels.name))
    .limit(safeLimit);

  return rows
    .map((row) => row.name.trim())
    .filter((name) => name.length > 0);
}

export async function getNextVariantSortOrderByModelName({
  storeId,
  modelName,
}: {
  storeId: string;
  modelName: string;
}): Promise<number> {
  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) return 0;

  const [row] = await db
    .select({
      maxSortOrder: sql<number | null>`max(${products.variantSortOrder})`,
    })
    .from(productModels)
    .leftJoin(
      products,
      and(eq(products.modelId, productModels.id), eq(products.storeId, storeId)),
    )
    .where(
      and(
        eq(productModels.storeId, storeId),
        eq(productModels.name, normalizedModelName),
      ),
    );

  const maxSortOrder = Number(row?.maxSortOrder ?? -1);
  if (!Number.isFinite(maxSortOrder)) return 0;

  return Math.max(0, maxSortOrder + 1);
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
  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) return [];

  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit)));
  const keyword = search?.trim();

  let whereClause = and(
    eq(productModels.storeId, storeId),
    eq(productModels.name, normalizedModelName),
    sql`${products.variantLabel} is not null`,
    sql`length(trim(${products.variantLabel})) > 0`,
  );

  if (keyword) {
    whereClause = and(whereClause, like(products.variantLabel, `%${keyword}%`));
  }

  const rows = await db
    .select({
      variantLabel: products.variantLabel,
      usageCount: sql<number>`count(${products.id})`,
    })
    .from(productModels)
    .innerJoin(
      products,
      and(eq(products.modelId, productModels.id), eq(products.storeId, storeId)),
    )
    .where(whereClause)
    .groupBy(products.variantLabel)
    .orderBy(sql`count(${products.id}) desc`, asc(products.variantLabel))
    .limit(safeLimit);

  return rows
    .map((row) => row.variantLabel?.trim() ?? "")
    .filter((name) => name.length > 0);
}

/* ── Categories ── */

export type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

export async function listCategories(storeId: string): Promise<CategoryItem[]> {
  const rows = await db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      sortOrder: productCategories.sortOrder,
      productCount: sql<number>`count(${products.id})`,
    })
    .from(productCategories)
    .leftJoin(
      products,
      and(
        eq(products.categoryId, productCategories.id),
        eq(products.storeId, storeId),
      ),
    )
    .where(eq(productCategories.storeId, storeId))
    .groupBy(
      productCategories.id,
      productCategories.name,
      productCategories.sortOrder,
    )
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));

  return rows;
}
