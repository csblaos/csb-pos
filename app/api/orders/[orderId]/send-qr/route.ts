import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  buildOrderMessageTemplate,
  buildWhatsappDeepLink,
  FACEBOOK_INBOX_URL,
  isWithin24Hours,
} from "@/lib/orders/messages";
import { getOrderDetail } from "@/lib/orders/queries";

export async function POST(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const { storeId } = await enforcePermission("orders.update");
    const { orderId } = await context.params;

    const order = await getOrderDetail(storeId, orderId);
    if (!order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 404 });
    }

    const message = buildOrderMessageTemplate({
      orderNo: order.orderNo,
      total: order.total,
      customerName: order.customerName ?? order.contactDisplayName,
    });

    if (!order.contactId) {
      return NextResponse.json({ message: "ออเดอร์นี้ไม่มีข้อมูลช่องทางลูกค้า" }, { status: 400 });
    }

    const within24h = isWithin24Hours(order.contactLastInboundAt);

    if (within24h) {
      console.info("[SEND_QR_STUB]", {
        orderId: order.id,
        orderNo: order.orderNo,
        channel: order.channel,
        contactId: order.contactId,
        total: order.total,
      });

      return NextResponse.json({ ok: true, mode: "AUTO" });
    }

    return NextResponse.json({
      ok: false,
      mode: "MANUAL",
      message: "ลูกค้าเกิน 24 ชั่วโมง ต้องส่งแบบแมนนวล",
      template: message,
      waDeepLink: order.contactPhone
        ? buildWhatsappDeepLink(order.contactPhone, message)
        : null,
      facebookInboxUrl: FACEBOOK_INBOX_URL,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
