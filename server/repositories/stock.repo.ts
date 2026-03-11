import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import type { PostgresTransaction } from "@/lib/db/sequelize";
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

type StockRepoTx = PostgresTransaction;

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
  categoryId?: string | null,
): Promise<StockProductOption[]> {
  return timeDb("stock.repo.listProductsPage", async () =>
    getStockProductsForStorePage(storeId, limit, offset, categoryId),
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
  const load = async () =>
    queryOne<StockMutationProduct>(
      `
        select
          id,
          base_unit_id as "baseUnitId",
          active
        from products
        where id = :productId
          and store_id = :storeId
        limit 1
      `,
      {
        transaction: tx,
        replacements: {
          storeId,
          productId,
        },
      },
    );

  return tx ? load() : timeDb("stock.repo.findProduct", async () => load());
}

export async function findUnitMultiplierToBase(
  productId: string,
  unitId: string,
  tx?: StockRepoTx,
): Promise<number | null> {
  const load = async () => {
    const conversion = await queryOne<{ multiplierToBase: number | string | null }>(
      `
        select multiplier_to_base as "multiplierToBase"
        from product_units
        where product_id = :productId
          and unit_id = :unitId
        limit 1
      `,
      {
        transaction: tx,
        replacements: {
          productId,
          unitId,
        },
      },
    );

    return conversion?.multiplierToBase != null
      ? Number(conversion.multiplierToBase)
      : null;
  };

  return tx
    ? load()
    : timeDb("stock.repo.findUnitMultiplier", async () => load());
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
  const movementId = randomUUID();
  const insert = async () => {
    await execute(
      `
        insert into inventory_movements (
          id,
          store_id,
          product_id,
          type,
          qty_base,
          ref_type,
          ref_id,
          note,
          created_by
        )
        values (
          :id,
          :storeId,
          :productId,
          :type,
          :qtyBase,
          :refType,
          null,
          :note,
          :createdBy
        )
      `,
      {
        transaction: input.tx,
        replacements: {
          id: movementId,
          storeId: input.storeId,
          productId: input.productId,
          type: input.type,
          qtyBase: input.qtyBase,
          refType: input.type === "RETURN" ? "RETURN" : "MANUAL",
          note: input.note,
          createdBy: input.createdBy,
        },
      },
    );

    return movementId;
  };

  return input.tx
    ? insert()
    : timeDb("stock.repo.insertMovement", async () => insert());
}

export async function getStockBalanceByProduct(
  storeId: string,
  productId: string,
  tx?: StockRepoTx,
) {
  const load = async () => {
    const row = await queryOne<{
      onHand: number | string | null;
      reserved: number | string | null;
    }>(
      `
        select
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
          and product_id = :productId
      `,
      {
        transaction: tx,
        replacements: {
          storeId,
          productId,
        },
      },
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
