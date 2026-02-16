import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  inventoryMovements,
  products,
  purchaseOrderItems,
  purchaseOrders,
  users,
} from "@/lib/db/schema";

/* ────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────── */

export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;

export type PurchaseOrderView = PurchaseOrderRow & {
  items: (PurchaseOrderItemRow & {
    productName: string;
    productSku: string;
  })[];
  createdByName: string | null;
  itemCount: number;
  totalCostBase: number;
};

export type PurchaseOrderListItem = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED";
  itemCount: number;
  totalCostBase: number;
  shippingCost: number;
  otherCost: number;
  expectedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};

/* ────────────────────────────────────────────────
 * Queries
 * ──────────────────────────────────────────────── */

export async function getNextPoNumber(storeId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;

  const rows = await db
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.storeId, storeId),
        sql`${purchaseOrders.poNumber} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(purchaseOrders.poNumber))
    .limit(1);

  if (rows.length === 0) {
    return `${prefix}0001`;
  }

  const lastNum = Number.parseInt(rows[0]!.poNumber.replace(prefix, ""), 10);
  return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
}

export async function listPurchaseOrders(
  storeId: string,
): Promise<PurchaseOrderListItem[]> {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierName: purchaseOrders.supplierName,
      purchaseCurrency: purchaseOrders.purchaseCurrency,
      status: purchaseOrders.status,
      shippingCost: purchaseOrders.shippingCost,
      otherCost: purchaseOrders.otherCost,
      expectedAt: purchaseOrders.expectedAt,
      shippedAt: purchaseOrders.shippedAt,
      receivedAt: purchaseOrders.receivedAt,
      createdAt: purchaseOrders.createdAt,
      itemCount: sql<number>`(
        SELECT count(*) FROM ${purchaseOrderItems}
        WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
      )`,
      totalCostBase: sql<number>`(
        SELECT coalesce(sum(${purchaseOrderItems.unitCostBase} * ${purchaseOrderItems.qtyOrdered}), 0)
        FROM ${purchaseOrderItems}
        WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
      )`,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.storeId, storeId))
    .orderBy(desc(purchaseOrders.createdAt));

  return rows.map((r) => ({
    id: r.id,
    poNumber: r.poNumber,
    supplierName: r.supplierName,
    purchaseCurrency: r.purchaseCurrency as "LAK" | "THB" | "USD",
    status: r.status as PurchaseOrderListItem["status"],
    itemCount: Number(r.itemCount),
    totalCostBase: Number(r.totalCostBase),
    shippingCost: r.shippingCost,
    otherCost: r.otherCost,
    expectedAt: r.expectedAt,
    shippedAt: r.shippedAt,
    receivedAt: r.receivedAt,
    createdAt: r.createdAt,
  }));
}

export async function getPurchaseOrderById(
  poId: string,
  storeId: string,
): Promise<PurchaseOrderView | null> {
  const [poRow] = await db
    .select({
      po: purchaseOrders,
      createdByName: users.name,
    })
    .from(purchaseOrders)
    .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
    .where(
      and(eq(purchaseOrders.id, poId), eq(purchaseOrders.storeId, storeId)),
    );

  if (!poRow) return null;

  const itemRows = await db
    .select({
      item: purchaseOrderItems,
      productName: products.name,
      productSku: products.sku,
    })
    .from(purchaseOrderItems)
    .innerJoin(products, eq(purchaseOrderItems.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, poId));

  const items = itemRows.map((r) => ({
    ...r.item,
    productName: r.productName,
    productSku: r.productSku,
  }));

  const totalCostBase = items.reduce(
    (sum, it) => sum + it.unitCostBase * it.qtyOrdered,
    0,
  );

  return {
    ...poRow.po,
    items,
    createdByName: poRow.createdByName,
    itemCount: items.length,
    totalCostBase,
  };
}

/* ────────────────────────────────────────────────
 * Mutations
 * ──────────────────────────────────────────────── */

export async function insertPurchaseOrder(
  data: typeof purchaseOrders.$inferInsert,
) {
  const [row] = await db.insert(purchaseOrders).values(data).returning();
  return row!;
}

export async function insertPurchaseOrderItems(
  items: (typeof purchaseOrderItems.$inferInsert)[],
) {
  if (items.length === 0) return;
  await db.insert(purchaseOrderItems).values(items);
}

export async function updatePurchaseOrderStatus(
  poId: string,
  updates: Partial<typeof purchaseOrders.$inferInsert>,
) {
  await db
    .update(purchaseOrders)
    .set(updates)
    .where(eq(purchaseOrders.id, poId));
}

export async function updatePurchaseOrderItemReceived(
  itemId: string,
  qtyReceived: number,
  landedCostPerUnit: number,
) {
  await db
    .update(purchaseOrderItems)
    .set({ qtyReceived, landedCostPerUnit })
    .where(eq(purchaseOrderItems.id, itemId));
}

export async function insertInventoryMovementsForPO(
  movements: (typeof inventoryMovements.$inferInsert)[],
) {
  if (movements.length === 0) return;
  await db.insert(inventoryMovements).values(movements);
}

export async function updateProductCostBase(
  productId: string,
  newCostBase: number,
) {
  await db
    .update(products)
    .set({ costBase: newCostBase })
    .where(eq(products.id, productId));
}

export async function getProductCurrentStock(
  storeId: string,
  productId: string,
): Promise<number> {
  const [row] = await db
    .select({
      onHand: sql<number>`coalesce(sum(case
        when ${inventoryMovements.type} = 'IN' then ${inventoryMovements.qtyBase}
        when ${inventoryMovements.type} = 'RETURN' then ${inventoryMovements.qtyBase}
        when ${inventoryMovements.type} = 'OUT' then -${inventoryMovements.qtyBase}
        when ${inventoryMovements.type} = 'ADJUST' then ${inventoryMovements.qtyBase}
        else 0
      end), 0)`,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.storeId, storeId),
        eq(inventoryMovements.productId, productId),
      ),
    );

  return Number(row?.onHand ?? 0);
}

export async function getProductCostBase(productId: string): Promise<number> {
  const [row] = await db
    .select({ costBase: products.costBase })
    .from(products)
    .where(eq(products.id, productId));
  return Number(row?.costBase ?? 0);
}
