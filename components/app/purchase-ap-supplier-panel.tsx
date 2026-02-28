"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import { currencySymbol } from "@/lib/finance/store-financial";
import type { StoreCurrency } from "@/lib/finance/store-financial";

type PurchaseApSupplierSummaryItem = {
  supplierKey: string;
  supplierName: string;
  poCount: number;
  unpaidPoCount: number;
  partialPoCount: number;
  totalOutstandingBase: number;
  overdueOutstandingBase: number;
  dueSoonOutstandingBase: number;
};

type PurchaseApStatementRow = {
  poId: string;
  poNumber: string;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  dueDate: string | null;
  receivedAt: string | null;
  purchaseCurrency: StoreCurrency;
  grandTotalBase: number;
  totalPaidBase: number;
  outstandingBase: number;
  ageDays: number;
  fxDeltaBase: number;
  dueStatus: "OVERDUE" | "DUE_SOON" | "NOT_DUE" | "NO_DUE_DATE";
  daysUntilDue: number | null;
};

type PurchaseApStatementSummary = {
  supplierKey: string;
  supplierName: string;
  poCount: number;
  totalOutstandingBase: number;
  overdueOutstandingBase: number;
  dueSoonOutstandingBase: number;
  notDueOutstandingBase: number;
  noDueDateOutstandingBase: number;
  unpaidPoCount: number;
  partialPoCount: number;
};

type PurchaseApSupplierPanelProps = {
  storeCurrency: StoreCurrency;
  refreshKey?: string | null;
  preset?: PurchaseApPanelPreset | null;
  onFiltersChange?: (filters: {
    dueFilter: DueFilter;
    paymentFilter: PaymentFilter;
    statementSort: StatementSort;
  }) => void;
  onOpenPurchaseOrder: (poId: string) => void;
  onAfterBulkSettle?: () => Promise<void> | void;
};

type PaymentFilter = "ALL" | "UNPAID" | "PARTIAL" | "PAID";
type DueFilter = "ALL" | "OVERDUE" | "DUE_SOON" | "NOT_DUE" | "NO_DUE_DATE";
type StatementSort = "DUE_ASC" | "OUTSTANDING_DESC";
export type PurchaseApPanelPreset = {
  key: string;
  dueFilter?: DueFilter;
  paymentFilter?: PaymentFilter;
  statementSort?: StatementSort;
  resetDateRange?: boolean;
  resetPoQuery?: boolean;
};

function fmtPrice(amount: number, currency: StoreCurrency): string {
  return `${currencySymbol(currency)}${amount.toLocaleString("th-TH")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dueStatusLabel(status: DueFilter): string {
  if (status === "OVERDUE") return "เลยกำหนด";
  if (status === "DUE_SOON") return "ใกล้ครบกำหนด";
  if (status === "NOT_DUE") return "ยังไม่ถึงกำหนด";
  if (status === "NO_DUE_DATE") return "ไม่ระบุ due";
  return "ทั้งหมด";
}

function paymentStatusLabel(status: PaymentFilter): string {
  if (status === "UNPAID") return "ยังไม่ชำระ";
  if (status === "PARTIAL") return "ชำระบางส่วน";
  if (status === "PAID") return "ชำระแล้ว";
  return "ทั้งหมด";
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
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
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

type PurchaseDatePickerFieldProps = {
  value: string;
  onChange: (nextValue: string) => void;
  triggerClassName: string;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
};

function PurchaseDatePickerField({
  value,
  onChange,
  triggerClassName,
  placeholder = "dd/mm/yyyy",
  ariaLabel,
  disabled = false,
}: PurchaseDatePickerFieldProps) {
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
  const todayIso = toDateInputValue(new Date());
  const selectedIso = parseIsoDateValue(value) ? value : "";
  const monthLabel = viewCursor.toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        disabled={disabled}
      >
        <span
          className={`truncate ${selectedIso ? "text-slate-900" : "text-slate-400"}`}
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

          <div className="grid grid-cols-7 gap-1 pb-1">
            {calendarWeekdayLabels.map((label) => (
              <span
                key={label}
                className="flex h-6 items-center justify-center text-[10px] font-medium text-slate-400"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((day, index) => {
              if (day === null) {
                return <span key={`blank-${index}`} className="h-8" />;
              }
              const dayIso = toDateInputValue(
                new Date(viewCursor.getFullYear(), viewCursor.getMonth(), day),
              );
              const isSelected = selectedIso === dayIso;
              const isToday = todayIso === dayIso;
              return (
                <button
                  key={dayIso}
                  type="button"
                  className={`h-8 rounded-md text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                        ? "border border-primary/40 bg-primary/10 text-primary"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    onChange(dayIso);
                    setIsOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PurchaseApSupplierPanel({
  storeCurrency,
  refreshKey,
  preset,
  onFiltersChange,
  onOpenPurchaseOrder,
  onAfterBulkSettle,
}: PurchaseApSupplierPanelProps) {
  const [supplierSearchInput, setSupplierSearchInput] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [suppliers, setSuppliers] = useState<PurchaseApSupplierSummaryItem[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [selectedSupplierKey, setSelectedSupplierKey] = useState<string | null>(null);

  const [poQueryInput, setPoQueryInput] = useState("");
  const [poQuery, setPoQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const [statementSort, setStatementSort] = useState<StatementSort>("DUE_ASC");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");

  const [statementRows, setStatementRows] = useState<PurchaseApStatementRow[]>([]);
  const [statementSummary, setStatementSummary] =
    useState<PurchaseApStatementSummary | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [isBulkSettleMode, setIsBulkSettleMode] = useState(false);
  const [isBulkSettling, setIsBulkSettling] = useState(false);
  const [bulkPaidAtInput, setBulkPaidAtInput] = useState("");
  const [bulkReferenceInput, setBulkReferenceInput] = useState("");
  const [bulkNoteInput, setBulkNoteInput] = useState("");
  const [bulkStatementTotalInput, setBulkStatementTotalInput] = useState("");
  const [bulkProgressText, setBulkProgressText] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);

  const getDateShortcutValue = useCallback(
    (shortcut: "TODAY" | "PLUS_7" | "END_OF_MONTH" | "CLEAR"): string => {
      if (shortcut === "CLEAR") return "";
      const now = new Date();
      if (shortcut === "TODAY") {
        return toDateInputValue(now);
      }
      if (shortcut === "PLUS_7") {
        const next = new Date(now);
        next.setDate(next.getDate() + 7);
        return toDateInputValue(next);
      }
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return toDateInputValue(endOfMonth);
    },
    [],
  );

  const applyStatementDateShortcut = useCallback(
    (
      field: "dueFrom" | "dueTo",
      shortcut: "TODAY" | "PLUS_7" | "END_OF_MONTH" | "CLEAR",
    ) => {
      const value = getDateShortcutValue(shortcut);
      if (field === "dueFrom") {
        setDueFrom(value);
        return;
      }
      setDueTo(value);
    },
    [getDateShortcutValue],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupplierQuery(supplierSearchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [supplierSearchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPoQuery(poQueryInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [poQueryInput]);

  const loadSupplierSummary = useCallback(async () => {
    setIsLoadingSuppliers(true);
    try {
      const params = new URLSearchParams();
      if (supplierQuery) {
        params.set("q", supplierQuery);
      }
      params.set("limit", "100");
      const query = params.toString();
      const res = await authFetch(
        `/api/stock/purchase-orders/ap-by-supplier${query ? `?${query}` : ""}`,
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            suppliers?: PurchaseApSupplierSummaryItem[];
          }
        | null;
      if (!res.ok || !data?.ok) {
        setSupplierError(data?.message ?? "โหลด AP ราย supplier ไม่สำเร็จ");
        return;
      }

      const nextSuppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
      setSuppliers(nextSuppliers);
      setSupplierError(null);

      if (nextSuppliers.length === 0) {
        setSelectedSupplierKey(null);
        return;
      }
      setSelectedSupplierKey((prev) => {
        if (prev && nextSuppliers.some((item) => item.supplierKey === prev)) {
          return prev;
        }
        return nextSuppliers[0]!.supplierKey;
      });
    } catch {
      setSupplierError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, [supplierQuery]);

  const loadStatement = useCallback(async () => {
    if (!selectedSupplierKey) {
      setStatementRows([]);
      setStatementSummary(null);
      setStatementError(null);
      return;
    }

    setIsLoadingStatement(true);
    try {
      const params = new URLSearchParams();
      params.set("supplierKey", selectedSupplierKey);
      params.set("paymentStatus", paymentFilter);
      params.set("dueFilter", dueFilter);
      if (dueFrom) params.set("dueFrom", dueFrom);
      if (dueTo) params.set("dueTo", dueTo);
      if (poQuery) params.set("q", poQuery);
      params.set("limit", "500");

      const res = await authFetch(
        `/api/stock/purchase-orders/ap-by-supplier/statement?${params.toString()}`,
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            rows?: PurchaseApStatementRow[];
            summary?: PurchaseApStatementSummary;
          }
        | null;

      if (!res.ok || !data?.ok) {
        setStatementError(data?.message ?? "โหลด statement ไม่สำเร็จ");
        return;
      }

      setStatementRows(Array.isArray(data.rows) ? data.rows : []);
      setStatementSummary(data.summary ?? null);
      setStatementError(null);
    } catch {
      setStatementError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoadingStatement(false);
    }
  }, [dueFilter, dueFrom, dueTo, paymentFilter, poQuery, selectedSupplierKey]);

  useEffect(() => {
    void loadSupplierSummary();
  }, [loadSupplierSummary, refreshKey]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement]);

  useEffect(() => {
    setSelectedPoIds([]);
    setIsBulkSettleMode(false);
    setBulkErrors([]);
    setBulkProgressText(null);
  }, [selectedSupplierKey]);

  useEffect(() => {
    if (!preset) {
      return;
    }
    if (preset.dueFilter) {
      setDueFilter(preset.dueFilter);
    }
    if (preset.paymentFilter) {
      setPaymentFilter(preset.paymentFilter);
    }
    if (preset.statementSort) {
      setStatementSort(preset.statementSort);
    }
    if (preset.resetDateRange) {
      setDueFrom("");
      setDueTo("");
    }
    if (preset.resetPoQuery) {
      setPoQueryInput("");
      setPoQuery("");
    }
  }, [preset]);

  useEffect(() => {
    onFiltersChange?.({
      dueFilter,
      paymentFilter,
      statementSort,
    });
  }, [dueFilter, onFiltersChange, paymentFilter, statementSort]);

  const selectedSupplier = useMemo(
    () =>
      selectedSupplierKey
        ? suppliers.find((item) => item.supplierKey === selectedSupplierKey) ?? null
        : null,
    [selectedSupplierKey, suppliers],
  );

  const exportStatement = useCallback(() => {
    if (!selectedSupplierKey) return;
    const params = new URLSearchParams();
    params.set("supplierKey", selectedSupplierKey);
    params.set("paymentStatus", paymentFilter);
    params.set("dueFilter", dueFilter);
    if (dueFrom) params.set("dueFrom", dueFrom);
    if (dueTo) params.set("dueTo", dueTo);
    if (poQuery) params.set("q", poQuery);
    window.open(
      `/api/stock/purchase-orders/ap-by-supplier/export-csv?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [dueFilter, dueFrom, dueTo, paymentFilter, poQuery, selectedSupplierKey]);

  const displayStatementRows = useMemo(() => {
    const dueDateValue = (value: string | null) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };
    const rows = [...statementRows];
    if (statementSort === "OUTSTANDING_DESC") {
      return rows.sort((a, b) => b.outstandingBase - a.outstandingBase);
    }
    return rows.sort((a, b) => {
      const dueDiff = dueDateValue(a.dueDate) - dueDateValue(b.dueDate);
      if (dueDiff !== 0) return dueDiff;
      return a.poNumber.localeCompare(b.poNumber);
    });
  }, [statementRows, statementSort]);

  const selectableStatementRows = useMemo(
    () => displayStatementRows.filter((row) => row.outstandingBase > 0),
    [displayStatementRows],
  );
  useEffect(() => {
    setSelectedPoIds((prev) =>
      prev.filter((poId) => selectableStatementRows.some((row) => row.poId === poId)),
    );
  }, [selectableStatementRows]);
  const selectedPoIdSet = useMemo(
    () => new Set(selectedPoIds),
    [selectedPoIds],
  );
  const selectedRows = useMemo(
    () =>
      selectedPoIds
        .map((poId) => selectableStatementRows.find((row) => row.poId === poId))
        .filter((row): row is PurchaseApStatementRow => Boolean(row)),
    [selectableStatementRows, selectedPoIds],
  );
  const sortedSelectedRows = useMemo(() => {
    const dueDateValue = (value: string | null) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };
    return [...selectedRows].sort((a, b) => {
      const dueDiff = dueDateValue(a.dueDate) - dueDateValue(b.dueDate);
      if (dueDiff !== 0) return dueDiff;
      return a.poNumber.localeCompare(b.poNumber);
    });
  }, [selectedRows]);
  const bulkAllocationPreview = useMemo(() => {
    const hasStatementTotal = bulkStatementTotalInput.trim().length > 0;
    const parsedStatementTotal = Math.round(Number(bulkStatementTotalInput));
    const statementTotal =
      hasStatementTotal && Number.isFinite(parsedStatementTotal) && parsedStatementTotal > 0
        ? parsedStatementTotal
        : null;
    const invalidStatementTotal =
      hasStatementTotal &&
      (!Number.isFinite(parsedStatementTotal) || parsedStatementTotal <= 0);

    let plannedTotal = 0;
    let remainingBudget = statementTotal ?? Number.POSITIVE_INFINITY;
    const rows = sortedSelectedRows.map((row) => {
      const plannedAmount = Math.max(
        0,
        Math.min(Math.round(row.outstandingBase), remainingBudget),
      );
      plannedTotal += plannedAmount;
      remainingBudget = Math.max(0, remainingBudget - plannedAmount);
      return {
        poId: row.poId,
        poNumber: row.poNumber,
        outstandingBase: Math.round(row.outstandingBase),
        plannedAmount,
      };
    });
    const totalOutstanding = rows.reduce(
      (sum, row) => sum + row.outstandingBase,
      0,
    );
    return {
      rows,
      totalOutstanding,
      plannedTotal,
      statementTotal,
      invalidStatementTotal,
      remainingUnallocated:
        statementTotal === null ? 0 : Math.max(0, statementTotal - plannedTotal),
      outstandingAfter: Math.max(0, totalOutstanding - plannedTotal),
    };
  }, [bulkStatementTotalInput, sortedSelectedRows]);

  const resetSupplierSearch = useCallback(() => {
    setSupplierSearchInput("");
    setSupplierQuery("");
  }, []);

  const resetStatementFilters = useCallback(() => {
    setPoQueryInput("");
    setPoQuery("");
    setPaymentFilter("ALL");
    setDueFilter("ALL");
    setStatementSort("DUE_ASC");
    setDueFrom("");
    setDueTo("");
  }, []);

  const toggleRowSelection = useCallback((poId: string) => {
    setSelectedPoIds((prev) => {
      if (prev.includes(poId)) {
        return prev.filter((id) => id !== poId);
      }
      return [...prev, poId];
    });
  }, []);

  const selectAllRows = useCallback(() => {
    setSelectedPoIds(selectableStatementRows.map((row) => row.poId));
  }, [selectableStatementRows]);

  const clearSelectedRows = useCallback(() => {
    setSelectedPoIds([]);
  }, []);

  const openBulkSettleMode = useCallback(() => {
    if (sortedSelectedRows.length === 0) {
      toast.error("กรุณาเลือก PO อย่างน้อย 1 รายการ");
      return;
    }
    setBulkPaidAtInput(new Date().toISOString().slice(0, 10));
    setBulkReferenceInput("");
    setBulkNoteInput("");
    setBulkStatementTotalInput("");
    setBulkErrors([]);
    setBulkProgressText(null);
    setIsBulkSettleMode(true);
  }, [sortedSelectedRows.length]);

  const submitBulkSettle = useCallback(async () => {
    if (sortedSelectedRows.length === 0) {
      toast.error("กรุณาเลือก PO ที่ต้องการบันทึกชำระ");
      return;
    }
    const paymentReference = bulkReferenceInput.trim();
    if (!paymentReference) {
      toast.error("กรุณากรอกเลขอ้างอิงรอบบัตร/รอบชำระ");
      return;
    }

    const hasStatementTotal = bulkStatementTotalInput.trim().length > 0;
    const parsedStatementTotal = Math.round(Number(bulkStatementTotalInput));
    if (
      hasStatementTotal &&
      (!Number.isFinite(parsedStatementTotal) || parsedStatementTotal <= 0)
    ) {
      toast.error("กรุณากรอกยอดชำระรวมจาก statement ให้ถูกต้อง");
      return;
    }

    const paymentNote = bulkNoteInput.trim();
    const paidAt = bulkPaidAtInput.trim();
    const errors: string[] = [];
    let settledCount = 0;
    let settledAmountTotal = 0;
    let remainingStatementBudget = hasStatementTotal
      ? Math.max(0, parsedStatementTotal)
      : null;

    setIsBulkSettling(true);
    setBulkErrors([]);
    setBulkProgressText("เริ่มประมวลผล...");

    try {
      for (let i = 0; i < sortedSelectedRows.length; i += 1) {
        const row = sortedSelectedRows[i]!;
        setBulkProgressText(
          `กำลังบันทึกชำระ ${i + 1}/${sortedSelectedRows.length} (${row.poNumber})`,
        );

        const outstandingAmount = Math.max(0, Math.round(row.outstandingBase));
        const settleAmount =
          remainingStatementBudget === null
            ? outstandingAmount
            : Math.min(outstandingAmount, remainingStatementBudget);
        if (!Number.isFinite(settleAmount) || settleAmount <= 0) {
          continue;
        }

        const res = await authFetch(
          `/api/stock/purchase-orders/${row.poId}/settle`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `po-ap-bulk-settle-${row.poId}-${Date.now()}-${i}`,
            },
            body: JSON.stringify({
              amountBase: settleAmount,
              paidAt: paidAt || undefined,
              paymentReference,
              paymentNote: paymentNote || undefined,
            }),
          },
        );
        const data = (await res.json().catch(() => null)) as
          | {
              message?: string;
            }
          | null;
        if (!res.ok) {
          errors.push(
            `${row.poNumber}: บันทึกชำระไม่สำเร็จ (${data?.message ?? "unknown"})`,
          );
          continue;
        }

        if (remainingStatementBudget !== null) {
          remainingStatementBudget = Math.max(0, remainingStatementBudget - settleAmount);
        }
        settledAmountTotal += settleAmount;
        settledCount += 1;
      }

      if (settledCount > 0) {
        toast.success(
          `บันทึกชำระสำเร็จ ${settledCount}/${sortedSelectedRows.length} รายการ (รวม ${fmtPrice(
            settledAmountTotal,
            storeCurrency,
          )})`,
        );
      }
      if ((remainingStatementBudget ?? 0) > 0) {
        toast(
          `ยังมียอด statement ที่ยังไม่ถูกจับคู่ ${fmtPrice(
            remainingStatementBudget ?? 0,
            storeCurrency,
          )}`,
        );
      }
      if (errors.length > 0) {
        toast.error(`มีรายการไม่สำเร็จ ${errors.length} รายการ`);
      } else {
        setSelectedPoIds([]);
        setIsBulkSettleMode(false);
      }

      setBulkErrors(errors);
      await loadSupplierSummary();
      await loadStatement();
      await onAfterBulkSettle?.();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จระหว่างบันทึกชำระแบบกลุ่ม");
    } finally {
      setIsBulkSettling(false);
      setBulkProgressText(null);
    }
  }, [
    bulkNoteInput,
    bulkPaidAtInput,
    bulkReferenceInput,
    bulkStatementTotalInput,
    loadStatement,
    loadSupplierSummary,
    onAfterBulkSettle,
    sortedSelectedRows,
    storeCurrency,
  ]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            AP ราย supplier
          </p>
          <p className="text-[11px] text-slate-500">
            เลือก supplier เพื่อดู statement และเปิด PO แบบ drill-down
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => {
            void loadSupplierSummary();
          }}
          disabled={isLoadingSuppliers}
        >
          {isLoadingSuppliers ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "รีเฟรช"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,300px)_1fr]">
        <div className="space-y-2">
          <input
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="ค้นหา supplier"
            value={supplierSearchInput}
            onChange={(event) => setSupplierSearchInput(event.target.value)}
          />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {isLoadingSuppliers ? (
              <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500">
                กำลังโหลดรายการ supplier...
              </p>
            ) : supplierError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                {supplierError}
              </div>
            ) : suppliers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-4 text-center">
                <p className="text-xs text-slate-500">ยังไม่มี AP ค้างชำระตามเงื่อนไข</p>
                {supplierSearchInput.trim().length > 0 ? (
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    onClick={resetSupplierSearch}
                  >
                    ล้างคำค้นหา supplier
                  </button>
                ) : null}
              </div>
            ) : (
              suppliers.map((supplier) => {
                const isActive = supplier.supplierKey === selectedSupplierKey;
                return (
                  <button
                    key={supplier.supplierKey}
                    type="button"
                    className={`w-full rounded-lg border px-2.5 py-2 text-left ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-slate-200 bg-white hover:bg-slate-100"
                    }`}
                    onClick={() => setSelectedSupplierKey(supplier.supplierKey)}
                  >
                    <p className="truncate text-xs font-medium text-slate-900">
                      {supplier.supplierName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {supplier.poCount} PO · ค้าง{" "}
                      {fmtPrice(supplier.totalOutstandingBase, storeCurrency)}
                    </p>
                    {(supplier.overdueOutstandingBase > 0 ||
                      supplier.dueSoonOutstandingBase > 0) && (
                      <p className="mt-1 text-[10px] text-amber-700">
                        เลยกำหนด {fmtPrice(supplier.overdueOutstandingBase, storeCurrency)}
                        {" · "}
                        ใกล้ครบ {fmtPrice(supplier.dueSoonOutstandingBase, storeCurrency)}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {selectedSupplier?.supplierName ?? "เลือก supplier"}
              </p>
              {statementSummary ? (
                <p className="text-xs text-slate-500">
                  {statementSummary.poCount} PO · ค้างรวม{" "}
                  {fmtPrice(statementSummary.totalOutstandingBase, storeCurrency)}
                </p>
              ) : (
                <p className="text-xs text-slate-500">ยังไม่มีข้อมูล statement</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-lg px-2.5 text-xs"
              onClick={exportStatement}
              disabled={!selectedSupplierKey || isLoadingStatement}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export Supplier CSV
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <span className="text-[11px] text-slate-600">
              เลือกแล้ว {selectedPoIds.length}/{selectableStatementRows.length} รายการ
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={selectAllRows}
              disabled={selectableStatementRows.length === 0 || isBulkSettling}
            >
              เลือกทั้งหมด
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={clearSelectedRows}
              disabled={selectedPoIds.length === 0 || isBulkSettling}
            >
              ล้างที่เลือก
            </Button>
            <Button
              type="button"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={openBulkSettleMode}
              disabled={selectedPoIds.length === 0 || isBulkSettling}
            >
              บันทึกชำระแบบกลุ่ม
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 xl:col-span-2"
              placeholder="ค้นหาเลข PO"
              value={poQueryInput}
              onChange={(event) => setPoQueryInput(event.target.value)}
            />
            <select
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300"
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as PaymentFilter)
              }
            >
              <option value="ALL">{paymentStatusLabel("ALL")}</option>
              <option value="UNPAID">{paymentStatusLabel("UNPAID")}</option>
              <option value="PARTIAL">{paymentStatusLabel("PARTIAL")}</option>
            </select>
            <select
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300"
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value as DueFilter)}
            >
              <option value="ALL">{dueStatusLabel("ALL")}</option>
              <option value="OVERDUE">{dueStatusLabel("OVERDUE")}</option>
              <option value="DUE_SOON">{dueStatusLabel("DUE_SOON")}</option>
              <option value="NOT_DUE">{dueStatusLabel("NOT_DUE")}</option>
              <option value="NO_DUE_DATE">{dueStatusLabel("NO_DUE_DATE")}</option>
            </select>
            <select
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300"
              value={statementSort}
              onChange={(event) => setStatementSort(event.target.value as StatementSort)}
            >
              <option value="DUE_ASC">เรียงตาม due date</option>
              <option value="OUTSTANDING_DESC">เรียงยอดค้างมากสุด</option>
            </select>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-600">
              ช่วง due date (ใช้กับทั้ง statement และ export CSV)
            </p>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <div className="space-y-1 min-w-0">
                <label className="text-[11px] text-slate-500">Due ตั้งแต่</label>
                <PurchaseDatePickerField
                  value={dueFrom}
                  onChange={setDueFrom}
                  triggerClassName="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-left text-xs outline-none focus:ring-2 focus:ring-slate-300 flex items-center justify-between gap-2"
                  ariaLabel="เลือก due date เริ่มต้นใน AP statement"
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "TODAY")}
                  >
                    วันนี้
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "PLUS_7")}
                  >
                    +7 วัน
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "END_OF_MONTH")}
                  >
                    สิ้นเดือน
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "CLEAR")}
                  >
                    ล้าง
                  </button>
                </div>
              </div>
              <div className="space-y-1 min-w-0">
                <label className="text-[11px] text-slate-500">Due ถึง</label>
                <PurchaseDatePickerField
                  value={dueTo}
                  onChange={setDueTo}
                  triggerClassName="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-left text-xs outline-none focus:ring-2 focus:ring-slate-300 flex items-center justify-between gap-2"
                  ariaLabel="เลือก due date สิ้นสุดใน AP statement"
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "TODAY")}
                  >
                    วันนี้
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "PLUS_7")}
                  >
                    +7 วัน
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "END_OF_MONTH")}
                  >
                    สิ้นเดือน
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "CLEAR")}
                  >
                    ล้าง
                  </button>
                </div>
              </div>
            </div>
          </div>

          {statementSummary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">เลยกำหนด</p>
                <p className="text-xs font-medium text-red-600">
                  {fmtPrice(statementSummary.overdueOutstandingBase, storeCurrency)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">ใกล้ครบกำหนด</p>
                <p className="text-xs font-medium text-amber-700">
                  {fmtPrice(statementSummary.dueSoonOutstandingBase, storeCurrency)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">ยังไม่ถึงกำหนด</p>
                <p className="text-xs font-medium text-emerald-700">
                  {fmtPrice(statementSummary.notDueOutstandingBase, storeCurrency)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">ไม่ระบุ due</p>
                <p className="text-xs font-medium text-slate-700">
                  {fmtPrice(statementSummary.noDueDateOutstandingBase, storeCurrency)}
                </p>
              </div>
            </div>
          )}

          {isBulkSettleMode ? (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="text-xs font-semibold text-emerald-800">
                ชำระแบบกลุ่มจาก AP statement
              </p>
              <p className="text-[11px] text-emerald-700/90">
                ระบบจะจับคู่ยอดอัตโนมัติแบบ due date เก่าสุดก่อน (oldest due first)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    วันที่ชำระ
                  </label>
                  <input
                    type="date"
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkPaidAtInput}
                    onChange={(event) => setBulkPaidAtInput(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    เลขอ้างอิงรอบชำระ
                  </label>
                  <input
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkReferenceInput}
                    onChange={(event) => setBulkReferenceInput(event.target.value)}
                    placeholder="เช่น Statement 2026-02"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    ยอดชำระรวมตาม statement (ไม่บังคับ)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkStatementTotalInput}
                    onChange={(event) => setBulkStatementTotalInput(event.target.value)}
                    placeholder="ถ้าไม่กรอก = จ่ายเต็มยอดค้างที่เลือก"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    หมายเหตุ (ไม่บังคับ)
                  </label>
                  <input
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkNoteInput}
                    onChange={(event) => setBulkNoteInput(event.target.value)}
                    placeholder="เช่น จ่ายปลายเดือน"
                  />
                </div>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white p-2">
                <p className="text-[11px] text-slate-600">
                  ยอดค้างที่เลือก {fmtPrice(bulkAllocationPreview.totalOutstanding, storeCurrency)}
                  {" · "}
                  จะลงชำระ {fmtPrice(bulkAllocationPreview.plannedTotal, storeCurrency)}
                  {" · "}
                  ค้างหลังรอบนี้ {fmtPrice(bulkAllocationPreview.outstandingAfter, storeCurrency)}
                </p>
                {bulkAllocationPreview.statementTotal !== null ? (
                  <p className="mt-1 text-[11px] text-slate-600">
                    ยอด statement ที่ยังไม่ถูกจับคู่{" "}
                    {fmtPrice(bulkAllocationPreview.remainingUnallocated, storeCurrency)}
                  </p>
                ) : null}
                {bulkAllocationPreview.invalidStatementTotal ? (
                  <p className="mt-1 text-[11px] text-red-600">
                    ยอดชำระรวมจาก statement ไม่ถูกต้อง
                  </p>
                ) : null}
              </div>
              {bulkProgressText ? (
                <p className="text-[11px] text-emerald-700">{bulkProgressText}</p>
              ) : null}
              {bulkErrors.length > 0 ? (
                <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2">
                  <p className="text-[11px] font-semibold text-red-700">
                    รายการที่ไม่สำเร็จ ({bulkErrors.length})
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-red-700">
                    {bulkErrors.map((error, index) => (
                      <li key={`${error}-${index}`}>• {error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-100"
                  onClick={() => setIsBulkSettleMode(false)}
                  disabled={isBulkSettling}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                  onClick={() => {
                    void submitBulkSettle();
                  }}
                  disabled={
                    isBulkSettling ||
                    selectedPoIds.length === 0 ||
                    bulkAllocationPreview.invalidStatementTotal
                  }
                >
                  {isBulkSettling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "ยืนยันบันทึกชำระแบบกลุ่ม"
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {isLoadingStatement ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-3 text-xs text-slate-500">
              กำลังโหลด statement...
            </p>
          ) : statementError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
              {statementError}
            </div>
          ) : displayStatementRows.length === 0 ? (
            <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-4 text-center">
              <p className="text-xs text-slate-500">ไม่พบรายการตามตัวกรอง</p>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={resetStatementFilters}
              >
                ล้างตัวกรอง statement
              </button>
            </div>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {displayStatementRows.map((row) => (
                <div
                  key={row.poId}
                  className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                    checked={selectedPoIdSet.has(row.poId)}
                    onChange={() => toggleRowSelection(row.poId)}
                    disabled={isBulkSettling || row.outstandingBase <= 0}
                  />
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onOpenPurchaseOrder(row.poId)}
                  >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-900">
                        {row.poNumber}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        due {formatDate(row.dueDate)} · รับเมื่อ {formatDate(row.receivedAt)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {paymentStatusLabel(row.paymentStatus)} · {dueStatusLabel(row.dueStatus)}
                        {row.daysUntilDue !== null
                          ? ` (${row.daysUntilDue >= 0 ? `เหลือ ${row.daysUntilDue} วัน` : `เลย ${Math.abs(row.daysUntilDue)} วัน`})`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-900">
                        {fmtPrice(row.outstandingBase, storeCurrency)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        จ่ายแล้ว {fmtPrice(row.totalPaidBase, storeCurrency)}
                      </p>
                    </div>
                  </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
