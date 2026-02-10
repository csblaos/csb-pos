"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import type {
  OrderCatalog,
  OrderListItem,
  OrderListTab,
  PaginatedOrderList,
} from "@/lib/orders/queries";
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
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const productsById = useMemo(
    () => new Map(catalog.products.map((product) => [product.productId, product])),
    [catalog.products],
  );

  const contactsById = useMemo(
    () => new Map(catalog.contacts.map((contact) => [contact.id, contact])),
    [catalog.contacts],
  );

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

  const discount = Math.max(0, Math.min(watchedDiscount, subtotal));
  const taxable = Math.max(subtotal - discount, 0);
  const vatAmount = catalog.vatEnabled ? Math.round((taxable * catalog.vatRate) / 10000) : 0;
  const total = taxable + vatAmount + Math.max(0, watchedShippingFeeCharged);

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
        cell: ({ row }) => `${row.original.total.toLocaleString("th-TH")} ${catalog.storeCurrency}`,
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

    const response = await fetch("/api/orders", {
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
    setLoading(false);

    if (data?.orderId) {
      router.push(`/orders/${data.orderId}`);
      return;
    }

    router.refresh();
  });

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">รายการออเดอร์</h2>
          <Button
            className="h-9"
            onClick={() => setShowCreate((prev) => !prev)}
            disabled={!canCreate || loading}
          >
            {showCreate ? "ปิดฟอร์ม" : "สร้างออเดอร์"}
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {tabOptions.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => router.push(buildOrdersUrl(tab.key, 1))}
              className={`rounded-lg px-2 py-2 text-xs ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "border bg-white text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </article>

      {showCreate ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">สร้างออเดอร์ใหม่</h2>

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

              <div className="space-y-2">
                {fields.map((field, index) => {
                  const selectedProduct = productsById.get(watchedItems[index]?.productId ?? "");
                  const selectedUnit = selectedProduct?.units.find(
                    (unit) => unit.unitId === watchedItems[index]?.unitId,
                  );
                  const lineQtyBase =
                    (Number(watchedItems[index]?.qty ?? 0) || 0) *
                    (selectedUnit?.multiplierToBase ?? 0);
                  const lineTotal =
                    lineQtyBase * (selectedProduct?.priceBase ?? 0);

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

            <div className="grid grid-cols-3 gap-2">
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

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p>ยอดสินค้า: {subtotal.toLocaleString("th-TH")} {catalog.storeCurrency}</p>
              <p>ส่วนลด: {discount.toLocaleString("th-TH")} {catalog.storeCurrency}</p>
              <p>VAT: {vatAmount.toLocaleString("th-TH")} {catalog.storeCurrency}</p>
              <p className="font-semibold">ยอดรวม: {total.toLocaleString("th-TH")} {catalog.storeCurrency}</p>
            </div>

            <Button type="submit" className="h-10 w-full" disabled={loading || !canCreate}>
              {loading ? "กำลังบันทึก..." : "สร้างออเดอร์"}
            </Button>
          </form>
        </article>
      ) : null}

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
                        ช่องทาง {channelLabel[order.channel]}
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

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
