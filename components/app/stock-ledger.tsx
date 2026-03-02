"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Search, ScanBarcode, X } from "lucide-react";
import toast from "react-hot-toast";

import { BarcodeScannerPanel } from "@/components/app/barcode-scanner-panel";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import type {
  InventoryMovementView,
  StockProductOption,
} from "@/lib/inventory/queries";
import type { ProductListItem } from "@/lib/products/service";

type StockLedgerProps = {
  products: StockProductOption[];
  recentMovements: InventoryMovementView[];
  canCreate: boolean;
  canAdjust: boolean;
  canInbound: boolean;
  productPageSize: number;
  initialHasMoreProducts: boolean;
};

type MovementType = "IN" | "ADJUST" | "RETURN";
type AdjustMode = "INCREASE" | "DECREASE";

const movementLabel: Record<MovementType, string> = {
  IN: "รับเข้า",
  ADJUST: "ปรับสต็อก",
  RETURN: "รับคืน",
};

const movementBadgeClass: Record<InventoryMovementView["type"], string> = {
  IN: "bg-emerald-100 text-emerald-700",
  OUT: "bg-rose-100 text-rose-700",
  RESERVE: "bg-amber-100 text-amber-700",
  RELEASE: "bg-slate-200 text-slate-700",
  ADJUST: "bg-blue-100 text-blue-700",
  RETURN: "bg-purple-100 text-purple-700",
};

const movementTypeLabelMap: Record<InventoryMovementView["type"], string> = {
  IN: "รับเข้า",
  OUT: "ตัดออก",
  RESERVE: "จอง",
  RELEASE: "ยกเลิกจอง",
  ADJUST: "ปรับสต็อก",
  RETURN: "รับคืน",
};

export function StockLedger({
  products,
  recentMovements,
  canCreate,
  canAdjust,
  canInbound,
  productPageSize,
  initialHasMoreProducts,
}: StockLedgerProps) {
  const MOVEMENT_PAGE_SIZE = 20;

  const router = useRouter();
  const [, startTransition] = useTransition();

  const [productItems, setProductItems] = useState(products);
  const [movementItems, setMovementItems] = useState(recentMovements);
  const [productPage, setProductPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(initialHasMoreProducts);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [movementPage, setMovementPage] = useState(1);

  const movementTypeOptions = useMemo(() => {
    const options: MovementType[] = [];
    if (canInbound) {
      options.push("IN", "RETURN");
    }
    if (canAdjust) {
      options.push("ADJUST");
    }

    return options;
  }, [canAdjust, canInbound]);

  const [productId, setProductId] = useState<string>(products[0]?.productId ?? "");
  const [movementType, setMovementType] = useState<MovementType>(
    movementTypeOptions[0] ?? "IN",
  );
  const [unitId, setUnitId] = useState<string>(products[0]?.unitOptions[0]?.unitId ?? "");
  const [qty, setQty] = useState<string>("1");
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("INCREASE");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<ProductListItem & { stock?: { onHand: number; available: number; reserved: number } }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [currentStock, setCurrentStock] = useState<{
    onHand: number;
    available: number;
    reserved: number;
  } | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showScannerPermission, setShowScannerPermission] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProductItems(products);
    setProductPage(1);
    setHasMoreProducts(initialHasMoreProducts);
  }, [initialHasMoreProducts, products]);

  useEffect(() => {
    setMovementItems(recentMovements);
  }, [recentMovements]);

  useEffect(() => {
    const seen = window.localStorage.getItem("scanner-permission-seen") === "1";
    setHasSeenScannerPermission(seen);
  }, []);

  useEffect(() => {
    if (movementTypeOptions.length === 0) {
      return;
    }

    if (!movementTypeOptions.includes(movementType)) {
      setMovementType(movementTypeOptions[0]);
    }
  }, [movementType, movementTypeOptions]);

  useEffect(() => {
    if (productItems.length === 0) {
      setProductId("");
      setUnitId("");
      return;
    }

    const selected = productItems.find((item) => item.productId === productId);
    if (!selected) {
      setProductId(productItems[0].productId);
      setUnitId(productItems[0].unitOptions[0]?.unitId ?? "");
      return;
    }

    const matchedUnit = selected.unitOptions.find((unit) => unit.unitId === unitId);
    if (!matchedUnit) {
      setUnitId(selected.unitOptions[0]?.unitId ?? "");
    }
  }, [productId, productItems, unitId]);

  const selectedProduct = useMemo(
    () => productItems.find((item) => item.productId === productId),
    [productId, productItems],
  );

  const selectedUnit = selectedProduct?.unitOptions.find((unit) => unit.unitId === unitId);

  const qtyBasePreview = useMemo(() => {
    const qtyNumber = Number(qty);
    if (!selectedUnit || !Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      return null;
    }

    const computed = qtyNumber * selectedUnit.multiplierToBase;
    const rounded = Math.round(computed);
    if (Math.abs(computed - rounded) > 1e-9) {
      return null;
    }

    if (movementType === "ADJUST" && adjustMode === "DECREASE") {
      return -rounded;
    }

    return rounded;
  }, [adjustMode, movementType, qty, selectedUnit]);



  const fetchCurrentStock = async (prodId: string) => {
    setLoadingStock(true);
    try {
      const res = await authFetch(`/api/stock/current?productId=${prodId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentStock(data.stock || null);
      }
    } catch {
      setCurrentStock(null);
    } finally {
      setLoadingStock(false);
    }
  };

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setShowSearchDropdown(false);
        return;
      }

      setIsSearching(true);
      try {
        const res = await authFetch(
          `/api/products/search?q=${encodeURIComponent(query)}&includeStock=true`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.products || []);
          setShowSearchDropdown(true);
        }
      } catch {
        toast.error("ค้นหาสินค้าไม่สำเร็จ");
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, handleSearch]);

  const selectProductFromSearch = (product: ProductListItem) => {
    // เพิ่มสินค้าลงใน productItems ถ้ายังไม่มี
    const exists = productItems.find((p) => p.productId === product.id);
    if (!exists) {
      // แปลง conversions เป็น unitOptions
      const unitOptions = product.conversions.map((conv) => ({
        unitId: conv.unitId,
        unitCode: conv.unitCode,
        unitNameTh: conv.unitNameTh,
        multiplierToBase: conv.multiplierToBase,
      }));

      const newProduct: StockProductOption = {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        baseUnitId: product.baseUnitId,
        baseUnitCode: product.baseUnitCode,
        baseUnitNameTh: product.baseUnitNameTh || product.baseUnitCode,
        unitOptions,
        active: product.active,
        onHand: 0,
        reserved: 0,
        available: 0,
        outStockThreshold: product.outStockThreshold ?? null,
        lowStockThreshold: product.lowStockThreshold ?? null,
      };
      setProductItems((prev) => [newProduct, ...prev]);
    }

    setProductId(product.id);
    setUnitId(product.baseUnitId);
    setSearchQuery("");
    setShowSearchDropdown(false);
    fetchCurrentStock(product.id);

    // โฟกัสที่ช่องจำนวน
    setTimeout(() => {
      document.getElementById("stock-qty")?.focus();
    }, 100);
  };

  const handleBarcodeResult = async (barcode: string) => {
    setShowScanner(false);
    setIsSearching(true);
    
    try {
      const res = await authFetch(
        `/api/products/search?q=${encodeURIComponent(barcode)}&includeStock=true`,
      );
      if (res.ok) {
        const data = await res.json();
        const products = data.products || [];
        
        // ค้นหาสินค้าที่ barcode ตรงพอดี
        const exactMatch = products.find(
          (p: ProductListItem) => p.barcode?.toLowerCase() === barcode.toLowerCase(),
        );
        
        if (exactMatch) {
          selectProductFromSearch(exactMatch);
          toast.success(`พบสินค้า: ${exactMatch.name}`);
        } else if (products.length > 0) {
          selectProductFromSearch(products[0]);
          toast.success(`พบสินค้า: ${products[0].name}`);
        } else {
          toast.error("ไม่พบสินค้าที่มีบาร์โค้ดนี้");
        }
      }
    } catch {
      toast.error("ค้นหาสินค้าไม่สำเร็จ");
    } finally {
      setIsSearching(false);
    }
  };

  const openScanner = () => {
    if (hasSeenScannerPermission) {
      setShowScanner(true);
    } else {
      setShowScannerPermission(true);
    }
  };

  const movementPageCount = Math.max(
    1,
    Math.ceil(movementItems.length / MOVEMENT_PAGE_SIZE),
  );
  const currentMovementPage = Math.min(movementPage, movementPageCount);
  const paginatedMovements = useMemo(() => {
    const start = (currentMovementPage - 1) * MOVEMENT_PAGE_SIZE;
    return movementItems.slice(start, start + MOVEMENT_PAGE_SIZE);
  }, [currentMovementPage, movementItems]);

  useEffect(() => {
    if (movementPage > movementPageCount) {
      setMovementPage(movementPageCount);
    }
  }, [movementPage, movementPageCount]);

  const loadMoreProducts = useCallback(async () => {
    if (isLoadingMoreProducts || !hasMoreProducts) return;
    setIsLoadingMoreProducts(true);
    try {
      const nextPage = productPage + 1;
      const res = await authFetch(
        `/api/stock/products?page=${nextPage}&pageSize=${productPageSize}`,
      );
      const data = await res.json();
      if (res.ok && data?.products) {
        setProductItems((prev) => [...prev, ...data.products]);
        setProductPage(nextPage);
        setHasMoreProducts(Boolean(data.hasMore));
      }
    } finally {
      setIsLoadingMoreProducts(false);
    }
  }, [hasMoreProducts, isLoadingMoreProducts, productPage, productPageSize]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMoreProducts) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreProducts();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreProducts, loadMoreProducts]);

  const submitMovement = async () => {
    if (!canCreate) {
      setErrorMessage("คุณไม่มีสิทธิ์บันทึกสต็อก");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/stock/movements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId,
        movementType,
        unitId,
        qty,
        adjustMode,
        note,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึกสต็อกไม่สำเร็จ");
      setLoading(false);
      return;
    }

    if (selectedProduct && qtyBasePreview !== null) {
      const now = new Date().toISOString();
      const movementTypeForView: InventoryMovementView["type"] =
        movementType === "IN"
          ? "IN"
          : movementType === "RETURN"
            ? "RETURN"
            : "ADJUST";

      setProductItems((previous) =>
        previous.map((item) => {
          if (item.productId !== selectedProduct.productId) {
            return item;
          }

          const nextOnHand = item.onHand + qtyBasePreview;
          return {
            ...item,
            onHand: nextOnHand,
            available: nextOnHand - item.reserved,
          };
        }),
      );

      setMovementItems((previous) => [
        {
          id: `local-${Date.now()}`,
          productId: selectedProduct.productId,
          productSku: selectedProduct.sku,
          productName: selectedProduct.name,
          type: movementTypeForView,
          qtyBase: qtyBasePreview,
          note: note.trim() ? note.trim() : null,
          createdAt: now,
          createdByName: "คุณ",
        },
        ...previous,
      ]);
      setMovementPage(1);
    }

    setSuccessMessage("บันทึกรายการสต็อกเรียบร้อย");
    setNote("");
    setQty("1");
    setLoading(false);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">บันทึกการเคลื่อนไหวสต็อก</h2>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-product-search">
            สินค้า
          </label>
          
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  id="stock-product-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchQuery.trim() && searchResults.length > 0) {
                      setShowSearchDropdown(true);
                    }
                  }}
                  placeholder="ค้นหาสินค้า (SKU, ชื่อ, บาร์โค้ด)..."
                  className="h-10 w-full rounded-md border pl-9 pr-9 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setShowSearchDropdown(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
              </div>
              
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 p-0"
                onClick={openScanner}
                disabled={loading}
              >
                <ScanBarcode className="h-4 w-4" />
              </Button>
            </div>

            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProductFromSearch(product)}
                    className="flex w-full items-start gap-2 border-b p-3 text-left transition-colors hover:bg-slate-50 last:border-b-0"
                  >
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                      <p className="text-sm font-medium">{product.name}</p>
                      {product.barcode && (
                        <p className="text-xs text-slate-500">บาร์โค้ด: {product.barcode}</p>
                      )}
                      {product.stock && (
                        <p className="mt-1 text-xs text-blue-600">
                          สต็อก: {product.stock.onHand.toLocaleString("th-TH")} {product.baseUnitCode}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {selectedProduct && currentStock !== null && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm">
              <p className="font-medium text-blue-900">📦 สต็อกปัจจุบัน</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-blue-700">คงเหลือ</p>
                  <p className="font-semibold text-blue-900">
                    {currentStock.onHand.toLocaleString("th-TH")}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">จอง</p>
                  <p className="font-semibold text-blue-900">
                    {currentStock.reserved.toLocaleString("th-TH")}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">พร้อมขาย</p>
                  <p className={`font-semibold ${currentStock.available < 0 ? "text-red-600" : "text-blue-900"}`}>
                    {currentStock.available.toLocaleString("th-TH")}
                  </p>
                </div>
              </div>
              
              {qtyBasePreview !== null && (
                <div className="mt-2 border-t border-blue-200 pt-2">
                  <p className="text-blue-700">หลังทำรายการนี้</p>
                  <p className={`font-semibold ${(currentStock.onHand + qtyBasePreview) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {(currentStock.onHand + qtyBasePreview).toLocaleString("th-TH")} {selectedProduct.baseUnitCode}
                    {" "}
                    ({qtyBasePreview > 0 ? "+" : ""}{qtyBasePreview.toLocaleString("th-TH")})
                  </p>
                </div>
              )}
            </div>
          )}
          
          {loadingStock && (
            <p className="text-xs text-slate-500">กำลังโหลดข้อมูลสต็อก...</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-type">
              ประเภท
            </label>
            <select
              id="stock-type"
              value={movementType}
              onChange={(event) => setMovementType(event.target.value as MovementType)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loading || movementTypeOptions.length === 0}
            >
              {movementTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {movementLabel[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-unit">
              หน่วย
            </label>
            <select
              id="stock-unit"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loading || !selectedProduct}
            >
              {selectedProduct?.unitOptions.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitCode} ({unit.unitNameTh})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-qty">
              จำนวน
            </label>
            <input
              id="stock-qty"
              type="number"
              min={0.001}
              step={0.001}
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loading}
            />
          </div>

          {movementType === "ADJUST" ? (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="stock-adjust-mode">
                รูปแบบการปรับ
              </label>
              <select
                id="stock-adjust-mode"
                value={adjustMode}
                onChange={(event) => setAdjustMode(event.target.value as AdjustMode)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loading}
              >
                <option value="INCREASE">ปรับเพิ่ม</option>
                <option value="DECREASE">ปรับลด</option>
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-note">
            หมายเหตุ
          </label>
          <textarea
            id="stock-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
          />
        </div>

        <p className="text-xs text-blue-700">
          {selectedUnit && qtyBasePreview !== null
            ? `รายการนี้จะบันทึกเป็น ${qtyBasePreview.toLocaleString("th-TH")} ${selectedProduct?.baseUnitCode ?? "หน่วยหลัก"}`
            : "กรุณากรอกจำนวนให้แปลงเป็นหน่วยหลักได้"}
        </p>

        <Button className="h-10 w-full" onClick={submitMovement} disabled={loading || !canCreate}>
          {loading ? "กำลังบันทึก..." : "บันทึกสต็อก"}
        </Button>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สรุปสต็อกปัจจุบัน</h2>

        {productItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีสินค้าในร้าน</p>
        ) : (
          <div className="space-y-2">
            {productItems.map((product) => (
              <div key={product.productId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{product.sku}</p>
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      หน่วยหลัก {product.baseUnitCode}
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

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-slate-50 p-2">
                    <p className="text-muted-foreground">คงเหลือ</p>
                    <p className="font-semibold">{product.onHand.toLocaleString("th-TH")}</p>
                  </div>
                  <div className="rounded bg-slate-50 p-2">
                    <p className="text-muted-foreground">จอง</p>
                    <p className="font-semibold">{product.reserved.toLocaleString("th-TH")}</p>
                  </div>
                  <div className="rounded bg-slate-50 p-2">
                    <p className="text-muted-foreground">พร้อมขาย</p>
                    <p className={`font-semibold ${product.available < 0 ? "text-red-600" : ""}`}>
                      {product.available.toLocaleString("th-TH")}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                แสดงแล้ว {productItems.length.toLocaleString("th-TH")} รายการ
              </p>
              <div className="flex items-center gap-2">
                {hasMoreProducts ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={loadMoreProducts}
                    disabled={isLoadingMoreProducts}
                  >
                    {isLoadingMoreProducts ? "กำลังโหลด..." : "โหลดเพิ่ม"}
                  </Button>
                ) : (
                  <span className="text-slate-400">ครบแล้ว</span>
                )}
              </div>
            </div>
            {hasMoreProducts && (
              <div ref={loadMoreRef} className="h-6" />
            )}
          </div>
        )}
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สมุดบัญชีสต็อกล่าสุด</h2>

        {movementItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการเคลื่อนไหว</p>
        ) : (
          <div className="space-y-2">
            {paginatedMovements.map((movement) => (
              <div key={movement.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{movement.productSku}</p>
                    <p className="text-sm font-medium">{movement.productName}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${movementBadgeClass[movement.type]}`}>
                    {movementTypeLabelMap[movement.type]}
                  </span>
                </div>

                <p className="mt-2 text-sm">
                  จำนวนฐาน {movement.qtyBase.toLocaleString("th-TH")}
                </p>

                {movement.note ? (
                  <p className="mt-1 text-xs text-muted-foreground">หมายเหตุ: {movement.note}</p>
                ) : null}

                <p className="mt-1 text-xs text-muted-foreground">
                  โดย {movement.createdByName ?? "-"} • {new Date(movement.createdAt).toLocaleString("th-TH")}
                </p>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                หน้า {currentMovementPage.toLocaleString("th-TH")} /{" "}
                {movementPageCount.toLocaleString("th-TH")} (
                {movementItems.length.toLocaleString("th-TH")} รายการ)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  disabled={currentMovementPage <= 1}
                  onClick={() =>
                    setMovementPage((previous) => Math.max(1, previous - 1))
                  }
                >
                  ก่อนหน้า
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  disabled={currentMovementPage >= movementPageCount}
                  onClick={() =>
                    setMovementPage((previous) =>
                      Math.min(movementPageCount, previous + 1),
                    )
                  }
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </div>
        )}
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {/* Scanner Permission Sheet */}
      <SlideUpSheet
        isOpen={showScannerPermission}
        onClose={() => setShowScannerPermission(false)}
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
              onClick={() => setShowScannerPermission(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              className="h-10 flex-1"
              onClick={() => {
                window.localStorage.setItem("scanner-permission-seen", "1");
                setHasSeenScannerPermission(true);
                setShowScannerPermission(false);
                setShowScanner(true);
              }}
            >
              อนุญาตและสแกน
            </Button>
          </div>
        </div>
      </SlideUpSheet>

      {/* Scanner Sheet */}
      <SlideUpSheet
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="สแกนบาร์โค้ด"
        description="ส่องกล้องไปที่บาร์โค้ดสินค้า"
      >
        <BarcodeScannerPanel
          isOpen={showScanner}
          onResult={handleBarcodeResult}
          onClose={() => setShowScanner(false)}
          cameraSelectId="stock-ledger-barcode-scanner-camera-select"
        />
      </SlideUpSheet>
    </section>
  );
}
