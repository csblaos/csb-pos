import { unstable_cache } from "next/cache";

import { defaultStoreVatMode } from "@/lib/finance/store-financial";
import { getInventoryBalancesByStore } from "@/lib/inventory/queries";
import { generateOrderNoInPostgres } from "@/lib/orders/postgres-write";
import { timeDbQuery } from "@/lib/perf/server";
import { DEFAULT_SHIPPING_PROVIDER_SEEDS } from "@/lib/shipping/provider-master";
import { resolvePaymentQrImageUrl, resolveProductImageUrl } from "@/lib/storage/r2";
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
  shippingProvider: string | null;
  shippingCarrier: string | null;
  trackingNo: string | null;
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

type OrderCatalogProductRow = {
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
};

type OrderCatalogConversionRow = {
  productId: string;
  unitId: string;
  unitCode: string;
  unitNameTh: string;
  multiplierToBase: number;
  pricePerUnit: number | null;
};

type OrderCatalogPaymentAccountRow = {
  id: string;
  displayName: string;
  accountType: string;
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
};

type OrderCatalogShippingProviderRow = {
  id: string;
  code: string;
  displayName: string;
  branchName: string | null;
  aliases: string | null;
};

type OrderCatalogStaticPayload = {
  financial: Awaited<ReturnType<typeof getStoreFinancialConfig>>;
  globalPaymentPolicy: Awaited<ReturnType<typeof getGlobalPaymentPolicy>>;
  productRows: OrderCatalogProductRow[];
  conversionRows: OrderCatalogConversionRow[];
  contactRows: OrderCatalogContact[];
  paymentAccountRows: OrderCatalogPaymentAccountRow[];
  shippingProviderRows: OrderCatalogShippingProviderRow[];
};

const mapOrderCatalogPaymentAccount = (row: {
  id: string;
  displayName: string;
  accountType: string;
  bankName: string | null;
  accountName: string;
  accountNumber: string | null;
  qrImageUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
}): OrderCatalogPaymentAccount => ({
  id: row.id,
  displayName: row.displayName,
  accountType: String(row.accountType) === "LAO_QR" ? "LAO_QR" : "BANK",
  bankName: row.bankName,
  accountName: row.accountName,
  accountNumber: row.accountNumber,
  qrImageUrl: resolvePaymentQrImageUrl(row.qrImageUrl),
  isDefault: row.isDefault,
  isActive: row.isActive,
});

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

const parseAuditMetadataObject = (raw: unknown): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") {
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

type OrderListItemRow = {
  id: string;
  orderNo: string;
  channel: OrderListItem["channel"];
  status: OrderListItem["status"];
  paymentStatus: OrderListItem["paymentStatus"];
  customerName: string | null;
  contactDisplayName: string | null;
  total: number;
  paymentCurrency: OrderListItem["paymentCurrency"];
  paymentMethod: OrderListItem["paymentMethod"];
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  shippingProvider: string | null;
  shippingCarrier: string | null;
  trackingNo: string | null;
};

type OrderDetailRow = Omit<OrderDetail, "items" | "cancelApproval">;

type OrderCancelAuditRow = {
  occurredAt: string;
  actorName: string | null;
  metadata: unknown;
};

type PostgresQueryMany = typeof import("@/lib/db/query").queryMany;
type PostgresQueryOne = typeof import("@/lib/db/query").queryOne;

type PostgresOrdersReadContext = {
  queryMany: PostgresQueryMany;
  queryOne: PostgresQueryOne;
};

const getPostgresOrdersReadContext = async (): Promise<PostgresOrdersReadContext> => {
  const [{ queryMany, queryOne }, { isPostgresConfigured }] = await Promise.all([
    import("@/lib/db/query"),
    import("@/lib/db/sequelize"),
  ]);

  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL orders read path is not configured");
  }

  return {
    queryMany,
    queryOne,
  };
};

const getOrderListStatusSql = (tab: OrderListTab) => {
  if (tab === "PENDING_PAYMENT") {
    return "and o.status in ('PENDING_PAYMENT', 'READY_FOR_PICKUP', 'PICKED_UP_PENDING_PAYMENT')";
  }

  if (tab === "PAID") {
    return "and o.status in ('PAID', 'PACKED')";
  }

  if (tab === "SHIPPED") {
    return "and o.status in ('SHIPPED', 'COD_RETURNED')";
  }

  return "";
};

const listOrdersByTabPostgres = async (
  pg: PostgresOrdersReadContext,
  storeId: string,
  tab: OrderListTab,
  options?: { page?: number; pageSize?: number },
): Promise<PaginatedOrderList> => {
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 20, 100));
  const page = Math.max(1, options?.page ?? 1);
  const offset = (page - 1) * pageSize;
  const statusSql = getOrderListStatusSql(tab);

  const [rows, countRow] = await Promise.all([
    timeDbQuery("orders.list.rows.pg", async () =>
      pg.queryMany<OrderListItemRow>(
        `
          select
            o.id,
            o.order_no as "orderNo",
            o.channel,
            o.status,
            o.payment_status as "paymentStatus",
            o.customer_name as "customerName",
            c.display_name as "contactDisplayName",
            o.total,
            o.payment_currency as "paymentCurrency",
            o.payment_method as "paymentMethod",
            o.created_at as "createdAt",
            o.paid_at as "paidAt",
            o.shipped_at as "shippedAt",
            o.shipping_provider as "shippingProvider",
            o.shipping_carrier as "shippingCarrier",
            o.tracking_no as "trackingNo"
          from orders o
          left join contacts c on o.contact_id = c.id
          where o.store_id = :storeId
          ${statusSql}
          order by o.created_at desc
          limit :limit
          offset :offset
        `,
        {
          replacements: {
            storeId,
            limit: pageSize,
            offset,
          },
        },
      ),
    ),
    timeDbQuery("orders.list.count.pg", async () =>
      pg.queryOne<{ value: string | number }>(
        `
          select count(*) as value
          from orders o
          where o.store_id = :storeId
          ${statusSql}
        `,
        {
          replacements: { storeId },
        },
      ),
    ),
  ]);

  const total = Number(countRow?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount,
    tab,
  };
};

export async function listOrdersByTab(
  storeId: string,
  tab: OrderListTab,
  options?: { page?: number; pageSize?: number },
): Promise<PaginatedOrderList> {
  const pg = await getPostgresOrdersReadContext();
  return listOrdersByTabPostgres(pg, storeId, tab, options);
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
  const pg = await getPostgresOrdersReadContext();
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 50, 200));
  const page = Math.max(1, options?.page ?? 1);
  const offset = (page - 1) * pageSize;
  const q = options?.q?.trim().toLowerCase() ?? "";
  const provider = options?.provider?.trim() ?? "";
  const dateFrom = options?.dateFrom?.trim() ?? "";
  const dateTo = options?.dateTo?.trim() ?? "";

  const qPattern = q.length > 0 ? `%${q}%` : null;
  const providerParam = provider.length > 0 ? provider : null;
  const dateFromParam = dateFrom.length > 0 ? `${dateFrom}T00:00:00.000Z` : null;
  const dateToParam =
    dateTo.length > 0
      ? new Date(`${dateTo}T00:00:00.000Z`).toISOString()
      : null;
  const dateToExclusive =
    dateToParam !== null
      ? new Date(new Date(dateToParam).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null;

  const [rows, countRow] = await Promise.all([
    timeDbQuery("orders.codReconcile.rows.pg", async () =>
      pg.queryMany<CodReconcileItem>(
        `
          select
            o.id,
            o.order_no as "orderNo",
            o.customer_name as "customerName",
            c.display_name as "contactDisplayName",
            o.shipped_at as "shippedAt",
            o.shipping_provider as "shippingProvider",
            o.shipping_carrier as "shippingCarrier",
            case
              when o.cod_amount > 0 then o.cod_amount
              else o.total
            end as "expectedCodAmount",
            o.total,
            o.cod_amount as "codAmount",
            o.cod_fee as "codFee"
          from orders o
          left join contacts c on o.contact_id = c.id
          where
            o.store_id = :storeId
            and o.payment_method = 'COD'
            and o.status = 'SHIPPED'
            and o.payment_status = 'COD_PENDING_SETTLEMENT'
            and (
              :provider is null
              or coalesce(nullif(trim(o.shipping_provider), ''), nullif(trim(o.shipping_carrier), ''), 'ไม่ระบุ') = :provider
            )
            and (
              :qPattern is null
              or lower(o.order_no) like lower(:qPattern)
              or lower(coalesce(o.customer_name, '')) like lower(:qPattern)
              or lower(coalesce(c.display_name, '')) like lower(:qPattern)
            )
            and (:dateFrom is null or o.shipped_at >= :dateFrom)
            and (:dateToExclusive is null or o.shipped_at < :dateToExclusive)
          order by o.shipped_at desc, o.created_at desc
          limit :limit
          offset :offset
        `,
        {
          replacements: {
            storeId,
            provider: providerParam,
            qPattern,
            dateFrom: dateFromParam,
            dateToExclusive,
            limit: pageSize,
            offset,
          },
        },
      ),
    ),
    timeDbQuery("orders.codReconcile.count.pg", async () =>
      pg.queryOne<{ value: number | string }>(
        `
          select count(*)::int as value
          from orders o
          left join contacts c on o.contact_id = c.id
          where
            o.store_id = :storeId
            and o.payment_method = 'COD'
            and o.status = 'SHIPPED'
            and o.payment_status = 'COD_PENDING_SETTLEMENT'
            and (
              :provider is null
              or coalesce(nullif(trim(o.shipping_provider), ''), nullif(trim(o.shipping_carrier), ''), 'ไม่ระบุ') = :provider
            )
            and (
              :qPattern is null
              or lower(o.order_no) like lower(:qPattern)
              or lower(coalesce(o.customer_name, '')) like lower(:qPattern)
              or lower(coalesce(c.display_name, '')) like lower(:qPattern)
            )
            and (:dateFrom is null or o.shipped_at >= :dateFrom)
            and (:dateToExclusive is null or o.shipped_at < :dateToExclusive)
        `,
        {
          replacements: {
            storeId,
            provider: providerParam,
            qPattern,
            dateFrom: dateFromParam,
            dateToExclusive,
          },
        },
      ),
    ),
  ]);

  const total = Number(countRow?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function listPendingCodReconcileProviders(
  storeId: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const pg = await getPostgresOrdersReadContext();
  const dateFrom = options?.dateFrom?.trim() ?? "";
  const dateTo = options?.dateTo?.trim() ?? "";
  const dateFromParam = dateFrom.length > 0 ? `${dateFrom}T00:00:00.000Z` : null;
  const dateToParam =
    dateTo.length > 0 ? new Date(`${dateTo}T00:00:00.000Z`).toISOString() : null;
  const dateToExclusive =
    dateToParam !== null
      ? new Date(new Date(dateToParam).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null;

  const rows = await timeDbQuery("orders.codReconcile.providers.pg", async () =>
    pg.queryMany<{ provider: string }>(
      `
        select
          coalesce(
            nullif(trim(o.shipping_provider), ''),
            nullif(trim(o.shipping_carrier), ''),
            'ไม่ระบุ'
          ) as provider
        from orders o
        where
          o.store_id = :storeId
          and o.payment_method = 'COD'
          and o.status = 'SHIPPED'
          and o.payment_status = 'COD_PENDING_SETTLEMENT'
          and (:dateFrom is null or o.shipped_at >= :dateFrom)
          and (:dateToExclusive is null or o.shipped_at < :dateToExclusive)
        group by 1
        order by 1 asc
      `,
      {
        replacements: {
          storeId,
          dateFrom: dateFromParam,
          dateToExclusive,
        },
      },
    ),
  );

  return rows.map((row) => row.provider);
}

export async function getOrderItemsForOrder(orderId: string) {
  const pg = await getPostgresOrdersReadContext();
  return timeDbQuery("orders.items.pg", async () =>
    pg.queryMany<{
      id: string;
      orderId: string;
      productId: string;
      unitId: string;
      qty: number;
      qtyBase: number;
      priceBaseAtSale: number;
      costBaseAtSale: number;
      lineTotal: number;
    }>(
      `
        select
          id,
          order_id as "orderId",
          product_id as "productId",
          unit_id as "unitId",
          qty,
          qty_base as "qtyBase",
          price_base_at_sale as "priceBaseAtSale",
          cost_base_at_sale as "costBaseAtSale",
          line_total as "lineTotal"
        from order_items
        where order_id = :orderId
      `,
      {
        replacements: { orderId },
      },
    ),
  );
}

const getOrderDetailPostgres = async (
  pg: PostgresOrdersReadContext,
  storeId: string,
  orderId: string,
): Promise<OrderDetail | null> => {
  const order = await timeDbQuery("orders.detail.main.pg", async () =>
    pg.queryOne<OrderDetailRow>(
      `
        select
          o.id,
          o.order_no as "orderNo",
          o.channel,
          o.status,
          o.payment_status as "paymentStatus",
          o.contact_id as "contactId",
          c.display_name as "contactDisplayName",
          c.phone as "contactPhone",
          c.last_inbound_at as "contactLastInboundAt",
          o.customer_name as "customerName",
          o.customer_phone as "customerPhone",
          o.customer_address as "customerAddress",
          o.subtotal,
          o.discount,
          o.vat_amount as "vatAmount",
          o.shipping_fee_charged as "shippingFeeCharged",
          o.total,
          o.payment_currency as "paymentCurrency",
          o.payment_method as "paymentMethod",
          o.payment_account_id as "paymentAccountId",
          spa.display_name as "paymentAccountDisplayName",
          spa.bank_name as "paymentAccountBankName",
          spa.account_number as "paymentAccountNumber",
          spa.qr_image_url as "paymentAccountQrImageUrl",
          o.payment_slip_url as "paymentSlipUrl",
          o.payment_proof_submitted_at as "paymentProofSubmittedAt",
          o.shipping_provider as "shippingProvider",
          o.shipping_label_status as "shippingLabelStatus",
          o.shipping_label_url as "shippingLabelUrl",
          o.shipping_label_file_key as "shippingLabelFileKey",
          o.shipping_request_id as "shippingRequestId",
          o.shipping_carrier as "shippingCarrier",
          o.tracking_no as "trackingNo",
          o.shipping_cost as "shippingCost",
          o.cod_amount as "codAmount",
          o.cod_fee as "codFee",
          o.cod_return_note as "codReturnNote",
          o.cod_settled_at as "codSettledAt",
          o.cod_returned_at as "codReturnedAt",
          o.paid_at as "paidAt",
          o.shipped_at as "shippedAt",
          o.created_by as "createdBy",
          u.name as "createdByName",
          o.created_at as "createdAt",
          s.currency as "storeCurrency",
          s.vat_mode as "storeVatMode",
          s.vat_enabled as "storeVatEnabled"
        from orders o
        inner join stores s on o.store_id = s.id
        left join contacts c on o.contact_id = c.id
        left join store_payment_accounts spa on o.payment_account_id = spa.id
        left join users u on o.created_by = u.id
        where o.store_id = :storeId
          and o.id = :orderId
        limit 1
      `,
      {
        replacements: {
          storeId,
          orderId,
        },
      },
    ),
  );

  if (!order) {
    return null;
  }

  const [items, cancelAudit] = await Promise.all([
    timeDbQuery("orders.detail.items.pg", async () =>
      pg.queryMany<OrderDetailItem>(
        `
          select
            oi.id,
            p.id as "productId",
            p.sku as "productSku",
            p.name as "productName",
            u.id as "unitId",
            u.code as "unitCode",
            u.name_th as "unitNameTh",
            oi.qty,
            oi.qty_base as "qtyBase",
            oi.price_base_at_sale as "priceBaseAtSale",
            oi.cost_base_at_sale as "costBaseAtSale",
            oi.line_total as "lineTotal"
          from order_items oi
          inner join products p on oi.product_id = p.id
          inner join units u on oi.unit_id = u.id
          where oi.order_id = :orderId
          order by p.name asc
        `,
        {
          replacements: { orderId },
        },
      ),
    ),
    timeDbQuery("orders.detail.cancelAudit.pg", async () =>
      pg.queryOne<OrderCancelAuditRow>(
        `
          select
            occurred_at as "occurredAt",
            actor_name as "actorName",
            metadata
          from audit_events
          where scope = 'STORE'
            and store_id = :storeId
            and action = 'order.cancel'
            and entity_type = 'order'
            and entity_id = :orderId
            and result = 'SUCCESS'
          order by occurred_at desc
          limit 1
        `,
        {
          replacements: {
            storeId,
            orderId,
          },
        },
      ),
    ),
  ]);

  let cancelApproval: OrderDetail["cancelApproval"] = null;
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

  return {
    ...order,
    paymentAccountQrImageUrl: resolvePaymentQrImageUrl(order.paymentAccountQrImageUrl),
    cancelApproval,
    items,
  };
};

const getOrderCatalogStaticForStore = unstable_cache(
  async (storeId: string): Promise<OrderCatalogStaticPayload> => {
    const pg = await getPostgresOrdersReadContext();
    const [financial, globalPaymentPolicy] = await Promise.all([
      getStoreFinancialConfig(storeId),
      getGlobalPaymentPolicy(),
    ]);

    const [
      productRows,
      conversionRows,
      contactRows,
      paymentAccountRows,
      shippingProviderRows,
    ] = await Promise.all([
      timeDbQuery("orders.catalog.products.pg", async () =>
        pg.queryMany<OrderCatalogProductRow>(
          `
            select
              p.id as "productId",
              p.sku,
              p.barcode,
              p.image_url as "imageUrl",
              p.category_id as "categoryId",
              pc.name as "categoryName",
              p.name,
              p.price_base as "priceBase",
              p.cost_base as "costBase",
              p.base_unit_id as "baseUnitId",
              bu.code as "baseUnitCode",
              bu.name_th as "baseUnitNameTh"
            from products p
            inner join units bu on p.base_unit_id = bu.id
            left join product_categories pc on p.category_id = pc.id
            where p.store_id = :storeId and p.active = true
            order by p.name asc
          `,
          {
            replacements: { storeId },
          },
        ),
      ),
      timeDbQuery("orders.catalog.conversions.pg", async () =>
        pg.queryMany<OrderCatalogConversionRow>(
          `
            select
              pu.product_id as "productId",
              u.id as "unitId",
              u.code as "unitCode",
              u.name_th as "unitNameTh",
              pu.multiplier_to_base as "multiplierToBase",
              pu.price_per_unit as "pricePerUnit"
            from product_units pu
            inner join products p on pu.product_id = p.id
            inner join units u on pu.unit_id = u.id
            where p.store_id = :storeId
          `,
          {
            replacements: { storeId },
          },
        ),
      ),
      timeDbQuery("orders.catalog.contacts.pg", async () =>
        pg.queryMany<OrderCatalogContact>(
          `
            select
              id,
              channel,
              display_name as "displayName",
              phone,
              last_inbound_at as "lastInboundAt"
            from contacts
            where store_id = :storeId
            order by last_inbound_at desc nulls last, display_name asc
          `,
          {
            replacements: { storeId },
          },
        ),
      ),
      timeDbQuery("orders.catalog.paymentAccounts.pg", async () =>
        pg.queryMany<OrderCatalogPaymentAccountRow>(
          `
            select
              id,
              display_name as "displayName",
              account_type as "accountType",
              bank_name as "bankName",
              account_name as "accountName",
              account_number as "accountNumber",
              qr_image_url as "qrImageUrl",
              is_default as "isDefault",
              is_active as "isActive"
            from store_payment_accounts
            where store_id = :storeId and is_active = true
            order by is_default desc, created_at asc
          `,
          {
            replacements: { storeId },
          },
        ),
      ),
      timeDbQuery("orders.catalog.shippingProviders.pg", async () =>
        pg.queryMany<OrderCatalogShippingProviderRow>(
          `
            select
              id,
              code,
              display_name as "displayName",
              branch_name as "branchName",
              aliases
            from shipping_providers
            where store_id = :storeId and active = true
            order by sort_order asc, display_name asc
          `,
          {
            replacements: { storeId },
          },
        ),
      ),
    ]);

    return {
      financial,
      globalPaymentPolicy,
      productRows,
      conversionRows,
      contactRows,
      paymentAccountRows,
      shippingProviderRows,
    };
  },
  ["orders.catalog.static.v1"],
  { revalidate: 60 },
);

export async function getOrderDetail(storeId: string, orderId: string): Promise<OrderDetail | null> {
  const pg = await getPostgresOrdersReadContext();
  return getOrderDetailPostgres(pg, storeId, orderId);
}

export async function getOrderCatalogForStore(storeId: string): Promise<OrderCatalog> {
  const [{ financial, globalPaymentPolicy, productRows, conversionRows, contactRows, paymentAccountRows, shippingProviderRows }, balances] =
    await Promise.all([
      getOrderCatalogStaticForStore(storeId),
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
      imageUrl: resolveProductImageUrl(product.imageUrl),
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
    paymentAccounts: paymentAccountRows.map(mapOrderCatalogPaymentAccount),
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

export async function getActiveQrPaymentAccountsForStore(
  storeId: string,
): Promise<OrderCatalogPaymentAccount[]> {
  const pg = await getPostgresOrdersReadContext();
  const rows = await timeDbQuery("orders.detail.qrPaymentAccounts.pg", async () =>
    pg.queryMany<{
      id: string;
      displayName: string;
      accountType: string;
      bankName: string | null;
      accountName: string;
      accountNumber: string | null;
      qrImageUrl: string | null;
      isDefault: boolean;
      isActive: boolean;
    }>(
      `
        select
          id,
          display_name as "displayName",
          account_type as "accountType",
          bank_name as "bankName",
          account_name as "accountName",
          account_number as "accountNumber",
          qr_image_url as "qrImageUrl",
          is_default as "isDefault",
          is_active as "isActive"
        from store_payment_accounts
        where store_id = :storeId
          and is_active = true
          and account_type = 'LAO_QR'
        order by is_default desc, created_at asc
      `,
      {
        replacements: { storeId },
      },
    ),
  );

  return rows.map(mapOrderCatalogPaymentAccount);
}

export async function generateOrderNo(storeId: string) {
  return generateOrderNoInPostgres(storeId);
}
