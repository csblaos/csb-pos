import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { orders, orderShipments } from "@/lib/db/schema";

export type OrderShipmentRepoTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderShipmentRepoExecutor = typeof db | OrderShipmentRepoTx;

export type OrderForShipmentLabel = {
  id: string;
  storeId: string;
  orderNo: string;
  status: "DRAFT" | "PENDING_PAYMENT" | "PAID" | "PACKED" | "SHIPPED" | "CANCELLED";
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  shippingCarrier: string | null;
  trackingNo: string | null;
  shippingProvider: string | null;
  shippingLabelStatus: "NONE" | "REQUESTED" | "READY" | "FAILED";
  shippingLabelUrl: string | null;
  shippingRequestId: string | null;
};

export async function findOrderForShipmentLabel(
  storeId: string,
  orderId: string,
  tx?: OrderShipmentRepoTx,
): Promise<OrderForShipmentLabel | null> {
  const executor: OrderShipmentRepoExecutor = tx ?? db;
  const [order] = await executor
    .select({
      id: orders.id,
      storeId: orders.storeId,
      orderNo: orders.orderNo,
      status: orders.status,
      customerName: orders.customerName,
      customerAddress: orders.customerAddress,
      customerPhone: orders.customerPhone,
      shippingCarrier: orders.shippingCarrier,
      trackingNo: orders.trackingNo,
      shippingProvider: orders.shippingProvider,
      shippingLabelStatus: orders.shippingLabelStatus,
      shippingLabelUrl: orders.shippingLabelUrl,
      shippingRequestId: orders.shippingRequestId,
    })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
    .limit(1);

  return order ?? null;
}

export async function findLatestOrderShipment(
  orderId: string,
  tx?: OrderShipmentRepoTx,
) {
  const executor: OrderShipmentRepoExecutor = tx ?? db;
  const [row] = await executor
    .select({
      id: orderShipments.id,
      provider: orderShipments.provider,
      status: orderShipments.status,
      trackingNo: orderShipments.trackingNo,
      labelUrl: orderShipments.labelUrl,
      providerRequestId: orderShipments.providerRequestId,
      createdAt: orderShipments.createdAt,
    })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .orderBy(desc(orderShipments.createdAt), desc(orderShipments.id))
    .limit(1);

  return row ?? null;
}

export async function insertOrderShipment(
  data: typeof orderShipments.$inferInsert,
  tx?: OrderShipmentRepoTx,
) {
  const executor: OrderShipmentRepoExecutor = tx ?? db;
  const [row] = await executor.insert(orderShipments).values(data).returning({
    id: orderShipments.id,
    provider: orderShipments.provider,
    status: orderShipments.status,
    trackingNo: orderShipments.trackingNo,
    labelUrl: orderShipments.labelUrl,
    providerRequestId: orderShipments.providerRequestId,
    createdAt: orderShipments.createdAt,
  });
  return row ?? null;
}

export async function updateOrderWithShipmentLabel(
  input: {
    orderId: string;
    storeId: string;
    provider: string;
    trackingNo: string;
    labelUrl: string;
    providerRequestId: string;
    shippingCarrier: string | null;
  },
  tx?: OrderShipmentRepoTx,
) {
  const executor: OrderShipmentRepoExecutor = tx ?? db;
  await executor
    .update(orders)
    .set({
      shippingProvider: input.provider,
      shippingLabelStatus: "READY",
      shippingLabelUrl: input.labelUrl,
      shippingRequestId: input.providerRequestId,
      trackingNo: input.trackingNo,
      shippingCarrier: input.shippingCarrier,
    })
    .where(and(eq(orders.id, input.orderId), eq(orders.storeId, input.storeId)));
}
