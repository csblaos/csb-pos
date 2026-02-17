import { NextResponse } from "next/server";

import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  buildShippingMessageTemplate,
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
    const { storeId } = await enforcePermission("orders.ship");
    const { orderId } = await context.params;

    const order = await getOrderDetail(storeId, orderId);
    if (!order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 404 });
    }

    if (!order.trackingNo && !order.shippingLabelUrl) {
      return NextResponse.json(
        { message: "กรุณากรอกเลขพัสดุหรือแนบลิงก์ป้ายจัดส่งก่อนส่งให้ลูกค้า" },
        { status: 400 },
      );
    }

    const message = buildShippingMessageTemplate({
      orderNo: order.orderNo,
      customerName: order.customerName ?? order.contactDisplayName,
      shippingCarrier: order.shippingCarrier,
      trackingNo: order.trackingNo,
      shippingLabelUrl: order.shippingLabelUrl,
    });

    const customerPhone = order.customerPhone ?? order.contactPhone;
    const within24h = isWithin24Hours(order.contactLastInboundAt);

    if (within24h && order.contactId) {
      console.info("[SEND_SHIPPING_STUB]", {
        orderId: order.id,
        orderNo: order.orderNo,
        channel: order.channel,
        contactId: order.contactId,
        shippingCarrier: order.shippingCarrier,
        trackingNo: order.trackingNo,
      });

      return NextResponse.json({ ok: true, mode: "AUTO" });
    }

    return NextResponse.json({
      ok: false,
      mode: "MANUAL",
      message: "ลูกค้าเกิน 24 ชั่วโมง หรือยังไม่เชื่อมต่ออัตโนมัติ ต้องส่งแบบแมนนวล",
      template: message,
      trackingNo: order.trackingNo,
      shippingLabelUrl: order.shippingLabelUrl,
      waDeepLink: customerPhone ? buildWhatsappDeepLink(customerPhone, message) : null,
      facebookInboxUrl: FACEBOOK_INBOX_URL,
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
