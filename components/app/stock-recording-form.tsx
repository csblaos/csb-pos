"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, ScanBarcode, Search, X } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { BarcodeScannerPanel } from "@/components/app/barcode-scanner-panel";
import {
  StockTabEmptyState,
  StockTabErrorState,
  StockTabLoadingState,
  StockTabToolbar,
} from "@/components/app/stock-tab-feedback";
import { authFetch } from "@/lib/auth/client-token";
import { createTranslator, formatNumberByLanguage } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import type {
  InventoryMovementView,
  StockProductOption,
} from "@/lib/inventory/queries";
import type { ProductListItem } from "@/lib/products/service";

type StockRecordingFormProps = {
  language: AppLanguage;
  initialProducts: StockProductOption[];
  canCreate: boolean;
  canAdjust: boolean;
  canInbound: boolean;
};

type MovementType = "IN" | "ADJUST" | "RETURN";
type AdjustMode = "INCREASE" | "DECREASE";
const RECORDING_MOVEMENT_QUERY_KEY = "recordingType";
const RECORDING_PRODUCT_QUERY_KEY = "recordingProductId";

const movementBadgeClass: Record<InventoryMovementView["type"], string> = {
  IN: "bg-emerald-100 text-emerald-700",
  OUT: "bg-rose-100 text-rose-700",
  RESERVE: "bg-amber-100 text-amber-700",
  RELEASE: "bg-slate-200 text-slate-700",
  ADJUST: "bg-blue-100 text-blue-700",
  RETURN: "bg-purple-100 text-purple-700",
};

function parseMovementTypeQuery(value: string | null): MovementType | null {
  if (value === "IN" || value === "ADJUST" || value === "RETURN") {
    return value;
  }
  return null;
}

export function StockRecordingForm({
  language,
  initialProducts,
  canCreate,
  canAdjust,
  canInbound,
}: StockRecordingFormProps) {
  const t = useMemo(() => createTranslator(language), [language]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRecordingTabActive = searchParams.get("tab") === "recording";
  const movementTypeFromQuery = parseMovementTypeQuery(
    searchParams.get(RECORDING_MOVEMENT_QUERY_KEY),
  );
  const productIdFromQuery =
    searchParams.get(RECORDING_PRODUCT_QUERY_KEY)?.trim() ?? "";
  const [productItems, setProductItems] = useState(initialProducts);
  const [recentMovements, setRecentMovements] = useState<InventoryMovementView[]>([]);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    initialProducts.length > 0 ? new Date().toISOString() : null,
  );

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
  const movementLabels = useMemo<Record<MovementType, string>>(
    () => ({
      IN: t("stock.history.type.in"),
      ADJUST: t("stock.history.type.adjust"),
      RETURN: t("stock.history.type.return"),
    }),
    [t],
  );
  const movementTypeLabels = useMemo<Record<InventoryMovementView["type"], string>>(
    () => ({
      IN: t("stock.history.type.in"),
      OUT: t("stock.history.type.out"),
      RESERVE: t("stock.history.type.reserve"),
      RELEASE: t("stock.history.type.release"),
      ADJUST: t("stock.history.type.adjust"),
      RETURN: t("stock.history.type.return"),
    }),
    [t],
  );

  const [productId, setProductId] = useState<string>(productIdFromQuery);
  const [movementType, setMovementType] = useState<MovementType>(() => {
    if (
      movementTypeFromQuery &&
      movementTypeOptions.includes(movementTypeFromQuery)
    ) {
      return movementTypeFromQuery;
    }
    return movementTypeOptions[0] ?? "IN";
  });
  const [unitId, setUnitId] = useState<string>("");
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
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerQuery, setProductPickerQuery] = useState("");
  const [currentStock, setCurrentStock] = useState<{
    onHand: number;
    available: number;
    reserved: number;
  } | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showScannerPermission, setShowScannerPermission] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const [isUsageGuideOpen, setIsUsageGuideOpen] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchCurrentStock = useCallback(async (prodId: string) => {
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
  }, []);

  useEffect(() => {
    if (initialProducts.length === 0) {
      return;
    }
    if (productItems.length === 0) {
      setProductItems(initialProducts);
      setLastUpdatedAt(new Date().toISOString());
    }
  }, [initialProducts, productItems.length]);

  useEffect(() => {
    if (productItems.length === 0) {
      setProductId("");
      setUnitId("");
      return;
    }

    const matchedProduct = productItems.find((item) => item.productId === productId);
    if (!matchedProduct) {
      setProductId(productItems[0].productId);
      setUnitId(productItems[0].unitOptions[0]?.unitId ?? "");
      return;
    }

    const matchedUnit = matchedProduct.unitOptions.find((item) => item.unitId === unitId);
    if (!matchedUnit) {
      setUnitId(matchedProduct.unitOptions[0]?.unitId ?? "");
    }
  }, [productId, productItems, unitId]);

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
    if (!isRecordingTabActive) {
      return;
    }

    const nextMovementType = parseMovementTypeQuery(
      searchParams.get(RECORDING_MOVEMENT_QUERY_KEY),
    );
    if (
      nextMovementType &&
      movementTypeOptions.includes(nextMovementType) &&
      nextMovementType !== movementType
    ) {
      setMovementType(nextMovementType);
    }

    const nextProductId =
      searchParams.get(RECORDING_PRODUCT_QUERY_KEY)?.trim() ?? "";
    if (!nextProductId || nextProductId === productId) {
      return;
    }
    if (productItems.some((item) => item.productId === nextProductId)) {
      setProductId(nextProductId);
      void fetchCurrentStock(nextProductId);
    }
  }, [
    fetchCurrentStock,
    movementType,
    movementTypeOptions,
    productId,
    productItems,
    isRecordingTabActive,
    searchParams,
  ]);

  useEffect(() => {
    if (!isRecordingTabActive) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const defaultMovementType = movementTypeOptions[0] ?? "IN";
    let changed = false;

    if (movementType === defaultMovementType) {
      if (params.has(RECORDING_MOVEMENT_QUERY_KEY)) {
        params.delete(RECORDING_MOVEMENT_QUERY_KEY);
        changed = true;
      }
    } else if (params.get(RECORDING_MOVEMENT_QUERY_KEY) !== movementType) {
      params.set(RECORDING_MOVEMENT_QUERY_KEY, movementType);
      changed = true;
    }

    if (productId) {
      if (params.get(RECORDING_PRODUCT_QUERY_KEY) !== productId) {
        params.set(RECORDING_PRODUCT_QUERY_KEY, productId);
        changed = true;
      }
    } else if (params.has(RECORDING_PRODUCT_QUERY_KEY)) {
      params.delete(RECORDING_PRODUCT_QUERY_KEY);
      changed = true;
    }

    if (!changed) {
      return;
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [
    isRecordingTabActive,
    movementType,
    movementTypeOptions,
    pathname,
    productId,
    router,
    searchParams,
  ]);

  const selectedProduct = useMemo(
    () => productItems.find((item) => item.productId === productId),
    [productId, productItems],
  );

  const selectedUnit = selectedProduct?.unitOptions.find((unit) => unit.unitId === unitId);

  const filteredProductItems = useMemo(() => {
    const query = productPickerQuery.trim().toLowerCase();
    if (!query) {
      return productItems;
    }
    return productItems.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query)
      );
    });
  }, [productItems, productPickerQuery]);

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
        toast.error(t("stock.recording.searchProductsFailed"));
      } finally {
        setIsSearching(false);
      }
    },
    [t],
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

  const refreshRecordingData = useCallback(async () => {
    setIsRefreshingData(true);
    try {
      const res = await authFetch("/api/stock/movements");
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            products?: StockProductOption[];
            message?: string;
          }
        | null;

      if (!res.ok) {
        setDataError(data?.message ?? t("stock.recording.loadTabFailed"));
        return;
      }

      if (!data?.ok || !Array.isArray(data.products)) {
        setDataError(t("stock.recording.invalidProductData"));
        return;
      }

      setProductItems(data.products);
      setDataError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch {
      setDataError(t("stock.recording.connectionFailed"));
    } finally {
      setIsRefreshingData(false);
    }
  }, [t]);

  const quickPresets = useMemo(() => {
    const presets: {
      id: string;
      label: string;
      movementType: MovementType;
      adjustMode?: AdjustMode;
      noteTemplate: string;
    }[] = [];

    if (canInbound) {
      presets.push({
        id: "inbound",
        label: t("stock.recording.preset.inbound"),
        movementType: "IN",
        noteTemplate: t("stock.recording.preset.inboundNote"),
      });
    }

    if (canAdjust) {
      presets.push({
        id: "adjust",
        label: t("stock.recording.preset.adjust"),
        movementType: "ADJUST",
        adjustMode: "INCREASE",
        noteTemplate: t("stock.recording.preset.adjustNote"),
      });
      presets.push({
        id: "waste",
        label: t("stock.recording.preset.waste"),
        movementType: "ADJUST",
        adjustMode: "DECREASE",
        noteTemplate: t("stock.recording.preset.wasteNote"),
      });
    }

    return presets;
  }, [canAdjust, canInbound, t]);

  const applyPreset = useCallback(
    (preset: {
      movementType: MovementType;
      adjustMode?: AdjustMode;
      noteTemplate: string;
    }) => {
      setMovementType(preset.movementType);
      if (preset.adjustMode) {
        setAdjustMode(preset.adjustMode);
      }
      setNote(preset.noteTemplate);
    },
    [],
  );

  const buildIdempotencyKey = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `stock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const focusQtyInput = useCallback(() => {
    window.setTimeout(() => {
      document.getElementById("stock-qty")?.focus();
    }, 100);
  }, []);

  const applySelectedProduct = useCallback(
    (nextProductId: string, nextBaseUnitId: string) => {
      setProductId(nextProductId);
      setUnitId(nextBaseUnitId);
      setSearchQuery("");
      setShowSearchDropdown(false);
      setShowProductPicker(false);
      setProductPickerQuery("");
      void fetchCurrentStock(nextProductId);
      focusQtyInput();
    },
    [fetchCurrentStock, focusQtyInput],
  );

  const selectProductFromSearch = (product: ProductListItem) => {
    const exists = productItems.find((item) => item.productId === product.id);
    if (!exists) {
      const unitOptions = product.conversions.map((conv) => ({
        unitId: conv.unitId,
        unitCode: conv.unitCode,
        unitNameTh: conv.unitNameTh,
        multiplierToBase: conv.multiplierToBase,
      }));

      const nextProduct: StockProductOption = {
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
      setProductItems((prev) => [nextProduct, ...prev]);
    }
    applySelectedProduct(product.id, product.baseUnitId);
  };

  const selectProductFromPicker = useCallback(
    (product: StockProductOption) => {
      applySelectedProduct(product.productId, product.baseUnitId);
    },
    [applySelectedProduct],
  );

  const jumpToPurchaseTab = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "purchase");
    router.push(`?${params.toString()}`);
  }, [router]);

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
          toast.success(t("stock.recording.barcodeFound", { name: exactMatch.name }));
        } else if (products.length > 0) {
          selectProductFromSearch(products[0]);
          toast.success(t("stock.recording.barcodeFound", { name: products[0].name }));
        } else {
          toast.error(t("stock.recording.barcodeNotFound"));
        }
      }
    } catch {
      toast.error(t("stock.recording.barcodeSearchFailed"));
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
      setErrorMessage(t("stock.recording.noPermission"));
      return;
    }

    if (!productId) {
      setErrorMessage(t("stock.recording.chooseProduct"));
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/stock/movements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": buildIdempotencyKey(),
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
      setErrorMessage(data?.message ?? t("stock.recording.saveFailed"));
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
          createdByName: t("stock.recording.currentUser"),
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

    setSuccessMessage(`✅ ${t("stock.recording.savedSuccess")}`);
    setNote("");
    setQty("1");
    setLastUpdatedAt(new Date().toISOString());
    setLoading(false);
  };

  return (
    <section className="space-y-4">
      <StockTabToolbar
        language={language}
        isRefreshing={isRefreshingData}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void refreshRecordingData();
        }}
      />

      {/* Help Text Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-blue-900">{t("stock.recording.guideTitle")}</p>
            <p className="mt-1 text-xs text-blue-800">
              {t("stock.recording.guideDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsUsageGuideOpen((current) => !current)}
            aria-expanded={isUsageGuideOpen}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-800 transition hover:bg-blue-100"
          >
            {isUsageGuideOpen ? t("stock.recording.guideHide") : t("stock.recording.guideShow")}
            {isUsageGuideOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
        {isUsageGuideOpen ? (
          <ul className="mt-2 space-y-1 text-xs text-blue-700">
            <li>• {t("stock.recording.guideItem.stockTake")}</li>
            <li>• {t("stock.recording.guideItem.customerReturn")}</li>
            <li>• {t("stock.recording.guideItem.branchTransfer")}</li>
            <li>• {t("stock.recording.guideItem.sample")}</li>
          </ul>
        ) : null}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold">{t("stock.recording.purchaseWarningTitle")}</p>
        <p className="mt-1">
          {t("stock.recording.purchaseWarningDescription")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2 h-8 border-amber-200 bg-white px-3 text-xs text-amber-800 hover:bg-amber-100"
          onClick={jumpToPurchaseTab}
        >
          {t("stock.recording.goToPurchase")}
        </Button>
      </div>

      {quickPresets.length > 0 ? (
        <article className="space-y-2 rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs font-medium text-slate-700">{t("stock.recording.frequentShortcuts")}</p>
          <div className="flex flex-wrap gap-2">
            {quickPresets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => applyPreset(preset)}
                disabled={loading}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </article>
      ) : null}

      {isRefreshingData && productItems.length === 0 ? (
        <StockTabLoadingState
          language={language}
          message={t("stock.feedback.loadingData")}
        />
      ) : dataError && productItems.length === 0 ? (
        <StockTabErrorState
          language={language}
          message={dataError}
          onRetry={() => {
            void refreshRecordingData();
          }}
        />
      ) : productItems.length === 0 ? (
        <StockTabEmptyState
          language={language}
          title={t("stock.recording.selectProductTitle")}
          description={t("stock.inventory.emptyDescription")}
        />
      ) : null}

      {productItems.length > 0 ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{t("stock.recording.entryFormTitle")}</h2>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-product-search">
            {t("stock.recording.product")}
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
                  placeholder={t("stock.recording.searchPlaceholder")}
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

            <Button
              type="button"
              variant="outline"
              className="mt-2 h-9 w-full text-xs sm:hidden"
              onClick={() => setShowProductPicker(true)}
              disabled={loading || productItems.length === 0}
            >
              {t("stock.recording.viewAllProducts", {
                count: formatNumberByLanguage(language, productItems.length),
              })}
            </Button>

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
                          {t("stock.recording.remaining", {
                            count: formatNumberByLanguage(language, product.stock.onHand),
                            unit: product.baseUnitCode,
                          })}
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
              <p className="font-medium text-blue-900">📦 {t("stock.recording.currentStock")}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-blue-700">{t("stock.inventory.onHand")}</p>
                  <p className="font-semibold text-blue-900">
                    {currentStock.onHand.toLocaleString("th-TH")}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">{t("stock.inventory.reserved")}</p>
                  <p className="font-semibold text-blue-900">
                    {currentStock.reserved.toLocaleString("th-TH")}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">{t("stock.inventory.available")}</p>
                  <p className={`font-semibold ${currentStock.available < 0 ? "text-red-600" : "text-blue-900"}`}>
                    {currentStock.available.toLocaleString("th-TH")}
                  </p>
                </div>
              </div>

              {qtyBasePreview !== null && (
                <div className="mt-2 border-t border-blue-200 pt-2">
                  <p className="text-blue-700">{t("stock.recording.afterThisAction")}</p>
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
            <p className="text-xs text-slate-500">{t("stock.recording.loadingStock")}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-type">
              {t("stock.recording.type")}
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
                  {movementLabels[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-unit">
              {t("stock.recording.unit")}
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
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-8 border-amber-200 bg-white px-3 text-xs text-amber-800 hover:bg-amber-100"
              onClick={jumpToPurchaseTab}
            >
              ไปแท็บสั่งซื้อ (PO)
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-qty">
              {t("stock.recording.quantity")}
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
                {t("stock.recording.adjustMode")}
              </label>
              <select
                id="stock-adjust-mode"
                value={adjustMode}
                onChange={(event) => setAdjustMode(event.target.value as AdjustMode)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loading}
              >
                <option value="INCREASE">{t("stock.recording.adjustIncrease")}</option>
                <option value="DECREASE">{t("stock.recording.adjustDecrease")}</option>
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-note">
            {t("stock.recording.note")}
          </label>
          <textarea
            id="stock-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
            placeholder={t("stock.recording.notePlaceholder")}
          />
        </div>

        <p className="text-xs text-blue-700">
          {selectedUnit && qtyBasePreview !== null
            ? t("stock.recording.baseQtyPreview", {
                count: formatNumberByLanguage(language, qtyBasePreview),
                unit: selectedProduct?.baseUnitCode ?? t("stock.inventory.baseUnit"),
              })
            : t("stock.recording.baseQtyPreviewInvalid")}
        </p>

        {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        {dataError && productItems.length > 0 ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-700">{dataError}</p>
            <Button
              type="button"
              variant="outline"
              className="h-7 border-red-200 bg-white px-2.5 text-xs text-red-700 hover:bg-red-100"
              onClick={() => {
                void refreshRecordingData();
              }}
            >
              {t("stock.feedback.retry")}
            </Button>
          </div>
        ) : null}

        <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-8px_20px_-18px_rgba(15,23,42,0.45)] supports-[backdrop-filter]:bg-white/85 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none">
          <Button
            className="h-11 w-full"
            onClick={submitMovement}
            disabled={loading || !canCreate || !productId}
          >
            {loading ? t("stock.recording.saving") : t("stock.recording.save")}
          </Button>
        </div>
        </article>
      ) : null}

      {/* รายการที่บันทึกเมื่อสักครู่ */}
      {recentMovements.length > 0 && (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("stock.recording.recentTitle")}</h2>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("tab", "history");
                router.push(`?${params.toString()}`);
              }}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              {t("stock.recording.viewAllHistory")}
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
                    {movementTypeLabels[movement.type]}
                  </span>
                </div>

                <p className="mt-2 text-sm">
                  {t("stock.recording.baseQty")} {movement.qtyBase.toLocaleString("th-TH")}
                </p>

                {movement.note && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("stock.recording.notePrefix")} {movement.note}
                  </p>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  {t("stock.recording.byUserAt", {
                    user: movement.createdByName ?? "-",
                    dateTime: new Date(movement.createdAt).toLocaleString("th-TH"),
                  })}
                </p>
              </div>
            ))}
          </div>
        </article>
      )}

      <SlideUpSheet
        isOpen={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        title={t("stock.recording.selectProductTitle")}
        description={t("stock.recording.selectProductDescription", {
          count: formatNumberByLanguage(language, productItems.length),
        })}
      >
        <div className="space-y-3">
          <input
            type="text"
            value={productPickerQuery}
            onChange={(event) => setProductPickerQuery(event.target.value)}
            className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-primary focus:ring-2"
            placeholder={t("stock.recording.selectProductSearch")}
          />

          <div className="max-h-[56dvh] space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
            {filteredProductItems.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                {t("stock.recording.selectProductEmpty")}
              </p>
            ) : (
              filteredProductItems.map((item) => (
                <button
                  key={item.productId}
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                    item.productId === productId
                      ? "bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                      : "hover:bg-slate-50"
                  }`}
                  onClick={() => selectProductFromPicker(item)}
                >
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.sku}</p>
                  <p className="text-xs text-slate-500">
                    {t("stock.recording.remaining", {
                      count: formatNumberByLanguage(language, item.onHand),
                      unit: item.baseUnitCode,
                    })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </SlideUpSheet>

      {/* Scanner Permission Sheet */}
      <SlideUpSheet
        isOpen={showScannerPermission}
        onClose={() => setShowScannerPermission(false)}
        title={t("stock.inventory.scannerPermissionTitle")}
        description={t("stock.inventory.scannerPermissionDescription")}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">{t("stock.inventory.scannerWhy")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>{t("stock.inventory.scannerWhyFast")}</li>
              <li>{t("stock.inventory.scannerWhyLessError")}</li>
              <li>{t("stock.inventory.scannerWhyInline")}</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              onClick={() => setShowScannerPermission(false)}
            >
              {t("common.cancel")}
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
              {t("stock.inventory.allowAndScan")}
            </Button>
          </div>
        </div>
      </SlideUpSheet>

      {/* Scanner Sheet */}
      <SlideUpSheet
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title={t("stock.inventory.scannerTitle")}
        description={t("stock.inventory.scannerDescription")}
      >
        <div className="p-4">
          <BarcodeScannerPanel
            isOpen={showScanner}
            onResult={handleBarcodeResult}
            onClose={() => setShowScanner(false)}
            cameraSelectId="stock-recording-barcode-scanner-camera-select"
          />
        </div>
      </SlideUpSheet>
    </section>
  );
}
