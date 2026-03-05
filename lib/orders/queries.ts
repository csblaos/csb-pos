import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import { defaultStoreVatMode, parseStoreCurrency } from "@/lib/finance/store-financial";
import {
  auditEvents,
  contacts,
  orderItems,
  productCategories,
  orders,
  productUnits,
  products,
  shippingProviders,
  storePaymentAccounts,
  stores,
  units,
  users,
} from "@/lib/db/schema";
import { getInventoryBalancesByStore } from "@/lib/inventory/queries";
import { timeDbQuery } from "@/lib/perf/server";
import { DEFAULT_SHIPPING_PROVIDER_SEEDS } from "@/lib/shipping/provider-master";
import { getStoreFinancialConfig } from "@/lib/stores/financial";
import { getGlobalPaymentPolicy } from "@/lib/system-config/policy";

export const PAID_LIKE_STATUSES = ["PAID", "PACKED", "SHIPPED"] as const;

export type OrderListTab = "ALL" | "PENDING_PAYMENT" | "PAID" | "SHIPPED";

export type OrderListItem = {
  id: string;
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
  paymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  customerName: string | null;
  contactDisplayName: string | null;
  total: number;
  paymentCurrency: "LAK" | "THB" | "USD";
  paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
};

export type OrderDetailItem = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  qty: number;
  qtyBase: number;
  priceBaseAtSale: number;
  costBaseAtSale: number;
  lineTotal: number;
};

export type OrderDetail = {
  id: string;
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
  paymentStatus:
    | "UNPAID"
    | "PENDING_PROOF"
    | "PAID"
    | "COD_PENDING_SETTLEMENT"
    | "COD_SETTLED"
    | "FAILED";
  contactId: string | null;
  contactDisplayName: string | null;
  contactPhone: string | null;
  contactLastInboundAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  subtotal: number;
  discount: number;
  vatAmount: number;
  shippingFeeCharged: number;
  total: number;
  paymentCurrency: "LAK" | "THB" | "USD";
  paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  paymentAccountId: string | null;
  paymentAccountDisplayName: string | null;
  paymentAccountBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountQrImageUrl: string | null;
  paymentSlipUrl: string | null;
  paymentProofSubmittedAt: string | null;
  shippingProvider: string | null;
  shippingLabelStatus: "NONE" | "REQUESTED" | "READY" | "FAILED";
  shippingLabelUrl: string | null;
  shippingLabelFileKey: string | null;
  shippingRequestId: string | null;
  shippingCarrier: string | null;
  trackingNo: string | null;
  shippingCost: number;
  codAmount: number;
  codFee: number;
  codReturnNote: string | null;
  codSettledAt: string | null;
  codReturnedAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  storeCurrency: string;
  storeVatMode: "EXCLUSIVE" | "INCLUSIVE";
  storeVatEnabled: boolean;
  cancelApproval: {
    approvedAt: string;
    cancelReason: string | null;
    approvedByName: string | null;
    approvedByRole: string | null;
    approvedByEmail: string | null;
    cancelledByName: string | null;
    approvalMode: "MANAGER_PASSWORD" | "SELF_SLIDE" | null;
  } | null;
  items: OrderDetailItem[];
};

export type OrderCatalogProductUnit = {
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
  pricePerUnit: number;
};

export type OrderCatalogProduct = {
  productId: string;
  sku: string;
  barcode: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  priceBase: number;
  costBase: number;
  baseUnitId: string;
  baseUnitCode: string;
  baseUnitNameTh: string;
  available: number;
  units: OrderCatalogProductUnit[];
};

export type OrderCatalogContact = {
  id: string;
  channel: "FACEBOOK" | "WHATSAPP";
  displayName: string;
  phone: string | null;
  lastInboundAt: string | null;
};

export type OrderCatalogPaymentAccount = {
  id: string;
  displayName: string;
  accountType: "BANK" | "LAO_QR";
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
};

export type OrderCatalogShippingProvider = {
  id: string;
  code: string;
  displayName: string;
  branchName: string | null;
  aliases: string[];
};

export type OrderCatalog = {
  storeCurrency: string;
  supportedCurrencies: Array<"LAK" | "THB" | "USD">;
  vatEnabled: boolean;
  vatRate: number;
  vatMode: "EXCLUSIVE" | "INCLUSIVE";
  paymentAccounts: OrderCatalogPaymentAccount[];
  shippingProviders: OrderCatalogShippingProvider[];
  requireSlipForLaoQr: boolean;
  products: OrderCatalogProduct[];
  contacts: OrderCatalogContact[];
};

const parseShippingProviderAliases = (raw: string | null | undefined) => {
  if (!raw) {
    return [];
  }
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) {
      return [];
    }
    return decoded
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
};

const parseAuditMetadataObject = (raw: string | null | undefined): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export type PaginatedOrderList = {
  rows: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  tab: OrderListTab;
};

export type CodReconcileItem = {
  id: string;
  orderNo: string;
  customerName: string | null;
  contactDisplayName: string | null;
  shippedAt: string | null;
  shippingProvider: string | null;
  shippingCarrier: string | null;
  expectedCodAmount: number;
  total: number;
  codAmount: number;
  codFee: number;
};

export type PaginatedCodReconcileList = {
  rows: CodReconcileItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const listFilter = (tab: OrderListTab) => {
  if (tab === "PENDING_PAYMENT") {
    return inArray(orders.status, [
      "PENDING_PAYMENT",
      "READY_FOR_PICKUP",
      "PICKED_UP_PENDING_PAYMENT",
    ]);
  }

  if (tab === "PAID") {
    return inArray(orders.status, ["PAID", "PACKED"]);
  }

  if (tab === "SHIPPED") {
    return inArray(orders.status, ["SHIPPED", "COD_RETURNED"]);
  }

  return undefined;
};

export async function listOrdersByTab(
  storeId: string,
  tab: OrderListTab,
  options?: { page?: number; pageSize?: number },
): Promise<PaginatedOrderList> {
  const whereCondition = listFilter(tab);
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 20, 100));
  const page = Math.max(1, options?.page ?? 1);
  const offset = (page - 1) * pageSize;
  const scopedWhere = whereCondition
    ? and(eq(orders.storeId, storeId), whereCondition)
    : eq(orders.storeId, storeId);

  let rows: OrderListItem[] = [];
  let countRows: Array<{ value: number }> = [];

  try {
    [rows, countRows] = await Promise.all([
      timeDbQuery("orders.list.rows", async () =>
        db
          .select({
            id: orders.id,
            orderNo: orders.orderNo,
            channel: orders.channel,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            customerName: orders.customerName,
            contactDisplayName: contacts.displayName,
            total: orders.total,
            paymentCurrency: orders.paymentCurrency,
            paymentMethod: orders.paymentMethod,
            createdAt: orders.createdAt,
            paidAt: orders.paidAt,
            shippedAt: orders.shippedAt,
          })
          .from(orders)
          .leftJoin(contacts, eq(orders.contactId, contacts.id))
          .where(scopedWhere)
          .orderBy(desc(orders.createdAt))
          .limit(pageSize)
          .offset(offset),
      ),
      timeDbQuery("orders.list.count", async () =>
        db
          .select({ value: sql<number>`count(*)` })
          .from(orders)
          .where(scopedWhere),
      ),
    ]);
  } catch {
    const [legacyRows, legacyCountRows] = await Promise.all([
      timeDbQuery("orders.list.rows.legacy", async () =>
        db
          .select({
            id: orders.id,
            orderNo: orders.orderNo,
            channel: orders.channel,
            status: orders.status,
            paymentStatus: sql<"UNPAID">`'UNPAID'`,
            customerName: orders.customerName,
            contactDisplayName: contacts.displayName,
            total: orders.total,
            createdAt: orders.createdAt,
            paidAt: orders.paidAt,
            shippedAt: orders.shippedAt,
            storeCurrency: stores.currency,
          })
          .from(orders)
          .innerJoin(stores, eq(orders.storeId, stores.id))
          .leftJoin(contacts, eq(orders.contactId, contacts.id))
          .where(scopedWhere)
          .orderBy(desc(orders.createdAt))
          .limit(pageSize)
          .offset(offset),
      ),
      timeDbQuery("orders.list.count.legacy", async () =>
        db
          .select({ value: sql<number>`count(*)` })
          .from(orders)
          .where(scopedWhere),
      ),
    ]);

    rows = legacyRows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      channel: row.channel,
      status: row.status,
      paymentStatus: row.paymentStatus,
      customerName: row.customerName,
      contactDisplayName: row.contactDisplayName,
      total: row.total,
      paymentCurrency: parseStoreCurrency(row.storeCurrency),
      paymentMethod: "CASH",
      createdAt: row.createdAt,
      paidAt: row.paidAt,
      shippedAt: row.shippedAt,
    }));
    countRows = legacyCountRows;
  }

  const total = Number(countRows[0]?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount,
    tab,
  };
}

export async function listPendingCodReconcile(
  storeId: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    provider?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedCodReconcileList> {
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 50, 200));
  const page = Math.max(1, options?.page ?? 1);
  const offset = (page - 1) * pageSize;
  const q = options?.q?.trim().toLowerCase() ?? "";
  const provider = options?.provider?.trim() ?? "";
  const dateFrom = options?.dateFrom?.trim() ?? "";
  const dateTo = options?.dateTo?.trim() ?? "";

  const whereClauses = [
    eq(orders.storeId, storeId),
    eq(orders.paymentMethod, "COD"),
    eq(orders.status, "SHIPPED"),
    eq(orders.paymentStatus, "COD_PENDING_SETTLEMENT"),
  ];

  if (provider.length > 0) {
    whereClauses.push(
      sql`coalesce(nullif(trim(${orders.shippingProvider}), ''), nullif(trim(${orders.shippingCarrier}), ''), 'ไม่ระบุ') = ${provider}`,
    );
  }

  if (q.length > 0) {
    const likePattern = `%${q}%`;
    whereClauses.push(
      sql`(
        lower(${orders.orderNo}) like ${likePattern}
        or lower(coalesce(${orders.customerName}, '')) like ${likePattern}
        or lower(coalesce(${contacts.displayName}, '')) like ${likePattern}
      )`,
    );
  }

  if (dateFrom.length > 0) {
    whereClauses.push(
      sql`${orders.shippedAt} >= datetime(${dateFrom}, 'start of day', 'utc')`,
    );
  }

  if (dateTo.length > 0) {
    whereClauses.push(
      sql`${orders.shippedAt} < datetime(${dateTo}, 'start of day', '+1 day', 'utc')`,
    );
  }

  const whereCondition = and(...whereClauses);

  const [rows, countRows] = await Promise.all([
    timeDbQuery("orders.codReconcile.rows", async () =>
      db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          customerName: orders.customerName,
          contactDisplayName: contacts.displayName,
          shippedAt: orders.shippedAt,
          shippingProvider: orders.shippingProvider,
          shippingCarrier: orders.shippingCarrier,
          expectedCodAmount: sql<number>`case
            when ${orders.codAmount} > 0 then ${orders.codAmount}
            else ${orders.total}
          end`,
          total: orders.total,
          codAmount: orders.codAmount,
          codFee: orders.codFee,
        })
        .from(orders)
        .leftJoin(contacts, eq(orders.contactId, contacts.id))
        .where(whereCondition)
        .orderBy(desc(orders.shippedAt), desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset),
    ),
    timeDbQuery("orders.codReconcile.count", async () =>
      db
        .select({ value: sql<number>`count(*)` })
        .from(orders)
        .leftJoin(contacts, eq(orders.contactId, contacts.id))
        .where(whereCondition),
    ),
  ]);

  const total = Number(countRows[0]?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function getOrderItemsForOrder(orderId: string) {
  const rows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      unitId: orderItems.unitId,
      qty: orderItems.qty,
      qtyBase: orderItems.qtyBase,
      priceBaseAtSale: orderItems.priceBaseAtSale,
      costBaseAtSale: orderItems.costBaseAtSale,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return rows;
}

export async function getOrderDetail(storeId: string, orderId: string): Promise<OrderDetail | null> {
  const paymentAccounts = alias(storePaymentAccounts, "payment_accounts");
  let order:
    | (Omit<OrderDetail, "items" | "cancelApproval"> & {
        contactDisplayName: string | null;
        contactPhone: string | null;
        contactLastInboundAt: string | null;
        createdByName: string | null;
      })
    | null = null;

  try {
    [order] = await db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        channel: orders.channel,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        contactId: orders.contactId,
        contactDisplayName: contacts.displayName,
        contactPhone: contacts.phone,
        contactLastInboundAt: contacts.lastInboundAt,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        customerAddress: orders.customerAddress,
        subtotal: orders.subtotal,
        discount: orders.discount,
        vatAmount: orders.vatAmount,
        shippingFeeCharged: orders.shippingFeeCharged,
        total: orders.total,
        paymentCurrency: orders.paymentCurrency,
        paymentMethod: orders.paymentMethod,
        paymentAccountId: orders.paymentAccountId,
        paymentAccountDisplayName: paymentAccounts.displayName,
        paymentAccountBankName: paymentAccounts.bankName,
        paymentAccountNumber: paymentAccounts.accountNumber,
        paymentAccountQrImageUrl: paymentAccounts.qrImageUrl,
        paymentSlipUrl: orders.paymentSlipUrl,
        paymentProofSubmittedAt: orders.paymentProofSubmittedAt,
        shippingProvider: orders.shippingProvider,
        shippingLabelStatus: orders.shippingLabelStatus,
        shippingLabelUrl: orders.shippingLabelUrl,
        shippingLabelFileKey: orders.shippingLabelFileKey,
        shippingRequestId: orders.shippingRequestId,
        shippingCarrier: orders.shippingCarrier,
        trackingNo: orders.trackingNo,
        shippingCost: orders.shippingCost,
        codAmount: orders.codAmount,
        codFee: orders.codFee,
        codReturnNote: orders.codReturnNote,
        codSettledAt: orders.codSettledAt,
        codReturnedAt: orders.codReturnedAt,
        paidAt: orders.paidAt,
        shippedAt: orders.shippedAt,
        createdBy: orders.createdBy,
        createdByName: users.name,
        createdAt: orders.createdAt,
        storeCurrency: stores.currency,
        storeVatMode: stores.vatMode,
        storeVatEnabled: stores.vatEnabled,
      })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .leftJoin(contacts, eq(orders.contactId, contacts.id))
      .leftJoin(paymentAccounts, eq(orders.paymentAccountId, paymentAccounts.id))
      .leftJoin(users, eq(orders.createdBy, users.id))
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
      .limit(1);
  } catch {
    [order] = await db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        channel: orders.channel,
        status: orders.status,
        paymentStatus: sql<"UNPAID">`'UNPAID'`,
        contactId: orders.contactId,
        contactDisplayName: contacts.displayName,
        contactPhone: contacts.phone,
        contactLastInboundAt: contacts.lastInboundAt,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        customerAddress: orders.customerAddress,
        subtotal: orders.subtotal,
        discount: orders.discount,
        vatAmount: orders.vatAmount,
        shippingFeeCharged: orders.shippingFeeCharged,
        total: orders.total,
        paymentCurrency: orders.paymentCurrency,
        paymentMethod: sql<"CASH">`'CASH'`,
        paymentAccountId: sql<string | null>`null`,
        paymentAccountDisplayName: sql<string | null>`null`,
        paymentAccountBankName: sql<string | null>`null`,
        paymentAccountNumber: sql<string | null>`null`,
        paymentAccountQrImageUrl: sql<string | null>`null`,
        paymentSlipUrl: sql<string | null>`null`,
        paymentProofSubmittedAt: sql<string | null>`null`,
        shippingProvider: sql<string | null>`null`,
        shippingLabelStatus: sql<"NONE">`'NONE'`,
        shippingLabelUrl: sql<string | null>`null`,
        shippingLabelFileKey: sql<string | null>`null`,
        shippingRequestId: sql<string | null>`null`,
        shippingCarrier: orders.shippingCarrier,
        trackingNo: orders.trackingNo,
        shippingCost: orders.shippingCost,
        codAmount: sql<number>`0`,
        codFee: sql<number>`0`,
        codReturnNote: sql<string | null>`null`,
        codSettledAt: sql<string | null>`null`,
        codReturnedAt: sql<string | null>`null`,
        paidAt: orders.paidAt,
        shippedAt: orders.shippedAt,
        createdBy: orders.createdBy,
        createdByName: users.name,
        createdAt: orders.createdAt,
        storeCurrency: stores.currency,
      })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .leftJoin(contacts, eq(orders.contactId, contacts.id))
      .leftJoin(users, eq(orders.createdBy, users.id))
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
      .limit(1)
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          paymentCurrency: parseStoreCurrency(row.storeCurrency),
          paymentMethod: "CASH" as const,
          storeVatMode: defaultStoreVatMode,
          storeVatEnabled: false,
        })),
      );
  }

  if (!order) {
    return null;
  }

  const itemRows = await db
    .select({
      id: orderItems.id,
      productId: products.id,
      productSku: products.sku,
      productName: products.name,
      unitId: units.id,
      unitCode: units.code,
      unitNameTh: units.nameTh,
      qty: orderItems.qty,
      qtyBase: orderItems.qtyBase,
      priceBaseAtSale: orderItems.priceBaseAtSale,
      costBaseAtSale: orderItems.costBaseAtSale,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(units, eq(orderItems.unitId, units.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(products.name));

  let cancelApproval: OrderDetail["cancelApproval"] = null;
  try {
    const [cancelAudit] = await db
      .select({
        occurredAt: auditEvents.occurredAt,
        actorName: auditEvents.actorName,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.scope, "STORE"),
          eq(auditEvents.storeId, storeId),
          eq(auditEvents.action, "order.cancel"),
          eq(auditEvents.entityType, "order"),
          eq(auditEvents.entityId, orderId),
          eq(auditEvents.result, "SUCCESS"),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt))
      .limit(1);

    if (cancelAudit) {
      const metadata = parseAuditMetadataObject(cancelAudit.metadata);
      const getMetadataText = (key: string) => {
        const value = metadata?.[key];
        if (typeof value !== "string") {
          return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      };
      cancelApproval = {
        approvedAt: cancelAudit.occurredAt,
        cancelReason: getMetadataText("cancelReason"),
        approvedByName: getMetadataText("approvedByName"),
        approvedByRole: getMetadataText("approvedByRole"),
        approvedByEmail: getMetadataText("approvedByEmail"),
        cancelledByName: cancelAudit.actorName?.trim() || null,
        approvalMode:
          metadata?.approvalMode === "MANAGER_PASSWORD" || metadata?.approvalMode === "SELF_SLIDE"
            ? metadata.approvalMode
            : null,
      };
    }
  } catch {
    cancelApproval = null;
  }

  return {
    ...order,
    cancelApproval,
    items: itemRows,
  };
}

export async function getOrderCatalogForStore(storeId: string): Promise<OrderCatalog> {
  const baseUnits = alias(units, "base_units");
  const [financial, globalPaymentPolicy] = await Promise.all([
    getStoreFinancialConfig(storeId),
    getGlobalPaymentPolicy(),
  ]);

  const [productRows, conversionRows, contactRows, paymentAccountRows, shippingProviderRows, balances] =
    await Promise.all([
      timeDbQuery("orders.catalog.products", async () =>
        db
          .select({
            productId: products.id,
            sku: products.sku,
            barcode: products.barcode,
            imageUrl: products.imageUrl,
            categoryId: products.categoryId,
            categoryName: productCategories.name,
            name: products.name,
            priceBase: products.priceBase,
            costBase: products.costBase,
            baseUnitId: products.baseUnitId,
            baseUnitCode: baseUnits.code,
            baseUnitNameTh: baseUnits.nameTh,
          })
          .from(products)
          .innerJoin(baseUnits, eq(products.baseUnitId, baseUnits.id))
          .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
          .where(and(eq(products.storeId, storeId), eq(products.active, true)))
          .orderBy(asc(products.name)),
      ),
      timeDbQuery("orders.catalog.conversions", async () =>
        db
          .select({
            productId: productUnits.productId,
            unitId: units.id,
            unitCode: units.code,
            unitNameTh: units.nameTh,
            multiplierToBase: productUnits.multiplierToBase,
            pricePerUnit: productUnits.pricePerUnit,
          })
          .from(productUnits)
          .innerJoin(products, eq(productUnits.productId, products.id))
          .innerJoin(units, eq(productUnits.unitId, units.id))
          .where(eq(products.storeId, storeId)),
      ),
      timeDbQuery("orders.catalog.contacts", async () =>
        db
          .select({
            id: contacts.id,
            channel: contacts.channel,
            displayName: contacts.displayName,
            phone: contacts.phone,
            lastInboundAt: contacts.lastInboundAt,
          })
          .from(contacts)
          .where(eq(contacts.storeId, storeId))
          .orderBy(desc(contacts.lastInboundAt), asc(contacts.displayName)),
      ),
      (async () => {
        try {
          return await timeDbQuery("orders.catalog.paymentAccounts", async () =>
            db
              .select({
                id: storePaymentAccounts.id,
                displayName: storePaymentAccounts.displayName,
                accountType: storePaymentAccounts.accountType,
                bankName: storePaymentAccounts.bankName,
                accountName: storePaymentAccounts.accountName,
                accountNumber: storePaymentAccounts.accountNumber,
                qrImageUrl: storePaymentAccounts.qrImageUrl,
                isDefault: storePaymentAccounts.isDefault,
                isActive: storePaymentAccounts.isActive,
              })
              .from(storePaymentAccounts)
              .where(
                and(
                  eq(storePaymentAccounts.storeId, storeId),
                  eq(storePaymentAccounts.isActive, true),
                ),
              )
              .orderBy(desc(storePaymentAccounts.isDefault), asc(storePaymentAccounts.createdAt)),
          );
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          return await timeDbQuery("orders.catalog.shippingProviders", async () =>
            db
              .select({
                id: shippingProviders.id,
                code: shippingProviders.code,
                displayName: shippingProviders.displayName,
                branchName: shippingProviders.branchName,
                aliases: shippingProviders.aliases,
              })
              .from(shippingProviders)
              .where(
                and(
                  eq(shippingProviders.storeId, storeId),
                  eq(shippingProviders.active, true),
                ),
              )
              .orderBy(asc(shippingProviders.sortOrder), asc(shippingProviders.displayName)),
          );
        } catch {
          return [];
        }
      })(),
      getInventoryBalancesByStore(storeId),
    ]);

  const balanceMap = new Map(balances.map((item) => [item.productId, item]));
  const conversionMap = new Map<
    string,
    Array<{
      unitId: string;
      unitCode: string;
      unitNameTh: string;
      multiplierToBase: number;
      pricePerUnit: number | null;
    }>
  >();

  for (const row of conversionRows) {
    const current = conversionMap.get(row.productId) ?? [];
    current.push({
      unitId: row.unitId,
      unitCode: row.unitCode,
      unitNameTh: row.unitNameTh,
      multiplierToBase: row.multiplierToBase,
      pricePerUnit: row.pricePerUnit ?? null,
    });
    conversionMap.set(row.productId, current);
  }

  const productsPayload: OrderCatalogProduct[] = productRows.map((product) => {
    const balance = balanceMap.get(product.productId);
    const conversions = conversionMap.get(product.productId) ?? [];

    const unitsPayloadMap = new Map<string, OrderCatalogProductUnit>();
    unitsPayloadMap.set(product.baseUnitId, {
      unitId: product.baseUnitId,
      unitCode: product.baseUnitCode,
      unitNameTh: product.baseUnitNameTh,
      multiplierToBase: 1,
      pricePerUnit: product.priceBase,
    });

    for (const conversion of conversions) {
      if (unitsPayloadMap.has(conversion.unitId)) {
        continue;
      }
      unitsPayloadMap.set(conversion.unitId, {
        unitId: conversion.unitId,
        unitCode: conversion.unitCode,
        unitNameTh: conversion.unitNameTh,
        multiplierToBase: conversion.multiplierToBase,
        pricePerUnit:
          conversion.pricePerUnit ?? product.priceBase * conversion.multiplierToBase,
      });
    }

    const unitsPayload: OrderCatalogProductUnit[] = Array.from(unitsPayloadMap.values()).sort(
      (a, b) => a.multiplierToBase - b.multiplierToBase,
    );

    return {
      productId: product.productId,
      sku: product.sku,
      barcode: product.barcode,
      imageUrl: product.imageUrl,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      name: product.name,
      priceBase: product.priceBase,
      costBase: product.costBase,
      baseUnitId: product.baseUnitId,
      baseUnitCode: product.baseUnitCode,
      baseUnitNameTh: product.baseUnitNameTh,
      available: balance?.available ?? 0,
      units: unitsPayload,
    };
  });

  return {
    storeCurrency: financial?.currency ?? "LAK",
    supportedCurrencies: financial?.supportedCurrencies ?? ["LAK"],
    vatEnabled: financial?.vatEnabled ?? false,
    vatRate: financial?.vatRate ?? 0,
    vatMode: financial?.vatMode ?? defaultStoreVatMode,
    paymentAccounts: paymentAccountRows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      accountType: String(row.accountType) === "LAO_QR" ? "LAO_QR" : "BANK",
      bankName: row.bankName,
      accountName: row.accountName,
      accountNumber: row.accountNumber,
      qrImageUrl: row.qrImageUrl,
      isDefault: row.isDefault,
      isActive: row.isActive,
    })),
    shippingProviders:
      shippingProviderRows.length > 0
        ? shippingProviderRows.map((row) => ({
            id: row.id,
            code: row.code,
            displayName: row.displayName,
            branchName: row.branchName,
            aliases: parseShippingProviderAliases(row.aliases),
          }))
        : DEFAULT_SHIPPING_PROVIDER_SEEDS.map((item) => ({
            id: item.code.toLowerCase(),
            code: item.code,
            displayName: item.displayName,
            branchName: null,
            aliases: [],
          })),
    requireSlipForLaoQr: globalPaymentPolicy.requireSlipForLaoQr,
    products: productsPayload,
    contacts: contactRows,
  };
}

export async function generateOrderNo(storeId: string) {
  const [counterRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        sql`${orders.createdAt} >= datetime('now', 'localtime', 'start of day', 'utc')`,
        sql`${orders.createdAt} < datetime('now', 'localtime', 'start of day', '+1 day', 'utc')`,
      ),
    );

  const count = Number(counterRow?.count ?? 0) + 1;
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  return `SO-${datePart}-${String(count).padStart(4, "0")}`;
}
