import "server-only";

import type {
  ApplyPurchaseOrderExtraCostInput,
  CreatePurchaseOrderInput,
  FinalizePOExchangeRateInput,
  ReversePurchaseOrderPaymentInput,
  SettlePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  UpdatePOStatusInput,
} from "@/lib/purchases/validation";
import {
  getNextPoNumber,
  getLatestPurchaseOrderPaymentEntry,
  getPurchaseOrderPaymentById,
  getProductCostBase,
  getProductCurrentStock,
  hasPurchaseOrderPaymentReversal,
  getPurchaseOrderById,
  insertInventoryMovementsForPO,
  insertPurchaseOrder,
  insertPurchaseOrderItems,
  insertPurchaseOrderPayment,
  listPendingExchangeRateQueue,
  listPurchaseOrders,
  listPurchaseOrdersPaged,
  replacePurchaseOrderItems,
  updatePurchaseOrderItemCostFields,
  updateProductCostBase,
  updatePurchaseOrderFields,
  updatePurchaseOrderItemReceived,
  updatePurchaseOrderStatus,
} from "@/server/repositories/purchase.repo";
import type {
  PendingExchangeRateQueueItem,
  PurchaseRepoTx,
  PurchaseOrderListItem,
  PurchaseOrderView,
} from "@/server/repositories/purchase.repo";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { buildAuditEventValues } from "@/server/services/audit.service";
import { markIdempotencySucceeded } from "@/server/services/idempotency.service";

export {
  type PendingExchangeRateQueueItem,
  type PurchaseOrderListItem,
  type PurchaseOrderView,
};

type PurchaseAuditContext = {
  actorName: string | null;
  actorRole: string | null;
  request?: Request;
};

type PurchaseIdempotencyContext = {
  recordId: string;
};

export class PurchaseServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeIsoDateOrNull(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new PurchaseServiceError(400, "รูปแบบวันที่ไม่ถูกต้อง");
  }
  return date.toISOString();
}

function derivePoPaymentStatus(
  totalPaidBase: number,
  grandTotalBase: number,
): "UNPAID" | "PARTIAL" | "PAID" {
  if (totalPaidBase <= 0) {
    return "UNPAID";
  }
  if (totalPaidBase >= grandTotalBase) {
    return "PAID";
  }
  return "PARTIAL";
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

export async function getPendingExchangeRateQueue(params: {
  storeId: string;
  storeCurrency: "LAK" | "THB" | "USD";
  supplierQuery?: string;
  receivedFrom?: string;
  receivedTo?: string;
  limit?: number;
}) {
  return listPendingExchangeRateQueue(params);
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
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { storeId, userId, storeCurrency, payload, audit, idempotency } = params;
  const now = new Date().toISOString();

  const hasLockedRate =
    payload.purchaseCurrency === storeCurrency ||
    (payload.exchangeRate !== undefined && Number(payload.exchangeRate) > 0);

  const exchangeRate = payload.purchaseCurrency === storeCurrency
    ? 1
    : Math.round(payload.exchangeRate ?? 1);
  const dueDate = normalizeIsoDateOrNull(payload.dueDate);

  const initialStatus = payload.receiveImmediately ? "RECEIVED" : "DRAFT";

  return db.transaction(async (tx) => {
    const poNumber = await getNextPoNumber(storeId, tx);
    const po = await insertPurchaseOrder(
      {
        storeId,
        poNumber,
        supplierName: payload.supplierName || null,
        supplierContact: payload.supplierContact || null,
        purchaseCurrency: payload.purchaseCurrency,
        exchangeRate: Math.round(exchangeRate),
        exchangeRateInitial: Math.round(exchangeRate),
        exchangeRateLockedAt: hasLockedRate ? now : null,
        exchangeRateLockedBy: hasLockedRate ? userId : null,
        exchangeRateLockNote: hasLockedRate
          ? payload.exchangeRateLockNote || null
          : null,
        paymentStatus: "UNPAID",
        paidAt: null,
        paidBy: null,
        paymentReference: null,
        paymentNote: null,
        shippingCost: payload.shippingCost,
        otherCost: payload.otherCost,
        otherCostNote: payload.otherCostNote || null,
        note: payload.note || null,
        expectedAt: payload.expectedAt || null,
        dueDate,
        status: initialStatus,
        orderedAt: payload.receiveImmediately ? now : null,
        receivedAt: payload.receiveImmediately ? now : null,
        createdBy: userId,
      },
      tx,
    );

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

    await insertPurchaseOrderItems(items, tx);

    // If receiveImmediately, post stock movements + update cost
    if (payload.receiveImmediately) {
      await receiveStockAndUpdateCost(
        storeId,
        userId,
        po.id,
        po.poNumber,
        items,
        tx,
        audit,
      );
    }

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.create",
          entityType: "purchase_order",
          entityId: po.id,
          metadata: {
            poNumber: po.poNumber,
            status: po.status,
            receiveImmediately: payload.receiveImmediately,
            itemCount: payload.items.length,
          },
          request: audit.request,
        }),
      );
    }

    const createdPo = await getPurchaseOrderById(po.id, storeId, tx);
    if (!createdPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: createdPo,
        },
        tx,
      });
    }

    return createdPo;
  });
}

/* ────────────────────────────────────────────────
 * Update Status
 * ──────────────────────────────────────────────── */

export async function updatePurchaseOrderStatusFlow(params: {
  poId: string;
  storeId: string;
  userId: string;
  payload: UpdatePOStatusInput;
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, userId, payload, audit, idempotency } = params;

  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const po = await getPurchaseOrderById(poId, storeId, tx);

    if (!po) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

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

    const updates: Record<string, unknown> = {
      status: payload.status,
      updatedBy: userId,
      updatedAt: now,
    };

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
          await updatePurchaseOrderItemReceived(item.id, 0, 0, tx);
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
          tx,
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

      await receiveStockAndUpdateCost(
        storeId,
        userId,
        poId,
        po.poNumber,
        finalItems,
        tx,
        audit,
      );
    } else if (payload.status === "CANCELLED") {
      updates.cancelledAt = now;
    }

    await updatePurchaseOrderStatus(poId, updates, tx);

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.status.change",
          entityType: "purchase_order",
          entityId: poId,
          metadata: {
            poNumber: po.poNumber,
            status: payload.status,
          },
          request: audit.request,
        }),
      );
    }

    const updatedPo = await getPurchaseOrderById(poId, storeId, tx);
    if (!updatedPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: updatedPo,
        },
        tx,
      });
    }

    return updatedPo;
  });
}

export async function finalizePurchaseOrderExchangeRateFlow(params: {
  poId: string;
  storeId: string;
  userId: string;
  storeCurrency: string;
  payload: FinalizePOExchangeRateInput;
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, userId, storeCurrency, payload, audit, idempotency } = params;
  const now = new Date().toISOString();
  const nextRate = Math.round(payload.exchangeRate);

  return db.transaction(async (tx) => {
    const po = await getPurchaseOrderById(poId, storeId, tx);
    if (!po) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }
    if (po.status !== "RECEIVED") {
      throw new PurchaseServiceError(400, "ปิดเรทได้เฉพาะ PO ที่รับสินค้าแล้ว");
    }
    if (po.purchaseCurrency === storeCurrency) {
      throw new PurchaseServiceError(400, "PO สกุลเงินเดียวกับร้านไม่ต้องปิดเรท");
    }
    if (po.exchangeRateLockedAt) {
      throw new PurchaseServiceError(400, "PO นี้ปิดเรทแล้ว");
    }
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      throw new PurchaseServiceError(400, "อัตราแลกเปลี่ยนต้องมากกว่า 0");
    }

    const totalExtraCost = po.shippingCost + po.otherCost;
    const itemsWithBaseCost = po.items.map((item) => ({
      ...item,
      qtyForCalc: Math.max(item.qtyReceived, 0),
      unitCostBase: Math.round(item.unitCostPurchase * nextRate),
    }));
    const totalReceivedCostBase = itemsWithBaseCost.reduce(
      (sum, item) => sum + item.unitCostBase * item.qtyForCalc,
      0,
    );

    for (const item of itemsWithBaseCost) {
      if (item.qtyForCalc <= 0) {
        await updatePurchaseOrderItemCostFields(item.id, item.unitCostBase, 0, tx);
        continue;
      }

      let landedCostPerUnit = item.unitCostBase;
      if (totalExtraCost > 0 && totalReceivedCostBase > 0) {
        const itemTotalCostBase = item.unitCostBase * item.qtyForCalc;
        const proportion = itemTotalCostBase / totalReceivedCostBase;
        const allocatedExtra = Math.round(totalExtraCost * proportion);
        landedCostPerUnit = Math.round(
          (itemTotalCostBase + allocatedExtra) / item.qtyForCalc,
        );
      }

      await updatePurchaseOrderItemCostFields(
        item.id,
        item.unitCostBase,
        landedCostPerUnit,
        tx,
      );
    }

    await updatePurchaseOrderFields(
      poId,
      {
        exchangeRate: nextRate,
        exchangeRateLockedAt: now,
        exchangeRateLockedBy: userId,
        exchangeRateLockNote: payload.note || null,
        updatedBy: userId,
        updatedAt: now,
      },
      tx,
    );

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.exchange_rate.lock",
          entityType: "purchase_order",
          entityId: po.id,
          metadata: {
            poNumber: po.poNumber,
            previousRate: po.exchangeRate,
            nextRate,
            note: payload.note || null,
          },
          request: audit.request,
        }),
      );
    }

    const updatedPo = await getPurchaseOrderById(po.id, storeId, tx);
    if (!updatedPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: updatedPo,
        },
        tx,
      });
    }

    return updatedPo;
  });
}

export async function settlePurchaseOrderPaymentFlow(params: {
  poId: string;
  storeId: string;
  userId: string;
  storeCurrency: string;
  payload: SettlePurchaseOrderInput;
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, userId, storeCurrency, payload, audit, idempotency } = params;
  const now = new Date().toISOString();
  const paidAt = normalizeIsoDateOrNull(payload.paidAt) ?? now;
  const amountBase = Math.round(payload.amountBase);
  if (!Number.isFinite(amountBase) || amountBase <= 0) {
    throw new PurchaseServiceError(400, "ยอดชำระต้องมากกว่า 0");
  }

  return db.transaction(async (tx) => {
    const po = await getPurchaseOrderById(poId, storeId, tx);
    if (!po) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }
    if (po.status !== "RECEIVED") {
      throw new PurchaseServiceError(400, "บันทึกชำระได้เฉพาะ PO ที่รับสินค้าแล้ว");
    }
    if (po.purchaseCurrency !== storeCurrency && !po.exchangeRateLockedAt) {
      throw new PurchaseServiceError(
        400,
        "PO ต่างสกุลเงินต้องปิดเรทก่อนบันทึกชำระ",
      );
    }
    const grandTotalBase = po.totalCostBase + po.shippingCost + po.otherCost;
    const outstandingBefore = grandTotalBase - po.totalPaidBase;
    if (outstandingBefore <= 0) {
      throw new PurchaseServiceError(400, "PO นี้บันทึกชำระครบแล้ว");
    }
    if (amountBase > outstandingBefore) {
      throw new PurchaseServiceError(
        400,
        `ยอดชำระเกินยอดค้าง (ค้างอยู่ ${outstandingBefore.toLocaleString("th-TH")})`,
      );
    }

    await insertPurchaseOrderPayment(
      {
        purchaseOrderId: po.id,
        storeId,
        entryType: "PAYMENT",
        amountBase,
        paidAt,
        reference: payload.paymentReference?.trim() || null,
        note: payload.paymentNote?.trim() || null,
        createdBy: userId,
      },
      tx,
    );

    const nextTotalPaidBase = po.totalPaidBase + amountBase;
    const nextPaymentStatus = derivePoPaymentStatus(nextTotalPaidBase, grandTotalBase);

    await updatePurchaseOrderFields(
      po.id,
      {
        paymentStatus: nextPaymentStatus,
        paidAt,
        paidBy: userId,
        paymentReference: payload.paymentReference?.trim() || null,
        paymentNote: payload.paymentNote?.trim() || null,
        updatedBy: userId,
        updatedAt: now,
      },
      tx,
    );

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.payment.settle",
          entityType: "purchase_order",
          entityId: po.id,
          metadata: {
            poNumber: po.poNumber,
            paidAt,
            amountBase,
            outstandingBefore,
            outstandingAfter: outstandingBefore - amountBase,
            paymentReference: payload.paymentReference?.trim() || null,
          },
          request: audit.request,
        }),
      );
    }

    const updatedPo = await getPurchaseOrderById(po.id, storeId, tx);
    if (!updatedPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: updatedPo,
        },
        tx,
      });
    }

    return updatedPo;
  });
}

export async function applyPurchaseOrderExtraCostFlow(params: {
  poId: string;
  storeId: string;
  userId: string;
  payload: ApplyPurchaseOrderExtraCostInput;
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, userId, payload, audit, idempotency } = params;
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const po = await getPurchaseOrderById(poId, storeId, tx);
    if (!po) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }
    if (po.status !== "RECEIVED") {
      throw new PurchaseServiceError(
        400,
        "อัปเดตค่าขนส่ง/ค่าอื่นได้เฉพาะ PO ที่รับสินค้าแล้ว",
      );
    }
    if (po.paymentStatus === "PAID") {
      throw new PurchaseServiceError(
        400,
        "PO ที่ชำระครบแล้วไม่สามารถแก้ค่าขนส่ง/ค่าอื่นได้",
      );
    }

    const shippingCost = Math.round(payload.shippingCost);
    const otherCost = Math.round(payload.otherCost);
    const nextGrandTotalBase = po.totalCostBase + shippingCost + otherCost;
    if (nextGrandTotalBase < po.totalPaidBase) {
      throw new PurchaseServiceError(
        400,
        "ยอดรวมใหม่ต่ำกว่ายอดที่ชำระแล้ว กรุณาตรวจสอบค่าขนส่ง/ค่าอื่น",
      );
    }

    const totalExtraCost = shippingCost + otherCost;
    const totalReceivedCostBase = po.items.reduce(
      (sum, item) => sum + item.unitCostBase * Math.max(item.qtyReceived, 0),
      0,
    );

    for (const item of po.items) {
      const qtyReceived = Math.max(item.qtyReceived, 0);
      if (qtyReceived <= 0) {
        await updatePurchaseOrderItemCostFields(item.id, item.unitCostBase, 0, tx);
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

      await updatePurchaseOrderItemCostFields(
        item.id,
        item.unitCostBase,
        landedCostPerUnit,
        tx,
      );
    }

    const nextPaymentStatus = derivePoPaymentStatus(
      po.totalPaidBase,
      nextGrandTotalBase,
    );

    await updatePurchaseOrderFields(
      po.id,
      {
        shippingCost,
        otherCost,
        otherCostNote: payload.otherCostNote?.trim() || null,
        paymentStatus: nextPaymentStatus,
        updatedBy: userId,
        updatedAt: now,
      },
      tx,
    );

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.extra_cost.apply",
          entityType: "purchase_order",
          entityId: po.id,
          metadata: {
            poNumber: po.poNumber,
            previousShippingCost: po.shippingCost,
            previousOtherCost: po.otherCost,
            previousOtherCostNote: po.otherCostNote,
            shippingCost,
            otherCost,
            otherCostNote: payload.otherCostNote?.trim() || null,
            totalPaidBase: po.totalPaidBase,
            nextGrandTotalBase,
          },
          request: audit.request,
        }),
      );
    }

    const updatedPo = await getPurchaseOrderById(po.id, storeId, tx);
    if (!updatedPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: updatedPo,
        },
        tx,
      });
    }

    return updatedPo;
  });
}

export async function reversePurchaseOrderPaymentFlow(params: {
  poId: string;
  paymentId: string;
  storeId: string;
  userId: string;
  payload: ReversePurchaseOrderPaymentInput;
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { poId, paymentId, storeId, userId, payload, audit, idempotency } = params;
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const po = await getPurchaseOrderById(poId, storeId, tx);
    if (!po) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }
    if (po.status !== "RECEIVED") {
      throw new PurchaseServiceError(400, "ย้อนรายการชำระได้เฉพาะ PO ที่รับสินค้าแล้ว");
    }

    const targetPayment = await getPurchaseOrderPaymentById(paymentId, tx);
    if (!targetPayment || targetPayment.purchaseOrderId !== po.id) {
      throw new PurchaseServiceError(404, "ไม่พบรายการชำระที่ต้องการย้อน");
    }
    if (targetPayment.entryType !== "PAYMENT") {
      throw new PurchaseServiceError(400, "ย้อนรายการได้เฉพาะรายการชำระปกติ");
    }
    const hasReversed = await hasPurchaseOrderPaymentReversal(targetPayment.id, tx);
    if (hasReversed) {
      throw new PurchaseServiceError(400, "รายการชำระนี้ถูกย้อนแล้ว");
    }
    if (targetPayment.amountBase > po.totalPaidBase) {
      throw new PurchaseServiceError(400, "ยอดชำระสะสมไม่พอสำหรับการย้อนรายการ");
    }

    await insertPurchaseOrderPayment(
      {
        purchaseOrderId: po.id,
        storeId,
        entryType: "REVERSAL",
        amountBase: targetPayment.amountBase,
        paidAt: now,
        reference: targetPayment.reference,
        note: payload.note?.trim() || `ย้อนรายการชำระ ${targetPayment.id}`,
        reversedPaymentId: targetPayment.id,
        createdBy: userId,
      },
      tx,
    );

    const grandTotalBase = po.totalCostBase + po.shippingCost + po.otherCost;
    const nextTotalPaidBase = po.totalPaidBase - targetPayment.amountBase;
    const normalizedTotalPaidBase = Math.max(0, nextTotalPaidBase);
    const nextPaymentStatus = derivePoPaymentStatus(
      normalizedTotalPaidBase,
      grandTotalBase,
    );
    const latestEntry = await getLatestPurchaseOrderPaymentEntry(po.id, tx);

    await updatePurchaseOrderFields(
      po.id,
      {
        paymentStatus: nextPaymentStatus,
        paidAt: normalizedTotalPaidBase > 0 ? latestEntry?.paidAt ?? now : null,
        paidBy: normalizedTotalPaidBase > 0 ? latestEntry?.createdBy ?? userId : null,
        paymentReference: normalizedTotalPaidBase > 0 ? latestEntry?.reference ?? null : null,
        paymentNote: payload.note?.trim() || null,
        updatedBy: userId,
        updatedAt: now,
      },
      tx,
    );

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.payment.reverse",
          entityType: "purchase_order",
          entityId: po.id,
          metadata: {
            poNumber: po.poNumber,
            reversedPaymentId: targetPayment.id,
            reversedAmountBase: targetPayment.amountBase,
            note: payload.note?.trim() || null,
          },
          request: audit.request,
        }),
      );
    }

    const updatedPo = await getPurchaseOrderById(po.id, storeId, tx);
    if (!updatedPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: updatedPo,
        },
        tx,
      });
    }

    return updatedPo;
  });
}

export async function updatePurchaseOrderFlow(params: {
  poId: string;
  storeId: string;
  userId: string;
  storeCurrency: string;
  payload: UpdatePurchaseOrderInput;
  audit?: PurchaseAuditContext;
  idempotency?: PurchaseIdempotencyContext;
}): Promise<PurchaseOrderView> {
  const { poId, storeId, userId, storeCurrency, payload, audit, idempotency } = params;
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const po = await getPurchaseOrderById(poId, storeId, tx);

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

    const updates: Record<string, unknown> = {
      updatedBy: userId,
      updatedAt: now,
    };

    if (payload.note !== undefined) updates.note = payload.note || null;
    if (payload.expectedAt !== undefined) {
      updates.expectedAt = payload.expectedAt || null;
    }
    if (payload.dueDate !== undefined) {
      updates.dueDate = normalizeIsoDateOrNull(payload.dueDate);
    }
    if (payload.trackingInfo !== undefined) {
      updates.trackingInfo = payload.trackingInfo || null;
    }

    if (isDraft) {
      if (payload.supplierName !== undefined) {
        updates.supplierName = payload.supplierName || null;
      }
      if (payload.supplierContact !== undefined) {
        updates.supplierContact = payload.supplierContact || null;
      }
      if (payload.shippingCost !== undefined) updates.shippingCost = payload.shippingCost;
      if (payload.otherCost !== undefined) updates.otherCost = payload.otherCost;
      if (payload.otherCostNote !== undefined) {
        updates.otherCostNote = payload.otherCostNote || null;
      }

      const nextCurrency = payload.purchaseCurrency ?? po.purchaseCurrency;
      const currencyChanged =
        payload.purchaseCurrency !== undefined &&
        payload.purchaseCurrency !== po.purchaseCurrency;
      const nextRate =
        nextCurrency === storeCurrency
          ? 1
          : payload.exchangeRate !== undefined
            ? Math.round(payload.exchangeRate)
            : currencyChanged
              ? 1
              : Math.round(po.exchangeRate);

      if (payload.purchaseCurrency !== undefined || payload.exchangeRate !== undefined) {
        updates.purchaseCurrency = nextCurrency;
        updates.exchangeRate = nextRate;
        updates.exchangeRateInitial = nextRate;
        if (nextCurrency === storeCurrency) {
          updates.exchangeRateLockedAt = now;
          updates.exchangeRateLockedBy = userId;
          updates.exchangeRateLockNote = null;
        } else if (payload.exchangeRate !== undefined) {
          updates.exchangeRateLockedAt = now;
          updates.exchangeRateLockedBy = userId;
          updates.exchangeRateLockNote = null;
        } else if (payload.purchaseCurrency !== undefined) {
          updates.exchangeRateLockedAt = null;
          updates.exchangeRateLockedBy = null;
          updates.exchangeRateLockNote = null;
        }
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

        await replacePurchaseOrderItems(po.id, items, tx);
      }
    }

    await updatePurchaseOrderFields(po.id, updates, tx);

    if (audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit.actorName,
          actorRole: audit.actorRole,
          action: "po.update",
          entityType: "purchase_order",
          entityId: po.id,
          metadata: {
            poNumber: po.poNumber,
            updatedFields: Object.keys(payload),
          },
          request: audit.request,
        }),
      );
    }

    const updatedPo = await getPurchaseOrderById(po.id, storeId, tx);
    if (!updatedPo) {
      throw new PurchaseServiceError(404, "ไม่พบใบสั่งซื้อ");
    }

    if (idempotency) {
      await markIdempotencySucceeded({
        recordId: idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          purchaseOrder: updatedPo,
        },
        tx,
      });
    }

    return updatedPo;
  });
}

/* ────────────────────────────────────────────────
 * Internal: receive stock + weighted average cost
 * ──────────────────────────────────────────────── */

async function receiveStockAndUpdateCost(
  storeId: string,
  userId: string,
  poId: string,
  poNumber: string,
  items: {
    productId: string;
    qtyReceived?: number;
    qtyOrdered: number;
    landedCostPerUnit: number;
  }[],
  tx: PurchaseRepoTx,
  audit?: PurchaseAuditContext,
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

  await insertInventoryMovementsForPO(movements, tx);

  // Update weighted average cost for each product
  for (const item of items) {
    const qtyReceived = item.qtyReceived ?? item.qtyOrdered;
    if (qtyReceived <= 0) continue;

    const currentOnHand = await getProductCurrentStock(storeId, item.productId, tx);
    const currentCostBase = await getProductCostBase(item.productId, tx);

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

    await updateProductCostBase(item.productId, newCostBase, tx);

    if (newCostBase !== currentCostBase) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: userId,
          actorName: audit?.actorName ?? null,
          actorRole: audit?.actorRole ?? null,
          action: "product.cost.auto_from_po",
          entityType: "product",
          entityId: item.productId,
          metadata: {
            source: "PURCHASE_ORDER",
            poId,
            poNumber,
            qtyReceived,
            landedCostPerUnit: item.landedCostPerUnit,
            previousOnHand,
            previousCostBase: currentCostBase,
            nextCostBase: newCostBase,
            note: `รับสินค้าเข้า ${poNumber}`,
          },
          before: {
            costBase: currentCostBase,
          },
          after: {
            costBase: newCostBase,
          },
          request: audit?.request,
        }),
      );
    }
  }
}
