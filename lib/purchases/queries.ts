import "server-only";

import type {
  PendingExchangeRateQueueItem,
  PurchaseOrderListItem,
  PurchaseOrderView,
} from "@/server/repositories/purchase.repo";

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;

type PostgresPurchaseReadContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
};

type PurchaseOrderListRow = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRateInitial: number | string;
  exchangeRateLockedAt: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt: string | null;
  dueDate: string | null;
  status: "DRAFT" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED";
  shippingCost: number | string;
  otherCost: number | string;
  orderedAt: string | null;
  expectedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  itemCount: number | string;
  totalCostBase: number | string;
  totalPaidBase: number | string;
};

type PurchaseOrderBaseRow = {
  id: string;
  storeId: string;
  poNumber: string;
  supplierName: string | null;
  supplierContact: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRate: number | string;
  exchangeRateInitial: number | string;
  exchangeRateLockedAt: string | null;
  exchangeRateLockedBy: string | null;
  exchangeRateLockNote: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt: string | null;
  paidBy: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  dueDate: string | null;
  shippingCost: number | string;
  otherCost: number | string;
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
  createdByName: string | null;
  paidByName: string | null;
};

type PurchaseOrderItemRow = PurchaseOrderView["items"][number];
type PurchasePaymentEntryRow = PurchaseOrderView["paymentEntries"][number];

type PendingExchangeRateQueueRow = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: "LAK" | "THB" | "USD";
  exchangeRateInitial: number | string;
  receivedAt: string | null;
  expectedAt: string | null;
  dueDate: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  shippingCost: number | string;
  otherCost: number | string;
  itemCount: number | string;
  totalCostBase: number | string;
  totalPaidBase: number | string;
};

const getPostgresPurchaseReadContext = async (): Promise<PostgresPurchaseReadContext> => {
  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL purchase read path is not configured");
  }

  return {
    queryMany,
    queryOne,
  };
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const mapPurchaseOrderListRow = (row: PurchaseOrderListRow): PurchaseOrderListItem => {
  const totalCostBase = toNumber(row.totalCostBase);
  const totalPaidBase = toNumber(row.totalPaidBase);
  const shippingCost = toNumber(row.shippingCost);
  const otherCost = toNumber(row.otherCost);

  return {
    id: row.id,
    poNumber: row.poNumber,
    supplierName: row.supplierName,
    purchaseCurrency: row.purchaseCurrency,
    exchangeRateInitial: toNumber(row.exchangeRateInitial),
    exchangeRateLockedAt: row.exchangeRateLockedAt,
    paymentStatus: row.paymentStatus,
    paidAt: row.paidAt,
    dueDate: row.dueDate,
    status: row.status,
    itemCount: toNumber(row.itemCount),
    totalCostBase,
    totalPaidBase,
    outstandingBase: totalCostBase + shippingCost + otherCost - totalPaidBase,
    shippingCost,
    otherCost,
    orderedAt: row.orderedAt,
    expectedAt: row.expectedAt,
    shippedAt: row.shippedAt,
    receivedAt: row.receivedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
  };
};

export const listPurchaseOrdersPagedFromPostgres = async (
  storeId: string,
  limit: number,
  offset: number,
) => {
  const pg = await getPostgresPurchaseReadContext();
  const rows = await pg.queryMany<PurchaseOrderListRow>(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.due_date as "dueDate",
        po.status as "status",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.created_at as "createdAt",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = :storeId
      order by po.created_at desc
      limit :limit
      offset :offset
    `,
    {
      replacements: {
        storeId,
        limit,
        offset,
      },
    },
  );

  return rows.map(mapPurchaseOrderListRow);
};

export const listPurchaseOrdersFromPostgres = async (storeId: string) => {
  const pg = await getPostgresPurchaseReadContext();
  const rows = await pg.queryMany<PurchaseOrderListRow>(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.exchange_rate_locked_at as "exchangeRateLockedAt",
        po.payment_status as "paymentStatus",
        po.paid_at as "paidAt",
        po.due_date as "dueDate",
        po.status as "status",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        po.ordered_at as "orderedAt",
        po.expected_at as "expectedAt",
        po.shipped_at as "shippedAt",
        po.received_at as "receivedAt",
        po.cancelled_at as "cancelledAt",
        po.created_at as "createdAt",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = :storeId
      order by po.created_at desc
    `,
    {
      replacements: { storeId },
    },
  );

  return rows.map(mapPurchaseOrderListRow);
};

export const getPurchaseOrderDetailFromPostgres = async (
  poId: string,
  storeId: string,
): Promise<PurchaseOrderView | null> => {
  const pg = await getPostgresPurchaseReadContext();
  const po = await pg.queryOne<PurchaseOrderBaseRow>(
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

  const [items, paymentEntries] = await Promise.all([
    pg.queryMany<PurchaseOrderItemRow>(
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
    ),
    pg.queryMany<PurchasePaymentEntryRow>(
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
    id: po.id,
    storeId: po.storeId,
    poNumber: po.poNumber,
    supplierName: po.supplierName,
    supplierContact: po.supplierContact,
    purchaseCurrency: po.purchaseCurrency,
    exchangeRate: toNumber(po.exchangeRate),
    exchangeRateInitial: toNumber(po.exchangeRateInitial),
    exchangeRateLockedAt: po.exchangeRateLockedAt,
    exchangeRateLockedBy: po.exchangeRateLockedBy,
    exchangeRateLockNote: po.exchangeRateLockNote,
    paymentStatus: po.paymentStatus,
    paidAt: po.paidAt,
    paidBy: po.paidBy,
    paymentReference: po.paymentReference,
    paymentNote: po.paymentNote,
    dueDate: po.dueDate,
    shippingCost,
    otherCost,
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
    items,
    paymentEntries,
    createdByName: po.createdByName,
    paidByName: po.paidByName,
    itemCount: items.length,
    totalCostBase,
    totalPaidBase,
    outstandingBase: totalCostBase + shippingCost + otherCost - totalPaidBase,
  };
};

export const getPendingExchangeRateQueueFromPostgres = async (params: {
  storeId: string;
  storeCurrency: "LAK" | "THB" | "USD";
  supplierQuery?: string;
  receivedFrom?: string;
  receivedTo?: string;
  limit?: number;
}): Promise<PendingExchangeRateQueueItem[]> => {
  const pg = await getPostgresPurchaseReadContext();
  const { storeId, storeCurrency, supplierQuery, receivedFrom, receivedTo } = params;
  const limit = Math.min(200, Math.max(10, params.limit ?? 50));
  const hasSupplier = Boolean(supplierQuery?.trim());

  const rows = await pg.queryMany<PendingExchangeRateQueueRow>(
    `
      select
        po.id as "id",
        po.po_number as "poNumber",
        po.supplier_name as "supplierName",
        po.purchase_currency as "purchaseCurrency",
        po.exchange_rate_initial as "exchangeRateInitial",
        po.received_at as "receivedAt",
        po.expected_at as "expectedAt",
        po.due_date as "dueDate",
        po.payment_status as "paymentStatus",
        po.shipping_cost as "shippingCost",
        po.other_cost as "otherCost",
        (
          select count(*)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "itemCount",
        (
          select coalesce(sum(poi.unit_cost_base * poi.qty_ordered), 0)
          from purchase_order_items poi
          where poi.purchase_order_id = po.id
        ) as "totalCostBase",
        (
          select coalesce(sum(case
            when pop.entry_type = 'PAYMENT' then pop.amount_base
            when pop.entry_type = 'REVERSAL' then -pop.amount_base
            else 0
          end), 0)
          from purchase_order_payments pop
          where pop.purchase_order_id = po.id
        ) as "totalPaidBase"
      from purchase_orders po
      where po.store_id = :storeId
        and po.status = 'RECEIVED'
        and po.purchase_currency <> :storeCurrency
        and po.exchange_rate_locked_at is null
        and (
          :hasSupplier = false
          or lower(coalesce(po.supplier_name, '')) like :supplierLike
        )
        and (:receivedFrom is null or po.received_at >= :receivedFrom)
        and (:receivedTo is null or po.received_at <= :receivedTo)
      order by po.received_at desc, po.created_at desc
      limit :limit
    `,
    {
      replacements: {
        storeId,
        storeCurrency,
        hasSupplier,
        supplierLike: `%${supplierQuery?.trim().toLowerCase() ?? ""}%`,
        receivedFrom: receivedFrom ?? null,
        receivedTo: receivedTo ?? null,
        limit,
      },
    },
  );

  return rows.map((row) => {
    const totalCostBase = toNumber(row.totalCostBase);
    const totalPaidBase = toNumber(row.totalPaidBase);
    return {
      id: row.id,
      poNumber: row.poNumber,
      supplierName: row.supplierName,
      purchaseCurrency: row.purchaseCurrency,
      exchangeRateInitial: toNumber(row.exchangeRateInitial),
      receivedAt: row.receivedAt,
      expectedAt: row.expectedAt,
      dueDate: row.dueDate,
      paymentStatus: row.paymentStatus,
      itemCount: toNumber(row.itemCount),
      totalCostBase,
      outstandingBase:
        totalCostBase + toNumber(row.shippingCost) + toNumber(row.otherCost) - totalPaidBase,
    };
  });
};
