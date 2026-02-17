"use client";

import {
  Clock,
  Download,
  Loader2,
  Package,
  Pencil,
  Plus,
  Share2,
  ShoppingCart,
  Truck,
  CheckCircle2,
  XCircle,
  FileText,
  X,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import type { StoreCurrency } from "@/lib/finance/store-financial";
import { currencySymbol } from "@/lib/finance/store-financial";
import type { POPdfData } from "@/lib/pdf/generate-po-pdf";
import type { PoPdfConfig } from "@/lib/pdf/generate-po-pdf";
import { canNativeShare } from "@/lib/pdf/share-or-download";
import type { PurchaseOrderListItem } from "@/server/repositories/purchase.repo";

/* ── Status config ── */
const statusConfig: Record<
  PurchaseOrderListItem["status"],
  { label: string; icon: typeof Clock; badgeClass: string }
> = {
  DRAFT: {
    label: "ร่าง",
    icon: FileText,
    badgeClass: "bg-slate-100 text-slate-600",
  },
  ORDERED: {
    label: "สั่งแล้ว",
    icon: ShoppingCart,
    badgeClass: "bg-amber-100 text-amber-700",
  },
  SHIPPED: {
    label: "กำลังจัดส่ง",
    icon: Truck,
    badgeClass: "bg-blue-100 text-blue-700",
  },
  RECEIVED: {
    label: "รับแล้ว",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  CANCELLED: {
    label: "ยกเลิก",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-600",
  },
};

type PurchaseOrderListProps = {
  purchaseOrders: PurchaseOrderListItem[];
  storeCurrency: StoreCurrency;
  canCreate: boolean;
  pageSize: number;
  initialHasMore: boolean;
  storeLogoUrl?: string | null;
  pdfConfig?: Partial<PoPdfConfig>;
};

type StatusFilter = "ALL" | PurchaseOrderListItem["status"];

function fmtPrice(amount: number, currency: StoreCurrency): string {
  return `${currencySymbol(currency)}${amount.toLocaleString("th-TH")}`;
}

function daysUntil(dateStr: string): number {
  const targetDate = new Date(dateStr);
  const now = new Date();
  return Math.ceil(
    (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: undefined,
  });
}

export function PurchaseOrderList({
  purchaseOrders: initialList,
  storeCurrency,
  canCreate,
  pageSize,
  initialHasMore,
  storeLogoUrl,
  pdfConfig,
}: PurchaseOrderListProps) {
  const router = useRouter();
  const [poList, setPoList] = useState(initialList);
  const [poPage, setPoPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<string | null>(null);

  /* ── Create wizard state ── */
  const [wizardStep, setWizardStep] = useState(1);

  /* ── Create form ── */
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] =
    useState<StoreCurrency>(storeCurrency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [items, setItems] = useState<
    { productId: string; productName: string; qtyOrdered: string; unitCostPurchase: string }[]
  >([]);
  const [shippingCost, setShippingCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [otherCostNote, setOtherCostNote] = useState("");
  const [note, setNote] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Product search for item picker ── */
  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<
    { id: string; name: string; sku: string }[]
  >([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  /* ── Filtered list ── */
  const filteredList = useMemo(() => {
    if (statusFilter === "ALL") return poList;
    return poList.filter((po) => po.status === statusFilter);
  }, [poList, statusFilter]);

  const loadPurchaseOrders = useCallback(
    async (page: number, replace = false) => {
      const res = await authFetch(
        `/api/stock/purchase-orders?page=${page}&pageSize=${pageSize}`,
      );
      const data = await res.json();
      if (res.ok && data?.purchaseOrders) {
        setPoList((prev) =>
          replace ? data.purchaseOrders : [...prev, ...data.purchaseOrders],
        );
        setPoPage(page);
        setHasMore(Boolean(data.hasMore));
      }
    },
    [pageSize],
  );

  const reloadFirstPage = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      await loadPurchaseOrders(1, true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [loadPurchaseOrders]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      await loadPurchaseOrders(poPage + 1, false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, loadPurchaseOrders, poPage]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  /* ── Load products for item picker ── */
  const loadProducts = useCallback(async () => {
    if (productOptions.length > 0) return;
    setLoadingProducts(true);
    try {
      const res = await authFetch("/api/stock/movements");
      const data = await res.json();
      if (data.ok && data.products) {
        setProductOptions(
          data.products.map((p: { productId: string; name: string; sku: string }) => ({
            id: p.productId,
            name: p.name,
            sku: p.sku,
          })),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingProducts(false);
    }
  }, [productOptions.length]);

  /* ── Open/close ── */
  const openCreateSheet = () => {
    setSupplierName("");
    setSupplierContact("");
    setPurchaseCurrency(storeCurrency);
    setExchangeRate("1");
    setItems([]);
    setShippingCost("0");
    setOtherCost("0");
    setOtherCostNote("");
    setNote("");
    setExpectedAt("");
    setWizardStep(1);
    setIsCreateOpen(true);
    loadProducts();
  };

  const closeCreateSheet = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
  };

  /* ── Add item ── */
  const addItem = (product: { id: string; name: string }) => {
    if (items.some((i) => i.productId === product.id)) {
      toast.error("สินค้านี้เพิ่มไปแล้ว");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        qtyOrdered: "1",
        unitCostPurchase: "0",
      },
    ]);
    setProductSearch("");
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const updateItem = (
    productId: string,
    field: "qtyOrdered" | "unitCostPurchase",
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, [field]: value } : i)),
    );
  };

  /* ── Computed totals ── */
  const rate = Number(exchangeRate) || 1;
  const effectiveRate = purchaseCurrency === storeCurrency ? 1 : rate;
  const itemsTotalPurchase = items.reduce(
    (sum, i) => sum + (Number(i.qtyOrdered) || 0) * (Number(i.unitCostPurchase) || 0),
    0,
  );
  const itemsTotalBase = Math.round(itemsTotalPurchase * effectiveRate);
  const shipping = Number(shippingCost) || 0;
  const other = Number(otherCost) || 0;
  const grandTotal = itemsTotalBase + shipping + other;

  /* ── Submit ── */
  const submitPO = async (receiveImmediately: boolean) => {
    if (items.length === 0) {
      toast.error("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await authFetch("/api/stock/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName || undefined,
          supplierContact: supplierContact || undefined,
          purchaseCurrency,
          exchangeRate: effectiveRate,
          shippingCost: shipping,
          otherCost: other,
          otherCostNote: otherCostNote || undefined,
          note: note || undefined,
          expectedAt: expectedAt || undefined,
          receiveImmediately,
          items: items.map((i) => ({
            productId: i.productId,
            qtyOrdered: Number(i.qtyOrdered) || 1,
            unitCostPurchase: Number(i.unitCostPurchase) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "สร้างใบสั่งซื้อไม่สำเร็จ");
        return;
      }
      toast.success(
        receiveImmediately
          ? "สร้างใบสั่งซื้อ + รับสินค้าเรียบร้อย"
          : "สร้างใบสั่งซื้อเรียบร้อย",
      );
      setIsCreateOpen(false);
      await reloadFirstPage();
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Update PO status ── */
  const updateStatus = async (
    poId: string,
    status: "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED",
  ) => {
    try {
      const res = await authFetch(`/api/stock/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "อัปเดตสถานะไม่สำเร็จ");
        return;
      }
      toast.success(`อัปเดตสถานะเป็น "${statusConfig[status].label}" เรียบร้อย`);
      await reloadFirstPage();
      setSelectedPO(null);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
    }
  };

  /* ── Style helpers ── */
  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  const filteredProductOptions = productOptions.filter(
    (p) =>
      !items.some((i) => i.productId === p.id) &&
      (productSearch === "" ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())),
  );

  /* ── Status counts for badges ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: poList.length };
    for (const po of poList) {
      counts[po.status] = (counts[po.status] ?? 0) + 1;
    }
    return counts;
  }, [poList]);

  return (
    <div className="space-y-3">
      {/* ── Header row: title + "+" button ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">ใบสั่งซื้อ</h2>
          <p className="text-[11px] text-slate-500">
            {poList.length > 0 ? `${poList.length} รายการ` : "ยังไม่มีรายการ"}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
              onClick={openCreateSheet}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              สร้างใบสั่งซื้อ
            </button>

            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => router.push('/settings/pdf?tab=po')}
              title="ตั้งค่าเอกสาร PDF - ใบสั่งซื้อ"
            >
              <FileText className="h-4 w-4" />
              ตั้งค่า PDF
            </button>
          </div>
        )}
      </div>

      {/* ── Filter chips (full-width, scrollable) ── */}
      <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { id: "ALL" as StatusFilter, label: "ทั้งหมด" },
            { id: "DRAFT" as StatusFilter, label: "ร่าง" },
            { id: "ORDERED" as StatusFilter, label: "สั่งแล้ว" },
            { id: "SHIPPED" as StatusFilter, label: "จัดส่ง" },
            { id: "RECEIVED" as StatusFilter, label: "รับแล้ว" },
            { id: "CANCELLED" as StatusFilter, label: "ยกเลิก" },
          ] as const
        ).map((f) => {
          const count = statusCounts[f.id] ?? 0;
          const isActive = statusFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 active:bg-slate-200"
              }`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── PO list ── */}
      {filteredList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            {statusFilter === "ALL"
              ? "ยังไม่มีใบสั่งซื้อ"
              : "ไม่มีรายการในสถานะนี้"}
          </p>
          {canCreate && statusFilter === "ALL" && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
              onClick={openCreateSheet}
            >
              <Plus className="h-4 w-4" />
              สร้างใบสั่งซื้อใหม่
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((po) => {
            const cfg = statusConfig[po.status];
            const Icon = cfg.icon;
            const remaining =
              po.expectedAt && po.status !== "RECEIVED" && po.status !== "CANCELLED"
                ? daysUntil(po.expectedAt)
                : null;

            return (
              <button
                key={po.id}
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
                onClick={() => setSelectedPO(po.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {po.poNumber}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.badgeClass}`}
                      >
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </div>
                    {po.supplierName && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {po.supplierName} ({po.purchaseCurrency})
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {po.itemCount} รายการ ·{" "}
                      {fmtPrice(po.totalCostBase + po.shippingCost + po.otherCost, storeCurrency)}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <div className="mt-2">
                  <div className="space-y-1 text-[11px] text-slate-600">
                    {/* Timeline based on status */}
                    {po.status === "DRAFT" && (
                      <div>สั่งเมื่อ {formatDate(po.createdAt)}</div>
                    )}
                    {po.status === "ORDERED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}
                        {po.orderedAt && (
                          <>
                            {" "}
                            → ยืนยันเมื่อ {formatDate(po.orderedAt)}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "SHIPPED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}
                        {po.shippedAt && (
                          <>
                            {" "}
                            → จัดส่งเมื่อ {formatDate(po.shippedAt)}
                          </>
                        )}
                        {po.expectedAt && (
                          <>
                            {" "}
                            → คาดว่า {formatDate(po.expectedAt)}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "RECEIVED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}
                        {po.shippedAt && (
                          <>
                            {" "}
                            → จัดส่งเมื่อ {formatDate(po.shippedAt)}
                          </>
                        )}
                        {po.receivedAt && (
                          <>
                            {" "}
                            → รับเมื่อ {formatDate(po.receivedAt)}
                          </>
                        )}
                      </div>
                    )}
    {po.status === "CANCELLED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}{" "}
                        {po.cancelledAt && (
                          <>
                            · <span className="text-red-600">ยกเลิกเมื่อ {formatDate(po.cancelledAt)}</span>
                          </>
                        )}
                        {!po.cancelledAt && (
                          <>
                            · <span className="text-red-600">ยกเลิก</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {remaining !== null && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">ความคืบหน้า</span>
                      <span
                        className={
                          remaining <= 0
                            ? "font-medium text-red-600"
                            : remaining <= 3
                              ? "font-medium text-amber-600"
                              : "text-slate-500"
                        }
                      >
                        {remaining <= 0
                          ? "เลยกำหนด"
                          : `เหลือ ${remaining} วัน`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          remaining <= 0
                            ? "bg-red-500"
                            : remaining <= 3
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(5, 100 - remaining * 5))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {hasMore && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 text-xs"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
              </Button>
              <div ref={loadMoreRef} className="h-2 w-full" />
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Create PO Wizard
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={isCreateOpen}
        onClose={closeCreateSheet}
        title="สร้างใบสั่งซื้อ"
        description={`ขั้นตอน ${wizardStep}/3`}
        disabled={isSubmitting}
      >
            {/* Step 1: Info */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    ชื่อซัพพลายเออร์ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="เช่น ร้านสมชาย, ตลาดเช้า"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    เบอร์ติดต่อ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    placeholder="020-xxxx-xxxx"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    สกุลเงินที่ซื้อ
                  </label>
                  <div className="flex gap-2">
                    {(["LAK", "THB", "USD"] as StoreCurrency[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          purchaseCurrency === c
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => setPurchaseCurrency(c)}
                      >
                        {currencySymbol(c)} {c}
                      </button>
                    ))}
                  </div>
                </div>
                {purchaseCurrency !== storeCurrency && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      อัตราแลกเปลี่ยน (1 {purchaseCurrency} ={" "}
                      {exchangeRate || "?"} {storeCurrency})
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="decimal"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder="เช่น 600"
                    />
                  </div>
                )}
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={() => setWizardStep(2)}
                >
                  ถัดไป →
                </Button>
              </div>
            )}

            {/* Step 2: Items */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                {/* Product search */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    เพิ่มสินค้า
                  </label>
                  <input
                    className={fieldClassName}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="🔍 ค้นหาสินค้า..."
                  />
                  {productSearch && (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {loadingProducts ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          กำลังโหลด...
                        </p>
                      ) : filteredProductOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          ไม่พบสินค้า
                        </p>
                      ) : (
                        filteredProductOptions.slice(0, 10).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() =>
                              addItem({ id: p.id, name: p.name })
                            }
                          >
                            <span className="font-medium">{p.name}</span>
                            <span className="ml-2 text-xs text-slate-400">
                              {p.sku}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Item list */}
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                    ยังไม่ได้เพิ่มสินค้า
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.productId}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-slate-900">
                            {item.productName}
                          </p>
                          <button
                            type="button"
                            className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                            onClick={() => removeItem(item.productId)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-slate-500">
                              จำนวน
                            </label>
                            <input
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                              type="number"
                              inputMode="numeric"
                              value={item.qtyOrdered}
                              onChange={(e) =>
                                updateItem(
                                  item.productId,
                                  "qtyOrdered",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500">
                              ราคา/{currencySymbol(purchaseCurrency)}
                            </label>
                            <input
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                              type="number"
                              inputMode="numeric"
                              value={item.unitCostPurchase}
                              onChange={(e) =>
                                updateItem(
                                  item.productId,
                                  "unitCostPurchase",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-right text-xs text-slate-500">
                          ={" "}
                          {fmtPrice(
                            Math.round(
                              (Number(item.qtyOrdered) || 0) *
                                (Number(item.unitCostPurchase) || 0) *
                                effectiveRate,
                            ),
                            storeCurrency,
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setWizardStep(1)}
                  >
                    ← ย้อนกลับ
                  </Button>
                  <Button
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setWizardStep(3)}
                    disabled={items.length === 0}
                  >
                    ถัดไป →
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Costs + Summary */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      ค่าขนส่ง ({currencySymbol(storeCurrency)})
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="numeric"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      ค่าอื่นๆ ({currencySymbol(storeCurrency)})
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="numeric"
                      value={otherCost}
                      onChange={(e) => setOtherCost(e.target.value)}
                    />
                  </div>
                </div>
                {Number(otherCost) > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      หมายเหตุค่าอื่นๆ
                    </label>
                    <input
                      className={fieldClassName}
                      value={otherCostNote}
                      onChange={(e) => setOtherCostNote(e.target.value)}
                      placeholder="เช่น ค่าภาษี, ค่าดำเนินการ"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    คาดว่าจะได้รับ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    type="date"
                    value={expectedAt}
                    onChange={(e) => setExpectedAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    หมายเหตุ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="หมายเหตุเพิ่มเติม"
                  />
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    สรุป
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">สินค้า ({items.length} รายการ)</span>
                      <span className="font-medium">
                        {fmtPrice(itemsTotalBase, storeCurrency)}
                      </span>
                    </div>
                    {shipping > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">ค่าขนส่ง</span>
                        <span>{fmtPrice(shipping, storeCurrency)}</span>
                      </div>
                    )}
                    {other > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">ค่าอื่นๆ</span>
                        <span>{fmtPrice(other, storeCurrency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                      <span>รวมทั้งหมด</span>
                      <span>{fmtPrice(grandTotal, storeCurrency)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() => setWizardStep(2)}
                  disabled={isSubmitting}
                >
                  ← ย้อนกลับ
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl text-xs"
                    onClick={() => submitPO(false)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-1 h-3.5 w-3.5" />
                    )}
                    บันทึกร่าง
                  </Button>
                  <Button
                    className="h-11 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    onClick={() => submitPO(true)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    รับสินค้าทันที
                  </Button>
                </div>
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={async () => {
                    if (items.length === 0) {
                      toast.error("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");
                      return;
                    }
                    setIsSubmitting(true);
                    try {
                      const res = await authFetch("/api/stock/purchase-orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          supplierName: supplierName || undefined,
                          supplierContact: supplierContact || undefined,
                          purchaseCurrency,
                          exchangeRate: effectiveRate,
                          shippingCost: shipping,
                          otherCost: other,
                          otherCostNote: otherCostNote || undefined,
                          note: note || undefined,
                          expectedAt: expectedAt || undefined,
                          receiveImmediately: false,
                          items: items.map((i) => ({
                            productId: i.productId,
                            qtyOrdered: Number(i.qtyOrdered) || 1,
                            unitCostPurchase: Number(i.unitCostPurchase) || 0,
                          })),
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        toast.error(data?.message ?? "สร้างไม่สำเร็จ");
                        return;
                      }
                      // Now set it to ORDERED
                      const poId = data.purchaseOrder.id;
                      await authFetch(`/api/stock/purchase-orders/${poId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "ORDERED" }),
                      });
                      toast.success("สร้างใบสั่งซื้อ + ยืนยันสั่งแล้ว");
                      setIsCreateOpen(false);
                      await reloadFirstPage();
                      router.refresh();
                    } catch {
                      toast.error("เชื่อมต่อไม่สำเร็จ");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="mr-1 h-3.5 w-3.5" />
                  )}
                  ยืนยันสั่งซื้อ
                </Button>
              </div>
            )}
      </SlideUpSheet>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * PO Detail Sheet (quick actions)
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <PODetailSheet
        poId={selectedPO}
        storeCurrency={storeCurrency}
        storeLogoUrl={storeLogoUrl}
        pdfConfig={pdfConfig}
        onClose={() => setSelectedPO(null)}
        onUpdateStatus={updateStatus}
      />
    </div>
  );
}

/* ── PO Detail Sheet ── */
function PODetailSheet({
  poId,
  storeCurrency,
  storeLogoUrl,
  pdfConfig,
  onClose,
  onUpdateStatus,
}: {
  poId: string | null;
  storeCurrency: StoreCurrency;
  storeLogoUrl?: string | null;
  pdfConfig?: Partial<PoPdfConfig>;
  onClose: () => void;
  onUpdateStatus: (
    poId: string,
    status: "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED",
  ) => void;
}) {
  const router = useRouter();
  const [po, setPo] = useState<{
    id: string;
    poNumber: string;
    supplierName: string | null;
    supplierContact: string | null;
    purchaseCurrency: string;
    exchangeRate: number;
    shippingCost: number;
    otherCost: number;
    otherCostNote: string | null;
    status: string;
    orderedAt: string | null;
    shippedAt: string | null;
    receivedAt: string | null;
    expectedAt: string | null;
    trackingInfo: string | null;
    note: string | null;
    createdByName: string | null;
    createdAt: string;
    items: {
      id: string;
      productId: string;
      productName: string;
      productSku: string;
      qtyOrdered: number;
      qtyReceived: number;
      unitCostPurchase: number;
      unitCostBase: number;
      landedCostPerUnit: number;
    }[];
    totalCostBase: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [editForm, setEditForm] = useState({
    supplierName: "",
    supplierContact: "",
    purchaseCurrency: storeCurrency,
    exchangeRate: "1",
    shippingCost: "0",
    otherCost: "0",
    otherCostNote: "",
    note: "",
    expectedAt: "",
    trackingInfo: "",
    items: [] as { productId: string; productName: string; qtyOrdered: string; unitCostPurchase: string }[],
  });

  useEffect(() => {
    if (!poId) {
      setPo(null);
      setIsEditMode(false);
      return;
    }
    setLoading(true);
    authFetch(`/api/stock/purchase-orders/${poId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setPo(data.purchaseOrder);
          setIsEditMode(false);
        }
      })
      .finally(() => setLoading(false));
  }, [poId]);

  const handleStatusChange = async (
    newStatus: "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED",
  ) => {
    if (!po) return;
    setUpdating(true);
    await onUpdateStatus(po.id, newStatus);
    setUpdating(false);
  };

  const canEditPO =
    po?.status === "DRAFT" || po?.status === "ORDERED" || po?.status === "SHIPPED";
  const canPrintPO = po?.status === "ORDERED" || po?.status === "SHIPPED" || po?.status === "RECEIVED" || po?.status === "CANCELLED";
  const isDraftEditable = po?.status === "DRAFT";

  const startEdit = () => {
    if (!po) return;
    setEditForm({
      supplierName: po.supplierName ?? "",
      supplierContact: po.supplierContact ?? "",
      purchaseCurrency: (po.purchaseCurrency as StoreCurrency) ?? storeCurrency,
      exchangeRate: String(po.exchangeRate ?? 1),
      shippingCost: String(po.shippingCost ?? 0),
      otherCost: String(po.otherCost ?? 0),
      otherCostNote: po.otherCostNote ?? "",
      note: po.note ?? "",
      expectedAt: po.expectedAt ? po.expectedAt.slice(0, 10) : "",
      trackingInfo: po.trackingInfo ?? "",
      items: po.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        qtyOrdered: String(item.qtyOrdered),
        unitCostPurchase: String(item.unitCostPurchase),
      })),
    });
    setIsEditMode(true);
  };

  const saveEdit = async () => {
    if (!po) return;
    if (isDraftEditable && editForm.items.length === 0) {
      toast.error("ต้องมีอย่างน้อย 1 รายการสินค้า");
      return;
    }

    setIsSavingEdit(true);
    try {
      const payload = isDraftEditable
        ? {
            supplierName: editForm.supplierName || undefined,
            supplierContact: editForm.supplierContact || undefined,
            purchaseCurrency: editForm.purchaseCurrency,
            exchangeRate: Number(editForm.exchangeRate) || 1,
            shippingCost: Number(editForm.shippingCost) || 0,
            otherCost: Number(editForm.otherCost) || 0,
            otherCostNote: editForm.otherCostNote || undefined,
            note: editForm.note || undefined,
            expectedAt: editForm.expectedAt || undefined,
            trackingInfo: editForm.trackingInfo || undefined,
            items: editForm.items.map((item) => ({
              productId: item.productId,
              qtyOrdered: Number(item.qtyOrdered) || 1,
              unitCostPurchase: Number(item.unitCostPurchase) || 0,
            })),
          }
        : {
            note: editForm.note || undefined,
            expectedAt: editForm.expectedAt || undefined,
            trackingInfo: editForm.trackingInfo || undefined,
          };

      const res = await authFetch(`/api/stock/purchase-orders/${po.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "อัปเดต PO ไม่สำเร็จ");
        return;
      }

      setPo(data.purchaseOrder);
      setIsEditMode(false);
      toast.success("บันทึกการแก้ไข PO เรียบร้อย");
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isOpen = poId !== null;

  return (
    <SlideUpSheet
      isOpen={isOpen}
      onClose={onClose}
      title={po?.poNumber ?? "รายละเอียด"}
      disabled={updating || isSavingEdit}
    >
      <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : po ? (
            <>
              {/* Status + timeline */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const cfg = statusConfig[po.status as PurchaseOrderListItem["status"]];
                    const Icon = cfg?.icon ?? FileText;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg?.badgeClass ?? "bg-slate-100 text-slate-600"}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {cfg?.label ?? po.status}
                      </span>
                    );
                  })()}
                  {po.supplierName && (
                    <span className="text-xs text-slate-500">
                      · {po.supplierName}
                    </span>
                  )}
                </div>
                {canEditPO && !isEditMode && (
                  <Button
                    variant="outline"
                    className="h-8 rounded-lg px-2.5 text-xs"
                    onClick={startEdit}
                    disabled={updating}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    แก้ไข
                  </Button>
                )}
              </div>

              {canPrintPO && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={isGeneratingPdf}
                    onClick={async () => {
                      if (!po) return;
                      setIsGeneratingPdf(true);
                      try {
                        const { generatePoPdf } = await import("@/lib/pdf/generate-po-pdf");
                        const pdfData: POPdfData = {
                          poNumber: po.poNumber,
                          status: po.status,
                          supplierName: po.supplierName,
                          supplierContact: po.supplierContact,
                          purchaseCurrency: po.purchaseCurrency,
                          exchangeRate: po.exchangeRate,
                          shippingCost: po.shippingCost,
                          otherCost: po.otherCost,
                          otherCostNote: po.otherCostNote,
                          note: po.note,
                          createdByName: po.createdByName,
                          createdAt: po.createdAt,
                          orderedAt: po.orderedAt,
                          shippedAt: po.shippedAt,
                          receivedAt: po.receivedAt,
                          expectedAt: po.expectedAt,
                          trackingInfo: po.trackingInfo,
                          totalCostBase: po.totalCostBase,
                          storeLogoUrl: storeLogoUrl,
                          items: po.items.map((item) => ({
                            productName: item.productName,
                            productSku: item.productSku,
                            qtyOrdered: item.qtyOrdered,
                            unitCostBase: item.unitCostBase,
                          })),
                        };
                        const blob = await generatePoPdf(pdfData, storeCurrency, pdfConfig);
                        const { downloadBlob } = await import("@/lib/pdf/share-or-download");
                        downloadBlob(blob, `${po.poNumber}.pdf`);
                        toast.success("ดาวน์โหลด PDF เรียบร้อย");
                      } catch {
                        toast.error("สร้าง PDF ไม่สำเร็จ");
                      } finally {
                        setIsGeneratingPdf(false);
                      }
                    }}
                  >
                    {isGeneratingPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    PDF
                  </button>
                  {canNativeShare() && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={isGeneratingPdf}
                      onClick={async () => {
                        if (!po) return;
                        setIsGeneratingPdf(true);
                        try {
                          const { generatePoPdf } = await import("@/lib/pdf/generate-po-pdf");
                          const pdfData: POPdfData = {
                            poNumber: po.poNumber,
                            status: po.status,
                            supplierName: po.supplierName,
                            supplierContact: po.supplierContact,
                            purchaseCurrency: po.purchaseCurrency,
                            exchangeRate: po.exchangeRate,
                            shippingCost: po.shippingCost,
                            otherCost: po.otherCost,
                            otherCostNote: po.otherCostNote,
                            note: po.note,
                            createdByName: po.createdByName,
                            createdAt: po.createdAt,
                            orderedAt: po.orderedAt,
                            shippedAt: po.shippedAt,
                            receivedAt: po.receivedAt,
                            expectedAt: po.expectedAt,
                            trackingInfo: po.trackingInfo,
                            totalCostBase: po.totalCostBase,
                            storeLogoUrl: storeLogoUrl,
                            items: po.items.map((item) => ({
                              productName: item.productName,
                              productSku: item.productSku,
                              qtyOrdered: item.qtyOrdered,
                              unitCostBase: item.unitCostBase,
                            })),
                          };
                          const blob = await generatePoPdf(pdfData, storeCurrency, pdfConfig);
                          const { shareOrDownload } = await import("@/lib/pdf/share-or-download");
                          const result = await shareOrDownload(blob, `${po.poNumber}.pdf`, `ใบสั่งซื้อ ${po.poNumber}`);
                          if (result === "downloaded") toast.success("ดาวน์โหลด PDF เรียบร้อย");
                        } catch {
                          toast.error("แชร์ PDF ไม่สำเร็จ");
                        } finally {
                          setIsGeneratingPdf(false);
                        }
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      แชร์
                    </button>
                  )}
                </div>
              )}

              {isEditMode && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    แก้ไข PO
                  </p>

                  {isDraftEditable && (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">ซัพพลายเออร์</label>
                          <input
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.supplierName}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                supplierName: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">เบอร์ติดต่อ</label>
                          <input
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.supplierContact}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                supplierContact: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">สกุลเงิน</label>
                          <select
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.purchaseCurrency}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                purchaseCurrency: e.target.value as StoreCurrency,
                              }))
                            }
                          >
                            <option value="LAK">LAK</option>
                            <option value="THB">THB</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">อัตราแลกเปลี่ยน</label>
                          <input
                            type="number"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.exchangeRate}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                exchangeRate: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">ค่าขนส่ง</label>
                          <input
                            type="number"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.shippingCost}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                shippingCost: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">ค่าอื่นๆ</label>
                          <input
                            type="number"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.otherCost}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                otherCost: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-500">หมายเหตุค่าอื่นๆ</label>
                        <input
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                          value={editForm.otherCostNote}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              otherCostNote: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">รายการสินค้า</p>
                        {editForm.items.map((item, index) => (
                          <div
                            key={`${item.productId}-${index}`}
                            className="rounded-lg border border-slate-200 bg-white p-2"
                          >
                            <p className="text-xs font-medium text-slate-700">
                              {item.productName}
                            </p>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                                value={item.qtyOrdered}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    items: prev.items.map((x, i) =>
                                      i === index
                                        ? { ...x, qtyOrdered: e.target.value }
                                        : x,
                                    ),
                                  }))
                                }
                              />
                              <input
                                type="number"
                                className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                                value={item.unitCostPurchase}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    items: prev.items.map((x, i) =>
                                      i === index
                                        ? { ...x, unitCostPurchase: e.target.value }
                                        : x,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500">วันที่คาดรับ</label>
                      <input
                        type="date"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.expectedAt}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            expectedAt: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500">Tracking</label>
                      <input
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.trackingInfo}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            trackingInfo: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500">หมายเหตุ</label>
                    <input
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                      value={editForm.note}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-10 rounded-lg"
                      onClick={() => setIsEditMode(false)}
                      disabled={isSavingEdit}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      className="h-10 rounded-lg"
                      onClick={saveEdit}
                      disabled={isSavingEdit}
                    >
                      {isSavingEdit ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "บันทึกการแก้ไข"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-1.5 text-xs">
                {po.createdAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {formatDate(po.createdAt)} สร้าง
                    {po.createdByName ? ` โดย ${po.createdByName}` : ""}
                  </div>
                )}
                {po.orderedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {formatDate(po.orderedAt)} ยืนยันสั่งซื้อ
                  </div>
                )}
                {po.shippedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {formatDate(po.shippedAt)} จัดส่ง
                    {po.trackingInfo ? ` (${po.trackingInfo})` : ""}
                  </div>
                )}
                {po.receivedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {formatDate(po.receivedAt)} รับสินค้าแล้ว
                  </div>
                )}
                {po.expectedAt &&
                  po.status !== "RECEIVED" &&
                  po.status !== "CANCELLED" && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white" />
                      คาดว่า {formatDate(po.expectedAt)}
                    </div>
                  )}
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  รายการสินค้า ({po.items.length})
                </p>
                {po.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {item.productName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.qtyOrdered} ×{" "}
                        {fmtPrice(item.unitCostBase, storeCurrency)}
                        {item.qtyReceived > 0 &&
                          item.qtyReceived !== item.qtyOrdered && (
                            <span className="ml-1 text-amber-600">
                              (ได้รับ {item.qtyReceived})
                            </span>
                          )}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {fmtPrice(
                        item.unitCostBase * item.qtyOrdered,
                        storeCurrency,
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Cost summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">สินค้า</span>
                  <span>{fmtPrice(po.totalCostBase, storeCurrency)}</span>
                </div>
                {po.shippingCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">ค่าขนส่ง</span>
                    <span>{fmtPrice(po.shippingCost, storeCurrency)}</span>
                  </div>
                )}
                {po.otherCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">ค่าอื่นๆ</span>
                    <span>{fmtPrice(po.otherCost, storeCurrency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>รวม</span>
                  <span>
                    {fmtPrice(
                      po.totalCostBase + po.shippingCost + po.otherCost,
                      storeCurrency,
                    )}
                  </span>
                </div>
              </div>

              {po.note && (
                <p className="text-xs text-slate-500">📝 {po.note}</p>
              )}

              {/* Action buttons by status */}
              {!isEditMode && (
                <>
                  {po.status === "DRAFT" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => handleStatusChange("CANCELLED")}
                        disabled={updating}
                      >
                        ยกเลิก
                      </Button>
                      <Button
                        className="h-11 rounded-xl text-xs"
                        onClick={() => handleStatusChange("ORDERED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "ยืนยันสั่งซื้อ"
                        )}
                      </Button>
                    </div>
                  )}
                  {po.status === "ORDERED" && (
                    <div className="space-y-2">
                      <Button
                        className="h-11 w-full rounded-xl text-xs"
                        onClick={() => handleStatusChange("SHIPPED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Truck className="mr-1 h-3.5 w-3.5" />
                            ซัพพลายเออร์ส่งแล้ว
                          </>
                        )}
                      </Button>
                      <Button
                        className="h-11 w-full rounded-xl bg-emerald-600 text-xs hover:bg-emerald-700"
                        onClick={() => handleStatusChange("RECEIVED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Package className="mr-1 h-3.5 w-3.5" />
                            รับสินค้า
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  {po.status === "SHIPPED" && (
                    <div className="space-y-2">
                      <Button
                        className="h-11 w-full rounded-xl bg-emerald-600 text-xs hover:bg-emerald-700"
                        onClick={() => handleStatusChange("RECEIVED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Package className="mr-1 h-3.5 w-3.5" />
                            รับสินค้า
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 w-full rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => handleStatusChange("CANCELLED")}
                        disabled={updating}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              ไม่พบข้อมูล
            </p>
          )}
      </div>
    </SlideUpSheet>
  );
}
