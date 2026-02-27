"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  StockTabEmptyState,
  StockTabErrorState,
  StockTabLoadingState,
  StockTabToolbar,
} from "@/components/app/stock-tab-feedback";
import { authFetch } from "@/lib/auth/client-token";
import type { InventoryMovementView } from "@/lib/inventory/queries";

type StockMovementHistoryProps = {
  movements: InventoryMovementView[];
};

type MovementTypeFilter = "all" | "IN" | "OUT" | "ADJUST" | "RETURN";

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

const ITEMS_PER_PAGE = 50;
const VIRTUAL_ROW_ESTIMATE = 164;
const VIRTUAL_OVERSCAN = 4;

export function StockMovementHistory({ movements }: StockMovementHistoryProps) {
  const [movementItems, setMovementItems] = useState(movements);
  const [totalItems, setTotalItems] = useState(movements.length);
  const [typeFilter, setTypeFilter] = useState<MovementTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    movements.length > 0 ? new Date().toISOString() : null,
  );

  const [productQueryInput, setProductQueryInput] = useState("");
  const [dateFromInput, setDateFromInput] = useState("");
  const [dateToInput, setDateToInput] = useState("");
  const [appliedProductQuery, setAppliedProductQuery] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    setMovementItems(movements);
    setTotalItems(movements.length);
    setPage(1);
    setErrorMessage(null);
    setLastUpdatedAt(movements.length > 0 ? new Date().toISOString() : null);
  }, [movements]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setViewportHeight(entry.contentRect.height);
    });

    observer.observe(viewport);
    setViewportHeight(viewport.clientHeight);
    return () => observer.disconnect();
  }, []);

  const fetchHistory = useCallback(
    async (options?: { manual?: boolean; signal?: AbortSignal }) => {
      const isManual = options?.manual ?? false;
      setErrorMessage(null);
      if (isManual) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const params = new URLSearchParams({
          view: "history",
          page: String(page),
          pageSize: String(ITEMS_PER_PAGE),
        });

        if (typeFilter !== "all") {
          params.set("type", typeFilter);
        }
        if (appliedProductQuery) {
          params.set("q", appliedProductQuery);
        }
        if (appliedDateFrom) {
          params.set("dateFrom", appliedDateFrom);
        }
        if (appliedDateTo) {
          params.set("dateTo", appliedDateTo);
        }

        const res = await authFetch(`/api/stock/movements?${params.toString()}`, {
          signal: options?.signal,
        });
        const data = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              movements?: InventoryMovementView[];
              total?: number;
              message?: string;
            }
          | null;

        if (options?.signal?.aborted) {
          return;
        }

        if (!res.ok) {
          setErrorMessage(data?.message ?? "โหลดประวัติสต็อกไม่สำเร็จ");
          return;
        }

        if (!data?.ok || !Array.isArray(data.movements)) {
          setErrorMessage("รูปแบบข้อมูลประวัติสต็อกไม่ถูกต้อง");
          return;
        }

        setMovementItems(data.movements);
        setTotalItems(Number(data.total ?? data.movements.length));
        setErrorMessage(null);
        setLastUpdatedAt(new Date().toISOString());
      } catch {
        if (options?.signal?.aborted) {
          return;
        }
        setErrorMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        if (options?.signal?.aborted) {
          return;
        }
        if (isManual) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [appliedDateFrom, appliedDateTo, appliedProductQuery, page, typeFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    setScrollTop(0);
    viewportRef.current?.scrollTo({ top: 0 });
    void fetchHistory({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchHistory]);

  const stats = useMemo(() => {
    const counts = {
      IN: movementItems.filter((m) => m.type === "IN").length,
      OUT: movementItems.filter((m) => m.type === "OUT").length,
      ADJUST: movementItems.filter((m) => m.type === "ADJUST").length,
      RETURN: movementItems.filter((m) => m.type === "RETURN").length,
    };
    return counts;
  }, [movementItems]);

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const applyFilters = () => {
    if (dateFromInput && dateToInput && dateFromInput > dateToInput) {
      setErrorMessage("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      return;
    }

    setAppliedProductQuery(productQueryInput.trim());
    setAppliedDateFrom(dateFromInput);
    setAppliedDateTo(dateToInput);
    setPage(1);
  };

  const clearFilters = () => {
    setProductQueryInput("");
    setDateFromInput("");
    setDateToInput("");
    setAppliedProductQuery("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setPage(1);
  };

  const shouldVirtualize = movementItems.length > 24;
  const safeViewportHeight = Math.max(1, viewportHeight);
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_ESTIMATE) - VIRTUAL_OVERSCAN)
    : 0;
  const endIndex = shouldVirtualize
    ? Math.min(
        movementItems.length,
        Math.ceil((scrollTop + safeViewportHeight) / VIRTUAL_ROW_ESTIMATE) + VIRTUAL_OVERSCAN,
      )
    : movementItems.length;
  const visibleMovements = movementItems.slice(startIndex, endIndex);
  const paddingTop = shouldVirtualize ? startIndex * VIRTUAL_ROW_ESTIMATE : 0;
  const paddingBottom = shouldVirtualize
    ? (movementItems.length - endIndex) * VIRTUAL_ROW_ESTIMATE
    : 0;

  return (
    <section className="space-y-4">
      <StockTabToolbar
        isRefreshing={isRefreshing || isLoading}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void fetchHistory({ manual: true });
        }}
      />

      <article className="space-y-3 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "all"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            ทั้งหมด ({movementItems.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setTypeFilter("IN");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "IN"
                ? "bg-emerald-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            รับเข้า ({stats.IN})
          </button>

          <button
            type="button"
            onClick={() => {
              setTypeFilter("OUT");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "OUT"
                ? "bg-rose-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            เบิกออก ({stats.OUT})
          </button>

          <button
            type="button"
            onClick={() => {
              setTypeFilter("ADJUST");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "ADJUST"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            ปรับสต็อก ({stats.ADJUST})
          </button>

          <button
            type="button"
            onClick={() => {
              setTypeFilter("RETURN");
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "RETURN"
                ? "bg-purple-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            รับคืน ({stats.RETURN})
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={productQueryInput}
            onChange={(event) => setProductQueryInput(event.target.value)}
            placeholder="กรองตามสินค้า (SKU/ชื่อ)"
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          />
          <input
            type="date"
            value={dateFromInput}
            onChange={(event) => setDateFromInput(event.target.value)}
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          />
          <input
            type="date"
            value={dateToInput}
            onChange={(event) => setDateToInput(event.target.value)}
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={clearFilters}
          >
            ล้างตัวกรอง
          </Button>
          <Button type="button" className="h-8 px-3 text-xs" onClick={applyFilters}>
            ใช้ตัวกรอง
          </Button>
        </div>
      </article>

      {isLoading && movementItems.length === 0 ? (
        <StockTabLoadingState message="กำลังโหลดประวัติสต็อก..." />
      ) : errorMessage && movementItems.length === 0 ? (
        <StockTabErrorState
          message={errorMessage}
          onRetry={() => {
            void fetchHistory({ manual: true });
          }}
        />
      ) : movementItems.length === 0 ? (
        <StockTabEmptyState
          title="ไม่พบประวัติการเคลื่อนไหว"
          description="ลองเปลี่ยนตัวกรองหรือช่วงวันที่"
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            แสดง {movementItems.length.toLocaleString("th-TH")} รายการ จากทั้งหมด{" "}
            {totalItems.toLocaleString("th-TH")} รายการ
          </p>

          <div
            ref={viewportRef}
            className="max-h-[66vh] overflow-y-auto pr-1"
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop);
            }}
          >
            <div
              className="space-y-2"
              style={{
                paddingTop,
                paddingBottom,
              }}
            >
              {visibleMovements.map((movement) => (
                <article
                  key={movement.id}
                  className="rounded-xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500">{movement.productSku}</p>
                          <p className="text-sm font-medium">{movement.productName}</p>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-1 text-xs ${movementBadgeClass[movement.type]}`}
                        >
                          {movementTypeLabelMap[movement.type]}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-4">
                        <div>
                          <p className="text-xs text-slate-500">จำนวนฐาน</p>
                          <p
                            className={`text-lg font-bold ${
                              movement.qtyBase >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {movement.qtyBase >= 0 ? "+" : ""}
                            {movement.qtyBase.toLocaleString("th-TH")}
                          </p>
                        </div>
                      </div>

                      {movement.note && (
                        <div className="mt-2 rounded-lg bg-slate-50 p-2">
                          <p className="text-xs text-slate-600">
                            <strong>หมายเหตุ:</strong> {movement.note}
                          </p>
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(movement.createdAt).toLocaleString("th-TH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>•</span>
                        <span>โดย {movement.createdByName ?? "ระบบ"}</span>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {errorMessage && movementItems.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">{errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            className="h-7 border-red-200 bg-white px-2.5 text-xs text-red-700 hover:bg-red-100"
            onClick={() => {
              void fetchHistory({ manual: true });
            }}
          >
            ลองใหม่
          </Button>
        </div>
      ) : null}

      {totalPages > 1 && (
        <article className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-600">
              หน้า {currentPage.toLocaleString("th-TH")} /{" "}
              {totalPages.toLocaleString("th-TH")} ({totalItems.toLocaleString("th-TH")} รายการ)
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={currentPage <= 1 || isLoading || isRefreshing}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                ก่อนหน้า
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={currentPage >= totalPages || isLoading || isRefreshing}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                ถัดไป
              </Button>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
