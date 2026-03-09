import "server-only";

import { randomUUID } from "node:crypto";

import { execute } from "@/lib/db/query";
import { isPostgresConfigured } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import { buildAuditEventValues } from "@/server/services/audit.service";

type UpdateShippingInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  shippingCarrier: string | null;
  trackingNo: string | null;
  shippingLabelUrl: string | null;
  shippingLabelStatus: "NONE" | "REQUESTED" | "READY" | "FAILED";
  shippingProvider: string | null;
  shippingCost: number;
  request?: Request | null;
};

type SubmitPaymentSlipInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  paymentSlipUrl: string;
  paymentProofSubmittedAt: string;
  request?: Request | null;
};

export const isPostgresUpdateShippingEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_UPDATE_SHIPPING_ENABLED === "1" && isPostgresConfigured();

export const isPostgresSubmitPaymentSlipEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_SUBMIT_PAYMENT_SLIP_ENABLED === "1" &&
  isPostgresConfigured();

const insertAuditEventInPostgres = async (
  tx: Parameters<Parameters<typeof runInTransaction>[0]>[0],
  auditValues: ReturnType<typeof buildAuditEventValues>,
) =>
  execute(
    `
      insert into audit_events (
        id,
        scope,
        store_id,
        actor_user_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        result,
        reason_code,
        ip_address,
        user_agent,
        request_id,
        metadata,
        before,
        after,
        occurred_at
      )
      values (
        :id,
        :scope,
        :storeId,
        :actorUserId,
        :actorName,
        :actorRole,
        :action,
        :entityType,
        :entityId,
        :result,
        :reasonCode,
        :ipAddress,
        :userAgent,
        :requestId,
        cast(:metadata as jsonb),
        cast(:before as jsonb),
        cast(:after as jsonb),
        :occurredAt
      )
    `,
    {
      transaction: tx,
      replacements: {
        id: randomUUID(),
        scope: auditValues.scope,
        storeId: auditValues.storeId,
        actorUserId: auditValues.actorUserId,
        actorName: auditValues.actorName,
        actorRole: auditValues.actorRole,
        action: auditValues.action,
        entityType: auditValues.entityType,
        entityId: auditValues.entityId,
        result: auditValues.result,
        reasonCode: auditValues.reasonCode,
        ipAddress: auditValues.ipAddress,
        userAgent: auditValues.userAgent,
        requestId: auditValues.requestId,
        metadata: auditValues.metadata,
        before: auditValues.before,
        after: auditValues.after,
        occurredAt: auditValues.occurredAt,
      },
    },
  );

export const updateOrderShippingInPostgres = async (input: UpdateShippingInput) => {
  await runInTransaction(async (tx) => {
    await execute(
      `
        update orders
        set
          shipping_carrier = :shippingCarrier,
          tracking_no = :trackingNo,
          shipping_label_url = :shippingLabelUrl,
          shipping_label_status = :shippingLabelStatus,
          shipping_provider = :shippingProvider,
          shipping_cost = :shippingCost
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
          shippingCarrier: input.shippingCarrier,
          trackingNo: input.trackingNo,
          shippingLabelUrl: input.shippingLabelUrl,
          shippingLabelStatus: input.shippingLabelStatus,
          shippingProvider: input.shippingProvider,
          shippingCost: input.shippingCost,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.update_shipping",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        shippingCarrier: input.shippingCarrier,
        trackingNo: input.trackingNo,
        shippingLabelUrl: input.shippingLabelUrl,
        shippingLabelStatus: input.shippingLabelStatus,
        shippingProvider: input.shippingProvider,
        shippingCost: input.shippingCost,
      },
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const submitOrderPaymentSlipInPostgres = async (input: SubmitPaymentSlipInput) => {
  await runInTransaction(async (tx) => {
    await execute(
      `
        update orders
        set
          payment_slip_url = :paymentSlipUrl,
          payment_proof_submitted_at = :paymentProofSubmittedAt,
          payment_status = 'PENDING_PROOF'
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
          paymentSlipUrl: input.paymentSlipUrl,
          paymentProofSubmittedAt: input.paymentProofSubmittedAt,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.submit_payment_slip",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        paymentSlipUrl: input.paymentSlipUrl,
        paymentStatus: "PENDING_PROOF",
      },
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};
