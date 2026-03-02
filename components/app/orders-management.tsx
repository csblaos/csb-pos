"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { BarcodeScannerPanel } from "@/components/app/barcode-scanner-panel";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import { currencyLabel, parseStoreCurrency, vatModeLabel } from "@/lib/finance/store-financial";
import { resolveLaosBankDisplayName } from "@/lib/payments/laos-banks";
import { setNewOrderDraftFlag } from "@/lib/orders/new-order-draft";
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
  CANCELLED: "ยกเลิก",
};

const statusClass: Record<OrderListItem["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_PAYMENT: "bg-amber-100 text-amber-700",
  READY_FOR_PICKUP: "bg-cyan-100 text-cyan-700",
  PAID: "bg-emerald-100 text-emerald-700",
  PACKED: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

type CreateOrderStep = "products" | "details";
type QuickAddSort = "relevance" | "name" | "price_asc" | "price_desc";
type QuickAddCategory = {
  id: string;
  name: string;
  count: number;
};
type CheckoutFlow = "WALK_IN_NOW" | "PICKUP_LATER" | "ONLINE_DELIVERY";

const checkoutFlowLabel: Record<CheckoutFlow, string> = {
  WALK_IN_NOW: "Walk-in ทันที",
  PICKUP_LATER: "มารับที่ร้านภายหลัง",
  ONLINE_DELIVERY: "สั่งออนไลน์/จัดส่ง",
};
const SCANNER_PERMISSION_STORAGE_KEY = "scanner-permission-seen";

const defaultValues = (catalog: OrderCatalog): CreateOrderFormInput => ({
  channel: "WALK_IN",
  contactId: "",
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  discount: 0,
  shippingFeeCharged: 0,
  shippingCost: 0,
  paymentCurrency: catalog.storeCurrency as "LAK" | "THB" | "USD",
  paymentMethod: "CASH",
  paymentAccountId: "",
  items:
    catalog.products.length > 0
      ? [
          {
            productId: catalog.products[0].productId,
            unitId: catalog.products[0].units[0]?.unitId ?? "",
            qty: 1,
          },
        ]
      : [],
});

export function OrdersManagement(props: OrdersManagementProps) {
  const { catalog, canCreate } = props;
  const isCreateOnlyMode = props.mode === "create-only";
  const activeTab: OrderListTab = isCreateOnlyMode ? "ALL" : props.activeTab;
  const ordersPage = isCreateOnlyMode ? null : props.ordersPage;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createFormOpen, setCreateFormOpen] = useState(false);
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
  const [quickAddSort, setQuickAddSort] = useState<QuickAddSort>("relevance");
  const [showCartSheet, setShowCartSheet] = useState(false);
  const [showCheckoutSheet, setShowCheckoutSheet] = useState(false);
  const [createStep, setCreateStep] = useState<CreateOrderStep>("products");
  const [checkoutFlow, setCheckoutFlow] = useState<CheckoutFlow>("WALK_IN_NOW");

  const form = useForm<CreateOrderFormInput, unknown, CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: defaultValues(catalog),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedChannel = form.watch("channel");
  const watchedItemsRaw = form.watch("items");
  const watchedItems = useMemo(() => watchedItemsRaw ?? [], [watchedItemsRaw]);
  const watchedDiscount = Number(form.watch("discount") ?? 0);
  const watchedShippingFeeCharged = Number(form.watch("shippingFeeCharged") ?? 0);
  const watchedPaymentCurrency = form.watch("paymentCurrency") ?? catalog.storeCurrency;
  const watchedPaymentMethod = form.watch("paymentMethod") ?? "CASH";
  const isOnlineCheckout = checkoutFlow === "ONLINE_DELIVERY";
  const isPickupLaterCheckout = checkoutFlow === "PICKUP_LATER";
  const requiresCustomerPhone = isOnlineCheckout || isPickupLaterCheckout;
  const selectedPaymentCurrency = parseStoreCurrency(
    watchedPaymentCurrency,
    parseStoreCurrency(catalog.storeCurrency),
  );
  const qrPaymentAccounts = useMemo(
    () => catalog.paymentAccounts.filter((account) => account.accountType === "LAO_QR"),
    [catalog.paymentAccounts],
  );
  const bankPaymentAccounts = useMemo(
    () => catalog.paymentAccounts.filter((account) => account.accountType === "BANK"),
    [catalog.paymentAccounts],
  );
  const paymentAccountsForMethod = useMemo(() => {
    if (watchedPaymentMethod === "LAO_QR") {
      return qrPaymentAccounts;
    }
    if (watchedPaymentMethod === "BANK_TRANSFER") {
      return bankPaymentAccounts;
    }
    return [];
  }, [bankPaymentAccounts, qrPaymentAccounts, watchedPaymentMethod]);

  const productsById = useMemo(
    () => new Map(catalog.products.map((product) => [product.productId, product])),
    [catalog.products],
  );

  const contactsById = useMemo(
    () => new Map(catalog.contacts.map((contact) => [contact.id, contact])),
    [catalog.contacts],
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

    if (quickAddSort === "name") {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "th"));
    } else if (quickAddSort === "price_asc") {
      filtered = [...filtered].sort((a, b) => a.priceBase - b.priceBase);
    } else if (quickAddSort === "price_desc") {
      filtered = [...filtered].sort((a, b) => b.priceBase - a.priceBase);
    }

    return filtered.slice(0, 24);
  }, [catalog.products, quickAddKeyword, quickAddCategoryId, quickAddOnlyAvailable, quickAddSort]);
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

  const subtotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const qty = Number(item.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return sum;
      }
      return sum + qty * getProductUnitPrice(item.productId, item.unitId);
    }, 0);
  }, [getProductUnitPrice, watchedItems]);

  const totals = computeOrderTotals({
    subtotal,
    discount: watchedDiscount,
    vatEnabled: catalog.vatEnabled,
    vatRate: catalog.vatRate,
    vatMode: catalog.vatMode,
    shippingFeeCharged: Math.max(0, watchedShippingFeeCharged),
  });
  const cartQtyTotal = useMemo(
    () =>
      watchedItems.reduce((sum, item) => {
        const qty = Number(item.qty ?? 0);
        return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
      }, 0),
    [watchedItems],
  );

  const onChangeProduct = (index: number, productId: string) => {
    const product = productsById.get(productId);
    form.setValue(`items.${index}.productId`, productId);
    form.setValue(`items.${index}.unitId`, product?.units[0]?.unitId ?? "");
  };

  const onPickContact = (contactId: string) => {
    form.setValue("contactId", contactId);
    const contact = contactsById.get(contactId);
    if (contact) {
      form.setValue("customerName", contact.displayName);
      if (contact.phone) {
        form.setValue("customerPhone", contact.phone);
      }
    }
  };

  const applyCheckoutFlow = useCallback(
    (nextFlow: CheckoutFlow) => {
      setCheckoutFlow(nextFlow);
      form.clearErrors(["contactId", "customerPhone", "customerAddress"]);

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

      if (form.getValues("paymentMethod") === "COD") {
        form.setValue("paymentMethod", "CASH", { shouldDirty: true, shouldValidate: true });
      }
    },
    [form],
  );

  const addProductFromCatalog = (productId: string) => {
    const product = productsById.get(productId);
    if (!product) {
      return null;
    }

    const existingIndex = watchedItems.findIndex((item) => item.productId === productId);
    if (existingIndex >= 0) {
      const currentQty = Number(form.getValues(`items.${existingIndex}.qty`) ?? 0);
      form.setValue(`items.${existingIndex}.qty`, Math.max(1, currentQty + 1), {
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
      const safeQty = Math.max(1, Math.trunc(nextQty) || 1);
      form.setValue(`items.${index}.qty`, safeQty, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
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
    form.clearErrors(["customerPhone", "customerAddress"]);

    const normalizedCustomerName = values.customerName?.trim();
    const normalizedCustomerPhone = values.customerPhone?.trim() ?? "";
    const normalizedCustomerAddress = values.customerAddress?.trim() ?? "";
    const normalizedChannel =
      checkoutFlow === "ONLINE_DELIVERY"
        ? values.channel === "WALK_IN"
          ? "FACEBOOK"
          : values.channel
        : "WALK_IN";
    const normalizedPaymentMethod =
      checkoutFlow !== "ONLINE_DELIVERY" && values.paymentMethod === "COD"
        ? "CASH"
        : (values.paymentMethod ?? "CASH");

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
    setCreateFormOpen(false);
    setShowCartSheet(false);
    setShowCheckoutSheet(false);
    setCreateStep("products");
    setCheckoutFlow("WALK_IN_NOW");
    setNewOrderDraftFlag(false);
    setLoading(false);

    if (data?.orderId) {
      router.push(`/orders/${data.orderId}`);
      return;
    }

    router.refresh();
  });

  const openCreateForm = () => {
    setCreateFormOpen(true);
    setShowCartSheet(false);
    setShowCheckoutSheet(false);
    setCreateStep("products");
    setCheckoutFlow("WALK_IN_NOW");
  };

  const closeCreateForm = () => {
    setCreateFormOpen(false);
    setShowCartSheet(false);
    setShowCheckoutSheet(false);
    setCreateStep("products");
    setCheckoutFlow("WALK_IN_NOW");
  };

  const openCheckoutSheet = () => {
    if (watchedItems.length <= 0) {
      return;
    }
    setCreateStep("details");
    setShowCartSheet(false);
    setShowCheckoutSheet(true);
  };

  const isCreateFormOpen = isCreateOnlyMode ? false : createFormOpen;

  useEffect(() => {
    if (!isCreateOnlyMode) return;
    const hasDraft = form.formState.isDirty && watchedItems.length > 0;
    setNewOrderDraftFlag(hasDraft);

    return () => {
      setNewOrderDraftFlag(false);
    };
  }, [form.formState.isDirty, isCreateOnlyMode, watchedItems.length]);

  useEffect(() => {
    const seen = window.localStorage.getItem(SCANNER_PERMISSION_STORAGE_KEY) === "1";
    setHasSeenScannerPermission(seen);
  }, []);

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
      <form className="space-y-3" onSubmit={submitOrder}>
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
                <label className="text-xs text-muted-foreground" htmlFor="order-channel">
                  ช่องทางออเดอร์ออนไลน์
                </label>
                <select
                  id="order-channel"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                  value={watchedChannel === "WALK_IN" ? "FACEBOOK" : watchedChannel}
                  onChange={(event) => {
                    const nextChannel = event.target.value === "WHATSAPP" ? "WHATSAPP" : "FACEBOOK";
                    form.setValue("channel", nextChannel, { shouldDirty: true, shouldValidate: true });
                    form.setValue("contactId", "", { shouldDirty: true, shouldValidate: true });
                  }}
                >
                  <option value="FACEBOOK">Facebook</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </div>
            ) : null}

            {isOnlineCheckout && watchedChannel !== "WALK_IN" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="order-contact">
                  เลือกลูกค้า
                </label>
                <select
                  id="order-contact"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                  value={form.watch("contactId") ?? ""}
                  onChange={(event) => onPickContact(event.target.value)}
                >
                  <option value="">เลือกจากรายชื่อลูกค้า</option>
                  {catalog.contacts
                    .filter((contact) =>
                      watchedChannel === "FACEBOOK"
                        ? contact.channel === "FACEBOOK"
                        : contact.channel === "WHATSAPP",
                    )
                    .map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.displayName}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-red-600">{form.formState.errors.contactId?.message}</p>
              </div>
            ) : null}

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
            </div>

            {isOnlineCheckout ? (
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
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                {isPickupLaterCheckout
                  ? "โหมดรับที่ร้านภายหลัง: แนะนำกรอกเบอร์โทรให้ครบ เพื่อโทรนัดรับสินค้า"
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
              <select
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none ring-primary focus:ring-2"
                value={quickAddSort}
                onChange={(event) => {
                  const nextSort = event.target.value;
                  if (
                    nextSort === "name" ||
                    nextSort === "price_asc" ||
                    nextSort === "price_desc"
                  ) {
                    setQuickAddSort(nextSort);
                    return;
                  }
                  setQuickAddSort("relevance");
                }}
                disabled={loading || !hasCatalogProducts}
              >
                <option value="relevance">เรียง: แนะนำ</option>
                <option value="name">ชื่อสินค้า A-Z</option>
                <option value="price_asc">ราคาต่ำ-สูง</option>
                <option value="price_desc">ราคาสูง-ต่ำ</option>
              </select>
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
                    <p className="mt-1 text-xs font-medium text-blue-700">
                      + เพิ่ม {getProductDefaultUnitPrice(product).toLocaleString("th-TH")}{" "}
                      {catalog.storeCurrency}
                    </p>
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
                          disabled={loading}
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
                        disabled={loading || watchedItems.length <= 1}
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
                        disabled={loading || fields.length <= 1}
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
              className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 flex items-center justify-between rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm sm:hidden"
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
            <div className={`grid grid-cols-1 gap-2 ${isOnlineCheckout ? "sm:grid-cols-3" : "sm:grid-cols-1"}`}>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">ส่วนลด</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                  {...form.register("discount")}
                />
              </div>

              {isOnlineCheckout ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">ค่าส่งที่เรียกเก็บ</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
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
                      className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                      disabled={loading}
                      {...form.register("shippingCost")}
                    />
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="payment-method">
                วิธีรับชำระ
              </label>
              <select
                id="payment-method"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loading}
                value={watchedPaymentMethod}
                onChange={(event) => {
                  const rawMethod = event.target.value;
                  const nextMethod =
                    rawMethod === "LAO_QR" || rawMethod === "BANK_TRANSFER"
                      ? rawMethod
                      : rawMethod === "COD" && isOnlineCheckout
                        ? "COD"
                      : "CASH";
                  form.setValue("paymentMethod", nextMethod, { shouldValidate: true });
                  if (nextMethod === "LAO_QR") {
                    const defaultQrAccount = qrPaymentAccounts[0]?.id ?? "";
                    form.setValue("paymentAccountId", defaultQrAccount, { shouldValidate: true });
                  } else if (nextMethod === "BANK_TRANSFER") {
                    const defaultBankAccount = bankPaymentAccounts[0]?.id ?? "";
                    form.setValue("paymentAccountId", defaultBankAccount, { shouldValidate: true });
                  } else {
                    form.setValue("paymentAccountId", "", { shouldValidate: true });
                  }
                }}
              >
                <option value="CASH">เงินสด</option>
                <option value="LAO_QR">QR โอนเงิน (ลาว)</option>
                <option value="BANK_TRANSFER">โอนเงินผ่านบัญชี</option>
                {isOnlineCheckout ? <option value="COD">COD (เก็บเงินปลายทาง)</option> : null}
              </select>
            </div>

            {watchedPaymentMethod === "LAO_QR" || watchedPaymentMethod === "BANK_TRANSFER" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="payment-account">
                  บัญชีรับเงิน
                </label>
                <select
                  id="payment-account"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                  value={form.watch("paymentAccountId") ?? ""}
                  onChange={(event) =>
                    form.setValue("paymentAccountId", event.target.value, { shouldValidate: true })
                  }
                >
                  <option value="">
                    {watchedPaymentMethod === "LAO_QR" ? "เลือกบัญชี QR" : "เลือกบัญชีโอน"}
                  </option>
                  {paymentAccountsForMethod.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} ({resolveLaosBankDisplayName(account.bankName)})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-red-600">{form.formState.errors.paymentAccountId?.message}</p>
                <p className="text-xs text-slate-500">
                  {watchedPaymentMethod === "LAO_QR" && catalog.requireSlipForLaoQr
                    ? "นโยบายร้าน: ต้องแนบสลิปก่อนยืนยันชำระ"
                    : watchedPaymentMethod === "LAO_QR"
                      ? "นโยบายร้าน: ไม่บังคับแนบสลิป"
                      : isOnlineCheckout
                        ? "โหมดโอนเงินผ่านบัญชี: แนะนำแนบหลักฐานก่อนยืนยันชำระ"
                        : "หน้าร้าน/รับที่ร้าน: เลือกบัญชีรับเงินของร้าน"}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="payment-currency">
                สกุลที่รับชำระในออเดอร์นี้
              </label>
              <select
                id="payment-currency"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loading}
                {...form.register("paymentCurrency")}
              >
                {catalog.supportedCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currencyLabel(currency)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Base currency: {catalog.storeCurrency} • รองรับ {catalog.supportedCurrencies.join(", ")}
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
            </div>

            <div className={inSheet ? "sticky bottom-0 border-t border-slate-200 bg-white pt-3" : ""}>
              <Button type="submit" className="h-10 w-full" disabled={loading || !canCreate}>
                {loading ? "กำลังบันทึก..." : "สร้างออเดอร์"}
              </Button>
            </div>
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
      <div className="space-y-3 pb-28 sm:pb-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="h-10 flex-1 rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
              placeholder="ค้นหา SKU, ชื่อ หรือบาร์โค้ด"
              value={quickAddKeyword}
              onChange={(event) => setQuickAddKeyword(event.target.value)}
              disabled={loading || !hasCatalogProducts}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 px-3 text-xs"
              disabled={loading || !hasCatalogProducts}
              onClick={openScannerSheet}
            >
              สแกน
            </Button>
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
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none ring-primary focus:ring-2"
              value={quickAddSort}
              onChange={(event) => {
                const nextSort = event.target.value;
                if (nextSort === "name" || nextSort === "price_asc" || nextSort === "price_desc") {
                  setQuickAddSort(nextSort);
                  return;
                }
                setQuickAddSort("relevance");
              }}
              disabled={loading || !hasCatalogProducts}
            >
              <option value="relevance">เรียง: แนะนำ</option>
              <option value="name">ชื่อสินค้า A-Z</option>
              <option value="price_asc">ราคาต่ำ-สูง</option>
              <option value="price_desc">ราคาสูง-ต่ำ</option>
            </select>
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

        {!hasCatalogProducts ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
            ยังไม่มีสินค้าในระบบ
          </p>
        ) : quickAddProducts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">
            ไม่พบสินค้าที่ตรงกับคำค้น
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4">
            {quickAddProducts.map((product) => (
              <button
                key={product.productId}
                type="button"
                className="space-y-1.5 rounded-md border bg-white px-2.5 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
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
                      sizes="(min-width: 640px) 56px, 48px"
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
                  <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    + เพิ่ม
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              ตะกร้า ({watchedItems.length.toLocaleString("th-TH")} รายการ)
            </p>
            <button
              type="button"
              className="text-xs font-medium text-blue-700"
              onClick={() => setShowCartSheet(true)}
              disabled={loading || watchedItems.length === 0}
            >
              ดูทั้งหมด
            </button>
          </div>
          {watchedItems.length === 0 ? (
            <p className="text-xs text-slate-500">ยังไม่มีรายการสินค้าในตะกร้า</p>
          ) : (
            <div className="space-y-1">
              {watchedItems.slice(0, 3).map((item, index) => {
                const selectedProduct = productsById.get(item.productId ?? "");
                return (
                  <div key={`${item.productId}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-700">
                      {selectedProduct?.name ?? "ไม่พบสินค้า"}
                    </span>
                    <span className="font-medium text-slate-900">
                      {(Number(item.qty ?? 0) || 0).toLocaleString("th-TH")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-600">
            รวม {cartQtyTotal.toLocaleString("th-TH")} ชิ้น •{" "}
            {totals.total.toLocaleString("th-TH")} {catalog.storeCurrency}
          </p>
          <div className="hidden gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1"
              onClick={() => setShowCartSheet(true)}
              disabled={loading || watchedItems.length === 0}
            >
              เปิดตะกร้า
            </Button>
            <Button
              type="button"
              className="h-9 flex-1"
              onClick={openCheckoutSheet}
              disabled={loading || watchedItems.length === 0}
            >
              ชำระเงิน / กรอกรายละเอียด
            </Button>
          </div>
        </div>

        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 sm:hidden">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <p>
                {watchedItems.length.toLocaleString("th-TH")} รายการ •{" "}
                {cartQtyTotal.toLocaleString("th-TH")} ชิ้น
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
                  variant="outline"
                  className="h-9 px-3 text-xs"
                  onClick={() => (isCreateFormOpen ? closeCreateForm() : openCreateForm())}
                  disabled={!canCreate || loading}
                >
                  {isCreateFormOpen ? "ปิดฟอร์มด่วน" : "สร้างด่วน"}
                </Button>
                <Button
                  type="button"
                  className="h-9 px-3 text-xs sm:text-sm"
                  onClick={() => router.push("/orders/new")}
                  disabled={!canCreate || loading}
                >
                  สร้างออเดอร์
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

          <SlideUpSheet
            isOpen={createFormOpen}
            onClose={closeCreateForm}
            title="สร้างออเดอร์ใหม่"
            description="มือถือ: Slide-up / เดสก์ท็อป: Modal"
            disabled={loading}
          >
            {renderCreateOrderForm({ inSheet: true })}
          </SlideUpSheet>
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
                const lineTotal =
                  (Number(item.qty ?? 0) || 0) * (selectedUnit?.pricePerUnit ?? 0);

                return (
                  <div key={`${item.productId}-${index}`} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-500">{selectedProduct?.sku ?? "-"}</p>
                        <p className="text-sm font-medium text-slate-900">
                          {selectedProduct?.name ?? "ไม่พบสินค้า"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => remove(index)}
                        disabled={loading || watchedItems.length <= 1}
                      >
                        ลบ
                      </button>
                    </div>

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
                          disabled={loading}
                          aria-label="เพิ่มจำนวน"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>คงเหลือ {selectedProduct?.available.toLocaleString("th-TH") ?? 0}</span>
                      <span>
                        รวมรายการ {lineTotal.toLocaleString("th-TH")} {catalog.storeCurrency}
                      </span>
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
          onClose={() => {
            setShowCheckoutSheet(false);
            setCreateStep("products");
          }}
          title="ชำระเงินและรายละเอียดออเดอร์"
          description="กรอกข้อมูลลูกค้า การชำระเงิน และยืนยันสร้างออเดอร์"
          disabled={loading}
        >
          {renderCreateOrderForm({ inSheet: true })}
        </SlideUpSheet>
      ) : null}

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
