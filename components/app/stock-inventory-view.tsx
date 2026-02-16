"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Package, ScanBarcode, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import type { StockProductOption } from "@/lib/inventory/queries";

type StockInventoryViewProps = {
  products: StockProductOption[];
  storeOutStockThreshold: number;
  storeLowStockThreshold: number;
};

type FilterOption = "all" | "low" | "out";
type SortOption = "name" | "sku" | "stock-low" | "stock-high";

export function StockInventoryView({
  products,
  storeOutStockThreshold,
  storeLowStockThreshold,
}: StockInventoryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [showScanner, setShowScanner] = useState(false);
  const [showScannerPermission, setShowScannerPermission] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const seen = window.localStorage.getItem("scanner-permission-seen") === "1";
    setHasSeenScannerPermission(seen);
  }, []);

  const resolveThresholds = useCallback((product: StockProductOption) => {
    const outThreshold = product.outStockThreshold ?? storeOutStockThreshold;
    const lowThreshold = Math.max(
      product.lowStockThreshold ?? storeLowStockThreshold,
      outThreshold,
    );

    return { outThreshold, lowThreshold };
  }, [storeOutStockThreshold, storeLowStockThreshold]);

  const filteredAndSortedProducts = useMemo(() => {
    let items = [...products];

    // Filter
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

    // Search
    const keyword = searchQuery.trim().toLowerCase();
    if (keyword) {
      items = items.filter((p) =>
        [p.sku, p.name].join(" ").toLowerCase().includes(keyword),
      );
    }

    // Sort
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
  }, [products, filter, searchQuery, sortBy, resolveThresholds]);

  const stats = useMemo(() => {
    let low = 0;
    let out = 0;
    let good = 0;

    products.forEach((product) => {
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
  }, [products, resolveThresholds]);

  const handleBarcodeResult = (barcode: string) => {
    setShowScanner(false);

    const keyword = barcode.trim().toLowerCase();
    const matchedProduct = products.find(
      (p) =>
        p.sku.toLowerCase() === keyword ||
        p.name.toLowerCase().includes(keyword),
    );

    if (matchedProduct) {
      setSearchQuery(barcode);
      toast.success(`พบสินค้า: ${matchedProduct.name}`);
      
      // Focus on the matched product by scrolling
      setTimeout(() => {
        const element = document.getElementById(`product-${matchedProduct.productId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("ring-2", "ring-primary");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-primary");
          }, 2000);
        }
      }, 100);
    } else {
      setSearchQuery(barcode);
      toast.error("ไม่พบสินค้าที่มีบาร์โค้ดนี้");
    }
  };

  const openScanner = () => {
    if (hasSeenScannerPermission) {
      setShowScanner(true);
    } else {
      setShowScannerPermission(true);
    }
  };

  return (
    <section className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setFilter("out")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "out" ? "border-red-300 bg-red-50" : "bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs text-slate-600">สต็อกหมด</p>
          <p className="text-2xl font-bold text-red-600">{stats.out}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter("low")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "low" ? "border-amber-300 bg-amber-50" : "bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs text-slate-600">สต็อกต่ำ</p>
          <p className="text-2xl font-bold text-amber-600">{stats.low}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg border p-3 text-left transition-colors ${
            filter === "all" ? "border-emerald-300 bg-emerald-50" : "bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs text-slate-600">สต็อกปกติ</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.good}</p>
        </button>
      </div>

      {/* Search and Sort */}
      <article className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาสินค้า (SKU, ชื่อ, บาร์โค้ด)..."
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
          {products.length.toLocaleString("th-TH")} รายการ
        </p>
      </article>

      {/* Product List */}
      <div className="space-y-2">
        {filteredAndSortedProducts.length === 0 ? (
          <article className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm text-slate-600">ไม่พบสินค้า</p>
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

      {/* Scanner Permission Sheet */}
      <SlideUpSheet
        isOpen={showScannerPermission}
        onClose={() => setShowScannerPermission(false)}
        title="เปิดกล้องสแกนบาร์โค้ด"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm text-slate-700">
            แอปต้องการเข้าถึงกล้องเพื่อสแกนบาร์โค้ดของสินค้า
            กรุณาอนุญาตการเข้าถึงกล้องในขั้นตอนถัดไป
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setShowScannerPermission(false);
              setShowScanner(true);
              window.localStorage.setItem("scanner-permission-seen", "1");
              setHasSeenScannerPermission(true);
            }}
          >
            เข้าใจแล้ว เปิดกล้อง
          </Button>
        </div>
      </SlideUpSheet>

      {/* Barcode Scanner Sheet */}
      <SlideUpSheet
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="สแกนบาร์โค้ดสินค้า"
      >
        <div className="p-4">
          <BarcodeScanner onResult={handleBarcodeResult} onCancel={() => setShowScanner(false)} />
        </div>
      </SlideUpSheet>
    </section>
  );
}

// Barcode Scanner Component
function BarcodeScanner({
  onResult,
  onCancel,
}: {
  onResult: (barcode: string) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codeReaderRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reader: any = null;

    const initScanner = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        
        if (!mounted) return;

        reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        // List video devices using static method
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        
        if (!mounted) return;

        if (devices.length === 0) {
          setError("ไม่พบกล้อง กรุณาตรวจสอบว่าอุปกรณ์มีกล้องและอนุญาตการเข้าถึง");
          return;
        }

        setAvailableCameras(devices);

        const savedCamera = window.localStorage.getItem("preferred-camera");
        const preferredCamera = savedCamera && devices.find((d: MediaDeviceInfo) => d.deviceId === savedCamera)
          ? savedCamera
          : devices[devices.length - 1]?.deviceId || "";

        setSelectedCamera(preferredCamera);

        if (preferredCamera && videoRef.current) {
          setIsScanning(true);
          await reader.decodeFromVideoDevice(
            preferredCamera,
            videoRef.current,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result: any) => {
              if (result && mounted) {
                const text = result.getText();
                onResult(text);
                if (reader?.reset) {
                  reader.reset();
                }
              }
            },
          );
        }
      } catch (err) {
        if (mounted) {
          console.error("Scanner init error:", err);
          setError("ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงกล้อง");
        }
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (reader) {
        try {
          reader.reset?.();
        } catch (err) {
          console.error("Scanner cleanup error:", err);
        }
      }
    };
  }, [onResult]);

  const handleCameraChange = async (deviceId: string) => {
    setSelectedCamera(deviceId);
    window.localStorage.setItem("preferred-camera", deviceId);

    const reader = codeReaderRef.current;
    if (reader && videoRef.current) {
      try {
        if (reader.reset) {
          reader.reset();
        }
        setIsScanning(true);
        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result: any) => {
            if (result) {
              const text = result.getText();
              onResult(text);
              if (reader.reset) {
                reader.reset();
              }
            }
          },
        );
      } catch (err) {
        console.error("Camera switch error:", err);
        setError("ไม่สามารถเปลี่ยนกล้องได้");
      }
    }
  };

  return (
    <div className="space-y-4">
      {availableCameras.length > 1 && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">เลือกกล้อง</label>
          <select
            value={selectedCamera}
            onChange={(e) => handleCameraChange(e.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          >
            {availableCameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `กล้อง ${camera.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 border-2 border-primary bg-transparent" />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="text-center text-xs text-slate-600">
        วางบาร์โค้ดภายในกรอบสี่เหลี่ยม
      </p>

      <Button variant="outline" className="w-full" onClick={onCancel}>
        ยกเลิก
      </Button>
    </div>
  );
}
