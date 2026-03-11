import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import { isPostgresConfigured } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import type { RequestContext } from "@/lib/http/request-context";
import { buildAuditEventValues } from "@/server/services/audit.service";

type CreateOrderInput = {
  storeId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  channel: "WALK_IN" | "FACEBOOK" | "WHATSAPP";
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
  contactId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  subtotal: number;
  discount: number;
  vatAmount: number;
  shippingFeeCharged: number;
  total: number;
  paymentCurrency: "LAK" | "THB" | "USD";
  paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  paymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  paymentAccountId: string | null;
  shippingProvider: string | null;
  shippingCarrier: string | null;
  shippingCost: number;
  paidAt: string | null;
  checkoutFlow: "WALK_IN_NOW" | "PICKUP_LATER" | "ONLINE_DELIVERY";
  shouldReserveStockOnCreate: boolean;
  shouldStockOutOnCreate: boolean;
  items: Array<{
    productId: string;
    unitId: string;
    qty: number;
    qtyBase: number;
    priceBaseAtSale: number;
    costBaseAtSale: number;
    lineTotal: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

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
  requestContext?: RequestContext | null;
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
  requestContext?: RequestContext | null;
};

type SubmitForPaymentInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  items: Array<{
    productId: string;
    qtyBase: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type ConfirmPaidInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  currentStatus:
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "READY_FOR_PICKUP"
    | "PICKED_UP_PENDING_PAYMENT"
    | "PAID"
    | "PACKED"
    | "SHIPPED"
    | "COD_RETURNED"
    | "CANCELLED";
  currentPaymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  currentPaymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  currentPaymentAccountId: string | null;
  effectivePaymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  effectivePaymentAccountId: string | null;
  paymentSlipUrl: string | null;
  paymentProofSubmittedAt: string | null;
  existingPaidAt: string | null;
  codAmountToSave: number | null;
  isCodSettlementAfterShipped: boolean;
  isPickupPaymentConfirm: boolean;
  isPickupCompleteAfterPrepaid: boolean;
  shouldOnlyUpdatePaymentAfterReceived: boolean;
  items: Array<{
    productId: string;
    qtyBase: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type MarkPickedUpUnpaidInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  currentStatus:
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "READY_FOR_PICKUP"
    | "PICKED_UP_PENDING_PAYMENT"
    | "PAID"
    | "PACKED"
    | "SHIPPED"
    | "COD_RETURNED"
    | "CANCELLED";
  currentPaymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  items: Array<{
    productId: string;
    qtyBase: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type CancelOrderInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  currentStatus:
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "READY_FOR_PICKUP"
    | "PICKED_UP_PENDING_PAYMENT"
    | "PAID"
    | "PACKED"
    | "SHIPPED"
    | "COD_RETURNED"
    | "CANCELLED";
  currentPaymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  nextPaymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  cancelReason: string;
  approverUserId: string;
  approverName: string | null;
  approverEmail: string | null;
  approverRole: string | null;
  approvalMode: "MANAGER_PASSWORD" | "SELF_SLIDE";
  shouldReleaseReservedOnCancel: boolean;
  shouldReturnStockOnCancel: boolean;
  items: Array<{
    productId: string;
    qtyBase: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type MarkCodReturnedInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  currentPaymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  currentShippingCost: number;
  currentCodFee: number;
  normalizedCodFee: number;
  normalizedCodReturnNote: string | null;
  items: Array<{
    productId: string;
    qtyBase: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type MarkPackedInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  currentStatus:
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "READY_FOR_PICKUP"
    | "PICKED_UP_PENDING_PAYMENT"
    | "PAID"
    | "PACKED"
    | "SHIPPED"
    | "COD_RETURNED"
    | "CANCELLED";
  canPackCodFromPending: boolean;
  items: Array<{
    productId: string;
    qtyBase: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type MarkShippedInput = {
  storeId: string;
  orderId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  orderNo: string;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type BulkCodReconcileInput = {
  storeId: string;
  actorUserId: string;
  actorName: string | null;
  actorRole: string | null;
  items: Array<{
    orderId: string;
    codAmount: number;
    codFee: number;
  }>;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

export const isPostgresUpdateShippingEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_UPDATE_SHIPPING_ENABLED === "1" && isPostgresConfigured();

export const isPostgresCreateOrderEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_CREATE_ENABLED === "1" && isPostgresConfigured();

export const isPostgresSubmitPaymentSlipEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_SUBMIT_PAYMENT_SLIP_ENABLED === "1" &&
  isPostgresConfigured();

export const isPostgresSubmitForPaymentEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_SUBMIT_FOR_PAYMENT_ENABLED === "1" && isPostgresConfigured();

export const isPostgresConfirmPaidEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_CONFIRM_PAID_ENABLED === "1" && isPostgresConfigured();

export const isPostgresMarkPickedUpUnpaidEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_MARK_PICKED_UP_UNPAID_ENABLED === "1" &&
  isPostgresConfigured();

export const isPostgresCancelEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_CANCEL_ENABLED === "1" && isPostgresConfigured();

export const isPostgresMarkCodReturnedEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_MARK_COD_RETURNED_ENABLED === "1" && isPostgresConfigured();

export const isPostgresMarkPackedEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_MARK_PACKED_ENABLED === "1" && isPostgresConfigured();

export const isPostgresMarkShippedEnabled = () =>
  process.env.POSTGRES_ORDERS_WRITE_MARK_SHIPPED_ENABLED === "1" && isPostgresConfigured();

export const orderNoExistsInPostgres = async (storeId: string, orderNo: string) => {
  const row = await queryOne<{ value: number }>(
    `
      select 1 as value
      from orders
      where store_id = :storeId
        and order_no = :orderNo
      limit 1
    `,
    {
      replacements: {
        storeId,
        orderNo,
      },
    },
  );

  return Boolean(row?.value);
};

export const generateOrderNoInPostgres = async (storeId: string) => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const counterRow = await queryOne<{ count: number | string }>(
    `
      select count(*)::int as count
      from orders
      where store_id = :storeId
        and created_at >= :startOfDay
        and created_at < :endOfDay
    `,
    {
      replacements: {
        storeId,
        startOfDay: start.toISOString(),
        endOfDay: end.toISOString(),
      },
    },
  );

  const count = Number(counterRow?.count ?? 0) + 1;
  const datePart = start.toISOString().slice(0, 10).replaceAll("-", "");
  return `SO-${datePart}-${String(count).padStart(4, "0")}`;
};

const insertInventoryMovementsInPostgres = async (
  tx: Parameters<Parameters<typeof runInTransaction>[0]>[0],
  movements: Array<{
    storeId: string;
    productId: string;
    type: "IN" | "OUT" | "RESERVE" | "RELEASE" | "ADJUST" | "RETURN";
    qtyBase: number;
    refType: "ORDER" | "MANUAL" | "RETURN" | "PURCHASE";
    refId: string | null;
    note: string | null;
    createdBy: string | null;
  }>,
) => {
  for (const movement of movements) {
    await execute(
      `
        insert into inventory_movements (
          id,
          store_id,
          product_id,
          type,
          qty_base,
          ref_type,
          ref_id,
          note,
          created_by
        )
        values (
          :id,
          :storeId,
          :productId,
          :type,
          :qtyBase,
          :refType,
          :refId,
          :note,
          :createdBy
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: movement.storeId,
          productId: movement.productId,
          type: movement.type,
          qtyBase: movement.qtyBase,
          refType: movement.refType,
          refId: movement.refId,
          note: movement.note,
          createdBy: movement.createdBy,
        },
      },
    );
  }
};

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

export const createOrderInPostgres = async (input: CreateOrderInput) => {
  const orderId = randomUUID();

  await runInTransaction(async (tx) => {
    await execute(
      `
        insert into orders (
          id,
          store_id,
          order_no,
          channel,
          status,
          contact_id,
          customer_name,
          customer_phone,
          customer_address,
          subtotal,
          discount,
          vat_amount,
          shipping_fee_charged,
          total,
          payment_currency,
          payment_method,
          payment_status,
          payment_account_id,
          payment_slip_url,
          payment_proof_submitted_at,
          shipping_provider,
          shipping_carrier,
          tracking_no,
          shipping_cost,
          paid_at,
          created_by
        )
        values (
          :id,
          :storeId,
          :orderNo,
          :channel,
          :status,
          :contactId,
          :customerName,
          :customerPhone,
          :customerAddress,
          :subtotal,
          :discount,
          :vatAmount,
          :shippingFeeCharged,
          :total,
          :paymentCurrency,
          :paymentMethod,
          :paymentStatus,
          :paymentAccountId,
          null,
          null,
          :shippingProvider,
          :shippingCarrier,
          null,
          :shippingCost,
          :paidAt,
          :createdBy
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: orderId,
          storeId: input.storeId,
          orderNo: input.orderNo,
          channel: input.channel,
          status: input.status,
          contactId: input.contactId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerAddress: input.customerAddress,
          subtotal: input.subtotal,
          discount: input.discount,
          vatAmount: input.vatAmount,
          shippingFeeCharged: input.shippingFeeCharged,
          total: input.total,
          paymentCurrency: input.paymentCurrency,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          paymentAccountId: input.paymentAccountId,
          shippingProvider: input.shippingProvider,
          shippingCarrier: input.shippingCarrier,
          shippingCost: input.shippingCost,
          paidAt: input.paidAt,
          createdBy: input.actorUserId,
        },
      },
    );

    for (const item of input.items) {
      await execute(
        `
          insert into order_items (
            id,
            order_id,
            product_id,
            unit_id,
            qty,
            qty_base,
            price_base_at_sale,
            cost_base_at_sale,
            line_total
          )
          values (
            :id,
            :orderId,
            :productId,
            :unitId,
            :qty,
            :qtyBase,
            :priceBaseAtSale,
            :costBaseAtSale,
            :lineTotal
          )
        `,
        {
          transaction: tx,
          replacements: {
            id: randomUUID(),
            orderId,
            productId: item.productId,
            unitId: item.unitId,
            qty: item.qty,
            qtyBase: item.qtyBase,
            priceBaseAtSale: item.priceBaseAtSale,
            costBaseAtSale: item.costBaseAtSale,
            lineTotal: item.lineTotal,
          },
        },
      );
    }

    if (input.shouldReserveStockOnCreate && input.items.length > 0) {
      const reserveNotePrefix =
        input.checkoutFlow === "PICKUP_LATER"
          ? "จองสต็อกสำหรับรับที่ร้าน"
          : "จองสต็อกสำหรับออเดอร์ค้างจ่าย";

      await insertInventoryMovementsInPostgres(
        tx,
        input.items.map((item) => ({
          storeId: input.storeId,
          productId: item.productId,
          type: "RESERVE" as const,
          qtyBase: item.qtyBase,
          refType: "ORDER" as const,
          refId: orderId,
          note: `${reserveNotePrefix} ${input.orderNo}`,
          createdBy: input.actorUserId,
        })),
      );
    }

    if (input.shouldStockOutOnCreate && input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.map((item) => ({
          storeId: input.storeId,
          productId: item.productId,
          type: "OUT" as const,
          qtyBase: item.qtyBase,
          refType: "ORDER" as const,
          refId: orderId,
          note: `ตัดสต็อกทันทีจากการขายหน้าร้าน ${input.orderNo}`,
          createdBy: input.actorUserId,
        })),
      );
    }

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.create",
      entityType: "order",
      entityId: orderId,
      metadata: {
        orderNo: input.orderNo,
        channel: input.channel,
        itemCount: input.items.length,
        paymentMethod: input.paymentMethod,
        status: input.status,
        paymentStatus: input.paymentStatus,
        stockReservedOnCreate: input.shouldReserveStockOnCreate,
        stockOutOnCreate: input.shouldStockOutOnCreate,
        checkoutFlow: input.checkoutFlow,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });

  return { orderId };
};

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
      requestContext: input.requestContext,
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
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const submitOrderForPaymentInPostgres = async (input: SubmitForPaymentInput) => {
  await runInTransaction(async (tx) => {
    if (input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.map((item) => ({
          storeId: input.storeId,
          productId: item.productId,
          type: "RESERVE" as const,
          qtyBase: item.qtyBase,
          refType: "ORDER" as const,
          refId: input.orderId,
          note: `จองสต็อกสำหรับออเดอร์ ${input.orderNo}`,
          createdBy: input.actorUserId,
        })),
      );
    }

    await execute(
      `
        update orders
        set
          status = 'PENDING_PAYMENT',
          payment_status = :paymentStatus
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
          paymentStatus:
            input.paymentMethod === "COD" ? "COD_PENDING_SETTLEMENT" : "UNPAID",
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.submit_for_payment",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: "DRAFT",
        toStatus: "PENDING_PAYMENT",
        itemCount: input.items.length,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const confirmOrderPaidInPostgres = async (input: ConfirmPaidInput) => {
  await runInTransaction(async (tx) => {
    const now = new Date().toISOString();

    if (input.isCodSettlementAfterShipped) {
      await execute(
        `
          update orders
          set
            payment_status = 'COD_SETTLED',
            cod_settled_at = :codSettledAt,
            paid_at = :paidAt,
            cod_amount = :codAmount
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            storeId: input.storeId,
            orderId: input.orderId,
            codSettledAt: now,
            paidAt: input.existingPaidAt ?? now,
            codAmount: input.codAmountToSave ?? 0,
          },
        },
      );
    } else if (input.isPickupPaymentConfirm) {
      await execute(
        `
          update orders
          set
            payment_status = 'PAID',
            payment_method = :paymentMethod,
            payment_account_id = :paymentAccountId,
            payment_slip_url = :paymentSlipUrl,
            payment_proof_submitted_at = :paymentProofSubmittedAt,
            paid_at = :paidAt
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            storeId: input.storeId,
            orderId: input.orderId,
            paymentMethod: input.effectivePaymentMethod,
            paymentAccountId: input.effectivePaymentAccountId,
            paymentSlipUrl: input.paymentSlipUrl,
            paymentProofSubmittedAt: input.paymentProofSubmittedAt,
            paidAt: input.existingPaidAt ?? now,
          },
        },
      );
    } else if (input.shouldOnlyUpdatePaymentAfterReceived) {
      await execute(
        `
          update orders
          set
            status = 'PAID',
            payment_status = 'PAID',
            payment_method = :paymentMethod,
            payment_account_id = :paymentAccountId,
            payment_slip_url = :paymentSlipUrl,
            payment_proof_submitted_at = :paymentProofSubmittedAt,
            paid_at = :paidAt
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            storeId: input.storeId,
            orderId: input.orderId,
            paymentMethod: input.effectivePaymentMethod,
            paymentAccountId: input.effectivePaymentAccountId,
            paymentSlipUrl: input.paymentSlipUrl,
            paymentProofSubmittedAt: input.paymentProofSubmittedAt,
            paidAt: input.existingPaidAt ?? now,
          },
        },
      );
    } else {
      if (input.items.length > 0) {
        await insertInventoryMovementsInPostgres(
          tx,
          input.items.flatMap((item) => [
            {
              storeId: input.storeId,
              productId: item.productId,
              type: "RELEASE" as const,
              qtyBase: item.qtyBase,
              refType: "ORDER" as const,
              refId: input.orderId,
              note: input.isPickupCompleteAfterPrepaid
                ? `ปล่อยจองสต็อกเมื่อรับสินค้าหน้าร้าน ${input.orderNo}`
                : `ปล่อยจองสต็อกเมื่อชำระเงิน ${input.orderNo}`,
              createdBy: input.actorUserId,
            },
            {
              storeId: input.storeId,
              productId: item.productId,
              type: "OUT" as const,
              qtyBase: item.qtyBase,
              refType: "ORDER" as const,
              refId: input.orderId,
              note: input.isPickupCompleteAfterPrepaid
                ? `ตัดสต็อกเมื่อรับสินค้าหน้าร้าน ${input.orderNo}`
                : `ตัดสต็อกเมื่อชำระเงิน ${input.orderNo}`,
              createdBy: input.actorUserId,
            },
          ]),
        );
      }

      await execute(
        `
          update orders
          set
            status = 'PAID',
            payment_status = 'PAID',
            payment_method = :paymentMethod,
            payment_account_id = :paymentAccountId,
            paid_at = :paidAt
          where id = :orderId
            and store_id = :storeId
        `,
        {
          transaction: tx,
          replacements: {
            storeId: input.storeId,
            orderId: input.orderId,
            paymentMethod: input.effectivePaymentMethod,
            paymentAccountId: input.effectivePaymentAccountId,
            paidAt: input.existingPaidAt ?? now,
          },
        },
      );
    }

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.confirm_paid",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: input.currentStatus,
        toStatus:
          input.isCodSettlementAfterShipped || input.isPickupPaymentConfirm
            ? input.currentStatus
            : "PAID",
        fromPaymentStatus: input.currentPaymentStatus,
        toPaymentStatus: input.isCodSettlementAfterShipped ? "COD_SETTLED" : "PAID",
        stockOutItems:
          input.isCodSettlementAfterShipped ||
          input.isPickupPaymentConfirm ||
          input.shouldOnlyUpdatePaymentAfterReceived
            ? 0
            : input.items.length,
        pickupCompletion: input.isPickupCompleteAfterPrepaid,
        pickupPaymentOnly: input.isPickupPaymentConfirm,
        postPickupSettlement: input.shouldOnlyUpdatePaymentAfterReceived,
        fromPaymentMethod: input.currentPaymentMethod,
        toPaymentMethod: input.effectivePaymentMethod,
        fromPaymentAccountId: input.currentPaymentAccountId,
        toPaymentAccountId: input.effectivePaymentAccountId,
        codAmount:
          input.isCodSettlementAfterShipped && typeof input.codAmountToSave === "number"
            ? input.codAmountToSave
            : undefined,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const markOrderPickedUpUnpaidInPostgres = async (input: MarkPickedUpUnpaidInput) => {
  await runInTransaction(async (tx) => {
    if (input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.flatMap((item) => [
          {
            storeId: input.storeId,
            productId: item.productId,
            type: "RELEASE" as const,
            qtyBase: item.qtyBase,
            refType: "ORDER" as const,
            refId: input.orderId,
            note: `ปล่อยจองสต็อกเมื่อรับสินค้าแบบค้างจ่าย ${input.orderNo}`,
            createdBy: input.actorUserId,
          },
          {
            storeId: input.storeId,
            productId: item.productId,
            type: "OUT" as const,
            qtyBase: item.qtyBase,
            refType: "ORDER" as const,
            refId: input.orderId,
            note: `ตัดสต็อกเมื่อรับสินค้าแบบค้างจ่าย ${input.orderNo}`,
            createdBy: input.actorUserId,
          },
        ]),
      );
    }

    await execute(
      `
        update orders
        set
          status = 'PICKED_UP_PENDING_PAYMENT'
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.mark_picked_up_unpaid",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: input.currentStatus,
        toStatus: "PICKED_UP_PENDING_PAYMENT",
        paymentStatus: input.currentPaymentStatus,
        stockOutItems: input.items.length,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const cancelOrderInPostgres = async (input: CancelOrderInput) => {
  await runInTransaction(async (tx) => {
    if (input.shouldReleaseReservedOnCancel && input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.map((item) => ({
          storeId: input.storeId,
          productId: item.productId,
          type: "RELEASE" as const,
          qtyBase: item.qtyBase,
          refType: "ORDER" as const,
          refId: input.orderId,
          note: `ปล่อยจองสต็อกจากการยกเลิก ${input.orderNo}`,
          createdBy: input.actorUserId,
        })),
      );
    }

    if (input.shouldReturnStockOnCancel && input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.map((item) => ({
          storeId: input.storeId,
          productId: item.productId,
          type: "RETURN" as const,
          qtyBase: item.qtyBase,
          refType: "RETURN" as const,
          refId: input.orderId,
          note: `คืนสต็อกจากการยกเลิก ${input.orderNo}`,
          createdBy: input.actorUserId,
        })),
      );
    }

    await execute(
      `
        update orders
        set
          status = 'CANCELLED',
          payment_status = :paymentStatus
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
          paymentStatus: input.nextPaymentStatus,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.cancel",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: input.currentStatus,
        toStatus: "CANCELLED",
        cancelReason: input.cancelReason,
        approvedByUserId: input.approverUserId,
        approvedByName: input.approverName,
        approvedByEmail: input.approverEmail,
        approvedByRole: input.approverRole,
        approvalMode: input.approvalMode,
        selfApproved: input.approvalMode === "SELF_SLIDE",
        stockReleaseItems: input.shouldReleaseReservedOnCancel ? input.items.length : 0,
        stockReturnItems: input.shouldReturnStockOnCancel ? input.items.length : 0,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const markOrderCodReturnedInPostgres = async (input: MarkCodReturnedInput) => {
  await runInTransaction(async (tx) => {
    const nextCodFee = Math.max(0, input.currentCodFee) + input.normalizedCodFee;
    const nextShippingCost = Math.max(0, input.currentShippingCost) + input.normalizedCodFee;
    const returnedAt = new Date().toISOString();

    if (input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.map((item) => ({
          storeId: input.storeId,
          productId: item.productId,
          type: "RETURN" as const,
          qtyBase: item.qtyBase,
          refType: "RETURN" as const,
          refId: input.orderId,
          note: `รับสินค้าตีกลับ COD ${input.orderNo}`,
          createdBy: input.actorUserId,
        })),
      );
    }

    await execute(
      `
        update orders
        set
          status = 'COD_RETURNED',
          payment_status = 'FAILED',
          cod_amount = 0,
          cod_settled_at = null,
          cod_fee = :codFee,
          cod_return_note = :codReturnNote,
          shipping_cost = :shippingCost,
          cod_returned_at = :codReturnedAt
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
          codFee: nextCodFee,
          codReturnNote: input.normalizedCodReturnNote,
          shippingCost: nextShippingCost,
          codReturnedAt: returnedAt,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.mark_cod_returned",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: "SHIPPED",
        toStatus: "COD_RETURNED",
        fromPaymentStatus: input.currentPaymentStatus,
        toPaymentStatus: "FAILED",
        stockReturnItems: input.items.length,
        codFeeAdded: input.normalizedCodFee,
        codFeeTotal: nextCodFee,
        codReturnNote: input.normalizedCodReturnNote,
        shippingCostTotal: nextShippingCost,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const markOrderPackedInPostgres = async (input: MarkPackedInput) => {
  await runInTransaction(async (tx) => {
    if (input.canPackCodFromPending && input.items.length > 0) {
      await insertInventoryMovementsInPostgres(
        tx,
        input.items.flatMap((item) => [
          {
            storeId: input.storeId,
            productId: item.productId,
            type: "RELEASE" as const,
            qtyBase: item.qtyBase,
            refType: "ORDER" as const,
            refId: input.orderId,
            note: `ปล่อยจองสต็อกเมื่อแพ็ก COD ${input.orderNo}`,
            createdBy: input.actorUserId,
          },
          {
            storeId: input.storeId,
            productId: item.productId,
            type: "OUT" as const,
            qtyBase: item.qtyBase,
            refType: "ORDER" as const,
            refId: input.orderId,
            note: `ตัดสต็อกเมื่อแพ็ก COD ${input.orderNo}`,
            createdBy: input.actorUserId,
          },
        ]),
      );
    }

    await execute(
      `
        update orders
        set
          status = 'PACKED'
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.mark_packed",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: input.currentStatus,
        toStatus: "PACKED",
        stockOutItems: input.canPackCodFromPending ? input.items.length : 0,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const markOrderShippedInPostgres = async (input: MarkShippedInput) => {
  await runInTransaction(async (tx) => {
    await execute(
      `
        update orders
        set
          status = 'SHIPPED',
          shipped_at = :shippedAt
        where id = :orderId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          orderId: input.orderId,
          shippedAt: new Date().toISOString(),
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "order.mark_shipped",
      entityType: "order",
      entityId: input.orderId,
      metadata: {
        orderNo: input.orderNo,
        fromStatus: "PACKED",
        toStatus: "SHIPPED",
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });
};

export const bulkSettleCodReconcileInPostgres = async (input: BulkCodReconcileInput) => {
  const orderIds = Array.from(new Set(input.items.map((item) => item.orderId)));
  const orderRows = await queryMany<{
    id: string;
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
    paymentStatus:
      | "UNPAID"
      | "PENDING_PROOF"
      | "PAID"
      | "COD_PENDING_SETTLEMENT"
      | "COD_SETTLED"
      | "FAILED";
    paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
    paidAt: string | null;
  }>(
    `
      select
        id,
        order_no as "orderNo",
        status,
        payment_status as "paymentStatus",
        payment_method as "paymentMethod",
        paid_at as "paidAt"
      from orders
      where store_id = :storeId
        and id = any(:orderIds)
    `,
    {
      replacements: {
        storeId: input.storeId,
        orderIds,
      },
    },
  );

  const orderMap = new Map(orderRows.map((row) => [row.id, row]));
  const results: Array<{
    orderId: string;
    orderNo: string | null;
    ok: boolean;
    message?: string;
  }> = [];

  let successCount = 0;

  await runInTransaction(async (tx) => {
    for (const item of input.items) {
      const order = orderMap.get(item.orderId);
      if (!order) {
        results.push({
          orderId: item.orderId,
          orderNo: null,
          ok: false,
          message: "ไม่พบออเดอร์",
        });
        continue;
      }

      if (
        order.paymentMethod !== "COD" ||
        order.status !== "SHIPPED" ||
        order.paymentStatus !== "COD_PENDING_SETTLEMENT"
      ) {
        results.push({
          orderId: order.id,
          orderNo: order.orderNo,
          ok: false,
          message: "สถานะไม่พร้อมปิดยอด COD",
        });
        continue;
      }

      const codAmount = Math.max(0, Math.trunc(item.codAmount));
      const codFee = Math.max(0, Math.trunc(item.codFee));
      const now = new Date().toISOString();

      await execute(
        `
          update orders
          set
            payment_status = 'COD_SETTLED',
            cod_settled_at = :codSettledAt,
            paid_at = :paidAt,
            cod_amount = :codAmount,
            cod_fee = :codFee
          where
            id = :orderId
            and store_id = :storeId
            and status = 'SHIPPED'
            and payment_method = 'COD'
            and payment_status = 'COD_PENDING_SETTLEMENT'
        `,
        {
          transaction: tx,
          replacements: {
            storeId: input.storeId,
            orderId: order.id,
            codSettledAt: now,
            paidAt: order.paidAt ?? now,
            codAmount,
            codFee,
          },
        },
      );

      await insertAuditEventInPostgres(
        tx,
        buildAuditEventValues({
          scope: "STORE",
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: "order.confirm_paid.bulk_cod_reconcile",
          entityType: "order",
          entityId: order.id,
          metadata: {
            orderNo: order.orderNo,
            toPaymentStatus: "COD_SETTLED",
            codAmount,
            codFee,
          },
          requestContext: input.requestContext,
          request: input.request,
        }),
      );

      successCount += 1;
      results.push({
        orderId: order.id,
        orderNo: order.orderNo,
        ok: true,
      });
    }
  });

  return {
    settledCount: successCount,
    failedCount: results.length - successCount,
    results,
  };
};
