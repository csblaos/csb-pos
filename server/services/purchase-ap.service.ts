import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import {
  getOutstandingPurchaseRows,
  type PurchaseOutstandingRow,
} from "@/lib/reports/queries";

const UNKNOWN_SUPPLIER_KEY = "__unspecified_supplier__";
const DUE_SOON_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PurchaseApPaymentFilter = "ALL" | "UNPAID" | "PARTIAL";
export type PurchaseApDueFilter =
  | "ALL"
  | "OVERDUE"
  | "DUE_SOON"
  | "NOT_DUE"
  | "NO_DUE_DATE";
export type PurchaseApDueStatus =
  | "OVERDUE"
  | "DUE_SOON"
  | "NOT_DUE"
  | "NO_DUE_DATE";

export type PurchaseApSupplierSummaryItem = {
  supplierKey: string;
  supplierName: string;
  poCount: number;
  unpaidPoCount: number;
  partialPoCount: number;
  totalOutstandingBase: number;
  overdueOutstandingBase: number;
  dueSoonOutstandingBase: number;
};

export type PurchaseApStatementRow = PurchaseOutstandingRow & {
  supplierKey: string;
  supplierDisplayName: string;
  dueStatus: PurchaseApDueStatus;
  daysUntilDue: number | null;
};

export type PurchaseApStatementSummary = {
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

export type PurchaseApReminderItem = {
  poId: string;
  poNumber: string;
  supplierName: string;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  dueDate: string | null;
  dueStatus: Extract<PurchaseApDueStatus, "OVERDUE" | "DUE_SOON">;
  daysUntilDue: number;
  outstandingBase: number;
};

export type PurchaseApReminderSummary = {
  overdueCount: number;
  dueSoonCount: number;
  overdueOutstandingBase: number;
  dueSoonOutstandingBase: number;
  items: PurchaseApReminderItem[];
};

function isReminderDueStatus(
  dueStatus: PurchaseApDueStatus,
): dueStatus is Extract<PurchaseApDueStatus, "OVERDUE" | "DUE_SOON"> {
  return dueStatus === "OVERDUE" || dueStatus === "DUE_SOON";
}

function isReminderStatementRow(
  row: PurchaseApStatementRow,
): row is PurchaseApStatementRow & {
  dueStatus: Extract<PurchaseApDueStatus, "OVERDUE" | "DUE_SOON">;
  daysUntilDue: number;
} {
  return isReminderDueStatus(row.dueStatus) && row.daysUntilDue !== null;
}

function normalizeSupplierName(raw: string | null | undefined): string {
  const normalized = raw?.trim();
  return normalized && normalized.length > 0
    ? normalized
    : "ไม่ระบุซัพพลายเออร์";
}

function toSupplierKey(raw: string | null | undefined): string {
  const normalized = raw?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : UNKNOWN_SUPPLIER_KEY;
}

function toDateKey(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function calculateDaysUntilDate(dateKey: string, todayKey: string): number {
  const dueMs = Date.parse(`${dateKey}T00:00:00.000Z`);
  const todayMs = Date.parse(`${todayKey}T00:00:00.000Z`);
  return Math.round((dueMs - todayMs) / MS_PER_DAY);
}

function resolveDueMeta(
  dueDate: string | null,
  todayKey: string,
): { dueStatus: PurchaseApDueStatus; daysUntilDue: number | null } {
  if (!dueDate) {
    return {
      dueStatus: "NO_DUE_DATE",
      daysUntilDue: null,
    };
  }
  const dueDateKey = toDateKey(dueDate);
  if (!dueDateKey) {
    return {
      dueStatus: "NO_DUE_DATE",
      daysUntilDue: null,
    };
  }

  const daysUntilDue = calculateDaysUntilDate(dueDateKey, todayKey);
  if (daysUntilDue < 0) {
    return {
      dueStatus: "OVERDUE",
      daysUntilDue,
    };
  }
  if (daysUntilDue <= DUE_SOON_DAYS) {
    return {
      dueStatus: "DUE_SOON",
      daysUntilDue,
    };
  }
  return {
    dueStatus: "NOT_DUE",
    daysUntilDue,
  };
}

function mapStatementRow(
  row: PurchaseOutstandingRow,
  todayKey: string,
): PurchaseApStatementRow {
  const dueMeta = resolveDueMeta(row.dueDate, todayKey);
  return {
    ...row,
    supplierKey: toSupplierKey(row.supplierName),
    supplierDisplayName: normalizeSupplierName(row.supplierName),
    dueStatus: dueMeta.dueStatus,
    daysUntilDue: dueMeta.daysUntilDue,
  };
}

function passStatementFilter(
  row: PurchaseApStatementRow,
  filters: {
    paymentStatus: PurchaseApPaymentFilter;
    dueFilter: PurchaseApDueFilter;
    dueFrom?: string;
    dueTo?: string;
    q?: string;
  },
): boolean {
  if (
    filters.paymentStatus !== "ALL" &&
    row.paymentStatus !== filters.paymentStatus
  ) {
    return false;
  }
  if (filters.dueFilter !== "ALL" && row.dueStatus !== filters.dueFilter) {
    return false;
  }

  if (filters.q && !row.poNumber.toLowerCase().includes(filters.q.toLowerCase())) {
    return false;
  }

  if (filters.dueFrom || filters.dueTo) {
    const rowDueDateKey = row.dueDate ? toDateKey(row.dueDate) : null;
    if (!rowDueDateKey) {
      return false;
    }
    if (filters.dueFrom && rowDueDateKey < filters.dueFrom) {
      return false;
    }
    if (filters.dueTo && rowDueDateKey > filters.dueTo) {
      return false;
    }
  }

  return true;
}

async function getStoreCurrency(storeId: string): Promise<"LAK" | "THB" | "USD"> {
  const [storeRow] = await db
    .select({ currency: stores.currency })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  return (storeRow?.currency ?? "LAK") as "LAK" | "THB" | "USD";
}

export async function getPurchaseApSupplierSummary(params: {
  storeId: string;
  q?: string;
  limit?: number;
}) {
  const limit = Math.min(200, Math.max(1, params.limit ?? 100));
  const q = params.q?.trim().toLowerCase() ?? "";
  const storeCurrency = await getStoreCurrency(params.storeId);
  const rows = await getOutstandingPurchaseRows(params.storeId, storeCurrency);
  const todayKey = getTodayDateKey();

  const supplierMap = new Map<string, PurchaseApSupplierSummaryItem>();

  for (const row of rows) {
    const supplierName = normalizeSupplierName(row.supplierName);
    if (q && !supplierName.toLowerCase().includes(q)) {
      continue;
    }

    const supplierKey = toSupplierKey(row.supplierName);
    const current = supplierMap.get(supplierKey) ?? {
      supplierKey,
      supplierName,
      poCount: 0,
      unpaidPoCount: 0,
      partialPoCount: 0,
      totalOutstandingBase: 0,
      overdueOutstandingBase: 0,
      dueSoonOutstandingBase: 0,
    };

    current.poCount += 1;
    if (row.paymentStatus === "UNPAID") {
      current.unpaidPoCount += 1;
    }
    if (row.paymentStatus === "PARTIAL") {
      current.partialPoCount += 1;
    }
    current.totalOutstandingBase += row.outstandingBase;

    const dueMeta = resolveDueMeta(row.dueDate, todayKey);
    if (dueMeta.dueStatus === "OVERDUE") {
      current.overdueOutstandingBase += row.outstandingBase;
    } else if (dueMeta.dueStatus === "DUE_SOON") {
      current.dueSoonOutstandingBase += row.outstandingBase;
    }

    supplierMap.set(supplierKey, current);
  }

  const suppliers = Array.from(supplierMap.values())
    .sort((a, b) => b.totalOutstandingBase - a.totalOutstandingBase)
    .slice(0, limit);

  const totalOutstandingBase = suppliers.reduce(
    (sum, supplier) => sum + supplier.totalOutstandingBase,
    0,
  );

  return {
    storeCurrency,
    suppliers,
    totalOutstandingBase,
  };
}

export async function getPurchaseApSupplierStatement(params: {
  storeId: string;
  supplierKey: string;
  paymentStatus?: PurchaseApPaymentFilter;
  dueFilter?: PurchaseApDueFilter;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  limit?: number;
}) {
  const paymentStatus = params.paymentStatus ?? "ALL";
  const dueFilter = params.dueFilter ?? "ALL";
  const limit = Math.min(1000, Math.max(1, params.limit ?? 500));
  const supplierKey = params.supplierKey.trim().toLowerCase();

  const storeCurrency = await getStoreCurrency(params.storeId);
  const baseRows = await getOutstandingPurchaseRows(params.storeId, storeCurrency);
  const todayKey = getTodayDateKey();

  const rows = baseRows
    .map((row) => mapStatementRow(row, todayKey))
    .filter((row) => row.supplierKey === supplierKey)
    .filter((row) =>
      passStatementFilter(row, {
        paymentStatus,
        dueFilter,
        dueFrom: params.dueFrom,
        dueTo: params.dueTo,
        q: params.q,
      }),
    )
    .sort((a, b) => {
      const aDue = a.dueDate ? toDateKey(a.dueDate) : "9999-12-31";
      const bDue = b.dueDate ? toDateKey(b.dueDate) : "9999-12-31";
      if (aDue !== bDue) {
        return (aDue ?? "9999-12-31").localeCompare(bDue ?? "9999-12-31");
      }
      return a.poNumber.localeCompare(b.poNumber);
    })
    .slice(0, limit);

  const summary: PurchaseApStatementSummary = {
    supplierKey,
    supplierName: rows[0]?.supplierDisplayName ?? "ไม่ระบุซัพพลายเออร์",
    poCount: rows.length,
    totalOutstandingBase: 0,
    overdueOutstandingBase: 0,
    dueSoonOutstandingBase: 0,
    notDueOutstandingBase: 0,
    noDueDateOutstandingBase: 0,
    unpaidPoCount: 0,
    partialPoCount: 0,
  };

  for (const row of rows) {
    summary.totalOutstandingBase += row.outstandingBase;
    if (row.paymentStatus === "UNPAID") {
      summary.unpaidPoCount += 1;
    }
    if (row.paymentStatus === "PARTIAL") {
      summary.partialPoCount += 1;
    }

    if (row.dueStatus === "OVERDUE") {
      summary.overdueOutstandingBase += row.outstandingBase;
    } else if (row.dueStatus === "DUE_SOON") {
      summary.dueSoonOutstandingBase += row.outstandingBase;
    } else if (row.dueStatus === "NOT_DUE") {
      summary.notDueOutstandingBase += row.outstandingBase;
    } else {
      summary.noDueDateOutstandingBase += row.outstandingBase;
    }
  }

  return {
    storeCurrency,
    rows,
    summary,
  };
}

export async function getPurchaseApDueReminders(params: {
  storeId: string;
  limit?: number;
}) {
  const limit = Math.min(500, Math.max(1, params.limit ?? 10));
  const storeCurrency = await getStoreCurrency(params.storeId);
  const baseRows = await getOutstandingPurchaseRows(params.storeId, storeCurrency);
  const todayKey = getTodayDateKey();

  const reminderRows = baseRows
    .map((row) => mapStatementRow(row, todayKey))
    .filter(isReminderStatementRow)
    .sort((a, b) => {
      const aPriority = a.dueStatus === "OVERDUE" ? 0 : 1;
      const bPriority = b.dueStatus === "OVERDUE" ? 0 : 1;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      if (a.daysUntilDue !== b.daysUntilDue) {
        return (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0);
      }
      return a.poNumber.localeCompare(b.poNumber);
    });

  const summary: PurchaseApReminderSummary = {
    overdueCount: 0,
    dueSoonCount: 0,
    overdueOutstandingBase: 0,
    dueSoonOutstandingBase: 0,
    items: [],
  };

  for (const row of reminderRows) {
    if (row.dueStatus === "OVERDUE") {
      summary.overdueCount += 1;
      summary.overdueOutstandingBase += row.outstandingBase;
    } else {
      summary.dueSoonCount += 1;
      summary.dueSoonOutstandingBase += row.outstandingBase;
    }
  }

  summary.items = reminderRows.slice(0, limit).map((row) => ({
    poId: row.poId,
    poNumber: row.poNumber,
    supplierName: row.supplierDisplayName,
    paymentStatus: row.paymentStatus,
    dueDate: row.dueDate,
    dueStatus: row.dueStatus,
    daysUntilDue: row.daysUntilDue ?? 0,
    outstandingBase: row.outstandingBase,
  }));

  return {
    storeCurrency,
    summary,
  };
}
