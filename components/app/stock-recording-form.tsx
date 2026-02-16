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

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import type {
  InventoryMovementView,
  StockProductOption,
} from "@/lib/inventory/queries";
import type { ProductListItem } from "@/lib/products/service";

type StockRecordingFormProps = {
  initialProducts: StockProductOption[];
  canCreate: boolean;
  canAdjust: boolean;
  canInbound: boolean;
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

export function StockRecordingForm({
  initialProducts,
  canCreate,
  canAdjust,
  canInbound,
}: StockRecordingFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [productItems] = useState(initialProducts);
  const [recentMovements, setRecentMovements] = useState<InventoryMovementView[]>([]);

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

  const [productId, setProductId] = useState<string>("");
  const [movementType, setMovementType] = useState<MovementType>(
    movementTypeOptions[0] ?? "IN",
  );
  const [unitId, setUnitId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("INCREASE");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    setProductId(product.id);
    setUnitId(product.baseUnitId);
    setSearchQuery("");
    setShowSearchDropdown(false);
    fetchCurrentStock(product.id);

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

  const submitMovement = async () => {
    if (!canCreate) {
      setErrorMessage("คุณไม่มีสิทธิ์บันทึกสต็อก");
      return;
    }

    if (!productId) {
      setErrorMessage("กรุณาเลือกสินค้า");
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
        cost: cost ? Number(cost) : undefined,
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

      setRecentMovements((previous) => [
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
        ...previous.slice(0, 4), // เก็บแค่ 5 รายการล่าสุด
      ]);

      // อัปเดตสต็อกปัจจุบันหลังบันทึก
      if (currentStock) {
        setCurrentStock({
          onHand: currentStock.onHand + qtyBasePreview,
          reserved: currentStock.reserved,
          available: currentStock.available + qtyBasePreview,
        });
      }
    }

    setSuccessMessage("✅ บันทึกรายการสต็อกเรียบร้อย");
    setNote("");
    setCost("");
    setQty("1");
    setLoading(false);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <section className="space-y-4">
      {/* Help Text Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
        <p className="font-semibold text-blue-900">💡 ฟอร์มนี้ใช้สำหรับ:</p>
        <ul className="mt-1 space-y-1 text-xs text-blue-700">
          <li>• <strong>ตรวจนับสต็อก</strong> (Stock Take) - ปรับยอดให้ตรงกับความเป็นจริง</li>
          <li>• <strong>รับคืนจากลูกค้า</strong> - สินค้าที่รับคืนมาเพิ่มเข้าสต็อก</li>
          <li>• <strong>โอนระหว่างสาขา</strong> - รับ/ส่งสินค้าระหว่างสาขา</li>
          <li>• <strong>ของแถม/ตัวอย่าง</strong> - เจ้าของนำมาเพิ่มโดยไม่ผ่าน PO</li>
        </ul>
      </div>

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

          {selectedProduct && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">{selectedProduct.name}</p>
              <p className="text-xs text-slate-600">SKU: {selectedProduct.sku}</p>
            </div>
          )}

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

        {/* Warning for IN type */}
        {movementType === "IN" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
            <p className="font-semibold text-amber-900">⚠️ หมายเหตุ:</p>
            <p className="mt-1 text-amber-700">
              หากคุณกำลัง <strong>สั่งซื้อสินค้าใหม่</strong> ควรใช้ <strong>แท็บ &quot;สั่งซื้อ (PO)&quot;</strong> แทน
              เพราะจะบันทึกต้นทุนและราคาซื้อได้อย่างสมบูรณ์
            </p>
          </div>
        )}

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

        {/* Advanced Section - Optional Cost */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <span>⚙️ ข้อมูลเพิ่มเติม (Optional)</span>
            <span className="text-lg">{showAdvanced ? "▼" : "▶"}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="stock-cost">
                  💰 ต้นทุน/ราคาซื้อ (ต่อหน่วยหลัก)
                </label>
                <input
                  id="stock-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  placeholder="เช่น 50.00 (ไม่บังคับ)"
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                  disabled={loading}
                />
                <p className="text-xs text-slate-600">
                  ใช้เฉพาะกรณีที่รู้ราคาต้นทุน (เช่น เจ้าของนำของมาเพิ่ม) หากไม่แน่ใจให้เว้นว่างไว้
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-note">
            หมายเหตุ (ถ้ามี)
          </label>
          <textarea
            id="stock-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
            placeholder="เช่น รับเข้าจากซัพพลายเออร์, ปรับจากการตรวจนับ"
          />
        </div>

        <p className="text-xs text-blue-700">
          {selectedUnit && qtyBasePreview !== null
            ? `รายการนี้จะบันทึกเป็น ${qtyBasePreview.toLocaleString("th-TH")} ${selectedProduct?.baseUnitCode ?? "หน่วยหลัก"}`
            : "กรุณากรอกจำนวนให้แปลงเป็นหน่วยหลักได้"}
        </p>

        <Button className="h-10 w-full" onClick={submitMovement} disabled={loading || !canCreate || !productId}>
          {loading ? "กำลังบันทึก..." : "บันทึกสต็อก"}
        </Button>

        {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      </article>

      {/* รายการที่บันทึกเมื่อสักครู่ */}
      {recentMovements.length > 0 && (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">รายการที่บันทึกเมื่อสักครู่</h2>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("tab", "history");
                window.location.href = `?${params.toString()}`;
              }}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              ดูประวัติทั้งหมด →
            </button>
          </div>

          <div className="space-y-2">
            {recentMovements.slice(0, 5).map((movement) => (
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

                {movement.note && (
                  <p className="mt-1 text-xs text-muted-foreground">หมายเหตุ: {movement.note}</p>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  โดย {movement.createdByName ?? "-"} • {new Date(movement.createdAt).toLocaleString("th-TH")}
                </p>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Scanner Permission Sheet */}
      <SlideUpSheet
        isOpen={showScannerPermission}
        onClose={() => setShowScannerPermission(false)}
        title="การใช้กล้องสแกนบาร์โค้ด"
      >
        <div className="space-y-4 p-4">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <strong>เร็ว</strong> — สแกนและบันทึกภายใน 3 วินาที
            </p>
            <p>
              <strong>แม่นยำ</strong> — รองรับ EAN-13, EAN-8, CODE-128, QR Code และอื่นๆ
            </p>
            <p>
              <strong>ใช้ง่าย</strong> — วางบาร์โค้ดในกรอบสีฟ้า พร้อมสลับกล้อง/ไฟแฟลช/ซูม
            </p>
            <p>
              <strong>ประหยัดพลังงาน</strong> — หยุดกล้องชั่วคราวได้ทันที
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">เบราว์เซอร์จะขออนุญาตใช้กล้อง</p>
            <p className="mt-1">
              กรุณากด <strong>&ldquo;อนุญาต&rdquo;</strong> เพื่อเปิดใช้งานสแกนเนอร์
              <br />
              ข้อมูลจะไม่ถูกส่งออกจากอุปกรณ์ของคุณ
            </p>
          </div>

          <Button
            className="h-10 w-full"
            onClick={() => {
              window.localStorage.setItem("scanner-permission-seen", "1");
              setHasSeenScannerPermission(true);
              setShowScannerPermission(false);
              setShowScanner(true);
            }}
          >
            เข้าใจแล้ว เริ่มใช้สแกนเนอร์
          </Button>
        </div>
      </SlideUpSheet>

      {/* Scanner Sheet */}
      <SlideUpSheet
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="สแกนบาร์โค้ดสินค้า"
      >
        <div className="p-4">
          <BarcodeScanner
            isOpen={showScanner}
            onResult={handleBarcodeResult}
            onClose={() => setShowScanner(false)}
          />
        </div>
      </SlideUpSheet>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * BarcodeScanner Component
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
