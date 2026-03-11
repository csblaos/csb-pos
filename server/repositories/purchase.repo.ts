import "server-only";

import { randomUUID } from "node:crypto";

import { execute, queryMany, queryOne } from "@/lib/db/query";
import type { PostgresTransaction } from "@/lib/db/sequelize";
import {
  getPendingExchangeRateQueueFromPostgres,
  getPurchaseOrderDetailFromPostgres,
  listPurchaseOrdersFromPostgres,
  listPurchaseOrdersPagedFromPostgres,
} from "@/lib/purchases/queries";

export type PurchaseRepoTx = PostgresTransaction;

export type PurchaseOrderRow = {
  id: string;
  storeId: string;
  poNumber: string;
  supplierName: string | null;
  supplierContact: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRate: number;
  exchangeRateInitial: number;
  exchangeRateLockedAt: string | null;
  exchangeRateLockedBy: string | null;
  exchangeRateLockNote: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt: string | null;
  paidBy: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  dueDate: string | null;
  shippingCost: number;
  otherCost: number;
  otherCostNote: string | null;
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED";
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
};

export type PurchaseOrderItemRow = {
  id: string;
  purchaseOrderId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostPurchase: number;
  unitCostBase: number;
  landedCostPerUnit: number;
};

export type PurchaseOrderPaymentRow = {
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
};

export type PurchaseOrderPaymentEntry = PurchaseOrderPaymentRow & {
  createdByName: string | null;
};

type PurchaseOrderInsertInput = Omit<
  PurchaseOrderRow,
  | "id"
  | "shippedAt"
  | "cancelledAt"
  | "trackingInfo"
  | "createdAt"
  | "updatedAt"
  | "updatedBy"
> &
  Partial<
    Pick<
      PurchaseOrderRow,
      | "id"
      | "shippedAt"
      | "cancelledAt"
      | "trackingInfo"
      | "createdAt"
      | "updatedAt"
      | "updatedBy"
    >
  >;

type PurchaseOrderItemInsertInput = Omit<PurchaseOrderItemRow, "id"> &
  Partial<Pick<PurchaseOrderItemRow, "id">>;

type PurchaseOrderPaymentInsertInput = Omit<
  PurchaseOrderPaymentRow,
  "id" | "reversedPaymentId" | "createdAt"
> &
  Partial<Pick<PurchaseOrderPaymentRow, "id" | "reversedPaymentId" | "createdAt">>;

export type PurchaseOrderView = PurchaseOrderRow & {
  items: (PurchaseOrderItemRow & {
    productName: string;
    productSku: string;
  })[];
  paymentEntries: PurchaseOrderPaymentEntry[];
  createdByName: string | null;
  paidByName: string | null;
  itemCount: number;
  totalCostBase: number;
  totalPaidBase: number;
  outstandingBase: number;
};

export type PurchaseOrderListItem = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRateInitial: number;
  exchangeRateLockedAt: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt: string | null;
  dueDate: string | null;
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED";
  itemCount: number;
  totalCostBase: number;
  totalPaidBase: number;
  outstandingBase: number;
  shippingCost: number;
  otherCost: number;
  orderedAt: string | null;
  expectedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type PendingExchangeRateQueueItem = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRateInitial: number;
  receivedAt: string | null;
  expectedAt: string | null;
  dueDate: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  itemCount: number;
  totalCostBase: number;
  outstandingBase: number;
};

type PurchaseOrderBaseRow = PurchaseOrderRow & {
  createdByName: string | null;
  paidByName: string | null;
};

type PurchaseOrderItemViewRow = PurchaseOrderItemRow & {
  productName: string;
  productSku: string;
};

const queryOptions = (transaction?: PurchaseRepoTx) =>
  transaction
    ? {
        transaction,
      }
    : {};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const loadPurchaseOrderDetailInTransaction = async (
  poId: string,
  storeId: string,
  transaction: PurchaseRepoTx,
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
      ...queryOptions(transaction),
      replacements: {
        poId,
        storeId,
      },
    },
  );

  if (!po) {
    return null;
  }

  const [items, paymentEntries] = await Promise.all([
    queryMany<PurchaseOrderItemViewRow>(
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
        ...queryOptions(transaction),
        replacements: { poId },
      },
    ),
    queryMany<PurchaseOrderPaymentEntry>(
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
        ...queryOptions(transaction),
        replacements: { poId },
      },
    ),
  ]);

  const totalCostBase = items.reduce(
    (sum, item) => sum + toNumber(item.unitCostBase) * toNumber(item.qtyOrdered),
    0,
  );
  const totalPaidBase = paymentEntries.reduce((sum, entry) => {
    if (entry.entryType === "REVERSAL") {
      return sum - toNumber(entry.amountBase);
    }
    return sum + toNumber(entry.amountBase);
  }, 0);
  const shippingCost = toNumber(po.shippingCost);
  const otherCost = toNumber(po.otherCost);

  return {
    ...po,
    exchangeRate: toNumber(po.exchangeRate),
    exchangeRateInitial: toNumber(po.exchangeRateInitial),
    shippingCost,
    otherCost,
    items: items.map((item) => ({
      ...item,
      qtyOrdered: toNumber(item.qtyOrdered),
      qtyReceived: toNumber(item.qtyReceived),
      unitCostPurchase: toNumber(item.unitCostPurchase),
      unitCostBase: toNumber(item.unitCostBase),
      landedCostPerUnit: toNumber(item.landedCostPerUnit),
    })),
    paymentEntries: paymentEntries.map((entry) => ({
      ...entry,
      amountBase: toNumber(entry.amountBase),
    })),
    itemCount: items.length,
    totalCostBase,
    totalPaidBase,
    outstandingBase: totalCostBase + shippingCost + otherCost - totalPaidBase,
  };
};

export async function getNextPoNumber(
  storeId: string,
  tx?: PurchaseRepoTx,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const row = await queryOne<{ poNumber: string }>(
    `
      select po_number as "poNumber"
      from purchase_orders
      where store_id = :storeId
        and po_number like :prefix
      order by po_number desc
      limit 1
    `,
    {
      ...queryOptions(tx),
      replacements: {
        storeId,
        prefix: `${prefix}%`,
      },
    },
  );

  if (!row?.poNumber) {
    return `${prefix}0001`;
  }

  const lastNum = Number.parseInt(row.poNumber.replace(prefix, ""), 10);
  return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
}

export async function listPurchaseOrders(
  storeId: string,
): Promise<PurchaseOrderListItem[]> {
  return listPurchaseOrdersFromPostgres(storeId);
}

export async function listPurchaseOrdersPaged(
  storeId: string,
  limit: number,
  offset: number,
): Promise<PurchaseOrderListItem[]> {
  return listPurchaseOrdersPagedFromPostgres(storeId, limit, offset);
}

export async function getPurchaseOrderById(
  poId: string,
  storeId: string,
  tx?: PurchaseRepoTx,
): Promise<PurchaseOrderView | null> {
  if (tx) {
    return loadPurchaseOrderDetailInTransaction(poId, storeId, tx);
  }
  return getPurchaseOrderDetailFromPostgres(poId, storeId);
}

export async function listPendingExchangeRateQueue(params: {
  storeId: string;
  storeCurrency: "LAK" | "THB" | "USD";
  supplierQuery?: string;
  receivedFrom?: string;
  receivedTo?: string;
  limit?: number;
}): Promise<PendingExchangeRateQueueItem[]> {
  return getPendingExchangeRateQueueFromPostgres(params);
}

export async function insertPurchaseOrder(
  data: PurchaseOrderInsertInput,
  tx?: PurchaseRepoTx,
) {
  const now = new Date().toISOString();
  const row = {
    id: data.id ?? randomUUID(),
    shippedAt: data.shippedAt ?? null,
    cancelledAt: data.cancelledAt ?? null,
    trackingInfo: data.trackingInfo ?? null,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    updatedBy: data.updatedBy ?? data.createdBy ?? null,
    ...data,
  };
  return queryOne<PurchaseOrderRow>(
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
        shipped_at,
        received_at,
        cancelled_at,
        tracking_info,
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
        :paymentStatus,
        :paidAt,
        :paidBy,
        :paymentReference,
        :paymentNote,
        :dueDate,
        :shippingCost,
        :otherCost,
        :otherCostNote,
        :status,
        :orderedAt,
        :expectedAt,
        :shippedAt,
        :receivedAt,
        :cancelledAt,
        :trackingInfo,
        :note,
        :createdBy,
        :updatedBy,
        :createdAt,
        :updatedAt
      )
      returning
        id as "id",
        store_id as "storeId",
        po_number as "poNumber",
        supplier_name as "supplierName",
        supplier_contact as "supplierContact",
        purchase_currency as "purchaseCurrency",
        exchange_rate as "exchangeRate",
        exchange_rate_initial as "exchangeRateInitial",
        exchange_rate_locked_at as "exchangeRateLockedAt",
        exchange_rate_locked_by as "exchangeRateLockedBy",
        exchange_rate_lock_note as "exchangeRateLockNote",
        payment_status as "paymentStatus",
        paid_at as "paidAt",
        paid_by as "paidBy",
        payment_reference as "paymentReference",
        payment_note as "paymentNote",
        due_date as "dueDate",
        shipping_cost as "shippingCost",
        other_cost as "otherCost",
        other_cost_note as "otherCostNote",
        status as "status",
        ordered_at as "orderedAt",
        expected_at as "expectedAt",
        shipped_at as "shippedAt",
        received_at as "receivedAt",
        cancelled_at as "cancelledAt",
        tracking_info as "trackingInfo",
        note as "note",
        created_by as "createdBy",
        updated_by as "updatedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    {
      ...queryOptions(tx),
      replacements: row,
    },
  ).then((row) => row!);
}

export async function insertPurchaseOrderItems(
  items: PurchaseOrderItemInsertInput[],
  tx?: PurchaseRepoTx,
) {
  if (items.length === 0) return;
  for (const item of items) {
    const row = {
      id: item.id ?? randomUUID(),
      ...item,
    };
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
        ...queryOptions(tx),
        replacements: row,
      },
    );
  }
}

export async function replacePurchaseOrderItems(
  poId: string,
  items: PurchaseOrderItemInsertInput[],
  tx?: PurchaseRepoTx,
) {
  await execute(
    `
      delete from purchase_order_items
      where purchase_order_id = :poId
    `,
    {
      ...queryOptions(tx),
      replacements: { poId },
    },
  );
  await insertPurchaseOrderItems(items, tx);
}

export async function updatePurchaseOrderFields(
  poId: string,
  updates: Partial<PurchaseOrderRow>,
  tx?: PurchaseRepoTx,
) {
  const sets: string[] = [];
  const replacements: Record<string, unknown> = { poId };

  for (const [key, value] of Object.entries(updates)) {
    const column = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    sets.push(`${column} = :${key}`);
    replacements[key] = value;
  }

  if (sets.length === 0) return;

  await execute(
    `
      update purchase_orders
      set ${sets.join(", ")}
      where id = :poId
    `,
    {
      ...queryOptions(tx),
      replacements,
    },
  );
}

export async function updatePurchaseOrderStatus(
  poId: string,
  updates: Partial<PurchaseOrderRow>,
  tx?: PurchaseRepoTx,
) {
  return updatePurchaseOrderFields(poId, updates, tx);
}

export async function updatePurchaseOrderItemReceived(
  itemId: string,
  qtyReceived: number,
  landedCostPerUnit: number,
  tx?: PurchaseRepoTx,
) {
  await execute(
    `
      update purchase_order_items
      set
        qty_received = :qtyReceived,
        landed_cost_per_unit = :landedCostPerUnit
      where id = :itemId
    `,
    {
      ...queryOptions(tx),
      replacements: {
        itemId,
        qtyReceived,
        landedCostPerUnit,
      },
    },
  );
}

export async function updatePurchaseOrderItemCostFields(
  itemId: string,
  unitCostBase: number,
  landedCostPerUnit: number,
  tx?: PurchaseRepoTx,
) {
  await execute(
    `
      update purchase_order_items
      set
        unit_cost_base = :unitCostBase,
        landed_cost_per_unit = :landedCostPerUnit
      where id = :itemId
    `,
    {
      ...queryOptions(tx),
      replacements: {
        itemId,
        unitCostBase,
        landedCostPerUnit,
      },
    },
  );
}

export async function insertPurchaseOrderPayment(
  data: PurchaseOrderPaymentInsertInput,
  tx?: PurchaseRepoTx,
) {
  const row = {
    id: data.id ?? randomUUID(),
    reversedPaymentId: data.reversedPaymentId ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    ...data,
  };
  return queryOne<PurchaseOrderPaymentRow>(
    `
      insert into purchase_order_payments (
        id,
        purchase_order_id,
        store_id,
        entry_type,
        amount_base,
        paid_at,
        reference,
        note,
        reversed_payment_id,
        created_by,
        created_at
      )
      values (
        :id,
        :purchaseOrderId,
        :storeId,
        :entryType,
        :amountBase,
        :paidAt,
        :reference,
        :note,
        :reversedPaymentId,
        :createdBy,
        :createdAt
      )
      returning
        id as "id",
        purchase_order_id as "purchaseOrderId",
        store_id as "storeId",
        entry_type as "entryType",
        amount_base as "amountBase",
        paid_at as "paidAt",
        reference as "reference",
        note as "note",
        reversed_payment_id as "reversedPaymentId",
        created_by as "createdBy",
        created_at as "createdAt"
    `,
    {
      ...queryOptions(tx),
      replacements: row,
    },
  ).then((row) => row!);
}

export async function getPurchaseOrderPaymentById(
  paymentId: string,
  tx?: PurchaseRepoTx,
) {
  return queryOne<PurchaseOrderPaymentRow>(
    `
      select
        id as "id",
        purchase_order_id as "purchaseOrderId",
        store_id as "storeId",
        entry_type as "entryType",
        amount_base as "amountBase",
        paid_at as "paidAt",
        reference as "reference",
        note as "note",
        reversed_payment_id as "reversedPaymentId",
        created_by as "createdBy",
        created_at as "createdAt"
      from purchase_order_payments
      where id = :paymentId
      limit 1
    `,
    {
      ...queryOptions(tx),
      replacements: { paymentId },
    },
  );
}

export async function hasPurchaseOrderPaymentReversal(
  paymentId: string,
  tx?: PurchaseRepoTx,
): Promise<boolean> {
  const row = await queryOne<{ count: number | string | null }>(
    `
      select count(*) as "count"
      from purchase_order_payments
      where reversed_payment_id = :paymentId
    `,
    {
      ...queryOptions(tx),
      replacements: { paymentId },
    },
  );
  return toNumber(row?.count) > 0;
}

export async function getLatestPurchaseOrderPaymentEntry(
  purchaseOrderId: string,
  tx?: PurchaseRepoTx,
) {
  return queryOne<PurchaseOrderPaymentRow>(
    `
      select
        id as "id",
        purchase_order_id as "purchaseOrderId",
        store_id as "storeId",
        entry_type as "entryType",
        amount_base as "amountBase",
        paid_at as "paidAt",
        reference as "reference",
        note as "note",
        reversed_payment_id as "reversedPaymentId",
        created_by as "createdBy",
        created_at as "createdAt"
      from purchase_order_payments
      where purchase_order_id = :purchaseOrderId
      order by paid_at desc, created_at desc
      limit 1
    `,
    {
      ...queryOptions(tx),
      replacements: { purchaseOrderId },
    },
  );
}

export async function insertInventoryMovementsForPO(
  movements: Array<{
    storeId: string;
    productId: string;
    type: "IN" | "RETURN" | "OUT" | "ADJUST";
    qtyBase: number;
    refType: string;
    refId: string;
    note: string | null;
    createdBy: string | null;
  }>,
  tx?: PurchaseRepoTx,
) {
  if (movements.length === 0) return;
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
        ...queryOptions(tx),
        replacements: {
          id: randomUUID(),
          ...movement,
        },
      },
    );
  }
}

export async function updateProductCostBase(
  productId: string,
  newCostBase: number,
  tx?: PurchaseRepoTx,
) {
  await execute(
    `
      update products
      set cost_base = :newCostBase
      where id = :productId
    `,
    {
      ...queryOptions(tx),
      replacements: {
        productId,
        newCostBase,
      },
    },
  );
}

export async function getProductCurrentStock(
  storeId: string,
  productId: string,
  tx?: PurchaseRepoTx,
): Promise<number> {
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
      ...queryOptions(tx),
      replacements: {
        storeId,
        productId,
      },
    },
  );

  return toNumber(row?.onHand);
}

export async function getProductCostBase(
  productId: string,
  tx?: PurchaseRepoTx,
): Promise<number> {
  const row = await queryOne<{ costBase: number | string | null }>(
    `
      select cost_base as "costBase"
      from products
      where id = :productId
      limit 1
    `,
    {
      ...queryOptions(tx),
      replacements: { productId },
    },
  );

  return toNumber(row?.costBase);
}
