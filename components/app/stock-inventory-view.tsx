"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Package, ScanBarcode, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BarcodeScannerPanel } from "@/components/app/barcode-scanner-panel";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import {
  StockTabEmptyState,
  StockTabErrorState,
  StockTabLoadingState,
  StockTabToolbar,
} from "@/components/app/stock-tab-feedback";
import { authFetch } from "@/lib/auth/client-token";
import type { StockProductOption } from "@/lib/inventory/queries";
import type { ProductListItem } from "@/lib/products/service";

type StockInventoryViewProps = {
  products: StockProductOption[];
  storeOutStockThreshold: number;
  storeLowStockThreshold: number;
  pageSize: number;
  initialHasMore: boolean;
};

type FilterOption = "all" | "low" | "out";
type SortOption = "name" | "sku" | "stock-low" | "stock-high";

const SCANNER_PERMISSION_STORAGE_KEY = "scanner-permission-seen";
const INVENTORY_Q_QUERY_KEY = "inventoryQ";
const INVENTORY_FILTER_QUERY_KEY = "inventoryFilter";
const INVENTORY_SORT_QUERY_KEY = "inventorySort";

function parseInventoryFilter(value: string | null): FilterOption | null {
  if (value === "all" || value === "low" || value === "out") {
    return value;
  }
  return null;
}

function parseInventorySort(value: string | null): SortOption | null {
  if (
    value === "name" ||
    value === "sku" ||
    value === "stock-low" ||
    value === "stock-high"
  ) {
    return value;
  }
  return null;
}

function mergeUniqueProducts(
  prev: StockProductOption[],
  incoming: StockProductOption[],
) {
  const existingIds = new Set(prev.map((item) => item.productId));
  const merged = [...prev];
  for (const item of incoming) {
    if (!existingIds.has(item.productId)) {
      merged.push(item);
      existingIds.add(item.productId);
    }
  }
  return merged;
}

export function StockInventoryView({
  products,
  storeOutStockThreshold,
  storeLowStockThreshold,
  pageSize,
  initialHasMore,
}: StockInventoryViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabQuery = searchParams.get("tab");
  const isInventoryTabActive = tabQuery === null || tabQuery === "inventory";
  const searchQueryFromUrl = searchParams.get(INVENTORY_Q_QUERY_KEY)?.trim() ?? "";
  const filterFromUrl =
    parseInventoryFilter(searchParams.get(INVENTORY_FILTER_QUERY_KEY)) ?? "all";
  const sortByFromUrl =
    parseInventorySort(searchParams.get(INVENTORY_SORT_QUERY_KEY)) ?? "name";

  const [productItems, setProductItems] = useState(products);
  const [productPage, setProductPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(initialHasMore);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [isSearchingByBarcode, setIsSearchingByBarcode] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    products.length > 0 ? new Date().toISOString() : null,
  );

  const [searchQuery, setSearchQuery] = useState(searchQueryFromUrl);
  const [searchQueryForUrlSync, setSearchQueryForUrlSync] = useState(searchQueryFromUrl);
  const [filter, setFilter] = useState<FilterOption>(filterFromUrl);
  const [sortBy, setSortBy] = useState<SortOption>(sortByFromUrl);
  const [showScanner, setShowScanner] = useState(false);
  const [showScannerPermission, setShowScannerPermission] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);

  useEffect(() => {
    setProductItems(products);
    setProductPage(1);
    setHasMoreProducts(initialHasMore);
    if (products.length > 0) {
      setLastUpdatedAt(new Date().toISOString());
    }
  }, [initialHasMore, products]);

  useEffect(() => {
    const seen = window.localStorage.getItem(SCANNER_PERMISSION_STORAGE_KEY) === "1";
    setHasSeenScannerPermission(seen);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQueryForUrlSync(searchQuery.trim());
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!isInventoryTabActive) {
      return;
    }

    setSearchQuery((prev) => (prev === searchQueryFromUrl ? prev : searchQueryFromUrl));
    setSearchQueryForUrlSync((prev) =>
      prev === searchQueryFromUrl ? prev : searchQueryFromUrl,
    );
    setFilter((prev) => (prev === filterFromUrl ? prev : filterFromUrl));
    setSortBy((prev) => (prev === sortByFromUrl ? prev : sortByFromUrl));
  }, [
    isInventoryTabActive,
    searchQueryFromUrl,
    filterFromUrl,
    sortByFromUrl,
  ]);

  useEffect(() => {
    if (!isInventoryTabActive) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (searchQueryForUrlSync) {
      if (params.get(INVENTORY_Q_QUERY_KEY) !== searchQueryForUrlSync) {
        params.set(INVENTORY_Q_QUERY_KEY, searchQueryForUrlSync);
        changed = true;
      }
    } else if (params.has(INVENTORY_Q_QUERY_KEY)) {
      params.delete(INVENTORY_Q_QUERY_KEY);
      changed = true;
    }

    if (filter === "all") {
      if (params.has(INVENTORY_FILTER_QUERY_KEY)) {
        params.delete(INVENTORY_FILTER_QUERY_KEY);
        changed = true;
      }
    } else if (params.get(INVENTORY_FILTER_QUERY_KEY) !== filter) {
      params.set(INVENTORY_FILTER_QUERY_KEY, filter);
      changed = true;
    }

    if (sortBy === "name") {
      if (params.has(INVENTORY_SORT_QUERY_KEY)) {
        params.delete(INVENTORY_SORT_QUERY_KEY);
        changed = true;
      }
    } else if (params.get(INVENTORY_SORT_QUERY_KEY) !== sortBy) {
      params.set(INVENTORY_SORT_QUERY_KEY, sortBy);
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
    filter,
    isInventoryTabActive,
    pathname,
    router,
    searchParams,
    searchQueryForUrlSync,
    sortBy,
  ]);

  const resolveThresholds = useCallback(
    (product: StockProductOption) => {
      const outThreshold = product.outStockThreshold ?? storeOutStockThreshold;
      const lowThreshold = Math.max(
        product.lowStockThreshold ?? storeLowStockThreshold,
        outThreshold,
      );

      return { outThreshold, lowThreshold };
    },
    [storeLowStockThreshold, storeOutStockThreshold],
  );

  const filteredAndSortedProducts = useMemo(() => {
    let items = [...productItems];

    if (filter === "low") {
      items = items.filter((p) => {
        const { outThreshold, lowThreshold } = resolveThresholds(p);
        return p.available > outThreshold && p.available <= lowThreshold;
      });
    } else if (filter === "out") {
      items = items.filter((p) => {
        const { outThreshold } = resolveThresholds(p);
        return p.available <= outThreshold;
      });
    }

    const keyword = searchQuery.trim().toLowerCase();
    if (keyword) {
      items = items.filter((p) =>
        [p.sku, p.name].join(" ").toLowerCase().includes(keyword),
      );
    }

    items.sort((a, b) => {
      switch (sortBy) {
        case "sku":
          return a.sku.localeCompare(b.sku, "th");
        case "name":
          return a.name.localeCompare(b.name, "th");
        case "stock-low":
          return a.available - b.available;
        case "stock-high":
          return b.available - a.available;
        default:
          return 0;
      }
    });

    return items;
  }, [filter, productItems, resolveThresholds, searchQuery, sortBy]);

  const stats = useMemo(() => {
    let low = 0;
    let out = 0;
    let good = 0;

    productItems.forEach((product) => {
      const { outThreshold, lowThreshold } = resolveThresholds(product);
      if (product.available <= outThreshold) {
        out += 1;
      } else if (product.available <= lowThreshold) {
        low += 1;
      } else {
        good += 1;
      }
    });

    return { low, out, good };
  }, [productItems, resolveThresholds]);

  const highlightProduct = useCallback((productId: string) => {
    window.setTimeout(() => {
      const element = document.getElementById(`product-${productId}`);
      if (!element) {
        return;
      }
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-primary");
      window.setTimeout(() => {
        element.classList.remove("ring-2", "ring-primary");
      }, 2000);
    }, 100);
  }, []);

  const fetchStockProductsPage = useCallback(
    async (page: number) => {
      const res = await authFetch(
        `/api/stock/products?page=${page}&pageSize=${pageSize}`,
      );
      const data = (await res.json().catch(() => null)) as
        | {
            products?: StockProductOption[];
            hasMore?: boolean;
            message?: string;
            page?: number;
          }
        | null;

      if (!res.ok) {
        throw new Error(data?.message ?? "โหลดรายการสต็อกไม่สำเร็จ");
      }

      if (!Array.isArray(data?.products)) {
        throw new Error("รูปแบบข้อมูลรายการสต็อกไม่ถูกต้อง");
      }

      return {
        products: data.products,
        hasMore: Boolean(data.hasMore),
        page: Number(data.page ?? page),
      };
    },
    [pageSize],
  );

  const refreshInventoryData = useCallback(async () => {
    setIsRefreshingData(true);
    try {
      const next = await fetchStockProductsPage(1);
      setProductItems(next.products);
      setProductPage(next.page);
      setHasMoreProducts(next.hasMore);
      setDataError(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่";
      setDataError(message);
    } finally {
      setIsRefreshingData(false);
    }
  }, [fetchStockProductsPage]);

  const loadMoreProducts = useCallback(
    async (options?: { silent?: boolean }) => {
      if (isLoadingMoreProducts || !hasMoreProducts) {
        return false;
      }

      setIsLoadingMoreProducts(true);
      try {
        const nextPage = productPage + 1;
        const next = await fetchStockProductsPage(nextPage);
        setProductItems((prev) => mergeUniqueProducts(prev, next.products));
        setProductPage(next.page);
        setHasMoreProducts(next.hasMore);
        setLastUpdatedAt(new Date().toISOString());
        return true;
      } catch (error) {
        if (!options?.silent) {
          const message =
            error instanceof Error
              ? error.message
              : "โหลดสินค้าหน้าถัดไปไม่สำเร็จ";
          toast.error(message);
        }
        return false;
      } finally {
        setIsLoadingMoreProducts(false);
      }
    },
    [fetchStockProductsPage, hasMoreProducts, isLoadingMoreProducts, productPage],
  );

  const resolveProductFromBarcode = useCallback(async (barcode: string) => {
    const res = await authFetch(
      `/api/products/search?q=${encodeURIComponent(barcode)}&includeStock=true`,
    );
    const data = (await res.json().catch(() => null)) as
      | {
          products?: ProductListItem[];
        }
      | null;

    if (!res.ok || !Array.isArray(data?.products)) {
      return null;
    }

    const exactMatch = data.products.find(
      (item) => item.barcode?.toLowerCase() === barcode.toLowerCase(),
    );
    return exactMatch ?? data.products[0] ?? null;
  }, []);

  const handleBarcodeResult = useCallback(
    async (barcode: string) => {
      setShowScanner(false);
      const trimmed = barcode.trim();
      if (!trimmed) {
        return;
      }

      setIsSearchingByBarcode(true);
      try {
        const matchedProduct = await resolveProductFromBarcode(trimmed);
        if (!matchedProduct) {
          setSearchQuery(trimmed);
          toast.error("ไม่พบสินค้าที่มีบาร์โค้ดนี้");
          return;
        }

        setFilter("all");
        setSearchQuery(matchedProduct.sku);

        const inCurrentList = productItems.some(
          (item) => item.productId === matchedProduct.id,
        );

        if (inCurrentList) {
          toast.success(`พบสินค้า: ${matchedProduct.name}`);
          highlightProduct(matchedProduct.id);
          return;
        }

        let loaded = false;
        let nextPage = productPage;
        let canLoadMore = hasMoreProducts;
        let attempts = 0;

        while (canLoadMore && attempts < 12) {
          attempts += 1;
          const result = await fetchStockProductsPage(nextPage + 1);
          setProductItems((prev) => mergeUniqueProducts(prev, result.products));
          setProductPage(result.page);
          setHasMoreProducts(result.hasMore);
          setLastUpdatedAt(new Date().toISOString());

          if (result.products.some((item) => item.productId === matchedProduct.id)) {
            loaded = true;
            break;
          }

          nextPage = result.page;
          canLoadMore = result.hasMore;
        }

        if (loaded) {
          toast.success(`พบสินค้า: ${matchedProduct.name}`);
          highlightProduct(matchedProduct.id);
          return;
        }

        toast.success(
          `พบสินค้า: ${matchedProduct.name} (อยู่นอกหน้ารายการที่โหลดตอนนี้)`,
        );
      } catch {
        toast.error("ค้นหาสินค้าจากบาร์โค้ดไม่สำเร็จ");
      } finally {
        setIsSearchingByBarcode(false);
      }
    },
    [
      fetchStockProductsPage,
      hasMoreProducts,
      highlightProduct,
      productItems,
      productPage,
      resolveProductFromBarcode,
    ],
  );

  const openScanner = () => {
    if (hasSeenScannerPermission) {
      setShowScanner(true);
    } else {
      setShowScannerPermission(true);
    }
  };

  return (
    <section className="space-y-4">
      <StockTabToolbar
        isRefreshing={isRefreshingData}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void refreshInventoryData();
        }}
      />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setFilter("out")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "out"
              ? "border-red-300 bg-red-50"
              : "bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs text-slate-600">สต็อกหมด</p>
          <p className="text-2xl font-bold text-red-600">{stats.out}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter("low")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "low"
              ? "border-amber-300 bg-amber-50"
              : "bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs text-slate-600">สต็อกต่ำ</p>
          <p className="text-2xl font-bold text-amber-600">{stats.low}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "all"
              ? "border-emerald-300 bg-emerald-50"
              : "bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs text-slate-600">ทั้งหมด</p>
          <p className="text-2xl font-bold text-emerald-600">
            {productItems.length.toLocaleString("th-TH")}
          </p>
        </button>
      </div>

      <article className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาสินค้า (SKU, ชื่อ)..."
                className="h-10 w-full rounded-md border pl-9 pr-9 text-sm outline-none ring-primary focus:ring-2"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-10 w-10 p-0"
              onClick={openScanner}
              disabled={isSearchingByBarcode}
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            >
              <option value="name">ชื่อ ก-ฮ</option>
              <option value="sku">SKU</option>
              <option value="stock-low">สต็อกน้อย-มาก</option>
              <option value="stock-high">สต็อกมาก-น้อย</option>
            </select>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          แสดง {filteredAndSortedProducts.length.toLocaleString("th-TH")} จาก{" "}
          {productItems.length.toLocaleString("th-TH")} รายการ
        </p>
      </article>

      {isRefreshingData && productItems.length === 0 ? (
        <StockTabLoadingState message="กำลังอัปเดตรายการสต็อก..." />
      ) : dataError && productItems.length === 0 ? (
        <StockTabErrorState
          message={dataError}
          onRetry={() => {
            void refreshInventoryData();
          }}
        />
      ) : productItems.length === 0 ? (
        <StockTabEmptyState
          title="ยังไม่มีรายการสต็อก"
          description="ตรวจสอบสิทธิ์หรือกดรีเฟรชอีกครั้ง"
        />
      ) : (
        <>
          <div className="space-y-2">
            {filteredAndSortedProducts.length === 0 ? (
              <article className="rounded-xl border bg-white p-8 text-center shadow-sm">
                <Package className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-2 text-sm text-slate-600">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>
              </article>
            ) : (
              filteredAndSortedProducts.map((product) => {
                const { outThreshold, lowThreshold } = resolveThresholds(product);
                const stockStatus =
                  product.available <= outThreshold
                    ? "out"
                    : product.available <= lowThreshold
                      ? "low"
                      : "good";

                return (
                  <article
                    key={product.productId}
                    id={`product-${product.productId}`}
                    className="rounded-xl border bg-white p-4 shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <p className="text-xs text-slate-500">{product.sku}</p>
                            <p className="text-sm font-medium">{product.name}</p>
                            <p className="text-xs text-slate-500">
                              หน่วยหลัก: {product.baseUnitCode}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${
                              product.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {product.active ? "ใช้งาน" : "ปิด"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-xs text-slate-600">คงเหลือ</p>
                            <p className="text-lg font-bold text-slate-900">
                              {product.onHand.toLocaleString("th-TH")}
                            </p>
                          </div>

                          <div className="rounded-lg bg-amber-50 p-2">
                            <p className="text-xs text-amber-700">จอง</p>
                            <p className="text-lg font-bold text-amber-900">
                              {product.reserved.toLocaleString("th-TH")}
                            </p>
                          </div>

                          <div
                            className={`rounded-lg p-2 ${
                              stockStatus === "out"
                                ? "bg-red-50"
                                : stockStatus === "low"
                                  ? "bg-amber-50"
                                  : "bg-emerald-50"
                            }`}
                          >
                            <p
                              className={`text-xs ${
                                stockStatus === "out"
                                  ? "text-red-700"
                                  : stockStatus === "low"
                                    ? "text-amber-700"
                                    : "text-emerald-700"
                              }`}
                            >
                              พร้อมขาย
                            </p>
                            <p
                              className={`text-lg font-bold ${
                                stockStatus === "out"
                                  ? "text-red-900"
                                  : stockStatus === "low"
                                    ? "text-amber-900"
                                    : "text-emerald-900"
                              }`}
                            >
                              {product.available.toLocaleString("th-TH")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {hasMoreProducts ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void loadMoreProducts();
                }}
                disabled={isLoadingMoreProducts}
              >
                {isLoadingMoreProducts ? "กำลังโหลด..." : "โหลดเพิ่ม"}
              </Button>
            </div>
          ) : null}
        </>
      )}

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
                setShowScannerPermission(false);
                setShowScanner(true);
                window.localStorage.setItem(SCANNER_PERMISSION_STORAGE_KEY, "1");
                setHasSeenScannerPermission(true);
              }}
            >
              อนุญาตและสแกน
            </Button>
          </div>
        </div>
      </SlideUpSheet>

      <SlideUpSheet
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="สแกนบาร์โค้ด"
        description="ส่องกล้องไปที่บาร์โค้ดสินค้า"
      >
        <div className="p-4">
          {showScanner ? (
            <BarcodeScannerPanel
              isOpen={showScanner}
              onResult={handleBarcodeResult}
              onClose={() => setShowScanner(false)}
              cameraSelectId="stock-inventory-barcode-scanner-camera-select"
            />
          ) : null}
        </div>
      </SlideUpSheet>
    </section>
  );
}
