import "server-only";

import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  UpdatePOStatusInput,
} from "@/lib/purchases/validation";
import {
  getNextPoNumber,
  getProductCostBase,
  getProductCurrentStock,
  getPurchaseOrderById,
  insertInventoryMovementsForPO,
  insertPurchaseOrder,
  insertPurchaseOrderItems,
  listPurchaseOrders,
  listPurchaseOrdersPaged,
  replacePurchaseOrderItems,
  updateProductCostBase,
  updatePurchaseOrderFields,
  updatePurchaseOrderItemReceived,
  updatePurchaseOrderStatus,
} from "@/server/repositories/purchase.repo";
import type {
  PurchaseOrderListItem,
  PurchaseOrderView,
} from "@/server/repositories/purchase.repo";

export { type PurchaseOrderListItem, type PurchaseOrderView };

export class PurchaseServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ────────────────────────────────────────────────
 * List
 * ──────────────────────────────────────────────── */

export async function getPurchaseOrderList(storeId: string) {
  return listPurchaseOrders(storeId);
}

export async function getPurchaseOrderListPage(
  storeId: string,
  limit: number,
  offset: number,
) {
  return listPurchaseOrdersPaged(storeId, limit, offset);
}

/* ────────────────────────────────────────────────
 * Detail
 * ──────────────────────────────────────────────── */

export async function getPurchaseOrderDetail(
  poId: string,
  storeId: string,
): Promise<PurchaseOrderView> {
  const po = await getPurchaseOrderById(poId, storeId);
  if (!po) {
    throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
  }
  return po;
}

/* ────────────────────────────────────────────────
 * Create
 * ──────────────────────────────────────────────── */

export async function createPurchaseOrder(params: {
  storeId: string;
  userId: string;
  storeCurrency: string;
  payload: CreatePurchaseOrderInput;
}): Promise<PurchaseOrderView> {
  const { storeId, userId, storeCurrency, payload } = params;
  const poNumber = await getNextPoNumber(storeId);

  const exchangeRate = payload.purchaseCurrency === storeCurrency
    ? 1
    : payload.exchangeRate;

  const initialStatus = payload.receiveImmediately ? "RECEIVED" : "DRAFT";
  const now = new Date().toISOString();

  const po = await insertPurchaseOrder({
    storeId,
    poNumber,
    supplierName: payload.supplierName || null,
    supplierContact: payload.supplierContact || null,
    purchaseCurrency: payload.purchaseCurrency,
    exchangeRate: Math.round(exchangeRate),
    shippingCost: payload.shippingCost,
    otherCost: payload.otherCost,
    otherCostNote: payload.otherCostNote || null,
    note: payload.note || null,
    expectedAt: payload.expectedAt || null,
    status: initialStatus,
    orderedAt: payload.receiveImmediately ? now : null,
    receivedAt: payload.receiveImmediately ? now : null,
    createdBy: userId,
  });

  // Compute unitCostBase for each item
  const items = payload.items.map((item) => ({
    purchaseOrderId: po.id,
    productId: item.productId,
    qtyOrdered: item.qtyOrdered,
    qtyReceived: payload.receiveImmediately ? item.qtyOrdered : 0,
    unitCostPurchase: item.unitCostPurchase,
    unitCostBase: Math.round(item.unitCostPurchase * exchangeRate),
    landedCostPerUnit: 0, // will calculate below
  }));

  // Calculate landed cost per unit (proportional allocation of shipping + other)
  const totalExtraCost = payload.shippingCost + payload.otherCost;
  if (totalExtraCost > 0) {
    const totalItemsCostBase = items.reduce(
      (sum, it) => sum + it.unitCostBase * it.qtyOrdered,
      0,
    );

    for (const item of items) {
      const itemTotalCostBase = item.unitCostBase * item.qtyOrdered;
      const proportion =
        totalItemsCostBase > 0 ? itemTotalCostBase / totalItemsCostBase : 0;
      const allocatedExtra = Math.round(totalExtraCost * proportion);
      item.landedCostPerUnit = Math.round(
        (itemTotalCostBase + allocatedExtra) / item.qtyOrdered,
      );
    }
  } else {
    for (const item of items) {
      item.landedCostPerUnit = item.unitCostBase;
    }
  }

  await insertPurchaseOrderItems(items);

  // If receiveImmediately, post stock movements + update cost
  if (payload.receiveImmediately) {
    await receiveStockAndUpdateCost(storeId, userId, po.id, items);
  }

  return getPurchaseOrderDetail(po.id, storeId);
}

/* ────────────────────────────────────────────────
 * Update Status
 * ──────────────────────────────────────────────── */

export async function updatePurchaseOrderStatusFlow(params: {
  poId: string;
  storeId: string;
  userId: string;
  payload: UpdatePOStatusInput;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, userId, payload } = params;
  const po = await getPurchaseOrderById(poId, storeId);

  if (!po) {
    throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
  }

  const now = new Date().toISOString();

  // Validate status transitions
  const validTransitions: Record<string, string[]> = {
    DRAFT: ["ORDERED", "RECEIVED", "CANCELLED"],
    ORDERED: ["SHIPPED", "RECEIVED", "CANCELLED"],
    SHIPPED: ["RECEIVED", "CANCELLED"],
    RECEIVED: [],
    CANCELLED: [],
  };

  const allowed = validTransitions[po.status] ?? [];
  if (!allowed.includes(payload.status)) {
    throw new PurchaseServiceError(
      400,
      `ไม่สามารถเปลี่ยนสถานะจาก "${po.status}" เป็น "${payload.status}" ได้`,
    );
  }

  const updates: Record<string, unknown> = { status: payload.status };

  if (payload.status === "ORDERED") {
    updates.orderedAt = now;
  } else if (payload.status === "SHIPPED") {
    updates.shippedAt = now;
    if (payload.trackingInfo) {
      updates.trackingInfo = payload.trackingInfo;
    }
  } else if (payload.status === "RECEIVED") {
    updates.receivedAt = now;

    // Update received quantities
    const receivedMap = new Map(
      (payload.receivedItems ?? []).map((ri) => [ri.itemId, ri.qtyReceived]),
    );

    // Recalculate landed cost based on actual received quantities
    const totalExtraCost = po.shippingCost + po.otherCost;
    const itemsToReceive = po.items.map((item) => {
      const qtyReceived = receivedMap.get(item.id) ?? item.qtyOrdered;
      return { ...item, qtyReceived };
    });

    const totalReceivedCostBase = itemsToReceive.reduce(
      (sum, it) => sum + it.unitCostBase * it.qtyReceived,
      0,
    );

    for (const item of itemsToReceive) {
      const qtyReceived = item.qtyReceived;
      if (qtyReceived <= 0) {
        await updatePurchaseOrderItemReceived(item.id, 0, 0);
        continue;
      }

      let landedCostPerUnit = item.unitCostBase;
      if (totalExtraCost > 0 && totalReceivedCostBase > 0) {
        const itemTotalCostBase = item.unitCostBase * qtyReceived;
        const proportion = itemTotalCostBase / totalReceivedCostBase;
        const allocatedExtra = Math.round(totalExtraCost * proportion);
        landedCostPerUnit = Math.round(
          (itemTotalCostBase + allocatedExtra) / qtyReceived,
        );
      }

      await updatePurchaseOrderItemReceived(
        item.id,
        qtyReceived,
        landedCostPerUnit,
      );
    }

    // Stock in + update weighted average cost
    const finalItems = itemsToReceive
      .filter((it) => it.qtyReceived > 0)
      .map((it) => {
        let landedCostPerUnit = it.unitCostBase;
        if (totalExtraCost > 0 && totalReceivedCostBase > 0) {
          const itemTotalCostBase = it.unitCostBase * it.qtyReceived;
          const proportion = itemTotalCostBase / totalReceivedCostBase;
          const allocatedExtra = Math.round(totalExtraCost * proportion);
          landedCostPerUnit = Math.round(
            (itemTotalCostBase + allocatedExtra) / it.qtyReceived,
          );
        }
        return {
          purchaseOrderId: poId,
          productId: it.productId,
          qtyOrdered: it.qtyOrdered,
          qtyReceived: it.qtyReceived,
          unitCostPurchase: it.unitCostPurchase,
          unitCostBase: it.unitCostBase,
          landedCostPerUnit,
        };
      });

    await receiveStockAndUpdateCost(storeId, userId, poId, finalItems);
  } else if (payload.status === "CANCELLED") {
    updates.cancelledAt = now;
  }

  await updatePurchaseOrderStatus(poId, updates);
  return getPurchaseOrderDetail(poId, storeId);
}

export async function updatePurchaseOrderFlow(params: {
  poId: string;
  storeId: string;
  storeCurrency: string;
  payload: UpdatePurchaseOrderInput;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, storeCurrency, payload } = params;
  const po = await getPurchaseOrderById(poId, storeId);

  if (!po) {
    throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
  }

  if (po.status === "RECEIVED" || po.status === "CANCELLED") {
    throw new PurchaseServiceError(
      400,
      "PO ที่รับสินค้าแล้วหรือยกเลิกแล้ว ไม่สามารถแก้ไขได้",
    );
  }

  const isDraft = po.status === "DRAFT";
  const restrictedKeys = [
    "supplierName",
    "supplierContact",
    "purchaseCurrency",
    "exchangeRate",
    "shippingCost",
    "otherCost",
    "otherCostNote",
    "items",
  ] as const;

  if (!isDraft) {
    const hasRestrictedChange = restrictedKeys.some(
      (key) => payload[key] !== undefined,
    );
    if (hasRestrictedChange) {
      throw new PurchaseServiceError(
        400,
        "สถานะนี้แก้ได้เฉพาะหมายเหตุ วันที่คาดรับ และข้อมูล Tracking",
      );
    }
  }

  const updates: Record<string, unknown> = {};

  if (payload.note !== undefined) updates.note = payload.note || null;
  if (payload.expectedAt !== undefined) updates.expectedAt = payload.expectedAt || null;
  if (payload.trackingInfo !== undefined) {
    updates.trackingInfo = payload.trackingInfo || null;
  }

  if (isDraft) {
    if (payload.supplierName !== undefined) updates.supplierName = payload.supplierName || null;
    if (payload.supplierContact !== undefined) {
      updates.supplierContact = payload.supplierContact || null;
    }
    if (payload.shippingCost !== undefined) updates.shippingCost = payload.shippingCost;
    if (payload.otherCost !== undefined) updates.otherCost = payload.otherCost;
    if (payload.otherCostNote !== undefined) {
      updates.otherCostNote = payload.otherCostNote || null;
    }

    const nextCurrency = payload.purchaseCurrency ?? po.purchaseCurrency;
    const nextRate =
      nextCurrency === storeCurrency ? 1 : Math.round(payload.exchangeRate ?? po.exchangeRate);

    if (payload.purchaseCurrency !== undefined || payload.exchangeRate !== undefined) {
      updates.purchaseCurrency = nextCurrency;
      updates.exchangeRate = nextRate;
    }

    const costAffectingChanged =
      payload.items !== undefined ||
      payload.purchaseCurrency !== undefined ||
      payload.exchangeRate !== undefined ||
      payload.shippingCost !== undefined ||
      payload.otherCost !== undefined;

    if (costAffectingChanged) {
      const sourceItems =
        payload.items ??
        po.items.map((item) => ({
          productId: item.productId,
          qtyOrdered: item.qtyOrdered,
          unitCostPurchase: item.unitCostPurchase,
        }));

      const shippingCost = payload.shippingCost ?? po.shippingCost;
      const otherCost = payload.otherCost ?? po.otherCost;
      const totalExtraCost = shippingCost + otherCost;

      const items = sourceItems.map((item) => ({
        purchaseOrderId: po.id,
        productId: item.productId,
        qtyOrdered: item.qtyOrdered,
        qtyReceived: 0,
        unitCostPurchase: item.unitCostPurchase,
        unitCostBase: Math.round(item.unitCostPurchase * nextRate),
        landedCostPerUnit: 0,
      }));

      if (totalExtraCost > 0) {
        const totalItemsCostBase = items.reduce(
          (sum, it) => sum + it.unitCostBase * it.qtyOrdered,
          0,
        );

        for (const item of items) {
          const itemTotalCostBase = item.unitCostBase * item.qtyOrdered;
          const proportion =
            totalItemsCostBase > 0 ? itemTotalCostBase / totalItemsCostBase : 0;
          const allocatedExtra = Math.round(totalExtraCost * proportion);
          item.landedCostPerUnit = Math.round(
            (itemTotalCostBase + allocatedExtra) / item.qtyOrdered,
          );
        }
      } else {
        for (const item of items) {
          item.landedCostPerUnit = item.unitCostBase;
        }
      }

      await replacePurchaseOrderItems(po.id, items);
    }
  }

  await updatePurchaseOrderFields(po.id, updates);
  return getPurchaseOrderDetail(po.id, storeId);
}

/* ────────────────────────────────────────────────
 * Internal: receive stock + weighted average cost
 * ──────────────────────────────────────────────── */

async function receiveStockAndUpdateCost(
  storeId: string,
  userId: string,
  poId: string,
  items: {
    productId: string;
    qtyReceived?: number;
    qtyOrdered: number;
    landedCostPerUnit: number;
  }[],
) {
  const movements = items.map((item) => ({
    storeId,
    productId: item.productId,
    type: "IN" as const,
    qtyBase: item.qtyReceived ?? item.qtyOrdered,
    refType: "PURCHASE" as const,
    refId: poId,
    note: `รับสินค้าจากใบสั่งซื้อ`,
    createdBy: userId,
  }));

  await insertInventoryMovementsForPO(movements);

  // Update weighted average cost for each product
  for (const item of items) {
    const qtyReceived = item.qtyReceived ?? item.qtyOrdered;
    if (qtyReceived <= 0) continue;

    const currentOnHand = await getProductCurrentStock(storeId, item.productId);
    const currentCostBase = await getProductCostBase(item.productId);

    // Stock BEFORE this receipt (subtract just-added qty)
    const previousOnHand = currentOnHand - qtyReceived;
    const previousTotalCost = previousOnHand * currentCostBase;
    const newTotalCost = qtyReceived * item.landedCostPerUnit;

    let newCostBase: number;
    if (previousOnHand <= 0) {
      // First stock or was empty — use new landed cost directly
      newCostBase = item.landedCostPerUnit;
    } else {
      // Weighted average
      newCostBase = Math.round(
        (previousTotalCost + newTotalCost) / (previousOnHand + qtyReceived),
      );
    }

    await updateProductCostBase(item.productId, newCostBase);
  }
}
