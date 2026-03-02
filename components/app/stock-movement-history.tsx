"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

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

type MovementTypeFilter =
  | "all"
  | "IN"
  | "OUT"
  | "RESERVE"
  | "RELEASE"
  | "ADJUST"
  | "RETURN";

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
const HISTORY_CACHE_MAX_ENTRIES = 24;
const HISTORY_TYPE_QUERY_KEY = "historyType";
const HISTORY_PAGE_QUERY_KEY = "historyPage";
const HISTORY_Q_QUERY_KEY = "historyQ";
const HISTORY_DATE_FROM_QUERY_KEY = "historyDateFrom";
const HISTORY_DATE_TO_QUERY_KEY = "historyDateTo";

const isDateOnly = (value: string | null) =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

function parseHistoryTypeFilter(value: string | null): MovementTypeFilter | null {
  if (
    value === "all" ||
    value === "IN" ||
    value === "OUT" ||
    value === "RESERVE" ||
    value === "RELEASE" ||
    value === "ADJUST" ||
    value === "RETURN"
  ) {
    return value;
  }
  return null;
}

function parsePositivePage(value: string | null): number {
  if (!value) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDateValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatIsoDateDisplay(value: string): string {
  const parsed = parseIsoDateValue(value);
  if (!parsed) return "";
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

const calendarWeekdayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

type HistoryDatePickerFieldProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  ariaLabel: string;
};

function HistoryDatePickerField({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  ariaLabel,
}: HistoryDatePickerFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewCursor, setViewCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!isOpen) return;
    const parsed = parseIsoDateValue(value) ?? new Date();
    setViewCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const firstDayOfMonth = new Date(
    viewCursor.getFullYear(),
    viewCursor.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    viewCursor.getFullYear(),
    viewCursor.getMonth() + 1,
    0,
  ).getDate();
  const calendarCells: Array<number | null> = [
    ...Array.from({ length: firstDayOfMonth }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarCells.length < 42) {
    calendarCells.push(null);
  }

  const selectedIso = parseIsoDateValue(value) ? value : "";
  const todayIso = toDateInputValue(new Date());
  const monthLabel = viewCursor.toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none ring-primary transition focus:ring-2"
      >
        <span
          className={`truncate text-left ${selectedIso ? "text-slate-900" : "text-slate-400"}`}
        >
          {selectedIso ? formatIsoDateDisplay(selectedIso) : placeholder}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-[130] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() =>
                setViewCursor(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <p className="text-xs font-semibold text-slate-700">{monthLabel}</p>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() =>
                setViewCursor(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarWeekdayLabels.map((label) => (
              <span
                key={label}
                className="inline-flex h-7 items-center justify-center text-[10px] font-medium text-slate-500"
              >
                {label}
              </span>
            ))}
            {calendarCells.map((day, index) => {
              if (!day) {
                return <span key={`empty-${index}`} className="h-7 w-7" />;
              }
              const candidate = toDateInputValue(
                new Date(viewCursor.getFullYear(), viewCursor.getMonth(), day),
              );
              const isSelected = candidate === selectedIso;
              const isToday = candidate === todayIso;
              return (
                <button
                  key={candidate}
                  type="button"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                        ? "border border-primary/40 text-primary"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    onChange(candidate);
                    setIsOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
            >
              ล้างค่า
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
              onClick={() => setIsOpen(false)}
            >
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const movementTypeFilterOptions: Array<{ value: MovementTypeFilter; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "IN", label: "รับเข้า" },
  { value: "OUT", label: "เบิกออก" },
  { value: "RESERVE", label: "จอง" },
  { value: "RELEASE", label: "ยกเลิกจอง" },
  { value: "ADJUST", label: "ปรับสต็อก" },
  { value: "RETURN", label: "รับคืน" },
];

const getTypeFilterLabel = (value: MovementTypeFilter) =>
  movementTypeFilterOptions.find((option) => option.value === value)?.label ?? "ทั้งหมด";

function buildHistoryCacheKey(params: {
  page: number;
  typeFilter: MovementTypeFilter;
  query: string;
  dateFrom: string;
  dateTo: string;
}): string {
  return [
    params.page,
    params.typeFilter,
    params.query.trim().toLowerCase(),
    params.dateFrom,
    params.dateTo,
  ].join("|");
}

export function StockMovementHistory({ movements }: StockMovementHistoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHistoryTabActive = searchParams.get("tab") === "history";
  const typeFilterFromQuery =
    parseHistoryTypeFilter(searchParams.get(HISTORY_TYPE_QUERY_KEY)) ?? "all";
  const pageFromQuery = parsePositivePage(searchParams.get(HISTORY_PAGE_QUERY_KEY));
  const queryFromUrl = searchParams.get(HISTORY_Q_QUERY_KEY)?.trim() ?? "";
  const dateFromFromUrl = isDateOnly(searchParams.get(HISTORY_DATE_FROM_QUERY_KEY))
    ? (searchParams.get(HISTORY_DATE_FROM_QUERY_KEY) as string)
    : "";
  const dateToFromUrl = isDateOnly(searchParams.get(HISTORY_DATE_TO_QUERY_KEY))
    ? (searchParams.get(HISTORY_DATE_TO_QUERY_KEY) as string)
    : "";

  const [movementItems, setMovementItems] = useState(movements);
  const [totalItems, setTotalItems] = useState(movements.length);
  const [typeFilterInput, setTypeFilterInput] = useState<MovementTypeFilter>(typeFilterFromQuery);
  const [appliedTypeFilter, setAppliedTypeFilter] = useState<MovementTypeFilter>(typeFilterFromQuery);
  const [page, setPage] = useState(pageFromQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    movements.length > 0 ? new Date().toISOString() : null,
  );

  const [productQueryInput, setProductQueryInput] = useState(queryFromUrl);
  const [dateFromInput, setDateFromInput] = useState(dateFromFromUrl);
  const [dateToInput, setDateToInput] = useState(dateToFromUrl);
  const [appliedProductQuery, setAppliedProductQuery] = useState(queryFromUrl);
  const [appliedDateFrom, setAppliedDateFrom] = useState(dateFromFromUrl);
  const [appliedDateTo, setAppliedDateTo] = useState(dateToFromUrl);
  const historyCacheRef = useRef<
    Map<string, { movements: InventoryMovementView[]; total: number; fetchedAt: string }>
  >(new Map());

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const currentCacheKey = buildHistoryCacheKey({
    page,
    typeFilter: appliedTypeFilter,
    query: appliedProductQuery,
    dateFrom: appliedDateFrom,
    dateTo: appliedDateTo,
  });

  useEffect(() => {
    setMovementItems(movements);
    setTotalItems(movements.length);
    setErrorMessage(null);
    setLastUpdatedAt(movements.length > 0 ? new Date().toISOString() : null);
  }, [movements]);

  useEffect(() => {
    if (!isHistoryTabActive) {
      return;
    }

    const nextTypeFilter =
      parseHistoryTypeFilter(searchParams.get(HISTORY_TYPE_QUERY_KEY)) ?? "all";
    setTypeFilterInput((current) =>
      current === nextTypeFilter ? current : nextTypeFilter,
    );
    setAppliedTypeFilter((current) =>
      current === nextTypeFilter ? current : nextTypeFilter,
    );

    const nextPage = parsePositivePage(searchParams.get(HISTORY_PAGE_QUERY_KEY));
    setPage((current) => (current === nextPage ? current : nextPage));

    const nextQuery = searchParams.get(HISTORY_Q_QUERY_KEY)?.trim() ?? "";
    setProductQueryInput((current) => (current === nextQuery ? current : nextQuery));
    setAppliedProductQuery((current) => (current === nextQuery ? current : nextQuery));

    const nextDateFrom = isDateOnly(searchParams.get(HISTORY_DATE_FROM_QUERY_KEY))
      ? (searchParams.get(HISTORY_DATE_FROM_QUERY_KEY) as string)
      : "";
    const nextDateTo = isDateOnly(searchParams.get(HISTORY_DATE_TO_QUERY_KEY))
      ? (searchParams.get(HISTORY_DATE_TO_QUERY_KEY) as string)
      : "";
    setDateFromInput((current) =>
      current === nextDateFrom ? current : nextDateFrom,
    );
    setAppliedDateFrom((current) =>
      current === nextDateFrom ? current : nextDateFrom,
    );
    setDateToInput((current) => (current === nextDateTo ? current : nextDateTo));
    setAppliedDateTo((current) => (current === nextDateTo ? current : nextDateTo));
  }, [
    isHistoryTabActive,
    searchParams,
  ]);

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
    async (options?: { manual?: boolean; signal?: AbortSignal; background?: boolean }) => {
      const isManual = options?.manual ?? false;
      const isBackground = options?.background ?? false;
      setErrorMessage(null);
      if (isManual) {
        setIsRefreshing(true);
      } else if (!isBackground) {
        setIsLoading(true);
      }

      try {
        const params = new URLSearchParams({
          view: "history",
          page: String(page),
          pageSize: String(ITEMS_PER_PAGE),
        });

        if (appliedTypeFilter !== "all") {
          params.set("type", appliedTypeFilter);
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

        const nextTotal = Number(data.total ?? data.movements.length);
        const fetchedAt = new Date().toISOString();
        setMovementItems(data.movements);
        setTotalItems(nextTotal);
        setErrorMessage(null);
        setLastUpdatedAt(fetchedAt);
        historyCacheRef.current.set(currentCacheKey, {
          movements: data.movements,
          total: nextTotal,
          fetchedAt,
        });
        if (historyCacheRef.current.size > HISTORY_CACHE_MAX_ENTRIES) {
          const oldestKey = historyCacheRef.current.keys().next().value;
          if (oldestKey) {
            historyCacheRef.current.delete(oldestKey);
          }
        }
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
        } else if (!isBackground) {
          setIsLoading(false);
        }
      }
    },
    [
      appliedDateFrom,
      appliedDateTo,
      appliedProductQuery,
      appliedTypeFilter,
      currentCacheKey,
      page,
    ],
  );

  useEffect(() => {
    if (!isHistoryTabActive) {
      return;
    }

    const controller = new AbortController();
    setScrollTop(0);
    viewportRef.current?.scrollTo({ top: 0 });
    const cached = historyCacheRef.current.get(currentCacheKey);
    if (cached) {
      setMovementItems(cached.movements);
      setTotalItems(cached.total);
      setErrorMessage(null);
      setLastUpdatedAt(cached.fetchedAt);
      void fetchHistory({ signal: controller.signal, background: true });
    } else {
      void fetchHistory({ signal: controller.signal });
    }
    return () => controller.abort();
  }, [currentCacheKey, fetchHistory, isHistoryTabActive]);

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!isHistoryTabActive) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (appliedTypeFilter === "all") {
      if (params.has(HISTORY_TYPE_QUERY_KEY)) {
        params.delete(HISTORY_TYPE_QUERY_KEY);
        changed = true;
      }
    } else if (params.get(HISTORY_TYPE_QUERY_KEY) !== appliedTypeFilter) {
      params.set(HISTORY_TYPE_QUERY_KEY, appliedTypeFilter);
      changed = true;
    }

    if (appliedProductQuery) {
      if (params.get(HISTORY_Q_QUERY_KEY) !== appliedProductQuery) {
        params.set(HISTORY_Q_QUERY_KEY, appliedProductQuery);
        changed = true;
      }
    } else if (params.has(HISTORY_Q_QUERY_KEY)) {
      params.delete(HISTORY_Q_QUERY_KEY);
      changed = true;
    }

    if (appliedDateFrom) {
      if (params.get(HISTORY_DATE_FROM_QUERY_KEY) !== appliedDateFrom) {
        params.set(HISTORY_DATE_FROM_QUERY_KEY, appliedDateFrom);
        changed = true;
      }
    } else if (params.has(HISTORY_DATE_FROM_QUERY_KEY)) {
      params.delete(HISTORY_DATE_FROM_QUERY_KEY);
      changed = true;
    }

    if (appliedDateTo) {
      if (params.get(HISTORY_DATE_TO_QUERY_KEY) !== appliedDateTo) {
        params.set(HISTORY_DATE_TO_QUERY_KEY, appliedDateTo);
        changed = true;
      }
    } else if (params.has(HISTORY_DATE_TO_QUERY_KEY)) {
      params.delete(HISTORY_DATE_TO_QUERY_KEY);
      changed = true;
    }

    if (currentPage <= 1) {
      if (params.has(HISTORY_PAGE_QUERY_KEY)) {
        params.delete(HISTORY_PAGE_QUERY_KEY);
        changed = true;
      }
    } else if (params.get(HISTORY_PAGE_QUERY_KEY) !== String(currentPage)) {
      params.set(HISTORY_PAGE_QUERY_KEY, String(currentPage));
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
    appliedDateFrom,
    appliedDateTo,
    appliedProductQuery,
    currentPage,
    isHistoryTabActive,
    pathname,
    router,
    searchParams,
    appliedTypeFilter,
  ]);

  const applyFilters = () => {
    if (dateFromInput && dateToInput && dateFromInput > dateToInput) {
      setErrorMessage("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      return;
    }

    const nextQuery = productQueryInput.trim();
    const shouldResetPage =
      appliedTypeFilter !== typeFilterInput ||
      appliedProductQuery !== nextQuery ||
      appliedDateFrom !== dateFromInput ||
      appliedDateTo !== dateToInput;
    setAppliedTypeFilter(typeFilterInput);
    setAppliedProductQuery(nextQuery);
    setAppliedDateFrom(dateFromInput);
    setAppliedDateTo(dateToInput);
    if (shouldResetPage) {
      setPage(1);
    }
  };

  const clearFilters = () => {
    setTypeFilterInput("all");
    setProductQueryInput("");
    setDateFromInput("");
    setDateToInput("");
    setAppliedTypeFilter("all");
    setAppliedProductQuery("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setPage(1);
  };

  const hasActiveFilters =
    appliedTypeFilter !== "all" ||
    Boolean(appliedProductQuery) ||
    Boolean(appliedDateFrom) ||
    Boolean(appliedDateTo);

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
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
          <select
            value={typeFilterInput}
            onChange={(event) =>
              setTypeFilterInput((event.target.value as MovementTypeFilter) ?? "all")
            }
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            aria-label="ประเภทการเคลื่อนไหว"
          >
            {movementTypeFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                ประเภท: {option.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={productQueryInput}
            onChange={(event) => setProductQueryInput(event.target.value)}
            placeholder="กรองตามสินค้า (SKU/ชื่อ)"
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          />
          <HistoryDatePickerField
            value={dateFromInput}
            onChange={setDateFromInput}
            ariaLabel="เลือกวันที่เริ่มต้นในประวัติสต็อก"
            placeholder="วันที่เริ่มต้น"
          />
          <HistoryDatePickerField
            value={dateToInput}
            onChange={setDateToInput}
            ariaLabel="เลือกวันที่สิ้นสุดในประวัติสต็อก"
            placeholder="วันที่สิ้นสุด"
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

        {hasActiveFilters ? (
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-2 py-1">
              ประเภท: {getTypeFilterLabel(appliedTypeFilter)}
            </span>
            {appliedProductQuery ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">
                ค้นหา: {appliedProductQuery}
              </span>
            ) : null}
            {appliedDateFrom ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">
                จาก: {appliedDateFrom}
              </span>
            ) : null}
            {appliedDateTo ? (
              <span className="rounded-full bg-slate-100 px-2 py-1">
                ถึง: {appliedDateTo}
              </span>
            ) : null}
          </div>
        ) : null}
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
