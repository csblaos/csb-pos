"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import type { ProductListItem, UnitOption } from "@/lib/products/service";
import {
  type ProductUpsertFormInput,
  type ProductUpsertInput,
  productUpsertSchema,
} from "@/lib/products/validation";

type ProductsManagementProps = {
  products: ProductListItem[];
  units: UnitOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canManageUnits: boolean;
};

const defaultValues = (baseUnitId: string): ProductUpsertFormInput => ({
  sku: "",
  name: "",
  barcode: "",
  baseUnitId,
  priceBase: 0,
  costBase: 0,
  conversions: [],
});

export function ProductsManagement({
  products,
  units,
  canCreate,
  canUpdate,
  canArchive,
  canManageUnits,
}: ProductsManagementProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const form = useForm<ProductUpsertFormInput, unknown, ProductUpsertInput>({
    resolver: zodResolver(productUpsertSchema),
    defaultValues: defaultValues(units[0]?.id ?? ""),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "conversions",
  });

  const baseUnitId = form.watch("baseUnitId");
  const watchedConversions = form.watch("conversions") ?? [];

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  const filteredProducts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return products;
    }

    return products.filter((item) => {
      const barcode = item.barcode ?? "";
      return [item.sku, item.name, barcode, item.baseUnitCode]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [products, query]);

  const beginCreate = () => {
    if (!canCreate) {
      return;
    }

    setMode("create");
    setEditingProductId(null);
    form.reset(defaultValues(units[0]?.id ?? ""));
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowForm(true);
  };

  const beginEdit = (product: ProductListItem) => {
    if (!canUpdate) {
      return;
    }

    setMode("edit");
    setEditingProductId(product.id);
    form.reset({
      sku: product.sku,
      name: product.name,
      barcode: product.barcode ?? "",
      baseUnitId: product.baseUnitId,
      priceBase: product.priceBase,
      costBase: product.costBase,
      conversions: product.conversions.map((item) => ({
        unitId: item.unitId,
        multiplierToBase: item.multiplierToBase,
      })),
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingProductId(null);
    setErrorMessage(null);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const requestKey = mode === "create" ? "create" : `update-${editingProductId}`;
    setLoadingKey(requestKey);

    const response =
      mode === "create"
        ? await authFetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          })
        : await authFetch(`/api/products/${editingProductId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", data: values }),
          });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึกสินค้าไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setSuccessMessage(mode === "create" ? "สร้างสินค้าเรียบร้อย" : "อัปเดตสินค้าเรียบร้อย");
    setLoadingKey(null);
    setShowForm(false);
    setEditingProductId(null);
    router.refresh();
  });

  const setActiveState = async (product: ProductListItem, nextActive: boolean) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoadingKey(`active-${product.id}`);

    const response = await authFetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", active: nextActive }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "เปลี่ยนสถานะสินค้าไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setSuccessMessage(nextActive ? "เปิดใช้งานสินค้าแล้ว" : "ปิดใช้งานสินค้าแล้ว");
    setLoadingKey(null);
    router.refresh();
  };

  const baseUnit = unitById.get(baseUnitId);

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหา SKU, ชื่อสินค้า, บาร์โค้ด"
            className="h-10 flex-1 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          />
          <Button className="h-10" onClick={beginCreate} disabled={!canCreate || loadingKey !== null}>
            เพิ่มสินค้า
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          ราคาขายและต้นทุนเก็บเป็นจำนวนเต็มต่อหน่วยหลัก เช่น LAK ต่อ PCS
        </p>

        {canManageUnits ? (
          <Link href="/settings/units" className="text-xs font-medium text-blue-700 hover:underline">
            จัดการหน่วยสินค้า
          </Link>
        ) : null}
      </article>

      {showForm ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {mode === "create" ? "เพิ่มสินค้าใหม่" : "แก้ไขสินค้า"}
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-slate-500"
              onClick={closeForm}
              disabled={loadingKey !== null}
            >
              ปิด
            </button>
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="product-sku">
                SKU
              </label>
              <input
                id="product-sku"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                {...form.register("sku")}
              />
              <p className="text-xs text-red-600">{form.formState.errors.sku?.message}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="product-name">
                ชื่อสินค้า
              </label>
              <input
                id="product-name"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                {...form.register("name")}
              />
              <p className="text-xs text-red-600">{form.formState.errors.name?.message}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="product-barcode">
                บาร์โค้ด (ถ้ามี)
              </label>
              <input
                id="product-barcode"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                {...form.register("barcode")}
              />
              <p className="text-xs text-red-600">{form.formState.errors.barcode?.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="product-base-unit">
                  หน่วยหลัก
                </label>
                <select
                  id="product-base-unit"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                  {...form.register("baseUnitId")}
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} ({unit.nameTh})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-red-600">{form.formState.errors.baseUnitId?.message}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="product-price-base">
                  ราคาขาย/หน่วยหลัก
                </label>
                <input
                  id="product-price-base"
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                  {...form.register("priceBase")}
                />
                <p className="text-xs text-red-600">{form.formState.errors.priceBase?.message}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="product-cost-base">
                ต้นทุน/หน่วยหลัก
              </label>
              <input
                id="product-cost-base"
                type="number"
                min={0}
                step={1}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                {...form.register("costBase")}
              />
              <p className="text-xs text-red-600">{form.formState.errors.costBase?.message}</p>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">การแปลงหน่วย</p>
                <button
                  type="button"
                  className="text-xs font-medium text-blue-700"
                  disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                  onClick={() => append({ unitId: units[0]?.id ?? "", multiplierToBase: 2 })}
                >
                  + เพิ่มหน่วย
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                หน่วยหลัก: {baseUnit ? `${baseUnit.code} (${baseUnit.nameTh})` : "-"}
              </p>

              <div className="space-y-2">
                {fields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">ยังไม่มีหน่วยแปลง</p>
                ) : null}

                {fields.map((field, index) => {
                  const selectedUnit = unitById.get(watchedConversions[index]?.unitId ?? "");
                  const multiplier = watchedConversions[index]?.multiplierToBase;

                  return (
                    <div key={field.id} className="space-y-2 rounded-lg border p-2">
                      <div className="grid grid-cols-[1fr_100px_auto] items-center gap-2">
                        <select
                          className="h-10 rounded-md border px-2 text-sm outline-none ring-primary focus:ring-2"
                          disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                          {...form.register(`conversions.${index}.unitId`)}
                        >
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.code} ({unit.nameTh})
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          min={2}
                          step={1}
                          className="h-10 rounded-md border px-2 text-sm outline-none ring-primary focus:ring-2"
                          disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                          {...form.register(`conversions.${index}.multiplierToBase`)}
                        />

                        <button
                          type="button"
                          className="text-xs text-red-600"
                          onClick={() => remove(index)}
                          disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
                        >
                          ลบ
                        </button>
                      </div>

                      {selectedUnit && baseUnit && multiplier ? (
                        <p className="text-xs text-blue-700">
                          1 {selectedUnit.code} = {Number(multiplier).toLocaleString("th-TH")} {baseUnit.code}
                        </p>
                      ) : null}

                      <p className="text-xs text-red-600">
                        {form.formState.errors.conversions?.[index]?.unitId?.message ??
                          form.formState.errors.conversions?.[index]?.multiplierToBase?.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={loadingKey !== null || (mode === "create" ? !canCreate : !canUpdate)}
            >
              {loadingKey === "create" || loadingKey === `update-${editingProductId}`
                ? "กำลังบันทึก..."
                : mode === "create"
                  ? "บันทึกสินค้า"
                  : "บันทึกการแก้ไข"}
            </Button>
          </form>
        </article>
      ) : null}

      <section className="space-y-3">
        {filteredProducts.length === 0 ? (
          <article className="rounded-xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
            ไม่พบสินค้า
          </article>
        ) : null}

        {filteredProducts.map((product) => (
          <article key={product.id} className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                <h3 className="text-sm font-semibold">{product.name}</h3>
                <p className="text-xs text-muted-foreground">
                  หน่วยหลัก {product.baseUnitCode} ({product.baseUnitNameTh})
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                }`}
              >
                {product.active ? "ใช้งาน" : "ปิดใช้งาน"}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              ราคาขาย {product.priceBase.toLocaleString("th-TH")} / ต้นทุน {product.costBase.toLocaleString("th-TH")}
            </p>

            {product.conversions.length > 0 ? (
              <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                <p className="font-medium">ตัวอย่างการแปลงหน่วย</p>
                <ul className="mt-1 space-y-1">
                  {product.conversions.map((conversion) => (
                    <li key={`${product.id}-${conversion.unitId}`}>
                      1 {conversion.unitCode} = {conversion.multiplierToBase.toLocaleString("th-TH")} {product.baseUnitCode}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-medium text-blue-700 disabled:text-slate-400"
                onClick={() => beginEdit(product)}
                disabled={!canUpdate || loadingKey !== null}
              >
                แก้ไข
              </button>

              <button
                type="button"
                className="text-xs font-medium text-amber-700 disabled:text-slate-400"
                onClick={() => setActiveState(product, !product.active)}
                disabled={!canArchive || loadingKey !== null}
              >
                {loadingKey === `active-${product.id}`
                  ? "กำลังบันทึก..."
                  : product.active
                    ? "ปิดใช้งาน"
                    : "เปิดใช้งาน"}
              </button>
            </div>
          </article>
        ))}
      </section>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
