import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import type { PostgresTransaction } from "@/lib/db/sequelize";

export type OrderShipmentRepoTx = PostgresTransaction;

export type OrderForShipmentLabel = {
  id: string;
  storeId: string;
  orderNo: string;
  status:
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "READY_FOR_PICKUP"
    | "PICKED_UP_PENDING_PAYMENT"
    | "PAID"
    | "PACKED"
    | "SHIPPED"
    | "COD_RETURNED"
    | "CANCELLED";
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

type OrderShipmentRow = {
  id: string;
  provider: string;
  status: string;
  trackingNo: string | null;
  labelUrl: string | null;
  providerRequestId: string | null;
  createdAt: string | null;
};

type OrderShipmentInsertInput = {
  orderId: string;
  storeId: string;
  provider: string;
  status: string;
  trackingNo: string | null;
  labelUrl: string | null;
  labelFileKey: string | null;
  providerRequestId: string | null;
  providerResponse: string | null;
  lastError: string | null;
  createdBy: string | null;
};

const queryOptions = (transaction?: OrderShipmentRepoTx) =>
  transaction
    ? {
        transaction,
      }
    : {};

export async function findOrderForShipmentLabel(
  storeId: string,
  orderId: string,
  tx?: OrderShipmentRepoTx,
): Promise<OrderForShipmentLabel | null> {
  return queryOne<OrderForShipmentLabel>(
    `
      select
        id as "id",
        store_id as "storeId",
        order_no as "orderNo",
        status as "status",
        customer_name as "customerName",
        customer_address as "customerAddress",
        customer_phone as "customerPhone",
        shipping_carrier as "shippingCarrier",
        tracking_no as "trackingNo",
        shipping_provider as "shippingProvider",
        shipping_label_status as "shippingLabelStatus",
        shipping_label_url as "shippingLabelUrl",
        shipping_request_id as "shippingRequestId"
      from orders
      where store_id = :storeId
        and id = :orderId
      limit 1
    `,
    {
      ...queryOptions(tx),
      replacements: { storeId, orderId },
    },
  );
}

export async function findLatestOrderShipment(
  orderId: string,
  tx?: OrderShipmentRepoTx,
) {
  return queryOne<OrderShipmentRow>(
    `
      select
        id as "id",
        provider as "provider",
        status as "status",
        tracking_no as "trackingNo",
        label_url as "labelUrl",
        provider_request_id as "providerRequestId",
        created_at as "createdAt"
      from order_shipments
      where order_id = :orderId
      order by created_at desc, id desc
      limit 1
    `,
    {
      ...queryOptions(tx),
      replacements: { orderId },
    },
  );
}

export async function insertOrderShipment(
  data: OrderShipmentInsertInput,
  tx?: OrderShipmentRepoTx,
) {
  return queryOne<OrderShipmentRow>(
    `
      insert into order_shipments (
        id,
        order_id,
        store_id,
        provider,
        status,
        tracking_no,
        label_url,
        label_file_key,
        provider_request_id,
        provider_response,
        last_error,
        created_by
      )
      values (
        :id,
        :orderId,
        :storeId,
        :provider,
        :status,
        :trackingNo,
        :labelUrl,
        :labelFileKey,
        :providerRequestId,
        :providerResponse,
        :lastError,
        :createdBy
      )
      returning
        id as "id",
        provider as "provider",
        status as "status",
        tracking_no as "trackingNo",
        label_url as "labelUrl",
        provider_request_id as "providerRequestId",
        created_at as "createdAt"
    `,
    {
      ...queryOptions(tx),
      replacements: {
        id: randomUUID(),
        ...data,
      },
    },
  );
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
  await execute(
    `
      update orders
      set
        shipping_provider = :provider,
        shipping_label_status = 'READY',
        shipping_label_url = :labelUrl,
        shipping_request_id = :providerRequestId,
        tracking_no = :trackingNo,
        shipping_carrier = :shippingCarrier
      where id = :orderId
        and store_id = :storeId
    `,
    {
      ...queryOptions(tx),
      replacements: input,
    },
  );
}
