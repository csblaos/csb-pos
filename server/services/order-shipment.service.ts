import "server-only";

import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { buildAuditEventValues } from "@/server/services/audit.service";
import { markIdempotencySucceeded } from "@/server/services/idempotency.service";
import {
  findLatestOrderShipment,
  findOrderForShipmentLabel,
  insertOrderShipment,
  updateOrderWithShipmentLabel,
} from "@/server/repositories/order-shipment.repo";
import {
  createShippingLabelByProvider,
  ShippingProviderError,
} from "@/lib/shipping/provider";

type ShipmentAuditContext = {
  actorName: string | null;
  actorRole: string | null;
  request?: Request;
};

type ShipmentIdempotencyContext = {
  recordId: string;
};

export class OrderShipmentServiceError extends Error {
  status: number;
  reasonCode: string;

  constructor(status: number, reasonCode: string, message: string) {
    super(message);
    this.status = status;
    this.reasonCode = reasonCode;
  }
}

type CreateShipmentLabelInput = {
  provider?: string | null;
  forceRegenerate?: boolean;
};

export type CreatedShipmentLabelResult = {
  reused: boolean;
  shipment: {
    shipmentId: string | null;
    provider: string;
    trackingNo: string;
    labelUrl: string;
    providerRequestId: string;
    createdAt?: string | null;
  };
};

const normalizeProvider = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "MANUAL";
  }
  return trimmed.toUpperCase().slice(0, 60);
};

export async function createOrderShipmentLabel(params: {
  storeId: string;
  orderId: string;
  userId: string;
  payload?: CreateShipmentLabelInput;
  audit?: ShipmentAuditContext;
  idempotency?: ShipmentIdempotencyContext;
}): Promise<CreatedShipmentLabelResult> {
  const provider = normalizeProvider(params.payload?.provider);
  const forceRegenerate = params.payload?.forceRegenerate ?? false;

  const order = await findOrderForShipmentLabel(params.storeId, params.orderId);
  if (!order) {
    throw new OrderShipmentServiceError(404, "ORDER_NOT_FOUND", "ไม่พบออเดอร์");
  }

  if (order.status === "CANCELLED") {
    throw new OrderShipmentServiceError(
      400,
      "ORDER_CANCELLED",
      "ออเดอร์ที่ยกเลิกแล้วไม่สามารถสร้างป้ายจัดส่งได้",
    );
  }

  if (order.status !== "PACKED" && order.status !== "SHIPPED") {
    throw new OrderShipmentServiceError(
      400,
      "INVALID_STATUS",
      "สามารถสร้างป้ายจัดส่งได้เฉพาะออเดอร์ที่แพ็กแล้วหรือจัดส่งแล้ว",
    );
  }

  if (!order.customerAddress || !order.customerAddress.trim()) {
    throw new OrderShipmentServiceError(
      400,
      "ADDRESS_REQUIRED",
      "กรุณาระบุที่อยู่ลูกค้าก่อนสร้างป้ายจัดส่ง",
    );
  }

  if (!forceRegenerate && order.shippingLabelStatus === "READY" && order.shippingLabelUrl) {
    const latest = await findLatestOrderShipment(order.id);
    const reusedPayload = {
      reused: true,
      shipment: {
        shipmentId: latest?.id ?? null,
        provider: latest?.provider ?? order.shippingProvider ?? provider,
        trackingNo: latest?.trackingNo ?? order.trackingNo ?? "-",
        labelUrl: latest?.labelUrl ?? order.shippingLabelUrl,
        providerRequestId: latest?.providerRequestId ?? order.shippingRequestId ?? "-",
        createdAt: latest?.createdAt ?? null,
      },
    } satisfies CreatedShipmentLabelResult;

    if (params.audit) {
      await db.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId: params.storeId,
          actorUserId: params.userId,
          actorName: params.audit.actorName,
          actorRole: params.audit.actorRole,
          action: "order.create_shipping_label",
          entityType: "order_shipment",
          entityId: reusedPayload.shipment.shipmentId ?? order.id,
          metadata: {
            orderId: order.id,
            orderNo: order.orderNo,
            provider: reusedPayload.shipment.provider,
            trackingNo: reusedPayload.shipment.trackingNo,
            providerRequestId: reusedPayload.shipment.providerRequestId,
            reused: true,
          },
          request: params.audit.request,
        }),
      );
    }

    if (params.idempotency) {
      await markIdempotencySucceeded({
        recordId: params.idempotency.recordId,
        statusCode: 200,
        body: { ok: true, ...reusedPayload },
      });
    }

    return reusedPayload;
  }

  let providerResult;
  try {
    providerResult = await createShippingLabelByProvider({
      provider,
      storeId: params.storeId,
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      customerName: order.customerName,
      customerAddress: order.customerAddress,
      customerPhone: order.customerPhone,
      forceRegenerate,
      idempotencyKey: params.idempotency?.recordId ?? `${order.id}:${Date.now()}`,
    });
  } catch (error) {
    if (error instanceof ShippingProviderError) {
      throw new OrderShipmentServiceError(error.status, error.reasonCode, error.message);
    }
    throw new OrderShipmentServiceError(
      502,
      "PROVIDER_ERROR",
      "สร้างป้ายจัดส่งกับผู้ให้บริการไม่สำเร็จ",
    );
  }

  const shipment = await db.transaction(async (tx) => {
    const createdShipment = await insertOrderShipment(
      {
        orderId: order.id,
        storeId: params.storeId,
        provider: providerResult.provider,
        status: "READY",
        trackingNo: providerResult.trackingNo,
        labelUrl: providerResult.labelUrl,
        labelFileKey: null,
        providerRequestId: providerResult.providerRequestId,
        providerResponse: JSON.stringify(providerResult.raw),
        lastError: null,
        createdBy: params.userId,
      },
      tx,
    );

    await updateOrderWithShipmentLabel(
      {
        orderId: order.id,
        storeId: params.storeId,
        provider: providerResult.provider,
        trackingNo: providerResult.trackingNo,
        labelUrl: providerResult.labelUrl,
        providerRequestId: providerResult.providerRequestId,
        shippingCarrier:
          order.shippingCarrier?.trim() ||
          providerResult.shippingCarrier ||
          providerResult.provider,
      },
      tx,
    );

    if (params.audit) {
      await tx.insert(auditEvents).values(
        buildAuditEventValues({
          scope: "STORE",
          storeId: params.storeId,
          actorUserId: params.userId,
          actorName: params.audit.actorName,
          actorRole: params.audit.actorRole,
          action: "order.create_shipping_label",
          entityType: "order_shipment",
          entityId: createdShipment?.id ?? order.id,
          metadata: {
            orderId: order.id,
            orderNo: order.orderNo,
            provider: providerResult.provider,
            trackingNo: providerResult.trackingNo,
            providerRequestId: providerResult.providerRequestId,
            reused: false,
          },
          request: params.audit.request,
        }),
      );
    }

    if (params.idempotency) {
      await markIdempotencySucceeded({
        recordId: params.idempotency.recordId,
        statusCode: 200,
        body: {
          ok: true,
          reused: false,
          shipment: {
            shipmentId: createdShipment?.id ?? null,
            provider: providerResult.provider,
            trackingNo: providerResult.trackingNo,
            labelUrl: providerResult.labelUrl,
            providerRequestId: providerResult.providerRequestId,
            createdAt: createdShipment?.createdAt ?? null,
          },
        },
        tx,
      });
    }

    return createdShipment;
  });

  return {
    reused: false,
    shipment: {
      shipmentId: shipment?.id ?? null,
      provider: providerResult.provider,
      trackingNo: providerResult.trackingNo,
      labelUrl: providerResult.labelUrl,
      providerRequestId: providerResult.providerRequestId,
      createdAt: shipment?.createdAt ?? null,
    },
  };
}
