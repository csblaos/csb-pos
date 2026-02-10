import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { orderItems, orders } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { createOrderSchema } from "@/lib/orders/validation";
import {
  generateOrderNo,
  getOrderCatalogForStore,
  type OrderListTab,
  listOrdersByTab,
} from "@/lib/orders/queries";

const computeOrderTotals = (payload: {
  subtotal: number;
  discount: number;
  vatEnabled: boolean;
  vatRate: number;
  shippingFeeCharged: number;
}) => {
  const discount = Math.min(payload.discount, payload.subtotal);
  const taxable = Math.max(payload.subtotal - discount, 0);
  const vatAmount = payload.vatEnabled
    ? Math.round((taxable * payload.vatRate) / 10000)
    : 0;
  const total = taxable + vatAmount + payload.shippingFeeCharged;

  return {
    discount,
    vatAmount,
    total,
  };
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
  try {
    const { storeId, session } = await enforcePermission("orders.create");

    const parsed = createOrderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลออเดอร์ไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = parsed.data;

    const catalog = await getOrderCatalogForStore(storeId);

    const productMap = new Map(catalog.products.map((item) => [item.productId, item]));
    const contactMap = new Map(catalog.contacts.map((item) => [item.id, item]));

    const selectedContact = payload.contactId ? contactMap.get(payload.contactId) : null;
    if (payload.channel !== "WALK_IN" && payload.contactId && !selectedContact) {
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
      const lineTotal = qtyBase * product.priceBase;

      return {
        productId: product.productId,
        unitId: unit.unitId,
        qty: item.qty,
        qtyBase,
        priceBaseAtSale: product.priceBase,
        costBaseAtSale: product.costBase,
        lineTotal,
      };
    });

    if (normalizedItems.length === 0) {
      return NextResponse.json({ message: "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
    }

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const totals = computeOrderTotals({
      subtotal,
      discount: payload.discount,
      vatEnabled: catalog.vatEnabled,
      vatRate: catalog.vatRate,
      shippingFeeCharged: payload.shippingFeeCharged,
    });

    const customerName = payload.customerName?.trim() || selectedContact?.displayName || null;
    const customerPhone = payload.customerPhone?.trim() || selectedContact?.phone || null;

    let orderNo = await generateOrderNo(storeId);

    const [existingOrderNo] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.orderNo, orderNo)))
      .limit(1);

    if (existingOrderNo) {
      orderNo = `${orderNo}-${Math.floor(Math.random() * 90 + 10)}`;
    }

    let orderId = "";

    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(orders)
        .values({
          storeId,
          orderNo,
          channel: payload.channel,
          status: "DRAFT",
          contactId: payload.channel === "WALK_IN" ? null : payload.contactId || null,
          customerName,
          customerPhone,
          customerAddress: payload.customerAddress?.trim() || null,
          subtotal,
          discount: totals.discount,
          vatAmount: totals.vatAmount,
          shippingFeeCharged: payload.shippingFeeCharged,
          total: totals.total,
          shippingCarrier: null,
          trackingNo: null,
          shippingCost: payload.shippingCost,
          createdBy: session.userId,
        })
        .returning({ id: orders.id });

      orderId = inserted[0].id;

      await tx.insert(orderItems).values(
        normalizedItems.map((item) => ({
          orderId,
          productId: item.productId,
          unitId: item.unitId,
          qty: item.qty,
          qtyBase: item.qtyBase,
          priceBaseAtSale: item.priceBaseAtSale,
          costBaseAtSale: item.costBaseAtSale,
          lineTotal: item.lineTotal,
        })),
      );

    });

    return NextResponse.json({ ok: true, orderId, orderNo }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ message: "พบสินค้าไม่ถูกต้องในรายการ" }, { status: 400 });
      }

      if (error.message === "UNIT_NOT_ALLOWED") {
        return NextResponse.json({ message: "พบหน่วยสินค้าไม่ถูกต้องในรายการ" }, { status: 400 });
      }
    }

    return toRBACErrorResponse(error);
  }
}
