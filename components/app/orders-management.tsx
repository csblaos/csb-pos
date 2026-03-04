"use client";

import Image from "next/image";
import Link from "next/link";
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
import { ScanLine } from "lucide-react";
import { toast } from "react-hot-toast";

import { BarcodeScannerPanel } from "@/components/app/barcode-scanner-panel";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import { currencyLabel, parseStoreCurrency, vatModeLabel } from "@/lib/finance/store-financial";
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
      canCreate: boolean;
    }
  | {
      mode: "create-only";
      catalog: OrderCatalog;
      canCreate: boolean;
    };

type TabKey = OrderListTab;

const tabOptions: Array<{ key: TabKey; label: string }> = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "PENDING_PAYMENT", label: "รอจ่าย/รับ" },
  { key: "PAID", label: "จ่ายแล้ว" },
  { key: "SHIPPED", label: "ส่งแล้ว" },
];

const channelLabel: Record<"WALK_IN" | "FACEBOOK" | "WHATSAPP", string> = {
  WALK_IN: "Walk-in",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
};

const paymentMethodLabel: Record<OrderListItem["paymentMethod"], string> = {
  CASH: "เงินสด",
  LAO_QR: "QR โอน",
  ON_CREDIT: "ค้างจ่าย",
  COD: "COD",
  BANK_TRANSFER: "โอนเงิน",
};

const statusLabel: Record<OrderListItem["status"], string> = {
  DRAFT: "ร่าง",
  PENDING_PAYMENT: "รอชำระ",
  READY_FOR_PICKUP: "รอรับที่ร้าน",
  PAID: "ชำระแล้ว",
  PACKED: "แพ็กแล้ว",
  SHIPPED: "จัดส่งแล้ว",
  COD_RETURNED: "COD ตีกลับ",
  CANCELLED: "ยกเลิก",
};

const statusClass: Record<OrderListItem["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_PAYMENT: "bg-amber-100 text-amber-700",
  READY_FOR_PICKUP: "bg-cyan-100 text-cyan-700",
  PAID: "bg-emerald-100 text-emerald-700",
  PACKED: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  COD_RETURNED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-rose-100 text-rose-700",
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
  contactDisplayName: string | null;
  subtotal: number;
  discount: number;
  vatAmount: number;
  shippingFeeCharged: number;
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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

const checkoutFlowLabel: Record<CheckoutFlow, string> = {
  WALK_IN_NOW: "Walk-in ทันที",
  PICKUP_LATER: "มารับที่ร้านภายหลัง",
  ONLINE_DELIVERY: "สั่งออนไลน์/จัดส่ง",
};
const SCANNER_PERMISSION_STORAGE_KEY = "scanner-permission-seen";
const CREATE_ONLY_SEARCH_STICKY_TOP_REM = 3.8;
const CREATE_ONLY_CART_STICKY_GAP_FALLBACK_PX = 13;
const CREATE_ONLY_CART_STICKY_EXTRA_TOP_PX = 13;
// Intentional: keep tablet threshold aligned with desktop so both use the same sticky behavior.
const TABLET_MIN_WIDTH_PX = 1200;
const DESKTOP_MIN_WIDTH_PX = 1200;
const EMPTY_ORDER_ITEMS: CreateOrderFormInput["items"] = [];
const CREATE_ORDER_CHECKOUT_SHEET_FORM_ID = "create-order-checkout-sheet-form";
const SHIPPING_PROVIDER_CHIPS = ["Houngaloun", "Anousith", "Mixay"] as const;

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
  const isCreateOnlyMode = props.mode === "create-only";
  const activeTab: OrderListTab = isCreateOnlyMode ? "ALL" : props.activeTab;
  const ordersPage = isCreateOnlyMode ? null : props.ordersPage;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showScannerPermissionSheet, setShowScannerPermissionSheet] = useState(false);
  const [showScannerSheet, setShowScannerSheet] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const [showCheckoutCloseConfirm, setShowCheckoutCloseConfirm] = useState(false);
  const [pickupLaterCustomerOpen, setPickupLaterCustomerOpen] = useState(false);
  const [onlineChannelMode, setOnlineChannelMode] = useState<OnlineChannelMode>("FACEBOOK");
  const [onlineOtherChannelInput, setOnlineOtherChannelInput] = useState("");
  const [onlineCustomProviderOpen, setOnlineCustomProviderOpen] = useState(false);
  const [onlineContactPickerOpen, setOnlineContactPickerOpen] = useState(false);
  const [onlineQuickFillInput, setOnlineQuickFillInput] = useState("");
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
    return name || phone || "ยังไม่เพิ่มข้อมูลผู้รับ";
  }, [watchedCustomerName, watchedCustomerPhone]);
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
  const paymentMethodOptions = useMemo<Array<{ key: CheckoutPaymentMethod; label: string }>>(
    () =>
      isOnlineCheckout
        ? [
            { key: "CASH", label: "เงินสด" },
            { key: "LAO_QR", label: "QR" },
            { key: "ON_CREDIT", label: "ค้างจ่าย" },
            { key: "COD", label: "COD" },
          ]
        : [
            { key: "CASH", label: "เงินสด" },
            { key: "LAO_QR", label: "QR" },
            { key: "ON_CREDIT", label: "ค้างจ่าย" },
          ],
    [isOnlineCheckout],
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
  const isKnownShippingProvider = SHIPPING_PROVIDER_CHIPS.some(
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

  const visibleOrders = isCreateOnlyMode ? [] : (ordersPage?.rows ?? []);
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
      changed.push("ชื่อ");
    }
    if (parsed.customerPhone) {
      form.setValue("customerPhone", parsed.customerPhone, { shouldDirty: true, shouldValidate: true });
      changed.push("เบอร์โทร");
    }
    if (parsed.customerAddress) {
      form.setValue("customerAddress", parsed.customerAddress, { shouldDirty: true, shouldValidate: true });
      changed.push("ที่อยู่");
    }

    if (changed.length <= 0) {
      toast.error("ไม่พบข้อมูลที่เติมอัตโนมัติได้");
      return;
    }

    form.setValue("contactId", "", { shouldDirty: true, shouldValidate: true });
    form.clearErrors(["contactId", "customerPhone", "customerAddress"]);
    setOnlineQuickFillInput("");
    toast.success(`เติมข้อมูลแล้ว: ${changed.join(" / ")}`);
  }, [form, onlineQuickFillInput]);
  const onSelectShippingProviderChip = useCallback(
    (provider: (typeof SHIPPING_PROVIDER_CHIPS)[number]) => {
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
      setScanMessage(`สินค้า ${product.sku} - ${product.name} หมดสต็อก/ติดจอง เพิ่มไม่ได้`);
      const nowMs = Date.now();
      const canShowToast =
        !outOfStockToastRef.current ||
        outOfStockToastRef.current.productId !== productId ||
        nowMs - outOfStockToastRef.current.shownAtMs > 1200;
      if (canShowToast) {
        toast.error(`สินค้า ${product.name} หมดสต็อก/ติดจอง`, {
          duration: 1600,
        });
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
          `สินค้า ${product.sku} - ${product.name} เพิ่มได้สูงสุด ${availableQty.toLocaleString("th-TH")} ชิ้น`,
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
            `สินค้า ${product.sku} - ${product.name} เพิ่มได้สูงสุด ${availableQty.toLocaleString("th-TH")} ชิ้น`,
          );
        }
      }
      form.setValue(`items.${index}.qty`, boundedQty, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form, getProductAvailableQty, productsById],
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
        setScanMessage(`เพิ่มสินค้า ${addedProduct.sku} - ${addedProduct.name} แล้ว`);
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

    setScanMessage(`เพิ่มสินค้า ${addedProduct.sku} - ${addedProduct.name} แล้ว`);
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

  const tableColumns = useMemo<ColumnDef<OrderListItem>[]>(
    () => [
      {
        accessorKey: "orderNo",
        header: "เลขที่ออเดอร์",
      },
      {
        id: "customer",
        header: "ลูกค้า",
        cell: ({ row }) =>
          row.original.customerName || row.original.contactDisplayName || "ลูกค้าทั่วไป",
      },
      {
        accessorKey: "status",
        header: "สถานะ",
        cell: ({ row }) => (
          <span className={`rounded-full px-2 py-1 text-xs ${statusClass[row.original.status]}`}>
            {statusLabel[row.original.status]}
          </span>
        ),
      },
      {
        accessorKey: "total",
        header: "ยอดรวม",
        cell: ({ row }) =>
          `${row.original.total.toLocaleString("th-TH")} ${catalog.storeCurrency} • จ่าย ${row.original.paymentCurrency} • ${
            paymentMethodLabel[row.original.paymentMethod]
          }`,
      },
    ],
    [catalog.storeCurrency],
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
        message: "กรุณากรอกเบอร์โทรลูกค้า",
      });
      return;
    }

    if (checkoutFlow === "ONLINE_DELIVERY" && !normalizedCustomerAddress) {
      form.setError("customerAddress", {
        type: "manual",
        message: "กรุณากรอกที่อยู่จัดส่ง",
      });
      return;
    }

    if (checkoutFlow === "ONLINE_DELIVERY" && !normalizedShippingProvider) {
      form.setError("shippingProvider", {
        type: "manual",
        message: "กรุณาเลือกผู้ให้บริการขนส่ง",
      });
      return;
    }

    setLoading(true);

    const fallbackCustomerName =
      checkoutFlow === "PICKUP_LATER"
        ? "ลูกค้ารับที่ร้าน"
        : normalizedChannel === "WALK_IN"
          ? "ลูกค้าหน้าร้าน"
          : "ลูกค้าออนไลน์";
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
      setErrorMessage(data?.message ?? "สร้างออเดอร์ไม่สำเร็จ");
      setLoading(false);
      return;
    }

    setSuccessMessage(`สร้างออเดอร์ ${data?.orderNo ?? ""} เรียบร้อย`);
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
      if (submittedCheckoutFlow === "ONLINE_DELIVERY") {
        router.push(`/orders/${data.orderId}`);
        return;
      }

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
    setSuccessMessage(null);
  }, []);

  const fetchOrderReceiptPreview = useCallback(async (orderId: string) => {
    const response = await authFetch(`/api/orders/${orderId}`);
    const data = (await response.json().catch(() => null)) as OrderDetailApiResponse | null;
    if (!response.ok || !data?.order) {
      throw new Error(data?.message ?? "ไม่สามารถโหลดข้อมูลใบเสร็จได้");
    }
    return data.order;
  }, []);

  const buildReceiptPrintHtml = useCallback((order: ReceiptPreviewOrder) => {
    const receiptDateText = new Date(order.createdAt).toLocaleString("th-TH");
    const receiptCustomerName = order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป";
    const rowsHtml = order.items
      .map((item) => {
        const productName = escapeHtml(item.productName);
        const productSku = escapeHtml(item.productSku || "-");
        const qtyText = `${item.qty.toLocaleString("th-TH")} ${escapeHtml(item.unitCode)}`;
        const lineTotalText = item.lineTotal.toLocaleString("th-TH");
        return `<tr>
  <td class="col-item"><div>${productName}</div><div class="sku">${productSku}</div></td>
  <td class="col-qty">${qtyText}</td>
  <td class="col-total">${lineTotalText}</td>
</tr>`;
      })
      .join("");

    return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Receipt ${escapeHtml(order.orderNo)}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: #0f172a;
        font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
        font-size: 11px;
        line-height: 1.35;
      }
      .receipt {
        width: 72mm;
        margin: 0 auto;
        padding: 2mm 0;
      }
      .center { text-align: center; }
      .title { font-weight: 700; font-size: 12px; margin: 0; }
      .meta { margin: 2px 0 0; font-size: 10px; }
      .sep { border-top: 1px dashed #64748b; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10px; font-weight: 600; padding-bottom: 3px; }
      td { vertical-align: top; padding: 2px 0; }
      .col-item { width: 52%; }
      .sku { color: #475569; font-size: 10px; }
      .col-qty { width: 22%; text-align: right; white-space: nowrap; }
      .col-total { width: 26%; text-align: right; white-space: nowrap; }
      .totals-row { display: flex; justify-content: space-between; margin: 2px 0; }
      .totals-main { font-weight: 700; font-size: 12px; }
      .muted { color: #475569; }
      .thanks { text-align: center; margin-top: 6px; font-size: 10px; }
    </style>
  </head>
  <body>
    <main class="receipt">
      <p class="title center">ใบเสร็จรับเงิน</p>
      <p class="meta center">เลขที่ ${escapeHtml(order.orderNo)}</p>
      <div class="sep"></div>

      <div>ลูกค้า: ${escapeHtml(receiptCustomerName)}</div>
      <div>วันที่: ${escapeHtml(receiptDateText)}</div>

      <div class="sep"></div>

      <table>
        <thead>
          <tr>
            <th>รายการ</th>
            <th style="text-align:right;">จำนวน</th>
            <th style="text-align:right;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="sep"></div>

      <div class="totals-row"><span>ยอดสินค้า</span><span>${order.subtotal.toLocaleString("th-TH")}</span></div>
      <div class="totals-row"><span>ส่วนลด</span><span>${order.discount.toLocaleString("th-TH")}</span></div>
      <div class="totals-row"><span>VAT</span><span>${order.vatAmount.toLocaleString("th-TH")} (${escapeHtml(vatModeLabel(order.storeVatMode))})</span></div>
      <div class="totals-row"><span>ค่าส่ง</span><span>${order.shippingFeeCharged.toLocaleString("th-TH")}</span></div>
      <div class="totals-row totals-main"><span>ยอดสุทธิ</span><span>${order.total.toLocaleString("th-TH")} ${escapeHtml(order.storeCurrency)}</span></div>
      <div class="totals-row muted"><span>สกุลชำระ</span><span>${escapeHtml(currencyLabel(order.paymentCurrency))}</span></div>
      <div class="totals-row muted"><span>วิธีชำระ</span><span>${escapeHtml(paymentMethodLabel[order.paymentMethod])}</span></div>

      <div class="sep"></div>
      <p class="thanks">ขอบคุณที่ใช้บริการ</p>
    </main>
  </body>
</html>`;
  }, []);

  const printReceiptViaIframe = useCallback((html: string) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      throw new Error("ไม่สามารถสร้างหน้าพิมพ์ได้");
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    const tryPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(cleanup, 3000);
      }
    };

    iframe.addEventListener("load", () => {
      window.setTimeout(tryPrint, 80);
    });
  }, []);

  const openOrderReceiptPrint = useCallback(
    async (orderId: string) => {
      if (typeof window === "undefined") {
        return;
      }

      setReceiptPrintLoading(true);
      setErrorMessage(null);

      try {
        const isMobileLikeViewport =
          window.matchMedia("(max-width: 767px)").matches ||
          window.matchMedia("(pointer: coarse)").matches;
        if (isMobileLikeViewport) {
          router.push(
            `/orders/${orderId}/print/receipt?autoprint=1&returnTo=${encodeURIComponent("/orders/new")}`,
          );
          return;
        }

        const order =
          receiptPreviewOrder && receiptPreviewOrder.id === orderId
            ? receiptPreviewOrder
            : await fetchOrderReceiptPreview(orderId);
        printReceiptViaIframe(buildReceiptPrintHtml(order));
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "ไม่สามารถพิมพ์ใบเสร็จได้";
        setErrorMessage(message);
      } finally {
        setReceiptPrintLoading(false);
      }
    },
    [buildReceiptPrintHtml, fetchOrderReceiptPreview, printReceiptViaIframe, receiptPreviewOrder, router],
  );

  const openCreatedOrderDetail = useCallback(
    (orderId: string) => {
      setCreatedOrderSuccess(null);
      setReceiptPreviewOrder(null);
      setReceiptPreviewError(null);
      setReceiptPreviewLoading(false);
      setReceiptPrintLoading(false);
      setSuccessMessage(null);
      router.push(`/orders/${orderId}`);
    },
    [router],
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
          error instanceof Error && error.message ? error.message : "ไม่สามารถโหลดตัวอย่างใบเสร็จได้";
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
  }, [createdOrderSuccess, fetchOrderReceiptPreview]);

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
    setScanMessage("กู้คืนตะกร้าที่ค้างจากการรีเฟรชแล้ว");
    setNewOrderDraftFlag(true);
    setHasInitializedDraftRestore(true);
  }, [
    form,
    hasInitializedDraftRestore,
    isCreateOnlyMode,
    restoreDraftFormForCatalog,
  ]);

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
    if (!SHIPPING_PROVIDER_CHIPS.some((item) => item === provider)) {
      setOnlineCustomProviderOpen(true);
      return;
    }
    setOnlineCustomProviderOpen(false);
  }, [isOnlineCheckout, watchedShippingProvider]);

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
              1) เลือกสินค้า
            </button>
            <button
              type="button"
              className={`h-9 rounded-md text-xs font-medium ${
                isDetailsStep ? "bg-blue-600 text-white" : "bg-white text-slate-600"
              }`}
              onClick={() => setCreateStep("details")}
              disabled={loading || !canContinueToDetails}
            >
              2) รายละเอียดออเดอร์
            </button>
          </div>
        ) : null}

        {isDetailsStep ? (
          <>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-700">ประเภทออเดอร์</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      key: "WALK_IN_NOW",
                      label: "Walk-in ทันที",
                      description: "รับและจบออเดอร์หน้างาน",
                    },
                    {
                      key: "PICKUP_LATER",
                      label: "มารับที่ร้านภายหลัง",
                      description: "โทรสั่งไว้ก่อนแล้วค่อยมารับ",
                    },
                    {
                      key: "ONLINE_DELIVERY",
                      label: "สั่งออนไลน์/จัดส่ง",
                      description: "ต้องมีช่องทางและข้อมูลส่งของ",
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
                <label className="text-xs text-muted-foreground">
                  ช่องทางออเดอร์ออนไลน์
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: "FACEBOOK", label: "Facebook" },
                      { key: "WHATSAPP", label: "WhatsApp" },
                      { key: "OTHER", label: "อื่นๆ" },
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
                    placeholder="แพลตฟอร์มอื่น (ไม่บังคับ)"
                    value={onlineOtherChannelInput}
                    onChange={(event) => setOnlineOtherChannelInput(event.target.value)}
                    disabled={loading}
                  />
                ) : null}
                <p className="text-[11px] text-slate-500">
                  {onlineChannelMode === "OTHER"
                    ? "ตอนนี้ระบบยังบันทึกช่องทางหลักเป็น Facebook/WhatsApp ชั่วคราว จนกว่าจะเปิดเชื่อม API เต็ม"
                    : "เลือกช่องทางหลักของออเดอร์นี้เพื่อช่วยแยก flow"}
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
                      ? "ซ่อนรายชื่อลูกค้า"
                      : selectedOnlineContactLabel
                        ? "แก้ไขลูกค้าที่เลือก"
                        : "+ เลือกจากรายชื่อลูกค้า (ไม่บังคับ)"}
                  </button>
                  {watchedContactId ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-600 hover:text-slate-800"
                      onClick={() => onPickContact("")}
                      disabled={loading}
                    >
                      ล้าง
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  {selectedOnlineContactLabel
                    ? `เลือกแล้ว: ${selectedOnlineContactLabel}`
                    : "ถ้ายังไม่มีรายชื่อ ให้ข้ามแล้วกรอกชื่อ/เบอร์เองได้"}
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
                      <option value="">ไม่เลือกลูกค้า (กรอกชื่อ/เบอร์เอง)</option>
                      {onlineChannelContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.displayName}
                        </option>
                      ))}
                    </select>
                    {onlineChannelContacts.length <= 0 ? (
                      <p className="text-xs text-slate-500">
                        ยังไม่มีรายชื่อลูกค้าช่องทางนี้ (เลือกข้ามแล้วกรอกเองได้)
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
                  เติมข้อมูลลูกค้าแบบเร็ว (ไม่บังคับ)
                </label>
                <textarea
                  id="online-quick-fill"
                  className="min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
                  placeholder={`เช่น\nlex\n77964565\nAnousith nongboon`}
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
                    ล้าง
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-md border border-blue-300 bg-blue-50 px-2 text-xs font-medium text-blue-700"
                    onClick={applyOnlineQuickFill}
                    disabled={loading || onlineQuickFillInput.trim().length <= 0}
                  >
                    เติมอัตโนมัติ
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  ระบบจะพยายามแยกชื่อ/เบอร์/ที่อยู่จากข้อความที่วาง และคุณแก้ต่อได้ทุกช่อง
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
                    ? "ซ่อนข้อมูลผู้รับ"
                    : hasPickupCustomerIdentity
                      ? "แก้ไขข้อมูลผู้รับ (ไม่บังคับ)"
                      : "+ เพิ่มข้อมูลผู้รับ (ไม่บังคับ)"}
                </button>
                {!pickupLaterCustomerOpen ? (
                  <p className="text-xs text-slate-500">สถานะ: {pickupCustomerIdentitySummary}</p>
                ) : (
                  <p className="text-xs text-slate-500">
                    กรอกชื่อหรือเบอร์อย่างน้อย 1 อย่าง (ถ้าทราบ) เพื่อช่วยติดตามออเดอร์
                  </p>
                )}
              </div>
            ) : null}

            {showCustomerIdentityFields ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="order-customer-name">
                    {isOnlineCheckout ? "ชื่อลูกค้า/ผู้รับสินค้า" : "ชื่อลูกค้า (ไม่บังคับ)"}
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
                    {requiresCustomerPhone ? "เบอร์โทร (จำเป็น)" : "เบอร์โทร"}
                  </label>
                  <input
                    id="order-customer-phone"
                    className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loading}
                    {...form.register("customerPhone")}
                  />
                  <p className="text-xs text-red-600">{form.formState.errors.customerPhone?.message}</p>
                  {!isOnlineCheckout ? (
                    <p className="text-xs text-slate-500">
                      ไม่บังคับ แต่แนะนำกรอกชื่อหรือเบอร์อย่างน้อย 1 อย่าง ถ้าทราบ
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {isOnlineCheckout ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground" htmlFor="order-address">
                    ที่อยู่จัดส่ง (จำเป็น)
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
                    ข้อมูลขนส่ง (สำหรับเชื่อมออกใบส่งอัตโนมัติในอนาคต)
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {SHIPPING_PROVIDER_CHIPS.map((provider) => {
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
                      อื่นๆ
                    </button>
                  </div>
                  {onlineCustomProviderOpen ? (
                    <input
                      type="text"
                      className="h-9 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                      placeholder="ผู้ให้บริการขนส่งอื่น (ไม่บังคับ)"
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
                    <p className="text-[11px] text-amber-700">ยังไม่ระบุขนส่ง (ต้องเลือกก่อนสร้างออเดอร์)</p>
                  ) : (
                    <p className="text-[11px] text-slate-500">เลือกผู้ให้บริการขนส่งสำหรับออเดอร์นี้</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                {isPickupLaterCheckout
                  ? "โหมดรับที่ร้านภายหลัง: ไม่บังคับชื่อ/เบอร์ แต่แนะนำให้กรอกอย่างน้อย 1 อย่างเพื่อช่วยติดตามออเดอร์"
                  : "โหมด Walk-in ทันที: ไม่จำเป็นต้องกรอกข้อมูลจัดส่ง"}
              </p>
            )}
          </>
        ) : null}

        {isProductStep ? (
          <div id="order-cart-section" className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              รายการสินค้า ({watchedItems.length.toLocaleString("th-TH")} รายการ)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loading || !hasCatalogProducts}
                onClick={openScannerSheet}
              >
                สแกนเพิ่มสินค้า
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
                + เพิ่มรายการ
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-xs font-medium text-slate-700">เพิ่มสินค้าแบบแตะเร็ว (POS-lite)</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="h-10 flex-1 rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                placeholder="ค้นหา SKU, ชื่อ หรือบาร์โค้ด"
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
                  ล้าง
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
                {quickAddOnlyAvailable ? "เฉพาะมีสต็อก: เปิด" : "เฉพาะมีสต็อก"}
              </button>
            </div>
            {!hasCatalogProducts ? (
              <p className="text-xs text-slate-500">ยังไม่มีสินค้าในระบบ</p>
            ) : quickAddProducts.length === 0 ? (
              <p className="text-xs text-slate-500">ไม่พบสินค้าที่ตรงกับคำค้น</p>
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
                          `เพิ่มสินค้า ${addedProduct.sku} - ${addedProduct.name} แล้ว`,
                        );
                      }
                    }}
                    disabled={loading}
                  >
                    <p className="text-xs text-slate-500">{product.sku}</p>
                    <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">
                      คงเหลือ {product.available.toLocaleString("th-TH")}
                    </p>
                    {product.available > 0 ? (
                      <p className="mt-1 text-xs font-medium text-blue-700">
                        + เพิ่ม {getProductDefaultUnitPrice(product).toLocaleString("th-TH")}{" "}
                        {catalog.storeCurrency}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-medium text-rose-600">หมดสต็อก/ติดจอง</p>
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
                ไม่พบบาร์โค้ด <span className="font-semibold">{notFoundBarcode}</span> กรุณาค้นหาเอง
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  className="h-10 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                  placeholder="ค้นหาด้วยชื่อสินค้า, SKU หรือบาร์โค้ด"
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
                    สแกนใหม่
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
                    ปิด
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
                  <p className="text-xs text-amber-700">ไม่พบสินค้าจากคำค้นนี้</p>
                )
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 sm:hidden">
            {watchedItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                ยังไม่มีรายการสินค้า
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
                      {selectedProduct?.name ?? "ไม่พบสินค้า"}
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
                          aria-label="ลดจำนวน"
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
                          aria-label="เพิ่มจำนวน"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-slate-500">
                        คงเหลือ {selectedProduct?.available.toLocaleString("th-TH") ?? 0}
                      </p>
                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading}
                      >
                        ลบ
                      </button>
                    </div>
                    <p className="text-xs font-medium text-blue-700">
                      รวมรายการ {lineTotal.toLocaleString("th-TH")} {catalog.storeCurrency}
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
                มีอีก {(watchedItems.length - 2).toLocaleString("th-TH")} รายการ แตะเพื่อดูทั้งหมด
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
                        คงเหลือ {selectedProduct?.available.toLocaleString("th-TH") ?? 0}
                      </div>

                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading}
                      >
                        ลบ
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-blue-700">
                    รวมรายการ {lineTotal.toLocaleString("th-TH")} {catalog.storeCurrency}
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
                ดูตะกร้า {watchedItems.length.toLocaleString("th-TH")} รายการ /{" "}
                {cartQtyTotal.toLocaleString("th-TH")} ชิ้น
              </span>
              <span>
                {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
              </span>
            </button>
          ) : null}
          </div>
        ) : isCreateOnlyMode ? (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                รายการสินค้า ({watchedItems.length.toLocaleString("th-TH")} รายการ)
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
                {inSheet ? "กลับไปเลือกสินค้า" : "แก้รายการสินค้า"}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              จำนวน {cartQtyTotal.toLocaleString("th-TH")} ชิ้น • ยอดรวม{" "}
              {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
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
                    <p className="text-xs font-medium text-slate-700">ส่วนลด</p>
                    <p className="text-[11px] text-slate-500">
                      ไม่บังคับ • ลดได้สูงสุด {maxDiscountAmount.toLocaleString("th-TH")}{" "}
                      {catalog.storeCurrency}
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
                    {discountEnabled ? "ปิดส่วนลด" : "เปิดส่วนลด"}
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
                          จำนวนเงิน
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
                      คิดส่วนลดจริง -{totals.discount.toLocaleString("th-TH")} {catalog.storeCurrency}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">ยังไม่ใช้ส่วนลดในออเดอร์นี้</p>
                )}
                <p className="text-xs text-red-600">{form.formState.errors.discount?.message}</p>
              </div>

              {isOnlineCheckout ? (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">ค่าขนส่ง</p>
                      <p className="text-[11px] text-slate-500">ไม่บังคับ • ใช้เก็บค่าส่งจากลูกค้าและต้นทุนจริง</p>
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
                      {shippingFeeEnabled ? "ปิดค่าขนส่ง" : "เปิดค่าขนส่ง"}
                    </button>
                  </div>

                  {shippingFeeEnabled ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">ค่าส่งที่เรียกเก็บ</label>
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
                        <label className="text-xs text-muted-foreground">ต้นทุนค่าส่ง</label>
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
                    <p className="text-xs text-slate-500">ยังไม่ใช้ค่าขนส่งในออเดอร์นี้</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">วิธีรับชำระ</label>
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
                  ? "ออนไลน์: เลือกได้ เงินสด, QR, ค้างจ่าย หรือ COD"
                  : "หน้าร้าน/รับที่ร้าน: เลือกได้ เงินสด, QR หรือค้างจ่าย"}
              </p>
              <p className="text-xs text-red-600">{form.formState.errors.paymentMethod?.message}</p>
            </div>

            {watchedPaymentMethod === "LAO_QR" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="payment-account">
                  บัญชีรับเงิน (QR)
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
                  <option value="">เลือกบัญชี QR</option>
                  {qrPaymentAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} ({resolveLaosBankDisplayName(account.bankName)})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-red-600">{form.formState.errors.paymentAccountId?.message}</p>
                <p className="text-xs text-slate-500">
                  {catalog.requireSlipForLaoQr
                    ? "นโยบายร้าน: ต้องแนบสลิปก่อนยืนยันชำระ"
                    : "นโยบายร้าน: ไม่บังคับแนบสลิป"}
                </p>
              </div>
            ) : null}

            {watchedPaymentMethod === "ON_CREDIT" ? (
              <p className="rounded-md border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                โหมดค้างจ่าย: สร้างออเดอร์แบบยังไม่รับเงิน และค่อยยืนยันชำระภายหลัง
              </p>
            ) : null}

            {watchedPaymentMethod === "COD" ? (
              <p className="rounded-md border border-dashed border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                COD: ลูกค้าจ่ายปลายทาง ระบบจะตั้งสถานะชำระเป็นรอปิดยอด COD
              </p>
            ) : null}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">สกุลที่รับชำระในออเดอร์นี้</label>
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
                  ? `ร้านนี้รับ ${currencyLabel(selectedPaymentCurrency)} สกุลเดียว (ระบบเลือกให้อัตโนมัติ)`
                  : `เลือกรับชำระได้: ${supportedPaymentCurrencies.map((currency) => currencyLabel(currency)).join(" / ")}`}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p>ยอดสินค้า: {subtotal.toLocaleString("th-TH")} {catalog.storeCurrency}</p>
              <p>ส่วนลด: {totals.discount.toLocaleString("th-TH")} {catalog.storeCurrency}</p>
              <p>
                VAT ({vatModeLabel(catalog.vatMode)}): {totals.vatAmount.toLocaleString("th-TH")}{" "}
                {catalog.storeCurrency}
              </p>
              <p className="font-semibold">
                ยอดรวม: {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
              </p>
              <p className="text-xs text-slate-500">
                สกุลชำระที่เลือก: {currencyLabel(selectedPaymentCurrency)}
              </p>
              <p className="text-xs text-slate-500">
                ประเภทออเดอร์: {checkoutFlowLabel[checkoutFlow]}
              </p>
              <p className="text-xs text-slate-500">วิธีชำระ: {paymentMethodLabel[watchedPaymentMethod]}</p>
              {isOnlineCheckout && watchedShippingProvider.trim() ? (
                <p className="text-xs text-slate-500">ขนส่ง: {watchedShippingProvider.trim()}</p>
              ) : null}
            </div>

            {!inSheet ? (
              <div>
                <Button type="submit" className="h-10 w-full" disabled={loading || !canCreate}>
                  {loading ? "กำลังบันทึก..." : "สร้างออเดอร์"}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs text-slate-600">
              เลือกสินค้าเสร็จแล้วให้กดไปขั้นถัดไป เพื่อกรอกลูกค้า/การชำระเงิน/ที่อยู่จัดส่ง
            </p>
            <Button
              type="button"
              className="h-10 w-full"
              onClick={() => setCreateStep("details")}
              disabled={loading || !canContinueToDetails}
            >
              ถัดไป: รายละเอียดออเดอร์
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
              placeholder="ค้นหา SKU, ชื่อ หรือบาร์โค้ด"
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
              aria-label="สแกนบาร์โค้ด"
              title="สแกนบาร์โค้ด"
            >
              <ScanLine className="h-4 w-4" />
              <span className="sr-only">สแกนบาร์โค้ด</span>
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
              {quickAddOnlyAvailable ? "มีสต็อก✓" : "มีสต็อก"}
            </button>
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
                ทั้งหมด
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
                ไม่พบบาร์โค้ด <span className="font-semibold">{notFoundBarcode}</span> กรุณาค้นหาเอง
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  className="h-10 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
                  placeholder="ค้นหาด้วยชื่อสินค้า, SKU หรือบาร์โค้ด"
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
                    สแกนใหม่
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
                    ปิด
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
                  <p className="text-xs text-amber-700">ไม่พบสินค้าจากคำค้นนี้</p>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">สินค้า</p>
              <p className="text-xs text-slate-500">
                {quickAddProducts.length.toLocaleString("th-TH")} รายการ
              </p>
            </div>
            {!hasCatalogProducts ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
                ยังไม่มีสินค้าในระบบ
              </p>
            ) : quickAddProducts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
                ไม่พบสินค้าที่ตรงกับคำค้น
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
                        setScanMessage(`เพิ่มสินค้า ${addedProduct.sku} - ${addedProduct.name} แล้ว`);
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
                        คงเหลือ {product.available.toLocaleString("th-TH")}
                      </p>
                      {product.available > 0 ? (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          + เพิ่ม
                        </span>
                      ) : (
                        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                          หมด
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
                ตะกร้า ({watchedItems.length.toLocaleString("th-TH")})
              </p>
              <button
                type="button"
                className="text-xs font-medium text-blue-700 disabled:text-slate-400"
                onClick={() => setShowCartSheet(true)}
                disabled={loading || watchedItems.length === 0}
              >
                เปิดเต็ม
              </button>
            </div>

            {watchedItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                ยังไม่มีรายการสินค้าในตะกร้า
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
                            {selectedProduct?.name ?? "ไม่พบสินค้า"}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            คงเหลือ {selectedProduct?.available.toLocaleString("th-TH") ?? 0}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] text-red-600"
                          onClick={() => remove(index)}
                          disabled={loading}
                        >
                          ลบ
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
                            aria-label="ลดจำนวน"
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
                            aria-label="เพิ่มจำนวน"
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
                  {watchedItems.length.toLocaleString("th-TH")} รายการ • {cartQtyTotal.toLocaleString("th-TH")} ชิ้น
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
                ถัดไป: ชำระเงิน
              </Button>
            </div>
          </aside>
        </div>

        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 md:hidden">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <p>
                {watchedItems.length.toLocaleString("th-TH")} รายการ • {cartQtyTotal.toLocaleString("th-TH")} ชิ้น
              </p>
              <button
                type="button"
                className="font-medium text-blue-700 disabled:text-slate-400"
                onClick={() => setShowCartSheet(true)}
                disabled={watchedItems.length === 0}
              >
                แก้ตะกร้า
              </button>
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm disabled:bg-slate-300"
              onClick={openCheckoutSheet}
              disabled={watchedItems.length === 0 || loading}
            >
              ถัดไป: ชำระเงิน {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
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
          <p className="text-sm text-red-600">คุณไม่มีสิทธิ์สร้างออเดอร์</p>
        )
      ) : (
        <>
          <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">รายการออเดอร์</h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  className="h-9 px-3 text-xs sm:text-sm"
                  onClick={() => router.push("/orders/new")}
                  disabled={!canCreate || loading}
                >
                  เข้าโหมด POS
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {tabOptions.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => router.push(buildOrdersUrl(tab.key, 1))}
                  className={`rounded-lg px-2 py-2 text-xs ${
                    activeTab === tab.key ? "bg-blue-600 text-white" : "border bg-white text-slate-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </article>

          <section className="space-y-2">
            {visibleOrders.length === 0 ? (
              <article className="rounded-xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
                ไม่พบออเดอร์ในแท็บนี้
              </article>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {visibleOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="block rounded-xl border bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">{order.orderNo}</p>
                          <h3 className="text-sm font-semibold">
                            {order.customerName || order.contactDisplayName || "ลูกค้าทั่วไป"}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            ช่องทาง {channelLabel[order.channel]} • จ่าย {order.paymentCurrency} •{" "}
                            {paymentMethodLabel[order.paymentMethod]}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs ${statusClass[order.status]}`}>
                          {statusLabel[order.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {order.total.toLocaleString("th-TH")} {catalog.storeCurrency}
                      </p>
                    </Link>
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-xl border bg-white shadow-sm md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
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
                        <tr key={row.id} className="border-t">
                          {row.getVisibleCells().map((cell, index) => (
                            <td key={cell.id} className="px-3 py-3">
                              {index === 0 ? (
                                <Link
                                  className="font-medium text-blue-700 hover:underline"
                                  href={`/orders/${row.original.id}`}
                                >
                                  {row.original.orderNo}
                                </Link>
                              ) : (
                                flexRender(cell.column.columnDef.cell, cell.getContext())
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs">
                  <p className="text-muted-foreground">
                    หน้า {ordersPage!.page.toLocaleString("th-TH")} /{" "}
                    {ordersPage!.pageCount.toLocaleString("th-TH")} ({ordersPage!.total.toLocaleString("th-TH")} รายการ)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={ordersPage!.page <= 1}
                      onClick={() => router.push(buildOrdersUrl(activeTab, ordersPage!.page - 1))}
                    >
                      ก่อนหน้า
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={ordersPage!.page >= ordersPage!.pageCount}
                      onClick={() => router.push(buildOrdersUrl(activeTab, ordersPage!.page + 1))}
                    >
                      ถัดไป
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>

        </>
      )}
      <SlideUpSheet
        isOpen={showScannerPermissionSheet}
        onClose={() => setShowScannerPermissionSheet(false)}
        title="ขออนุญาตใช้กล้อง"
        description="ระบบต้องใช้กล้องเพื่อสแกนบาร์โค้ดสินค้า"
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">ทำไมต้องใช้กล้อง?</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>สแกนบาร์โค้ดได้เร็วขึ้น</li>
              <li>ลดความผิดพลาดจากการพิมพ์</li>
              <li>ใช้งานได้ทันทีในหน้านี้</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              onClick={() => setShowScannerPermissionSheet(false)}
            >
              ยกเลิก
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
              อนุญาตและสแกน
            </Button>
          </div>
        </div>
      </SlideUpSheet>
      <SlideUpSheet
        isOpen={showScannerSheet}
        onClose={() => setShowScannerSheet(false)}
        title="สแกนบาร์โค้ดสินค้า"
        description="สแกนแล้วเพิ่มสินค้าเข้าออเดอร์อัตโนมัติ"
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
      <SlideUpSheet
        isOpen={showCartSheet}
        onClose={() => setShowCartSheet(false)}
        title="ตะกร้าสินค้า"
        description="ตรวจสอบและแก้จำนวนสินค้าก่อนสร้างออเดอร์"
        disabled={loading}
      >
        <div className="space-y-3">
          {watchedItems.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
              ยังไม่มีรายการสินค้าในตะกร้า
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
                          {selectedProduct?.name ?? "ไม่พบสินค้า"}
                        </p>
                        <p className="text-xs text-slate-500">
                          คงเหลือ {selectedProduct?.available.toLocaleString("th-TH") ?? 0}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading}
                      >
                        ลบ
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
                          aria-label="ลดจำนวน"
                        >
                          -
                        </button>
                        <div className="min-w-8 text-center text-xs font-medium text-slate-800">
                          {(Number(item.qty ?? 0) || 0).toLocaleString("th-TH")}
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border text-sm text-slate-700"
                          onClick={() => increaseItemQty(index)}
                          disabled={loading || availableQty <= 0 || currentQty >= availableQty}
                          aria-label="เพิ่มจำนวน"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-right text-sm font-semibold tabular-nums text-slate-900">
                        {lineTotal.toLocaleString("th-TH")} {catalog.storeCurrency}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p>
              จำนวนทั้งหมด: {cartQtyTotal.toLocaleString("th-TH")} ชิ้น ({watchedItems.length.toLocaleString("th-TH")} รายการ)
            </p>
            <p className="font-semibold">
              ยอดรวมสุทธิ: {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
            </p>
          </div>

          {isCreateOnlyMode ? (
            <div className="space-y-2">
              <Button type="button" className="h-10 w-full" onClick={openCheckoutSheet}>
                ไปชำระเงิน / กรอกรายละเอียด
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={() => setShowCartSheet(false)}
              >
                กลับไปเลือกสินค้า
              </Button>
            </div>
          ) : (
            <Button type="button" className="h-10 w-full" onClick={() => setShowCartSheet(false)}>
              กลับไปแก้ฟอร์มออเดอร์
            </Button>
          )}
        </div>
      </SlideUpSheet>
      {isCreateOnlyMode ? (
        <SlideUpSheet
          isOpen={showCheckoutSheet}
          onClose={requestCloseCheckoutSheet}
          closeOnBackdrop={false}
          title="ชำระเงินและรายละเอียดออเดอร์"
          description="กรอกข้อมูลลูกค้า การชำระเงิน และยืนยันสร้างออเดอร์"
          disabled={loading}
          footer={
            <Button
              type="submit"
              form={CREATE_ORDER_CHECKOUT_SHEET_FORM_ID}
              className="h-10 w-full"
              disabled={loading || !canCreate}
            >
              {loading ? "กำลังบันทึก..." : "สร้างออเดอร์"}
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
              ปิดหน้าชำระเงิน?
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              มีข้อมูลที่กรอกไว้ในขั้นตอนนี้ ต้องการปิดหน้าชำระเงินและกลับไปเลือกสินค้าหรือไม่
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => setShowCheckoutCloseConfirm(false)}
              >
                กลับไปแก้ไข
              </Button>
              <Button type="button" className="h-9" onClick={closeCheckoutSheet}>
                ปิดหน้าชำระเงิน
              </Button>
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
              ? "สร้างออเดอร์รับที่ร้านแล้ว"
              : "สร้างออเดอร์หน้าร้านแล้ว"
          }
          description={`เลขที่ออเดอร์ ${createdOrderSuccess.orderNo}`}
        >
          <div className="space-y-3">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
                ? "แนะนำพิมพ์ใบรับสินค้าให้ลูกค้า หรือเปิดรายละเอียดเพื่อติดตามการรับสินค้า"
                : "แนะนำพิมพ์ใบเสร็จให้ลูกค้า แล้วเริ่มออเดอร์ถัดไปได้ทันที"}
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-700">ตัวอย่างบิล</p>
                <p className="text-[11px] text-slate-500">พิมพ์แบบใบเสร็จล้วน (ไม่มี layout แอป)</p>
              </div>
              {receiptPreviewLoading ? (
                <p className="text-xs text-slate-500">กำลังโหลดตัวอย่างใบเสร็จ...</p>
              ) : receiptPreviewError ? (
                <p className="text-xs text-red-600">{receiptPreviewError}</p>
              ) : receiptPreviewOrder ? (
                <div className="mx-auto w-[80mm] rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-900">
                  <p className="text-center text-[11px] font-semibold">ใบเสร็จรับเงิน</p>
                  <p className="text-center text-[10px]">เลขที่ {receiptPreviewOrder.orderNo}</p>
                  <p className="mt-1.5">
                    ลูกค้า: {receiptPreviewOrder.customerName || receiptPreviewOrder.contactDisplayName || "ลูกค้าทั่วไป"}
                  </p>
                  <p>วันที่: {new Date(receiptPreviewOrder.createdAt).toLocaleString("th-TH")}</p>
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
                        <p className="shrink-0 text-right">{item.lineTotal.toLocaleString("th-TH")}</p>
                      </div>
                    ))}
                    {receiptPreviewOrder.items.length > 4 ? (
                      <p className="text-[9px] text-slate-500">
                        และอีก {receiptPreviewOrder.items.length - 4} รายการ...
                      </p>
                    ) : null}
                  </div>
                  <div className="my-1 border-t border-dashed border-slate-400" />
                  <p className="flex justify-between">
                    <span>ยอดสุทธิ</span>
                    <span className="font-semibold">
                      {receiptPreviewOrder.total.toLocaleString("th-TH")} {receiptPreviewOrder.storeCurrency}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">ไม่มีข้อมูลตัวอย่างใบเสร็จ</p>
              )}
            </div>
            <Button
              type="button"
              className="h-10 w-full"
              disabled={receiptPrintLoading}
              onClick={() => openOrderReceiptPrint(createdOrderSuccess.orderId)}
            >
              {receiptPrintLoading
                ? "กำลังเปิดหน้าพิมพ์..."
                : createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
                  ? "พิมพ์ใบรับสินค้า"
                  : "พิมพ์ใบเสร็จ"}
            </Button>
            {createdOrderSuccess.checkoutFlow === "PICKUP_LATER" ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={() => openCreatedOrderDetail(createdOrderSuccess.orderId)}
              >
                ดูรายละเอียดออเดอร์
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                onClick={closeCreatedOrderSuccess}
              >
                ออเดอร์ใหม่ต่อ
              </Button>
            )}
            <button
              type="button"
              className="w-full text-center text-xs font-medium text-blue-700 hover:text-blue-800"
              onClick={() =>
                createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
                  ? closeCreatedOrderSuccess()
                  : openCreatedOrderDetail(createdOrderSuccess.orderId)
              }
            >
              {createdOrderSuccess.checkoutFlow === "PICKUP_LATER"
                ? "ออเดอร์ใหม่ต่อ"
                : "ดูรายละเอียดออเดอร์"}
            </button>
          </div>
        </SlideUpSheet>
      ) : null}

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
