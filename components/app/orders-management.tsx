"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import { currencyLabel, parseStoreCurrency, vatModeLabel } from "@/lib/finance/store-financial";
import { resolveLaosBankDisplayName } from "@/lib/payments/laos-banks";
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

type OrdersManagementProps = {
  ordersPage: PaginatedOrderList;
  activeTab: OrderListTab;
  catalog: OrderCatalog;
  canCreate: boolean;
};

type TabKey = OrderListTab;

const tabOptions: Array<{ key: TabKey; label: string }> = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "PENDING_PAYMENT", label: "รอจ่าย" },
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
  PAID: "ชำระแล้ว",
  PACKED: "แพ็กแล้ว",
  SHIPPED: "จัดส่งแล้ว",
  CANCELLED: "ยกเลิก",
};

const statusClass: Record<OrderListItem["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_PAYMENT: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  PACKED: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

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

export function OrdersManagement({
  ordersPage,
  activeTab,
  catalog,
  canCreate,
}: OrdersManagementProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [showScannerSheet, setShowScannerSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [manualSearchKeyword, setManualSearchKeyword] = useState("");

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

  const visibleOrders = ordersPage.rows;

  const subtotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const product = productsById.get(item.productId);
      if (!product) {
        return sum;
      }

      const unit = product.units.find((unitOption) => unitOption.unitId === item.unitId);
      if (!unit) {
        return sum;
      }

      const qtyBase = Number(item.qty) * unit.multiplierToBase;
      return sum + qtyBase * product.priceBase;
    }, 0);
  }, [productsById, watchedItems]);

  const totals = computeOrderTotals({
    subtotal,
    discount: watchedDiscount,
    vatEnabled: catalog.vatEnabled,
    vatRate: catalog.vatRate,
    vatMode: catalog.vatMode,
    shippingFeeCharged: Math.max(0, watchedShippingFeeCharged),
  });

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
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
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
    setLoading(false);

    if (data?.orderId) {
      router.push(`/orders/${data.orderId}`);
      return;
    }

    router.refresh();
  });

  const openCreateForm = () => {
    setCreateFormOpen(true);
  };

  const closeCreateForm = () => {
    setCreateFormOpen(false);
  };

  const isCreateFormOpen = createFormOpen;

  const renderCreateOrderForm = (options?: { inSheet?: boolean }) => {
    const inSheet = options?.inSheet ?? false;

    return (
      <form className="space-y-3" onSubmit={submitOrder}>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="order-channel">
            ช่องทาง
          </label>
          <select
            id="order-channel"
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
            {...form.register("channel")}
          >
            <option value="WALK_IN">Walk-in</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </div>

        {watchedChannel !== "WALK_IN" ? (
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
            ชื่อลูกค้า
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
            เบอร์โทร
          </label>
          <input
            id="order-customer-phone"
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
            {...form.register("customerPhone")}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="order-address">
            ที่อยู่
          </label>
          <textarea
            id="order-address"
            className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
            {...form.register("customerAddress")}
          />
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">รายการสินค้า</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loading || catalog.products.length === 0}
                onClick={() => setShowScannerSheet(true)}
              >
                สแกนเพิ่มสินค้า
              </button>
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loading || catalog.products.length === 0}
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
                    onClick={() => setShowScannerSheet(true)}
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

          <div className="space-y-2">
            {fields.map((field, index) => {
              const selectedProduct = productsById.get(watchedItems[index]?.productId ?? "");
              const selectedUnit = selectedProduct?.units.find(
                (unit) => unit.unitId === watchedItems[index]?.unitId,
              );
              const lineQtyBase =
                (Number(watchedItems[index]?.qty ?? 0) || 0) * (selectedUnit?.multiplierToBase ?? 0);
              const lineTotal = lineQtyBase * (selectedProduct?.priceBase ?? 0);

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
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                rawMethod === "LAO_QR" || rawMethod === "COD" || rawMethod === "BANK_TRANSFER"
                  ? rawMethod
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
            <option value="COD">COD (เก็บเงินปลายทาง)</option>
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
                  : "โหมดโอนเงินผ่านบัญชี: แนะนำแนบหลักฐานก่อนยืนยันชำระ"}
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
          <p className="text-xs text-slate-500">วิธีชำระ: {paymentMethodLabel[watchedPaymentMethod]}</p>
        </div>

        <div className={inSheet ? "sticky bottom-0 border-t border-slate-200 bg-white pt-3" : ""}>
          <Button type="submit" className="h-10 w-full" disabled={loading || !canCreate}>
            {loading ? "กำลังบันทึก..." : "สร้างออเดอร์"}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">รายการออเดอร์</h2>
          <Button
            className="h-9"
            onClick={() => (isCreateFormOpen ? closeCreateForm() : openCreateForm())}
            disabled={!canCreate || loading}
          >
            {isCreateFormOpen ? "ปิดฟอร์ม" : "สร้างออเดอร์"}
          </Button>
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
                หน้า {ordersPage.page.toLocaleString("th-TH")} /{" "}
                {ordersPage.pageCount.toLocaleString("th-TH")} ({ordersPage.total.toLocaleString("th-TH")} รายการ)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  disabled={ordersPage.page <= 1}
                  onClick={() => router.push(buildOrdersUrl(activeTab, ordersPage.page - 1))}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  disabled={ordersPage.page >= ordersPage.pageCount}
                  onClick={() => router.push(buildOrdersUrl(activeTab, ordersPage.page + 1))}
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
      <SlideUpSheet
        isOpen={showScannerSheet}
        onClose={() => setShowScannerSheet(false)}
        title="สแกนบาร์โค้ดสินค้า"
        description="สแกนแล้วเพิ่มสินค้าเข้าออเดอร์อัตโนมัติ"
        disabled={loading}
      >
        <OrderBarcodeScanner
          isOpen={showScannerSheet}
          onResult={onScanBarcodeResult}
          onClose={() => setShowScannerSheet(false)}
          disabled={loading}
        />
      </SlideUpSheet>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}

function OrderBarcodeScanner({
  isOpen,
  onResult,
  onClose,
  disabled,
}: {
  isOpen: boolean;
  onResult: (barcode: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<import("@zxing/browser").IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<
    "opening" | "scanning" | "paused" | "no-permission" | "no-camera" | "error"
  >("opening");
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const stopScanner = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    const deviceList = await navigator.mediaDevices.enumerateDevices();
    const cameras = deviceList.filter((device) => device.kind === "videoinput");
    setDevices(cameras);
  }, []);

  const startScanner = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("no-camera");
        setError("อุปกรณ์นี้ไม่รองรับการเปิดกล้อง");
        return;
      }

      setError(null);
      setStatus("opening");

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "environment" },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        const activeTrack = stream.getVideoTracks()[0];
        const activeCameraId = activeTrack?.getSettings?.().deviceId ?? null;
        setActiveDeviceId(activeCameraId);
        if (activeCameraId) {
          window.localStorage.setItem("scanner-camera-id", activeCameraId);
        }

        await refreshDevices();

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 200,
        });

        if (!videoRef.current) {
          stopScanner();
          return;
        }

        controlsRef.current = await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (!result) {
            return;
          }
          const code = result.getText().trim();
          if (!code) {
            return;
          }
          stopScanner();
          onResult(code);
        });

        setStatus("scanning");
      } catch (scanError) {
        if (scanError instanceof DOMException && scanError.name === "NotAllowedError") {
          setStatus("no-permission");
          setError("ไม่ได้รับอนุญาตให้ใช้กล้อง");
        } else if (scanError instanceof DOMException && scanError.name === "NotFoundError") {
          setStatus("no-camera");
          setError("ไม่พบกล้องในอุปกรณ์นี้");
        } else {
          setStatus("error");
          setError("เปิดสแกนเนอร์ไม่สำเร็จ กรุณาพิมพ์บาร์โค้ดเอง");
        }
        stopScanner();
      }
    },
    [onResult, refreshDevices, stopScanner],
  );

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setStatus("paused");
      return;
    }

    const savedCameraId = window.localStorage.getItem("scanner-camera-id");
    void startScanner(savedCameraId || undefined);

    return () => {
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  const submitManualBarcode = () => {
    const code = manualBarcode.trim();
    if (!code) {
      return;
    }
    stopScanner();
    onResult(code);
    setManualBarcode("");
  };

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-full max-w-sm">
        <video ref={videoRef} className="mx-auto aspect-[3/2] w-full rounded-xl bg-black" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[46%] w-[80%] rounded-lg border-2 border-blue-400/80" />
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        วางบาร์โค้ดให้อยู่กลางกรอบ แล้วระบบจะเพิ่มสินค้าให้อัตโนมัติ
      </p>

      {status === "opening" ? (
        <p className="text-center text-xs text-slate-500">กำลังเปิดกล้อง...</p>
      ) : null}
      {status === "no-permission" ? (
        <p className="text-center text-xs text-amber-600">ไม่ได้รับอนุญาตให้ใช้กล้อง</p>
      ) : null}
      {status === "no-camera" ? <p className="text-center text-xs text-amber-600">ไม่พบกล้อง</p> : null}
      {status === "error" && error ? <p className="text-center text-xs text-amber-600">{error}</p> : null}

      <div className="flex items-center gap-2">
        {devices.length > 1 ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1"
            disabled={disabled}
            onClick={async () => {
              if (devices.length <= 1) {
                return;
              }
              const currentIndex = Math.max(
                0,
                devices.findIndex((device) => device.deviceId === activeDeviceId),
              );
              const nextDevice = devices[(currentIndex + 1) % devices.length];
              stopScanner();
              await startScanner(nextDevice?.deviceId);
            }}
          >
            สลับกล้อง
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1"
          disabled={disabled}
          onClick={async () => {
            if (status === "paused") {
              await startScanner(activeDeviceId ?? undefined);
              return;
            }
            stopScanner();
            setStatus("paused");
          }}
        >
          {status === "paused" ? "เปิดกล้อง" : "พักกล้อง"}
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <p className="text-xs text-slate-500">หรือพิมพ์บาร์โค้ดเอง</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="h-10 flex-1 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            value={manualBarcode}
            onChange={(event) => setManualBarcode(event.target.value)}
            placeholder="เช่น 8851234567890"
            disabled={disabled}
          />
          <Button
            type="button"
            className="h-10"
            onClick={submitManualBarcode}
            disabled={disabled || !manualBarcode.trim()}
          >
            เพิ่ม
          </Button>
        </div>
      </div>

      <Button type="button" variant="outline" className="h-10 w-full" onClick={onClose} disabled={disabled}>
        ปิด
      </Button>
    </div>
  );
}
