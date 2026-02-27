import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  inventoryMovements,
  products,
  purchaseOrderItems,
  purchaseOrderPayments,
  purchaseOrders,
  users,
} from "@/lib/db/schema";

export type PurchaseRepoTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PurchaseRepoExecutor = typeof db | PurchaseRepoTx;

/* ────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────── */

export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;
export type PurchaseOrderPaymentRow = typeof purchaseOrderPayments.$inferSelect;

export type PurchaseOrderPaymentEntry = PurchaseOrderPaymentRow & {
  createdByName: string | null;
};

export type PurchaseOrderView = PurchaseOrderRow & {
  items: (PurchaseOrderItemRow & {
    productName: string;
    productSku: string;
  })[];
  paymentEntries: PurchaseOrderPaymentEntry[];
  createdByName: string | null;
  paidByName: string | null;
  itemCount: number;
  totalCostBase: number;
  totalPaidBase: number;
  outstandingBase: number;
};

export type PurchaseOrderListItem = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRateInitial: number;
  exchangeRateLockedAt: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt: string | null;
  dueDate: string | null;
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED";
  itemCount: number;
  totalCostBase: number;
  totalPaidBase: number;
  outstandingBase: number;
  shippingCost: number;
  otherCost: number;
  orderedAt: string | null;
  expectedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type PendingExchangeRateQueueItem = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRateInitial: number;
  receivedAt: string | null;
  expectedAt: string | null;
  dueDate: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  itemCount: number;
  totalCostBase: number;
  outstandingBase: number;
};

/* ────────────────────────────────────────────────
 * Queries
 * ──────────────────────────────────────────────── */

export async function getNextPoNumber(
  storeId: string,
  tx?: PurchaseRepoTx,
): Promise<string> {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;

  const rows = await executor
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
      exchangeRateInitial: purchaseOrders.exchangeRateInitial,
      exchangeRateLockedAt: purchaseOrders.exchangeRateLockedAt,
      paymentStatus: purchaseOrders.paymentStatus,
      paidAt: purchaseOrders.paidAt,
      dueDate: purchaseOrders.dueDate,
      status: purchaseOrders.status,
      shippingCost: purchaseOrders.shippingCost,
      otherCost: purchaseOrders.otherCost,
      orderedAt: purchaseOrders.orderedAt,
      expectedAt: purchaseOrders.expectedAt,
      shippedAt: purchaseOrders.shippedAt,
      receivedAt: purchaseOrders.receivedAt,
      cancelledAt: purchaseOrders.cancelledAt,
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
      totalPaidBase: sql<number>`(
        SELECT coalesce(sum(case
          when ${purchaseOrderPayments.entryType} = 'PAYMENT' then ${purchaseOrderPayments.amountBase}
          when ${purchaseOrderPayments.entryType} = 'REVERSAL' then -${purchaseOrderPayments.amountBase}
          else 0
        end), 0)
        FROM ${purchaseOrderPayments}
        WHERE ${purchaseOrderPayments.purchaseOrderId} = ${purchaseOrders.id}
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
    exchangeRateInitial: r.exchangeRateInitial,
    exchangeRateLockedAt: r.exchangeRateLockedAt,
    paymentStatus: r.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
    paidAt: r.paidAt,
    dueDate: r.dueDate,
    status: r.status as PurchaseOrderListItem["status"],
    itemCount: Number(r.itemCount),
    totalCostBase: Number(r.totalCostBase),
    totalPaidBase: Number(r.totalPaidBase),
    outstandingBase:
      Number(r.totalCostBase) + r.shippingCost + r.otherCost - Number(r.totalPaidBase),
    shippingCost: r.shippingCost,
    otherCost: r.otherCost,
    orderedAt: r.orderedAt,
    expectedAt: r.expectedAt,
    shippedAt: r.shippedAt,
    receivedAt: r.receivedAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
  }));
}

export async function listPurchaseOrdersPaged(
  storeId: string,
  limit: number,
  offset: number,
): Promise<PurchaseOrderListItem[]> {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierName: purchaseOrders.supplierName,
      purchaseCurrency: purchaseOrders.purchaseCurrency,
      exchangeRateInitial: purchaseOrders.exchangeRateInitial,
      exchangeRateLockedAt: purchaseOrders.exchangeRateLockedAt,
      paymentStatus: purchaseOrders.paymentStatus,
      paidAt: purchaseOrders.paidAt,
      dueDate: purchaseOrders.dueDate,
      status: purchaseOrders.status,
      shippingCost: purchaseOrders.shippingCost,
      otherCost: purchaseOrders.otherCost,
      orderedAt: purchaseOrders.orderedAt,
      expectedAt: purchaseOrders.expectedAt,
      shippedAt: purchaseOrders.shippedAt,
      receivedAt: purchaseOrders.receivedAt,
      cancelledAt: purchaseOrders.cancelledAt,
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
      totalPaidBase: sql<number>`(
        SELECT coalesce(sum(case
          when ${purchaseOrderPayments.entryType} = 'PAYMENT' then ${purchaseOrderPayments.amountBase}
          when ${purchaseOrderPayments.entryType} = 'REVERSAL' then -${purchaseOrderPayments.amountBase}
          else 0
        end), 0)
        FROM ${purchaseOrderPayments}
        WHERE ${purchaseOrderPayments.purchaseOrderId} = ${purchaseOrders.id}
      )`,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.storeId, storeId))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    poNumber: r.poNumber,
    supplierName: r.supplierName,
    purchaseCurrency: r.purchaseCurrency as "LAK" | "THB" | "USD",
    exchangeRateInitial: r.exchangeRateInitial,
    exchangeRateLockedAt: r.exchangeRateLockedAt,
    paymentStatus: r.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
    paidAt: r.paidAt,
    dueDate: r.dueDate,
    status: r.status as PurchaseOrderListItem["status"],
    itemCount: Number(r.itemCount),
    totalCostBase: Number(r.totalCostBase),
    totalPaidBase: Number(r.totalPaidBase),
    outstandingBase:
      Number(r.totalCostBase) + r.shippingCost + r.otherCost - Number(r.totalPaidBase),
    shippingCost: r.shippingCost,
    otherCost: r.otherCost,
    orderedAt: r.orderedAt,
    expectedAt: r.expectedAt,
    shippedAt: r.shippedAt,
    receivedAt: r.receivedAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
  }));
}

export async function getPurchaseOrderById(
  poId: string,
  storeId: string,
  tx?: PurchaseRepoTx,
): Promise<PurchaseOrderView | null> {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [poRow] = await executor
    .select({
      po: purchaseOrders,
      createdByName: users.name,
      paidByName: sql<string | null>`(
        SELECT ${users.name}
        FROM ${users}
        WHERE ${users.id} = ${purchaseOrders.paidBy}
        LIMIT 1
      )`,
    })
    .from(purchaseOrders)
    .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
    .where(
      and(eq(purchaseOrders.id, poId), eq(purchaseOrders.storeId, storeId)),
    );

  if (!poRow) return null;

  const itemRows = await executor
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

  const paymentRows = await executor
    .select({
      payment: purchaseOrderPayments,
      createdByName: users.name,
    })
    .from(purchaseOrderPayments)
    .leftJoin(users, eq(purchaseOrderPayments.createdBy, users.id))
    .where(eq(purchaseOrderPayments.purchaseOrderId, poId))
    .orderBy(desc(purchaseOrderPayments.paidAt), desc(purchaseOrderPayments.createdAt));

  const paymentEntries = paymentRows.map((row) => ({
    ...row.payment,
    createdByName: row.createdByName,
  }));

  const totalCostBase = items.reduce(
    (sum, it) => sum + it.unitCostBase * it.qtyOrdered,
    0,
  );
  const totalPaidBase = paymentEntries.reduce((sum, entry) => {
    if (entry.entryType === "REVERSAL") {
      return sum - entry.amountBase;
    }
    return sum + entry.amountBase;
  }, 0);
  const outstandingBase =
    totalCostBase + poRow.po.shippingCost + poRow.po.otherCost - totalPaidBase;

  return {
    ...poRow.po,
    items,
    paymentEntries,
    createdByName: poRow.createdByName,
    paidByName: poRow.paidByName,
    itemCount: items.length,
    totalCostBase,
    totalPaidBase,
    outstandingBase,
  };
}

export async function listPendingExchangeRateQueue(params: {
  storeId: string;
  storeCurrency: "LAK" | "THB" | "USD";
  supplierQuery?: string;
  receivedFrom?: string;
  receivedTo?: string;
  limit?: number;
}): Promise<PendingExchangeRateQueueItem[]> {
  const { storeId, storeCurrency, supplierQuery, receivedFrom, receivedTo } = params;
  const limit = Math.min(200, Math.max(10, params.limit ?? 50));

  const filters = [
    eq(purchaseOrders.storeId, storeId),
    eq(purchaseOrders.status, "RECEIVED"),
    sql`${purchaseOrders.purchaseCurrency} <> ${storeCurrency}`,
    sql`${purchaseOrders.exchangeRateLockedAt} is null`,
  ];

  const normalizedSupplierQuery = supplierQuery?.trim().toLowerCase() ?? "";
  if (normalizedSupplierQuery.length > 0) {
    filters.push(
      sql`lower(coalesce(${purchaseOrders.supplierName}, '')) like ${`%${normalizedSupplierQuery}%`}`,
    );
  }
  if (receivedFrom) {
    filters.push(sql`${purchaseOrders.receivedAt} >= ${receivedFrom}`);
  }
  if (receivedTo) {
    filters.push(sql`${purchaseOrders.receivedAt} <= ${receivedTo}`);
  }

  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierName: purchaseOrders.supplierName,
      purchaseCurrency: purchaseOrders.purchaseCurrency,
      exchangeRateInitial: purchaseOrders.exchangeRateInitial,
      receivedAt: purchaseOrders.receivedAt,
      expectedAt: purchaseOrders.expectedAt,
      dueDate: purchaseOrders.dueDate,
      paymentStatus: purchaseOrders.paymentStatus,
      shippingCost: purchaseOrders.shippingCost,
      otherCost: purchaseOrders.otherCost,
      itemCount: sql<number>`(
        SELECT count(*) FROM ${purchaseOrderItems}
        WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
      )`,
      totalCostBase: sql<number>`(
        SELECT coalesce(sum(${purchaseOrderItems.unitCostBase} * ${purchaseOrderItems.qtyOrdered}), 0)
        FROM ${purchaseOrderItems}
        WHERE ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
      )`,
      totalPaidBase: sql<number>`(
        SELECT coalesce(sum(case
          when ${purchaseOrderPayments.entryType} = 'PAYMENT' then ${purchaseOrderPayments.amountBase}
          when ${purchaseOrderPayments.entryType} = 'REVERSAL' then -${purchaseOrderPayments.amountBase}
          else 0
        end), 0)
        FROM ${purchaseOrderPayments}
        WHERE ${purchaseOrderPayments.purchaseOrderId} = ${purchaseOrders.id}
      )`,
    })
    .from(purchaseOrders)
    .where(and(...filters))
    .orderBy(desc(purchaseOrders.receivedAt), desc(purchaseOrders.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    poNumber: row.poNumber,
    supplierName: row.supplierName,
    purchaseCurrency: row.purchaseCurrency as "LAK" | "THB" | "USD",
    exchangeRateInitial: row.exchangeRateInitial,
    receivedAt: row.receivedAt,
    expectedAt: row.expectedAt,
    dueDate: row.dueDate,
    paymentStatus: row.paymentStatus as "UNPAID" | "PARTIAL" | "PAID",
    itemCount: Number(row.itemCount ?? 0),
    totalCostBase: Number(row.totalCostBase ?? 0),
    outstandingBase:
      Number(row.totalCostBase ?? 0) +
      Number(row.shippingCost ?? 0) +
      Number(row.otherCost ?? 0) -
      Number(row.totalPaidBase ?? 0),
  }));
}

/* ────────────────────────────────────────────────
 * Mutations
 * ──────────────────────────────────────────────── */

export async function insertPurchaseOrder(
  data: typeof purchaseOrders.$inferInsert,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor.insert(purchaseOrders).values(data).returning();
  return row!;
}

export async function insertPurchaseOrderItems(
  items: (typeof purchaseOrderItems.$inferInsert)[],
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  if (items.length === 0) return;
  await executor.insert(purchaseOrderItems).values(items);
}

export async function replacePurchaseOrderItems(
  poId: string,
  items: (typeof purchaseOrderItems.$inferInsert)[],
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  await executor
    .delete(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId));
  if (items.length === 0) return;
  await executor.insert(purchaseOrderItems).values(items);
}

export async function updatePurchaseOrderFields(
  poId: string,
  updates: Partial<typeof purchaseOrders.$inferInsert>,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  await executor
    .update(purchaseOrders)
    .set(updates)
    .where(eq(purchaseOrders.id, poId));
}

export async function updatePurchaseOrderStatus(
  poId: string,
  updates: Partial<typeof purchaseOrders.$inferInsert>,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  await executor
    .update(purchaseOrders)
    .set(updates)
    .where(eq(purchaseOrders.id, poId));
}

export async function updatePurchaseOrderItemReceived(
  itemId: string,
  qtyReceived: number,
  landedCostPerUnit: number,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  await executor
    .update(purchaseOrderItems)
    .set({ qtyReceived, landedCostPerUnit })
    .where(eq(purchaseOrderItems.id, itemId));
}

export async function updatePurchaseOrderItemCostFields(
  itemId: string,
  unitCostBase: number,
  landedCostPerUnit: number,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  await executor
    .update(purchaseOrderItems)
    .set({ unitCostBase, landedCostPerUnit })
    .where(eq(purchaseOrderItems.id, itemId));
}

export async function insertPurchaseOrderPayment(
  data: typeof purchaseOrderPayments.$inferInsert,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor.insert(purchaseOrderPayments).values(data).returning();
  return row!;
}

export async function getPurchaseOrderPaymentById(
  paymentId: string,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor
    .select()
    .from(purchaseOrderPayments)
    .where(eq(purchaseOrderPayments.id, paymentId))
    .limit(1);
  return row ?? null;
}

export async function hasPurchaseOrderPaymentReversal(
  paymentId: string,
  tx?: PurchaseRepoTx,
): Promise<boolean> {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor
    .select({
      count: sql<number>`count(*)`,
    })
    .from(purchaseOrderPayments)
    .where(eq(purchaseOrderPayments.reversedPaymentId, paymentId))
    .limit(1);
  return Number(row?.count ?? 0) > 0;
}

export async function getLatestPurchaseOrderPaymentEntry(
  purchaseOrderId: string,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor
    .select()
    .from(purchaseOrderPayments)
    .where(eq(purchaseOrderPayments.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(purchaseOrderPayments.paidAt), desc(purchaseOrderPayments.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertInventoryMovementsForPO(
  movements: (typeof inventoryMovements.$inferInsert)[],
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  if (movements.length === 0) return;
  await executor.insert(inventoryMovements).values(movements);
}

export async function updateProductCostBase(
  productId: string,
  newCostBase: number,
  tx?: PurchaseRepoTx,
) {
  const executor: PurchaseRepoExecutor = tx ?? db;
  await executor
    .update(products)
    .set({ costBase: newCostBase })
    .where(eq(products.id, productId));
}

export async function getProductCurrentStock(
  storeId: string,
  productId: string,
  tx?: PurchaseRepoTx,
): Promise<number> {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor
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

export async function getProductCostBase(
  productId: string,
  tx?: PurchaseRepoTx,
): Promise<number> {
  const executor: PurchaseRepoExecutor = tx ?? db;
  const [row] = await executor
    .select({ costBase: products.costBase })
    .from(products)
    .where(eq(products.id, productId));
  return Number(row?.costBase ?? 0);
}
