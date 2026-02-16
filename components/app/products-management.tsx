"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  ArrowUpDown,
  ChevronRight,
  Copy,
  ImageOff,
  ListFilter,
  Minus,
  Package,
  Pencil,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import type {
  CategoryItem,
  ProductListItem,
  UnitOption,
} from "@/lib/products/service";
import {
  type ProductUpsertFormInput,
  type ProductUpsertInput,
  productUpsertSchema,
} from "@/lib/products/validation";
import { currencySymbol, type StoreCurrency } from "@/lib/finance/store-financial";

/* ─── Types ─── */

type ProductsManagementProps = {
  products: ProductListItem[];
  units: UnitOption[];
  categories: CategoryItem[];
  currency: StoreCurrency;
  storeOutStockThreshold: number;
  storeLowStockThreshold: number;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canViewCost: boolean;
  canUpdateCost: boolean;
};

type StatusFilter = "all" | "active" | "inactive";
type SortOption = "newest" | "name-asc" | "name-desc" | "price-asc" | "price-desc";
type DetailTab = "info" | "price" | "cost" | "conversions";

/* ─── Helpers ─── */

const PRODUCT_PAGE_SIZE = 30;

const fmtNumber = (n: number) => n.toLocaleString("th-TH");
const fmtPrice = (n: number, cur: StoreCurrency) =>
  `${currencySymbol(cur)}${n.toLocaleString("th-TH")}`;

const defaultValues = (baseUnitId: string): ProductUpsertFormInput => ({
  sku: "",
  name: "",
  barcode: "",
  baseUnitId,
  priceBase: 0,
  costBase: 0,
  outStockThreshold: "",
  lowStockThreshold: "",
  categoryId: "",
  conversions: [],
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Main Component
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export function ProductsManagement({
  products: initialProducts,
  units,
  categories: initialCategories,
  currency,
  storeOutStockThreshold,
  storeLowStockThreshold,
  canCreate,
  canUpdate,
  canArchive,
  canViewCost,
  canUpdateCost,
}: ProductsManagementProps) {
  const router = useRouter();

  /* ── Data state ── */
  const [productItems, setProductItems] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);

  /* ── Filter / search ── */
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [productPage, setProductPage] = useState(1);

  /* ── Sheets ── */
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showScannerSheet, setShowScannerSheet] = useState(false);
  const [showScannerPermissionSheet, setShowScannerPermissionSheet] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const [scanContext, setScanContext] = useState<"search" | "form">("search");

  /* ── Form ── */
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  /* ── Detail ── */
  const [detailProduct, setDetailProduct] = useState<ProductListItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState(0);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const [detailContentHeight, setDetailContentHeight] = useState<number | null>(null);

  const getEffectiveStockThresholds = (product: ProductListItem) => {
    const outThreshold = product.outStockThreshold ?? storeOutStockThreshold;
    const lowThreshold = Math.max(
      product.lowStockThreshold ?? storeLowStockThreshold,
      outThreshold,
    );
    const hasOverride =
      product.outStockThreshold !== null || product.lowStockThreshold !== null;

    return {
      outThreshold,
      lowThreshold,
      badgeLabel: hasOverride ? "กำหนดเฉพาะสินค้า" : "ใช้ค่าร้าน",
    };
  };

  /* ── Units lookup ── */
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  /* ── Sync server data ── */
  useEffect(() => setProductItems(initialProducts), [initialProducts]);
  useEffect(() => setCategories(initialCategories), [initialCategories]);

  useLayoutEffect(() => {
    if (!detailContentRef.current) return;
    const nextHeight = detailContentRef.current.getBoundingClientRect().height;
    setDetailContentHeight(nextHeight);
  }, [detailTab, detailProduct, editingCost, costDraft]);

  useEffect(() => {
    const seen = window.localStorage.getItem("scanner-permission-seen") === "1";
    setHasSeenScannerPermission(seen);
  }, []);

  /* ── Filtering ── */
  const filteredProducts = useMemo(() => {
    let items = productItems;

    // Status filter
    if (statusFilter === "active") items = items.filter((p) => p.active);
    else if (statusFilter === "inactive") items = items.filter((p) => !p.active);

    // Category filter
    if (selectedCategoryId) {
      items = items.filter((p) => p.categoryId === selectedCategoryId);
    }

    // Search
    const keyword = deferredQuery.trim().toLowerCase();
    if (keyword) {
      items = items.filter((p) =>
        [p.sku, p.name, p.barcode ?? "", p.baseUnitCode]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      );
    }

    // Sort
    const sorted = [...items];
    switch (sortOption) {
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "th"));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.name.localeCompare(a.name, "th"));
        break;
      case "price-asc":
        sorted.sort((a, b) => a.priceBase - b.priceBase);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.priceBase - a.priceBase);
        break;
      case "newest":
      default:
        break; // already sorted by createdAt from server
    }

    return sorted;
  }, [deferredQuery, productItems, selectedCategoryId, statusFilter, sortOption]);

  /* ── Load-more ── */
  const visibleCount = productPage * PRODUCT_PAGE_SIZE;
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  );
  const hasMore = visibleCount < filteredProducts.length;

  /* ── Summary counters ── */
  const totalCount = productItems.length;
  const activeCount = productItems.filter((p) => p.active).length;
  const inactiveCount = totalCount - activeCount;

  /* ── Form setup ── */
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
  const baseUnit = unitById.get(baseUnitId);

  /* ── Image preview ── */
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  /* ─── Actions ─── */

  const beginCreate = () => {
    if (!canCreate) return;
    setMode("create");
    setEditingProductId(null);
    setImageFile(null);
    form.reset(defaultValues(units[0]?.id ?? ""));
    setShowCreateSheet(true);
  };

  const beginEdit = (product: ProductListItem) => {
    if (!canUpdate) return;
    setMode("edit");
    setEditingProductId(product.id);
    setImageFile(null);
    form.reset({
      sku: product.sku,
      name: product.name,
      barcode: product.barcode ?? "",
      baseUnitId: product.baseUnitId,
      priceBase: product.priceBase,
      costBase: product.costBase,
      outStockThreshold: product.outStockThreshold ?? "",
      lowStockThreshold: product.lowStockThreshold ?? "",
      categoryId: product.categoryId ?? "",
      conversions: product.conversions.map((c) => ({
        unitId: c.unitId,
        multiplierToBase: c.multiplierToBase,
      })),
    });
    setShowDetailSheet(false);
    setShowCreateSheet(true);
  };

  const openDetail = (product: ProductListItem) => {
    setDetailProduct(product);
    setDetailTab("info");
    setEditingCost(false);
    setCostDraft(product.costBase);
    setShowDetailSheet(true);
  };

  const closeCreateSheet = () => {
    setShowCreateSheet(false);
    setEditingProductId(null);
    setImageFile(null);
  };

  const duplicateProduct = (product: ProductListItem) => {
    if (!canCreate) return;
    setMode("create");
    setEditingProductId(null);
    setImageFile(null);
    form.reset({
      sku: `${product.sku}-COPY`,
      name: `${product.name} (สำเนา)`,
      barcode: "",
      baseUnitId: product.baseUnitId,
      priceBase: product.priceBase,
      costBase: product.costBase,
      outStockThreshold: product.outStockThreshold ?? "",
      lowStockThreshold: product.lowStockThreshold ?? "",
      categoryId: product.categoryId ?? "",
      conversions: product.conversions.map((c) => ({
        unitId: c.unitId,
        multiplierToBase: c.multiplierToBase,
      })),
    });
    setShowDetailSheet(false);
    setShowCreateSheet(true);
  };

  /* ── Submit product ── */
  const onSubmit = form.handleSubmit(async (values) => {
    const key = mode === "create" ? "create" : `update-${editingProductId}`;
    setLoadingKey(key);

    const prevProducts = productItems;

    // Optimistic update for edit
    if (mode === "edit" && editingProductId) {
      const selBaseUnit = unitById.get(values.baseUnitId);
      const nextConversions = values.conversions
        .flatMap((c) => {
          const u = unitById.get(c.unitId);
          return u
            ? [
                {
                  unitId: c.unitId,
                  unitCode: u.code,
                  unitNameTh: u.nameTh,
                  multiplierToBase: c.multiplierToBase,
                },
              ]
            : [];
        })
        .sort((a, b) => a.multiplierToBase - b.multiplierToBase);

      setProductItems((prev) =>
        prev.map((item) =>
          item.id === editingProductId
            ? {
                ...item,
                sku: values.sku,
                name: values.name,
                barcode: values.barcode?.trim() || null,
                baseUnitId: values.baseUnitId,
                baseUnitCode: selBaseUnit?.code ?? item.baseUnitCode,
                baseUnitNameTh: selBaseUnit?.nameTh ?? item.baseUnitNameTh,
                priceBase: values.priceBase,
                costBase: values.costBase,
                outStockThreshold: values.outStockThreshold ?? null,
                lowStockThreshold: values.lowStockThreshold ?? null,
                categoryId: values.categoryId?.trim() || null,
                categoryName:
                  categories.find((c) => c.id === values.categoryId)?.name ??
                  null,
                conversions: nextConversions,
              }
            : item,
        ),
      );
    }

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

    const data = (await response.json().catch(() => null)) as {
      message?: string;
      product?: ProductListItem;
    } | null;

    if (!response.ok) {
      setProductItems(prevProducts);
      toast.error(data?.message ?? "บันทึกสินค้าไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    // Upload image after create/update if selected
    const targetId = mode === "create" ? data?.product?.id : editingProductId;
    if (imageFile && targetId) {
      const fd = new FormData();
      fd.append("image", imageFile);
      const imgRes = await authFetch(`/api/products/${targetId}`, {
        method: "PATCH",
        body: fd,
      });
      if (!imgRes.ok) {
        toast.error("อัปโหลดรูปสินค้าไม่สำเร็จ");
      }
    }

    if (mode === "create" && data?.product) {
      setProductItems((prev) => [data.product!, ...prev]);
      setProductPage(1);
    }

    toast.success(
      mode === "create" ? "สร้างสินค้าเรียบร้อย" : "อัปเดตสินค้าเรียบร้อย",
    );
    setLoadingKey(null);
    closeCreateSheet();
    router.refresh();
  });

  /* ── Toggle active ── */
  const setActiveState = async (
    product: ProductListItem,
    nextActive: boolean,
  ) => {
    setLoadingKey(`active-${product.id}`);
    setProductItems((prev) =>
      prev.map((item) =>
        item.id === product.id ? { ...item, active: nextActive } : item,
      ),
    );

    const res = await authFetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", active: nextActive }),
    });

    if (!res.ok) {
      setProductItems((prev) =>
        prev.map((item) =>
          item.id === product.id ? { ...item, active: product.active } : item,
        ),
      );
      const d = await res.json().catch(() => null);
      toast.error(
        (d as { message?: string })?.message ?? "เปลี่ยนสถานะไม่สำเร็จ",
      );
    } else {
      toast.success(
        nextActive ? "เปิดใช้งานสินค้าแล้ว" : "ปิดใช้งานสินค้าแล้ว",
      );
      router.refresh();
    }

    setLoadingKey(null);
  };

  /* ── Update cost ── */
  const saveCost = async () => {
    if (!detailProduct) return;
    setLoadingKey(`cost-${detailProduct.id}`);

    const res = await authFetch(`/api/products/${detailProduct.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_cost", costBase: costDraft }),
    });

    if (!res.ok) {
      toast.error("บันทึกต้นทุนไม่สำเร็จ");
    } else {
      setProductItems((prev) =>
        prev.map((p) =>
          p.id === detailProduct.id ? { ...p, costBase: costDraft } : p,
        ),
      );
      setDetailProduct((prev) =>
        prev ? { ...prev, costBase: costDraft } : prev,
      );
      toast.success("อัปเดตต้นทุนเรียบร้อย");
      setEditingCost(false);
      router.refresh();
    }

    setLoadingKey(null);
  };

  /* ── Generate internal barcode ── */
  const generateBarcode = async () => {
    setLoadingKey("gen-barcode");
    try {
      const res = await authFetch("/api/products/generate-barcode", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "สร้างบาร์โค้ดไม่สำเร็จ");
        return;
      }
      form.setValue("barcode", data.barcode, { shouldDirty: true });
      toast.success(`สร้างบาร์โค้ด ${data.barcode} แล้ว`);
    } catch {
      toast.error("สร้างบาร์โค้ดไม่สำเร็จ");
    } finally {
      setLoadingKey(null);
    }
  };

  /* ── Print barcode label ── */
  const printBarcodeLabel = useCallback(
    (product: ProductListItem) => {
      if (!product.barcode) return;

      const printWindow = window.open("", "_blank", "width=420,height=320");
      if (!printWindow) {
        toast.error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ — กรุณาอนุญาต popup");
        return;
      }

      printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>พิมพ์บาร์โค้ด — ${product.name}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 50mm 30mm; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .label {
      width: 50mm; height: 30mm;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 1mm 2mm;
      page-break-after: always;
    }
    .product-name {
      font-size: 7pt; font-weight: 600;
      text-align: center; margin-bottom: 1mm;
      max-width: 46mm; overflow: hidden;
      white-space: nowrap; text-overflow: ellipsis;
    }
    .price {
      font-size: 8pt; font-weight: 700;
      margin-top: 0.5mm;
    }
    svg { max-width: 44mm; height: auto; }
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="product-name">${product.name}</div>
    <svg id="barcode"></svg>
    <div class="price">${fmtPrice(product.priceBase, currency)}</div>
  </div>
  <script>
    JsBarcode("#barcode", "${product.barcode}", {
      format: "${product.barcode.length === 13 ? "EAN13" : product.barcode.length === 8 ? "EAN8" : "CODE128"}",
      width: 1.5,
      height: 30,
      fontSize: 10,
      margin: 0,
      displayValue: true,
    });
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  <\/script>
</body>
</html>`);
      printWindow.document.close();
    },
    [currency],
  );

  /* ── Open scanner with context ── */
  const openScanner = useCallback((ctx: "search" | "form") => {
    setScanContext(ctx);
    if (hasSeenScannerPermission) {
      setShowScannerSheet(true);
    } else {
      setShowScannerPermissionSheet(true);
    }
  }, [hasSeenScannerPermission]);

  /* ── Barcode scan result ── */
  const handleBarcodeResult = useCallback(
    (barcode: string) => {
      setShowScannerSheet(false);

      // If scanning from within the form → just fill the field
      if (scanContext === "form") {
        form.setValue("barcode", barcode, { shouldDirty: true });
        toast.success(`ใส่บาร์โค้ด ${barcode} แล้ว`);
        return;
      }

      // Search existing products by barcode
      const found = productItems.find(
        (p) =>
          p.barcode === barcode ||
          p.sku.toLowerCase() === barcode.toLowerCase(),
      );

      if (found) {
        // Found → open detail sheet
        setDetailProduct(found);
        setDetailTab("info");
        setShowDetailSheet(true);
        return;
      }

      // Not found → ask to create new product with barcode
      if (canCreate) {
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <span className="text-sm">
                ไม่พบสินค้า <strong>{barcode}</strong>
              </span>
              <button
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => {
                  toast.dismiss(t.id);
                  setMode("create");
                  setEditingProductId(null);
                  setImageFile(null);
                  setImagePreview(null);
                  form.reset({
                    ...defaultValues(units[0]?.id ?? ""),
                    barcode,
                  });
                  setShowCreateSheet(true);
                }}
              >
                + สร้างสินค้า
              </button>
            </div>
          ),
          { duration: 6000 },
        );
      } else {
        toast.error(`ไม่พบสินค้าที่มีบาร์โค้ด "${barcode}"`);
      }
    },
    [productItems, canCreate, units, form, scanContext],
  );

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * RENDER
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  return (
    <section className="space-y-3 pb-24">
      {/* ── Summary strip (clickable status filter) ── */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: "all" as StatusFilter, count: totalCount, label: "ทั้งหมด", color: "text-slate-900" },
          { key: "active" as StatusFilter, count: activeCount, label: "ใช้งาน", color: "text-emerald-600" },
          { key: "inactive" as StatusFilter, count: inactiveCount, label: "ปิดใช้งาน", color: "text-slate-400" },
        ]).map((card) => (
          <button
            key={card.key}
            type="button"
            className={`rounded-xl border p-3 text-center shadow-sm transition-colors ${
              statusFilter === card.key
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                : "border-slate-200 bg-white"
            }`}
            onClick={() => {
              setStatusFilter(statusFilter === card.key ? "all" : card.key);
              setProductPage(1);
            }}
          >
            <p className={`text-lg font-bold ${card.color}`}>
              {fmtNumber(card.count)}
            </p>
            <p className="text-[11px] text-muted-foreground">{card.label}</p>
          </button>
        ))}
      </div>

      {/* ── Sticky search bar ── */}
      <div className="sticky top-0 z-10 -mx-1 bg-slate-50/90 px-1 py-1 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setProductPage(1);
              }}
              placeholder="ค้นหา SKU, ชื่อ, บาร์โค้ด"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100"
            onClick={() => openScanner("search")}
            aria-label="สแกนบาร์โค้ด"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>

          {/* Desktop CTA — inline button */}
          {canCreate && (
            <button
              type="button"
              onClick={beginCreate}
              disabled={loadingKey !== null}
              className="hidden h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.98] sm:inline-flex"
            >
              <Plus className="h-4 w-4" />
              เพิ่มสินค้า
            </button>
          )}
        </div>
      </div>

      {/* ── Filter & sort bar ── */}
      <div className="flex items-center gap-2">
        {/* Category dropdown */}
        <div className="relative flex items-center">
          <ListFilter className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
          <select
            value={selectedCategoryId ?? ""}
            onChange={(e) => {
              setSelectedCategoryId(e.target.value || null);
              setProductPage(1);
            }}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-7 text-xs text-slate-700 outline-none ring-blue-500 focus:ring-1"
          >
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.productCount})
              </option>
            ))}
          </select>
        </div>

        {/* Sort dropdown */}
        <div className="relative flex items-center">
          <ArrowUpDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
          <select
            value={sortOption}
            onChange={(e) => {
              setSortOption(e.target.value as SortOption);
              setProductPage(1);
            }}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-7 text-xs text-slate-700 outline-none ring-blue-500 focus:ring-1"
          >
            <option value="newest">ใหม่สุด</option>
            <option value="name-asc">ชื่อ A→Z</option>
            <option value="name-desc">ชื่อ Z→A</option>
            <option value="price-asc">ราคา ต่ำ→สูง</option>
            <option value="price-desc">ราคา สูง→ต่ำ</option>
          </select>
        </div>

        {/* Result count */}
        <span className="text-[11px] text-muted-foreground">
          {fmtNumber(filteredProducts.length)}
        </span>
      </div>

      {/* ── Product list ── */}
      <div className="space-y-2">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-white py-12 text-center shadow-sm">
            <Package className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              {query || selectedCategoryId || statusFilter !== "all"
                ? "ไม่พบสินค้าที่ตรงกัน"
                : "ยังไม่มีสินค้า"}
            </p>
            {!query && !selectedCategoryId && statusFilter === "all" && canCreate && (
              <Button
                type="button"
                className="h-9 rounded-lg text-xs"
                onClick={beginCreate}
              >
                <Plus className="mr-1 h-4 w-4" />
                เพิ่มสินค้าแรก
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors active:bg-slate-50"
                onClick={() => openDetail(product)}
              >
                {/* Thumbnail */}
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {product.sku}
                    {product.categoryName ? ` · ${product.categoryName}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Barcode: {product.barcode ?? "—"}
                  </p>
                </div>

                {/* Price + Status */}
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {fmtPrice(product.priceBase, currency)}
                  </p>
                  <span
                    className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      product.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {product.active ? "ใช้งาน" : "ปิด"}
                  </span>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {/* ── Load more ── */}
        {hasMore && (
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl text-xs"
            onClick={() => setProductPage((p) => p + 1)}
          >
            โหลดเพิ่มเติม ({fmtNumber(filteredProducts.length - visibleCount)} รายการ)
          </Button>
        )}
      </div>

      {/* ── FAB — Create product (mobile only) ── */}
      {canCreate && (
        <button
          type="button"
          onClick={beginCreate}
          disabled={loadingKey !== null}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform active:scale-95 sm:hidden"
          aria-label="เพิ่มสินค้า"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Create / Edit
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showCreateSheet}
        onClose={closeCreateSheet}
        title={mode === "create" ? "เพิ่มสินค้าใหม่" : "แก้ไขสินค้า"}
        disabled={loadingKey !== null}
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          {/* Image picker */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition-colors hover:border-blue-400"
              onClick={() => imageInputRef.current?.click()}
            >
              {imagePreview ? (
                <Image
                  src={imagePreview}
                  alt="Preview"
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-slate-400">
                  <Package className="h-5 w-5" />
                  <span className="text-[10px]">เพิ่มรูป</span>
                </div>
              )}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImageFile(f);
              }}
            />
            <p className="text-xs text-muted-foreground">
              รูปสินค้า (ไม่บังคับ)
              <br />
              สูงสุด 3 MB · จะถูกปรับเป็น 640px WebP
            </p>
            {imageFile && (
              <button
                type="button"
                className="shrink-0 rounded-lg border border-red-200 p-1.5 text-red-500 transition-colors hover:bg-red-50"
                onClick={() => {
                  setImageFile(null);
                  if (imageInputRef.current) imageInputRef.current.value = "";
                }}
                aria-label="ลบรูปที่เลือก"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* SKU + Name */}
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-slate-700"
              htmlFor="pf-sku"
            >
              SKU
            </label>
            <input
              id="pf-sku"
              className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
              disabled={loadingKey !== null}
              {...form.register("sku")}
            />
            {form.formState.errors.sku && (
              <p className="text-xs text-red-600">
                {form.formState.errors.sku.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              className="text-xs font-medium text-slate-700"
              htmlFor="pf-name"
            >
              ชื่อสินค้า
            </label>
            <input
              id="pf-name"
              className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
              disabled={loadingKey !== null}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Barcode */}
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-slate-700"
              htmlFor="pf-barcode"
            >
              บาร์โค้ด (ถ้ามี)
            </label>
            <div className="flex gap-2">
              <input
                id="pf-barcode"
                className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("barcode")}
              />
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
                onClick={() => openScanner("form")}
                disabled={loadingKey !== null}
                aria-label="สแกนบาร์โค้ดใส่ช่อง"
              >
                <ScanBarcode className="h-4 w-4" />
              </button>
              {!form.watch("barcode")?.trim() && (
                <button
                  type="button"
                  className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100"
                  onClick={generateBarcode}
                  disabled={loadingKey !== null}
                  title="สร้างบาร์โค้ดภายในร้าน (EAN-13)"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  สร้าง
                </button>
              )}
            </div>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-category"
              >
                หมวดหมู่
              </label>
              <select
                id="pf-category"
                className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("categoryId")}
              >
                <option value="">— ไม่ระบุ —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Unit + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-unit"
              >
                หน่วยหลัก
              </label>
              <select
                id="pf-unit"
                className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("baseUnitId")}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} ({u.nameTh})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-price"
              >
                ราคาขาย/{baseUnit?.code ?? "หน่วย"}
              </label>
              <input
                id="pf-price"
                type="number"
                min={0}
                step={1}
                className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("priceBase")}
              />
              {form.formState.errors.priceBase && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.priceBase.message}
                </p>
              )}
            </div>
          </div>

          {/* Stock threshold overrides */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">
              ตั้งค่าแจ้งเตือนสต็อก (Override)
            </p>
            <p className="text-[11px] text-muted-foreground">
              เว้นว่างเพื่อใช้ค่าตั้งต้นของร้าน: หมด ≤ {fmtNumber(storeOutStockThreshold)},
              ต่ำ ≤ {fmtNumber(storeLowStockThreshold)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-slate-700"
                  htmlFor="pf-out-threshold"
                >
                  สต็อกหมด (≤)
                </label>
                <input
                  id="pf-out-threshold"
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                  disabled={loadingKey !== null}
                  placeholder={`${storeOutStockThreshold}`}
                  {...form.register("outStockThreshold")}
                />
                {form.formState.errors.outStockThreshold && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.outStockThreshold.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-slate-700"
                  htmlFor="pf-low-threshold"
                >
                  สต็อกต่ำ (≤)
                </label>
                <input
                  id="pf-low-threshold"
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                  disabled={loadingKey !== null}
                  placeholder={`${storeLowStockThreshold}`}
                  {...form.register("lowStockThreshold")}
                />
                {form.formState.errors.lowStockThreshold && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.lowStockThreshold.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Conversions */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-700">
                การแปลงหน่วย
              </p>
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loadingKey !== null}
                onClick={() =>
                  append({ unitId: units[0]?.id ?? "", multiplierToBase: 2 })
                }
              >
                + เพิ่มหน่วย
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              หน่วยหลัก:{" "}
              {baseUnit ? `${baseUnit.code} (${baseUnit.nameTh})` : "-"}
            </p>

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                ยังไม่มีหน่วยแปลง
              </p>
            )}

            {fields.map((field, idx) => {
              const selUnit = unitById.get(
                watchedConversions[idx]?.unitId ?? "",
              );
              const mult = watchedConversions[idx]?.multiplierToBase;

              return (
                <div key={field.id} className="space-y-1 rounded-lg border p-2">
                  <div className="grid grid-cols-[1fr_80px_auto] items-center gap-2">
                    <select
                      className="h-9 rounded-md border px-2 text-sm outline-none ring-blue-500 focus:ring-2"
                      disabled={loadingKey !== null}
                      {...form.register(`conversions.${idx}.unitId`)}
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} ({u.nameTh})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={2}
                      step={1}
                      className="h-9 rounded-md border px-2 text-sm outline-none ring-blue-500 focus:ring-2"
                      disabled={loadingKey !== null}
                      {...form.register(
                        `conversions.${idx}.multiplierToBase`,
                      )}
                    />
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => remove(idx)}
                      disabled={loadingKey !== null}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                  </div>

                  {selUnit && baseUnit && mult ? (
                    <p className="text-[11px] text-blue-700">
                      1 {selUnit.code} ={" "}
                      {Number(mult).toLocaleString("th-TH")} {baseUnit.code}
                    </p>
                  ) : null}

                  {form.formState.errors.conversions?.[idx] && (
                    <p className="text-xs text-red-600">
                      {form.formState.errors.conversions[idx]?.unitId
                        ?.message ??
                        form.formState.errors.conversions[idx]
                          ?.multiplierToBase?.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Spacer so content doesn't hide behind sticky button */}
          <div className="h-16" />

          {/* Sticky Submit */}
          <div className="sticky bottom-0 -mx-4 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
            <Button
              type="submit"
              className="relative h-11 w-full rounded-xl text-sm"
              disabled={loadingKey !== null}
            >
              {loadingKey === "create" ||
              loadingKey === `update-${editingProductId}`
                ? "กำลังบันทึก..."
                : mode === "create"
                  ? "บันทึกสินค้า"
                  : "บันทึกการแก้ไข"}
              {Object.keys(form.formState.errors).length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {Object.keys(form.formState.errors).length}
                </span>
              )}
            </Button>
          </div>
        </form>
      </SlideUpSheet>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Product Detail
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showDetailSheet}
        onClose={() => setShowDetailSheet(false)}
        title={detailProduct?.name ?? "รายละเอียดสินค้า"}
        description={detailProduct ? `SKU: ${detailProduct.sku}` : undefined}
        disabled={loadingKey !== null}
      >
        {detailProduct && (
          <div className="space-y-4">
            {/* Product image + actions */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-40 w-40 overflow-hidden rounded-xl bg-slate-100">
                {detailProduct.imageUrl ? (
                  <Image
                    src={detailProduct.imageUrl}
                    alt={detailProduct.name}
                    fill
                    className="object-cover"
                    sizes="160px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                    <Package className="h-12 w-12" />
                  </div>
                )}
              </div>
              {canUpdate && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                    onClick={() => {
                      // open edit sheet to change image
                      beginEdit(detailProduct);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    เปลี่ยนรูป
                  </button>
                  {detailProduct.imageUrl && (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                      disabled={loadingKey !== null}
                      onClick={async () => {
                        setLoadingKey(`remove-img-${detailProduct.id}`);
                        const res = await authFetch(
                          `/api/products/${detailProduct.id}`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "remove_image" }),
                          },
                        );
                        if (res.ok) {
                          setProductItems((prev) =>
                            prev.map((p) =>
                              p.id === detailProduct.id
                                ? { ...p, imageUrl: null }
                                : p,
                            ),
                          );
                          setDetailProduct((prev) =>
                            prev ? { ...prev, imageUrl: null } : prev,
                          );
                          toast.success("ลบรูปสินค้าแล้ว");
                          router.refresh();
                        } else {
                          toast.error("ลบรูปไม่สำเร็จ");
                        }
                        setLoadingKey(null);
                      }}
                    >
                      <ImageOff className="h-3 w-3" />
                      ลบรูป
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { key: "info", label: "ข้อมูล" },
                  { key: "price", label: "ราคา" },
                  ...(canViewCost
                    ? [{ key: "cost" as DetailTab, label: "ต้นทุน 🔒" }]
                    : []),
                  { key: "conversions", label: "หน่วยแปลง" },
                ] as { key: DetailTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    detailTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                  onClick={() => {
                    setDetailTab(tab.key);
                    if (tab.key === "cost") {
                      setCostDraft(detailProduct.costBase);
                      setEditingCost(false);
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              className="overflow-hidden transition-[height] duration-300 ease-out"
              style={{
                height: detailContentHeight ? `${detailContentHeight}px` : "auto",
              }}
            >
              <div ref={detailContentRef}>
                {/* Tab — ข้อมูล */}
                {detailTab === "info" && (
                  <div className="space-y-3">
                    <InfoRow label="ชื่อ" value={detailProduct.name} />
                    <InfoRow label="SKU" value={detailProduct.sku} />
                    <InfoRow
                      label="บาร์โค้ด"
                      value={detailProduct.barcode ?? "—"}
                    />
                    <InfoRow
                      label="หมวดหมู่"
                      value={detailProduct.categoryName ?? "— ไม่ระบุ —"}
                    />
                    <InfoRow
                      label="หน่วยหลัก"
                      value={`${detailProduct.baseUnitCode} (${detailProduct.baseUnitNameTh})`}
                    />
                    <InfoRow
                      label="สถานะ"
                      value={detailProduct.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    />

                    {(() => {
                      const thresholds = getEffectiveStockThresholds(detailProduct);
                      return (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-700">
                              เกณฑ์แจ้งเตือนสต็อก
                            </p>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {thresholds.badgeLabel}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">สต็อกหมด (≤)</span>
                              <span className="font-semibold text-slate-900">
                                {thresholds.outThreshold.toLocaleString("th-TH")}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">สต็อกต่ำ (≤)</span>
                              <span className="font-semibold text-slate-900">
                                {thresholds.lowThreshold.toLocaleString("th-TH")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2 pt-2">
                      {canUpdate && (
                        <Button
                          variant="outline"
                          className="h-9 flex-1 rounded-lg text-xs"
                          onClick={() => beginEdit(detailProduct)}
                          disabled={loadingKey !== null}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          แก้ไข
                        </Button>
                      )}
                      {canCreate && (
                        <Button
                          variant="outline"
                          className="h-9 flex-1 rounded-lg text-xs"
                          onClick={() => duplicateProduct(detailProduct)}
                          disabled={loadingKey !== null}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          สำเนา
                        </Button>
                      )}
                      {canArchive && (
                        <Button
                          variant={detailProduct.active ? "outline" : "default"}
                          className="h-9 flex-1 rounded-lg text-xs"
                          onClick={() => {
                            setActiveState(detailProduct, !detailProduct.active);
                            setShowDetailSheet(false);
                          }}
                          disabled={loadingKey !== null}
                        >
                          {detailProduct.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        </Button>
                      )}
                    </div>

                    {/* Print barcode */}
                    {detailProduct.barcode && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full rounded-lg text-xs"
                        onClick={() => printBarcodeLabel(detailProduct)}
                      >
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                        พิมพ์บาร์โค้ด
                      </Button>
                    )}
                  </div>
                )}

                {/* Tab — ราคา */}
                {detailTab === "price" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-blue-50 p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">
                        {fmtPrice(detailProduct.priceBase, currency)}
                      </p>
                      <p className="text-xs text-blue-600">
                        ราคาขาย / {detailProduct.baseUnitCode}
                      </p>
                    </div>
                    {detailProduct.conversions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-700">
                          ราคาตามหน่วยแปลง
                        </p>
                        {detailProduct.conversions.map((c) => (
                          <div
                            key={c.unitId}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                          >
                            <span className="text-xs text-slate-600">
                              {c.unitCode} ({c.unitNameTh})
                            </span>
                            <span className="text-sm font-semibold">
                              {fmtPrice(
                                detailProduct.priceBase * c.multiplierToBase,
                                currency,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab — ต้นทุน 🔒 */}
                {detailTab === "cost" && canViewCost && (
                  <div className="space-y-3">
                    {editingCost ? (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700">
                          ต้นทุน / {detailProduct.baseUnitCode}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={costDraft}
                          onChange={(e) => setCostDraft(Number(e.target.value))}
                          className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 flex-1 text-xs"
                            onClick={() => setEditingCost(false)}
                            disabled={loadingKey !== null}
                          >
                            ยกเลิก
                          </Button>
                          <Button
                            type="button"
                            className="h-9 flex-1 text-xs"
                            onClick={saveCost}
                            disabled={loadingKey !== null}
                          >
                            {loadingKey === `cost-${detailProduct.id}`
                              ? "กำลังบันทึก..."
                              : "บันทึก"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Price vs Cost comparison */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-blue-50 p-3 text-center">
                            <p className="text-lg font-bold text-blue-700">
                              {fmtPrice(detailProduct.priceBase, currency)}
                            </p>
                            <p className="text-[10px] text-blue-500">
                              ราคาขาย / {detailProduct.baseUnitCode}
                            </p>
                          </div>
                          <div className="rounded-xl bg-amber-50 p-3 text-center">
                            <p className="text-lg font-bold text-amber-700">
                              {fmtPrice(detailProduct.costBase, currency)}
                            </p>
                            <p className="text-[10px] text-amber-500">
                              ต้นทุน / {detailProduct.baseUnitCode}
                            </p>
                          </div>
                        </div>

                        {/* Profit summary */}
                        {detailProduct.priceBase > 0 && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">กำไร/หน่วยหลัก</span>
                              <span className="text-sm font-semibold text-emerald-700">
                                {fmtPrice(
                                  detailProduct.priceBase -
                                    detailProduct.costBase,
                                  currency,
                                )}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-xs text-slate-500">อัตรากำไร</span>
                              <span className="text-sm font-semibold text-emerald-700">
                                {detailProduct.costBase > 0
                                  ? `${(((detailProduct.priceBase - detailProduct.costBase) / detailProduct.costBase) * 100).toFixed(1)}%`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        )}

                        {canUpdateCost && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 w-full text-xs"
                            onClick={() => setEditingCost(true)}
                            disabled={loadingKey !== null}
                          >
                            แก้ไขต้นทุน
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Tab — หน่วยแปลง */}
                {detailTab === "conversions" && (
                  <div className="space-y-2">
                    {detailProduct.conversions.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        ไม่มีหน่วยแปลง
                      </p>
                    ) : (
                      detailProduct.conversions.map((c) => (
                        <div
                          key={c.unitId}
                          className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                        >
                          <span className="text-sm font-medium">
                            {c.unitCode} ({c.unitNameTh})
                          </span>
                          <span className="text-xs text-muted-foreground">
                            1 {c.unitCode} = {fmtNumber(c.multiplierToBase)}{" "}
                            {detailProduct.baseUnitCode}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SlideUpSheet>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Barcode Scanner
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
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
                window.localStorage.setItem("scanner-permission-seen", "1");
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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Barcode Scanner
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showScannerSheet}
        onClose={() => setShowScannerSheet(false)}
        title="สแกนบาร์โค้ด"
        description="ส่องกล้องไปที่บาร์โค้ดสินค้า"
      >
        <BarcodeScanner
          isOpen={showScannerSheet}
          onResult={handleBarcodeResult}
          onClose={() => setShowScannerSheet(false)}
        />
      </SlideUpSheet>
    </section>
  );
}

/* ─── InfoRow ─── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

/* ─── BarcodeScanner ─── */

function BarcodeScanner({
  isOpen,
  onResult,
  onClose,
}: {
  isOpen: boolean;
  onResult: (barcode: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<import("@zxing/browser").BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<import("@zxing/browser").IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "opening" | "scanning" | "paused" | "no-permission" | "no-camera" | "error"
  >("opening");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [manualBarcode, setManualBarcode] = useState("");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
  };

  type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
    torch?: boolean;
    zoom?: { min: number; max: number; step: number };
  };

  const safeStop = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    stopStream();
  }, []);

  const refreshDevices = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    const cams = list.filter((d) => d.kind === "videoinput");
    setDevices(cams);
    return cams;
  }, []);

  const syncCapabilities = useCallback((track: MediaStreamTrack) => {
    const caps = (track.getCapabilities?.() as ExtendedMediaTrackCapabilities | null) ?? null;
    if (caps && "torch" in caps) {
      setTorchSupported(Boolean(caps.torch));
    } else {
      setTorchSupported(false);
    }
    if (caps && "zoom" in caps) {
      const zoomCaps = caps.zoom;
      if (zoomCaps) {
        setZoomRange({
          min: zoomCaps.min ?? 1,
          max: zoomCaps.max ?? 1,
          step: zoomCaps.step ?? 0.1,
        });
        const current = track.getSettings?.().zoom as number | undefined;
        if (typeof current === "number") setZoom(current);
      }
    } else {
      setZoomRange(null);
    }
  }, []);

  const startScanner = useCallback(async (deviceId?: string) => {
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

      const track = stream.getVideoTracks()[0];
      trackRef.current = track ?? null;
      if (track) {
        const settings = track.getSettings?.();
        if (settings?.deviceId) {
          setActiveDeviceId(settings.deviceId);
          window.localStorage.setItem("scanner-camera-id", settings.deviceId);
        }
        syncCapabilities(track);
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
      codeReaderRef.current = reader;

      if (!scannerRef.current) return;

      const controls = await reader.decodeFromStream(
        stream,
        scannerRef.current,
        (result) => {
          if (!result) return;
          safeStop();
          onResult(result.getText());
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("no-permission");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatus("no-camera");
      } else {
        setStatus("error");
      }
      setError("ไม่สามารถเปิดกล้องได้ — กรุณาพิมพ์บาร์โค้ดด้านล่าง");
      safeStop();
    }
  }, [onResult, refreshDevices, safeStop, syncCapabilities]);

  useEffect(() => {
    if (!isOpen) {
      safeStop();
      setStatus("paused");
      return;
    }

    let mounted = true;
    const storedDeviceId = window.localStorage.getItem("scanner-camera-id");
    if (mounted) {
      startScanner(storedDeviceId || undefined);
    }

    return () => {
      mounted = false;
      safeStop();
      codeReaderRef.current = null;
    };
  }, [isOpen, safeStop, startScanner]);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-full max-w-sm">
        <video
          ref={scannerRef}
          className="mx-auto aspect-[3/2] w-full rounded-xl bg-black"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[46%] w-[80%] rounded-lg border-2 border-blue-400/80" />
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        วางบาร์โค้ดให้อยู่กลางกรอบและมีแสงสว่างเพียงพอ
      </p>

      {status === "opening" && (
        <p className="text-center text-xs text-slate-500">กำลังเปิดกล้อง...</p>
      )}
      {status === "no-permission" && (
        <p className="text-center text-xs text-amber-600">
          ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณาเปิดสิทธิ์ในเบราว์เซอร์
        </p>
      )}
      {status === "no-camera" && (
        <p className="text-center text-xs text-amber-600">ไม่พบกล้องในอุปกรณ์นี้</p>
      )}
      {status === "error" && error && (
        <p className="text-center text-xs text-amber-600">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              onClick={async () => {
                if (devices.length <= 1) return;
                const currentIndex = Math.max(
                  0,
                  devices.findIndex((d) => d.deviceId === activeDeviceId),
                );
                const next = devices[(currentIndex + 1) % devices.length];
                safeStop();
                setActiveDeviceId(next?.deviceId ?? null);
                await startScanner(next?.deviceId);
              }}
            >
              สลับกล้อง
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1"
            onClick={async () => {
              if (status === "paused") {
                await startScanner(activeDeviceId ?? undefined);
              } else {
                safeStop();
                setStatus("paused");
              }
            }}
          >
            {status === "paused" ? "เปิดกล้อง" : "พักกล้อง"}
          </Button>
        </div>

        {torchSupported && (
          <Button
            type="button"
            variant={torchOn ? "default" : "outline"}
            className="h-10 w-full"
            onClick={async () => {
              const track = trackRef.current;
              if (!track) return;
              try {
                await track.applyConstraints({
                  advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
                });
                setTorchOn((prev) => !prev);
              } catch {
                setTorchSupported(false);
              }
            }}
          >
            {torchOn ? "ปิดไฟแฟลช" : "เปิดไฟแฟลช"}
          </Button>
        )}

        {zoomRange && (
          <div className="rounded-lg border px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>ซูม</span>
              <span>{zoom.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={async (e) => {
                const next = Number(e.target.value);
                setZoom(next);
                const track = trackRef.current;
                if (!track) return;
                try {
                  await track.applyConstraints({
                    advanced: [{ zoom: next } as MediaTrackConstraintSet],
                  });
                } catch {
                  setZoomRange(null);
                }
              }}
              className="mt-2 w-full"
            />
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="พิมพ์บาร์โค้ดด้วยมือ"
            className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualBarcode.trim()) {
                safeStop();
                onResult(manualBarcode.trim());
              }
            }}
          />
          <Button
            type="button"
            className="h-10"
            disabled={!manualBarcode.trim()}
            onClick={() => {
              safeStop();
              onResult(manualBarcode.trim());
            }}
          >
            ค้นหา
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => {
            safeStop();
            onClose();
          }}
        >
          ปิดสแกนเนอร์
        </Button>
      </div>
    </div>
  );
}
