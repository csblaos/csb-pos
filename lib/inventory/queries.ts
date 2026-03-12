export type InventoryBalance = {
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
};

export type StockUnitOption = {
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
};

export type StockProductOption = {
  productId: string;
  sku: string;
  name: string;
  active: boolean;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitNameTh: string;
  onHand: number;
  reserved: number;
  available: number;
  outStockThreshold: number | null;
  lowStockThreshold: number | null;
  unitOptions: StockUnitOption[];
};

export type InventoryMovementView = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  type: "IN" | "OUT" | "RESERVE" | "RELEASE" | "ADJUST" | "RETURN";
  qtyBase: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type InventoryMovementFilters = {
  type?: InventoryMovementView["type"];
  productId?: string;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type InventoryMovementPage = {
  movements: InventoryMovementView[];
  total: number;
};

export type LowStockItem = {
  productId: string;
  sku: string;
  name: string;
  available: number;
  baseUnitCode: string;
};

export type StoreStockThresholds = {
  outStockThreshold: number;
  lowStockThreshold: number;
};

export type OrderStockState = {
  hasStockOutFromOrder: boolean;
  hasActiveReserve: boolean;
};

type PostgresInventoryReadContext = {
  queryMany: <T>(
    sql: string,
    options?: {
      replacements?: Record<string, unknown> | unknown[];
    },
  ) => Promise<T[]>;
  queryOne: <T>(
    sql: string,
    options?: {
      replacements?: Record<string, unknown> | unknown[];
    },
  ) => Promise<T | null>;
};

const getPostgresInventoryReadContext = async (): Promise<PostgresInventoryReadContext> => {
  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL inventory read path is not configured");
  }

  return {
    queryMany,
    queryOne,
  };
};

const mapInventoryBalanceRows = (
  rows: Array<{
    productId: string;
    onHand: number | string | null;
    reserved: number | string | null;
  }>,
): InventoryBalance[] =>
  rows.map((row) => {
    const onHand = Number(row.onHand ?? 0);
    const reserved = Number(row.reserved ?? 0);
    return {
      productId: row.productId,
      onHand,
      reserved,
      available: onHand - reserved,
    };
  });

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export async function getStoreStockThresholds(
  storeId: string,
): Promise<StoreStockThresholds> {
  const pg = await getPostgresInventoryReadContext();
  const store = await pg.queryOne<{
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
    outStockThreshold: Number(store?.outStockThreshold ?? 0),
    lowStockThreshold: Number(store?.lowStockThreshold ?? 10),
  };
}

export async function getInventoryBalancesByStore(storeId: string) {
  const pg = await getPostgresInventoryReadContext();
  const rows = await pg.queryMany<{
    productId: string;
    onHand: number | string | null;
    reserved: number | string | null;
  }>(
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
      where store_id = :storeId
      group by product_id
    `,
    {
      replacements: { storeId },
    },
  );

  return mapInventoryBalanceRows(rows);
}

export async function getInventoryBalancesByStoreForProducts(
  storeId: string,
  productIds: string[],
) {
  const rows = await getInventoryBalancesByStore(storeId);
  const productIdSet = new Set(productIds);
  return rows.filter((row) => productIdSet.has(row.productId));
}

export async function getInventoryBalanceForProduct(storeId: string, productId: string) {
  const rows = await getInventoryBalancesByStore(storeId);
  return rows.find((row) => row.productId === productId) ?? {
    productId,
    onHand: 0,
    reserved: 0,
    available: 0,
  };
}

export async function getOrderStockStateForOrder(
  storeId: string,
  orderId: string,
): Promise<OrderStockState> {
  const pg = await getPostgresInventoryReadContext();
  const row = await pg.queryOne<{
    reserveCount: number | string | null;
    releaseCount: number | string | null;
    outCount: number | string | null;
  }>(
    `
      select
        coalesce(sum(case when type = 'RESERVE' then 1 else 0 end), 0) as "reserveCount",
        coalesce(sum(case when type = 'RELEASE' then 1 else 0 end), 0) as "releaseCount",
        coalesce(sum(case when type = 'OUT' then 1 else 0 end), 0) as "outCount"
      from inventory_movements
      where store_id = :storeId
        and ref_type = 'ORDER'
        and ref_id = :orderId
    `,
    {
      replacements: {
        storeId,
        orderId,
      },
    },
  );

  const reserveCount = Number(row?.reserveCount ?? 0);
  const releaseCount = Number(row?.releaseCount ?? 0);
  const outCount = Number(row?.outCount ?? 0);

  return {
    hasStockOutFromOrder: outCount > 0,
    hasActiveReserve: reserveCount > releaseCount,
  };
}

export async function getStockProductsForStore(
  storeId: string,
): Promise<StockProductOption[]> {
  const pg = await getPostgresInventoryReadContext();

  const [productRows, conversionRows, balances] = await Promise.all([
    pg.queryMany<{
      productId: string;
      sku: string;
      name: string;
      active: boolean;
      baseUnitId: string;
      baseUnitCode: string;
      baseUnitNameTh: string;
      outStockThreshold: number | string | null;
      lowStockThreshold: number | string | null;
    }>(
      `
        select
          p.id as "productId",
          p.sku,
          p.name,
          p.active,
          p.base_unit_id as "baseUnitId",
          bu.code as "baseUnitCode",
          bu.name_th as "baseUnitNameTh",
          p.out_stock_threshold as "outStockThreshold",
          p.low_stock_threshold as "lowStockThreshold"
        from products p
        inner join units bu on p.base_unit_id = bu.id
        where p.store_id = :storeId
        order by p.name asc
      `,
      { replacements: { storeId } },
    ),
    pg.queryMany<{
      productId: string;
      unitId: string;
      unitCode: string;
      unitNameTh: string;
      multiplierToBase: number;
    }>(
      `
        select
          pu.product_id as "productId",
          u.id as "unitId",
          u.code as "unitCode",
          u.name_th as "unitNameTh",
          pu.multiplier_to_base as "multiplierToBase"
        from product_units pu
        inner join products p on pu.product_id = p.id
        inner join units u on pu.unit_id = u.id
        where p.store_id = :storeId
      `,
      { replacements: { storeId } },
    ),
    getInventoryBalancesByStore(storeId),
  ]);

  const balanceMap = new Map(balances.map((row) => [row.productId, row]));
  const conversionMap = new Map<string, StockUnitOption[]>();

  for (const row of conversionRows) {
    const current = conversionMap.get(row.productId) ?? [];
    current.push({
      unitId: row.unitId,
      unitCode: row.unitCode,
      unitNameTh: row.unitNameTh,
      multiplierToBase: row.multiplierToBase,
    });
    conversionMap.set(row.productId, current);
  }

  return productRows.map((product) => {
    const balance = balanceMap.get(product.productId);
    const conversionOptions = conversionMap.get(product.productId) ?? [];

    const unitOptionMap = new Map<string, StockUnitOption>();
    unitOptionMap.set(product.baseUnitId, {
      unitId: product.baseUnitId,
      unitCode: product.baseUnitCode,
      unitNameTh: product.baseUnitNameTh,
      multiplierToBase: 1,
    });

    for (const option of conversionOptions) {
      if (!unitOptionMap.has(option.unitId)) {
        unitOptionMap.set(option.unitId, option);
      }
    }

    const unitOptions = [...unitOptionMap.values()].sort(
      (a, b) => a.multiplierToBase - b.multiplierToBase,
    );

    return {
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      active: Boolean(product.active),
      baseUnitId: product.baseUnitId,
      baseUnitCode: product.baseUnitCode,
      baseUnitNameTh: product.baseUnitNameTh,
      onHand: balance?.onHand ?? 0,
      reserved: balance?.reserved ?? 0,
      available: balance?.available ?? 0,
      outStockThreshold: toNullableNumber(product.outStockThreshold),
      lowStockThreshold: toNullableNumber(product.lowStockThreshold),
      unitOptions,
    };
  });
}

export async function getStockProductsForStorePage(
  storeId: string,
  limit: number,
  offset: number,
  categoryId?: string | null,
): Promise<StockProductOption[]> {
  const pg = await getPostgresInventoryReadContext();
  const productRows = await pg.queryMany<{
    productId: string;
    sku: string;
    name: string;
    active: boolean;
    baseUnitId: string;
    baseUnitCode: string;
    baseUnitNameTh: string;
    outStockThreshold: number | string | null;
    lowStockThreshold: number | string | null;
  }>(
    `
      select
        p.id as "productId",
        p.sku,
        p.name,
        p.active,
        p.base_unit_id as "baseUnitId",
        bu.code as "baseUnitCode",
        bu.name_th as "baseUnitNameTh",
        p.out_stock_threshold as "outStockThreshold",
        p.low_stock_threshold as "lowStockThreshold"
      from products p
      inner join units bu on p.base_unit_id = bu.id
      where
        p.store_id = :storeId
        and (:categoryId is null or p.category_id = :categoryId)
      order by p.name asc
      limit :limit
      offset :offset
    `,
    {
      replacements: {
        storeId,
        categoryId: categoryId ?? null,
        limit,
        offset,
      },
    },
  );

  const productIds = productRows.map((row) => row.productId);
  if (productIds.length === 0) return [];

  const [conversionRows, balances] = await Promise.all([
    pg.queryMany<{
      productId: string;
      unitId: string;
      unitCode: string;
      unitNameTh: string;
      multiplierToBase: number;
    }>(
      `
        select
          pu.product_id as "productId",
          u.id as "unitId",
          u.code as "unitCode",
          u.name_th as "unitNameTh",
          pu.multiplier_to_base as "multiplierToBase"
        from product_units pu
        inner join units u on pu.unit_id = u.id
        where pu.product_id in (:productIds)
      `,
      { replacements: { productIds } },
    ),
    getInventoryBalancesByStoreForProducts(storeId, productIds),
  ]);

  const balanceMap = new Map(balances.map((row) => [row.productId, row]));
  const conversionMap = new Map<string, StockUnitOption[]>();

  for (const row of conversionRows) {
    const current = conversionMap.get(row.productId) ?? [];
    current.push({
      unitId: row.unitId,
      unitCode: row.unitCode,
      unitNameTh: row.unitNameTh,
      multiplierToBase: row.multiplierToBase,
    });
    conversionMap.set(row.productId, current);
  }

  return productRows.map((product) => {
    const balance = balanceMap.get(product.productId);
    const conversionOptions = conversionMap.get(product.productId) ?? [];

    const unitOptionMap = new Map<string, StockUnitOption>();
    unitOptionMap.set(product.baseUnitId, {
      unitId: product.baseUnitId,
      unitCode: product.baseUnitCode,
      unitNameTh: product.baseUnitNameTh,
      multiplierToBase: 1,
    });

    for (const option of conversionOptions) {
      if (!unitOptionMap.has(option.unitId)) {
        unitOptionMap.set(option.unitId, option);
      }
    }

    const unitOptions = [...unitOptionMap.values()].sort(
      (a, b) => a.multiplierToBase - b.multiplierToBase,
    );

    return {
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      active: Boolean(product.active),
      baseUnitId: product.baseUnitId,
      baseUnitCode: product.baseUnitCode,
      baseUnitNameTh: product.baseUnitNameTh,
      onHand: balance?.onHand ?? 0,
      reserved: balance?.reserved ?? 0,
      available: balance?.available ?? 0,
      outStockThreshold: toNullableNumber(product.outStockThreshold),
      lowStockThreshold: toNullableNumber(product.lowStockThreshold),
      unitOptions,
    };
  });
}

export async function getRecentInventoryMovements(
  storeId: string,
  limit = 20,
): Promise<InventoryMovementView[]> {
  const pg = await getPostgresInventoryReadContext();
  const rows = await pg.queryMany<InventoryMovementView>(
    `
      select
        im.id,
        p.id as "productId",
        p.sku as "productSku",
        p.name as "productName",
        im.type,
        im.qty_base as "qtyBase",
        im.note,
        im.created_at as "createdAt",
        u.name as "createdByName"
      from inventory_movements im
      inner join products p on im.product_id = p.id
      left join users u on im.created_by = u.id
      where im.store_id = :storeId
      order by im.created_at desc
      limit :limit
    `,
    {
      replacements: {
        storeId,
        limit,
      },
    },
  );

  return rows;
}

export async function getInventoryMovementsPage(
  storeId: string,
  params: {
    page: number;
    pageSize: number;
    filters?: InventoryMovementFilters;
  },
): Promise<InventoryMovementPage> {
  const pg = await getPostgresInventoryReadContext();
  const toDayStartIso = (dateOnly: string) => `${dateOnly}T00:00:00.000Z`;
  const toNextDayStartIso = (dateOnly: string) => {
    const [year, month, day] = dateOnly.split("-").map((part) => Number.parseInt(part, 10));
    if (!year || !month || !day) {
      return toDayStartIso(dateOnly);
    }
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const yyyy = String(nextDay.getUTCFullYear());
    const mm = String(nextDay.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(nextDay.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
  };

  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(params.pageSize)));
  const offset = (page - 1) * pageSize;
  const filters = params.filters;
  const query = filters?.query?.trim() ?? null;
  const [rows, totalRow] = await Promise.all([
    pg.queryMany<InventoryMovementView>(
      `
        select
          im.id,
          p.id as "productId",
          p.sku as "productSku",
          p.name as "productName",
          im.type,
          im.qty_base as "qtyBase",
          im.note,
          im.created_at as "createdAt",
          u.name as "createdByName"
        from inventory_movements im
        inner join products p on im.product_id = p.id
        left join users u on im.created_by = u.id
        where
          im.store_id = :storeId
          and (:type is null or im.type = :type)
          and (:productId is null or im.product_id = :productId)
          and (:query is null or p.sku ilike :queryLike or p.name ilike :queryLike)
          and (:dateFrom is null or im.created_at >= :dateFrom)
          and (:dateTo is null or im.created_at < :dateTo)
        order by im.created_at desc, im.id desc
        limit :limit
        offset :offset
      `,
      {
        replacements: {
          storeId,
          type: filters?.type ?? null,
          productId: filters?.productId ?? null,
          query,
          queryLike: query ? `%${query}%` : null,
          dateFrom: filters?.dateFrom ? toDayStartIso(filters.dateFrom) : null,
          dateTo: filters?.dateTo ? toNextDayStartIso(filters.dateTo) : null,
          limit: pageSize,
          offset,
        },
      },
    ),
    pg.queryOne<{ total: number | string }>(
      `
        select count(*)::int as total
        from inventory_movements im
        inner join products p on im.product_id = p.id
        where
          im.store_id = :storeId
          and (:type is null or im.type = :type)
          and (:productId is null or im.product_id = :productId)
          and (:query is null or p.sku ilike :queryLike or p.name ilike :queryLike)
          and (:dateFrom is null or im.created_at >= :dateFrom)
          and (:dateTo is null or im.created_at < :dateTo)
      `,
      {
        replacements: {
          storeId,
          type: filters?.type ?? null,
          productId: filters?.productId ?? null,
          query,
          queryLike: query ? `%${query}%` : null,
          dateFrom: filters?.dateFrom ? toDayStartIso(filters.dateFrom) : null,
          dateTo: filters?.dateTo ? toNextDayStartIso(filters.dateTo) : null,
        },
      },
    ),
  ]);

  return {
    movements: rows,
    total: Number(totalRow?.total ?? 0),
  };
}

export async function getLowStockProducts(
  storeId: string,
  thresholds?: StoreStockThresholds,
): Promise<LowStockItem[]> {
  const productsWithBalance = await getStockProductsForStore(storeId);
  const storeThresholds = thresholds ?? (await getStoreStockThresholds(storeId));
  const storeOutThreshold = storeThresholds.outStockThreshold ?? 0;
  const storeLowThreshold = Math.max(
    storeThresholds.lowStockThreshold ?? 10,
    storeOutThreshold,
  );

  return productsWithBalance
    .filter((product) => {
      if (!product.active) {
        return false;
      }

      const outThreshold = product.outStockThreshold ?? storeOutThreshold;
      const lowThreshold = Math.max(
        product.lowStockThreshold ?? storeLowThreshold,
        outThreshold,
      );

      return product.available <= lowThreshold;
    })
    .sort((a, b) => a.available - b.available)
    .map((product) => ({
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      available: product.available,
      baseUnitCode: product.baseUnitCode,
    }));
}
