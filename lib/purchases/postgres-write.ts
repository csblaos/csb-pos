import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import { isPostgresConfigured } from "@/lib/db/sequelize";
import { runInTransaction } from "@/lib/db/transaction";
import type { RequestContext } from "@/lib/http/request-context";
import type {
  CreatePurchaseOrderInput,
  UpdatePOStatusInput,
} from "@/lib/purchases/validation";
import { buildAuditEventValues } from "@/server/services/audit.service";
import type { PurchaseOrderView } from "@/server/repositories/purchase.repo";

type PurchaseStatus = "DRAFT" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED";
type PurchasePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";
type PurchaseCurrency = "LAK" | "THB" | "USD";

type PurchaseOrderItemView = PurchaseOrderView["items"][number];
type PurchasePaymentEntryView = PurchaseOrderView["paymentEntries"][number];

type PurchaseOrderBaseRow = {
  id: string;
  storeId: string;
  poNumber: string;
  supplierName: string | null;
  supplierContact: string | null;
  purchaseCurrency: PurchaseCurrency;
  exchangeRate: number;
  exchangeRateInitial: number;
  exchangeRateLockedAt: string | null;
  exchangeRateLockedBy: string | null;
  exchangeRateLockNote: string | null;
  paymentStatus: PurchasePaymentStatus;
  paidAt: string | null;
  paidBy: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  dueDate: string | null;
  shippingCost: number;
  otherCost: number;
  otherCostNote: string | null;
  status: PurchaseStatus;
  orderedAt: string | null;
  expectedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  trackingInfo: string | null;
  note: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  paidByName: string | null;
};

type PurchaseOrderItemRow = {
  id: string;
  purchaseOrderId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostPurchase: number;
  unitCostBase: number;
  landedCostPerUnit: number;
  productName: string;
  productSku: string;
};

type PurchasePaymentEntryRow = {
  id: string;
  purchaseOrderId: string;
  storeId: string;
  entryType: "PAYMENT" | "REVERSAL";
  amountBase: number;
  paidAt: string;
  reference: string | null;
  note: string | null;
  reversedPaymentId: string | null;
  createdBy: string | null;
  createdAt: string;
  createdByName: string | null;
};

type CreatePurchaseOrderInPostgresInput = {
  storeId: string;
  userId: string;
  storeCurrency: PurchaseCurrency;
  poNumber: string;
  payload: CreatePurchaseOrderInput;
  actorName: string | null;
  actorRole: string | null;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type ReceivePurchaseOrderInPostgresInput = {
  storeId: string;
  userId: string;
  po: PurchaseOrderView;
  payload: UpdatePOStatusInput;
  actorName: string | null;
  actorRole: string | null;
  request?: Request | null;
  requestContext?: RequestContext | null;
};

type PurchaseItemWriteInput = {
  id: string;
  purchaseOrderId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostPurchase: number;
  unitCostBase: number;
  landedCostPerUnit: number;
};

const normalizeIsoDateOrNull = (value: string | null | undefined): string | null => {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("INVALID_DATE");
  }
  return date.toISOString();
};

export const isPostgresPurchaseCreateReceivedEnabled = () =>
  process.env.POSTGRES_PURCHASE_WRITE_CREATE_RECEIVED_ENABLED === "1" &&
  isPostgresConfigured();

export const isPostgresPurchaseReceiveStatusEnabled = () =>
  process.env.POSTGRES_PURCHASE_WRITE_RECEIVE_STATUS_ENABLED === "1" &&
  isPostgresConfigured();

export const poNumberExistsInPostgres = async (storeId: string, poNumber: string) => {
  const row = await queryOne<{ value: number }>(
    `
      select 1 as value
      from purchase_orders
      where store_id = :storeId
        and po_number = :poNumber
      limit 1
    `,
    {
      replacements: {
        storeId,
        poNumber,
      },
    },
  );

  return Boolean(row?.value);
};

const loadProductCurrentStockInPostgres = async (storeId: string, productId: string) => {
  const row = await queryOne<{ onHand: number | string | null }>(
    `
      select
        coalesce(sum(case
          when type = 'IN' then qty_base
          when type = 'RETURN' then qty_base
          when type = 'OUT' then -qty_base
          when type = 'ADJUST' then qty_base
          else 0
        end), 0) as "onHand"
      from inventory_movements
      where store_id = :storeId
        and product_id = :productId
    `,
    {
      replacements: {
        storeId,
        productId,
      },
    },
  );

  return Number(row?.onHand ?? 0);
};

const loadProductCostBaseInPostgres = async (productId: string) => {
  const row = await queryOne<{ costBase: number | string | null }>(
    `
      select cost_base as "costBase"
      from products
      where id = :productId
      limit 1
    `,
    {
      replacements: {
        productId,
      },
    },
  );

  return Number(row?.costBase ?? 0);
};

const insertPurchaseOrderItemsInPostgres = async (
  tx: Parameters<Parameters<typeof runInTransaction>[0]>[0],
  items: PurchaseItemWriteInput[],
) => {
  for (const item of items) {
    await execute(
      `
        insert into purchase_order_items (
          id,
          purchase_order_id,
          product_id,
          qty_ordered,
          qty_received,
          unit_cost_purchase,
          unit_cost_base,
          landed_cost_per_unit
        )
        values (
          :id,
          :purchaseOrderId,
          :productId,
          :qtyOrdered,
          :qtyReceived,
          :unitCostPurchase,
          :unitCostBase,
          :landedCostPerUnit
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: item.id,
          purchaseOrderId: item.purchaseOrderId,
          productId: item.productId,
          qtyOrdered: item.qtyOrdered,
          qtyReceived: item.qtyReceived,
          unitCostPurchase: item.unitCostPurchase,
          unitCostBase: item.unitCostBase,
          landedCostPerUnit: item.landedCostPerUnit,
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

const receiveStockAndUpdateCostInPostgres = async (
  tx: Parameters<Parameters<typeof runInTransaction>[0]>[0],
  params: {
    storeId: string;
    userId: string;
    poId: string;
    poNumber: string;
    actorName: string | null;
    actorRole: string | null;
    request?: Request | null;
    requestContext?: RequestContext | null;
    items: Array<{
      productId: string;
      qtyOrdered: number;
      qtyReceived: number;
      landedCostPerUnit: number;
    }>;
  },
) => {
  for (const item of params.items) {
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
          'IN',
          :qtyBase,
          'PURCHASE',
          :poId,
          :note,
          :createdBy
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: params.storeId,
          productId: item.productId,
          qtyBase: item.qtyReceived,
          poId: params.poId,
          note: "รับสินค้าจากใบสั่งซื้อ",
          createdBy: params.userId,
        },
      },
    );
  }

  for (const item of params.items) {
    if (item.qtyReceived <= 0) continue;

    const currentOnHand = await loadProductCurrentStockInPostgres(
      params.storeId,
      item.productId,
    );
    const currentCostBase = await loadProductCostBaseInPostgres(item.productId);
    const previousOnHand = currentOnHand - item.qtyReceived;
    const previousTotalCost = previousOnHand * currentCostBase;
    const newTotalCost = item.qtyReceived * item.landedCostPerUnit;

    const nextCostBase =
      previousOnHand <= 0
        ? item.landedCostPerUnit
        : Math.round(
            (previousTotalCost + newTotalCost) / (previousOnHand + item.qtyReceived),
          );

    await execute(
      `
        update products
        set cost_base = :nextCostBase
        where id = :productId
      `,
      {
        transaction: tx,
        replacements: {
          productId: item.productId,
          nextCostBase,
        },
      },
    );

    if (nextCostBase !== currentCostBase) {
      const auditValues = buildAuditEventValues({
        scope: "STORE",
        storeId: params.storeId,
        actorUserId: params.userId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        action: "product.cost.auto_from_po",
        entityType: "product",
        entityId: item.productId,
        metadata: {
          source: "PURCHASE_ORDER",
          poId: params.poId,
          poNumber: params.poNumber,
          qtyReceived: item.qtyReceived,
          landedCostPerUnit: item.landedCostPerUnit,
          previousOnHand,
          previousCostBase: currentCostBase,
          nextCostBase,
          note: `รับสินค้าเข้า ${params.poNumber}`,
        },
        requestContext: params.requestContext,
        request: params.request,
      });

      await insertAuditEventInPostgres(tx, auditValues);
    }
  }
};

const getPurchaseOrderByIdInPostgres = async (
  poId: string,
  storeId: string,
): Promise<PurchaseOrderView | null> => {
  const po = await queryOne<PurchaseOrderBaseRow>(
    `
      select
        po.id as "id",
        po.store_id as "storeId",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.supplier_contact as "supplierContact",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate as "exchangeRate",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.exchange_rate_locked_by as "exchangeRateLockedBy",
        po.exchange_rate_lock_note as "exchangeRateLockNote",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.paid_by as "paidBy",
        po.payment_reference as "paymentReference",
        po.payment_note as "paymentNote",
        po.due_date as "dueDate",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.other_cost_note as "otherCostNote",
        po.status as "status",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.tracking_info as "trackingInfo",
        po.note as "note",
        po.created_by as "createdBy",
        po.updated_by as "updatedBy",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt",
        created_user.name as "createdByName",
        paid_user.name as "paidByName"
      from purchase_orders po
      left join users created_user
        on created_user.id = po.created_by
      left join users paid_user
        on paid_user.id = po.paid_by
      where po.id = :poId
        and po.store_id = :storeId
      limit 1
    `,
    {
      replacements: {
        poId,
        storeId,
      },
    },
  );

  if (!po) {
    return null;
  }

  const items = await queryMany<PurchaseOrderItemRow>(
    `
      select
        poi.id as "id",
        poi.purchase_order_id as "purchaseOrderId",
        poi.product_id as "productId",
        poi.qty_ordered as "qtyOrdered",
        poi.qty_received as "qtyReceived",
        poi.unit_cost_purchase as "unitCostPurchase",
        poi.unit_cost_base as "unitCostBase",
        poi.landed_cost_per_unit as "landedCostPerUnit",
        p.name as "productName",
        p.sku as "productSku"
      from purchase_order_items poi
      inner join products p
        on p.id = poi.product_id
      where poi.purchase_order_id = :poId
      order by poi.id asc
    `,
    {
      replacements: { poId },
    },
  );

  const paymentEntries = await queryMany<PurchasePaymentEntryRow>(
    `
      select
        pop.id as "id",
        pop.purchase_order_id as "purchaseOrderId",
        pop.store_id as "storeId",
        pop.entry_type as "entryType",
        pop.amount_base as "amountBase",
        pop.paid_at as "paidAt",
        pop.reference as "reference",
        pop.note as "note",
        pop.reversed_payment_id as "reversedPaymentId",
        pop.created_by as "createdBy",
        pop.created_at as "createdAt",
        u.name as "createdByName"
      from purchase_order_payments pop
      left join users u
        on u.id = pop.created_by
      where pop.purchase_order_id = :poId
      order by pop.paid_at desc, pop.created_at desc
    `,
    {
      replacements: { poId },
    },
  );

  const totalCostBase = items.reduce(
    (sum, item) => sum + item.unitCostBase * item.qtyOrdered,
    0,
  );
  const totalPaidBase = paymentEntries.reduce((sum, entry) => {
    if (entry.entryType === "REVERSAL") {
      return sum - entry.amountBase;
    }
    return sum + entry.amountBase;
  }, 0);
  const outstandingBase = totalCostBase + po.shippingCost + po.otherCost - totalPaidBase;

  return {
    id: po.id,
    storeId: po.storeId,
    poNumber: po.poNumber,
    supplierName: po.supplierName,
    supplierContact: po.supplierContact,
    purchaseCurrency: po.purchaseCurrency,
    exchangeRate: po.exchangeRate,
    exchangeRateInitial: po.exchangeRateInitial,
    exchangeRateLockedAt: po.exchangeRateLockedAt,
    exchangeRateLockedBy: po.exchangeRateLockedBy,
    exchangeRateLockNote: po.exchangeRateLockNote,
    paymentStatus: po.paymentStatus,
    paidAt: po.paidAt,
    paidBy: po.paidBy,
    paymentReference: po.paymentReference,
    paymentNote: po.paymentNote,
    dueDate: po.dueDate,
    shippingCost: po.shippingCost,
    otherCost: po.otherCost,
    otherCostNote: po.otherCostNote,
    status: po.status,
    orderedAt: po.orderedAt,
    expectedAt: po.expectedAt,
    shippedAt: po.shippedAt,
    receivedAt: po.receivedAt,
    cancelledAt: po.cancelledAt,
    trackingInfo: po.trackingInfo,
    note: po.note,
    createdBy: po.createdBy,
    updatedBy: po.updatedBy,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
    items: items as PurchaseOrderItemView[],
    paymentEntries: paymentEntries as PurchasePaymentEntryView[],
    createdByName: po.createdByName,
    paidByName: po.paidByName,
    itemCount: items.length,
    totalCostBase,
    totalPaidBase,
    outstandingBase,
  };
};

export const createPurchaseOrderReceivedInPostgres = async (
  input: CreatePurchaseOrderInPostgresInput,
) => {
  const now = new Date().toISOString();
  const dueDate = normalizeIsoDateOrNull(input.payload.dueDate);
  const hasLockedRate =
    input.payload.purchaseCurrency === input.storeCurrency ||
    (input.payload.exchangeRate !== undefined && Number(input.payload.exchangeRate) > 0);
  const exchangeRate =
    input.payload.purchaseCurrency === input.storeCurrency
      ? 1
      : Math.round(input.payload.exchangeRate ?? 1);
  const poId = randomUUID();

  const items: PurchaseItemWriteInput[] = input.payload.items.map((item) => ({
    id: randomUUID(),
    purchaseOrderId: poId,
    productId: item.productId,
    qtyOrdered: item.qtyOrdered,
    qtyReceived: item.qtyOrdered,
    unitCostPurchase: item.unitCostPurchase,
    unitCostBase: Math.round(item.unitCostPurchase * exchangeRate),
    landedCostPerUnit: 0,
  }));

  const totalExtraCost = input.payload.shippingCost + input.payload.otherCost;
  if (totalExtraCost > 0) {
    const totalItemsCostBase = items.reduce(
      (sum, item) => sum + item.unitCostBase * item.qtyOrdered,
      0,
    );

    for (const item of items) {
      const itemTotalCostBase = item.unitCostBase * item.qtyOrdered;
      const proportion = totalItemsCostBase > 0 ? itemTotalCostBase / totalItemsCostBase : 0;
      const allocatedExtra = Math.round(totalExtraCost * proportion);
      item.landedCostPerUnit = Math.round(
        (itemTotalCostBase + allocatedExtra) / item.qtyOrdered,
      );
    }
  } else {
    for (const item of items) {
      item.landedCostPerUnit = item.unitCostBase;
    }
  }

  await runInTransaction(async (tx) => {
    await execute(
      `
        insert into purchase_orders (
          id,
          store_id,
          po_number,
          supplier_name,
          supplier_contact,
          purchase_currency,
          exchange_rate,
          exchange_rate_initial,
          exchange_rate_locked_at,
          exchange_rate_locked_by,
          exchange_rate_lock_note,
          payment_status,
          paid_at,
          paid_by,
          payment_reference,
          payment_note,
          due_date,
          shipping_cost,
          other_cost,
          other_cost_note,
          status,
          ordered_at,
          expected_at,
          received_at,
          note,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        values (
          :id,
          :storeId,
          :poNumber,
          :supplierName,
          :supplierContact,
          :purchaseCurrency,
          :exchangeRate,
          :exchangeRateInitial,
          :exchangeRateLockedAt,
          :exchangeRateLockedBy,
          :exchangeRateLockNote,
          'UNPAID',
          null,
          null,
          null,
          null,
          :dueDate,
          :shippingCost,
          :otherCost,
          :otherCostNote,
          'RECEIVED',
          :orderedAt,
          :expectedAt,
          :receivedAt,
          :note,
          :createdBy,
          :updatedBy,
          :createdAt,
          :updatedAt
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: poId,
          storeId: input.storeId,
          poNumber: input.poNumber,
          supplierName: input.payload.supplierName || null,
          supplierContact: input.payload.supplierContact || null,
          purchaseCurrency: input.payload.purchaseCurrency,
          exchangeRate,
          exchangeRateInitial: exchangeRate,
          exchangeRateLockedAt: hasLockedRate ? now : null,
          exchangeRateLockedBy: hasLockedRate ? input.userId : null,
          exchangeRateLockNote: hasLockedRate
            ? input.payload.exchangeRateLockNote || null
            : null,
          dueDate,
          shippingCost: input.payload.shippingCost,
          otherCost: input.payload.otherCost,
          otherCostNote: input.payload.otherCostNote || null,
          orderedAt: now,
          expectedAt: input.payload.expectedAt || null,
          receivedAt: now,
          note: input.payload.note || null,
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: now,
          updatedAt: now,
        },
      },
    );

    await insertPurchaseOrderItemsInPostgres(tx, items);

    await receiveStockAndUpdateCostInPostgres(tx, {
      storeId: input.storeId,
      userId: input.userId,
      poId,
      poNumber: input.poNumber,
      actorName: input.actorName,
      actorRole: input.actorRole,
      requestContext: input.requestContext,
      request: input.request,
      items: items.map((item) => ({
        productId: item.productId,
        qtyOrdered: item.qtyOrdered,
        qtyReceived: item.qtyReceived,
        landedCostPerUnit: item.landedCostPerUnit,
      })),
    });

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.userId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "po.create",
      entityType: "purchase_order",
      entityId: poId,
      metadata: {
        poNumber: input.poNumber,
        status: "RECEIVED",
        receiveImmediately: true,
        itemCount: input.payload.items.length,
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });

  const purchaseOrder = await getPurchaseOrderByIdInPostgres(poId, input.storeId);
  if (!purchaseOrder) {
    throw new Error("POSTGRES_PO_CREATE_READ_FAILED");
  }
  return purchaseOrder;
};

export const receivePurchaseOrderInPostgres = async (
  input: ReceivePurchaseOrderInPostgresInput,
) => {
  const now = new Date().toISOString();
  const validTransitions: Record<PurchaseStatus, PurchaseStatus[]> = {
    DRAFT: ["ORDERED", "RECEIVED", "CANCELLED"],
    ORDERED: ["SHIPPED", "RECEIVED", "CANCELLED"],
    SHIPPED: ["RECEIVED", "CANCELLED"],
    RECEIVED: [],
    CANCELLED: [],
  };

  const allowed = validTransitions[input.po.status] ?? [];
  if (!allowed.includes("RECEIVED")) {
    throw new Error("INVALID_PO_RECEIVE_TRANSITION");
  }

  const receivedMap = new Map(
    (input.payload.receivedItems ?? []).map((item) => [item.itemId, item.qtyReceived]),
  );

  const totalExtraCost = input.po.shippingCost + input.po.otherCost;
  const itemsToReceive = input.po.items.map((item) => ({
    ...item,
    qtyReceived: receivedMap.get(item.id) ?? item.qtyOrdered,
  }));

  const totalReceivedCostBase = itemsToReceive.reduce(
    (sum, item) => sum + item.unitCostBase * item.qtyReceived,
    0,
  );

  await runInTransaction(async (tx) => {
    for (const item of itemsToReceive) {
      const qtyReceived = item.qtyReceived;
      if (qtyReceived <= 0) {
        await execute(
          `
            update purchase_order_items
            set
              qty_received = 0,
              landed_cost_per_unit = 0
            where id = :itemId
          `,
          {
            transaction: tx,
            replacements: {
              itemId: item.id,
            },
          },
        );
        continue;
      }

      let landedCostPerUnit = item.unitCostBase;
      if (totalExtraCost > 0 && totalReceivedCostBase > 0) {
        const itemTotalCostBase = item.unitCostBase * qtyReceived;
        const proportion = itemTotalCostBase / totalReceivedCostBase;
        const allocatedExtra = Math.round(totalExtraCost * proportion);
        landedCostPerUnit = Math.round((itemTotalCostBase + allocatedExtra) / qtyReceived);
      }

      await execute(
        `
          update purchase_order_items
          set
            qty_received = :qtyReceived,
            landed_cost_per_unit = :landedCostPerUnit
          where id = :itemId
        `,
        {
          transaction: tx,
          replacements: {
            itemId: item.id,
            qtyReceived,
            landedCostPerUnit,
          },
        },
      );
    }

    const finalItems = itemsToReceive
      .filter((item) => item.qtyReceived > 0)
      .map((item) => {
        let landedCostPerUnit = item.unitCostBase;
        if (totalExtraCost > 0 && totalReceivedCostBase > 0) {
          const itemTotalCostBase = item.unitCostBase * item.qtyReceived;
          const proportion = itemTotalCostBase / totalReceivedCostBase;
          const allocatedExtra = Math.round(totalExtraCost * proportion);
          landedCostPerUnit = Math.round((itemTotalCostBase + allocatedExtra) / item.qtyReceived);
        }

        return {
          productId: item.productId,
          qtyOrdered: item.qtyOrdered,
          qtyReceived: item.qtyReceived,
          landedCostPerUnit,
        };
      });

    await receiveStockAndUpdateCostInPostgres(tx, {
      storeId: input.storeId,
      userId: input.userId,
      poId: input.po.id,
      poNumber: input.po.poNumber,
      actorName: input.actorName,
      actorRole: input.actorRole,
      requestContext: input.requestContext,
      request: input.request,
      items: finalItems,
    });

    await execute(
      `
        update purchase_orders
        set
          status = 'RECEIVED',
          received_at = :receivedAt,
          updated_by = :updatedBy,
          updated_at = :updatedAt
        where id = :poId
          and store_id = :storeId
      `,
      {
        transaction: tx,
        replacements: {
          poId: input.po.id,
          storeId: input.storeId,
          receivedAt: now,
          updatedBy: input.userId,
          updatedAt: now,
        },
      },
    );

    const auditValues = buildAuditEventValues({
      scope: "STORE",
      storeId: input.storeId,
      actorUserId: input.userId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "po.status.change",
      entityType: "purchase_order",
      entityId: input.po.id,
      metadata: {
        poNumber: input.po.poNumber,
        status: "RECEIVED",
      },
      requestContext: input.requestContext,
      request: input.request,
    });

    await insertAuditEventInPostgres(tx, auditValues);
  });

  const purchaseOrder = await getPurchaseOrderByIdInPostgres(input.po.id, input.storeId);
  if (!purchaseOrder) {
    throw new Error("POSTGRES_PO_RECEIVE_READ_FAILED");
  }
  return purchaseOrder;
};
