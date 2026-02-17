import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { auditEvents, inventoryMovements, orders } from "@/lib/db/schema";
import {
  RBACError,
  enforcePermission,
  hasPermission,
  toRBACErrorResponse,
} from "@/lib/rbac/access";
import {
  buildOrderMessageTemplate,
  buildWhatsappDeepLink,
  FACEBOOK_INBOX_URL,
  isWithin24Hours,
} from "@/lib/orders/messages";
import {
  getOrderDetail,
  getOrderItemsForOrder,
} from "@/lib/orders/queries";
import { updateOrderSchema } from "@/lib/orders/validation";
import { getInventoryBalancesByStore } from "@/lib/inventory/queries";
import { getGlobalPaymentPolicy } from "@/lib/system-config/policy";
import { buildAuditEventValues, safeLogAuditEvent } from "@/server/services/audit.service";
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
import {
  claimIdempotency,
  getIdempotencyKey,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { invalidateReportsOverviewCache } from "@/server/services/reports.service";
import { invalidateStockOverviewCache } from "@/server/services/stock.service";

const nowIso = () => new Date().toISOString();

const ensureActionPermission = async (
  userId: string,
  storeId: string,
  action:
    | "submit_for_payment"
    | "submit_payment_slip"
    | "confirm_paid"
    | "mark_packed"
    | "mark_shipped"
    | "cancel"
    | "update_shipping",
) => {
  if (
    action === "submit_for_payment" ||
    action === "update_shipping" ||
    action === "submit_payment_slip"
  ) {
    const allowed = await hasPermission({ userId }, storeId, "orders.update");
    if (!allowed) {
      throw new RBACError(403, "ไม่มีสิทธิ์แก้ไขออเดอร์");
    }

    return;
  }

  if (action === "confirm_paid") {
    const allowed = await hasPermission({ userId }, storeId, "orders.mark_paid");
    if (!allowed) {
      throw new RBACError(403, "ไม่มีสิทธิ์ยืนยันการชำระเงิน");
    }

    return;
  }

  if (action === "mark_packed") {
    const allowed = await hasPermission({ userId }, storeId, "orders.pack");
    if (!allowed) {
      throw new RBACError(403, "ไม่มีสิทธิ์จัดของ");
    }

    return;
  }

  if (action === "mark_shipped") {
    const allowed = await hasPermission({ userId }, storeId, "orders.ship");
    if (!allowed) {
      throw new RBACError(403, "ไม่มีสิทธิ์ยืนยันการจัดส่ง");
    }

    return;
  }

  const [cancelAllowed, deleteAllowed] = await Promise.all([
    hasPermission({ userId }, storeId, "orders.cancel"),
    hasPermission({ userId }, storeId, "orders.delete"),
  ]);

  if (!cancelAllowed && !deleteAllowed) {
    throw new RBACError(403, "ไม่มีสิทธิ์ยกเลิกออเดอร์");
  }
};

const invalidateOrderCaches = async (storeId: string) => {
  await Promise.all([
    invalidateDashboardSummaryCache(storeId),
    invalidateReportsOverviewCache(storeId),
    invalidateStockOverviewCache(storeId),
  ]);
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("orders.view");
    const { orderId } = await context.params;

    const order = await getOrderDetail(storeId, orderId);
    if (!order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 404 });
    }

    const message = buildOrderMessageTemplate({
      orderNo: order.orderNo,
      total: order.total,
      currency: order.paymentCurrency,
      customerName: order.customerName ?? order.contactDisplayName,
    });

    const within24h = isWithin24Hours(order.contactLastInboundAt);
    const waDeepLink = order.contactPhone
      ? buildWhatsappDeepLink(order.contactPhone, message)
      : null;

    return NextResponse.json({
      ok: true,
      order,
      messaging: {
        within24h,
        template: message,
        waDeepLink,
        facebookInboxUrl: FACEBOOK_INBOX_URL,
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const fallbackIdempotencyAction = "order.update";

  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
    orderId: string;
    action: string;
  } | null = null;
  let idempotencyRecordId: string | null = null;

  try {
    const { session, storeId } = await enforcePermission("orders.view");
    const { orderId } = await context.params;
    const rawBody = await request.text();
    const idempotencyKey = getIdempotencyKey(request);
    const requestHash = hashRequestBody(rawBody);

    const logActionFail = async (
      action: string,
      reasonCode: string,
      metadata?: Record<string, unknown>,
    ) =>
      safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: `order.${action}`,
        entityType: "order",
        entityId: orderId,
        result: "FAIL",
        reasonCode,
        metadata,
        request,
      });

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      if (idempotencyKey) {
        const claim = await claimIdempotency({
          storeId,
          action: fallbackIdempotencyAction,
          idempotencyKey,
          requestHash,
          createdBy: session.userId,
        });
        if (claim.kind === "replay") {
          return NextResponse.json(claim.body, { status: claim.statusCode });
        }
        if (claim.kind === "processing") {
          return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
        }
        if (claim.kind === "conflict") {
          return NextResponse.json(
            { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
            { status: 409 },
          );
        }
        idempotencyRecordId = claim.recordId;
        await safeMarkIdempotencyFailed({
          recordId: claim.recordId,
          statusCode: 400,
          body: { message: "รูปแบบ JSON ไม่ถูกต้อง" },
        });
      }
      return NextResponse.json({ message: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = updateOrderSchema.safeParse(body);
    if (!payload.success) {
      if (idempotencyKey && !idempotencyRecordId) {
        const claim = await claimIdempotency({
          storeId,
          action: fallbackIdempotencyAction,
          idempotencyKey,
          requestHash,
          createdBy: session.userId,
        });
        if (claim.kind === "replay") {
          return NextResponse.json(claim.body, { status: claim.statusCode });
        }
        if (claim.kind === "processing") {
          return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
        }
        if (claim.kind === "conflict") {
          return NextResponse.json(
            { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
            { status: 409 },
          );
        }
        idempotencyRecordId = claim.recordId;
      }
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "ข้อมูลออเดอร์ไม่ถูกต้อง" },
        });
      }
      await logActionFail("update", "VALIDATION_ERROR", {
        issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
      });
      return NextResponse.json({ message: "ข้อมูลออเดอร์ไม่ถูกต้อง" }, { status: 400 });
    }
    const action = payload.data.action;

    if (idempotencyKey) {
      const claim = await claimIdempotency({
        storeId,
        action: `order.${action}`,
        idempotencyKey,
        requestHash,
        createdBy: session.userId,
      });
      if (claim.kind === "replay") {
        return NextResponse.json(claim.body, { status: claim.statusCode });
      }
      if (claim.kind === "processing") {
        return NextResponse.json({ message: "คำขอนี้กำลังประมวลผลอยู่" }, { status: 409 });
      }
      if (claim.kind === "conflict") {
        return NextResponse.json(
          { message: "Idempotency-Key นี้ถูกใช้กับข้อมูลคำขออื่นแล้ว" },
          { status: 409 },
        );
      }

      idempotencyRecordId = claim.recordId;
    }

    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      orderId,
      action: `order.${action}`,
    };

    const failAction = async (
      reasonCode: string,
      message: string,
      status: number,
      metadata?: Record<string, unknown>,
      actionName = action,
    ) => {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: status,
          body: { message },
        });
      }
      await logActionFail(actionName, reasonCode, metadata);
      return NextResponse.json({ message }, { status });
    };

    const order = await getOrderDetail(storeId, orderId);
    if (!order) {
      return failAction("ORDER_NOT_FOUND", "ไม่พบออเดอร์", 404);
    }

    await ensureActionPermission(session.userId, storeId, action);

    if (payload.data.action === "update_shipping") {
      const shippingPayload = payload.data;
      if (order.status === "CANCELLED") {
        return failAction(
          "ORDER_ALREADY_CANCELLED",
          "ไม่สามารถแก้ไขออเดอร์ที่ยกเลิกแล้ว",
          400,
          {
            status: order.status,
            orderNo: order.orderNo,
          },
        );
      }

      const nextShippingLabelUrl = shippingPayload.shippingLabelUrl?.trim() || null;
      const nextShippingLabelStatus = nextShippingLabelUrl
        ? "READY"
        : order.shippingLabelStatus === "READY"
          ? "NONE"
          : order.shippingLabelStatus;
      const nextShippingProvider =
        nextShippingLabelUrl && !order.shippingProvider
          ? "MANUAL"
          : order.shippingProvider;

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({
            shippingCarrier: shippingPayload.shippingCarrier?.trim() || null,
            trackingNo: shippingPayload.trackingNo?.trim() || null,
            shippingLabelUrl: nextShippingLabelUrl,
            shippingLabelStatus: nextShippingLabelStatus,
            shippingProvider: nextShippingProvider,
            shippingCost: shippingPayload.shippingCost,
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.update_shipping",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              shippingCarrier: shippingPayload.shippingCarrier?.trim() || null,
              trackingNo: shippingPayload.trackingNo?.trim() || null,
              shippingLabelUrl: nextShippingLabelUrl,
              shippingLabelStatus: nextShippingLabelStatus,
              shippingProvider: nextShippingProvider,
              shippingCost: shippingPayload.shippingCost,
            },
            request,
          }),
        );

        if (idempotencyRecordId) {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
            tx,
          });
        }
      });
      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    const orderItems = await getOrderItemsForOrder(order.id);

    if (action === "submit_for_payment") {
      if (order.status !== "DRAFT") {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ไม่อยู่ในสถานะร่าง", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      const requiredByProduct = new Map<string, number>();
      for (const item of orderItems) {
        requiredByProduct.set(
          item.productId,
          (requiredByProduct.get(item.productId) ?? 0) + item.qtyBase,
        );
      }

      const balanceRows = await getInventoryBalancesByStore(storeId);
      const balanceMap = new Map(balanceRows.map((item) => [item.productId, item.available]));

      const insufficient = order.items
        .map((item) => ({
          productId: item.productId,
          productName: item.productName,
          requiredQtyBase: requiredByProduct.get(item.productId) ?? 0,
          availableQtyBase: balanceMap.get(item.productId) ?? 0,
        }))
        .filter(
          (item, index, array) =>
            item.requiredQtyBase > item.availableQtyBase &&
            array.findIndex((x) => x.productId === item.productId) === index,
        );

      if (insufficient.length > 0) {
        const message = insufficient
          .map((item) => `${item.productName} (ต้องใช้ ${item.requiredQtyBase}, คงเหลือ ${item.availableQtyBase})`)
          .join(", ");
        return failAction(
          "INSUFFICIENT_STOCK",
          `สต็อกพร้อมขายไม่พอสำหรับการจอง: ${message}`,
          400,
          {
            orderNo: order.orderNo,
            insufficientCount: insufficient.length,
          },
        );
      }

      await db.transaction(async (tx) => {
        if (orderItems.length > 0) {
          await tx.insert(inventoryMovements).values(
            orderItems.map((item) => ({
              storeId,
              productId: item.productId,
              type: "RESERVE" as const,
              qtyBase: item.qtyBase,
              refType: "ORDER" as const,
              refId: order.id,
              note: `จองสต็อกสำหรับออเดอร์ ${order.orderNo}`,
              createdBy: session.userId,
            })),
          );
        }

        await tx
          .update(orders)
          .set({
            status: "PENDING_PAYMENT",
            paymentStatus:
              order.paymentMethod === "COD" ? "COD_PENDING_SETTLEMENT" : "UNPAID",
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.submit_for_payment",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              fromStatus: "DRAFT",
              toStatus: "PENDING_PAYMENT",
              itemCount: orderItems.length,
            },
            request,
          }),
        );

        if (idempotencyRecordId) {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
            tx,
          });
        }
      });
      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (payload.data.action === "submit_payment_slip") {
      const slipPayload = payload.data;
      if (order.status !== "PENDING_PAYMENT") {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่อยู่ในสถานะรอชำระ", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      if (order.paymentMethod !== "LAO_QR") {
        return failAction("INVALID_PAYMENT_METHOD", "ออเดอร์นี้ไม่ได้ชำระผ่าน QR", 400, {
          paymentMethod: order.paymentMethod,
          orderNo: order.orderNo,
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({
            paymentSlipUrl: slipPayload.paymentSlipUrl.trim(),
            paymentProofSubmittedAt: nowIso(),
            paymentStatus: "PENDING_PROOF",
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.submit_payment_slip",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              status: order.status,
            },
            request,
          }),
        );

        if (idempotencyRecordId) {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
            tx,
          });
        }
      });
      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "confirm_paid") {
      if (order.status !== "PENDING_PAYMENT") {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่พร้อมยืนยันชำระ", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      if (order.paymentMethod === "LAO_QR") {
        const paymentPolicy = await getGlobalPaymentPolicy();
        if (paymentPolicy.requireSlipForLaoQr && !order.paymentSlipUrl) {
          return failAction(
            "SLIP_REQUIRED",
            "ต้องแนบสลิปก่อนยืนยันชำระสำหรับออเดอร์ QR",
            400,
            {
              orderNo: order.orderNo,
              paymentMethod: order.paymentMethod,
            },
          );
        }
      }

      await db.transaction(async (tx) => {
        if (orderItems.length > 0) {
          await tx.insert(inventoryMovements).values(
            orderItems.flatMap((item) => [
              {
                storeId,
                productId: item.productId,
                type: "RELEASE" as const,
                qtyBase: item.qtyBase,
                refType: "ORDER" as const,
                refId: order.id,
                note: `ปล่อยจองสต็อกเมื่อชำระเงิน ${order.orderNo}`,
                createdBy: session.userId,
              },
              {
                storeId,
                productId: item.productId,
                type: "OUT" as const,
                qtyBase: item.qtyBase,
                refType: "ORDER" as const,
                refId: order.id,
                note: `ตัดสต็อกเมื่อชำระเงิน ${order.orderNo}`,
                createdBy: session.userId,
              },
            ]),
          );
        }

        await tx
          .update(orders)
          .set({
            status: "PAID",
            paymentStatus: "PAID",
            paidAt: nowIso(),
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.confirm_paid",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              fromStatus: "PENDING_PAYMENT",
              toStatus: "PAID",
              stockOutItems: orderItems.length,
            },
            request,
          }),
        );

        if (idempotencyRecordId) {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
            tx,
          });
        }
      });
      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_packed") {
      if (order.status !== "PAID") {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่สามารถจัดของได้", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ status: "PACKED" })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.mark_packed",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              fromStatus: "PAID",
              toStatus: "PACKED",
            },
            request,
          }),
        );

        if (idempotencyRecordId) {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
            tx,
          });
        }
      });
      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_shipped") {
      if (order.status !== "PACKED") {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่พร้อมจัดส่ง", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({
            status: "SHIPPED",
            shippedAt: nowIso(),
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.mark_shipped",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              fromStatus: "PACKED",
              toStatus: "SHIPPED",
            },
            request,
          }),
        );

        if (idempotencyRecordId) {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
            tx,
          });
        }
      });
      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (order.status === "CANCELLED") {
      return failAction(
        "ORDER_ALREADY_CANCELLED",
        "ออเดอร์นี้ถูกยกเลิกแล้ว",
        400,
        {
          status: order.status,
          orderNo: order.orderNo,
        },
        "cancel",
      );
    }

    const stockReleaseItems = order.status === "PENDING_PAYMENT" ? orderItems.length : 0;
    const stockReturnItems =
      order.status === "PAID" || order.status === "PACKED" || order.status === "SHIPPED"
        ? orderItems.length
        : 0;

    const nextPaymentStatus =
      order.paymentStatus === "PAID" || order.paymentStatus === "COD_SETTLED"
        ? order.paymentStatus
        : "FAILED";

    await db.transaction(async (tx) => {
      if (order.status === "PENDING_PAYMENT" && orderItems.length > 0) {
        await tx.insert(inventoryMovements).values(
          orderItems.map((item) => ({
            storeId,
            productId: item.productId,
            type: "RELEASE" as const,
            qtyBase: item.qtyBase,
            refType: "ORDER" as const,
            refId: order.id,
            note: `ปล่อยจองสต็อกจากการยกเลิก ${order.orderNo}`,
            createdBy: session.userId,
          })),
        );
      }

      if (
        (order.status === "PAID" || order.status === "PACKED" || order.status === "SHIPPED") &&
        orderItems.length > 0
      ) {
        await tx.insert(inventoryMovements).values(
          orderItems.map((item) => ({
            storeId,
            productId: item.productId,
            type: "RETURN" as const,
            qtyBase: item.qtyBase,
            refType: "RETURN" as const,
            refId: order.id,
            note: `คืนสต็อกจากการยกเลิก ${order.orderNo}`,
            createdBy: session.userId,
          })),
        );
      }

      await tx
        .update(orders)
        .set({ status: "CANCELLED", paymentStatus: nextPaymentStatus })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action: "order.cancel",
          entityType: "order",
          entityId: order.id,
          metadata: {
            orderNo: order.orderNo,
            fromStatus: order.status,
            toStatus: "CANCELLED",
            stockReleaseItems,
            stockReturnItems,
          },
          request,
        }),
      );

      if (idempotencyRecordId) {
        await markIdempotencySucceeded({
          recordId: idempotencyRecordId,
          statusCode: 200,
          body: { ok: true },
          tx,
        });
      }
    });
    await invalidateOrderCaches(storeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (idempotencyRecordId) {
      const statusCode = error instanceof RBACError ? error.status : 500;
      await safeMarkIdempotencyFailed({
        recordId: idempotencyRecordId,
        statusCode,
        body: {
          message:
            error instanceof RBACError
              ? error.message
              : "เกิดข้อผิดพลาดภายในระบบ",
        },
      });
    }

    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: auditContext.action,
        entityType: "order",
        entityId: auditContext.orderId,
        result: "FAIL",
        reasonCode: error instanceof RBACError ? "FORBIDDEN" : "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }

    return toRBACErrorResponse(error);
  }
}
