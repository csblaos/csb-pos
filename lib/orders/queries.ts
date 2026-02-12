import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import {
  contacts,
  orderItems,
  orders,
  productUnits,
  products,
  stores,
  units,
  users,
} from "@/lib/db/schema";
import { getInventoryBalancesByStore } from "@/lib/inventory/queries";
import { timeDbQuery } from "@/lib/perf/server";

export const PAID_LIKE_STATUSES = ["PAID", "PACKED", "SHIPPED"] as const;

export type OrderListTab = "ALL" | "PENDING_PAYMENT" | "PAID" | "SHIPPED";

export type OrderListItem = {
  id: string;
  orderNo: string;
  channel: "WALK_IN" | "FACEBOOK" | "WHATSAPP";
  status: "DRAFT" | "PENDING_PAYMENT" | "PAID" | "PACKED" | "SHIPPED" | "CANCELLED";
  customerName: string | null;
  contactDisplayName: string | null;
  total: number;
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
  status: "DRAFT" | "PENDING_PAYMENT" | "PAID" | "PACKED" | "SHIPPED" | "CANCELLED";
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
  shippingCarrier: string | null;
  trackingNo: string | null;
  shippingCost: number;
  paidAt: string | null;
  shippedAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  storeCurrency: string;
  items: OrderDetailItem[];
};

export type OrderCatalogProductUnit = {
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
};

export type OrderCatalogProduct = {
  productId: string;
  sku: string;
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

export type OrderCatalog = {
  storeCurrency: string;
  vatEnabled: boolean;
  vatRate: number;
  products: OrderCatalogProduct[];
  contacts: OrderCatalogContact[];
};

export type PaginatedOrderList = {
  rows: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  tab: OrderListTab;
};

const listFilter = (tab: OrderListTab) => {
  if (tab === "PENDING_PAYMENT") {
    return eq(orders.status, "PENDING_PAYMENT");
  }

  if (tab === "PAID") {
    return inArray(orders.status, ["PAID", "PACKED"]);
  }

  if (tab === "SHIPPED") {
    return eq(orders.status, "SHIPPED");
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

  const [rows, countRows] = await Promise.all([
    timeDbQuery("orders.list.rows", async () =>
      db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          channel: orders.channel,
          status: orders.status,
          customerName: orders.customerName,
          contactDisplayName: contacts.displayName,
          total: orders.total,
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
  const [order] = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      channel: orders.channel,
      status: orders.status,
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
      shippingCarrier: orders.shippingCarrier,
      trackingNo: orders.trackingNo,
      shippingCost: orders.shippingCost,
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
    .limit(1);

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

  return {
    ...order,
    items: itemRows,
  };
}

export async function getOrderCatalogForStore(storeId: string): Promise<OrderCatalog> {
  const baseUnits = alias(units, "base_units");

  const [storeRows, productRows, conversionRows, contactRows, balances] = await Promise.all([
    timeDbQuery("orders.catalog.storeConfig", async () =>
      db
        .select({
          currency: stores.currency,
          vatEnabled: stores.vatEnabled,
          vatRate: stores.vatRate,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1),
    ),
    timeDbQuery("orders.catalog.products", async () =>
      db
        .select({
          productId: products.id,
          sku: products.sku,
          name: products.name,
          priceBase: products.priceBase,
          costBase: products.costBase,
          baseUnitId: products.baseUnitId,
          baseUnitCode: baseUnits.code,
          baseUnitNameTh: baseUnits.nameTh,
        })
        .from(products)
        .innerJoin(baseUnits, eq(products.baseUnitId, baseUnits.id))
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
    getInventoryBalancesByStore(storeId),
  ]);

  const storeConfig = storeRows[0] ?? {
    currency: "LAK",
    vatEnabled: false,
    vatRate: 0,
  };

  const balanceMap = new Map(balances.map((item) => [item.productId, item]));
  const conversionMap = new Map<string, OrderCatalogProductUnit[]>();

  for (const row of conversionRows) {
    const current = conversionMap.get(row.productId) ?? [];
    current.push({
      unitId: row.unitId,
      unitCode: row.unitCode,
      unitNameTh: row.unitNameTh,
      multiplierToBase: row.multiplierToBase,
    });
    conversionMap.set(row.productId, current);
  }

  const productsPayload: OrderCatalogProduct[] = productRows.map((product) => {
    const balance = balanceMap.get(product.productId);
    const conversions = conversionMap.get(product.productId) ?? [];

    const unitsPayload: OrderCatalogProductUnit[] = [
      {
        unitId: product.baseUnitId,
        unitCode: product.baseUnitCode,
        unitNameTh: product.baseUnitNameTh,
        multiplierToBase: 1,
      },
      ...conversions,
    ].sort((a, b) => a.multiplierToBase - b.multiplierToBase);

    return {
      productId: product.productId,
      sku: product.sku,
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
    storeCurrency: storeConfig.currency,
    vatEnabled: Boolean(storeConfig.vatEnabled),
    vatRate: storeConfig.vatRate,
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
