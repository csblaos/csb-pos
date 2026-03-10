import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import {
  inventoryMovements,
  productUnits,
  products,
  stores,
  units,
  users,
} from "@/lib/db/schema";

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

const getPostgresInventoryReadContext = async (): Promise<PostgresInventoryReadContext | null> => {
  if (process.env.POSTGRES_INVENTORY_READ_ENABLED !== "1") {
    return null;
  }

  try {
    const [{ queryMany, queryOne }, { ensurePostgresConnection, isPostgresConfigured }] =
      await Promise.all([import("@/lib/db/query"), import("@/lib/db/sequelize")]);

    if (!isPostgresConfigured()) {
      return null;
    }

    await ensurePostgresConnection();
    return { queryMany, queryOne };
  } catch (error) {
    console.warn(
      `[inventory.read.pg] init fallback to turso: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return null;
  }
};

const logInventoryReadFallback = (operation: string, error: unknown) => {
  console.warn(
    `[inventory.read.pg] fallback operation=${operation}: ${
      error instanceof Error ? error.message : "unknown"
    }`,
  );
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

export async function getStoreStockThresholds(
  storeId: string,
): Promise<StoreStockThresholds> {
  const [store] = await db
    .select({
      outStockThreshold: stores.outStockThreshold,
      lowStockThreshold: stores.lowStockThreshold,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  return {
    outStockThreshold: store?.outStockThreshold ?? 0,
    lowStockThreshold: store?.lowStockThreshold ?? 10,
  };
}

const movementBalances = async (
  storeId: string,
  productId?: string,
): Promise<InventoryBalance[]> => {
  const rows = await db
    .select({
      productId: inventoryMovements.productId,
      onHand: sql<number>`
        coalesce(sum(case
          when ${inventoryMovements.type} = 'IN' then ${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'RETURN' then ${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'OUT' then -${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'ADJUST' then ${inventoryMovements.qtyBase}
          else 0
        end), 0)
      `,
      reserved: sql<number>`
        coalesce(sum(case
          when ${inventoryMovements.type} = 'RESERVE' then ${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'RELEASE' then -${inventoryMovements.qtyBase}
          else 0
        end), 0)
      `,
    })
    .from(inventoryMovements)
    .where(
      productId
        ? and(
            eq(inventoryMovements.storeId, storeId),
            eq(inventoryMovements.productId, productId),
          )
        : eq(inventoryMovements.storeId, storeId),
    )
    .groupBy(inventoryMovements.productId);

  return mapInventoryBalanceRows(rows);
};

const movementBalancesByProductIds = async (
  storeId: string,
  productIds: string[],
): Promise<InventoryBalance[]> => {
  if (productIds.length === 0) return [];

  const rows = await db
    .select({
      productId: inventoryMovements.productId,
      onHand: sql<number>`
        coalesce(sum(case
          when ${inventoryMovements.type} = 'IN' then ${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'RETURN' then ${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'OUT' then -${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'ADJUST' then ${inventoryMovements.qtyBase}
          else 0
        end), 0)
      `,
      reserved: sql<number>`
        coalesce(sum(case
          when ${inventoryMovements.type} = 'RESERVE' then ${inventoryMovements.qtyBase}
          when ${inventoryMovements.type} = 'RELEASE' then -${inventoryMovements.qtyBase}
          else 0
        end), 0)
      `,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.storeId, storeId),
        inArray(inventoryMovements.productId, productIds),
      ),
    )
    .groupBy(inventoryMovements.productId);

  return mapInventoryBalanceRows(rows);
};

export async function getInventoryBalancesByStore(storeId: string) {
  const pg = await getPostgresInventoryReadContext();
  if (pg) {
    try {
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
    } catch (error) {
      logInventoryReadFallback("getInventoryBalancesByStore", error);
    }
  }

  return movementBalances(storeId);
}

export async function getInventoryBalancesByStoreForProducts(
  storeId: string,
  productIds: string[],
) {
  const pg = await getPostgresInventoryReadContext();
  if (pg) {
    try {
      const rows = await getInventoryBalancesByStore(storeId);
      const productIdSet = new Set(productIds);
      return rows.filter((row) => productIdSet.has(row.productId));
    } catch (error) {
      logInventoryReadFallback("getInventoryBalancesByStoreForProducts", error);
    }
  }

  return movementBalancesByProductIds(storeId, productIds);
}

export async function getInventoryBalanceForProduct(storeId: string, productId: string) {
  const pg = await getPostgresInventoryReadContext();
  if (pg) {
    try {
      const rows = await getInventoryBalancesByStore(storeId);
      return rows.find((row) => row.productId === productId) ?? {
        productId,
        onHand: 0,
        reserved: 0,
        available: 0,
      };
    } catch (error) {
      logInventoryReadFallback("getInventoryBalanceForProduct", error);
    }
  }

  const rows = await movementBalances(storeId, productId);
  return rows[0] ?? { productId, onHand: 0, reserved: 0, available: 0 };
}

export async function getOrderStockStateForOrder(
  storeId: string,
  orderId: string,
): Promise<OrderStockState> {
  const pg = await getPostgresInventoryReadContext();
  if (pg) {
    try {
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
    } catch (error) {
      logInventoryReadFallback("getOrderStockStateForOrder", error);
    }
  }

  const movementRows = await db
    .select({ type: inventoryMovements.type })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.storeId, storeId),
        eq(inventoryMovements.refType, "ORDER"),
        eq(inventoryMovements.refId, orderId),
      ),
    );

  let reserveCount = 0;
  let releaseCount = 0;
  let outCount = 0;
  for (const row of movementRows) {
    if (row.type === "RESERVE") {
      reserveCount += 1;
      continue;
    }
    if (row.type === "RELEASE") {
      releaseCount += 1;
      continue;
    }
    if (row.type === "OUT") {
      outCount += 1;
    }
  }

  return {
    hasStockOutFromOrder: outCount > 0,
    hasActiveReserve: reserveCount > releaseCount,
  };
}

export async function getStockProductsForStore(
  storeId: string,
): Promise<StockProductOption[]> {
  const baseUnits = alias(units, "base_units");

  const [productRows, conversionRows, balances] = await Promise.all([
    db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        active: products.active,
        baseUnitId: products.baseUnitId,
        baseUnitCode: baseUnits.code,
        baseUnitNameTh: baseUnits.nameTh,
        outStockThreshold: products.outStockThreshold,
        lowStockThreshold: products.lowStockThreshold,
      })
      .from(products)
      .innerJoin(baseUnits, eq(products.baseUnitId, baseUnits.id))
      .where(eq(products.storeId, storeId))
      .orderBy(asc(products.name)),
    db
      .select({
        productId: productUnits.productId,
        unitId: units.id,
        unitCode: units.code,
        unitNameTh: units.nameTh,
        multiplierToBase: productUnits.multiplierToBase,
      })
      .from(productUnits)
      .innerJoin(products, eq(productUnits.productId, products.id))
      .innerJoin(units, eq(productUnits.unitId, units.id))
      .where(eq(products.storeId, storeId)),
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
      outStockThreshold: product.outStockThreshold ?? null,
      lowStockThreshold: product.lowStockThreshold ?? null,
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
  const baseUnits = alias(units, "base_units");
  const whereClause = categoryId
    ? and(eq(products.storeId, storeId), eq(products.categoryId, categoryId))
    : eq(products.storeId, storeId);

  const productRows = await db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      active: products.active,
      baseUnitId: products.baseUnitId,
      baseUnitCode: baseUnits.code,
      baseUnitNameTh: baseUnits.nameTh,
      outStockThreshold: products.outStockThreshold,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .innerJoin(baseUnits, eq(products.baseUnitId, baseUnits.id))
    .where(whereClause)
    .orderBy(asc(products.name))
    .limit(limit)
    .offset(offset);

  const productIds = productRows.map((row) => row.productId);
  if (productIds.length === 0) return [];

  const [conversionRows, balances] = await Promise.all([
    db
      .select({
        productId: productUnits.productId,
        unitId: units.id,
        unitCode: units.code,
        unitNameTh: units.nameTh,
        multiplierToBase: productUnits.multiplierToBase,
      })
      .from(productUnits)
      .innerJoin(products, eq(productUnits.productId, products.id))
      .innerJoin(units, eq(productUnits.unitId, units.id))
      .where(inArray(productUnits.productId, productIds)),
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
      outStockThreshold: product.outStockThreshold ?? null,
      lowStockThreshold: product.lowStockThreshold ?? null,
      unitOptions,
    };
  });
}

export async function getRecentInventoryMovements(
  storeId: string,
  limit = 20,
): Promise<InventoryMovementView[]> {
  const rows = await db
    .select({
      id: inventoryMovements.id,
      productId: products.id,
      productSku: products.sku,
      productName: products.name,
      type: inventoryMovements.type,
      qtyBase: inventoryMovements.qtyBase,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
      createdByName: users.name,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .leftJoin(users, eq(inventoryMovements.createdBy, users.id))
    .where(eq(inventoryMovements.storeId, storeId))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    type: row.type,
    qtyBase: row.qtyBase,
    note: row.note,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
  }));
}

export async function getInventoryMovementsPage(
  storeId: string,
  params: {
    page: number;
    pageSize: number;
    filters?: InventoryMovementFilters;
  },
): Promise<InventoryMovementPage> {
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
  const whereConditions = [eq(inventoryMovements.storeId, storeId)];

  if (filters?.type) {
    whereConditions.push(eq(inventoryMovements.type, filters.type));
  }

  if (filters?.productId) {
    whereConditions.push(eq(inventoryMovements.productId, filters.productId));
  }

  const query = filters?.query?.trim();
  const productQueryCondition = query
    ? sql`(${products.sku} like ${`%${query}%`} or ${products.name} like ${`%${query}%`})`
    : undefined;

  if (filters?.dateFrom) {
    whereConditions.push(sql`${inventoryMovements.createdAt} >= ${toDayStartIso(filters.dateFrom)}`);
  }

  if (filters?.dateTo) {
    whereConditions.push(
      sql`${inventoryMovements.createdAt} < ${toNextDayStartIso(filters.dateTo)}`,
    );
  }

  const movementWhereClause = and(...whereConditions);
  const joinedWhereClause = productQueryCondition
    ? and(...whereConditions, productQueryCondition)
    : movementWhereClause;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: inventoryMovements.id,
        productId: products.id,
        productSku: products.sku,
        productName: products.name,
        type: inventoryMovements.type,
        qtyBase: inventoryMovements.qtyBase,
        note: inventoryMovements.note,
        createdAt: inventoryMovements.createdAt,
        createdByName: users.name,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .leftJoin(users, eq(inventoryMovements.createdBy, users.id))
      .where(joinedWhereClause!)
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(pageSize)
      .offset(offset),
    query
      ? db
          .select({
            total: sql<number>`count(*)`,
          })
          .from(inventoryMovements)
          .innerJoin(products, eq(inventoryMovements.productId, products.id))
          .where(joinedWhereClause!)
      : db
          .select({
            total: sql<number>`count(*)`,
          })
          .from(inventoryMovements)
          .where(movementWhereClause!),
  ]);

  const movements = rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    type: row.type,
    qtyBase: row.qtyBase,
    note: row.note,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
  }));

  return {
    movements,
    total: Number(totalRows[0]?.total ?? 0),
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
