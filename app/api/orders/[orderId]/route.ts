import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  inventoryMovements,
  orders,
  roles,
  storePaymentAccounts,
  storeMembers,
  users,
} from "@/lib/db/schema";
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
  isPostgresSubmitPaymentSlipEnabled,
  isPostgresUpdateShippingEnabled,
  submitOrderPaymentSlipInPostgres,
  updateOrderShippingInPostgres,
} from "@/lib/orders/postgres-write";
import { updateOrderSchema } from "@/lib/orders/validation";
import { getInventoryBalancesByStore } from "@/lib/inventory/queries";
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
const CANCEL_APPROVER_ROLES = new Set(["Owner", "Manager"]);

const verifyCancelApprover = async (
  storeId: string,
  approvalEmailRaw: string,
  approvalPassword: string,
) => {
  const approvalEmail = approvalEmailRaw.trim().toLowerCase();
  const [approver] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(
      storeMembers,
      and(
        eq(storeMembers.userId, users.id),
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.status, "ACTIVE"),
      ),
    )
    .innerJoin(
      roles,
      and(
        eq(storeMembers.roleId, roles.id),
        eq(storeMembers.storeId, roles.storeId),
      ),
    )
    .where(eq(users.email, approvalEmail))
    .limit(1);

  if (!approver) {
    throw new RBACError(401, "ข้อมูลผู้อนุมัติไม่ถูกต้อง");
  }

  if (!CANCEL_APPROVER_ROLES.has(approver.roleName)) {
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

      if (isPostgresUpdateShippingEnabled()) {
        try {
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
            request,
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
        } catch (error) {
          console.warn(
            `[orders.write.pg] fallback to turso for update_shipping orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

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
    const getOrderStockState = async () => {
      const movementRows = await db
        .select({ type: inventoryMovements.type })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.storeId, storeId),
            eq(inventoryMovements.refType, "ORDER"),
            eq(inventoryMovements.refId, order.id),
          ),
        );

      let reserveCount = 0;
      let releaseCount = 0;
      let outCount = 0;
      for (const row of movementRows) {
        if (row.type === "RESERVE") {
          reserveCount += 1;
          continue;
        }
        if (row.type === "RELEASE") {
          releaseCount += 1;
          continue;
        }
        if (row.type === "OUT") {
          outCount += 1;
        }
      }

      return {
        hasStockOutFromOrder: outCount > 0,
        hasActiveReserve: reserveCount > releaseCount,
      };
    };

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
      const paymentProofSubmittedAt = nowIso();

      if (isPostgresSubmitPaymentSlipEnabled()) {
        try {
          await submitOrderPaymentSlipInPostgres({
            storeId,
            orderId: order.id,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            orderNo: order.orderNo,
            paymentSlipUrl,
            paymentProofSubmittedAt,
            request,
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
        } catch (error) {
          console.warn(
            `[orders.write.pg] fallback to turso for submit_payment_slip orderId=${order.id}: ${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({
            paymentSlipUrl,
            paymentProofSubmittedAt,
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

          const [paymentAccount] = await db
            .select({
              id: storePaymentAccounts.id,
            })
            .from(storePaymentAccounts)
            .where(
              and(
                eq(storePaymentAccounts.id, confirmPaidPayload.paymentAccountId),
                eq(storePaymentAccounts.storeId, storeId),
                eq(storePaymentAccounts.accountType, "LAO_QR"),
                eq(storePaymentAccounts.isActive, true),
              ),
            )
            .limit(1);

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

      await db.transaction(async (tx) => {
        if (isCodSettlementAfterShipped) {
          const now = nowIso();
          const codAmountToSave =
            typeof confirmPaidPayload.codAmount === "number"
              ? confirmPaidPayload.codAmount
              : order.codAmount > 0
                ? order.codAmount
                : order.total;
          await tx
            .update(orders)
            .set({
              paymentStatus: "COD_SETTLED",
              codSettledAt: now,
              paidAt: order.paidAt ?? now,
              codAmount: codAmountToSave,
            })
            .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));
        } else if (isPickupPaymentConfirm) {
          await tx
            .update(orders)
            .set({
              paymentStatus: "PAID",
              paymentMethod: effectivePaymentMethod,
              paymentAccountId: effectivePaymentAccountId,
              paymentSlipUrl: isInStoreCreditSettlement ? null : order.paymentSlipUrl,
              paymentProofSubmittedAt: isInStoreCreditSettlement
                ? null
                : order.paymentProofSubmittedAt,
              paidAt: order.paidAt ?? nowIso(),
            })
            .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));
        } else if (shouldOnlyUpdatePaymentAfterReceived) {
          await tx
            .update(orders)
            .set({
              status: "PAID",
              paymentStatus: "PAID",
              paymentMethod: effectivePaymentMethod,
              paymentAccountId: effectivePaymentAccountId,
              paymentSlipUrl: isInStoreCreditSettlement ? null : order.paymentSlipUrl,
              paymentProofSubmittedAt: isInStoreCreditSettlement
                ? null
                : order.paymentProofSubmittedAt,
              paidAt: order.paidAt ?? nowIso(),
            })
            .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));
        } else {
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
                  note: isPickupCompleteAfterPrepaid
                    ? `ปล่อยจองสต็อกเมื่อรับสินค้าหน้าร้าน ${order.orderNo}`
                    : `ปล่อยจองสต็อกเมื่อชำระเงิน ${order.orderNo}`,
                  createdBy: session.userId,
                },
                {
                  storeId,
                  productId: item.productId,
                  type: "OUT" as const,
                  qtyBase: item.qtyBase,
                  refType: "ORDER" as const,
                  refId: order.id,
                  note: isPickupCompleteAfterPrepaid
                    ? `ตัดสต็อกเมื่อรับสินค้าหน้าร้าน ${order.orderNo}`
                    : `ตัดสต็อกเมื่อชำระเงิน ${order.orderNo}`,
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
              paymentMethod: effectivePaymentMethod,
              paymentAccountId: effectivePaymentAccountId,
              paidAt: order.paidAt ?? nowIso(),
            })
            .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));
        }

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
              fromStatus: order.status,
              toStatus:
                isCodSettlementAfterShipped || isPickupPaymentConfirm ? order.status : "PAID",
              fromPaymentStatus: order.paymentStatus,
              toPaymentStatus: isCodSettlementAfterShipped ? "COD_SETTLED" : "PAID",
              stockOutItems:
                isCodSettlementAfterShipped || isPickupPaymentConfirm || shouldOnlyUpdatePaymentAfterReceived
                  ? 0
                  : orderItems.length,
              pickupCompletion: isPickupCompleteAfterPrepaid,
              pickupPaymentOnly: isPickupPaymentConfirm,
              postPickupSettlement: shouldOnlyUpdatePaymentAfterReceived,
              fromPaymentMethod: order.paymentMethod,
              toPaymentMethod: effectivePaymentMethod,
              fromPaymentAccountId: order.paymentAccountId,
              toPaymentAccountId: effectivePaymentAccountId,
              codAmount:
                isCodSettlementAfterShipped && typeof confirmPaidPayload.codAmount === "number"
                  ? confirmPaidPayload.codAmount
                  : undefined,
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
                note: `ปล่อยจองสต็อกเมื่อรับสินค้าแบบค้างจ่าย ${order.orderNo}`,
                createdBy: session.userId,
              },
              {
                storeId,
                productId: item.productId,
                type: "OUT" as const,
                qtyBase: item.qtyBase,
                refType: "ORDER" as const,
                refId: order.id,
                note: `ตัดสต็อกเมื่อรับสินค้าแบบค้างจ่าย ${order.orderNo}`,
                createdBy: session.userId,
              },
            ]),
          );
        }

        await tx
          .update(orders)
          .set({
            status: "PICKED_UP_PENDING_PAYMENT",
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.mark_picked_up_unpaid",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              fromStatus: order.status,
              toStatus: "PICKED_UP_PENDING_PAYMENT",
              paymentStatus: order.paymentStatus,
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

      await db.transaction(async (tx) => {
        if (canPackCodFromPending && orderItems.length > 0) {
          await tx.insert(inventoryMovements).values(
            orderItems.flatMap((item) => [
              {
                storeId,
                productId: item.productId,
                type: "RELEASE" as const,
                qtyBase: item.qtyBase,
                refType: "ORDER" as const,
                refId: order.id,
                note: `ปล่อยจองสต็อกเมื่อแพ็ก COD ${order.orderNo}`,
                createdBy: session.userId,
              },
              {
                storeId,
                productId: item.productId,
                type: "OUT" as const,
                qtyBase: item.qtyBase,
                refType: "ORDER" as const,
                refId: order.id,
                note: `ตัดสต็อกเมื่อแพ็ก COD ${order.orderNo}`,
                createdBy: session.userId,
              },
            ]),
          );
        }

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
              fromStatus: order.status,
              toStatus: "PACKED",
              stockOutItems: canPackCodFromPending ? orderItems.length : 0,
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

      await db.transaction(async (tx) => {
        const normalizedCodFee =
          typeof codReturnPayload.codFee === "number" ? codReturnPayload.codFee : 0;
        const nextCodFee = Math.max(0, order.codFee) + normalizedCodFee;
        const nextShippingCost = Math.max(0, order.shippingCost) + normalizedCodFee;
        const normalizedCodReturnNote = codReturnPayload.codReturnNote?.trim() || null;

        if (orderItems.length > 0) {
          await tx.insert(inventoryMovements).values(
            orderItems.map((item) => ({
              storeId,
              productId: item.productId,
              type: "RETURN" as const,
              qtyBase: item.qtyBase,
              refType: "RETURN" as const,
              refId: order.id,
              note: `รับสินค้าตีกลับ COD ${order.orderNo}`,
              createdBy: session.userId,
            })),
          );
        }

        await tx
          .update(orders)
          .set({
            status: "COD_RETURNED",
            paymentStatus: "FAILED",
            codAmount: 0,
            codSettledAt: null,
            codFee: nextCodFee,
            codReturnNote: normalizedCodReturnNote,
            shippingCost: nextShippingCost,
            codReturnedAt: nowIso(),
          })
          .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

        await tx.insert(auditEvents).values(
          buildAuditEventValues({
            scope: "STORE",
            storeId,
            actorUserId: session.userId,
            actorName: session.displayName,
            actorRole: session.activeRoleName,
            action: "order.mark_cod_returned",
            entityType: "order",
            entityId: order.id,
            metadata: {
              orderNo: order.orderNo,
              fromStatus: "SHIPPED",
              toStatus: "COD_RETURNED",
              fromPaymentStatus: order.paymentStatus,
              toPaymentStatus: "FAILED",
              stockReturnItems: orderItems.length,
              codFeeAdded: normalizedCodFee,
              codFeeTotal: nextCodFee,
              codReturnNote: normalizedCodReturnNote,
              shippingCostTotal: nextShippingCost,
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
    const stockReleaseItems = shouldReleaseReservedOnCancel ? orderItems.length : 0;
    const stockReturnItems = shouldReturnStockOnCancel ? orderItems.length : 0;

    const nextPaymentStatus =
      order.paymentStatus === "PAID" || order.paymentStatus === "COD_SETTLED"
        ? order.paymentStatus
        : "FAILED";

    await db.transaction(async (tx) => {
      if (shouldReleaseReservedOnCancel && orderItems.length > 0) {
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

      if (shouldReturnStockOnCancel && orderItems.length > 0) {
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
            cancelReason,
            approvedByUserId: approver.userId,
            approvedByName: approver.name,
            approvedByEmail: approver.email,
            approvedByRole: approver.roleName,
            approvalMode: approver.approvalMode,
            selfApproved: approver.approvalMode === "SELF_SLIDE",
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
