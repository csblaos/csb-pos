import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { timeDb } from "@/server/perf/perf";
import {
  getInventoryMovementsPage,
  getRecentInventoryMovements,
  getStockProductsForStore,
  getStockProductsForStorePage,
  type InventoryMovementFilters,
  type InventoryMovementView,
  type InventoryMovementPage,
  type StockProductOption,
} from "@/lib/inventory/queries";
import { inventoryMovements, productUnits, products } from "@/lib/db/schema";
type StockRepoTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type StockRepoExecutor = typeof db | StockRepoTx;

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

export async function listStockProductsByStorePage(
  storeId: string,
  limit: number,
  offset: number,
): Promise<StockProductOption[]> {
  return timeDb("stock.repo.listProductsPage", async () =>
    getStockProductsForStorePage(storeId, limit, offset),
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

export async function listStockMovementsPageByStore(
  storeId: string,
  page: number,
  pageSize: number,
  filters?: InventoryMovementFilters,
): Promise<InventoryMovementPage> {
  return timeDb("stock.repo.listMovementsPage", async () =>
    getInventoryMovementsPage(storeId, {
      page,
      pageSize,
      filters,
    }),
  );
}

export async function findStockMutationProduct(
  storeId: string,
  productId: string,
  tx?: StockRepoTx,
): Promise<StockMutationProduct | null> {
  const executor: StockRepoExecutor = tx ?? db;
  const load = async () =>
    executor
      .select({
        id: products.id,
        baseUnitId: products.baseUnitId,
        active: products.active,
      })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
      .limit(1);

  const [product] = tx
    ? await load()
    : await timeDb("stock.repo.findProduct", async () => load());

  return product ?? null;
}

export async function findUnitMultiplierToBase(
  productId: string,
  unitId: string,
  tx?: StockRepoTx,
): Promise<number | null> {
  const executor: StockRepoExecutor = tx ?? db;
  const load = async () =>
    executor
      .select({ multiplierToBase: productUnits.multiplierToBase })
      .from(productUnits)
      .where(
        and(eq(productUnits.productId, productId), eq(productUnits.unitId, unitId)),
      )
      .limit(1);

  const [conversion] = tx
    ? await load()
    : await timeDb("stock.repo.findUnitMultiplier", async () => load());

  return conversion?.multiplierToBase ?? null;
}

export async function createInventoryMovementRecord(input: {
  storeId: string;
  productId: string;
  type: "IN" | "ADJUST" | "RETURN";
  qtyBase: number;
  note: string | null;
  createdBy: string;
  tx?: StockRepoTx;
}) {
  const executor: StockRepoExecutor = input.tx ?? db;
  const insert = async () =>
    executor
      .insert(inventoryMovements)
      .values({
        storeId: input.storeId,
        productId: input.productId,
        type: input.type,
        qtyBase: input.qtyBase,
        refType: input.type === "RETURN" ? "RETURN" : "MANUAL",
        refId: null,
        note: input.note,
        createdBy: input.createdBy,
      })
      .returning({ id: inventoryMovements.id });

  const [inserted] = input.tx
    ? await insert()
    : await timeDb("stock.repo.insertMovement", async () => insert());

  return inserted?.id ?? null;
}

export async function getStockBalanceByProduct(
  storeId: string,
  productId: string,
  tx?: StockRepoTx,
) {
  const executor: StockRepoExecutor = tx ?? db;
  const load = async () => {
    const [row] = await executor
      .select({
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
          eq(inventoryMovements.productId, productId),
        ),
      );

    const onHand = Number(row?.onHand ?? 0);
    const reserved = Number(row?.reserved ?? 0);
    return {
      productId,
      onHand,
      reserved,
      available: onHand - reserved,
    };
  };

  return tx ? load() : timeDb("stock.repo.getBalanceByProduct", async () => load());
}
