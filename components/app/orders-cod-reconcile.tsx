"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";

type CodReconcileRow = {
  id: string;
  orderNo: string;
  customerName: string | null;
  contactDisplayName: string | null;
  shippedAt: string | null;
  shippingProvider: string | null;
  shippingCarrier: string | null;
  expectedCodAmount: number;
  total: number;
  codAmount: number;
  codFee: number;
};

type CodReconcilePage = {
  rows: CodReconcileRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type DraftValue = {
  selected: boolean;
  codAmount: string;
  codFee: string;
};

type CodReturnDraft = {
  codFee: string;
  codReturnNote: string;
};

const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDateValue = (value: string) => {
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
};

const formatIsoDateDisplay = (value: string) => {
  const parsed = parseIsoDateValue(value);
  if (!parsed) return "";
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
};

const calendarWeekdayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

const parseNonNegativeInt = (raw: string) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.trunc(parsed);
};

const createIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cod-reconcile-${crypto.randomUUID()}`;
  }
  return `cod-reconcile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const toProviderLabel = (row: CodReconcileRow) =>
  row.shippingProvider?.trim() ||
  row.shippingCarrier?.trim() ||
  "ไม่ระบุ";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type CodDatePickerFieldProps = {
  value: string;
  onChange: (nextValue: string) => void;
  ariaLabel: string;
};

function CodDatePickerField({ value, onChange, ariaLabel }: CodDatePickerFieldProps) {
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

  const firstDayOfMonth = new Date(viewCursor.getFullYear(), viewCursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewCursor.getFullYear(), viewCursor.getMonth() + 1, 0).getDate();
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
        <span className={`truncate text-left ${selectedIso ? "text-slate-900" : "text-slate-400"}`}>
          {selectedIso ? formatIsoDateDisplay(selectedIso) : "dd/mm/yyyy"}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-[130] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => setViewCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium text-slate-900">{monthLabel}</p>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => setViewCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] text-slate-400">
            {calendarWeekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((day, index) => {
              if (day === null) {
                return <span key={`empty-${index}`} className="h-8 rounded-md" />;
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
                  className={`h-8 rounded-md text-sm transition ${
                    isSelected
                      ? "bg-slate-900 font-medium text-white"
                      : isToday
                        ? "border border-slate-300 text-slate-900"
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
        </div>
      ) : null}
    </div>
  );
}

export function OrdersCodReconcile() {
  const now = new Date();
  const today = localDateString(now);
  const yesterday = localDateString(addDays(now, -1));
  const last7Days = localDateString(addDays(now, -6));
  const last30Days = localDateString(addDays(now, -29));
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [provider, setProvider] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const [codPage, setCodPage] = useState<CodReconcilePage>({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
    pageCount: 1,
  });
  const [providers, setProviders] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [codReturnTarget, setCodReturnTarget] = useState<CodReconcileRow | null>(null);
  const [codReturnDraft, setCodReturnDraft] = useState<CodReturnDraft>({
    codFee: "0",
    codReturnNote: "",
  });
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnErrorMessage, setReturnErrorMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const quickDatePresets = useMemo(
    () => [
      { key: "today", label: "วันนี้", from: today, to: today },
      { key: "yesterday", label: "เมื่อวาน", from: yesterday, to: yesterday },
      { key: "last7", label: "7 วัน", from: last7Days, to: today },
      { key: "last30", label: "30 วัน", from: last30Days, to: today },
    ],
    [last30Days, last7Days, today, yesterday],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const query = new URLSearchParams({
        dateFrom,
        dateTo,
        provider,
        q: keyword.trim(),
        page: String(page),
        pageSize: "50",
      });
      const res = await authFetch(`/api/orders/cod-reconcile?${query.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            page?: CodReconcilePage;
            providers?: string[];
          }
        | null;

      if (!res.ok || !data?.ok || !data.page) {
        setErrorMessage(data?.message ?? "โหลดรายการ COD ไม่สำเร็จ");
        return;
      }

      setCodPage(data.page);
      setProviders(data.providers ?? []);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of data.page?.rows ?? []) {
          const current = prev[row.id];
          next[row.id] = {
            selected: current?.selected ?? false,
            codAmount: current?.codAmount ?? String(row.expectedCodAmount),
            codFee: current?.codFee ?? String(Math.max(0, row.codFee)),
          };
        }
        return next;
      });
    } catch {
      setErrorMessage("โหลดรายการ COD ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, provider, keyword, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const rows = codPage.rows;
  const allSelected = rows.length > 0 && rows.every((row) => drafts[row.id]?.selected);

  const rowDraftSummary = useMemo(
    () =>
      rows.map((row) => {
        const draft = drafts[row.id] ?? {
          selected: false,
          codAmount: String(row.expectedCodAmount),
          codFee: String(Math.max(0, row.codFee)),
        };
        const codAmount = parseNonNegativeInt(draft.codAmount);
        const codFee = parseNonNegativeInt(draft.codFee);
        return {
          orderId: row.id,
          orderNo: row.orderNo,
          expectedCodAmount: row.expectedCodAmount,
          codAmount,
          codFee,
          selected: draft.selected,
          invalidInput: codAmount === null || codFee === null,
        };
      }),
    [drafts, rows],
  );

  const selectedRows = useMemo(
    () =>
      rowDraftSummary
        .map((row) => {
          if (!row.selected || row.codAmount === null || row.codFee === null) {
            return null;
          }
          return {
            orderId: row.orderId,
            orderNo: row.orderNo,
            expectedCodAmount: row.expectedCodAmount,
            codAmount: row.codAmount,
            codFee: row.codFee,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [rowDraftSummary],
  );

  const selectedSummary = useMemo(() => {
    return selectedRows.reduce(
      (acc, row) => {
        acc.expected += row.expectedCodAmount;
        acc.actual += row.codAmount;
        acc.fee += row.codFee;
        return acc;
      },
      { expected: 0, actual: 0, fee: 0 },
    );
  }, [selectedRows]);

  const selectedDiff = selectedSummary.actual - selectedSummary.expected;
  const selectedNet = selectedSummary.actual - selectedSummary.fee;
  const selectedInvalidCount = useMemo(
    () =>
      rowDraftSummary.reduce((acc, row) => {
        if (row.selected && row.invalidInput) {
          return acc + 1;
        }
        return acc;
      }, 0),
    [rowDraftSummary],
  );

  const toggleSelectAll = () => {
    const nextSelected = !allSelected;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const current = next[row.id] ?? {
          selected: false,
          codAmount: String(row.expectedCodAmount),
          codFee: String(Math.max(0, row.codFee)),
        };
        next[row.id] = {
          ...current,
          selected: nextSelected,
        };
      }
      return next;
    });
  };

  const onSettleSelected = async () => {
    if (selectedRows.length <= 0) {
      setErrorMessage("กรุณาเลือกรายการอย่างน้อย 1 ออเดอร์");
      return;
    }

    const hasInvalid = rows.some((row) => {
      const draft = drafts[row.id];
      if (!draft?.selected) {
        return false;
      }
      return parseNonNegativeInt(draft.codAmount) === null || parseNonNegativeInt(draft.codFee) === null;
    });
    if (hasInvalid) {
      setErrorMessage("กรุณากรอกยอดโอนจริงและ codFee ให้ถูกต้อง");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const idempotencyKey = createIdempotencyKey();
      const res = await authFetch("/api/orders/cod-reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          items: selectedRows.map((item) => ({
            orderId: item.orderId,
            codAmount: item.codAmount,
            codFee: item.codFee,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            settledCount?: number;
            failedCount?: number;
            results?: Array<{ orderNo: string | null; ok: boolean; message?: string }>;
          }
        | null;

      if (!res.ok || !data?.ok) {
        setErrorMessage(data?.message ?? "ปิดยอด COD ไม่สำเร็จ");
        return;
      }

      const settledCount = data.settledCount ?? 0;
      const failedCount = data.failedCount ?? 0;
      const failedMessages = (data.results ?? [])
        .filter((item) => !item.ok)
        .slice(0, 3)
        .map((item) => `${item.orderNo ?? "-"}: ${item.message ?? "ไม่สำเร็จ"}`);

      const nextErrorMessage =
        failedCount > 0
          ? `ปิดยอดสำเร็จ ${settledCount} รายการ, ไม่สำเร็จ ${failedCount} รายการ` +
            (failedMessages.length > 0 ? ` (${failedMessages.join(" | ")})` : "")
          : null;
      const nextSuccessMessage = failedCount > 0 ? null : `ปิดยอด COD สำเร็จ ${settledCount} รายการ`;
      await loadData();
      setErrorMessage(nextErrorMessage);
      setSuccessMessage(nextSuccessMessage);
    } catch {
      setErrorMessage("ปิดยอด COD ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const openCodReturnSheet = (row: CodReconcileRow) => {
    setCodReturnTarget(row);
    setCodReturnDraft({
      codFee: String(Math.max(0, row.codFee)),
      codReturnNote: "",
    });
    setReturnErrorMessage(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const closeCodReturnSheet = () => {
    if (returnSubmitting) {
      return;
    }
    setCodReturnTarget(null);
    setCodReturnDraft({
      codFee: "0",
      codReturnNote: "",
    });
    setReturnErrorMessage(null);
  };

  const onConfirmCodReturn = async () => {
    if (!codReturnTarget) {
      return;
    }

    const parsedFee = parseNonNegativeInt(codReturnDraft.codFee);
    if (parsedFee === null) {
      setReturnErrorMessage("กรุณากรอกค่าตีกลับเป็นจำนวนเต็มและไม่ติดลบ");
      return;
    }

    setReturnSubmitting(true);
    setReturnErrorMessage(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const idempotencyKey = createIdempotencyKey();
      const res = await authFetch(`/api/orders/${codReturnTarget.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          action: "mark_cod_returned",
          codFee: parsedFee,
          codReturnNote: codReturnDraft.codReturnNote.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;

      if (!res.ok) {
        setReturnErrorMessage(data?.message ?? "บันทึกตีกลับไม่สำเร็จ");
        return;
      }

      const orderNo = codReturnTarget.orderNo;
      setCodReturnTarget(null);
      setCodReturnDraft({
        codFee: "0",
        codReturnNote: "",
      });
      setReturnErrorMessage(null);
      await loadData();
      setSuccessMessage(`บันทึกตีกลับแล้ว ${orderNo}`);
    } catch {
      setReturnErrorMessage("บันทึกตีกลับไม่สำเร็จ");
    } finally {
      setReturnSubmitting(false);
    }
  };

  return (
    <section className="space-y-4">
      <article className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {quickDatePresets.map((preset) => {
            const isActive = dateFrom === preset.from && dateTo === preset.to;
            return (
              <button
                key={preset.key}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                }`}
                onClick={() => {
                  setDateFrom(preset.from);
                  setDateTo(preset.to);
                  setPage(1);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]">
          <CodDatePickerField
            value={dateFrom}
            onChange={(nextValue) => {
              setDateFrom(nextValue);
              setPage(1);
            }}
            ariaLabel="เลือกวันที่เริ่มต้น"
          />
          <CodDatePickerField
            value={dateTo}
            onChange={(nextValue) => {
              setDateTo(nextValue);
              setPage(1);
            }}
            ariaLabel="เลือกวันที่สิ้นสุด"
          />
          <input
            type="text"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาเลขออเดอร์/ชื่อลูกค้า"
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          />
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          >
            <option value="">ทุกขนส่ง</option>
            {providers.map((providerOption) => (
              <option key={providerOption} value={providerOption}>
                {providerOption}
              </option>
            ))}
          </select>
          <Button type="button" className="h-10" onClick={() => void loadData()} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </article>

      <article className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            COD รอปิดยอด {codPage.total.toLocaleString("th-TH")} รายการ
          </p>
          <button
            type="button"
            className="text-xs font-medium text-blue-700"
            onClick={toggleSelectAll}
            disabled={rows.length <= 0}
          >
            {allSelected ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมดในหน้านี้"}
          </button>
        </div>

        {selectedRows.length > 0 || selectedInvalidCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              เลือกแล้ว {selectedRows.length.toLocaleString("th-TH")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              ควรได้ {selectedSummary.expected.toLocaleString("th-TH")} LAK
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              โอนมา {selectedSummary.actual.toLocaleString("th-TH")} LAK
            </span>
            <span
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
            >
              สุทธิ {selectedNet.toLocaleString("th-TH")} LAK
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 ${
                selectedDiff < 0
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : selectedDiff > 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {selectedDiff < 0 ? "ขาด" : selectedDiff > 0 ? "เกิน" : "ตรง"}
              {" "}
              {Math.abs(selectedDiff).toLocaleString("th-TH")} LAK
            </span>
            {selectedInvalidCount > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                ไม่ถูกต้อง {selectedInvalidCount.toLocaleString("th-TH")}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {rows.length <= 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              ไม่พบรายการ COD ที่รอปิดยอดตามเงื่อนไขที่เลือก
            </p>
          ) : (
            rows.map((row) => {
              const draft = drafts[row.id] ?? {
                selected: false,
                codAmount: String(row.expectedCodAmount),
                codFee: String(Math.max(0, row.codFee)),
              };
              const parsedAmount = parseNonNegativeInt(draft.codAmount);
              const parsedFee = parseNonNegativeInt(draft.codFee);
              const rowDiff =
                parsedAmount !== null ? parsedAmount - row.expectedCodAmount : 0;
              const rowNet =
                parsedAmount !== null && parsedFee !== null ? parsedAmount - parsedFee : null;
              return (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...draft,
                              selected: event.target.checked,
                            },
                          }))
                        }
                      />
                      {row.orderNo}
                    </label>
                    <p className="text-xs text-slate-500">{formatDateTime(row.shippedAt)} • {toProviderLabel(row)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    ลูกค้า: {row.customerName || row.contactDisplayName || "ลูกค้าทั่วไป"}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-slate-50 p-2 text-xs">
                      <p className="text-slate-500">ควรได้</p>
                      <p className="font-medium">
                        {row.expectedCodAmount.toLocaleString("th-TH")} LAK
                      </p>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="text-slate-500">ยอดที่โอนมา</p>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.codAmount}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...draft,
                              codAmount: event.target.value,
                            },
                          }))
                        }
                        className="h-9 w-full rounded-md border px-2 text-sm outline-none ring-primary focus:ring-2"
                      />
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="text-slate-500">ค่าธรรมเนียม</p>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.codFee}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...draft,
                              codFee: event.target.value,
                            },
                          }))
                        }
                        className="h-9 w-full rounded-md border px-2 text-sm outline-none ring-primary focus:ring-2"
                      />
                    </div>
                    <div className="rounded-md bg-slate-50 p-2 text-xs">
                      <p className="text-slate-500">สุทธิหลังหักค่าธรรมเนียม</p>
                      <p className="font-medium text-slate-900">
                        {rowNet !== null ? `${rowNet.toLocaleString("th-TH")} LAK` : "-"}
                      </p>
                    </div>
                  </div>

                  {parsedAmount === null || parsedFee === null ? (
                    <p className="mt-2 text-xs text-red-600">กรอกยอดให้ถูกต้อง (จำนวนเต็มและไม่ติดลบ)</p>
                  ) : (
                    <p
                      className={`mt-2 text-xs ${
                        rowDiff < 0 ? "text-rose-700" : rowDiff > 0 ? "text-emerald-700" : "text-slate-500"
                      }`}
                    >
                      {rowDiff < 0
                        ? `ขาดจากยอดที่ควรได้ ${Math.abs(rowDiff).toLocaleString("th-TH")} LAK`
                        : rowDiff > 0
                          ? `เกินจากยอดที่ควรได้ ${rowDiff.toLocaleString("th-TH")} LAK`
                          : "ยอดที่โอนมาตรงกับยอดที่ควรได้"}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => openCodReturnSheet(row)}
                      disabled={submitting || loading || returnSubmitting}
                    >
                      ตีกลับ
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selectedRows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-slate-600">
              เลือกแล้ว {selectedRows.length.toLocaleString("th-TH")} รายการ
            </p>
            <Button
              type="button"
              onClick={() => void onSettleSelected()}
              disabled={submitting || selectedRows.length <= 0}
            >
              {submitting ? "กำลังปิดยอด..." : "ยืนยันปิดยอด"}
            </Button>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={loading || page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            ก่อนหน้า
          </button>
          <p>
            หน้า {codPage.page.toLocaleString("th-TH")} / {codPage.pageCount.toLocaleString("th-TH")}
          </p>
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={loading || page >= codPage.pageCount}
            onClick={() => setPage((prev) => Math.min(codPage.pageCount, prev + 1))}
          >
            ถัดไป
          </button>
        </div>
      </article>

      {successMessage ? (
        <p className="text-sm text-emerald-700">{successMessage}</p>
      ) : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      <SlideUpSheet
        isOpen={Boolean(codReturnTarget)}
        onClose={closeCodReturnSheet}
        title="บันทึกตีกลับ COD"
        panelMaxWidthClass="min-[1200px]:max-w-lg"
        disabled={returnSubmitting}
        footer={
          <>
            {returnErrorMessage ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {returnErrorMessage}
              </p>
            ) : null}
            <div className={`${returnErrorMessage ? "mt-3 " : ""}grid grid-cols-2 gap-2`}>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={closeCodReturnSheet}
                disabled={returnSubmitting}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl bg-rose-600 hover:bg-rose-700"
                onClick={() => void onConfirmCodReturn()}
                disabled={returnSubmitting}
              >
                {returnSubmitting ? "กำลังบันทึก..." : "ยืนยันตีกลับ"}
              </Button>
            </div>
          </>
        }
      >
        {codReturnTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{codReturnTarget.orderNo}</p>
              <p className="mt-1 text-xs text-slate-600">
                ลูกค้า: {codReturnTarget.customerName || codReturnTarget.contactDisplayName || "ลูกค้าทั่วไป"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                ขนส่ง: {toProviderLabel(codReturnTarget)} • ส่งเมื่อ {formatDateTime(codReturnTarget.shippedAt)}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                ยอด COD ที่คาด: {codReturnTarget.expectedCodAmount.toLocaleString("th-TH")} LAK
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="cod-return-fee" className="text-sm font-medium text-slate-800">
                ค่าตีกลับ
              </label>
              <input
                id="cod-return-fee"
                type="number"
                min={0}
                step={1}
                value={codReturnDraft.codFee}
                onChange={(event) =>
                  setCodReturnDraft((prev) => ({
                    ...prev,
                    codFee: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-xl border px-3 text-sm outline-none ring-primary focus:ring-2"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="cod-return-note" className="text-sm font-medium text-slate-800">
                หมายเหตุ
              </label>
              <textarea
                id="cod-return-note"
                value={codReturnDraft.codReturnNote}
                onChange={(event) =>
                  setCodReturnDraft((prev) => ({
                    ...prev,
                    codReturnNote: event.target.value,
                  }))
                }
                rows={4}
                placeholder="เช่น ลูกค้าไม่รับของ / ติดต่อปลายทางไม่ได้"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              />
            </div>
          </div>
        ) : null}
      </SlideUpSheet>
    </section>
  );
}
