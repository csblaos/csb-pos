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

export async function getInventoryBalancesByStore(storeId: string) {
  return movementBalances(storeId);
}

export async function getInventoryBalancesByStoreForProducts(
  storeId: string,
  productIds: string[],
) {
  return movementBalancesByProductIds(storeId, productIds);
}

export async function getInventoryBalanceForProduct(storeId: string, productId: string) {
  const rows = await movementBalances(storeId, productId);
  return rows[0] ?? { productId, onHand: 0, reserved: 0, available: 0 };
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
): Promise<StockProductOption[]> {
  const baseUnits = alias(units, "base_units");

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
    .where(eq(products.storeId, storeId))
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
  if (query) {
    const pattern = `%${query}%`;
    whereConditions.push(
      sql`(${products.sku} like ${pattern} or ${products.name} like ${pattern})`,
    );
  }

  if (filters?.dateFrom) {
    whereConditions.push(sql`date(${inventoryMovements.createdAt}) >= date(${filters.dateFrom})`);
  }

  if (filters?.dateTo) {
    whereConditions.push(sql`date(${inventoryMovements.createdAt}) <= date(${filters.dateTo})`);
  }

  const whereClause = and(...whereConditions);

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
      .where(whereClause!)
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .where(whereClause!),
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
