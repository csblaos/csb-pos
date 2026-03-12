import "server-only";

import {
  parseVariantOptions,
  type ProductVariantOption,
} from "@/lib/products/variant-options";
import { resolveProductImageUrl } from "@/lib/storage/r2";

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;

type PostgresProductsOnboardingContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
};

type UnitOption = {
  id: string;
  code: string;
  nameTh: string;
  scope: "SYSTEM" | "STORE";
  storeId: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

type ProductStatusFilter = "all" | "active" | "inactive";
type ProductSortOption = "newest" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

type ProductCostTrackingSource = "MANUAL" | "PURCHASE_ORDER" | "UNKNOWN";

type ProductCostTracking = {
  source: ProductCostTrackingSource;
  updatedAt: string | null;
  actorName: string | null;
  reason: string | null;
  reference: string | null;
};

type ProductConversionView = {
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
  pricePerUnit: number | null;
};

type ProductListItem = {
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

type ProductPageResult = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

type ProductSummaryCounts = {
  total: number;
  active: number;
  inactive: number;
};

type StoreProductThresholds = {
  outStockThreshold: number;
  lowStockThreshold: number;
};

type ChannelStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";
type ChannelState = {
  facebook: ChannelStatus;
  whatsapp: ChannelStatus;
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
  variantSortOrder: number | string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitNameTh: string;
  priceBase: number | string | null;
  costBase: number | string | null;
  outStockThreshold: number | string | null;
  lowStockThreshold: number | string | null;
  active: boolean | null;
  createdAt: string;
  conversionUnitId: string | null;
  conversionUnitCode: string | null;
  conversionUnitNameTh: string | null;
  multiplierToBase: number | string | null;
  conversionPricePerUnit: number | string | null;
};

type InventoryBalanceRow = {
  productId: string;
  onHand: number | string | null;
  reserved: number | string | null;
};

type CostTrackingRow = {
  entityId: string;
  action: string;
  actorName: string | null;
  metadata: unknown;
  occurredAt: string | null;
};

const getPostgresProductsOnboardingContext =
  async (): Promise<PostgresProductsOnboardingContext | null> => {
    const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
      import("@/lib/db/query"),
      import("@/lib/db/sequelize"),
    ]);

    if (!isPostgresConfigured()) {
      return null;
    }

    return {
      queryMany,
      queryOne,
    };
  };

export const logProductsOnboardingReadFallback = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[products-onboarding.read.pg] fallback to turso for ${operation}: ${message}`);
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseAuditMetadata = (raw: unknown): Record<string, unknown> | null => {
  if (!raw) return null;

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw !== "string") {
    return null;
  }

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

const appendArrayReplacements = (
  replacements: Record<string, unknown>,
  prefix: string,
  values: string[],
) => {
  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`;
    replacements[key] = value;
    return `:${key}`;
  });

  return placeholders.length > 0 ? placeholders.join(", ") : "null";
};

const buildProductsWhereSql = ({
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
  const replacements: Record<string, unknown> = {
    storeId,
  };
  const conditions = [`p.store_id = :storeId`];
  const keyword = search?.trim();
  const normalizedCategoryId = categoryId?.trim();

  if (keyword) {
    replacements.keyword = `%${keyword}%`;
    conditions.push(`
      (
        lower(p.name) like lower(:keyword)
        or lower(p.sku) like lower(:keyword)
        or lower(coalesce(p.barcode, '')) like lower(:keyword)
        or lower(coalesce(p.variant_label, '')) like lower(:keyword)
      )
    `);
  }

  if (normalizedCategoryId) {
    replacements.categoryId = normalizedCategoryId;
    conditions.push(`p.category_id = :categoryId`);
  }

  if (status === "active") {
    conditions.push(`p.active = true`);
  } else if (status === "inactive") {
    conditions.push(`p.active = false`);
  }

  return {
    whereSql: conditions.join(" and "),
    replacements,
  };
};

const getProductPageOrderBySql = (sort: ProductSortOption) => {
  switch (sort) {
    case "name-asc":
      return `p.name asc, p.created_at desc`;
    case "name-desc":
      return `p.name desc, p.created_at desc`;
    case "price-asc":
      return `p.price_base asc, p.name asc`;
    case "price-desc":
      return `p.price_base desc, p.name asc`;
    case "newest":
    default:
      return `p.created_at desc, p.name asc`;
  }
};

const mapProductRows = (rows: ProductRowWithConversion[]): ProductListItem[] => {
  const productMap = new Map<string, ProductListItem>();

  for (const row of rows) {
    if (!productMap.has(row.id)) {
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
        variantSortOrder: Number(row.variantSortOrder ?? 0),
        imageUrl: resolveProductImageUrl(row.imageUrl),
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        baseUnitId: row.baseUnitId,
        baseUnitCode: row.baseUnitCode,
        baseUnitNameTh: row.baseUnitNameTh,
        priceBase: Number(row.priceBase ?? 0),
        costBase: Number(row.costBase ?? 0),
        outStockThreshold: toNumber(row.outStockThreshold),
        lowStockThreshold: toNumber(row.lowStockThreshold),
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
        active: row.active === true,
        createdAt: row.createdAt,
        conversions: [],
      });
    }

    if (
      row.conversionUnitId &&
      row.conversionUnitCode &&
      row.conversionUnitNameTh &&
      toNumber(row.multiplierToBase) !== null
    ) {
      productMap.get(row.id)?.conversions.push({
        unitId: row.conversionUnitId,
        unitCode: row.conversionUnitCode,
        unitNameTh: row.conversionUnitNameTh,
        multiplierToBase: Number(row.multiplierToBase ?? 0),
        pricePerUnit: toNumber(row.conversionPricePerUnit),
      });
    }
  }

  const items = [...productMap.values()];
  items.forEach((item) => {
    item.conversions.sort((a, b) => a.multiplierToBase - b.multiplierToBase);
  });

  return items;
};

const getLatestCostTrackingByProductIdsFromPostgres = async (
  pg: PostgresProductsOnboardingContext,
  storeId: string,
  productIds: string[],
) => {
  if (productIds.length === 0) {
    return new Map<string, ProductCostTracking>();
  }

  const replacements: Record<string, unknown> = { storeId };
  const productIdPlaceholders = appendArrayReplacements(replacements, "productId", productIds);

  const rows = await pg.queryMany<CostTrackingRow>(
    `
      select distinct on (entity_id)
        entity_id as "entityId",
        action,
        actor_name as "actorName",
        metadata,
        occurred_at as "occurredAt"
      from audit_events
      where
        store_id = :storeId
        and entity_type = 'product'
        and entity_id in (${productIdPlaceholders})
        and action in ('product.cost.manual_update', 'product.cost.auto_from_po')
      order by entity_id asc, occurred_at desc
    `,
    {
      replacements,
    },
  );

  const trackingByProductId = new Map<string, ProductCostTracking>();
  for (const row of rows) {
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
};

const getInventoryBalancesByProductIdsFromPostgres = async (
  pg: PostgresProductsOnboardingContext,
  storeId: string,
  productIds: string[],
) => {
  if (productIds.length === 0) {
    return [];
  }

  const replacements: Record<string, unknown> = { storeId };
  const productIdPlaceholders = appendArrayReplacements(replacements, "productId", productIds);

  const rows = await pg.queryMany<InventoryBalanceRow>(
    `
      select
        product_id as "productId",
        coalesce(sum(case
          when type = 'IN' then qty_base
          when type = 'RETURN' then qty_base
          when type = 'OUT' then -qty_base
          when type = 'ADJUST' then qty_base
          else 0
        end), 0) as "onHand",
        coalesce(sum(case
          when type = 'RESERVE' then qty_base
          when type = 'RELEASE' then -qty_base
          else 0
        end), 0) as "reserved"
      from inventory_movements
      where
        store_id = :storeId
        and product_id in (${productIdPlaceholders})
      group by product_id
    `,
    {
      replacements,
    },
  );

  return rows.map((row) => {
    const onHand = Number(row.onHand ?? 0);
    const reserved = Number(row.reserved ?? 0);
    return {
      productId: row.productId,
      onHand,
      reserved,
      available: onHand - reserved,
    };
  });
};

const listStoreProductsByIdsFromPostgres = async (
  pg: PostgresProductsOnboardingContext,
  storeId: string,
  productIds: string[],
) => {
  if (productIds.length === 0) {
    return [];
  }

  const replacements: Record<string, unknown> = { storeId };
  const productIdPlaceholders = appendArrayReplacements(replacements, "productId", productIds);

  const [rows, balances, costTrackingByProductId] = await Promise.all([
    pg.queryMany<ProductRowWithConversion>(
      `
        select
          p.id,
          p.sku,
          p.name,
          p.barcode,
          p.model_id as "modelId",
          pm.name as "modelName",
          p.variant_label as "variantLabel",
          p.variant_options_json as "variantOptionsJson",
          p.variant_sort_order as "variantSortOrder",
          p.image_url as "imageUrl",
          p.category_id as "categoryId",
          pc.name as "categoryName",
          p.base_unit_id as "baseUnitId",
          bu.code as "baseUnitCode",
          bu.name_th as "baseUnitNameTh",
          p.price_base as "priceBase",
          p.cost_base as "costBase",
          p.out_stock_threshold as "outStockThreshold",
          p.low_stock_threshold as "lowStockThreshold",
          p.active,
          p.created_at as "createdAt",
          cu.id as "conversionUnitId",
          cu.code as "conversionUnitCode",
          cu.name_th as "conversionUnitNameTh",
          pu.multiplier_to_base as "multiplierToBase",
          pu.price_per_unit as "conversionPricePerUnit"
        from products p
        inner join units bu on bu.id = p.base_unit_id
        left join product_models pm on pm.id = p.model_id
        left join product_categories pc on pc.id = p.category_id
        left join product_units pu on pu.product_id = p.id
        left join units cu on cu.id = pu.unit_id
        where
          p.store_id = :storeId
          and p.id in (${productIdPlaceholders})
      `,
      {
        replacements,
      },
    ),
    getInventoryBalancesByProductIdsFromPostgres(pg, storeId, productIds),
    getLatestCostTrackingByProductIdsFromPostgres(pg, storeId, productIds),
  ]);

  const items = mapProductRows(rows);
  const balanceByProductId = new Map(balances.map((row) => [row.productId, row]));

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
};

export async function getStoreProductByIdDirectFromPostgres(
  storeId: string,
  productId: string,
): Promise<ProductListItem | null> {
  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    return null;
  }

  const pg: PostgresProductsOnboardingContext = { queryMany, queryOne };
  const items = await listStoreProductsByIdsFromPostgres(pg, storeId, [productId]);
  return items[0] ?? null;
}

export async function listUnitsFromPostgres(storeId: string): Promise<UnitOption[] | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  return pg.queryMany<UnitOption>(
    `
      select
        id,
        code,
        name_th as "nameTh",
        scope,
        store_id as "storeId"
      from units
      where
        scope = 'SYSTEM'
        or (scope = 'STORE' and store_id = :storeId)
      order by case when scope = 'STORE' then 0 else 1 end, code asc
    `,
    {
      replacements: { storeId },
    },
  );
}

export async function listCategoriesFromPostgres(
  storeId: string,
): Promise<CategoryItem[] | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const rows = await pg.queryMany<{
    id: string;
    name: string;
    sortOrder: number | string | null;
    productCount: number | string | null;
  }>(
    `
      select
        pc.id,
        pc.name,
        pc.sort_order as "sortOrder",
        count(p.id) as "productCount"
      from product_categories pc
      left join products p
        on p.category_id = pc.id
        and p.store_id = :storeId
      where pc.store_id = :storeId
      group by pc.id, pc.name, pc.sort_order
      order by pc.sort_order asc, pc.name asc
    `,
    {
      replacements: { storeId },
    },
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sortOrder ?? 0),
    productCount: Number(row.productCount ?? 0),
  }));
}

export async function getStoreProductSummaryCountsFromPostgres(
  storeId: string,
): Promise<ProductSummaryCounts | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<{
    total: number | string | null;
    active: number | string | null;
  }>(
    `
      select
        count(*) as total,
        coalesce(sum(case when active = true then 1 else 0 end), 0) as active
      from products
      where store_id = :storeId
    `,
    {
      replacements: { storeId },
    },
  );

  const total = Number(row?.total ?? 0);
  const active = Number(row?.active ?? 0);

  return {
    total,
    active,
    inactive: Math.max(total - active, 0),
  };
}

export async function getStoreProductThresholdsFromPostgres(
  storeId: string,
): Promise<StoreProductThresholds | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<{
    outStockThreshold: number | string | null;
    lowStockThreshold: number | string | null;
  }>(
    `
      select
        out_stock_threshold as "outStockThreshold",
        low_stock_threshold as "lowStockThreshold"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  return {
    outStockThreshold: Number(row?.outStockThreshold ?? 0),
    lowStockThreshold: Number(row?.lowStockThreshold ?? 10),
  };
}

export async function listStoreProductsPageFromPostgres({
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
}): Promise<ProductPageResult | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  const offset = (safePage - 1) * safePageSize;
  const { whereSql, replacements } = buildProductsWhereSql({
    storeId,
    search,
    categoryId,
    status,
  });
  const orderBySql = getProductPageOrderBySql(sort);

  const countRow = await pg.queryOne<{ total: number | string | null }>(
    `
      select count(*) as total
      from products p
      where ${whereSql}
    `,
    {
      replacements,
    },
  );

  const idRows = await pg.queryMany<{ id: string }>(
    `
      select p.id
      from products p
      where ${whereSql}
      order by ${orderBySql}
      limit :limit
      offset :offset
    `,
    {
      replacements: {
        ...replacements,
        limit: safePageSize,
        offset,
      },
    },
  );

  const orderedIds = idRows.map((row) => row.id);
  const items = await listStoreProductsByIdsFromPostgres(pg, storeId, orderedIds);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return {
    items: orderedIds.flatMap((id) => {
      const item = itemById.get(id);
      return item ? [item] : [];
    }),
    total: Number(countRow?.total ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function listStoreProductsFromPostgres(
  storeId: string,
  search?: string,
): Promise<ProductListItem[] | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const { whereSql, replacements } = buildProductsWhereSql({
    storeId,
    search,
  });

  const idRows = await pg.queryMany<{ id: string }>(
    `
      select p.id
      from products p
      where ${whereSql}
      order by p.created_at desc, p.name asc
    `,
    {
      replacements,
    },
  );

  const orderedIds = idRows.map((row) => row.id);
  const items = await listStoreProductsByIdsFromPostgres(pg, storeId, orderedIds);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return orderedIds.flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });
}

export async function listStoreProductModelNamesFromPostgres({
  storeId,
  search,
  limit = 10,
}: {
  storeId: string;
  search?: string;
  limit?: number;
}): Promise<string[] | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit)));
  const keyword = search?.trim();
  const replacements: Record<string, unknown> = { storeId, limit: safeLimit };
  const searchSql = keyword
    ? `and lower(pm.name) like lower(:keyword)`
    : "";

  if (keyword) {
    replacements.keyword = `%${keyword}%`;
  }

  const rows = await pg.queryMany<{ name: string }>(
    `
      select
        pm.name
      from product_models pm
      left join products p
        on p.model_id = pm.id
        and p.store_id = :storeId
      where
        pm.store_id = :storeId
        ${searchSql}
      group by pm.id, pm.name
      order by count(p.id) desc, pm.name asc
      limit :limit
    `,
    {
      replacements,
    },
  );

  return rows
    .map((row) => row.name.trim())
    .filter((name) => name.length > 0);
}

export async function getNextVariantSortOrderByModelNameFromPostgres({
  storeId,
  modelName,
}: {
  storeId: string;
  modelName: string;
}): Promise<number | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) {
    return 0;
  }

  const row = await pg.queryOne<{ maxSortOrder: number | string | null }>(
    `
      select
        max(p.variant_sort_order) as "maxSortOrder"
      from product_models pm
      left join products p
        on p.model_id = pm.id
        and p.store_id = :storeId
      where
        pm.store_id = :storeId
        and pm.name = :modelName
    `,
    {
      replacements: {
        storeId,
        modelName: normalizedModelName,
      },
    },
  );

  const maxSortOrder = Number(row?.maxSortOrder ?? -1);
  if (!Number.isFinite(maxSortOrder)) {
    return 0;
  }

  return Math.max(0, maxSortOrder + 1);
}

export async function listVariantLabelsByModelNameFromPostgres({
  storeId,
  modelName,
  search,
  limit = 5,
}: {
  storeId: string;
  modelName: string;
  search?: string;
  limit?: number;
}): Promise<string[] | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) {
    return [];
  }

  const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit)));
  const keyword = search?.trim();
  const replacements: Record<string, unknown> = {
    storeId,
    modelName: normalizedModelName,
    limit: safeLimit,
  };
  const searchSql = keyword
    ? `and lower(p.variant_label) like lower(:keyword)`
    : "";

  if (keyword) {
    replacements.keyword = `%${keyword}%`;
  }

  const rows = await pg.queryMany<{ variantLabel: string | null }>(
    `
      select
        p.variant_label as "variantLabel"
      from product_models pm
      inner join products p
        on p.model_id = pm.id
        and p.store_id = :storeId
      where
        pm.store_id = :storeId
        and pm.name = :modelName
        and p.variant_label is not null
        and length(trim(p.variant_label)) > 0
        ${searchSql}
      group by p.variant_label
      order by count(p.id) desc, p.variant_label asc
      limit :limit
    `,
    {
      replacements,
    },
  );

  return rows
    .map((row) => row.variantLabel?.trim() ?? "")
    .filter((name) => name.length > 0);
}

export async function getOnboardingStoreTypeFromPostgres(
  storeId: string,
): Promise<string | null | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<{ storeType: string | null }>(
    `
      select store_type as "storeType"
      from stores
      where id = :storeId
      limit 1
    `,
    {
      replacements: { storeId },
    },
  );

  return row?.storeType ?? null;
}

export async function getOnboardingChannelStatusFromPostgres(
  storeId: string,
): Promise<ChannelState | undefined> {
  const pg = await getPostgresProductsOnboardingContext();
  if (!pg) {
    return undefined;
  }

  const row = await pg.queryOne<{
    facebook: ChannelStatus | null;
    whatsapp: ChannelStatus | null;
  }>(
    `
      select
        coalesce(
          (select status from fb_connections where store_id = :storeId limit 1),
          'DISCONNECTED'
        ) as facebook,
        coalesce(
          (select status from wa_connections where store_id = :storeId limit 1),
          'DISCONNECTED'
        ) as whatsapp
    `,
    {
      replacements: { storeId },
    },
  );

  return {
    facebook: row?.facebook ?? "DISCONNECTED",
    whatsapp: row?.whatsapp ?? "DISCONNECTED",
  };
}
