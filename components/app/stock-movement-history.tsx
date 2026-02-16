"use client";

import { useMemo, useState } from "react";
import { Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const ITEMS_PER_PAGE = 20;

export function StockMovementHistory({ movements }: StockMovementHistoryProps) {
  const [typeFilter, setTypeFilter] = useState<MovementTypeFilter>("all");
  const [page, setPage] = useState(1);

  const filteredMovements = useMemo(() => {
    if (typeFilter === "all") return movements;
    return movements.filter((m) => m.type === typeFilter);
  }, [movements, typeFilter]);

  const totalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE);
  const currentPage = Math.min(page, totalPages || 1);

  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMovements.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMovements, currentPage]);

  const stats = useMemo(() => {
    const counts = {
      IN: movements.filter((m) => m.type === "IN").length,
      OUT: movements.filter((m) => m.type === "OUT").length,
      ADJUST: movements.filter((m) => m.type === "ADJUST").length,
      RETURN: movements.filter((m) => m.type === "RETURN").length,
    };
    return counts;
  }, [movements]);

  return (
    <section className="space-y-4">
      {/* Filter Tabs */}
      <article className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all");
              setPage(1);
            }}
            className={`flex-shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "all"
                ? "bg-primary text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            ทั้งหมด ({movements.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setTypeFilter("IN");
              setPage(1);
            }}
            className={`flex-shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
            className={`flex-shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
            className={`flex-shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
            className={`flex-shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              typeFilter === "RETURN"
                ? "bg-purple-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            รับคืน ({stats.RETURN})
          </button>
        </div>
      </article>

      {/* Movement List */}
      <div className="space-y-2">
        {paginatedMovements.length === 0 ? (
          <article className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <FileText className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm text-slate-600">ไม่พบประวัติการเคลื่อนไหว</p>
          </article>
        ) : (
          paginatedMovements.map((movement) => (
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
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <article className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-600">
              หน้า {currentPage.toLocaleString("th-TH")} /{" "}
              {totalPages.toLocaleString("th-TH")} ({filteredMovements.length.toLocaleString("th-TH")}{" "}
              รายการ)
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ก่อนหน้า
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
