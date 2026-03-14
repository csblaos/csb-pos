"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, Clock3, Expand, ExternalLink, MoreHorizontal, ScanLine, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { BarcodeScannerPanel } from "@/components/app/barcode-scanner-panel";
import {
  ManagerCancelApprovalModal,
  type ManagerCancelApprovalPayload,
  type ManagerCancelApprovalResult,
} from "@/components/app/manager-cancel-approval-modal";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import { currencyLabel, parseStoreCurrency, vatModeLabel } from "@/lib/finance/store-financial";
import { getAppLanguageLocale, resolveAppLanguage } from "@/lib/i18n/config";
import { createTranslator, formatNumberByLanguage } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import { resolveLaosBankDisplayName } from "@/lib/payments/laos-banks";
import {
  NEW_ORDER_DRAFT_DEFAULT_MAX_AGE_MS,
  clearNewOrderDraftPayload,
  clearNewOrderDraftState,
  getNewOrderDraftPayload,
  setNewOrderDraftFlag,
  setNewOrderDraftPayload,
  type NewOrderDraftPayload,
} from "@/lib/orders/new-order-draft";
import type {
  OrderCatalog,
  OrderListItem,
  OrderListTab,
  PaginatedOrderList,
} from "@/lib/orders/queries";
import {
  buildReceiptPrintHtml,
  buildShippingLabelPrintHtml,
  printHtmlViaWindow,
} from "@/lib/orders/print-client";
import { computeOrderTotals } from "@/lib/orders/totals";
import {
  createOrderSchema,
  type CreateOrderFormInput,
  type CreateOrderInput,
} from "@/lib/orders/validation";

type OrdersManagementProps =
  | {
      mode?: "manage";
      ordersPage: PaginatedOrderList;
      activeTab: OrderListTab;
      catalog: OrderCatalog;
      language?: AppLanguage;
      canCreate: boolean;
      canRequestCancel?: boolean;
      canSelfApproveCancel?: boolean;
    }
  | {
      mode: "create-only";
      catalog: OrderCatalog;
      language?: AppLanguage;
      canCreate: boolean;
      canRequestCancel?: boolean;
      canSelfApproveCancel?: boolean;
    };

type TabKey = OrderListTab;
type OrdersTranslate = ReturnType<typeof createTranslator>;

const tabOptions: Array<{ key: TabKey; labelKey: string }> = [
  { key: "ALL", labelKey: "orders.tab.all" },
  { key: "PENDING_PAYMENT", labelKey: "orders.tab.pending" },
  { key: "PAID", labelKey: "orders.tab.inProgress" },
  { key: "SHIPPED", labelKey: "orders.tab.shipped" },
];

const channelSummaryLabel = (
  t: OrdersTranslate,
  order: Pick<OrderListItem, "channel" | "status">,
): string => {
  if (order.channel === "FACEBOOK") {
    return t("orders.channel.facebook");
  }
  if (order.channel === "WHATSAPP") {
    return t("orders.channel.whatsapp");
  }
  if (order.status === "READY_FOR_PICKUP" || order.status === "PICKED_UP_PENDING_PAYMENT") {
    return t("orders.channel.pickup");
  }
  return t("orders.channel.walkIn");
};

const paymentMethodLabel = (
  t: OrdersTranslate,
  paymentMethod: OrderListItem["paymentMethod"],
) =>
  ({
    CASH: t("orders.payment.cash"),
    LAO_QR: t("orders.payment.qr"),
    ON_CREDIT: t("orders.payment.onCredit"),
    COD: t("orders.payment.cod"),
    BANK_TRANSFER: t("orders.payment.bankTransfer"),
  })[paymentMethod];

const statusLabel = (t: OrdersTranslate, status: OrderListItem["status"]) =>
  ({
    DRAFT: t("orders.status.draft"),
    PENDING_PAYMENT: t("orders.status.pendingPayment"),
    READY_FOR_PICKUP: t("orders.status.readyForPickup"),
    PICKED_UP_PENDING_PAYMENT: t("orders.status.pickedUpPendingPayment"),
    PAID: t("orders.status.paid"),
    PACKED: t("orders.status.packed"),
    SHIPPED: t("orders.status.shipped"),
    COD_RETURNED: t("orders.status.codReturned"),
    CANCELLED: t("orders.status.cancelled"),
  })[status];

const statusClass: Record<OrderListItem["status"], string> = {
  DRAFT: "border border-slate-200 bg-slate-50 text-slate-700",
  PENDING_PAYMENT: "border border-amber-200 bg-amber-50 text-amber-700",
  READY_FOR_PICKUP: "border border-cyan-200 bg-cyan-50 text-cyan-700",
  PICKED_UP_PENDING_PAYMENT: "border border-orange-200 bg-orange-50 text-orange-700",
  PAID: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  PACKED: "border border-blue-200 bg-blue-50 text-blue-700",
  SHIPPED: "border border-indigo-200 bg-indigo-50 text-indigo-700",
  COD_RETURNED: "border border-orange-200 bg-orange-50 text-orange-700",
  CANCELLED: "border border-rose-200 bg-rose-50 text-rose-700",
};

type OrderStatusBadge = {
  label: string;
  className: string;
};

const isOrderEligibleForBulkPack = (
  order: Pick<OrderListItem, "channel" | "status" | "paymentMethod" | "paymentStatus">,
) => {
  if (order.channel === "WALK_IN") {
    return false;
  }
  const canPackFromPaid = order.status === "PAID";
  const canPackCodFromPending =
    order.paymentMethod === "COD" &&
    order.status === "PENDING_PAYMENT" &&
    order.paymentStatus === "COD_PENDING_SETTLEMENT";
  return canPackFromPaid || canPackCodFromPending;
};

const isOrderEligibleForBulkShip = (
  order: Pick<
    OrderListItem,
    "channel" | "status" | "shippingProvider" | "shippingCarrier" | "trackingNo"
  >,
) => {
  if (order.channel === "WALK_IN" || order.status !== "PACKED") {
    return false;
  }

  const hasProvider =
    (order.shippingProvider?.trim().length ?? 0) > 0 ||
    (order.shippingCarrier?.trim().length ?? 0) > 0;
  const hasTrackingNo = (order.trackingNo?.trim().length ?? 0) > 0;

  return hasProvider && hasTrackingNo;
};

const createBulkOrderActionIdempotencyKey = (action: string, orderId: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `orders-${action}-${orderId}-${crypto.randomUUID()}`;
  }
  return `orders-${action}-${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const dedupeOrderStatusBadges = (badges: OrderStatusBadge[]) => {
  const seen = new Set<string>();
  return badges.filter((badge) => {
    const key = `${badge.label}__${badge.className}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildOrderStatusBadges = (
  t: OrdersTranslate,
  order: Pick<OrderListItem, "channel" | "status" | "paymentMethod" | "paymentStatus">,
) => {
  const badges: OrderStatusBadge[] = [];
  const isOnlineOrder = order.channel !== "WALK_IN";

  if (isOnlineOrder && order.status === "PENDING_PAYMENT") {
    badges.push({
      label: t("orders.status.pendingWork"),
      className: "bg-amber-100 text-amber-700",
    });
  } else {
    badges.push({
      label: statusLabel(t, order.status),
      className: statusClass[order.status],
    });
  }

  if (order.status === "READY_FOR_PICKUP") {
    const pickupBadge = pickupPaymentBadge(t, order);
    if (pickupBadge) {
      badges.push(pickupBadge);
    }
    return badges;
  }

  if (!isOnlineOrder) {
    return badges;
  }

  if (order.paymentMethod === "COD") {
    if (order.paymentStatus === "COD_SETTLED") {
      badges.push({
        label: t("orders.status.paid"),
        className: "bg-emerald-100 text-emerald-700",
      });
    } else if (order.paymentStatus === "FAILED") {
      badges.push({
        label: t("orders.status.paymentFailed"),
        className: "bg-rose-100 text-rose-700",
      });
    } else if (order.paymentStatus === "COD_PENDING_SETTLEMENT") {
      badges.push({
        label:
          order.status === "SHIPPED"
            ? t("orders.status.codPendingSettlement")
            : t("orders.status.cod"),
        className: "bg-indigo-100 text-indigo-700",
      });
    }
    return badges;
  }

  if (order.paymentStatus === "PAID") {
    badges.push({
      label: t("orders.status.paid"),
      className: "bg-emerald-100 text-emerald-700",
    });
    return badges;
  }

  if (order.paymentStatus === "PENDING_PROOF") {
    badges.push({
      label: t("orders.status.awaitingSlipReview"),
      className: "bg-violet-100 text-violet-700",
    });
    return badges;
  }

  if (order.paymentStatus === "FAILED") {
    badges.push({
      label: t("orders.status.paymentFailed"),
      className: "bg-rose-100 text-rose-700",
    });
    return badges;
  }

  badges.push({
    label:
      order.paymentMethod === "ON_CREDIT"
        ? t("orders.status.pendingPayment")
        : t("orders.status.pendingWork"),
    className: "bg-amber-100 text-amber-700",
  });

  return dedupeOrderStatusBadges(badges);
};

const pickupPaymentBadge = (
  t: OrdersTranslate,
  order: Pick<OrderListItem, "status" | "paymentStatus">,
): { label: string; className: string } | null => {
  if (order.status !== "READY_FOR_PICKUP") {
    return null;
  }

  if (order.paymentStatus === "PAID" || order.paymentStatus === "COD_SETTLED") {
    return {
      label: t("orders.status.paid"),
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (order.paymentStatus === "PENDING_PROOF") {
    return {
      label: t("orders.status.awaitingSlipReview"),
      className: "bg-violet-100 text-violet-700",
    };
  }

  return {
    label: t("orders.status.pendingPayment"),
    className: "bg-amber-100 text-amber-700",
  };
};

type CreateOrderStep = "products" | "details";
type DiscountInputMode = "AMOUNT" | "PERCENT";
type CheckoutPaymentMethod = "CASH" | "LAO_QR" | "ON_CREDIT" | "COD";
type OnlineChannelMode = "FACEBOOK" | "WHATSAPP" | "OTHER";
type QuickAddCategory = {
  id: string;
  name: string;
  count: number;
};
type CheckoutFlow = "WALK_IN_NOW" | "PICKUP_LATER" | "ONLINE_DELIVERY";
type CreatedOrderSuccessState = {
  orderId: string;
  orderNo: string;
  checkoutFlow: CheckoutFlow;
};
type ReceiptPreviewItem = {
  id: string;
  productName: string;
  productSku: string;
  qty: number;
  unitCode: string;
  lineTotal: number;
};
type ReceiptPreviewOrder = {
  id: string;
  orderNo: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  contactDisplayName: string | null;
  contactPhone: string | null;
  subtotal: number;
  discount: number;
  vatAmount: number;
  shippingFeeCharged: number;
  shippingCost: number;
  shippingProvider: string | null;
  shippingCarrier: string | null;
  trackingNo: string | null;
  total: number;
  paymentCurrency: "LAK" | "THB" | "USD";
  paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
  storeCurrency: string;
  storeVatMode: "EXCLUSIVE" | "INCLUSIVE";
  items: ReceiptPreviewItem[];
};
type OrderDetailApiResponse = {
  ok: boolean;
  order?: ReceiptPreviewOrder;
  message?: string;
};
type RecentOrderItem = {
  id: string;
  orderNo: string;
  checkoutFlow: CheckoutFlow;
  status: OrderListItem["status"];
  createdAt: string;
  total: number;
  paymentCurrency: "LAK" | "THB" | "USD";
  paymentMethod: OrderListItem["paymentMethod"];
};
type RecentOrdersApiResponse = {
  message?: string;
  orders?: OrderListItem[];
};

const checkoutFlowLabel = (t: OrdersTranslate, checkoutFlow: CheckoutFlow) =>
  ({
    WALK_IN_NOW: t("orders.create.flow.walkInNow"),
    PICKUP_LATER: t("orders.create.flow.pickupLater"),
    ONLINE_DELIVERY: t("orders.create.flow.onlineDelivery"),
  })[checkoutFlow];
const SCANNER_PERMISSION_STORAGE_KEY = "scanner-permission-seen";
const CREATE_ONLY_SEARCH_STICKY_TOP_REM = 3.8;
const CREATE_ONLY_CART_STICKY_GAP_FALLBACK_PX = 13;
const CREATE_ONLY_CART_STICKY_EXTRA_TOP_PX = 13;
// Intentional: keep tablet threshold aligned with desktop so both use the same sticky behavior.
const TABLET_MIN_WIDTH_PX = 1200;
const DESKTOP_MIN_WIDTH_PX = 1200;
const CREATE_ONLY_RECENT_ORDERS_LIMIT = 8;
const EMPTY_ORDER_ITEMS: CreateOrderFormInput["items"] = [];
const CREATE_ORDER_CHECKOUT_SHEET_FORM_ID = "create-order-checkout-sheet-form";
const CANCELLABLE_ORDER_STATUSES = new Set<OrderListItem["status"]>([
  "DRAFT",
  "PENDING_PAYMENT",
  "READY_FOR_PICKUP",
  "PICKED_UP_PENDING_PAYMENT",
  "PAID",
  "PACKED",
  "SHIPPED",
]);

const inferCheckoutFlowFromOrderListItem = (order: Pick<OrderListItem, "channel" | "status">): CheckoutFlow => {
  if (order.channel !== "WALK_IN") {
    return "ONLINE_DELIVERY";
  }
  if (order.status === "READY_FOR_PICKUP" || order.status === "PICKED_UP_PENDING_PAYMENT") {
    return "PICKUP_LATER";
  }
  return "WALK_IN_NOW";
};

const parseOnlineQuickCustomerInput = (rawInput: string) => {
  const normalizedRaw = rawInput.replaceAll("\r\n", "\n").trim();
  if (!normalizedRaw) {
    return {
      customerName: "",
      customerPhone: "",
      customerAddress: "",
    };
  }

  const phoneMatch = normalizedRaw.match(/\+?\d[\d\s-]{5,}\d/);
  const rawPhone = phoneMatch?.[0] ?? "";
  const customerPhone = rawPhone.replace(/\D/g, "");
  const withoutPhone = rawPhone ? normalizedRaw.replace(rawPhone, " ") : normalizedRaw;
  const lines = withoutPhone
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let customerName = lines[0] ?? "";
  let customerAddress = lines.slice(1).join(" ").trim();

  if (lines.length === 1 && !customerAddress) {
    const tokens = lines[0].split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      customerName = tokens[0] ?? "";
      customerAddress = tokens.slice(1).join(" ").trim();
    }
  }

  return {
    customerName,
    customerPhone,
    customerAddress,
  };
};

const defaultValues = (catalog: OrderCatalog): CreateOrderFormInput => ({
  channel: "WALK_IN",
  checkoutFlow: "WALK_IN_NOW",
  contactId: "",
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  shippingProvider: "",
  shippingCarrier: "",
  discount: 0,
  shippingFeeCharged: 0,
  shippingCost: 0,
  paymentCurrency: parseStoreCurrency(catalog.storeCurrency),
  paymentMethod: "CASH",
  paymentAccountId: "",
  items: [],
});

export function OrdersManagement(props: OrdersManagementProps) {
  const { catalog, canCreate } = props;
  const canRequestCancel = props.canRequestCancel ?? false;
  const canSelfApproveCancel = props.canSelfApproveCancel ?? false;
  const isCreateOnlyMode = props.mode === "create-only";
  const activeTab: OrderListTab = isCreateOnlyMode ? "ALL" : props.activeTab;
  const ordersPage = isCreateOnlyMode ? null : props.ordersPage;
  const language = resolveAppLanguage(props.language);
  const locale = getAppLanguageLocale(language);
  const t = useMemo(() => createTranslator(language), [language]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showScannerPermissionSheet, setShowScannerPermissionSheet] = useState(false);
  const [showScannerSheet, setShowScannerSheet] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bulkPackSubmitting, setBulkPackSubmitting] = useState(false);
  const [bulkShipSubmitting, setBulkShipSubmitting] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showBulkPackConfirmSheet, setShowBulkPackConfirmSheet] = useState(false);
  const [showBulkShipConfirmSheet, setShowBulkShipConfirmSheet] = useState(false);
  const [openOrderActionMenuId, setOpenOrderActionMenuId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [manualSearchKeyword, setManualSearchKeyword] = useState("");
  const [quickAddKeyword, setQuickAddKeyword] = useState("");
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<string>("ALL");
  const [quickAddOnlyAvailable, setQuickAddOnlyAvailable] = useState(false);
  const [showCartSheet, setShowCartSheet] = useState(false);
  const [showCheckoutSheet, setShowCheckoutSheet] = useState(false);
  const [showRecentOrdersSheet, setShowRecentOrdersSheet] = useState(false);
  const [showCheckoutCloseConfirm, setShowCheckoutCloseConfirm] = useState(false);
  const [pickupLaterCustomerOpen, setPickupLaterCustomerOpen] = useState(false);
  const [onlineChannelMode, setOnlineChannelMode] = useState<OnlineChannelMode>("FACEBOOK");
  const [onlineOtherChannelInput, setOnlineOtherChannelInput] = useState("");
  const [onlineCustomProviderOpen, setOnlineCustomProviderOpen] = useState(false);
  const [onlineContactPickerOpen, setOnlineContactPickerOpen] = useState(false);
  const [onlineQuickFillInput, setOnlineQuickFillInput] = useState("");
  const [showQrAccountPreview, setShowQrAccountPreview] = useState(false);
  const [showQrImageViewer, setShowQrImageViewer] = useState(false);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [shippingFeeEnabled, setShippingFeeEnabled] = useState(false);
  const [discountInputMode, setDiscountInputMode] = useState<DiscountInputMode>("AMOUNT");
  const [discountPercentInput, setDiscountPercentInput] = useState("");
  const [createStep, setCreateStep] = useState<CreateOrderStep>("products");
  const [checkoutFlow, setCheckoutFlow] = useState<CheckoutFlow>("WALK_IN_NOW");
  const [createdOrderSuccess, setCreatedOrderSuccess] = useState<CreatedOrderSuccessState | null>(null);
  const [receiptPreviewOrder, setReceiptPreviewOrder] = useState<ReceiptPreviewOrder | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewError, setReceiptPreviewError] = useState<string | null>(null);
  const [receiptPrintLoading, setReceiptPrintLoading] = useState(false);
  const [shippingLabelPrintLoading, setShippingLabelPrintLoading] = useState(false);
  const [orderPrintLoading, setOrderPrintLoading] = useState<{
    orderId: string;
    kind: "receipt" | "label";
  } | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrderItem[]>([]);
  const [recentOrdersLoading, setRecentOrdersLoading] = useState(false);
  const [recentOrdersError, setRecentOrdersError] = useState<string | null>(null);
  const [cancelApprovalTargetOrder, setCancelApprovalTargetOrder] = useState<RecentOrderItem | null>(
    null,
  );
  const [cancelApprovalSubmitting, setCancelApprovalSubmitting] = useState(false);
  const [hasInitializedDraftRestore, setHasInitializedDraftRestore] = useState(!isCreateOnlyMode);
  const [desktopCartStickyTop, setDesktopCartStickyTop] = useState("13.5rem");
  const createOnlySearchStickyRef = useRef<HTMLDivElement | null>(null);
  const createOnlyCartStickyRef = useRef<HTMLElement | null>(null);
  const outOfStockToastRef = useRef<{
    productId: string;
    shownAtMs: number;
  } | null>(null);

  const form = useForm<CreateOrderFormInput, unknown, CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: defaultValues(catalog),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedChannel = useWatch({ control: form.control, name: "channel" }) ?? "WALK_IN";
  const watchedItemsRaw = useWatch({ control: form.control, name: "items" });
  const watchedItems = watchedItemsRaw ?? EMPTY_ORDER_ITEMS;
  const watchedDiscount = Number(useWatch({ control: form.control, name: "discount" }) ?? 0);
  const watchedShippingFeeCharged = Number(
    useWatch({ control: form.control, name: "shippingFeeCharged" }) ?? 0,
  );
  const watchedShippingCost = Number(useWatch({ control: form.control, name: "shippingCost" }) ?? 0);
  const watchedPaymentCurrency =
    useWatch({ control: form.control, name: "paymentCurrency" }) ?? catalog.storeCurrency;
  const watchedPaymentMethod = useWatch({ control: form.control, name: "paymentMethod" }) ?? "CASH";
  const watchedPaymentAccountId =
    useWatch({ control: form.control, name: "paymentAccountId" }) ?? "";
  const watchedContactId = useWatch({ control: form.control, name: "contactId" }) ?? "";
  const watchedCustomerName = useWatch({ control: form.control, name: "customerName" }) ?? "";
  const watchedCustomerPhone = useWatch({ control: form.control, name: "customerPhone" }) ?? "";
  const watchedCustomerAddress =
    useWatch({ control: form.control, name: "customerAddress" }) ?? "";
  const watchedShippingProvider =
    useWatch({ control: form.control, name: "shippingProvider" }) ?? "";
  const isOnlineCheckout = checkoutFlow === "ONLINE_DELIVERY";
  const isPickupLaterCheckout = checkoutFlow === "PICKUP_LATER";
  const hasPickupCustomerIdentity =
    watchedCustomerName.trim().length > 0 || watchedCustomerPhone.trim().length > 0;
  const pickupCustomerIdentitySummary = useMemo(() => {
    const name = watchedCustomerName.trim();
    const phone = watchedCustomerPhone.trim();
    if (name && phone) {
      return `${name} • ${phone}`;
    }
    return name || phone || t("orders.create.pickupCustomer.empty");
  }, [t, watchedCustomerName, watchedCustomerPhone]);
  const showCustomerIdentityFields =
    isOnlineCheckout || (isPickupLaterCheckout && pickupLaterCustomerOpen);
  const requiresCustomerPhone = isOnlineCheckout;
  const supportedPaymentCurrencies = useMemo(() => {
    const fallbackCurrency = parseStoreCurrency(catalog.storeCurrency);
    const deduped = new Set<ReturnType<typeof parseStoreCurrency>>();
    for (const currency of catalog.supportedCurrencies) {
      deduped.add(parseStoreCurrency(currency, fallbackCurrency));
    }
    if (!deduped.has(fallbackCurrency)) {
      deduped.add(fallbackCurrency);
    }
    if (deduped.size <= 0) {
      deduped.add(fallbackCurrency);
    }
    return Array.from(deduped);
  }, [catalog.storeCurrency, catalog.supportedCurrencies]);
  const selectedPaymentCurrency = parseStoreCurrency(
    watchedPaymentCurrency,
    supportedPaymentCurrencies[0] ?? parseStoreCurrency(catalog.storeCurrency),
  );
  const qrPaymentAccounts = useMemo(
    () => catalog.paymentAccounts.filter((account) => account.accountType === "LAO_QR"),
    [catalog.paymentAccounts],
  );
  const selectedQrPaymentAccount = useMemo(
    () => qrPaymentAccounts.find((account) => account.id === watchedPaymentAccountId) ?? null,
    [qrPaymentAccounts, watchedPaymentAccountId],
  );
  const paymentMethodOptions = useMemo<Array<{ key: CheckoutPaymentMethod; label: string }>>(
    () =>
      isOnlineCheckout
        ? [
            { key: "CASH", label: t("orders.payment.cash") },
            { key: "LAO_QR", label: "QR" },
            { key: "ON_CREDIT", label: t("orders.payment.onCredit") },
            { key: "COD", label: "COD" },
          ]
        : [
            { key: "CASH", label: t("orders.payment.cash") },
            { key: "LAO_QR", label: "QR" },
            { key: "ON_CREDIT", label: t("orders.payment.onCredit") },
          ],
    [isOnlineCheckout, t],
  );
  const hasCheckoutDraftInput = useMemo(() => {
    const hasTextInput =
      watchedCustomerName.trim().length > 0 ||
      watchedCustomerPhone.trim().length > 0 ||
      watchedCustomerAddress.trim().length > 0 ||
      watchedShippingProvider.trim().length > 0 ||
      watchedContactId.trim().length > 0 ||
      (isOnlineCheckout && onlineOtherChannelInput.trim().length > 0);
    const hasAmountInput =
      watchedDiscount > 0 || watchedShippingFeeCharged > 0 || watchedShippingCost > 0;
    const hasPaymentSelectionChange =
      watchedPaymentMethod !== "CASH" ||
      watchedPaymentCurrency !== catalog.storeCurrency ||
      watchedPaymentAccountId.trim().length > 0;
    const hasOrderTypeChange = checkoutFlow !== "WALK_IN_NOW" || watchedChannel !== "WALK_IN";

    return hasTextInput || hasAmountInput || hasPaymentSelectionChange || hasOrderTypeChange;
  }, [
    catalog.storeCurrency,
    checkoutFlow,
    watchedChannel,
    watchedContactId,
    watchedCustomerAddress,
    watchedCustomerName,
    watchedCustomerPhone,
    watchedShippingProvider,
    watchedDiscount,
    watchedPaymentAccountId,
    watchedPaymentCurrency,
    watchedPaymentMethod,
    watchedShippingCost,
    watchedShippingFeeCharged,
    isOnlineCheckout,
    onlineOtherChannelInput,
  ]);

  const productsById = useMemo(
    () => new Map(catalog.products.map((product) => [product.productId, product])),
    [catalog.products],
  );

  const contactsById = useMemo(
    () => new Map(catalog.contacts.map((contact) => [contact.id, contact])),
    [catalog.contacts],
  );
  const onlineChannelContacts = useMemo(
    () =>
      catalog.contacts.filter((contact) =>
        watchedChannel === "FACEBOOK"
          ? contact.channel === "FACEBOOK"
          : contact.channel === "WHATSAPP",
      ),
    [catalog.contacts, watchedChannel],
  );
  const selectedOnlineContactLabel = watchedContactId
    ? (contactsById.get(watchedContactId)?.displayName ?? null)
    : null;
  const shippingProviderChipOptions = useMemo(() => {
    const deduped = new Set<string>();
    return catalog.shippingProviders
      .map((provider) => provider.displayName.trim())
      .filter((name) => name.length > 0)
      .filter((name) => {
        const normalized = name.toLowerCase();
        if (deduped.has(normalized)) {
          return false;
        }
        deduped.add(normalized);
        return true;
      });
  }, [catalog.shippingProviders]);
  const isKnownShippingProvider = shippingProviderChipOptions.some(
    (provider) => provider === watchedShippingProvider.trim(),
  );
  const manualSearchResults = useMemo(() => {
    const keyword = manualSearchKeyword.trim().toLowerCase();
    if (!keyword) {
      return [];
    }

    return catalog.products
      .filter((product) => {
        const barcode = product.barcode?.toLowerCase() ?? "";
        return (
          product.sku.toLowerCase().includes(keyword) ||
          product.name.toLowerCase().includes(keyword) ||
          barcode.includes(keyword)
        );
      })
      .slice(0, 8);
  }, [catalog.products, manualSearchKeyword]);
  const quickAddProducts = useMemo(() => {
    const keyword = quickAddKeyword.trim().toLowerCase();
    let filtered = keyword
      ? catalog.products.filter((product) => {
          const barcode = product.barcode?.toLowerCase() ?? "";
          return (
            product.sku.toLowerCase().includes(keyword) ||
            product.name.toLowerCase().includes(keyword) ||
            barcode.includes(keyword)
          );
        })
      : catalog.products;

    if (quickAddCategoryId !== "ALL") {
      filtered = filtered.filter((product) => product.categoryId === quickAddCategoryId);
    }

    if (quickAddOnlyAvailable) {
      filtered = filtered.filter((product) => product.available > 0);
    }

    return filtered.slice(0, 24);
  }, [catalog.products, quickAddKeyword, quickAddCategoryId, quickAddOnlyAvailable]);
  const quickAddCategories = useMemo<QuickAddCategory[]>(() => {
    const categoryMap = new Map<string, QuickAddCategory>();
    for (const product of catalog.products) {
      if (!product.categoryId || !product.categoryName) {
        continue;
      }
      const current = categoryMap.get(product.categoryId);
      if (current) {
        current.count += 1;
      } else {
        categoryMap.set(product.categoryId, {
          id: product.categoryId,
          name: product.categoryName,
          count: 1,
        });
      }
    }
    return Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [catalog.products]);

  const visibleOrders = useMemo(
    () => (isCreateOnlyMode ? [] : (ordersPage?.rows ?? [])),
    [isCreateOnlyMode, ordersPage],
  );
  const bulkPackEligibleOrders = useMemo(
    () => visibleOrders.filter((order) => isOrderEligibleForBulkPack(order)),
    [visibleOrders],
  );
  const bulkPackEligibleOrderIds = useMemo(
    () => new Set(bulkPackEligibleOrders.map((order) => order.id)),
    [bulkPackEligibleOrders],
  );
  const bulkShipEligibleOrders = useMemo(
    () => visibleOrders.filter((order) => isOrderEligibleForBulkShip(order)),
    [visibleOrders],
  );
  const bulkShipEligibleOrderIds = useMemo(
    () => new Set(bulkShipEligibleOrders.map((order) => order.id)),
    [bulkShipEligibleOrders],
  );
  const bulkActionEligibleOrders = useMemo(
    () =>
      visibleOrders.filter(
        (order) => bulkPackEligibleOrderIds.has(order.id) || bulkShipEligibleOrderIds.has(order.id),
      ),
    [bulkPackEligibleOrderIds, bulkShipEligibleOrderIds, visibleOrders],
  );
  const bulkActionEligibleOrderIds = useMemo(
    () => new Set(bulkActionEligibleOrders.map((order) => order.id)),
    [bulkActionEligibleOrders],
  );
  const selectedBulkPackOrders = useMemo(
    () => bulkPackEligibleOrders.filter((order) => selectedOrderIds.includes(order.id)),
    [bulkPackEligibleOrders, selectedOrderIds],
  );
  const selectedBulkShipOrders = useMemo(
    () => bulkShipEligibleOrders.filter((order) => selectedOrderIds.includes(order.id)),
    [bulkShipEligibleOrders, selectedOrderIds],
  );
  const allBulkPackSelected =
    bulkActionEligibleOrders.length > 0 &&
    selectedOrderIds.length === bulkActionEligibleOrders.length;
  const isBulkActionSubmitting = bulkPackSubmitting || bulkShipSubmitting;
  const hasCatalogProducts = catalog.products.length > 0;
  const getProductUnitPrice = useCallback(
    (productId: string, unitId: string) => {
      const product = productsById.get(productId);
      if (!product) return 0;
      const unit = product.units.find((unitOption) => unitOption.unitId === unitId);
      return unit?.pricePerUnit ?? 0;
    },
    [productsById],
  );
  const getProductDefaultUnitPrice = useCallback(
    (product: OrderCatalog["products"][number]) => product.units[0]?.pricePerUnit ?? product.priceBase,
    [],
  );
  const getProductAvailableQty = useCallback(
    (productId: string) => {
      const available = Number(productsById.get(productId)?.available ?? 0);
      if (!Number.isFinite(available)) {
        return 0;
      }
      return Math.max(0, Math.trunc(available));
    },
    [productsById],
  );
  const restoreDraftFormForCatalog = useCallback(
    (draft: NewOrderDraftPayload) => {
      const normalizedItems = draft.form.items
        .map((item) => {
          const product = productsById.get(item.productId);
          if (!product) {
            return null;
          }

          const hasUnit = product.units.some((unit) => unit.unitId === item.unitId);
          const fallbackUnitId = product.units[0]?.unitId ?? "";
          const unitId = hasUnit ? item.unitId : fallbackUnitId;
          const maxQty = getProductAvailableQty(item.productId);
          if (!unitId || maxQty <= 0) {
            return null;
          }
          const qty = Math.min(maxQty, Math.max(1, Math.trunc(Number(item.qty) || 0)));

          return {
            productId: item.productId,
            unitId,
            qty,
          };
        })
        .filter(
          (
            item,
          ): item is {
            productId: string;
            unitId: string;
            qty: number;
          } => item !== null,
        );

      if (normalizedItems.length <= 0) {
        return null;
      }

      const supportedCurrencySet = new Set(catalog.supportedCurrencies);
      const allowedMethods = new Set(["CASH", "LAO_QR", "ON_CREDIT", "COD", "BANK_TRANSFER"]);
      const allowedChannels = new Set(["WALK_IN", "FACEBOOK", "WHATSAPP"]);
      const isKnownAccount = catalog.paymentAccounts.some(
        (account) => account.id === draft.form.paymentAccountId,
      );

      const paymentCurrency = supportedCurrencySet.has(draft.form.paymentCurrency)
        ? draft.form.paymentCurrency
        : parseStoreCurrency(catalog.storeCurrency);
      const paymentMethod = allowedMethods.has(draft.form.paymentMethod)
        ? draft.form.paymentMethod === "BANK_TRANSFER"
          ? "ON_CREDIT"
          : draft.form.paymentMethod
        : "CASH";
      const channel = allowedChannels.has(draft.form.channel)
        ? draft.form.channel
        : "WALK_IN";

      return {
        channel,
        checkoutFlow: draft.checkoutFlow,
        contactId: draft.form.contactId,
        customerName: draft.form.customerName,
        customerPhone: draft.form.customerPhone,
        customerAddress: draft.form.customerAddress,
        shippingProvider: draft.form.shippingProvider,
        shippingCarrier: "",
        discount: Math.max(0, Math.trunc(Number(draft.form.discount) || 0)),
        shippingFeeCharged: Math.max(0, Math.trunc(Number(draft.form.shippingFeeCharged) || 0)),
        shippingCost: Math.max(0, Math.trunc(Number(draft.form.shippingCost) || 0)),
        paymentCurrency,
        paymentMethod,
        paymentAccountId:
          paymentMethod === "LAO_QR" && isKnownAccount ? draft.form.paymentAccountId : "",
        items: normalizedItems,
      } satisfies CreateOrderFormInput;
    },
    [
      catalog.paymentAccounts,
      catalog.storeCurrency,
      catalog.supportedCurrencies,
      getProductAvailableQty,
      productsById,
    ],
  );

  const subtotal = watchedItems.reduce((sum, item) => {
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return sum;
    }
    return sum + qty * getProductUnitPrice(item.productId, item.unitId);
  }, 0);

  const totals = computeOrderTotals({
    subtotal,
    discount: watchedDiscount,
    vatEnabled: catalog.vatEnabled,
    vatRate: catalog.vatRate,
    vatMode: catalog.vatMode,
    shippingFeeCharged: Math.max(0, watchedShippingFeeCharged),
  });
  const maxDiscountAmount = Math.max(0, Math.round(subtotal));
  const currentDiscountPercent =
    maxDiscountAmount > 0 ? Math.min(100, (totals.discount / maxDiscountAmount) * 100) : 0;
  const cartQtyTotal = watchedItems.reduce((sum, item) => {
    const qty = Number(item.qty ?? 0);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);

  const applyDiscountAmount = useCallback(
    (nextDiscount: number) => {
      const safeDiscount = Math.max(0, Math.min(maxDiscountAmount, Math.trunc(nextDiscount || 0)));
      form.setValue("discount", safeDiscount, { shouldDirty: true, shouldValidate: true });
    },
    [form, maxDiscountAmount],
  );

  const applyDiscountPercent = useCallback(
    (nextPercent: number) => {
      const safePercent = Math.max(0, Math.min(100, nextPercent));
      const amount = Math.round((maxDiscountAmount * safePercent) / 100);
      applyDiscountAmount(amount);
    },
    [applyDiscountAmount, maxDiscountAmount],
  );

  const setCheckoutPaymentMethod = useCallback(
    (nextMethod: CheckoutPaymentMethod) => {
      setShowQrAccountPreview(false);
      form.setValue("paymentMethod", nextMethod, { shouldDirty: true, shouldValidate: true });
      if (nextMethod === "LAO_QR") {
        const currentPaymentAccountId = form.getValues("paymentAccountId");
        const defaultQrAccount =
          qrPaymentAccounts.some((account) => account.id === currentPaymentAccountId)
            ? currentPaymentAccountId
            : (qrPaymentAccounts[0]?.id ?? "");
        form.setValue("paymentAccountId", defaultQrAccount, {
          shouldDirty: true,
          shouldValidate: true,
        });
        return;
      }
      form.setValue("paymentAccountId", "", { shouldDirty: true, shouldValidate: true });
    },
    [form, qrPaymentAccounts],
  );

  const copyQrAccountNumber = useCallback(async () => {
    if (!selectedQrPaymentAccount?.accountNumber) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedQrPaymentAccount.accountNumber);
      toast.success(t("orders.create.qr.copyAccountSuccess"));
    } catch {
      toast.error(t("orders.create.qr.copyAccountFailed"));
    }
  }, [selectedQrPaymentAccount, t]);

  const getSelectedQrImageActionUrl = useCallback(
    (download = false) => {
      if (!selectedQrPaymentAccount?.id) {
        return null;
      }
      const search = download ? "?download=1" : "";
      return `/api/orders/payment-accounts/${selectedQrPaymentAccount.id}/qr-image${search}`;
    },
    [selectedQrPaymentAccount],
  );

  const openQrImageFull = useCallback(() => {
    if (!selectedQrPaymentAccount?.qrImageUrl) {
      return;
    }
    setShowQrImageViewer(true);
  }, [selectedQrPaymentAccount]);

  const openQrImageInNewTab = useCallback(() => {
    if (!selectedQrPaymentAccount?.qrImageUrl) {
      return;
    }

    const targetUrl = getSelectedQrImageActionUrl(false) ?? selectedQrPaymentAccount.qrImageUrl;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [getSelectedQrImageActionUrl, selectedQrPaymentAccount]);

  const downloadQrImage = useCallback(async () => {
    if (!selectedQrPaymentAccount?.qrImageUrl) {
      return;
    }

    const safeFileName = selectedQrPaymentAccount.displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    try {
      const response = await fetch(
        getSelectedQrImageActionUrl(true) ?? selectedQrPaymentAccount.qrImageUrl,
      );
      if (!response.ok) {
        throw new Error("DOWNLOAD_FAILED");
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${safeFileName || "qr-payment"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(t("orders.create.qr.downloadSuccess"));
    } catch {
      const fallbackUrl = getSelectedQrImageActionUrl(false) ?? selectedQrPaymentAccount.qrImageUrl;
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      toast(t("orders.create.qr.openFallback"));
    }
  }, [getSelectedQrImageActionUrl, selectedQrPaymentAccount, t]);

  useEffect(() => {
    if (showCheckoutSheet) {
      setShowQrAccountPreview(false);
    }
  }, [showCheckoutSheet]);

  useEffect(() => {
    if (watchedPaymentMethod !== "LAO_QR" || !selectedQrPaymentAccount) {
      setShowQrAccountPreview(false);
      setShowQrImageViewer(false);
    }
  }, [selectedQrPaymentAccount, watchedPaymentMethod]);

  useEffect(() => {
    if (!showQrImageViewer) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowQrImageViewer(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showQrImageViewer]);

  const onChangeProduct = (index: number, productId: string) => {
    const product = productsById.get(productId);
    form.setValue(`items.${index}.productId`, productId);
    form.setValue(`items.${index}.unitId`, product?.units[0]?.unitId ?? "");
  };

  const onPickContact = (contactId: string) => {
    form.setValue("contactId", contactId, { shouldDirty: true, shouldValidate: true });
    const contact = contactsById.get(contactId);
    if (contact) {
      form.setValue("customerName", contact.displayName, { shouldDirty: true, shouldValidate: true });
      if (contact.phone) {
        form.setValue("customerPhone", contact.phone, { shouldDirty: true, shouldValidate: true });
      }
    }
  };
  const onSelectOnlineChannelMode = useCallback(
    (nextMode: OnlineChannelMode) => {
      setOnlineChannelMode(nextMode);
      form.setValue("contactId", "", { shouldDirty: true, shouldValidate: true });

      if (nextMode === "FACEBOOK" || nextMode === "WHATSAPP") {
        form.setValue("channel", nextMode, { shouldDirty: true, shouldValidate: true });
        setOnlineOtherChannelInput("");
        return;
      }

      const currentChannel = form.getValues("channel");
      if (currentChannel !== "FACEBOOK" && currentChannel !== "WHATSAPP") {
        form.setValue("channel", "FACEBOOK", { shouldDirty: true, shouldValidate: true });
      }
    },
    [form],
  );
  const applyOnlineQuickFill = useCallback(() => {
    const parsed = parseOnlineQuickCustomerInput(onlineQuickFillInput);
    const changed: string[] = [];

    if (parsed.customerName) {
      form.setValue("customerName", parsed.customerName, { shouldDirty: true, shouldValidate: true });
      changed.push(t("orders.create.quickFill.field.name"));
    }
    if (parsed.customerPhone) {
      form.setValue("customerPhone", parsed.customerPhone, { shouldDirty: true, shouldValidate: true });
      changed.push(t("orders.create.quickFill.field.phone"));
    }
    if (parsed.customerAddress) {
      form.setValue("customerAddress", parsed.customerAddress, { shouldDirty: true, shouldValidate: true });
      changed.push(t("orders.create.quickFill.field.address"));
    }

    if (changed.length <= 0) {
      toast.error(t("orders.create.quickFill.notFound"));
      return;
    }

    form.setValue("contactId", "", { shouldDirty: true, shouldValidate: true });
    form.clearErrors(["contactId", "customerPhone", "customerAddress"]);
    setOnlineQuickFillInput("");
    toast.success(t("orders.create.quickFill.success", { fields: changed.join(" / ") }));
  }, [form, onlineQuickFillInput, t]);
  const onSelectShippingProviderChip = useCallback(
    (provider: string) => {
      setOnlineCustomProviderOpen(false);
      form.setValue("shippingProvider", provider, { shouldDirty: true, shouldValidate: true });
      form.clearErrors("shippingProvider");
    },
    [form],
  );
  const onToggleCustomShippingProvider = useCallback(() => {
    setOnlineCustomProviderOpen(true);
    if (isKnownShippingProvider) {
      form.setValue("shippingProvider", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [form, isKnownShippingProvider]);

  const applyCheckoutFlow = useCallback(
    (nextFlow: CheckoutFlow) => {
      setCheckoutFlow(nextFlow);
      form.setValue("checkoutFlow", nextFlow, { shouldDirty: true, shouldValidate: true });
      form.clearErrors(["contactId", "customerPhone", "customerAddress", "shippingProvider"]);
      if (nextFlow !== "PICKUP_LATER") {
        setPickupLaterCustomerOpen(false);
      }

      if (nextFlow === "ONLINE_DELIVERY") {
        const currentChannel = form.getValues("channel");
        if (currentChannel === "WALK_IN") {
          form.setValue("channel", "FACEBOOK", { shouldDirty: true, shouldValidate: true });
          form.setValue("contactId", "", { shouldDirty: true, shouldValidate: true });
        }
        return;
      }

      form.setValue("channel", "WALK_IN", { shouldDirty: true, shouldValidate: true });
      form.setValue("contactId", "", { shouldDirty: true, shouldValidate: true });
      form.setValue("shippingFeeCharged", 0, { shouldDirty: true, shouldValidate: true });
      form.setValue("shippingCost", 0, { shouldDirty: true, shouldValidate: true });
      setShippingFeeEnabled(false);
      form.setValue("shippingProvider", "", { shouldDirty: true, shouldValidate: true });
      form.setValue("shippingCarrier", "", { shouldDirty: true, shouldValidate: true });

      if (nextFlow === "WALK_IN_NOW") {
        form.setValue("customerName", "", { shouldDirty: true, shouldValidate: true });
        form.setValue("customerPhone", "", { shouldDirty: true, shouldValidate: true });
        form.setValue("customerAddress", "", { shouldDirty: true, shouldValidate: true });
      }

      const currentPaymentMethod = form.getValues("paymentMethod");
      if (currentPaymentMethod === "COD") {
        setCheckoutPaymentMethod("CASH");
      } else if (currentPaymentMethod === "BANK_TRANSFER") {
        setCheckoutPaymentMethod("ON_CREDIT");
      }
    },
    [form, setCheckoutPaymentMethod],
  );

  const addProductFromCatalog = (productId: string) => {
    const product = productsById.get(productId);
    if (!product) {
      return null;
    }
    const availableQty = getProductAvailableQty(productId);
    if (availableQty <= 0) {
      setScanMessage(
        t("orders.create.feedback.outOfStockInline", {
          sku: product.sku,
          name: product.name,
        }),
      );
      const nowMs = Date.now();
      const canShowToast =
        !outOfStockToastRef.current ||
        outOfStockToastRef.current.productId !== productId ||
        nowMs - outOfStockToastRef.current.shownAtMs > 1200;
      if (canShowToast) {
        toast.error(
          t("orders.create.feedback.outOfStockToast", {
            name: product.name,
          }),
          {
          duration: 1600,
          },
        );
        outOfStockToastRef.current = {
          productId,
          shownAtMs: nowMs,
        };
      }
      return null;
    }

    const existingIndex = watchedItems.findIndex((item) => item.productId === productId);
    if (existingIndex >= 0) {
      const currentQty = Number(form.getValues(`items.${existingIndex}.qty`) ?? 0);
      if (currentQty >= availableQty) {
        setScanMessage(
          t("orders.create.feedback.maxQty", {
            sku: product.sku,
            name: product.name,
            qty: formatNumberByLanguage(language, availableQty),
          }),
        );
        return null;
      }
      form.setValue(`items.${existingIndex}.qty`, Math.min(availableQty, Math.max(1, currentQty + 1)), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      append({
        productId,
        unitId: product.units[0]?.unitId ?? "",
        qty: 1,
      });
    }

    return product;
  };
  const setItemQty = useCallback(
    (index: number, nextQty: number) => {
      const productId = String(form.getValues(`items.${index}.productId`) ?? "");
      const availableQty = getProductAvailableQty(productId);
      const safeQty = Math.max(1, Math.trunc(nextQty) || 1);
      const boundedQty = availableQty > 0 ? Math.min(safeQty, availableQty) : safeQty;
      if (boundedQty < safeQty && availableQty > 0) {
        const product = productsById.get(productId);
        if (product) {
          setScanMessage(
            t("orders.create.feedback.maxQty", {
              sku: product.sku,
              name: product.name,
              qty: formatNumberByLanguage(language, availableQty),
            }),
          );
        }
      }
      form.setValue(`items.${index}.qty`, boundedQty, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form, getProductAvailableQty, language, productsById, t],
  );
  const increaseItemQty = useCallback(
    (index: number) => {
      const currentQty = Number(form.getValues(`items.${index}.qty`) ?? 0);
      setItemQty(index, currentQty + 1);
    },
    [form, setItemQty],
  );
  const decreaseItemQty = useCallback(
    (index: number) => {
      const currentQty = Number(form.getValues(`items.${index}.qty`) ?? 0);
      setItemQty(index, Math.max(1, currentQty - 1));
    },
    [form, setItemQty],
  );

  const onScanBarcodeResult = (rawCode: string) => {
    const barcode = rawCode.trim();
    if (!barcode) {
      return;
    }

    const keyword = barcode.toLowerCase();
    const matched = catalog.products.find(
      (product) =>
        product.barcode?.toLowerCase() === keyword || product.sku.toLowerCase() === keyword,
    );

    if (matched) {
      const addedProduct = addProductFromCatalog(matched.productId);
      if (addedProduct) {
        setScanMessage(
          t("orders.create.feedback.added", {
            sku: addedProduct.sku,
            name: addedProduct.name,
          }),
        );
      }
      setNotFoundBarcode(null);
      setManualSearchKeyword("");
      setShowScannerSheet(false);
      return;
    }

    setScanMessage(null);
    setNotFoundBarcode(barcode);
    setManualSearchKeyword(barcode);
    setShowScannerSheet(false);
  };

  const pickProductFromManualSearch = (productId: string) => {
    const addedProduct = addProductFromCatalog(productId);
    if (!addedProduct) {
      return;
    }

    setScanMessage(
      t("orders.create.feedback.added", {
        sku: addedProduct.sku,
        name: addedProduct.name,
      }),
    );
    setNotFoundBarcode(null);
    setManualSearchKeyword("");
  };

  const buildOrdersUrl = (tab: TabKey, page: number) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (tab === "ALL") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", tab);
    }

    if (page <= 1) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(page));
    }

    const query = nextParams.toString();
    return query ? `/orders?${query}` : "/orders";
  };

  useEffect(() => {
    if (openOrderActionMenuId === null || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenOrderActionMenuId(null);
        return;
      }
      if (target.closest("[data-order-action-menu-root='true']")) {
        return;
      }
      setOpenOrderActionMenuId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openOrderActionMenuId]);

  useEffect(() => {
    setSelectedOrderIds((prev) => prev.filter((orderId) => bulkActionEligibleOrderIds.has(orderId)));
  }, [bulkActionEligibleOrderIds]);

  const toggleBulkPackOrderSelection = useCallback((orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((currentId) => currentId !== orderId) : [...prev, orderId],
    );
  }, []);

  const toggleSelectAllBulkPackOrders = useCallback(() => {
    setSelectedOrderIds((prev) => {
      if (allBulkPackSelected) {
        return prev.filter((orderId) => !bulkActionEligibleOrderIds.has(orderId));
      }

      const next = new Set(prev);
      for (const order of bulkActionEligibleOrders) {
        next.add(order.id);
      }
      return Array.from(next);
    });
  }, [allBulkPackSelected, bulkActionEligibleOrderIds, bulkActionEligibleOrders]);

  const clearBulkPackSelection = useCallback(() => {
    setSelectedOrderIds([]);
  }, []);

  const closeBulkPackConfirmSheet = useCallback(() => {
    if (isBulkActionSubmitting) {
      return;
    }
    setShowBulkPackConfirmSheet(false);
  }, [isBulkActionSubmitting]);

  const closeBulkShipConfirmSheet = useCallback(() => {
    if (isBulkActionSubmitting) {
      return;
    }
    setShowBulkShipConfirmSheet(false);
  }, [isBulkActionSubmitting]);

  const toggleOrderActionMenu = useCallback((orderId: string) => {
    setOpenOrderActionMenuId((currentId) => (currentId === orderId ? null : orderId));
  }, []);

  const closeOrderActionMenu = useCallback(() => {
    setOpenOrderActionMenuId(null);
  }, []);

  const openOrderDetailFromList = useCallback(
    (orderId: string) => {
      closeOrderActionMenu();
      router.push(`/orders/${orderId}`);
    },
    [closeOrderActionMenu, router],
  );

  const fetchOrderReceiptPreview = useCallback(async (orderId: string) => {
    const response = await authFetch(`/api/orders/${orderId}`);
    const data = (await response.json().catch(() => null)) as OrderDetailApiResponse | null;
    if (!response.ok || !data?.order) {
      throw new Error(data?.message ?? t("orders.print.receipt"));
    }
    return data.order;
  }, [t]);

  const openOrderPrintPage = useCallback(
    async (orderId: string, kind: "receipt" | "label") => {
      closeOrderActionMenu();
      setErrorMessage(null);
      setOrderPrintLoading({ orderId, kind });

      try {
        const order = await fetchOrderReceiptPreview(orderId);
        const html =
          kind === "receipt"
            ? buildReceiptPrintHtml(order)
            : buildShippingLabelPrintHtml(order);

        printHtmlViaWindow(html, {
          kind,
          rootIdPrefix: "orders-management-inline-print",
          onSettled: () => {
            setOrderPrintLoading((current) =>
              current?.orderId === orderId && current.kind === kind ? null : current,
            );
          },
          onError: (message) => {
            setErrorMessage(message);
          },
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : kind === "receipt"
              ? t("orders.print.receipt")
              : t("orders.print.label");
        setErrorMessage(message);
        setOrderPrintLoading(null);
      }
    },
    [closeOrderActionMenu, fetchOrderReceiptPreview, t],
  );

  const renderOrderActionMenu = useCallback(
    (order: OrderListItem) => {
      const isOnlineOrder = order.channel !== "WALK_IN";
      const isOpen = openOrderActionMenuId === order.id;
      const isReceiptPrintLoading =
        orderPrintLoading?.orderId === order.id && orderPrintLoading.kind === "receipt";
      const isLabelPrintLoading =
        orderPrintLoading?.orderId === order.id && orderPrintLoading.kind === "label";

      return (
        <div className="relative" data-order-action-menu-root="true">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-slate-500"
            aria-label={t("orders.actions.moreFor", { orderNo: order.orderNo })}
            aria-expanded={isOpen}
            onClick={(event) => {
              event.stopPropagation();
              toggleOrderActionMenu(order.id);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {isOpen ? (
            <div
              className="absolute right-0 top-10 z-20 min-w-[12rem] rounded-xl border bg-white p-1 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => openOrderDetailFromList(order.id)}
              >
                {t("orders.actions.openDetail")}
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                disabled={isReceiptPrintLoading}
                onClick={() => openOrderPrintPage(order.id, "receipt")}
              >
                {isReceiptPrintLoading ? t("orders.print.preparingReceipt") : t("orders.print.receipt")}
              </button>
              {isOnlineOrder ? (
                <button
                  type="button"
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  disabled={isLabelPrintLoading}
                  onClick={() => openOrderPrintPage(order.id, "label")}
                >
                  {isLabelPrintLoading ? t("orders.print.preparingLabel") : t("orders.print.label")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    },
    [
      openOrderActionMenuId,
      openOrderDetailFromList,
      openOrderPrintPage,
      orderPrintLoading,
      t,
      toggleOrderActionMenu,
    ],
  );

  const runBulkPackSelectedOrders = useCallback(async () => {
    if (selectedBulkPackOrders.length <= 0) {
      setErrorMessage(t("orders.bulk.pickAtLeastOnePack"));
      setShowBulkPackConfirmSheet(false);
      return;
    }

    setBulkPackSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const results = await Promise.all(
      selectedBulkPackOrders.map(async (order) => {
        try {
          const response = await authFetch(`/api/orders/${order.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": createBulkOrderActionIdempotencyKey("mark_packed", order.id),
            },
            body: JSON.stringify({ action: "mark_packed" }),
          });
          const data = (await response.json().catch(() => null)) as { message?: string } | null;

          if (!response.ok) {
            return {
              orderNo: order.orderNo,
              ok: false,
              message: data?.message ?? t("orders.bulk.packFailed"),
            };
          }

          return {
            orderNo: order.orderNo,
            ok: true,
            message: null,
          };
        } catch {
          return {
            orderNo: order.orderNo,
            ok: false,
            message: t("orders.bulk.packFailed"),
          };
        }
      }),
    );

    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const failedSummary = failed
      .slice(0, 3)
      .map((result) => `${result.orderNo}: ${result.message ?? t("orders.bulk.failedGeneric")}`)
      .join(" | ");

    if (failed.length > 0) {
      setErrorMessage(
        `${t("orders.bulk.packMixedResult", {
          success: formatNumberByLanguage(language, succeeded.length),
          failed: formatNumberByLanguage(language, failed.length),
        })}${failedSummary ? ` (${failedSummary})` : ""}`,
      );
    } else {
      setSuccessMessage(
        t("orders.bulk.packSuccess", {
          count: formatNumberByLanguage(language, succeeded.length),
        }),
      );
    }

    setSelectedOrderIds((prev) =>
      prev.filter((orderId) => !selectedBulkPackOrders.some((order) => order.id === orderId)),
    );
    setShowBulkPackConfirmSheet(false);
    setBulkPackSubmitting(false);
    router.refresh();
  }, [language, router, selectedBulkPackOrders, t]);

  const runBulkShipSelectedOrders = useCallback(async () => {
    if (selectedBulkShipOrders.length <= 0) {
      setErrorMessage(t("orders.bulk.pickAtLeastOneShip"));
      setShowBulkShipConfirmSheet(false);
      return;
    }

    setBulkShipSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const results = await Promise.all(
      selectedBulkShipOrders.map(async (order) => {
        try {
          const response = await authFetch(`/api/orders/${order.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": createBulkOrderActionIdempotencyKey("mark_shipped", order.id),
            },
            body: JSON.stringify({ action: "mark_shipped" }),
          });
          const data = (await response.json().catch(() => null)) as { message?: string } | null;

          if (!response.ok) {
            return {
              orderNo: order.orderNo,
              ok: false,
              message: data?.message ?? t("orders.bulk.shipFailed"),
            };
          }

          return {
            orderNo: order.orderNo,
            ok: true,
            message: null,
          };
        } catch {
          return {
            orderNo: order.orderNo,
            ok: false,
            message: t("orders.bulk.shipFailed"),
          };
        }
      }),
    );

    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const failedSummary = failed
      .slice(0, 3)
      .map((result) => `${result.orderNo}: ${result.message ?? t("orders.bulk.failedGeneric")}`)
      .join(" | ");

    if (failed.length > 0) {
      setErrorMessage(
        `${t("orders.bulk.shipMixedResult", {
          success: formatNumberByLanguage(language, succeeded.length),
          failed: formatNumberByLanguage(language, failed.length),
        })}${failedSummary ? ` (${failedSummary})` : ""}`,
      );
    } else {
      setSuccessMessage(
        t("orders.bulk.shipSuccess", {
          count: formatNumberByLanguage(language, succeeded.length),
        }),
      );
    }

    setSelectedOrderIds((prev) =>
      prev.filter((orderId) => !selectedBulkShipOrders.some((order) => order.id === orderId)),
    );
    setShowBulkShipConfirmSheet(false);
    setBulkShipSubmitting(false);
    router.refresh();
  }, [language, router, selectedBulkShipOrders, t]);

  const tableColumns = useMemo<ColumnDef<OrderListItem>[]>(
    () => [
      {
        id: "select",
        header: () =>
          bulkActionEligibleOrders.length > 0 ? (
            <input
              type="checkbox"
              checked={allBulkPackSelected}
              aria-label={
                allBulkPackSelected
                  ? t("orders.bulk.clearEligible")
                  : t("orders.bulk.selectAllEligible")
              }
              onChange={() => toggleSelectAllBulkPackOrders()}
            />
          ) : null,
        cell: ({ row }) =>
          isOrderEligibleForBulkPack(row.original) || isOrderEligibleForBulkShip(row.original) ? (
            <input
              type="checkbox"
              checked={selectedOrderIds.includes(row.original.id)}
              aria-label={t("orders.bulk.selectForAction", { orderNo: row.original.orderNo })}
              onClick={(event) => event.stopPropagation()}
              onChange={() => toggleBulkPackOrderSelection(row.original.id)}
            />
          ) : null,
      },
      {
        accessorKey: "orderNo",
        header: t("orders.table.orderNo"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-semibold text-blue-700">{row.original.orderNo}</p>
            <p className="text-[11px] text-slate-500">
              {new Date(row.original.createdAt).toLocaleString(locale)}
            </p>
          </div>
        ),
      },
      {
        id: "customer",
        header: t("orders.table.customer"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900">
              {row.original.customerName || row.original.contactDisplayName || t("orders.customer.default")}
            </p>
            <p className="text-[11px] text-slate-500">{channelSummaryLabel(t, row.original)}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("orders.table.status"),
        cell: ({ row }) => {
          const badges = buildOrderStatusBadges(t, row.original);
          return (
            <div className="flex flex-wrap items-center gap-1">
              {badges.map((badge) => (
                <span key={`${badge.label}-${badge.className}`} className={`rounded-full px-2 py-1 text-xs ${badge.className}`}>
                  {badge.label}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: "channel",
        header: t("orders.table.channel"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="text-slate-700">
              {row.original.paymentCurrency} • {paymentMethodLabel(t, row.original.paymentMethod)}
            </p>
            {row.original.shippingProvider || row.original.shippingCarrier ? (
              <p className="text-[11px] text-slate-500">
                {row.original.shippingProvider || row.original.shippingCarrier}
                {row.original.trackingNo ? ` • ${row.original.trackingNo}` : ""}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">{t("orders.shipping.noData")}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "total",
        header: t("orders.table.total"),
        cell: ({ row }) => (
          <div className="space-y-0.5 text-right">
            <p className="font-semibold text-slate-900">
              {row.original.total.toLocaleString(locale)} {catalog.storeCurrency}
            </p>
            <p className="text-[11px] text-slate-500">
              {isOrderEligibleForBulkShip(row.original)
                ? t("orders.readiness.readyToShip")
                : isOrderEligibleForBulkPack(row.original)
                  ? t("orders.readiness.readyToPack")
                  : t("orders.readiness.viewMore")}
            </p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => renderOrderActionMenu(row.original),
      },
    ],
    [
      allBulkPackSelected,
      bulkActionEligibleOrders.length,
      catalog.storeCurrency,
      renderOrderActionMenu,
      locale,
      selectedOrderIds,
      t,
      toggleBulkPackOrderSelection,
      toggleSelectAllBulkPackOrders,
    ],
  );

  const ordersTable = useReactTable({
    data: visibleOrders,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const submitOrder = form.handleSubmit(async (values) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedOrderSuccess(null);
    form.clearErrors(["customerPhone", "customerAddress", "shippingProvider"]);

    const normalizedCustomerName = values.customerName?.trim();
    const normalizedCustomerPhone = values.customerPhone?.trim() ?? "";
    const normalizedCustomerAddress = values.customerAddress?.trim() ?? "";
    const normalizedShippingProvider = values.shippingProvider?.trim() ?? "";
    const normalizedChannel =
      checkoutFlow === "ONLINE_DELIVERY"
        ? values.channel === "WALK_IN"
          ? "FACEBOOK"
          : values.channel
        : "WALK_IN";
    const normalizedPaymentMethodBase =
      values.paymentMethod === "BANK_TRANSFER" ? "ON_CREDIT" : (values.paymentMethod ?? "CASH");
    const normalizedPaymentMethod =
      checkoutFlow !== "ONLINE_DELIVERY" && normalizedPaymentMethodBase === "COD"
        ? "CASH"
        : normalizedPaymentMethodBase;
    const submittedCheckoutFlow = checkoutFlow;

    if (requiresCustomerPhone && !normalizedCustomerPhone) {
      form.setError("customerPhone", {
        type: "manual",
        message: t("orders.create.validation.customerPhoneRequired"),
      });
      return;
    }

    if (checkoutFlow === "ONLINE_DELIVERY" && !normalizedCustomerAddress) {
      form.setError("customerAddress", {
        type: "manual",
        message: t("orders.create.validation.addressRequired"),
      });
      return;
    }

    if (checkoutFlow === "ONLINE_DELIVERY" && !normalizedShippingProvider) {
      form.setError("shippingProvider", {
        type: "manual",
        message: t("orders.create.validation.shippingProviderRequired"),
      });
      return;
    }

    setLoading(true);

    const fallbackCustomerName =
      checkoutFlow === "PICKUP_LATER"
        ? t("orders.create.customerFallback.pickup")
        : normalizedChannel === "WALK_IN"
          ? t("orders.create.customerFallback.walkIn")
          : t("orders.create.customerFallback.online");
    const payload: CreateOrderInput = {
      ...values,
      channel: normalizedChannel,
      contactId: checkoutFlow === "ONLINE_DELIVERY" ? values.contactId : "",
      checkoutFlow,
      customerPhone: normalizedCustomerPhone,
      customerAddress: checkoutFlow === "ONLINE_DELIVERY" ? normalizedCustomerAddress : "",
      shippingProvider: checkoutFlow === "ONLINE_DELIVERY" ? normalizedShippingProvider : "",
      shippingCarrier: "",
      shippingFeeCharged: checkoutFlow === "ONLINE_DELIVERY" ? values.shippingFeeCharged : 0,
      shippingCost: checkoutFlow === "ONLINE_DELIVERY" ? values.shippingCost : 0,
      paymentMethod: normalizedPaymentMethod,
      customerName: normalizedCustomerName || fallbackCustomerName,
    };

    const response = await authFetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          orderId?: string;
          orderNo?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? t("orders.create.submitFailed"));
      setLoading(false);
      return;
    }

    setSuccessMessage(t("orders.create.submitSuccess", { orderNo: data?.orderNo ?? "" }));
    setShowCartSheet(false);
    setShowCheckoutSheet(false);
    setShowCheckoutCloseConfirm(false);
    setPickupLaterCustomerOpen(false);
    setDiscountEnabled(false);
    setShippingFeeEnabled(false);
    setDiscountInputMode("AMOUNT");
    setDiscountPercentInput("");
    setCreateStep("products");
    form.reset(defaultValues(catalog));
    setCheckoutFlow("WALK_IN_NOW");
    clearNewOrderDraftState();
    setLoading(false);

    if (data?.orderId) {
      setCreatedOrderSuccess({
        orderId: data.orderId,
        orderNo: data.orderNo?.trim() || data.orderId,
        checkoutFlow: submittedCheckoutFlow,
      });
      router.refresh();
      return;
    }

    router.refresh();
  });

  const closeCreatedOrderSuccess = useCallback(() => {
    setCreatedOrderSuccess(null);
    setReceiptPreviewOrder(null);
    setReceiptPreviewError(null);
    setReceiptPreviewLoading(false);
    setReceiptPrintLoading(false);
    setShippingLabelPrintLoading(false);
    setSuccessMessage(null);
  }, []);

  const fetchRecentOrders = useCallback(async () => {
    if (!isCreateOnlyMode) {
      return;
    }

    setRecentOrdersLoading(true);
    setRecentOrdersError(null);
    try {
      const response = await authFetch(
        `/api/orders?page=1&pageSize=${CREATE_ONLY_RECENT_ORDERS_LIMIT}`,
      );
      const data = (await response.json().catch(() => null)) as RecentOrdersApiResponse | null;
      if (!response.ok) {
        throw new Error(data?.message ?? t("orders.create.recentOrders.loadFailed"));
      }
      if (!Array.isArray(data?.orders)) {
        throw new Error(t("orders.create.recentOrders.invalidData"));
      }
      const mappedOrders = data.orders.slice(0, CREATE_ONLY_RECENT_ORDERS_LIMIT).map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        checkoutFlow: inferCheckoutFlowFromOrderListItem(order),
        status: order.status,
        createdAt: order.createdAt,
        total: order.total,
        paymentCurrency: order.paymentCurrency,
        paymentMethod: order.paymentMethod,
      }));
      setRecentOrders(mappedOrders);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t("orders.create.recentOrders.loadFailed");
      setRecentOrdersError(message);
      setRecentOrders([]);
    } finally {
      setRecentOrdersLoading(false);
    }
  }, [isCreateOnlyMode, t]);

  const openRecentOrderSummary = useCallback((order: RecentOrderItem) => {
    setShowRecentOrdersSheet(false);
    setSuccessMessage(null);
    setErrorMessage(null);
    setCreatedOrderSuccess({
      orderId: order.id,
      orderNo: order.orderNo,
      checkoutFlow: order.checkoutFlow,
    });
  }, []);

  const openRecentOrderCancelModal = useCallback(
    (order: RecentOrderItem) => {
      if (!canRequestCancel || !CANCELLABLE_ORDER_STATUSES.has(order.status)) {
        return;
      }
      setErrorMessage(null);
      setSuccessMessage(null);
      setCancelApprovalTargetOrder(order);
    },
    [canRequestCancel],
  );

  const cancelRecentOrderWithApproval = useCallback(
    async (payload: ManagerCancelApprovalPayload): Promise<ManagerCancelApprovalResult> => {
      if (!cancelApprovalTargetOrder) {
        return { ok: false, message: t("orders.create.cancelOrder.notFound") };
      }

      setCancelApprovalSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        const response = await authFetch(`/api/orders/${cancelApprovalTargetOrder.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "cancel",
            ...(payload.approvalEmail ? { approvalEmail: payload.approvalEmail } : {}),
            ...(payload.approvalPassword
              ? { approvalPassword: payload.approvalPassword }
              : {}),
            cancelReason: payload.cancelReason,
            approvalMode: payload.approvalMode,
            ...(payload.confirmBySlide ? { confirmBySlide: true } : {}),
          }),
        });
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        if (!response.ok) {
          const message = data?.message ?? t("orders.create.cancelOrder.failed");
          setErrorMessage(message);
          return { ok: false, message };
        }

        setSuccessMessage(
          t("orders.create.cancelOrder.success", { orderNo: cancelApprovalTargetOrder.orderNo }),
        );
        setCancelApprovalTargetOrder(null);
        await fetchRecentOrders();
        router.refresh();
        return { ok: true };
      } catch {
        const message = t("orders.create.cancelOrder.failed");
        setErrorMessage(message);
        return { ok: false, message };
      } finally {
        setCancelApprovalSubmitting(false);
      }
    },
    [cancelApprovalTargetOrder, fetchRecentOrders, router, t],
  );

  const openOrderReceiptPrint = useCallback(
    async (orderId: string, providedOrder?: ReceiptPreviewOrder | null) => {
      setErrorMessage(null);
      setReceiptPrintLoading(true);

      try {
        const order =
          providedOrder && providedOrder.id === orderId
            ? providedOrder
            : receiptPreviewOrder && receiptPreviewOrder.id === orderId
              ? receiptPreviewOrder
              : await fetchOrderReceiptPreview(orderId);

        if (!receiptPreviewOrder || receiptPreviewOrder.id !== order.id) {
          setReceiptPreviewOrder(order);
        }

        printHtmlViaWindow(buildReceiptPrintHtml(order), {
          kind: "receipt",
          rootIdPrefix: "orders-management-inline-print",
          onSettled: () => {
            setReceiptPrintLoading(false);
          },
          onError: (message) => {
            setErrorMessage(message);
          },
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : t("orders.print.receipt");
        setErrorMessage(message);
        setReceiptPrintLoading(false);
      }
    },
    [fetchOrderReceiptPreview, receiptPreviewOrder, t],
  );

  const openCreatedOrderDetail = useCallback(
    (orderId: string) => {
      setCreatedOrderSuccess(null);
      setReceiptPreviewOrder(null);
      setReceiptPreviewError(null);
      setReceiptPreviewLoading(false);
      setReceiptPrintLoading(false);
      setShippingLabelPrintLoading(false);
      setSuccessMessage(null);
      router.push(`/orders/${orderId}`);
    },
    [router],
  );

  const openOrderShippingLabelPrint = useCallback(
    async (orderId: string, providedOrder?: ReceiptPreviewOrder | null) => {
      setErrorMessage(null);
      setShippingLabelPrintLoading(true);

      try {
        const order =
          providedOrder && providedOrder.id === orderId
            ? providedOrder
            : receiptPreviewOrder && receiptPreviewOrder.id === orderId
              ? receiptPreviewOrder
              : await fetchOrderReceiptPreview(orderId);

        if (!receiptPreviewOrder || receiptPreviewOrder.id !== order.id) {
          setReceiptPreviewOrder(order);
        }

        printHtmlViaWindow(buildShippingLabelPrintHtml(order), {
          kind: "label",
          rootIdPrefix: "orders-management-inline-print",
          onSettled: () => {
            setShippingLabelPrintLoading(false);
          },
          onError: (message) => {
            setErrorMessage(message);
          },
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("orders.print.label");
        setErrorMessage(message);
        setShippingLabelPrintLoading(false);
      }
    },
    [fetchOrderReceiptPreview, receiptPreviewOrder, t],
  );

  const openCheckoutSheet = () => {
    if (watchedItems.length <= 0) {
      return;
    }
    setCreateStep("details");
    setShowCartSheet(false);
    setShowCheckoutCloseConfirm(false);
    setPickupLaterCustomerOpen(false);
    setDiscountPercentInput("");
    setShowCheckoutSheet(true);
  };
  const closeCheckoutSheet = useCallback(() => {
    setShowCheckoutCloseConfirm(false);
    setShowCheckoutSheet(false);
    setCreateStep("products");
  }, []);
  const requestCloseCheckoutSheet = useCallback(() => {
    if (loading) {
      return;
    }

    if (hasCheckoutDraftInput) {
      setShowCheckoutCloseConfirm(true);
      return;
    }

    closeCheckoutSheet();
  }, [closeCheckoutSheet, hasCheckoutDraftInput, loading]);

  useEffect(() => {
    if (!createdOrderSuccess) {
      setReceiptPreviewOrder(null);
      setReceiptPreviewError(null);
      setReceiptPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setReceiptPreviewLoading(true);
    setReceiptPreviewError(null);

    fetchOrderReceiptPreview(createdOrderSuccess.orderId)
      .then((order) => {
        if (cancelled) {
          return;
        }
        setReceiptPreviewOrder(order);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("orders.create.receiptPreview.loadFailed");
        setReceiptPreviewError(message);
        setReceiptPreviewOrder(null);
      })
      .finally(() => {
        if (!cancelled) {
          setReceiptPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [createdOrderSuccess, fetchOrderReceiptPreview, t]);

  useEffect(() => {
    if (!showRecentOrdersSheet) {
      return;
    }
    void fetchRecentOrders();
  }, [fetchRecentOrders, showRecentOrdersSheet]);

  useEffect(() => {
    if (!isCreateOnlyMode) {
      setHasInitializedDraftRestore(true);
      return;
    }
    if (hasInitializedDraftRestore) {
      return;
    }

    const savedDraft = getNewOrderDraftPayload({
      maxAgeMs: NEW_ORDER_DRAFT_DEFAULT_MAX_AGE_MS,
    });
    if (!savedDraft) {
      setHasInitializedDraftRestore(true);
      return;
    }

    const restored = restoreDraftFormForCatalog(savedDraft);
    if (!restored) {
      clearNewOrderDraftState();
      setHasInitializedDraftRestore(true);
      return;
    }

    form.reset(restored);
    setCheckoutFlow(savedDraft.checkoutFlow);
    setScanMessage(t("orders.create.draftRestored"));
    setNewOrderDraftFlag(true);
    setHasInitializedDraftRestore(true);
  }, [form, hasInitializedDraftRestore, isCreateOnlyMode, restoreDraftFormForCatalog, t]);

  useEffect(() => {
    if (!isCreateOnlyMode || !hasInitializedDraftRestore) {
      return;
    }

    const normalizedItems = watchedItems
      .map((item) => {
        const productId = String(item.productId ?? "").trim();
        const unitId = String(item.unitId ?? "").trim();
        const qty = Math.max(1, Math.trunc(Number(item.qty) || 0));
        if (!productId || !unitId || qty <= 0) {
          return null;
        }
        return { productId, unitId, qty };
      })
      .filter(
        (
          item,
        ): item is {
          productId: string;
          unitId: string;
          qty: number;
        } => item !== null,
      );

    const hasDraft = normalizedItems.length > 0;
    setNewOrderDraftFlag(hasDraft);

    if (!hasDraft) {
      clearNewOrderDraftPayload();
      return;
    }

    const draftPayload: NewOrderDraftPayload = {
      checkoutFlow,
      form: {
        channel:
          watchedChannel === "FACEBOOK" || watchedChannel === "WHATSAPP"
            ? watchedChannel
            : "WALK_IN",
        contactId: watchedContactId,
        customerName: watchedCustomerName,
        customerPhone: watchedCustomerPhone,
        customerAddress: watchedCustomerAddress,
        shippingProvider: watchedShippingProvider,
        shippingCarrier: "",
        discount: Math.max(0, Math.trunc(Number(watchedDiscount) || 0)),
        shippingFeeCharged: Math.max(0, Math.trunc(Number(watchedShippingFeeCharged) || 0)),
        shippingCost: Math.max(0, Math.trunc(Number(watchedShippingCost) || 0)),
        paymentCurrency:
          watchedPaymentCurrency === "THB" || watchedPaymentCurrency === "USD"
            ? watchedPaymentCurrency
            : "LAK",
        paymentMethod:
          watchedPaymentMethod === "BANK_TRANSFER"
            ? "ON_CREDIT"
            : watchedPaymentMethod === "LAO_QR" ||
                watchedPaymentMethod === "ON_CREDIT" ||
                watchedPaymentMethod === "COD"
              ? watchedPaymentMethod
              : "CASH",
        paymentAccountId: watchedPaymentAccountId,
        items: normalizedItems,
      },
    };

    setNewOrderDraftPayload(draftPayload);
  }, [
    checkoutFlow,
    hasInitializedDraftRestore,
    isCreateOnlyMode,
    watchedChannel,
    watchedContactId,
    watchedCustomerAddress,
    watchedCustomerName,
    watchedCustomerPhone,
    watchedShippingProvider,
    watchedDiscount,
    watchedItems,
    watchedPaymentAccountId,
    watchedPaymentCurrency,
    watchedPaymentMethod,
    watchedShippingCost,
    watchedShippingFeeCharged,
  ]);

  useEffect(() => {
    if (watchedDiscount > 0) {
      setDiscountEnabled(true);
    }
  }, [watchedDiscount]);

  useEffect(() => {
    if (watchedShippingFeeCharged > 0 || watchedShippingCost > 0) {
      setShippingFeeEnabled(true);
    }
  }, [watchedShippingCost, watchedShippingFeeCharged]);

  useEffect(() => {
    if (!discountEnabled || discountInputMode !== "PERCENT") {
      return;
    }

    if (totals.discount <= 0 || maxDiscountAmount <= 0) {
      setDiscountPercentInput("");
      return;
    }

    const roundedPercent = Math.round(currentDiscountPercent * 10) / 10;
    setDiscountPercentInput(Number.isInteger(roundedPercent) ? String(roundedPercent) : roundedPercent.toFixed(1));
  }, [
    currentDiscountPercent,
    discountEnabled,
    discountInputMode,
    maxDiscountAmount,
    totals.discount,
  ]);

  useEffect(() => {
    const fallbackCurrency = supportedPaymentCurrencies[0] ?? parseStoreCurrency(catalog.storeCurrency);
    const normalizedCurrentCurrency = parseStoreCurrency(watchedPaymentCurrency, fallbackCurrency);
    if (normalizedCurrentCurrency !== watchedPaymentCurrency) {
      form.setValue("paymentCurrency", normalizedCurrentCurrency, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [catalog.storeCurrency, form, supportedPaymentCurrencies, watchedPaymentCurrency]);

  useEffect(() => {
    const normalizedMethod = watchedPaymentMethod === "BANK_TRANSFER" ? "ON_CREDIT" : watchedPaymentMethod;
    const nextMethod: CheckoutPaymentMethod =
      normalizedMethod === "CASH" ||
      normalizedMethod === "LAO_QR" ||
      normalizedMethod === "ON_CREDIT" ||
      (isOnlineCheckout && normalizedMethod === "COD")
        ? normalizedMethod
        : "CASH";

    if (nextMethod !== watchedPaymentMethod) {
      setCheckoutPaymentMethod(nextMethod);
      return;
    }

    if (nextMethod === "LAO_QR" && !watchedPaymentAccountId) {
      const defaultQrAccount = qrPaymentAccounts[0]?.id ?? "";
      if (defaultQrAccount) {
        form.setValue("paymentAccountId", defaultQrAccount, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      return;
    }

    if (nextMethod !== "LAO_QR" && watchedPaymentAccountId) {
      form.setValue("paymentAccountId", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [
    form,
    isOnlineCheckout,
    qrPaymentAccounts,
    setCheckoutPaymentMethod,
    watchedPaymentAccountId,
    watchedPaymentMethod,
  ]);

  useEffect(() => {
    if (isPickupLaterCheckout) {
      setPickupLaterCustomerOpen(false);
    }
  }, [isPickupLaterCheckout]);

  useEffect(() => {
    if (!isOnlineCheckout) {
      setOnlineChannelMode("FACEBOOK");
      setOnlineOtherChannelInput("");
      setOnlineCustomProviderOpen(false);
      setOnlineContactPickerOpen(false);
      setOnlineQuickFillInput("");
      setShippingFeeEnabled(false);
      return;
    }

    if (onlineChannelMode !== "OTHER") {
      const normalizedMode: OnlineChannelMode = watchedChannel === "WHATSAPP" ? "WHATSAPP" : "FACEBOOK";
      if (onlineChannelMode !== normalizedMode) {
        setOnlineChannelMode(normalizedMode);
      }
    }

    if (watchedContactId) {
      setOnlineContactPickerOpen(true);
    }
  }, [isOnlineCheckout, onlineChannelMode, watchedChannel, watchedContactId]);

  useEffect(() => {
    if (!isOnlineCheckout) {
      return;
    }
    const provider = watchedShippingProvider.trim();
    if (!provider) {
      setOnlineCustomProviderOpen(false);
      return;
    }
    if (!shippingProviderChipOptions.some((item) => item === provider)) {
      setOnlineCustomProviderOpen(true);
      return;
    }
    setOnlineCustomProviderOpen(false);
  }, [isOnlineCheckout, watchedShippingProvider, shippingProviderChipOptions]);

  useEffect(() => {
    const seen = window.localStorage.getItem(SCANNER_PERMISSION_STORAGE_KEY) === "1";
    setHasSeenScannerPermission(seen);
  }, []);

  useEffect(() => {
    if (!isCreateOnlyMode) {
      return;
    }

    const searchStickyElement = createOnlySearchStickyRef.current;
    const cartStickyElement = createOnlyCartStickyRef.current;
    if (!searchStickyElement || !cartStickyElement) {
      return;
    }

    const updateCartStickyTop = () => {
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      const safeRootFontSize = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
      const stickyTopOffsetPx = CREATE_ONLY_SEARCH_STICKY_TOP_REM * safeRootFontSize;
      const searchSectionHeightPx = searchStickyElement.offsetHeight;
      const viewportWidth = window.innerWidth;
      const isTabletViewport =
        viewportWidth >= TABLET_MIN_WIDTH_PX && viewportWidth < DESKTOP_MIN_WIDTH_PX;
      const layoutGapPx = cartStickyElement.offsetTop - (
        searchStickyElement.offsetTop + searchSectionHeightPx
      );
      const safeLayoutGapPx =
        Number.isFinite(layoutGapPx) && layoutGapPx >= 0
          ? layoutGapPx
          : CREATE_ONLY_CART_STICKY_GAP_FALLBACK_PX;
      const nextTop = isTabletViewport
        ? Math.round(stickyTopOffsetPx + searchSectionHeightPx)
        : Math.round(
            stickyTopOffsetPx +
              searchSectionHeightPx +
              safeLayoutGapPx +
              CREATE_ONLY_CART_STICKY_EXTRA_TOP_PX,
          );
      setDesktopCartStickyTop((prev) => {
        const nextTopValue = `${nextTop}px`;
        return prev === nextTopValue ? prev : nextTopValue;
      });
    };

    updateCartStickyTop();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateCartStickyTop);
      resizeObserver.observe(searchStickyElement);
    }
    window.addEventListener("resize", updateCartStickyTop);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateCartStickyTop);
    };
  }, [isCreateOnlyMode]);

  const openScannerSheet = useCallback(() => {
    if (hasSeenScannerPermission) {
      setShowScannerSheet(true);
      return;
    }
    setShowScannerPermissionSheet(true);
  }, [hasSeenScannerPermission]);

  const renderCreateOrderForm = (options?: { inSheet?: boolean }) => {
    const inSheet = options?.inSheet ?? false;
    const isProductStep = isCreateOnlyMode ? createStep === "products" : true;
    const isDetailsStep = isCreateOnlyMode ? createStep === "details" : true;
    const canContinueToDetails = watchedItems.length > 0;
    const showStickyCartButton = isCreateOnlyMode ? isProductStep : inSheet;

    return (
      <form
        className="space-y-3"
        onSubmit={submitOrder}
        id={inSheet ? CREATE_ORDER_CHECKOUT_SHEET_FORM_ID : undefined}
      >
        {isCreateOnlyMode && !inSheet ? (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <button
              type="button"
              className={`h-9 rounded-md text-xs font-medium ${
                isProductStep ? "bg-blue-600 text-white" : "bg-white text-slate-600"
              }`}
              onClick={() => setCreateStep("products")}
              disabled={loading}
            >
              {t("orders.create.step.products")}
            </button>
            <button
              type="button"
              className={`h-9 rounded-md text-xs font-medium ${
                isDetailsStep ? "bg-blue-600 text-white" : "bg-white text-slate-600"
              }`}
              onClick={() => setCreateStep("details")}
              disabled={loading || !canContinueToDetails}
            >
              {t("orders.create.step.details")}
            </button>
          </div>
        ) : null}

        {isDetailsStep ? (
          <>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-700">{t("orders.create.orderType.title")}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      key: "WALK_IN_NOW",
                      label: t("orders.create.flow.walkInNow"),
                      description: t("orders.create.flow.walkInNowDesc"),
                    },
                    {
                      key: "PICKUP_LATER",
                      label: t("orders.create.flow.pickupLater"),
                      description: t("orders.create.flow.pickupLaterDesc"),
                    },
                    {
                      key: "ONLINE_DELIVERY",
                      label: t("orders.create.flow.onlineDelivery"),
                      description: t("orders.create.flow.onlineDeliveryDesc"),
                    },
                  ] satisfies Array<{ key: CheckoutFlow; label: string; description: string }>
                ).map((flowOption) => (
                  <button
                    key={flowOption.key}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-left transition-colors ${
                      checkoutFlow === flowOption.key
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                    onClick={() => applyCheckoutFlow(flowOption.key)}
                    disabled={loading}
                  >
                    <p className="text-xs font-medium">{flowOption.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{flowOption.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {isOnlineCheckout ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("orders.create.onlineChannel.title")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: "FACEBOOK", label: "Facebook" },
                      { key: "WHATSAPP", label: "WhatsApp" },
                      { key: "OTHER", label: t("orders.create.onlineChannel.other") },
                    ] satisfies Array<{ key: OnlineChannelMode; label: string }>
                  ).map((option) => {
                    const isActive = onlineChannelMode === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`h-10 rounded-md border px-2 text-xs font-medium ${
                          isActive
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                        }`}
                        onClick={() => onSelectOnlineChannelMode(option.key)}
                        disabled={loading}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {onlineChannelMode === "OTHER" ? (
                  <input
                    type="text"
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder={t("orders.create.onlineChannel.otherPlaceholder")}
                    value={onlineOtherChannelInput}
                    onChange={(event) => setOnlineOtherChannelInput(event.target.value)}
                    disabled={loading}
                  />
                ) : null}
                <p className="text-[11px] text-slate-500">
                  {onlineChannelMode === "OTHER"
                    ? t("orders.create.onlineChannel.otherHint")
                    : t("orders.create.onlineChannel.selectHint")}
                </p>
              </div>
            ) : null}

            {isOnlineCheckout && onlineChannelMode !== "OTHER" && watchedChannel !== "WALK_IN" ? (
              <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-700 hover:text-blue-800"
                    onClick={() => setOnlineContactPickerOpen((prev) => !prev)}
                    disabled={loading}
                  >
                    {onlineContactPickerOpen
                      ? t("orders.create.contactPicker.hide")
                      : selectedOnlineContactLabel
                        ? t("orders.create.contactPicker.editSelected")
                        : t("orders.create.contactPicker.chooseOptional")}
                  </button>
                  {watchedContactId ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-600 hover:text-slate-800"
                      onClick={() => onPickContact("")}
                      disabled={loading}
                    >
                      {t("orders.create.quickFill.clear")}
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  {selectedOnlineContactLabel
                    ? t("orders.create.contactPicker.selected", { label: selectedOnlineContactLabel })
                    : t("orders.create.contactPicker.emptyHint")}
                </p>
                {onlineContactPickerOpen ? (
                  <>
                    <select
                      id="order-contact"
                      className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                      disabled={loading}
                      value={form.watch("contactId") ?? ""}
                      onChange={(event) => onPickContact(event.target.value)}
                    >
                      <option value="">{t("orders.create.contactPicker.skipOption")}</option>
                      {onlineChannelContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.displayName}
                        </option>
                      ))}
                    </select>
                    {onlineChannelContacts.length <= 0 ? (
                      <p className="text-xs text-slate-500">
                        {t("orders.create.contactPicker.noContacts")}
                      </p>
                    ) : null}
                    <p className="text-xs text-red-600">{form.formState.errors.contactId?.message}</p>
                  </>
                ) : null}
              </div>
            ) : null}

            {isOnlineCheckout ? (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <label className="text-xs font-medium text-slate-700" htmlFor="online-quick-fill">
                  {t("orders.create.quickFill.title")}
                </label>
                <textarea
                  id="online-quick-fill"
                  className="min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
                  placeholder={t("orders.create.quickFill.placeholder")}
                  value={onlineQuickFillInput}
                  onChange={(event) => setOnlineQuickFillInput(event.target.value)}
                  disabled={loading}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-8 rounded-md border border-slate-300 px-2 text-xs text-slate-600"
                    onClick={() => setOnlineQuickFillInput("")}
                    disabled={loading || onlineQuickFillInput.trim().length <= 0}
                  >
                    {t("orders.create.quickFill.clear")}
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-md border border-blue-300 bg-blue-50 px-2 text-xs font-medium text-blue-700"
                    onClick={applyOnlineQuickFill}
                    disabled={loading || onlineQuickFillInput.trim().length <= 0}
                  >
                    {t("orders.create.quickFill.apply")}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  {t("orders.create.quickFill.hint")}
                </p>
              </div>
            ) : null}

            {isPickupLaterCheckout ? (
              <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  className="text-xs font-medium text-blue-700 hover:text-blue-800"
                  onClick={() => setPickupLaterCustomerOpen((prev) => !prev)}
                  disabled={loading}
                >
                  {pickupLaterCustomerOpen
                    ? t("orders.create.pickupCustomer.hide")
                    : hasPickupCustomerIdentity
                      ? t("orders.create.pickupCustomer.edit")
                      : t("orders.create.pickupCustomer.add")}
                </button>
                {!pickupLaterCustomerOpen ? (
                  <p className="text-xs text-slate-500">
                    {t("orders.create.pickupCustomer.status", { summary: pickupCustomerIdentitySummary })}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">{t("orders.create.pickupCustomer.hint")}</p>
                )}
              </div>
            ) : null}

            {showCustomerIdentityFields ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="order-customer-name">
                    {isOnlineCheckout
                      ? t("orders.create.customerName.onlineLabel")
                      : t("orders.create.customerName.optionalLabel")}
                  </label>
                  <input
                    id="order-customer-name"
                    className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loading}
                    {...form.register("customerName")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="order-customer-phone">
                    {requiresCustomerPhone
                      ? t("orders.create.customerPhone.requiredLabel")
                      : t("orders.create.customerPhone.optionalLabel")}
                  </label>
                  <input
                    id="order-customer-phone"
                    className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loading}
                    {...form.register("customerPhone")}
                  />
                  <p className="text-xs text-red-600">{form.formState.errors.customerPhone?.message}</p>
                  {!isOnlineCheckout ? (
                    <p className="text-xs text-slate-500">{t("orders.create.customerPhone.optionalHint")}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            {isOnlineCheckout ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="order-address">
                    {t("orders.create.address.requiredLabel")}
                  </label>
                  <textarea
                    id="order-address"
                    className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loading}
                    {...form.register("customerAddress")}
                  />
                  <p className="text-xs text-red-600">{form.formState.errors.customerAddress?.message}</p>
                </div>

                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-700">
                    {t("orders.create.shipping.title")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {shippingProviderChipOptions.map((provider) => {
                      const isActive = watchedShippingProvider.trim() === provider;
                      return (
                        <button
                          key={provider}
                          type="button"
                          className={`h-10 rounded-md border px-2 text-xs font-medium ${
                            isActive
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                          }`}
                          onClick={() => onSelectShippingProviderChip(provider)}
                          disabled={loading}
                        >
                          {provider}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`h-10 rounded-md border px-2 text-xs font-medium ${
                        onlineCustomProviderOpen
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                      }`}
                      onClick={onToggleCustomShippingProvider}
                      disabled={loading}
                    >
                      {t("orders.create.shipping.other")}
                    </button>
                  </div>
                  {onlineCustomProviderOpen ? (
                    <input
                      type="text"
                      className="h-9 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                      placeholder={t("orders.create.shipping.otherPlaceholder")}
                      value={isKnownShippingProvider ? "" : watchedShippingProvider}
                      onChange={(event) => {
                        form.setValue("shippingProvider", event.target.value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        if (event.target.value.trim().length > 0) {
                          form.clearErrors("shippingProvider");
                        }
                      }}
                      disabled={loading}
                    />
                  ) : null}
                  {form.formState.errors.shippingProvider?.message ? (
                    <p className="text-xs text-red-600">{form.formState.errors.shippingProvider.message}</p>
                  ) : watchedShippingProvider.trim().length <= 0 ? (
                    <p className="text-[11px] text-amber-700">{t("orders.create.shipping.requiredHint")}</p>
                  ) : (
                    <p className="text-[11px] text-slate-500">{t("orders.create.shipping.selectedHint")}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                {isPickupLaterCheckout
                  ? t("orders.create.pickupModeHint")
                  : t("orders.create.walkInModeHint")}
              </p>
            )}
          </>
        ) : null}

        {isProductStep ? (
          <div id="order-cart-section" className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {t("orders.create.items.title", {
                count: watchedItems.length.toLocaleString(locale),
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loading || !hasCatalogProducts}
                onClick={openScannerSheet}
              >
                {t("orders.create.items.scanAdd")}
              </button>
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loading || !hasCatalogProducts}
                onClick={() =>
                  append({
                    productId: catalog.products[0]?.productId ?? "",
                    unitId: catalog.products[0]?.units[0]?.unitId ?? "",
                    qty: 1,
                  })
                }
              >
                {t("orders.create.items.addRow")}
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-xs font-medium text-slate-700">{t("orders.create.quickAdd.title")}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="h-10 flex-1 rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                placeholder={t("orders.create.quickAdd.searchPlaceholder")}
                value={quickAddKeyword}
                onChange={(event) => setQuickAddKeyword(event.target.value)}
                disabled={loading || !hasCatalogProducts}
              />
              {quickAddKeyword.trim() ? (
                <button
                  type="button"
                  className="h-10 rounded-md border border-slate-300 px-3 text-xs text-slate-600"
                  onClick={() => setQuickAddKeyword("")}
                  disabled={loading}
                >
                  {t("orders.create.quickFill.clear")}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`h-8 rounded-md border px-2 text-xs ${
                  quickAddOnlyAvailable
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
                onClick={() => setQuickAddOnlyAvailable((prev) => !prev)}
                disabled={loading || !hasCatalogProducts}
              >
                {quickAddOnlyAvailable
                  ? t("orders.create.quickAdd.onlyAvailableOn")
                  : t("orders.create.quickAdd.onlyAvailableOff")}
              </button>
            </div>
            {!hasCatalogProducts ? (
              <p className="text-xs text-slate-500">{t("orders.create.cartSheet.empty")}</p>
            ) : quickAddProducts.length === 0 ? (
              <p className="text-xs text-slate-500">{t("orders.create.productNotFound")}</p>
            ) : (
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {quickAddProducts.map((product) => (
                  <button
                    key={product.productId}
                    type="button"
                    className="rounded-md border bg-white px-3 py-2 text-left transition-colors hover:bg-blue-50"
                    onClick={() => {
                      const addedProduct = addProductFromCatalog(product.productId);
                      if (addedProduct) {
                        setScanMessage(
                          `${t("orders.create.items.addRow")} ${addedProduct.sku} - ${addedProduct.name}`,
                        );
                      }
                    }}
                    disabled={loading}
                  >
                    <p className="text-xs text-slate-500">{product.sku}</p>
                    <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">
                      {t("orders.create.remainingLabel")} {product.available.toLocaleString(locale)}
                    </p>
                    {product.available > 0 ? (
                      <p className="mt-1 text-xs font-medium text-blue-700">
                        {t("orders.create.items.addRow")} {getProductDefaultUnitPrice(product).toLocaleString(locale)}{" "}
                        {catalog.storeCurrency}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-medium text-rose-600">{t("orders.create.outOfStock")}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {scanMessage ? <p className="text-xs text-emerald-700">{scanMessage}</p> : null}

          {notFoundBarcode ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="text-xs text-amber-700">
                {t("orders.create.scanner.notFoundPrefix")} <span className="font-semibold">{notFoundBarcode}</span>{" "}
                {t("orders.create.scanner.notFoundSuffix")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  className="h-10 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                  placeholder={t("orders.create.searchPlaceholder")}
                  value={manualSearchKeyword}
                  onChange={(event) => setManualSearchKeyword(event.target.value)}
                  disabled={loading}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-700"
                    onClick={openScannerSheet}
                    disabled={loading}
                  >
                    {t("orders.create.scanner.scanAgain")}
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600"
                    onClick={() => {
                      setNotFoundBarcode(null);
                      setManualSearchKeyword("");
                    }}
                    disabled={loading}
                  >
                    {t("common.close")}
                  </button>
                </div>
              </div>

              {manualSearchKeyword.trim() ? (
                manualSearchResults.length > 0 ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-amber-200 bg-white p-1">
                    {manualSearchResults.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-amber-100"
                        onClick={() => pickProductFromManualSearch(product.productId)}
                        disabled={loading}
                      >
                        <span className="font-medium text-slate-800">
                          {product.sku} - {product.name}
                        </span>
                        <span className="text-slate-500">{product.barcode ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700">{t("orders.create.productNotFound")}</p>
                )
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 sm:hidden">
            {watchedItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                {t("orders.create.cartSheet.empty")}
              </p>
            ) : (
              watchedItems.slice(0, 2).map((item, index) => {
                const selectedProduct = productsById.get(item.productId ?? "");
                const selectedUnit = selectedProduct?.units.find(
                  (unit) => unit.unitId === item.unitId,
                );
                const availableQty = getProductAvailableQty(item.productId ?? "");
                const currentQty = Number(item.qty ?? 0) || 0;
                const lineTotal =
                  (Number(item.qty ?? 0) || 0) * (selectedUnit?.pricePerUnit ?? 0);

                return (
                  <div
                    key={`${item.productId}-${index}`}
                    className="space-y-2 rounded-lg border bg-white p-2"
                  >
                    <p className="text-xs text-slate-500">{selectedProduct?.sku ?? "-"}</p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedProduct?.name ?? t("orders.create.productNotFound")}
                    </p>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <select
                        className="h-9 rounded-md border px-2 text-sm outline-none ring-primary focus:ring-2"
                        value={item.unitId ?? ""}
                        onChange={(event) =>
                          form.setValue(`items.${index}.unitId`, event.target.value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        disabled={loading}
                      >
                        {selectedProduct?.units.map((unit) => (
                          <option key={unit.unitId} value={unit.unitId}>
                            {unit.unitCode}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="h-9 w-9 rounded-md border text-base text-slate-700"
                          onClick={() => decreaseItemQty(index)}
                          disabled={loading}
                          aria-label={t("orders.create.quantity.decrease")}
                        >
                          -
                        </button>
                        <div className="min-w-10 text-center text-sm font-medium text-slate-800">
                          {(Number(item.qty ?? 0) || 0).toLocaleString("th-TH")}
                        </div>
                        <button
                          type="button"
                          className="h-9 w-9 rounded-md border text-base text-slate-700"
                          onClick={() => increaseItemQty(index)}
                          disabled={loading || availableQty <= 0 || currentQty >= availableQty}
                          aria-label={t("orders.create.quantity.increase")}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-slate-500">
                        {t("orders.create.remainingLabel")} {selectedProduct?.available.toLocaleString(locale) ?? 0}
                      </p>
                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading}
                      >
                        {t("orders.create.remove")}
                      </button>
                    </div>
                    <p className="text-xs font-medium text-blue-700">
                      {t("orders.totalLabel")} {lineTotal.toLocaleString(locale)} {catalog.storeCurrency}
                    </p>
                  </div>
                );
              })
            )}
            {watchedItems.length > 2 ? (
              <button
                type="button"
                className="w-full rounded-lg border border-dashed px-3 py-2 text-xs font-medium text-blue-700"
                onClick={() => setShowCartSheet(true)}
              >
                {t("orders.create.moreItemsButton", {
                  count: (watchedItems.length - 2).toLocaleString(locale),
                })}
              </button>
            ) : null}
          </div>

          <div className="hidden space-y-2 sm:block">
            {fields.map((field, index) => {
              const selectedProduct = productsById.get(watchedItems[index]?.productId ?? "");
              const selectedUnit = selectedProduct?.units.find(
                (unit) => unit.unitId === watchedItems[index]?.unitId,
              );
              const lineTotal =
                (Number(watchedItems[index]?.qty ?? 0) || 0) * (selectedUnit?.pricePerUnit ?? 0);

              return (
                <div key={field.id} className="space-y-2 rounded-lg border p-2">
                  <div className="grid grid-cols-1 gap-2">
                    <select
                      className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                      value={watchedItems[index]?.productId ?? ""}
                      onChange={(event) => onChangeProduct(index, event.target.value)}
                      disabled={loading}
                    >
                      {catalog.products.map((product) => (
                        <option key={product.productId} value={product.productId}>
                          {product.sku} - {product.name}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-[1fr_1fr_90px_auto] gap-2">
                      <select
                        className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                        disabled={loading}
                        {...form.register(`items.${index}.unitId`)}
                      >
                        {selectedProduct?.units.map((unit) => (
                          <option key={unit.unitId} value={unit.unitId}>
                            {unit.unitCode}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                        disabled={loading}
                        {...form.register(`items.${index}.qty`)}
                      />

                      <div className="h-10 rounded-md border bg-slate-50 px-2 py-2 text-xs text-slate-600">
                        {t("orders.create.remainingLabel")} {selectedProduct?.available.toLocaleString(locale) ?? 0}
                      </div>

                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading}
                      >
                        {t("orders.create.remove")}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-blue-700">
                    {t("orders.totalLabel")} {lineTotal.toLocaleString(locale)} {catalog.storeCurrency}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-red-600">{form.formState.errors.items?.message}</p>

          {showStickyCartButton ? (
            <button
              type="button"
              className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 flex items-center justify-between rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm sm:hidden"
              onClick={() => setShowCartSheet(true)}
              disabled={watchedItems.length === 0}
            >
              <span>
                {t("orders.create.cartButton.summary", {
                  items: watchedItems.length.toLocaleString(locale),
                  qty: cartQtyTotal.toLocaleString(locale),
                  total: `${totals.total.toLocaleString(locale)} ${catalog.storeCurrency}`,
                })}
              </span>
            </button>
          ) : null}
          </div>
        ) : isCreateOnlyMode ? (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {t("orders.create.items.title", {
                  count: watchedItems.length.toLocaleString(locale),
                })}
              </p>
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                onClick={() => {
                  if (inSheet) {
                    setShowCheckoutSheet(false);
                  }
                  setCreateStep("products");
                }}
                disabled={loading}
              >
                {inSheet ? t("orders.create.backToProducts") : t("orders.create.editItems")}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {t("orders.create.cartSummary", {
                qty: cartQtyTotal.toLocaleString(locale),
                total: `${totals.total.toLocaleString(locale)} ${catalog.storeCurrency}`,
              })}
            </p>
            <p className="text-xs text-red-600">{form.formState.errors.items?.message}</p>
          </div>
        ) : null}

        {isDetailsStep ? (
          <>
            <div className={`grid grid-cols-1 gap-2 ${isOnlineCheckout ? "min-[1200px]:grid-cols-2" : ""}`}>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-700">{t("orders.create.discount.title")}</p>
                    <p className="text-[11px] text-slate-500">
                      {t("orders.create.discount.hint", {
                        amount: `${maxDiscountAmount.toLocaleString(locale)} ${catalog.storeCurrency}`,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`h-8 rounded-md border px-2 text-xs font-medium ${
                      discountEnabled
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                    onClick={() => {
                      if (discountEnabled) {
                        setDiscountEnabled(false);
                        setDiscountInputMode("AMOUNT");
                        setDiscountPercentInput("");
                        applyDiscountAmount(0);
                        return;
                      }
                      setDiscountEnabled(true);
                    }}
                    disabled={loading}
                  >
                    {discountEnabled
                      ? t("orders.create.discount.disable")
                      : t("orders.create.discount.enable")}
                  </button>
                </div>
 
                {discountEnabled ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="inline-flex shrink-0 rounded-md border border-slate-300 bg-white p-0.5">
                        <button
                          type="button"
                          className={`h-7 rounded px-2 text-xs font-medium ${
                            discountInputMode === "AMOUNT"
                              ? "bg-blue-600 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                          onClick={() => {
                            setDiscountInputMode("AMOUNT");
                            setDiscountPercentInput("");
                          }}
                          disabled={loading}
                        >
                          {t("orders.create.discount.amountMode")}
                        </button>
                        <button
                          type="button"
                          className={`h-7 rounded px-2 text-xs font-medium ${
                            discountInputMode === "PERCENT"
                              ? "bg-blue-600 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                          onClick={() => {
                            setDiscountInputMode("PERCENT");
                            if (totals.discount > 0 && maxDiscountAmount > 0) {
                              const roundedPercent = Math.round(currentDiscountPercent * 10) / 10;
                              setDiscountPercentInput(
                                Number.isInteger(roundedPercent)
                                  ? String(roundedPercent)
                                  : roundedPercent.toFixed(1),
                              );
                            } else {
                              setDiscountPercentInput("");
                            }
                          }}
                          disabled={loading || maxDiscountAmount <= 0}
                        >
                          %
                        </button>
                      </div>
                      <span aria-hidden className="h-5 w-px shrink-0 bg-slate-300" />
 
                      {[5, 10, 20].map((percent) => {
                        const isActive = Math.abs(currentDiscountPercent - percent) < 0.5 && totals.discount > 0;
                        return (
                          <button
                            key={percent}
                            type="button"
                            className={`h-7 shrink-0 rounded-md border px-2 text-xs ${
                              isActive
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : "border-slate-300 bg-white text-slate-600"
                            }`}
                            onClick={() => {
                              setDiscountEnabled(true);
                              setDiscountInputMode("PERCENT");
                              setDiscountPercentInput(String(percent));
                              applyDiscountPercent(percent);
                            }}
                            disabled={loading || maxDiscountAmount <= 0}
                          >
                            {percent}%
                          </button>
                        );
                      })}
                    </div>

                    {discountInputMode === "AMOUNT" ? (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                        placeholder="0"
                        disabled={loading}
                        value={totals.discount > 0 ? String(totals.discount) : ""}
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          if (!raw) {
                            applyDiscountAmount(0);
                            return;
                          }
                          const parsed = Number(raw);
                          if (!Number.isFinite(parsed)) {
                            return;
                          }
                          applyDiscountAmount(parsed);
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                          placeholder="0"
                          disabled={loading || maxDiscountAmount <= 0}
                          value={discountPercentInput}
                          onChange={(event) => {
                            const raw = event.target.value.trim();
                            setDiscountPercentInput(raw);
                            if (!raw) {
                              applyDiscountAmount(0);
                              return;
                            }
                            const parsed = Number(raw);
                            if (!Number.isFinite(parsed)) {
                              return;
                            }
                            applyDiscountPercent(parsed);
                          }}
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    )}

                    <p className="text-xs font-medium text-emerald-700">
                      {t("orders.create.discount.applied", {
                        amount: `${totals.discount.toLocaleString(locale)} ${catalog.storeCurrency}`,
                      })}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">{t("orders.create.discount.none")}</p>
                )}
                <p className="text-xs text-red-600">{form.formState.errors.discount?.message}</p>
              </div>

              {isOnlineCheckout ? (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">
                        {t("orders.create.shippingFee.title")}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t("orders.create.shippingFee.description")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`h-8 shrink-0 whitespace-nowrap rounded-md border px-2 text-xs font-medium ${
                        shippingFeeEnabled
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white text-slate-600"
                      }`}
                      onClick={() => {
                        if (shippingFeeEnabled) {
                          setShippingFeeEnabled(false);
                          form.setValue("shippingFeeCharged", 0, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          form.setValue("shippingCost", 0, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          return;
                        }
                        setShippingFeeEnabled(true);
                      }}
                      disabled={loading}
                    >
                      {shippingFeeEnabled
                        ? t("orders.create.shippingFee.disable")
                        : t("orders.create.shippingFee.enable")}
                    </button>
                  </div>

                  {shippingFeeEnabled ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          {t("orders.create.shippingFee.charged")}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                          disabled={loading}
                          {...form.register("shippingFeeCharged")}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          {t("orders.create.shippingFee.cost")}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                          disabled={loading}
                          {...form.register("shippingCost")}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">{t("orders.create.shippingFee.none")}</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("orders.create.paymentMethod.title")}</label>
              <div className="flex flex-wrap items-center gap-2">
                {paymentMethodOptions.map((methodOption) => {
                  const isActive = watchedPaymentMethod === methodOption.key;
                  return (
                    <button
                      key={methodOption.key}
                      type="button"
                      className={`h-9 rounded-md border px-3 text-xs font-medium ${
                        isActive
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                      }`}
                      onClick={() => setCheckoutPaymentMethod(methodOption.key)}
                      disabled={loading}
                    >
                      {methodOption.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                {isOnlineCheckout
                  ? t("orders.create.paymentHint.online")
                  : t("orders.create.paymentHint.offline")}
              </p>
              <p className="text-xs text-red-600">{form.formState.errors.paymentMethod?.message}</p>
            </div>

            {watchedPaymentMethod === "LAO_QR" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="payment-account">
                  {t("orders.create.paymentAccount.title")}
                </label>
                <select
                  id="payment-account"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                  value={watchedPaymentAccountId}
                  onChange={(event) =>
                    form.setValue("paymentAccountId", event.target.value, { shouldValidate: true })
                  }
                >
                  <option value="">{t("orders.create.paymentAccount.select")}</option>
                  {qrPaymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} ({resolveLaosBankDisplayName(account.bankName)})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-red-600">{form.formState.errors.paymentAccountId?.message}</p>
                {selectedQrPaymentAccount ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700">
                          {t("orders.create.paymentAccount.previewTitle")}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {t("orders.create.paymentAccount.previewDescription")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`h-8 shrink-0 rounded-md border px-2 text-xs font-medium ${
                          showQrAccountPreview
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                        }`}
                        onClick={() => setShowQrAccountPreview((current) => !current)}
                        disabled={loading}
                      >
                        {showQrAccountPreview ? t("orders.create.qr.hide") : t("orders.create.qr.show")}
                      </button>
                    </div>

	                    {showQrAccountPreview ? (
	                      <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
	                        {selectedQrPaymentAccount.qrImageUrl ? (
	                          <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2">
	                            <div className="absolute right-3 top-3 flex items-center gap-2">
	                              <button
	                                type="button"
	                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400"
	                                onClick={openQrImageFull}
	                                disabled={loading}
                                aria-label={t("orders.create.qr.openFull")}
                                title={t("orders.create.qr.openFull")}
	                              >
	                                <Expand className="h-4 w-4" />
	                              </button>
	                              <button
	                                type="button"
	                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400"
	                                onClick={() => {
	                                  void downloadQrImage();
	                                }}
	                                disabled={loading}
                                aria-label={t("orders.create.qr.download")}
                                title={t("orders.create.qr.download")}
	                              >
	                                <ArrowDownToLine className="h-4 w-4" />
	                              </button>
	                            </div>
	                            <Image
	                              src={selectedQrPaymentAccount.qrImageUrl}
	                              alt={`QR ${selectedQrPaymentAccount.displayName}`}
                              width={240}
                              height={240}
                              className="mx-auto h-48 w-48 rounded object-contain"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <p className="rounded-md border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {t("orders.create.paymentAccount.noQrImage")}
                          </p>
                        )}

                        <div className="space-y-1.5 text-xs text-slate-600">
                          <p className="font-medium text-slate-800">{selectedQrPaymentAccount.displayName}</p>
                          <p>
                            {t("orders.create.paymentAccount.bank")}:{" "}
                            {resolveLaosBankDisplayName(selectedQrPaymentAccount.bankName)}
                          </p>
                          <p>
                            {t("orders.create.paymentAccount.name")}: {selectedQrPaymentAccount.accountName}
                          </p>
                          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-500">
                                {t("orders.create.paymentAccount.number")}
                              </p>
                              <p className="truncate font-medium text-slate-900">
                                {selectedQrPaymentAccount.accountNumber || "-"}
                              </p>
                            </div>
                            {selectedQrPaymentAccount.accountNumber ? (
                              <button
                                type="button"
                                className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:border-slate-400"
                                onClick={() => {
                                  void copyQrAccountNumber();
                                }}
                                disabled={loading}
                              >
                                {t("orders.create.paymentAccount.copyNumber")}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">
                  {catalog.requireSlipForLaoQr
                    ? t("orders.create.qr.policyRequireSlip")
                    : t("orders.create.qr.policyOptionalSlip")}
                </p>
              </div>
            ) : null}

            {watchedPaymentMethod === "ON_CREDIT" ? (
              <p className="rounded-md border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t("orders.create.onCreditHint")}
              </p>
            ) : null}

            {watchedPaymentMethod === "COD" ? (
              <p className="rounded-md border border-dashed border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                {t("orders.create.codHint")}
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                {t("orders.create.paymentCurrency.title")}
              </label>
              {supportedPaymentCurrencies.length <= 1 ? (
                <div className="flex h-10 items-center rounded-md border bg-slate-50 px-3 text-sm font-medium text-slate-700">
                  {currencyLabel(selectedPaymentCurrency)}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {supportedPaymentCurrencies.map((currency) => {
                    const isActive = selectedPaymentCurrency === currency;
                    return (
                      <button
                        key={currency}
                        type="button"
                        className={`h-9 rounded-md border px-3 text-xs font-medium ${
                          isActive
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                        }`}
                        disabled={loading}
                        onClick={() =>
                          form.setValue("paymentCurrency", currency, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      >
                        {currencyLabel(currency)}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-500">
                {supportedPaymentCurrencies.length <= 1
                  ? t("orders.create.paymentCurrency.singleHint", {
                      currency: currencyLabel(selectedPaymentCurrency),
                    })
                  : t("orders.create.paymentCurrency.multiHint", {
                      currencies: supportedPaymentCurrencies
                        .map((currency) => currencyLabel(currency))
                        .join(" / "),
                    })}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p>
                {t("orders.create.summary.subtotal")}: {subtotal.toLocaleString(locale)} {catalog.storeCurrency}
              </p>
              <p>
                {t("orders.create.summary.discount")}: {totals.discount.toLocaleString(locale)}{" "}
                {catalog.storeCurrency}
              </p>
              <p>
                {t("orders.create.summary.vat", { mode: vatModeLabel(catalog.vatMode) })}:{" "}
                {totals.vatAmount.toLocaleString(locale)} {catalog.storeCurrency}
              </p>
              <p className="font-semibold">
                {t("orders.create.summary.total")}: {totals.total.toLocaleString(locale)}{" "}
                {catalog.storeCurrency}
              </p>
              <p className="text-xs text-slate-500">
                {t("orders.create.summary.paymentCurrency")}: {currencyLabel(selectedPaymentCurrency)}
              </p>
              <p className="text-xs text-slate-500">
                {t("orders.create.summary.orderType")}: {checkoutFlowLabel(t, checkoutFlow)}
              </p>
              <p className="text-xs text-slate-500">
                {t("orders.create.summary.paymentMethod")}: {paymentMethodLabel(t, watchedPaymentMethod)}
              </p>
              {isOnlineCheckout && watchedShippingProvider.trim() ? (
                <p className="text-xs text-slate-500">
                  {t("orders.create.summary.shippingProvider")}: {watchedShippingProvider.trim()}
                </p>
              ) : null}
            </div>

            {!inSheet ? (
              <div>
                <Button type="submit" className="h-10 w-full" disabled={loading || !canCreate}>
                  {loading ? t("orders.create.submitting") : t("orders.create.submit")}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs text-slate-600">
              {t("orders.create.detailsStepHint")}
            </p>
            <Button
              type="button"
              className="h-10 w-full"
              onClick={() => setCreateStep("details")}
              disabled={loading || !canContinueToDetails}
            >
              {t("orders.create.detailsStepNext")}
            </Button>
          </div>
        )}
      </form>
    );
  };

  const renderCreateOnlyPosCatalog = () => {
    return (
      <div className="-mt-4 space-y-4 pb-28 md:pb-4">
        <div
          ref={createOnlySearchStickyRef}
          className="sticky top-[3.8rem] z-[9] -mx-1 space-y-3 border-b border-slate-200 bg-slate-50/95 px-1 pt-4 pb-2 backdrop-blur-sm md:top-[3.8rem]"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            <input
              type="text"
              className="h-10 min-w-0 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
              placeholder={t("orders.create.quickAdd.searchPlaceholder")}
              value={quickAddKeyword}
              onChange={(event) => setQuickAddKeyword(event.target.value)}
              disabled={loading || !hasCatalogProducts}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 w-10 p-0"
              disabled={loading || !hasCatalogProducts}
              onClick={openScannerSheet}
              aria-label={t("orders.create.scanner.title")}
              title={t("orders.create.scanner.title")}
            >
              <ScanLine className="h-4 w-4" />
              <span className="sr-only">{t("orders.create.scanner.title")}</span>
            </Button>
            <button
              type="button"
              className={`h-10 shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[11px] sm:px-3 sm:text-xs ${
                quickAddOnlyAvailable
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
              onClick={() => setQuickAddOnlyAvailable((prev) => !prev)}
              disabled={loading || !hasCatalogProducts}
            >
              {quickAddOnlyAvailable
                ? t("orders.create.quickAdd.onlyAvailableOn")
                : t("orders.create.quickAdd.onlyAvailableOff")}
            </button>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setShowRecentOrdersSheet(true)}
              disabled={loading}
            >
              <Clock3 className="h-3.5 w-3.5" />
              {t("orders.create.quickAdd.latest")}
            </Button>
          </div>

          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex min-w-max items-center gap-2">
              <button
                type="button"
                className={`h-8 rounded-full border px-3 text-xs ${
                  quickAddCategoryId === "ALL"
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
                onClick={() => setQuickAddCategoryId("ALL")}
                disabled={loading || !hasCatalogProducts}
              >
                {t("orders.create.quickAdd.allCategories")}
              </button>
              {quickAddCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`h-8 rounded-full border px-3 text-xs ${
                    quickAddCategoryId === category.id
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-600"
                  }`}
                  onClick={() => setQuickAddCategoryId(category.id)}
                  disabled={loading || !hasCatalogProducts}
                >
                  {category.name} ({category.count})
                </button>
              ))}
            </div>
          </div>

          {scanMessage ? <p className="text-xs text-emerald-700">{scanMessage}</p> : null}

          {notFoundBarcode ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="text-xs text-amber-700">
                {t("orders.create.scanner.notFoundPrefix")}{" "}
                <span className="font-semibold">{notFoundBarcode}</span>{" "}
                {t("orders.create.scanner.notFoundSuffix")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  className="h-10 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                  placeholder={t("orders.create.searchPlaceholder")}
                  value={manualSearchKeyword}
                  onChange={(event) => setManualSearchKeyword(event.target.value)}
                  disabled={loading}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-700"
                    onClick={openScannerSheet}
                    disabled={loading}
                  >
                    {t("orders.create.scanner.scanAgain")}
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600"
                    onClick={() => {
                      setNotFoundBarcode(null);
                      setManualSearchKeyword("");
                    }}
                    disabled={loading}
                  >
                    {t("common.close")}
                  </button>
                </div>
              </div>
              {manualSearchKeyword.trim() ? (
                manualSearchResults.length > 0 ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-amber-200 bg-white p-1">
                    {manualSearchResults.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-amber-100"
                        onClick={() => pickProductFromManualSearch(product.productId)}
                        disabled={loading}
                      >
                        <span className="font-medium text-slate-800">
                          {product.sku} - {product.name}
                        </span>
                        <span className="text-slate-500">{product.barcode ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700">{t("orders.create.quickAdd.searchEmpty")}</p>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{t("orders.create.catalog.title")}</p>
              <p className="text-xs text-slate-500">
                {t("orders.create.catalog.count", {
                  count: quickAddProducts.length.toLocaleString(locale),
                })}
              </p>
            </div>
            {!hasCatalogProducts ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
                {t("orders.create.catalog.empty")}
              </p>
            ) : quickAddProducts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
                {t("orders.create.catalog.searchEmpty")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {quickAddProducts.map((product) => (
                  <button
                    key={product.productId}
                    type="button"
                    className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => {
                      const addedProduct = addProductFromCatalog(product.productId);
                      if (addedProduct) {
                        setScanMessage(
                          t("orders.create.feedback.added", {
                            sku: addedProduct.sku,
                            name: addedProduct.name,
                          }),
                        );
                      }
                    }}
                    disabled={loading}
                  >
                    <div className="relative h-12 w-12 overflow-hidden rounded-md border border-slate-200 bg-slate-100 sm:h-14 sm:w-14">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          sizes="(min-width: 1280px) 56px, (min-width: 640px) 56px, 48px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-400">
                          NO IMG
                        </div>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-slate-500">{product.sku}</p>
                    <p className="line-clamp-2 text-[13px] font-medium text-slate-900 sm:text-sm">
                      {product.name}
                    </p>
                    <p className="text-[11px] font-semibold text-blue-700 sm:text-xs">
                      {getProductDefaultUnitPrice(product).toLocaleString("th-TH")} {catalog.storeCurrency}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-500">
                        {t("orders.create.remainingLabel")} {product.available.toLocaleString(locale)}
                      </p>
                      {product.available > 0 ? (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          {t("orders.create.catalog.add")}
                        </span>
                      ) : (
                        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                          {t("orders.create.outOfStock")}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside
            ref={createOnlyCartStickyRef}
            className="hidden rounded-2xl border border-slate-200 bg-white p-3 md:sticky md:flex md:min-h-[26rem] md:flex-col md:overflow-hidden"
            style={{
              top: desktopCartStickyTop,
              height: `calc(100dvh - ${desktopCartStickyTop} - 2.5rem)`,
            }}
          >
            <div className="flex items-center justify-between gap-2 pb-2">
              <p className="text-sm font-semibold text-slate-900">
                {t("orders.create.cartSheet.title")} ({watchedItems.length.toLocaleString(locale)})
              </p>
              <button
                type="button"
                className="text-xs font-medium text-blue-700 disabled:text-slate-400"
                onClick={() => setShowCartSheet(true)}
                disabled={loading || watchedItems.length === 0}
              >
                {t("orders.create.catalog.openCartFull")}
              </button>
            </div>

            {watchedItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                {t("orders.create.cartSheet.empty")}
              </p>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {watchedItems.map((item, index) => {
                  const selectedProduct = productsById.get(item.productId ?? "");
                  const selectedUnit = selectedProduct?.units.find((unit) => unit.unitId === item.unitId);
                  const availableQty = getProductAvailableQty(item.productId ?? "");
                  const currentQty = Number(item.qty ?? 0) || 0;
                  const lineTotal = (Number(item.qty ?? 0) || 0) * (selectedUnit?.pricePerUnit ?? 0);

                  return (
                    <div
                      key={`${item.productId}-${index}`}
                      className="space-y-1.5 rounded-lg border border-slate-200 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-900">
                            {selectedProduct?.name ?? t("orders.create.productNotFound")}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {t("orders.create.remainingLabel")}{" "}
                            {selectedProduct?.available.toLocaleString(locale) ?? 0}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] text-red-600"
                          onClick={() => remove(index)}
                          disabled={loading}
                        >
                          {t("orders.create.remove")}
                        </button>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_auto_6.5rem] items-center gap-1.5">
                        <select
                          className="h-7 w-full min-w-0 rounded-md border px-2 text-[11px] outline-none ring-primary focus:ring-2"
                          value={item.unitId ?? ""}
                          onChange={(event) =>
                            form.setValue(`items.${index}.unitId`, event.target.value, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          disabled={loading}
                        >
                          {selectedProduct?.units.map((unit) => (
                            <option key={unit.unitId} value={unit.unitId}>
                              {unit.unitCode}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-7 w-7 rounded-md border text-xs text-slate-700"
                            onClick={() => decreaseItemQty(index)}
                            disabled={loading}
                            aria-label={t("orders.create.quantity.decrease")}
                          >
                            -
                          </button>
                          <div className="min-w-7 text-center text-xs font-medium text-slate-900">
                            {(Number(item.qty ?? 0) || 0).toLocaleString("th-TH")}
                          </div>
                          <button
                            type="button"
                            className="h-7 w-7 rounded-md border text-xs text-slate-700"
                            onClick={() => increaseItemQty(index)}
                            disabled={loading || availableQty <= 0 || currentQty >= availableQty}
                            aria-label={t("orders.create.quantity.increase")}
                          >
                            +
                          </button>
                        </div>
                        <span className="text-right text-xs font-semibold tabular-nums text-slate-900">
                          {lineTotal.toLocaleString("th-TH")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 shrink-0 space-y-2 border-t border-slate-200 bg-white pt-3">
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                <p className="text-slate-600">
                  {t("orders.create.cartSummary", {
                    qty: cartQtyTotal.toLocaleString(locale),
                    total: `${totals.total.toLocaleString(locale)} ${catalog.storeCurrency}`,
                  })}
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
                </p>
              </div>

              <Button
                type="button"
                className="h-10 w-full"
                onClick={openCheckoutSheet}
                disabled={loading || watchedItems.length === 0}
              >
                {t("orders.create.catalog.nextPayment")}
              </Button>
            </div>
          </aside>
        </div>

        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 md:hidden">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <p>
                {t("orders.create.cartSummary", {
                  qty: cartQtyTotal.toLocaleString(locale),
                  total: `${totals.total.toLocaleString(locale)} ${catalog.storeCurrency}`,
                })}
              </p>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-blue-700 active:bg-blue-50 disabled:text-slate-400"
                onClick={() => setShowCartSheet(true)}
                disabled={watchedItems.length === 0}
              >
                {t("orders.create.catalog.openCart")}
              </button>
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm disabled:bg-slate-300"
              onClick={openCheckoutSheet}
              disabled={watchedItems.length === 0 || loading}
            >
              {t("orders.create.catalog.nextPayment")} {totals.total.toLocaleString(locale)}{" "}
              {catalog.storeCurrency}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      {isCreateOnlyMode ? (
        canCreate ? (
          renderCreateOnlyPosCatalog()
        ) : (
          <p className="text-sm text-red-600">{t("orders.noPermission")}</p>
        )
      ) : (
        <>
          <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
              <p className="text-xs text-slate-500 sm:text-sm">
                {formatNumberByLanguage(language, visibleOrders.length)} {t("dashboard.unit.items")}
              </p>
              <Button
                type="button"
                className="h-9 rounded-xl px-3 text-sm"
                onClick={() => router.push("/orders/new")}
                disabled={!canCreate || loading}
              >
                {t("orders.action.create")}
              </Button>
            </div>

            <div className="border-t border-slate-200/80 bg-white p-2.5 sm:p-3">
              <div className="grid grid-cols-4 gap-1 lg:hidden">
                {tabOptions.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => router.push(buildOrdersUrl(tab.key, 1))}
                    className={`min-w-0 rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold leading-tight transition-all ${
                      activeTab === tab.key
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>
              <div className="hidden grid-cols-2 gap-2 lg:grid lg:grid-cols-4">
                {tabOptions.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => router.push(buildOrdersUrl(tab.key, 1))}
                    className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-all ${
                      activeTab === tab.key
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <section className={`space-y-2 ${selectedOrderIds.length > 0 ? "pb-24 md:pb-0" : ""}`}>
            {bulkActionEligibleOrders.length > 0 ? (
              <article className="hidden rounded-2xl border border-blue-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] p-2.5 shadow-sm md:block">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-800">
                      {t("orders.bulk.availableQuickActions", {
                        count: formatNumberByLanguage(language, bulkActionEligibleOrders.length),
                      })}
                    </span>
                    {selectedOrderIds.length > 0 ? (
                      <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 font-medium text-blue-700">
                        {t("orders.bulk.selectedCount", {
                          count: formatNumberByLanguage(language, selectedOrderIds.length),
                        })}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      {t("orders.bulk.packReady", {
                        count: formatNumberByLanguage(language, bulkPackEligibleOrders.length),
                      })}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      {t("orders.bulk.shipReady", {
                        count: formatNumberByLanguage(language, bulkShipEligibleOrders.length),
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-xl px-3 text-xs sm:text-sm"
                      onClick={toggleSelectAllBulkPackOrders}
                      disabled={isBulkActionSubmitting}
                    >
                      {allBulkPackSelected ? t("orders.bulk.clearAll") : t("orders.bulk.selectAll")}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 rounded-xl px-3 text-xs sm:text-sm"
                      onClick={() => setShowBulkPackConfirmSheet(true)}
                      disabled={isBulkActionSubmitting || selectedBulkPackOrders.length <= 0}
                    >
                      {bulkPackSubmitting
                        ? t("orders.bulk.packing")
                        : t("orders.bulk.packAction", {
                            count: formatNumberByLanguage(language, selectedBulkPackOrders.length),
                          })}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-xl px-3 text-xs sm:text-sm"
                      onClick={() => setShowBulkShipConfirmSheet(true)}
                      disabled={isBulkActionSubmitting || selectedBulkShipOrders.length <= 0}
                    >
                      {bulkShipSubmitting
                        ? t("orders.bulk.shipping")
                        : t("orders.bulk.shipAction", {
                            count: formatNumberByLanguage(language, selectedBulkShipOrders.length),
                          })}
                    </Button>
                  </div>
                </div>
              </article>
            ) : null}

            {visibleOrders.length === 0 ? (
              <article className="rounded-xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
                {t("orders.emptyTab")}
              </article>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {visibleOrders.map((order) => {
                    const badges = buildOrderStatusBadges(t, order);
                    const canBulkPack = isOrderEligibleForBulkPack(order);
                    const canBulkShip = isOrderEligibleForBulkShip(order);
                    const isSelectedForBulkPack = selectedOrderIds.includes(order.id);
                    const readinessLabel = canBulkShip
                      ? t("orders.readiness.readyToShip")
                      : canBulkPack
                        ? t("orders.readiness.readyToPack")
                        : t("orders.readiness.viewDetail");
                    return (
                      <article
                        key={order.id}
                        className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)] transition-shadow active:shadow-sm"
                        role="link"
                        tabIndex={0}
                        aria-label={t("orders.actions.openDetail")}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/orders/${order.id}`);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            {canBulkPack || canBulkShip ? (
                              <input
                                type="checkbox"
                                checked={isSelectedForBulkPack}
                                aria-label={t("orders.bulk.selectForAction", { orderNo: order.orderNo })}
                                className="mt-0.5"
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggleBulkPackOrderSelection(order.id)}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-slate-500">
                                {order.orderNo} • {new Date(order.createdAt).toLocaleDateString(locale)}
                              </p>
                              <h3 className="truncate text-sm font-semibold text-slate-900">
                                {order.customerName || order.contactDisplayName || t("orders.customer.default")}
                              </h3>
                              <p className="text-xs text-slate-500">
                                {channelSummaryLabel(t, order)} • {order.paymentCurrency} •{" "}
                                {paymentMethodLabel(t, order.paymentMethod)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="flex flex-col items-end gap-1">
                              {badges.map((badge) => (
                                <span
                                  key={`${order.id}-${badge.label}-${badge.className}`}
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                            {renderOrderActionMenu(order)}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-500">{t("orders.totalLabel")}</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {order.total.toLocaleString(locale)} {catalog.storeCurrency}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                              canBulkPack || canBulkShip
                                ? "border border-blue-200 bg-blue-50 text-blue-700"
                                : "border border-slate-200 bg-white text-slate-500"
                            }`}
                          >
                            {readinessLabel}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_28px_-20px_rgba(15,23,42,0.18)] md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      {ordersTable.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <th key={header.id} className="px-3 py-2 font-medium">
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {ordersTable.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          role="link"
                          tabIndex={0}
                          aria-label={t("orders.actions.openDetail")}
                          onClick={() => router.push(`/orders/${row.original.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(`/orders/${row.original.id}`);
                            }
                          }}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2.5 align-top">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs shadow-[0_8px_20px_-18px_rgba(15,23,42,0.22)] sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground">
                    {t("orders.pagination.summary", {
                      page: formatNumberByLanguage(language, ordersPage!.page),
                      pageCount: formatNumberByLanguage(language, ordersPage!.pageCount),
                      total: formatNumberByLanguage(language, ordersPage!.total),
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={ordersPage!.page <= 1}
                      onClick={() => router.push(buildOrdersUrl(activeTab, ordersPage!.page - 1))}
                    >
                      {t("orders.pagination.previous")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={ordersPage!.page >= ordersPage!.pageCount}
                      onClick={() => router.push(buildOrdersUrl(activeTab, ordersPage!.page + 1))}
                    >
                      {t("orders.pagination.next")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
          {selectedOrderIds.length > 0 ? (
            <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 md:hidden">
              <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_18px_32px_-18px_rgba(15,23,42,0.28)] backdrop-blur">
                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                  <p>
                    {t("orders.bulk.selectedCount", {
                      count: formatNumberByLanguage(language, selectedOrderIds.length),
                    })}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="font-medium text-slate-700"
                      onClick={toggleSelectAllBulkPackOrders}
                      disabled={isBulkActionSubmitting}
                    >
                      {allBulkPackSelected ? t("orders.bulk.clearAll") : t("orders.bulk.selectAll")}
                    </button>
                    <button
                      type="button"
                      className="font-medium text-slate-700"
                      onClick={clearBulkPackSelection}
                      disabled={isBulkActionSubmitting}
                    >
                      {t("orders.bulk.clear")}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 rounded-xl text-sm"
                    onClick={() => setShowBulkPackConfirmSheet(true)}
                    disabled={isBulkActionSubmitting || selectedBulkPackOrders.length <= 0}
                  >
                    {bulkPackSubmitting
                      ? t("orders.bulk.packing")
                      : t("orders.bulk.packAction", {
                          count: formatNumberByLanguage(language, selectedBulkPackOrders.length),
                        })}
                  </Button>
                  <Button
                    type="button"
                    className="h-10 flex-1 rounded-xl text-sm"
                    onClick={() => setShowBulkShipConfirmSheet(true)}
                    disabled={isBulkActionSubmitting || selectedBulkShipOrders.length <= 0}
                  >
                    {bulkShipSubmitting
                      ? t("orders.bulk.shipping")
                      : t("orders.bulk.shipAction", {
                          count: formatNumberByLanguage(language, selectedBulkShipOrders.length),
                        })}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

        </>
      )}
      <SlideUpSheet
        isOpen={showScannerPermissionSheet}
        onClose={() => setShowScannerPermissionSheet(false)}
        title={t("orders.create.scanner.permissionTitle")}
        description={t("orders.create.scanner.permissionDescription")}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">
              {t("orders.create.scanner.permissionWhyTitle")}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>{t("orders.create.scanner.permissionBenefitFast")}</li>
              <li>{t("orders.create.scanner.permissionBenefitLessError")}</li>
              <li>{t("orders.create.scanner.permissionBenefitInline")}</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              onClick={() => setShowScannerPermissionSheet(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="h-10 flex-1"
              onClick={() => {
                window.localStorage.setItem(SCANNER_PERMISSION_STORAGE_KEY, "1");
                setHasSeenScannerPermission(true);
                setShowScannerPermissionSheet(false);
                setShowScannerSheet(true);
              }}
            >
              {t("orders.create.scanner.allowAndScan")}
            </Button>
          </div>
        </div>
      </SlideUpSheet>
      <SlideUpSheet
        isOpen={showScannerSheet}
        onClose={() => setShowScannerSheet(false)}
        title={t("orders.create.scanner.title")}
        description={t("orders.create.scanner.description")}
        disabled={loading}
      >
        <div className="p-4">
          {showScannerSheet ? (
            <BarcodeScannerPanel
              isOpen={showScannerSheet}
              onResult={onScanBarcodeResult}
              onClose={() => setShowScannerSheet(false)}
              cameraSelectId="orders-barcode-scanner-camera-select"
            />
          ) : null}
        </div>
      </SlideUpSheet>
      {isCreateOnlyMode ? (
        <SlideUpSheet
          isOpen={showRecentOrdersSheet}
          onClose={() => setShowRecentOrdersSheet(false)}
          title={t("orders.create.recentOrders.title")}
          description={t("orders.create.recentOrders.description", {
            count: formatNumberByLanguage(language, CREATE_ONLY_RECENT_ORDERS_LIMIT),
          })}
          disabled={recentOrdersLoading}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                {t("orders.create.recentOrders.summaryHint", {
                  action: t("orders.create.recentOrders.openSummary"),
                }).split(`"${t("orders.create.recentOrders.openSummary")}"`)[0]}
                <span className="font-semibold text-slate-800">
                  {t("orders.create.recentOrders.openSummary")}
                </span>
                {
                  t("orders.create.recentOrders.summaryHint", {
                    action: t("orders.create.recentOrders.openSummary"),
                  }).split(`"${t("orders.create.recentOrders.openSummary")}"`)[1]
                }
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={() => {
                  void fetchRecentOrders();
                }}
                disabled={recentOrdersLoading}
              >
                {recentOrdersLoading
                  ? t("orders.create.recentOrders.refreshing")
                  : t("orders.create.recentOrders.refresh")}
              </Button>
            </div>
            {recentOrdersLoading ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                {t("orders.create.recentOrders.loading")}
              </p>
            ) : recentOrdersError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                {recentOrdersError}
              </p>
            ) : recentOrders.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                {t("orders.create.recentOrders.empty")}
              </p>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{order.orderNo}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(order.createdAt).toLocaleString(locale)}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        {checkoutFlowLabel(t, order.checkoutFlow)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {t("orders.create.recentOrders.total", {
                        amount: `${formatNumberByLanguage(language, order.total)} ${order.paymentCurrency}`,
                        paymentMethod: paymentMethodLabel(t, order.paymentMethod),
                      })}
                    </p>
                    <div
                      className={`mt-2 grid gap-2 ${
                        canRequestCancel && CANCELLABLE_ORDER_STATUSES.has(order.status)
                          ? "grid-cols-3"
                          : "grid-cols-2"
                      }`}
                    >
                      <Button
                        type="button"
                        className="h-8 text-xs"
                        onClick={() => openRecentOrderSummary(order)}
                      >
                        {t("orders.create.recentOrders.openSummary")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => {
                          setShowRecentOrdersSheet(false);
                          router.push(`/orders/${order.id}`);
                        }}
                      >
                        {t("orders.create.recentOrders.viewDetail")}
                      </Button>
                      {canRequestCancel && CANCELLABLE_ORDER_STATUSES.has(order.status) ? (
                        <Button
                          type="button"
                          className="h-8 bg-rose-600 text-xs text-white hover:bg-rose-700"
                          onClick={() => openRecentOrderCancelModal(order)}
                        >
                          {t("orders.create.recentOrders.cancel")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SlideUpSheet>
      ) : null}
      <ManagerCancelApprovalModal
        isOpen={cancelApprovalTargetOrder !== null}
        orderNo={cancelApprovalTargetOrder?.orderNo ?? null}
        mode={canSelfApproveCancel ? "SELF_SLIDE" : "MANAGER_PASSWORD"}
        isHighRisk={
          cancelApprovalTargetOrder
            ? cancelApprovalTargetOrder.status === "PAID" ||
              cancelApprovalTargetOrder.status === "PACKED" ||
              cancelApprovalTargetOrder.status === "SHIPPED"
            : false
        }
        busy={cancelApprovalSubmitting}
        onClose={() => {
          if (cancelApprovalSubmitting) {
            return;
          }
          setCancelApprovalTargetOrder(null);
        }}
        onConfirm={cancelRecentOrderWithApproval}
      />
      <SlideUpSheet
        isOpen={showCartSheet}
        onClose={() => setShowCartSheet(false)}
        title={t("orders.create.cartSheet.title")}
        description={t("orders.create.cartSheet.description")}
        disabled={loading}
      >
        <div className="space-y-3">
          {watchedItems.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
              {t("orders.create.cartSheet.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {watchedItems.map((item, index) => {
                const selectedProduct = productsById.get(item.productId ?? "");
                const selectedUnit = selectedProduct?.units.find(
                  (unit) => unit.unitId === item.unitId,
                );
                const availableQty = getProductAvailableQty(item.productId ?? "");
                const currentQty = Number(item.qty ?? 0) || 0;
                const lineTotal =
                  (Number(item.qty ?? 0) || 0) * (selectedUnit?.pricePerUnit ?? 0);

                return (
                  <div key={`${item.productId}-${index}`} className="space-y-2 rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {selectedProduct?.name ?? t("orders.create.productNotFound")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t("orders.create.remainingLabel")}{" "}
                          {selectedProduct?.available.toLocaleString(locale) ?? 0}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading}
                      >
                        {t("orders.create.remove")}
                      </button>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_8.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_9.5rem]">
                      <select
                        className="h-8 w-full min-w-0 rounded-md border px-2 text-xs outline-none ring-primary focus:ring-2"
                        value={item.unitId ?? ""}
                        onChange={(event) =>
                          form.setValue(`items.${index}.unitId`, event.target.value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        disabled={loading}
                      >
                        {selectedProduct?.units.map((unit) => (
                          <option key={unit.unitId} value={unit.unitId}>
                            {unit.unitCode}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border text-sm text-slate-700"
                          onClick={() => decreaseItemQty(index)}
                          disabled={loading}
                          aria-label={t("orders.create.quantity.decrease")}
                        >
                          -
                        </button>
                        <div className="min-w-8 text-center text-xs font-medium text-slate-800">
                          {(Number(item.qty ?? 0) || 0).toLocaleString(locale)}
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border text-sm text-slate-700"
                          onClick={() => increaseItemQty(index)}
                          disabled={loading || availableQty <= 0 || currentQty >= availableQty}
                          aria-label={t("orders.create.quantity.increase")}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-right text-sm font-semibold tabular-nums text-slate-900">
                        {lineTotal.toLocaleString(locale)} {catalog.storeCurrency}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p>
              {t("orders.create.cartSheet.totalQty", {
                qty: formatNumberByLanguage(language, cartQtyTotal),
                items: formatNumberByLanguage(language, watchedItems.length),
              })}
            </p>
            <p className="font-semibold">
              {t("orders.create.cartSheet.netTotal", {
                total: `${formatNumberByLanguage(language, totals.total)} ${catalog.storeCurrency}`,
              })}
            </p>
          </div>

          {isCreateOnlyMode ? (
            <div className="space-y-2">
              <Button type="button" className="h-10 w-full" onClick={openCheckoutSheet}>
                {t("orders.create.cartSheet.proceed")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={() => setShowCartSheet(false)}
              >
                {t("orders.create.cartSheet.backToProducts")}
              </Button>
            </div>
          ) : (
            <Button type="button" className="h-10 w-full" onClick={() => setShowCartSheet(false)}>
              {t("orders.create.cartSheet.backToForm")}
            </Button>
          )}
        </div>
      </SlideUpSheet>
      {isCreateOnlyMode ? (
        <SlideUpSheet
          isOpen={showCheckoutSheet}
          onClose={requestCloseCheckoutSheet}
          closeOnBackdrop={false}
          scrollToTopOnOpen
          title={t("orders.create.checkoutSheet.title")}
          description={t("orders.create.checkoutSheet.description")}
          disabled={loading}
          footer={
            <Button
              type="submit"
              form={CREATE_ORDER_CHECKOUT_SHEET_FORM_ID}
              className="h-10 w-full"
              disabled={loading || !canCreate}
            >
              {loading ? t("orders.create.submitting") : t("orders.create.submit")}
            </Button>
          }
        >
          {renderCreateOrderForm({ inSheet: true })}
        </SlideUpSheet>
      ) : null}
      {showCheckoutSheet && showCheckoutCloseConfirm ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowCheckoutCloseConfirm(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-close-confirm-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
          >
            <h3 id="checkout-close-confirm-title" className="text-sm font-semibold text-slate-900">
              {t("orders.create.checkoutClose.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              {t("orders.create.checkoutClose.description")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => setShowCheckoutCloseConfirm(false)}
              >
                {t("orders.create.checkoutClose.stay")}
              </Button>
              <Button type="button" className="h-9" onClick={closeCheckoutSheet}>
                {t("orders.create.checkoutClose.close")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {showQrImageViewer && selectedQrPaymentAccount?.qrImageUrl ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 px-3 py-6 sm:px-6"
          onClick={() => setShowQrImageViewer(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5 text-slate-100">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedQrPaymentAccount.displayName}</p>
                <p className="truncate text-xs text-slate-400">
                  {t("orders.create.paymentAccount.viewerHint")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={openQrImageInNewTab}
                  aria-label={t("orders.create.qr.openNewTab")}
                  title={t("orders.create.qr.openNewTab")}
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={() => {
                    void downloadQrImage();
                  }}
                  aria-label={t("orders.create.qr.download")}
                  title={t("orders.create.qr.download")}
                >
                  <ArrowDownToLine className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
                  onClick={() => setShowQrImageViewer(false)}
                  aria-label={t("orders.create.qr.closeViewer")}
                  title={t("orders.create.qr.closeViewer")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[calc(100dvh-9rem)] items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.14),_transparent_60%)] p-4 sm:p-6">
              <Image
                src={selectedQrPaymentAccount.qrImageUrl}
                alt={`QR ${selectedQrPaymentAccount.displayName}`}
                width={1200}
                height={1200}
                className="h-auto max-h-[calc(100dvh-13rem)] w-auto max-w-full rounded-lg object-contain"
                unoptimized
              />
            </div>
          </div>
        </div>
      ) : null}
      {createdOrderSuccess ? (
        <SlideUpSheet
          isOpen={Boolean(createdOrderSuccess)}
          onClose={closeCreatedOrderSuccess}
          title={
            createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
              ? t("orders.create.success.title.pickup")
              : createdOrderSuccess.checkoutFlow === "ONLINE_DELIVERY"
                ? t("orders.create.success.title.delivery")
                : t("orders.create.success.title.walkIn")
          }
          description={t("orders.create.success.orderNoDescription", {
            orderNo: createdOrderSuccess.orderNo,
          })}
        >
          <div className="space-y-3">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
                ? t("orders.create.success.hint.pickup")
                : createdOrderSuccess.checkoutFlow === "ONLINE_DELIVERY"
                  ? t("orders.create.success.hint.delivery")
                  : t("orders.create.success.hint.walkIn")}
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-700">
                  {t("orders.create.success.receiptPreviewTitle")}
                </p>
                <p className="text-[11px] text-slate-500">
                  {t("orders.create.success.receiptPreviewDescription")}
                </p>
              </div>
              {receiptPreviewLoading ? (
                <p className="text-xs text-slate-500">
                  {t("orders.create.success.receiptPreviewLoading")}
                </p>
              ) : receiptPreviewError ? (
                <p className="text-xs text-red-600">{receiptPreviewError}</p>
              ) : receiptPreviewOrder ? (
                <div className="mx-auto w-[80mm] rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-900">
                  <p className="text-center text-[11px] font-semibold">
                    {t("orders.create.success.receiptDocumentTitle")}
                  </p>
                  <p className="text-center text-[10px]">
                    {t("orders.create.success.orderNoPrefix")} {receiptPreviewOrder.orderNo}
                  </p>
                  <p className="mt-1.5">
                    {t("orders.create.success.customerLabel")}:{" "}
                    {receiptPreviewOrder.customerName ||
                      receiptPreviewOrder.contactDisplayName ||
                      t("orders.create.customerFallback.walkIn")}
                  </p>
                  <p>
                    {t("orders.create.success.dateLabel")}:{" "}
                    {new Date(receiptPreviewOrder.createdAt).toLocaleString(locale)}
                  </p>
                  <div className="my-1 border-t border-dashed border-slate-400" />
                  <div className="space-y-1">
                    {receiptPreviewOrder.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{item.productName}</p>
                          <p className="truncate text-[9px] text-slate-500">{item.productSku}</p>
                        </div>
                        <p className="shrink-0 text-right">
                          {item.qty} {item.unitCode}
                        </p>
                          <p className="shrink-0 text-right">{item.lineTotal.toLocaleString(locale)}</p>
                      </div>
                    ))}
                    {receiptPreviewOrder.items.length > 4 ? (
                      <p className="text-[9px] text-slate-500">
                        {t("orders.create.success.moreItems", {
                          count: formatNumberByLanguage(language, receiptPreviewOrder.items.length - 4),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="my-1 border-t border-dashed border-slate-400" />
                  <p className="flex justify-between">
                    <span>{t("orders.create.success.netTotal")}</span>
                    <span className="font-semibold">
                      {receiptPreviewOrder.total.toLocaleString(locale)} {receiptPreviewOrder.storeCurrency}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {t("orders.create.success.receiptPreviewEmpty")}
                </p>
              )}
            </div>
            {createdOrderSuccess.checkoutFlow === "ONLINE_DELIVERY" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">
                    {t("orders.create.success.labelPreviewTitle")}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t("orders.create.success.labelPreviewDescription")}
                  </p>
                </div>
                {receiptPreviewLoading ? (
                  <p className="text-xs text-slate-500">
                    {t("orders.create.success.labelPreviewLoading")}
                  </p>
                ) : receiptPreviewError ? (
                  <p className="text-xs text-red-600">{receiptPreviewError}</p>
                ) : receiptPreviewOrder ? (
                  <div className="mx-auto max-w-[320px] rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-900">
                    <p className="text-center text-[11px] font-semibold">
                      {t("orders.create.success.labelDocumentTitle")}
                    </p>
                    <p className="text-center text-[10px]">
                      {t("orders.create.success.orderNoDescription", {
                        orderNo: receiptPreviewOrder.orderNo,
                      })}
                    </p>
                    <div className="my-1 border-t border-dashed border-slate-400" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {receiptPreviewOrder.customerName ||
                          receiptPreviewOrder.contactDisplayName ||
                          t("orders.create.customerFallback.walkIn")}
                      </p>
                      <p>
                        {t("orders.create.success.phoneLabel")}:{" "}
                        {receiptPreviewOrder.customerPhone || receiptPreviewOrder.contactPhone || "-"}
                      </p>
                      <p className="whitespace-pre-wrap">
                        {t("orders.create.success.addressLabel")}:{" "}
                        {receiptPreviewOrder.customerAddress || "-"}
                      </p>
                    </div>
                    <div className="my-1 border-t border-dashed border-slate-400" />
                    <div className="space-y-0.5 text-[9px] text-slate-700">
                      <p>
                        {t("orders.create.success.shippingProvider")}:{" "}
                        {receiptPreviewOrder.shippingProvider ||
                          receiptPreviewOrder.shippingCarrier ||
                          "-"}
                      </p>
                      <p>
                        {t("orders.create.success.trackingLabel")}:{" "}
                        {receiptPreviewOrder.trackingNo || t("orders.create.success.trackingEmpty")}
                      </p>
                      <p>
                        {t("orders.create.success.shippingCost")}:{" "}
                        {receiptPreviewOrder.shippingCost.toLocaleString(locale)}{" "}
                        {receiptPreviewOrder.storeCurrency}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {t("orders.create.success.labelPreviewEmpty")}
                  </p>
                )}
              </div>
            ) : null}
            <Button
              type="button"
              className="h-10 w-full"
              disabled={
                receiptPrintLoading ||
                receiptPreviewLoading ||
                !receiptPreviewOrder ||
                receiptPreviewOrder.id !== createdOrderSuccess.orderId
              }
              onClick={() =>
                openOrderReceiptPrint(createdOrderSuccess.orderId, receiptPreviewOrder)
              }
            >
              {receiptPrintLoading
                ? t("orders.create.success.printing")
                : createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
                  ? t("orders.create.success.printPickupReceipt")
                  : t("orders.create.success.printReceipt")}
            </Button>
            {createdOrderSuccess.checkoutFlow === "ONLINE_DELIVERY" ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                disabled={
                  shippingLabelPrintLoading ||
                  receiptPreviewLoading ||
                  !receiptPreviewOrder ||
                  receiptPreviewOrder.id !== createdOrderSuccess.orderId
                }
                onClick={() =>
                  openOrderShippingLabelPrint(createdOrderSuccess.orderId, receiptPreviewOrder)
                }
              >
                {shippingLabelPrintLoading
                  ? t("orders.create.success.printing")
                  : t("orders.create.success.printLabel")}
              </Button>
            ) : null}
            {createdOrderSuccess.checkoutFlow === "PICKUP_LATER" ||
            createdOrderSuccess.checkoutFlow === "ONLINE_DELIVERY" ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={() => openCreatedOrderDetail(createdOrderSuccess.orderId)}
              >
                {t("orders.create.success.openDetail")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={closeCreatedOrderSuccess}
              >
                {t("orders.create.success.newOrder")}
              </Button>
            )}
            {createdOrderSuccess.checkoutFlow === "PICKUP_LATER" ||
            createdOrderSuccess.checkoutFlow === "ONLINE_DELIVERY" ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={closeCreatedOrderSuccess}
              >
                {t("orders.create.success.newOrder")}
              </Button>
            ) : null}
            <button
              type="button"
              className="w-full text-center text-xs font-medium text-blue-700 hover:text-blue-800"
              onClick={closeCreatedOrderSuccess}
            >
              {t("orders.create.success.closeWindow")}
            </button>
          </div>
        </SlideUpSheet>
      ) : null}

      {!isCreateOnlyMode ? (
        <SlideUpSheet
          isOpen={showBulkPackConfirmSheet}
          onClose={closeBulkPackConfirmSheet}
          title={t("orders.bulk.packConfirmTitle")}
          description={t("orders.bulk.packConfirmDescription")}
          panelMaxWidthClass="min-[1200px]:max-w-lg"
          disabled={bulkPackSubmitting}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={closeBulkPackConfirmSheet}
                disabled={bulkPackSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl"
                onClick={() => void runBulkPackSelectedOrders()}
                disabled={bulkPackSubmitting || selectedBulkPackOrders.length <= 0}
              >
                {bulkPackSubmitting
                  ? t("orders.bulk.packing")
                  : t("orders.bulk.packConfirmAction", {
                      count: formatNumberByLanguage(language, selectedBulkPackOrders.length),
                    })}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">
                {t("orders.bulk.packSelectedSummary", {
                  count: formatNumberByLanguage(language, selectedBulkPackOrders.length),
                })}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t("orders.bulk.packSelectedHint")}
              </p>
            </div>
            <div className="space-y-2">
              {selectedBulkPackOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="rounded-xl border px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">{order.orderNo}</p>
                  <p className="text-xs text-slate-500">
                    {order.customerName || order.contactDisplayName || t("orders.customer.default")} •{" "}
                    {order.total.toLocaleString(locale)} {catalog.storeCurrency}
                  </p>
                </div>
              ))}
              {selectedBulkPackOrders.length > 6 ? (
                <p className="text-xs text-slate-500">
                  {t("orders.bulk.andMore", {
                    count: formatNumberByLanguage(language, selectedBulkPackOrders.length - 6),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </SlideUpSheet>
      ) : null}

      {!isCreateOnlyMode ? (
        <SlideUpSheet
          isOpen={showBulkShipConfirmSheet}
          onClose={closeBulkShipConfirmSheet}
          title={t("orders.bulk.shipConfirmTitle")}
          description={t("orders.bulk.shipConfirmDescription")}
          panelMaxWidthClass="min-[1200px]:max-w-lg"
          disabled={bulkShipSubmitting}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={closeBulkShipConfirmSheet}
                disabled={bulkShipSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl"
                onClick={() => void runBulkShipSelectedOrders()}
                disabled={bulkShipSubmitting || selectedBulkShipOrders.length <= 0}
              >
                {bulkShipSubmitting
                  ? t("orders.bulk.shipping")
                  : t("orders.bulk.shipConfirmAction", {
                      count: formatNumberByLanguage(language, selectedBulkShipOrders.length),
                    })}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">
                {t("orders.bulk.shipSelectedSummary", {
                  count: formatNumberByLanguage(language, selectedBulkShipOrders.length),
                })}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t("orders.bulk.shipSelectedHint")}
              </p>
            </div>
            <div className="space-y-2">
              {selectedBulkShipOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="rounded-xl border px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">{order.orderNo}</p>
                  <p className="text-xs text-slate-500">
                    {order.customerName || order.contactDisplayName || t("orders.customer.default")} •{" "}
                    {(order.shippingProvider || order.shippingCarrier || "-")} •{" "}
                    {order.trackingNo || "-"}
                  </p>
                </div>
              ))}
              {selectedBulkShipOrders.length > 6 ? (
                <p className="text-xs text-slate-500">
                  {t("orders.bulk.andMore", {
                    count: formatNumberByLanguage(language, selectedBulkShipOrders.length - 6),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </SlideUpSheet>
      ) : null}

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
