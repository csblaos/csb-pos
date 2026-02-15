import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { inventoryMovements, orders } from "@/lib/db/schema";
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
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
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
  try {
    const { session, storeId } = await enforcePermission("orders.view");
    const { orderId } = await context.params;

    const payload = updateOrderSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลออเดอร์ไม่ถูกต้อง" }, { status: 400 });
    }

    const order = await getOrderDetail(storeId, orderId);
    if (!order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 404 });
    }

    await ensureActionPermission(session.userId, storeId, payload.data.action);

    if (payload.data.action === "update_shipping") {
      if (order.status === "CANCELLED") {
        return NextResponse.json({ message: "ไม่สามารถแก้ไขออเดอร์ที่ยกเลิกแล้ว" }, { status: 400 });
      }

      await db
        .update(orders)
        .set({
          shippingCarrier: payload.data.shippingCarrier?.trim() || null,
          trackingNo: payload.data.trackingNo?.trim() || null,
          shippingCost: payload.data.shippingCost,
        })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    const orderItems = await getOrderItemsForOrder(order.id);

    if (payload.data.action === "submit_for_payment") {
      if (order.status !== "DRAFT") {
        return NextResponse.json({ message: "ออเดอร์นี้ไม่อยู่ในสถานะร่าง" }, { status: 400 });
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

        return NextResponse.json(
          { message: `สต็อกพร้อมขายไม่พอสำหรับการจอง: ${message}` },
          { status: 400 },
        );
      }

      if (orderItems.length > 0) {
        await db.insert(inventoryMovements).values(
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

      await db
        .update(orders)
        .set({
          status: "PENDING_PAYMENT",
        })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (payload.data.action === "submit_payment_slip") {
      if (order.status !== "PENDING_PAYMENT") {
        return NextResponse.json({ message: "ออเดอร์นี้ยังไม่อยู่ในสถานะรอชำระ" }, { status: 400 });
      }

      if (order.paymentMethod !== "LAO_QR") {
        return NextResponse.json({ message: "ออเดอร์นี้ไม่ได้ชำระผ่าน QR" }, { status: 400 });
      }

      await db
        .update(orders)
        .set({
          paymentSlipUrl: payload.data.paymentSlipUrl.trim(),
          paymentProofSubmittedAt: nowIso(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (payload.data.action === "confirm_paid") {
      if (order.status !== "PENDING_PAYMENT") {
        return NextResponse.json({ message: "ออเดอร์นี้ยังไม่พร้อมยืนยันชำระ" }, { status: 400 });
      }

      if (order.paymentMethod === "LAO_QR") {
        const paymentPolicy = await getGlobalPaymentPolicy();
        if (paymentPolicy.requireSlipForLaoQr && !order.paymentSlipUrl) {
          return NextResponse.json(
            { message: "ต้องแนบสลิปก่อนยืนยันชำระสำหรับออเดอร์ QR" },
            { status: 400 },
          );
        }
      }

      if (orderItems.length > 0) {
        await db.insert(inventoryMovements).values(
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

      await db
        .update(orders)
        .set({
          status: "PAID",
          paidAt: nowIso(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (payload.data.action === "mark_packed") {
      if (order.status !== "PAID") {
        return NextResponse.json({ message: "ออเดอร์นี้ยังไม่สามารถจัดของได้" }, { status: 400 });
      }

      await db
        .update(orders)
        .set({ status: "PACKED" })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (payload.data.action === "mark_shipped") {
      if (order.status !== "PACKED") {
        return NextResponse.json({ message: "ออเดอร์นี้ยังไม่พร้อมจัดส่ง" }, { status: 400 });
      }

      await db
        .update(orders)
        .set({
          status: "SHIPPED",
          shippedAt: nowIso(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

      await invalidateOrderCaches(storeId);
      return NextResponse.json({ ok: true });
    }

    if (order.status === "CANCELLED") {
      return NextResponse.json({ message: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 400 });
    }

    if (order.status === "PENDING_PAYMENT" && orderItems.length > 0) {
      await db.insert(inventoryMovements).values(
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
      await db.insert(inventoryMovements).values(
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

    await db
      .update(orders)
      .set({ status: "CANCELLED" })
      .where(and(eq(orders.id, order.id), eq(orders.storeId, storeId)));

    await invalidateOrderCaches(storeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
