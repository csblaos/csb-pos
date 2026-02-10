import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { timeDb } from "@/server/perf/perf";
import {
  getInventoryBalanceForProduct,
  getRecentInventoryMovements,
  getStockProductsForStore,
  type InventoryMovementView,
  type StockProductOption,
} from "@/lib/inventory/queries";
import { inventoryMovements, productUnits, products } from "@/lib/db/schema";

export type StockMutationProduct = {
  id: string;
  baseUnitId: string;
  active: boolean;
};

export async function listStockProductsByStore(
  storeId: string,
): Promise<StockProductOption[]> {
  return timeDb("stock.repo.listProducts", async () =>
    getStockProductsForStore(storeId),
  );
}

export async function listRecentStockMovementsByStore(
  storeId: string,
  limit: number,
): Promise<InventoryMovementView[]> {
  return timeDb("stock.repo.listRecentMovements", async () =>
    getRecentInventoryMovements(storeId, limit),
  );
}

export async function findStockMutationProduct(
  storeId: string,
  productId: string,
): Promise<StockMutationProduct | null> {
  const [product] = await timeDb("stock.repo.findProduct", async () =>
    db
      .select({
        id: products.id,
        baseUnitId: products.baseUnitId,
        active: products.active,
      })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
      .limit(1),
  );

  return product ?? null;
}

export async function findUnitMultiplierToBase(
  productId: string,
  unitId: string,
): Promise<number | null> {
  const [conversion] = await timeDb("stock.repo.findUnitMultiplier", async () =>
    db
      .select({ multiplierToBase: productUnits.multiplierToBase })
      .from(productUnits)
      .where(
        and(eq(productUnits.productId, productId), eq(productUnits.unitId, unitId)),
      )
      .limit(1),
  );

  return conversion?.multiplierToBase ?? null;
}

export async function createInventoryMovementRecord(input: {
  storeId: string;
  productId: string;
  type: "IN" | "ADJUST" | "RETURN";
  qtyBase: number;
  note: string | null;
  createdBy: string;
}) {
  await timeDb("stock.repo.insertMovement", async () =>
    db.insert(inventoryMovements).values({
      storeId: input.storeId,
      productId: input.productId,
      type: input.type,
      qtyBase: input.qtyBase,
      refType: input.type === "RETURN" ? "RETURN" : "MANUAL",
      refId: null,
      note: input.note,
      createdBy: input.createdBy,
    }),
  );
}

export async function getStockBalanceByProduct(storeId: string, productId: string) {
  return timeDb("stock.repo.getBalanceByProduct", async () =>
    getInventoryBalanceForProduct(storeId, productId),
  );
}
