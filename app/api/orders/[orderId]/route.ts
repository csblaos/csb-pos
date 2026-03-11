import { NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/password";
import { buildRequestContext } from "@/lib/http/request-context";
import { findActiveCancelApproverByEmailFromPostgres } from "@/lib/platform/postgres-auth-rbac";
import { findActiveLaoQrPaymentAccountFromPostgres } from "@/lib/platform/postgres-store-settings";
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
import {
  cancelOrderInPostgres,
  confirmOrderPaidInPostgres,
  markOrderPackedInPostgres,
  markOrderCodReturnedInPostgres,
  markOrderPickedUpUnpaidInPostgres,
  markOrderShippedInPostgres,
  submitOrderForPaymentInPostgres,
  submitOrderPaymentSlipInPostgres,
  updateOrderShippingInPostgres,
} from "@/lib/orders/postgres-write";
import { updateOrderSchema } from "@/lib/orders/validation";
import { getInventoryBalancesByStore, getOrderStockStateForOrder } from "@/lib/inventory/queries";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
import {
  claimIdempotency,
  getIdempotencyKeyFromHeaders,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { invalidateReportsOverviewCache } from "@/server/services/reports.service";
import { invalidateStockOverviewCache } from "@/server/services/stock.service";

const CANCEL_APPROVER_ROLES = new Set(["Owner", "Manager"]);

const verifyCancelApprover = async (
  storeId: string,
  approvalEmailRaw: string,
  approvalPassword: string,
) => {
  const approvalEmail = approvalEmailRaw.trim().toLowerCase();
  const approver = await findActiveCancelApproverByEmailFromPostgres(storeId, approvalEmail);

  if (!approver) {
    throw new RBACError(401, "ข้อมูลผู้อนุมัติไม่ถูกต้อง");
  }

  if (!approver.roleName || !CANCEL_APPROVER_ROLES.has(approver.roleName)) {
    throw new RBACError(403, "ผู้อนุมัติต้องเป็น Owner หรือ Manager");
  }

  const isValidPassword = await verifyPassword(
    approvalPassword,
    approver.passwordHash,
  );
  if (!isValidPassword) {
    throw new RBACError(401, "ข้อมูลผู้อนุมัติไม่ถูกต้อง");
  }

  return approver;
};

type CancelApproverInfo = {
  userId: string;
  name: string | null;
  email: string | null;
  roleName: string | null;
  approvalMode: "MANAGER_PASSWORD" | "SELF_SLIDE";
};

const ensureActionPermission = async (
  userId: string,
  storeId: string,
  action:
    | "submit_for_payment"
    | "submit_payment_slip"
    | "confirm_paid"
    | "mark_picked_up_unpaid"
    | "mark_packed"
    | "mark_shipped"
    | "mark_cod_returned"
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

  if (action === "confirm_paid" || action === "mark_picked_up_unpaid") {
    const allowed = await hasPermission({ userId }, storeId, "orders.mark_paid");
    if (!allowed) {
      throw new RBACError(403, "ไม่มีสิทธิ์ยืนยันการชำระเงิน/รับสินค้า");
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

  if (action === "mark_cod_returned") {
    const allowed = await hasPermission({ userId }, storeId, "orders.cod_return");
    if (!allowed) {
      throw new RBACError(403, "ไม่มีสิทธิ์บันทึก COD ตีกลับ");
    }

    return;
  }

  const [updateAllowed, cancelAllowed, deleteAllowed] = await Promise.all([
    hasPermission({ userId }, storeId, "orders.update"),
    hasPermission({ userId }, storeId, "orders.cancel"),
    hasPermission({ userId }, storeId, "orders.delete"),
  ]);

  if (!updateAllowed && !cancelAllowed && !deleteAllowed) {
    throw new RBACError(403, "ไม่มีสิทธิ์ส่งคำขอยกเลิกออเดอร์");
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

  let requestContext = buildRequestContext(null);
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
    requestContext = buildRequestContext(request);
    const idempotencyKey = getIdempotencyKeyFromHeaders(request.headers);
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
        requestContext,
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

      await updateOrderShippingInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        shippingCarrier: shippingPayload.shippingCarrier?.trim() || null,
        trackingNo: shippingPayload.trackingNo?.trim() || null,
        shippingLabelUrl: nextShippingLabelUrl,
        shippingLabelStatus: nextShippingLabelStatus,
        shippingProvider: nextShippingProvider,
        shippingCost: shippingPayload.shippingCost,
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=update_shipping orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    const orderItems = await getOrderItemsForOrder(order.id);
    const getOrderStockState = () => getOrderStockStateForOrder(storeId, order.id);

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

      await submitOrderForPaymentInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        paymentMethod: order.paymentMethod,
        items: orderItems.map((item) => ({
          productId: item.productId,
          qtyBase: item.qtyBase,
        })),
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=submit_for_payment orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (payload.data.action === "submit_payment_slip") {
      const slipPayload = payload.data;
      if (
        order.status !== "PENDING_PAYMENT" &&
        order.status !== "READY_FOR_PICKUP" &&
        order.status !== "PICKED_UP_PENDING_PAYMENT"
      ) {
        return failAction(
          "INVALID_STATUS",
          "ออเดอร์นี้ยังไม่อยู่ในสถานะรอชำระ/รอรับที่ร้าน",
          400,
          {
            status: order.status,
            orderNo: order.orderNo,
          },
        );
      }

      if (order.paymentMethod !== "LAO_QR") {
        return failAction("INVALID_PAYMENT_METHOD", "ออเดอร์นี้ไม่ได้ชำระผ่าน QR", 400, {
          paymentMethod: order.paymentMethod,
          orderNo: order.orderNo,
        });
      }

      const paymentSlipUrl = slipPayload.paymentSlipUrl.trim();
      const paymentProofSubmittedAt = new Date().toISOString();

      await submitOrderPaymentSlipInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        paymentSlipUrl,
        paymentProofSubmittedAt,
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=submit_payment_slip orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "confirm_paid") {
      const confirmPaidPayload = payload.data;
      const isStandardPendingPaymentConfirm =
        order.paymentMethod !== "COD" &&
        order.status === "PENDING_PAYMENT";
      const isPickupPaymentConfirm =
        order.paymentMethod !== "COD" &&
        order.status === "READY_FOR_PICKUP" &&
        order.paymentStatus !== "PAID";
      const isPickupCompleteAfterPrepaid =
        order.paymentMethod !== "COD" &&
        order.status === "READY_FOR_PICKUP" &&
        order.paymentStatus === "PAID";
      const isPostPickupPendingPaymentConfirm =
        order.paymentMethod !== "COD" &&
        order.status === "PICKED_UP_PENDING_PAYMENT" &&
        order.paymentStatus !== "PAID";
      const isInStoreCreditSettlement =
        order.channel === "WALK_IN" &&
        order.paymentMethod === "ON_CREDIT" &&
        ((order.status === "PENDING_PAYMENT" && order.paymentStatus !== "PAID") ||
          (order.status === "READY_FOR_PICKUP" && order.paymentStatus !== "PAID") ||
          (order.status === "PICKED_UP_PENDING_PAYMENT" && order.paymentStatus !== "PAID"));
      const isCodSettlementAfterShipped =
        order.paymentMethod === "COD" &&
        order.status === "SHIPPED" &&
        order.paymentStatus === "COD_PENDING_SETTLEMENT";

      if (
        !isStandardPendingPaymentConfirm &&
        !isPickupPaymentConfirm &&
        !isPickupCompleteAfterPrepaid &&
        !isPostPickupPendingPaymentConfirm &&
        !isCodSettlementAfterShipped
      ) {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่พร้อมยืนยันชำระ", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      let effectivePaymentMethod = order.paymentMethod;
      let effectivePaymentAccountId = order.paymentAccountId;

      if (isInStoreCreditSettlement) {
        effectivePaymentMethod = confirmPaidPayload.paymentMethod ?? "CASH";
        if (effectivePaymentMethod === "LAO_QR") {
          if (!confirmPaidPayload.paymentAccountId) {
            return failAction(
              "PAYMENT_ACCOUNT_REQUIRED",
              "กรุณาเลือกบัญชี QR สำหรับการรับชำระ",
              400,
              {
                orderNo: order.orderNo,
                paymentMethod: effectivePaymentMethod,
              },
            );
          }

          const paymentAccount = await findActiveLaoQrPaymentAccountFromPostgres(
            storeId,
            confirmPaidPayload.paymentAccountId,
          );

          if (!paymentAccount) {
            return failAction(
              "PAYMENT_ACCOUNT_NOT_FOUND",
              "ไม่พบบัญชี QR ที่เลือก หรือบัญชีนี้ไม่ได้เปิดใช้งาน",
              400,
              {
                orderNo: order.orderNo,
                paymentMethod: effectivePaymentMethod,
              },
            );
          }

          effectivePaymentAccountId = paymentAccount.id;
        } else {
          effectivePaymentAccountId = null;
        }
      }

      const orderStockState =
        isStandardPendingPaymentConfirm || isPostPickupPendingPaymentConfirm
          ? await getOrderStockState()
          : null;
      const shouldOnlyUpdatePaymentAfterReceived =
        isPostPickupPendingPaymentConfirm ||
        (isStandardPendingPaymentConfirm && Boolean(orderStockState?.hasStockOutFromOrder));

      const codAmountToSave =
        isCodSettlementAfterShipped
          ? typeof confirmPaidPayload.codAmount === "number"
            ? confirmPaidPayload.codAmount
            : order.codAmount > 0
              ? order.codAmount
              : order.total
          : null;

      await confirmOrderPaidInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        currentStatus: order.status,
        currentPaymentStatus: order.paymentStatus,
        currentPaymentMethod: order.paymentMethod,
        currentPaymentAccountId: order.paymentAccountId,
        effectivePaymentMethod,
        effectivePaymentAccountId,
        paymentSlipUrl: isInStoreCreditSettlement ? null : order.paymentSlipUrl,
        paymentProofSubmittedAt: isInStoreCreditSettlement
          ? null
          : order.paymentProofSubmittedAt,
        existingPaidAt: order.paidAt,
        codAmountToSave,
        isCodSettlementAfterShipped,
        isPickupPaymentConfirm,
        isPickupCompleteAfterPrepaid,
        shouldOnlyUpdatePaymentAfterReceived,
        items: orderItems.map((item) => ({
          productId: item.productId,
          qtyBase: item.qtyBase,
        })),
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=confirm_paid orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_picked_up_unpaid") {
      const canMarkPickedUp =
        order.paymentMethod !== "COD" &&
        order.status === "READY_FOR_PICKUP" &&
        order.paymentStatus !== "PAID";
      if (!canMarkPickedUp) {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่พร้อมยืนยันรับสินค้า", 400, {
          status: order.status,
          paymentStatus: order.paymentStatus,
          orderNo: order.orderNo,
        });
      }

      const orderStockState = await getOrderStockState();
      if (orderStockState.hasStockOutFromOrder) {
        return failAction("ORDER_ALREADY_PICKED_UP", "ออเดอร์นี้รับสินค้าไปแล้ว", 400, {
          status: order.status,
          paymentStatus: order.paymentStatus,
          orderNo: order.orderNo,
        });
      }

      await markOrderPickedUpUnpaidInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        currentStatus: order.status,
        currentPaymentStatus: order.paymentStatus,
        items: orderItems.map((item) => ({
          productId: item.productId,
          qtyBase: item.qtyBase,
        })),
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=mark_picked_up_unpaid orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_packed") {
      const canPackFromPaid = order.status === "PAID";
      const canPackCodFromPending =
        order.paymentMethod === "COD" &&
        order.status === "PENDING_PAYMENT" &&
        order.paymentStatus === "COD_PENDING_SETTLEMENT";

      if (!canPackFromPaid && !canPackCodFromPending) {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่สามารถจัดของได้", 400, {
          status: order.status,
          orderNo: order.orderNo,
        });
      }

      await markOrderPackedInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        currentStatus: order.status,
        canPackCodFromPending,
        items: orderItems.map((item) => ({
          productId: item.productId,
          qtyBase: item.qtyBase,
        })),
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=mark_packed orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

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

      await markOrderShippedInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=mark_shipped orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_cod_returned") {
      const codReturnPayload = payload.data;
      if (order.paymentMethod !== "COD") {
        return failAction("INVALID_PAYMENT_METHOD", "ออเดอร์นี้ไม่ใช่ COD", 400, {
          paymentMethod: order.paymentMethod,
          orderNo: order.orderNo,
        });
      }

      if (order.status !== "SHIPPED" || order.paymentStatus !== "COD_PENDING_SETTLEMENT") {
        return failAction("INVALID_STATUS", "ออเดอร์นี้ยังไม่อยู่ในสถานะ COD ที่ตีกลับได้", 400, {
          status: order.status,
          paymentStatus: order.paymentStatus,
          orderNo: order.orderNo,
        });
      }

      await markOrderCodReturnedInPostgres({
        storeId,
        orderId: order.id,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        orderNo: order.orderNo,
        currentPaymentStatus: order.paymentStatus,
        currentShippingCost: order.shippingCost,
        currentCodFee: order.codFee,
        normalizedCodFee:
          typeof codReturnPayload.codFee === "number" ? codReturnPayload.codFee : 0,
        normalizedCodReturnNote: codReturnPayload.codReturnNote?.trim() || null,
        items: orderItems.map((item) => ({
          productId: item.productId,
          qtyBase: item.qtyBase,
        })),
        requestContext,
      });

      if (idempotencyRecordId) {
        try {
          await markIdempotencySucceeded({
            recordId: idempotencyRecordId,
            statusCode: 200,
            body: { ok: true },
          });
        } catch (error) {
          console.error(
            `[orders.write.pg] idempotency mark failed action=mark_cod_returned orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (action !== "cancel") {
      return failAction("UNSUPPORTED_ACTION", "ไม่รองรับการทำรายการนี้", 400, {
        action,
        orderNo: order.orderNo,
      });
    }

    const cancelPayload = payload.data;
    const cancelReason = cancelPayload.cancelReason.trim();
    const actorRoleName = session.activeRoleName?.trim() || null;
    const actorIsOwnerOrManager = actorRoleName ? CANCEL_APPROVER_ROLES.has(actorRoleName) : false;

    let approver: CancelApproverInfo;
    if (cancelPayload.approvalMode === "SELF_SLIDE") {
      if (!actorIsOwnerOrManager) {
        throw new RBACError(403, "เฉพาะ Owner/Manager เท่านั้นที่ยืนยันยกเลิกด้วยตนเองได้");
      }
      if (cancelPayload.confirmBySlide !== true) {
        return failAction("CANCEL_CONFIRM_REQUIRED", "กรุณายืนยันการยกเลิกด้วยสไลด์", 400, {
          orderNo: order.orderNo,
        });
      }
      approver = {
        userId: session.userId,
        name: session.displayName,
        email: session.email,
        roleName: actorRoleName,
        approvalMode: "SELF_SLIDE",
      };
    } else {
      const verifiedApprover = await verifyCancelApprover(
        storeId,
        cancelPayload.approvalEmail ?? "",
        cancelPayload.approvalPassword ?? "",
      );
      approver = {
        userId: verifiedApprover.userId,
        name: verifiedApprover.name,
        email: verifiedApprover.email,
        roleName: verifiedApprover.roleName,
        approvalMode: "MANAGER_PASSWORD",
      };
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

    const cancelOrderStockState =
      order.status === "PENDING_PAYMENT" || order.status === "PICKED_UP_PENDING_PAYMENT"
        ? await getOrderStockState()
        : null;
    const shouldReleaseReservedOnCancel =
      order.status === "READY_FOR_PICKUP" ||
      (order.status === "PENDING_PAYMENT" &&
        !cancelOrderStockState?.hasStockOutFromOrder &&
        Boolean(cancelOrderStockState?.hasActiveReserve));
    const shouldReturnStockOnCancel =
      order.status === "PAID" ||
      order.status === "PACKED" ||
      order.status === "SHIPPED" ||
      order.status === "PICKED_UP_PENDING_PAYMENT" ||
      (order.status === "PENDING_PAYMENT" && Boolean(cancelOrderStockState?.hasStockOutFromOrder));
    const nextPaymentStatus =
      order.paymentStatus === "PAID" || order.paymentStatus === "COD_SETTLED"
        ? order.paymentStatus
        : "FAILED";

    await cancelOrderInPostgres({
      storeId,
      orderId: order.id,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      orderNo: order.orderNo,
      currentStatus: order.status,
      currentPaymentStatus: order.paymentStatus,
      nextPaymentStatus,
      cancelReason,
      approverUserId: approver.userId,
      approverName: approver.name,
      approverEmail: approver.email,
      approverRole: approver.roleName,
      approvalMode: approver.approvalMode,
      shouldReleaseReservedOnCancel,
      shouldReturnStockOnCancel,
      items: orderItems.map((item) => ({
        productId: item.productId,
        qtyBase: item.qtyBase,
      })),
      requestContext,
    });

    if (idempotencyRecordId) {
      try {
        await markIdempotencySucceeded({
          recordId: idempotencyRecordId,
          statusCode: 200,
          body: { ok: true },
        });
      } catch (error) {
        console.error(
          `[orders.write.pg] idempotency mark failed action=cancel orderId=${order.id}: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
      }
    }

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
        requestContext,
      });
    }

    return toRBACErrorResponse(error);
  }
}
