import { NextResponse } from "next/server";

import { parseStoreCurrency } from "@/lib/finance/store-financial";
import { getInventoryBalancesByStore } from "@/lib/inventory/queries";
import { computeOrderTotals } from "@/lib/orders/totals";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { createOrderSchema } from "@/lib/orders/validation";
import {
  generateOrderNo,
  getOrderCatalogForStore,
  type OrderListTab,
  listOrdersByTab,
} from "@/lib/orders/queries";
import {
  createOrderInPostgres,
  orderNoExistsInPostgres,
} from "@/lib/orders/postgres-write";
import { safeLogAuditEvent } from "@/server/services/audit.service";
import { invalidateDashboardSummaryCache } from "@/server/services/dashboard.service";
import {
  claimIdempotency,
  getIdempotencyKey,
  hashRequestBody,
  markIdempotencySucceeded,
  safeMarkIdempotencyFailed,
} from "@/server/services/idempotency.service";
import { invalidateReportsOverviewCache } from "@/server/services/reports.service";

const invalidateOrderReadCaches = async (storeId: string) => {
  await Promise.all([
    invalidateDashboardSummaryCache(storeId),
    invalidateReportsOverviewCache(storeId),
  ]);
};

export async function GET(request: Request) {
  try {
    const { storeId } = await enforcePermission("orders.view");

    const { searchParams } = new URL(request.url);
    const tabParam = searchParams.get("tab") ?? "ALL";
    const tab: OrderListTab =
      tabParam === "PENDING_PAYMENT" || tabParam === "PAID" || tabParam === "SHIPPED"
        ? tabParam
        : "ALL";
    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "20");

    const pageData = await listOrdersByTab(storeId, tab, {
      page: Number.isFinite(pageParam) ? pageParam : 1,
      pageSize: Number.isFinite(pageSizeParam) ? pageSizeParam : 20,
    });

    return NextResponse.json({ ok: true, orders: pageData.rows, page: pageData });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const action = "order.create";

  let auditContext: {
    storeId: string;
    userId: string;
    actorName: string | null;
    actorRole: string | null;
  } | null = null;
  let idempotencyRecordId: string | null = null;

  try {
    const { storeId, session } = await enforcePermission("orders.create");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };

    const rawBody = await request.text();
    const idempotencyKey = getIdempotencyKey(request);
    const requestHash = hashRequestBody(rawBody);
    let body: unknown;

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      if (idempotencyKey) {
        const claim = await claimIdempotency({
          storeId,
          action,
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

    if (idempotencyKey) {
      const claim = await claimIdempotency({
        storeId,
        action,
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

    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "ข้อมูลออเดอร์ไม่ถูกต้อง" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: "ข้อมูลออเดอร์ไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = parsed.data;
    const checkoutFlow = payload.checkoutFlow ?? "WALK_IN_NOW";
    const isPickupLater = checkoutFlow === "PICKUP_LATER";
    const isWalkInNow = checkoutFlow === "WALK_IN_NOW";
    const isOnlineDelivery = checkoutFlow === "ONLINE_DELIVERY";

    if (isPickupLater && payload.channel !== "WALK_IN") {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "ออเดอร์รับที่ร้านต้องใช้ช่องทาง Walk-in" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "INVALID_PICKUP_CHANNEL",
        metadata: {
          checkoutFlow,
          channel: payload.channel,
        },
        request,
      });
      return NextResponse.json({ message: "ออเดอร์รับที่ร้านต้องใช้ช่องทาง Walk-in" }, { status: 400 });
    }

    const catalog = await getOrderCatalogForStore(storeId);

    const productMap = new Map(catalog.products.map((item) => [item.productId, item]));
    const contactMap = new Map(catalog.contacts.map((item) => [item.id, item]));
    const paymentAccountMap = new Map(
      catalog.paymentAccounts.map((item) => [item.id, item]),
    );

    const selectedContact = payload.contactId ? contactMap.get(payload.contactId) : null;
    if (payload.channel !== "WALK_IN" && payload.contactId && !selectedContact) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 404,
          body: { message: "ไม่พบลูกค้าที่เลือก" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "CONTACT_NOT_FOUND",
        metadata: {
          contactId: payload.contactId,
        },
        request,
      });
      return NextResponse.json({ message: "ไม่พบลูกค้าที่เลือก" }, { status: 404 });
    }

    const normalizedItems = payload.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const unit = product.units.find((unitOption) => unitOption.unitId === item.unitId);
      if (!unit) {
        throw new Error("UNIT_NOT_ALLOWED");
      }

      const qtyBase = item.qty * unit.multiplierToBase;
      const lineTotal = item.qty * unit.pricePerUnit;

      return {
        productId: product.productId,
        unitId: unit.unitId,
        qty: item.qty,
        qtyBase,
        priceBaseAtSale: unit.pricePerUnit,
        costBaseAtSale: product.costBase,
        lineTotal,
      };
    });

    if (normalizedItems.length === 0) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "NO_ITEMS",
        request,
      });
      return NextResponse.json({ message: "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
    }

    const selectedPaymentMethod = payload.paymentMethod ?? "CASH";
    const isOnCreditPayment = selectedPaymentMethod === "ON_CREDIT";
    const isPrepaidAtCreate =
      !isOnlineDelivery && !isOnCreditPayment && selectedPaymentMethod !== "COD";
    const shouldReserveStockOnCreate =
      isPickupLater || isOnlineDelivery || (isWalkInNow && isOnCreditPayment);
    const shouldStockOutOnCreate = isWalkInNow && isPrepaidAtCreate;

    if (shouldReserveStockOnCreate || shouldStockOutOnCreate) {
      const requiredByProduct = new Map<string, number>();
      for (const item of normalizedItems) {
        requiredByProduct.set(
          item.productId,
          (requiredByProduct.get(item.productId) ?? 0) + item.qtyBase,
        );
      }

      const balanceRows = await getInventoryBalancesByStore(storeId);
      const balanceMap = new Map(balanceRows.map((item) => [item.productId, item.available]));

      const insufficient = Array.from(requiredByProduct.entries())
        .map(([productId, requiredQtyBase]) => ({
          productId,
          productName: productMap.get(productId)?.name ?? productId,
          requiredQtyBase,
          availableQtyBase: balanceMap.get(productId) ?? 0,
        }))
        .filter((item) => item.requiredQtyBase > item.availableQtyBase);

      if (insufficient.length > 0) {
        const insufficientMessage = insufficient
          .map((item) => `${item.productName} (ต้องใช้ ${item.requiredQtyBase}, คงเหลือ ${item.availableQtyBase})`)
          .join(", ");
        const stockOperationLabel = shouldStockOutOnCreate ? "ตัดสต็อก" : "จองสต็อก";
        const stockErrorMessage = `สต็อกพร้อมขายไม่พอสำหรับ${stockOperationLabel}: ${insufficientMessage}`;
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: { message: stockErrorMessage },
          });
        }
        await safeLogAuditEvent({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action,
          entityType: "order",
          result: "FAIL",
          reasonCode: shouldStockOutOnCreate ? "INSUFFICIENT_STOCK_OUT" : "INSUFFICIENT_STOCK_RESERVE",
          metadata: {
            checkoutFlow,
            paymentMethod: selectedPaymentMethod,
            insufficientCount: insufficient.length,
          },
          request,
        });
        return NextResponse.json({ message: stockErrorMessage }, { status: 400 });
      }
    }

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const selectedPaymentCurrency = parseStoreCurrency(
      payload.paymentCurrency ?? catalog.storeCurrency,
      parseStoreCurrency(catalog.storeCurrency),
    );
    if (selectedPaymentMethod === "COD" && checkoutFlow !== "ONLINE_DELIVERY") {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "COD ใช้ได้เฉพาะออเดอร์สั่งออนไลน์/จัดส่ง" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "INVALID_COD_PAYMENT_METHOD",
        metadata: {
          checkoutFlow,
          paymentMethod: selectedPaymentMethod,
        },
        request,
      });
      return NextResponse.json({ message: "COD ใช้ได้เฉพาะออเดอร์สั่งออนไลน์/จัดส่ง" }, { status: 400 });
    }
    if (!catalog.supportedCurrencies.includes(selectedPaymentCurrency)) {
      if (idempotencyRecordId) {
        await safeMarkIdempotencyFailed({
          recordId: idempotencyRecordId,
          statusCode: 400,
          body: { message: "ร้านนี้ยังไม่รองรับสกุลเงินที่เลือก" },
        });
      }
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "UNSUPPORTED_CURRENCY",
        metadata: {
          paymentCurrency: selectedPaymentCurrency,
        },
        request,
      });
      return NextResponse.json(
        { message: "ร้านนี้ยังไม่รองรับสกุลเงินที่เลือก" },
        { status: 400 },
      );
    }
    const selectedPaymentAccountId =
      selectedPaymentMethod === "LAO_QR" || selectedPaymentMethod === "BANK_TRANSFER"
        ? payload.paymentAccountId?.trim() || null
        : null;
    if (selectedPaymentMethod === "LAO_QR" || selectedPaymentMethod === "BANK_TRANSFER") {
      if (!selectedPaymentAccountId) {
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: {
              message:
                selectedPaymentMethod === "LAO_QR"
                  ? "กรุณาเลือกบัญชี QR สำหรับออเดอร์นี้"
                  : "กรุณาเลือกบัญชีโอนเงินสำหรับออเดอร์นี้",
            },
          });
        }
        await safeLogAuditEvent({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action,
          entityType: "order",
          result: "FAIL",
          reasonCode: "PAYMENT_ACCOUNT_REQUIRED",
          metadata: {
            paymentMethod: selectedPaymentMethod,
          },
          request,
        });
        return NextResponse.json(
          {
            message:
              selectedPaymentMethod === "LAO_QR"
                ? "กรุณาเลือกบัญชี QR สำหรับออเดอร์นี้"
                : "กรุณาเลือกบัญชีโอนเงินสำหรับออเดอร์นี้",
          },
          { status: 400 },
        );
      }
      const selectedPaymentAccount = paymentAccountMap.get(selectedPaymentAccountId);
      if (!selectedPaymentAccount) {
        const notFoundMessage =
          selectedPaymentMethod === "LAO_QR"
            ? "ไม่พบบัญชี QR ที่เลือกหรือบัญชีถูกปิดใช้งาน"
            : "ไม่พบบัญชีโอนเงินที่เลือกหรือบัญชีถูกปิดใช้งาน";
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: { message: notFoundMessage },
          });
        }
        await safeLogAuditEvent({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action,
          entityType: "order",
          result: "FAIL",
          reasonCode: "PAYMENT_ACCOUNT_NOT_FOUND",
          metadata: {
            paymentAccountId: selectedPaymentAccountId,
          },
          request,
        });
        return NextResponse.json(
          { message: notFoundMessage },
          { status: 400 },
        );
      }
      if (
        selectedPaymentMethod === "LAO_QR" &&
        selectedPaymentAccount.accountType !== "LAO_QR"
      ) {
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: { message: "บัญชีที่เลือกไม่ใช่บัญชี QR" },
          });
        }
        await safeLogAuditEvent({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action,
          entityType: "order",
          result: "FAIL",
          reasonCode: "PAYMENT_ACCOUNT_TYPE_MISMATCH",
          metadata: {
            paymentAccountId: selectedPaymentAccountId,
            expectedType: "LAO_QR",
            actualType: selectedPaymentAccount.accountType,
          },
          request,
        });
        return NextResponse.json({ message: "บัญชีที่เลือกไม่ใช่บัญชี QR" }, { status: 400 });
      }
      if (
        selectedPaymentMethod === "BANK_TRANSFER" &&
        selectedPaymentAccount.accountType !== "BANK"
      ) {
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: { message: "บัญชีที่เลือกไม่ใช่บัญชีธนาคาร" },
          });
        }
        await safeLogAuditEvent({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action,
          entityType: "order",
          result: "FAIL",
          reasonCode: "PAYMENT_ACCOUNT_TYPE_MISMATCH",
          metadata: {
            paymentAccountId: selectedPaymentAccountId,
            expectedType: "BANK",
            actualType: selectedPaymentAccount.accountType,
          },
          request,
        });
        return NextResponse.json({ message: "บัญชีที่เลือกไม่ใช่บัญชีธนาคาร" }, { status: 400 });
      }
    }

    const initialPaymentStatus =
      selectedPaymentMethod === "COD"
        ? "COD_PENDING_SETTLEMENT"
        : isPrepaidAtCreate
          ? "PAID"
          : "UNPAID";
    const initialStatus = isPickupLater
      ? "READY_FOR_PICKUP"
      : shouldStockOutOnCreate
        ? "PAID"
        : shouldReserveStockOnCreate
          ? "PENDING_PAYMENT"
          : "DRAFT";
    const initialPaidAt = isPrepaidAtCreate ? new Date().toISOString() : null;

    const totals = computeOrderTotals({
      subtotal,
      discount: payload.discount,
      vatEnabled: catalog.vatEnabled,
      vatRate: catalog.vatRate,
      vatMode: catalog.vatMode,
      shippingFeeCharged: payload.shippingFeeCharged,
    });

    const customerNameFallback =
      checkoutFlow === "PICKUP_LATER"
        ? "ลูกค้ารับที่ร้าน"
        : payload.channel === "WALK_IN"
          ? "ลูกค้าหน้าร้าน"
          : "ลูกค้าออนไลน์";
    const customerName =
      payload.customerName?.trim() || selectedContact?.displayName || customerNameFallback;
    const customerPhone = payload.customerPhone?.trim() || selectedContact?.phone || null;
    const shippingProvider = payload.shippingProvider?.trim() || null;
    const shippingCarrier = payload.shippingCarrier?.trim() || null;

    let orderNo = await generateOrderNo(storeId);
    const orderNoBase = orderNo;
    let attempts = 0;

    while (await orderNoExistsInPostgres(storeId, orderNo)) {
      attempts += 1;
      const suffix =
        attempts <= 5
          ? `${Math.floor(Math.random() * 90 + 10)}`
          : `${Date.now().toString().slice(-6)}-${attempts}`;
      orderNo = `${orderNoBase}-${suffix}`;
    }

    const { orderId } = await createOrderInPostgres({
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      orderNo,
      channel: payload.channel,
      status: initialStatus,
      contactId: payload.channel === "WALK_IN" ? null : payload.contactId || null,
      customerName,
      customerPhone,
      customerAddress: payload.customerAddress?.trim() || null,
      subtotal,
      discount: totals.discount,
      vatAmount: totals.vatAmount,
      shippingFeeCharged: payload.shippingFeeCharged,
      total: totals.total,
      paymentCurrency: selectedPaymentCurrency,
      paymentMethod: selectedPaymentMethod,
      paymentStatus: initialPaymentStatus,
      paymentAccountId: selectedPaymentAccountId,
      shippingProvider: isOnlineDelivery ? shippingProvider : null,
      shippingCarrier: isOnlineDelivery ? shippingCarrier : null,
      shippingCost: payload.shippingCost,
      paidAt: initialPaidAt,
      checkoutFlow,
      shouldReserveStockOnCreate,
      shouldStockOutOnCreate,
      items: normalizedItems,
      request,
    });

    if (idempotencyRecordId) {
      try {
        await markIdempotencySucceeded({
          recordId: idempotencyRecordId,
          statusCode: 201,
          body: { ok: true, orderId, orderNo },
        });
      } catch (error) {
        console.error(
          `[orders.write.pg] idempotency mark failed action=create orderNo=${orderNo}: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
      }
    }

    await invalidateOrderReadCaches(storeId);

    return NextResponse.json({ ok: true, orderId, orderNo }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: { message: "พบสินค้าไม่ถูกต้องในรายการ" },
          });
        }
        if (auditContext) {
          await safeLogAuditEvent({
            scope: "STORE",
            storeId: auditContext.storeId,
            actorUserId: auditContext.userId,
            actorName: auditContext.actorName,
            actorRole: auditContext.actorRole,
            action,
            entityType: "order",
            result: "FAIL",
            reasonCode: "PRODUCT_NOT_FOUND",
            request,
          });
        }
        return NextResponse.json({ message: "พบสินค้าไม่ถูกต้องในรายการ" }, { status: 400 });
      }

      if (error.message === "UNIT_NOT_ALLOWED") {
        if (idempotencyRecordId) {
          await safeMarkIdempotencyFailed({
            recordId: idempotencyRecordId,
            statusCode: 400,
            body: { message: "พบหน่วยสินค้าไม่ถูกต้องในรายการ" },
          });
        }
        if (auditContext) {
          await safeLogAuditEvent({
            scope: "STORE",
            storeId: auditContext.storeId,
            actorUserId: auditContext.userId,
            actorName: auditContext.actorName,
            actorRole: auditContext.actorRole,
            action,
            entityType: "order",
            result: "FAIL",
            reasonCode: "UNIT_NOT_ALLOWED",
            request,
          });
        }
        return NextResponse.json({ message: "พบหน่วยสินค้าไม่ถูกต้องในรายการ" }, { status: 400 });
      }
    }

    if (idempotencyRecordId) {
      await safeMarkIdempotencyFailed({
        recordId: idempotencyRecordId,
        statusCode: 500,
        body: { message: "เกิดข้อผิดพลาดภายในระบบ" },
      });
    }

    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action,
        entityType: "order",
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }

    return toRBACErrorResponse(error);
  }
}
