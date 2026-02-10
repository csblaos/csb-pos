import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import {
  inventoryMovements,
  productUnits,
  products,
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

export type LowStockItem = {
  productId: string;
  sku: string;
  name: string;
  available: number;
  baseUnitCode: string;
};

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

export async function getInventoryBalancesByStore(storeId: string) {
  return movementBalances(storeId);
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

export async function getLowStockProducts(
  storeId: string,
  thresholdBase = 10,
): Promise<LowStockItem[]> {
  const productsWithBalance = await getStockProductsForStore(storeId);

  return productsWithBalance
    .filter((product) => product.active && product.available <= thresholdBase)
    .sort((a, b) => a.available - b.available)
    .map((product) => ({
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      available: product.available,
      baseUnitCode: product.baseUnitCode,
    }));
}
