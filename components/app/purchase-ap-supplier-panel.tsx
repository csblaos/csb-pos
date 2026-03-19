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
import { formatNumberByLanguage } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";

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
  language: AppLanguage;
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

const localeByLanguage: Record<AppLanguage, string> = {
  lo: "lo-LA",
  th: "th-TH",
  en: "en-US",
};

function fmtPrice(
  amount: number,
  currency: StoreCurrency,
  language: AppLanguage,
): string {
  return `${currencySymbol(currency)}${amount.toLocaleString(localeByLanguage[language])}`;
}

function formatDate(dateStr: string | null, language: AppLanguage): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString(localeByLanguage[language], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function interpolatePurchaseText(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!(key in values)) return "";
    return String(values[key]);
  });
}

const calendarWeekdayLabelsByLanguage: Record<AppLanguage, readonly string[]> = {
  lo: ["ອາ", "ຈ", "ອ", "ພ", "ພຫ", "ສກ", "ສ"] as const,
  th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const,
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const,
};

const purchaseApTextByLanguage = {
  lo: {
    retry: "ລອງໃໝ່",
    cancel: "ຍົກເລີກ",
    all: "ທັງໝົດ",
    loading: "ກຳລັງໂຫຼດ...",
    today: "ມື້ນີ້",
    plusSevenDays: "+7 ມື້",
    endOfMonth: "ສິ້ນເດືອນ",
    clear: "ລ້າງ",
    apBySupplierTitle: "AP ຕາມຊັບພລາຍເອີ",
    apBySupplierDescription: "ເລືອກ supplier ເພື່ອເບິ່ງ statement ແລະເປີດ PO ແບບ drill-down",
    refresh: "ຣີເຟຣຊ",
    searchSupplierPlaceholder: "ຄົ້ນຫາ supplier",
    loadingSuppliers: "ກຳລັງໂຫຼດລາຍການ supplier...",
    loadSuppliersFailed: "ໂຫຼດ AP ລາຍ supplier ບໍ່ສຳເລັດ",
    connectionRetry: "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່",
    noApMatches: "ຍັງບໍ່ມີ AP ຄ້າງຊຳລະຕາມເງື່ອນໄຂ",
    clearSupplierSearch: "ລ້າງຄຳຄົ້ນຫາ supplier",
    supplierPoSummary: "{count} PO · ຄ້າງ {amount}",
    supplierRiskSummary: "ເກີນກຳນົດ {overdue} · ໃກ້ຄົບ {dueSoon}",
    selectSupplier: "ເລືອກ supplier",
    statementSummary: "{count} PO · ຄ້າງລວມ {amount}",
    noStatementData: "ຍັງບໍ່ມີຂໍ້ມູນ statement",
    exportSupplierCsv: "Export Supplier CSV",
    selectedCount: "ເລືອກແລ້ວ {selected}/{total} ລາຍການ",
    selectAll: "ເລືອກທັງໝົດ",
    clearSelection: "ລ້າງທີ່ເລືອກ",
    bulkSettle: "ບັນທຶກຊຳລະແບບກຸ່ມ",
    searchPoPlaceholder: "ຄົ້ນຫາເລກ PO",
    sortDueAsc: "ຮຽງຕາມ due date",
    sortOutstandingDesc: "ຮຽງຍອດຄ້າງຫຼາຍສຸດ",
    dueRangeHelp: "ຊ່ວງ due date (ໃຊ້ກັບທັງ statement ແລະ export CSV)",
    dueFrom: "Due ຕັ້ງແຕ່",
    dueTo: "Due ເຖິງ",
    dueFromAria: "ເລືອກ due date ເລີ່ມຕົ້ນໃນ AP statement",
    dueToAria: "ເລືອກ due date ສິ້ນສຸດໃນ AP statement",
    overdue: "ເກີນກຳນົດ",
    dueSoon: "ໃກ້ຄົບກຳນົດ",
    notDue: "ຍັງບໍ່ເຖິງກຳນົດ",
    noDueDate: "ບໍ່ລະບຸ due",
    bulkSettleTitle: "ຊຳລະແບບກຸ່ມຈາກ AP statement",
    bulkSettleHelp: "ລະບົບຈະຈັບຄູ່ຍອດອັດຕະໂນມັດແບບ due date ເກົ່າສຸດກ່ອນ (oldest due first)",
    paidAtLabel: "ວັນທີຊຳລະ",
    referenceLabel: "ເລກອ້າງອີງຮອບຊຳລະ",
    referencePlaceholder: "ເຊັ່ນ Statement 2026-02",
    statementTotalLabel: "ຍອດຊຳລະລວມຕາມ statement (ບໍ່ບັງຄັບ)",
    statementTotalPlaceholder: "ຖ້າບໍ່ກອກ = ຈ່າຍເຕັມຍອດຄ້າງທີ່ເລືອກ",
    noteOptional: "ໝາຍເຫດ (ບໍ່ບັງຄັບ)",
    notePlaceholder: "ເຊັ່ນ ຈ່າຍປາຍເດືອນ",
    allocationSummary: "ຍອດຄ້າງທີ່ເລືອກ {outstanding} · ຈະລົງຊຳລະ {planned} · ຄ້າງຫຼັງຮອບນີ້ {after}",
    unmatchedStatement: "ຍອດ statement ທີ່ຍັງບໍ່ຖືກຈັບຄູ່ {amount}",
    invalidStatementTotal: "ຍອດຊຳລະລວມຈາກ statement ບໍ່ຖືກຕ້ອງ",
    failedListTitle: "ລາຍການທີ່ບໍ່ສຳເລັດ ({count})",
    confirmBulkSettle: "ຢືນຢັນບັນທຶກຊຳລະແບບກຸ່ມ",
    loadingStatement: "ກຳລັງໂຫຼດ statement...",
    loadStatementFailed: "ໂຫຼດ statement ບໍ່ສຳເລັດ",
    noRowsMatch: "ບໍ່ພົບລາຍການຕາມຕົວກອງ",
    clearStatementFilters: "ລ້າງຕົວກອງ statement",
    rowMeta: "due {due} · ຮັບເມື່ອ {received}",
    daysLeft: "ເຫຼືອ {days} ມື້",
    overdueDays: "ເລີຍ {days} ມື້",
    paidAmount: "ຈ່າຍແລ້ວ {amount}",
    selectAtLeastOne: "ກະລຸນາເລືອກ PO ຢ່າງນ້ອຍ 1 ລາຍການ",
    selectPoToSettle: "ກະລຸນາເລືອກ PO ທີ່ຕ້ອງການບັນທຶກຊຳລະ",
    paymentReferenceRequired: "ກະລຸນາກອກເລກອ້າງອີງຮອບບັດ/ຮອບຊຳລະ",
    statementTotalRequired: "ກະລຸນາກອກຍອດຊຳລະລວມຈາກ statement ໃຫ້ຖືກຕ້ອງ",
    bulkStarting: "ເລີ່ມປະມວນຜົນ...",
    bulkProcessing: "ກຳລັງບັນທຶກຊຳລະ {current}/{total} ({poNumber})",
    settleFailed: "{poNumber}: ບັນທຶກຊຳລະບໍ່ສຳເລັດ ({message})",
    settleSuccess: "ບັນທຶກຊຳລະສຳເລັດ {count}/{total} ລາຍການ (ລວມ {amount})",
    failedCount: "ມີລາຍການບໍ່ສຳເລັດ {count} ລາຍການ",
    bulkConnectionFailed: "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດລະຫວ່າງບັນທຶກຊຳລະແບບກຸ່ມ",
    unknown: "unknown",
    paymentStatuses: {
      ALL: "ທັງໝົດ",
      UNPAID: "ຍັງບໍ່ຊຳລະ",
      PARTIAL: "ຊຳລະບາງສ່ວນ",
      PAID: "ຊຳລະແລ້ວ",
    },
    dueStatuses: {
      ALL: "ທັງໝົດ",
      OVERDUE: "ເກີນກຳນົດ",
      DUE_SOON: "ໃກ້ຄົບກຳນົດ",
      NOT_DUE: "ຍັງບໍ່ເຖິງກຳນົດ",
      NO_DUE_DATE: "ບໍ່ລະບຸ due",
    },
  },
  th: {
    retry: "ลองใหม่",
    cancel: "ยกเลิก",
    all: "ทั้งหมด",
    loading: "กำลังโหลด...",
    today: "วันนี้",
    plusSevenDays: "+7 วัน",
    endOfMonth: "สิ้นเดือน",
    clear: "ล้าง",
    apBySupplierTitle: "AP ราย supplier",
    apBySupplierDescription: "เลือก supplier เพื่อดู statement และเปิด PO แบบ drill-down",
    refresh: "รีเฟรช",
    searchSupplierPlaceholder: "ค้นหา supplier",
    loadingSuppliers: "กำลังโหลดรายการ supplier...",
    loadSuppliersFailed: "โหลด AP ราย supplier ไม่สำเร็จ",
    connectionRetry: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
    noApMatches: "ยังไม่มี AP ค้างชำระตามเงื่อนไข",
    clearSupplierSearch: "ล้างคำค้นหา supplier",
    supplierPoSummary: "{count} PO · ค้าง {amount}",
    supplierRiskSummary: "เลยกำหนด {overdue} · ใกล้ครบ {dueSoon}",
    selectSupplier: "เลือก supplier",
    statementSummary: "{count} PO · ค้างรวม {amount}",
    noStatementData: "ยังไม่มีข้อมูล statement",
    exportSupplierCsv: "Export Supplier CSV",
    selectedCount: "เลือกแล้ว {selected}/{total} รายการ",
    selectAll: "เลือกทั้งหมด",
    clearSelection: "ล้างที่เลือก",
    bulkSettle: "บันทึกชำระแบบกลุ่ม",
    searchPoPlaceholder: "ค้นหาเลข PO",
    sortDueAsc: "เรียงตาม due date",
    sortOutstandingDesc: "เรียงยอดค้างมากสุด",
    dueRangeHelp: "ช่วง due date (ใช้กับทั้ง statement และ export CSV)",
    dueFrom: "Due ตั้งแต่",
    dueTo: "Due ถึง",
    dueFromAria: "เลือก due date เริ่มต้นใน AP statement",
    dueToAria: "เลือก due date สิ้นสุดใน AP statement",
    overdue: "เลยกำหนด",
    dueSoon: "ใกล้ครบกำหนด",
    notDue: "ยังไม่ถึงกำหนด",
    noDueDate: "ไม่ระบุ due",
    bulkSettleTitle: "ชำระแบบกลุ่มจาก AP statement",
    bulkSettleHelp: "ระบบจะจับคู่ยอดอัตโนมัติแบบ due date เก่าสุดก่อน (oldest due first)",
    paidAtLabel: "วันที่ชำระ",
    referenceLabel: "เลขอ้างอิงรอบชำระ",
    referencePlaceholder: "เช่น Statement 2026-02",
    statementTotalLabel: "ยอดชำระรวมตาม statement (ไม่บังคับ)",
    statementTotalPlaceholder: "ถ้าไม่กรอก = จ่ายเต็มยอดค้างที่เลือก",
    noteOptional: "หมายเหตุ (ไม่บังคับ)",
    notePlaceholder: "เช่น จ่ายปลายเดือน",
    allocationSummary: "ยอดค้างที่เลือก {outstanding} · จะลงชำระ {planned} · ค้างหลังรอบนี้ {after}",
    unmatchedStatement: "ยอด statement ที่ยังไม่ถูกจับคู่ {amount}",
    invalidStatementTotal: "ยอดชำระรวมจาก statement ไม่ถูกต้อง",
    failedListTitle: "รายการที่ไม่สำเร็จ ({count})",
    confirmBulkSettle: "ยืนยันบันทึกชำระแบบกลุ่ม",
    loadingStatement: "กำลังโหลด statement...",
    loadStatementFailed: "โหลด statement ไม่สำเร็จ",
    noRowsMatch: "ไม่พบรายการตามตัวกรอง",
    clearStatementFilters: "ล้างตัวกรอง statement",
    rowMeta: "due {due} · รับเมื่อ {received}",
    daysLeft: "เหลือ {days} วัน",
    overdueDays: "เลย {days} วัน",
    paidAmount: "จ่ายแล้ว {amount}",
    selectAtLeastOne: "กรุณาเลือก PO อย่างน้อย 1 รายการ",
    selectPoToSettle: "กรุณาเลือก PO ที่ต้องการบันทึกชำระ",
    paymentReferenceRequired: "กรุณากรอกเลขอ้างอิงรอบบัตร/รอบชำระ",
    statementTotalRequired: "กรุณากรอกยอดชำระรวมจาก statement ให้ถูกต้อง",
    bulkStarting: "เริ่มประมวลผล...",
    bulkProcessing: "กำลังบันทึกชำระ {current}/{total} ({poNumber})",
    settleFailed: "{poNumber}: บันทึกชำระไม่สำเร็จ ({message})",
    settleSuccess: "บันทึกชำระสำเร็จ {count}/{total} รายการ (รวม {amount})",
    failedCount: "มีรายการไม่สำเร็จ {count} รายการ",
    bulkConnectionFailed: "เชื่อมต่อไม่สำเร็จระหว่างบันทึกชำระแบบกลุ่ม",
    unknown: "unknown",
    paymentStatuses: {
      ALL: "ทั้งหมด",
      UNPAID: "ยังไม่ชำระ",
      PARTIAL: "ชำระบางส่วน",
      PAID: "ชำระแล้ว",
    },
    dueStatuses: {
      ALL: "ทั้งหมด",
      OVERDUE: "เลยกำหนด",
      DUE_SOON: "ใกล้ครบกำหนด",
      NOT_DUE: "ยังไม่ถึงกำหนด",
      NO_DUE_DATE: "ไม่ระบุ due",
    },
  },
  en: {
    retry: "Retry",
    cancel: "Cancel",
    all: "All",
    loading: "Loading...",
    today: "Today",
    plusSevenDays: "+7 days",
    endOfMonth: "Month end",
    clear: "Clear",
    apBySupplierTitle: "AP by supplier",
    apBySupplierDescription: "Select a supplier to review the statement and drill down into purchase orders.",
    refresh: "Refresh",
    searchSupplierPlaceholder: "Search supplier",
    loadingSuppliers: "Loading suppliers...",
    loadSuppliersFailed: "Failed to load AP by supplier",
    connectionRetry: "Connection failed. Please try again.",
    noApMatches: "No outstanding AP matches the current filters",
    clearSupplierSearch: "Clear supplier search",
    supplierPoSummary: "{count} POs · outstanding {amount}",
    supplierRiskSummary: "Overdue {overdue} · due soon {dueSoon}",
    selectSupplier: "Select supplier",
    statementSummary: "{count} POs · total outstanding {amount}",
    noStatementData: "No statement data yet",
    exportSupplierCsv: "Export Supplier CSV",
    selectedCount: "Selected {selected}/{total} items",
    selectAll: "Select all",
    clearSelection: "Clear selection",
    bulkSettle: "Bulk settle",
    searchPoPlaceholder: "Search PO number",
    sortDueAsc: "Sort by due date",
    sortOutstandingDesc: "Sort by highest outstanding",
    dueRangeHelp: "Due date range (applies to both the statement and CSV export)",
    dueFrom: "Due from",
    dueTo: "Due to",
    dueFromAria: "Choose statement due-date start",
    dueToAria: "Choose statement due-date end",
    overdue: "Overdue",
    dueSoon: "Due soon",
    notDue: "Not due yet",
    noDueDate: "No due date",
    bulkSettleTitle: "Bulk settlement from AP statement",
    bulkSettleHelp: "The system auto-matches payments oldest due first.",
    paidAtLabel: "Payment date",
    referenceLabel: "Settlement reference",
    referencePlaceholder: "e.g. Statement 2026-02",
    statementTotalLabel: "Statement total (optional)",
    statementTotalPlaceholder: "Leave blank to pay the full outstanding balance of selected POs",
    noteOptional: "Note (optional)",
    notePlaceholder: "e.g. month-end settlement",
    allocationSummary: "Selected outstanding {outstanding} · will settle {planned} · remaining after this cycle {after}",
    unmatchedStatement: "Unmatched statement amount {amount}",
    invalidStatementTotal: "Invalid statement total",
    failedListTitle: "Failed items ({count})",
    confirmBulkSettle: "Confirm bulk settlement",
    loadingStatement: "Loading statement...",
    loadStatementFailed: "Failed to load statement",
    noRowsMatch: "No rows match the current filters",
    clearStatementFilters: "Clear statement filters",
    rowMeta: "due {due} · received {received}",
    daysLeft: "{days} days left",
    overdueDays: "{days} days overdue",
    paidAmount: "Paid {amount}",
    selectAtLeastOne: "Please select at least one PO",
    selectPoToSettle: "Please select the PO entries to settle",
    paymentReferenceRequired: "Please enter the payment-cycle reference",
    statementTotalRequired: "Please enter a valid statement total",
    bulkStarting: "Starting...",
    bulkProcessing: "Recording payment {current}/{total} ({poNumber})",
    settleFailed: "{poNumber}: payment recording failed ({message})",
    settleSuccess: "Recorded payments for {count}/{total} POs (total {amount})",
    failedCount: "{count} items failed",
    bulkConnectionFailed: "Connection failed during bulk settlement",
    unknown: "unknown",
    paymentStatuses: {
      ALL: "All",
      UNPAID: "Unpaid",
      PARTIAL: "Partially paid",
      PAID: "Paid",
    },
    dueStatuses: {
      ALL: "All",
      OVERDUE: "Overdue",
      DUE_SOON: "Due soon",
      NOT_DUE: "Not due yet",
      NO_DUE_DATE: "No due date",
    },
  },
} satisfies Record<
  AppLanguage,
  {
    retry: string;
    cancel: string;
    all: string;
    loading: string;
    today: string;
    plusSevenDays: string;
    endOfMonth: string;
    clear: string;
    apBySupplierTitle: string;
    apBySupplierDescription: string;
    refresh: string;
    searchSupplierPlaceholder: string;
    loadingSuppliers: string;
    loadSuppliersFailed: string;
    connectionRetry: string;
    noApMatches: string;
    clearSupplierSearch: string;
    supplierPoSummary: string;
    supplierRiskSummary: string;
    selectSupplier: string;
    statementSummary: string;
    noStatementData: string;
    exportSupplierCsv: string;
    selectedCount: string;
    selectAll: string;
    clearSelection: string;
    bulkSettle: string;
    searchPoPlaceholder: string;
    sortDueAsc: string;
    sortOutstandingDesc: string;
    dueRangeHelp: string;
    dueFrom: string;
    dueTo: string;
    dueFromAria: string;
    dueToAria: string;
    overdue: string;
    dueSoon: string;
    notDue: string;
    noDueDate: string;
    bulkSettleTitle: string;
    bulkSettleHelp: string;
    paidAtLabel: string;
    referenceLabel: string;
    referencePlaceholder: string;
    statementTotalLabel: string;
    statementTotalPlaceholder: string;
    noteOptional: string;
    notePlaceholder: string;
    allocationSummary: string;
    unmatchedStatement: string;
    invalidStatementTotal: string;
    failedListTitle: string;
    confirmBulkSettle: string;
    loadingStatement: string;
    loadStatementFailed: string;
    noRowsMatch: string;
    clearStatementFilters: string;
    rowMeta: string;
    daysLeft: string;
    overdueDays: string;
    paidAmount: string;
    selectAtLeastOne: string;
    selectPoToSettle: string;
    paymentReferenceRequired: string;
    statementTotalRequired: string;
    bulkStarting: string;
    bulkProcessing: string;
    settleFailed: string;
    settleSuccess: string;
    failedCount: string;
    bulkConnectionFailed: string;
    unknown: string;
    paymentStatuses: Record<PaymentFilter, string>;
    dueStatuses: Record<DueFilter, string>;
  }
>;

type PurchaseDatePickerFieldProps = {
  language: AppLanguage;
  value: string;
  onChange: (nextValue: string) => void;
  triggerClassName: string;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
};

function PurchaseDatePickerField({
  language,
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
  const monthLabel = viewCursor.toLocaleDateString(localeByLanguage[language], {
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
            {calendarWeekdayLabelsByLanguage[language].map((label) => (
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
  language,
  storeCurrency,
  refreshKey,
  preset,
  onFiltersChange,
  onOpenPurchaseOrder,
  onAfterBulkSettle,
}: PurchaseApSupplierPanelProps) {
  const ui = useMemo(() => purchaseApTextByLanguage[language], [language]);
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
        setSupplierError(data?.message ?? ui.loadSuppliersFailed);
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
      setSupplierError(ui.connectionRetry);
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, [supplierQuery, ui.connectionRetry, ui.loadSuppliersFailed]);

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
        setStatementError(data?.message ?? ui.loadStatementFailed);
        return;
      }

      setStatementRows(Array.isArray(data.rows) ? data.rows : []);
      setStatementSummary(data.summary ?? null);
      setStatementError(null);
    } catch {
      setStatementError(ui.connectionRetry);
    } finally {
      setIsLoadingStatement(false);
    }
  }, [
    dueFilter,
    dueFrom,
    dueTo,
    paymentFilter,
    poQuery,
    selectedSupplierKey,
    ui.connectionRetry,
    ui.loadStatementFailed,
  ]);

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
      toast.error(ui.selectAtLeastOne);
      return;
    }
    setBulkPaidAtInput(new Date().toISOString().slice(0, 10));
    setBulkReferenceInput("");
    setBulkNoteInput("");
    setBulkStatementTotalInput("");
    setBulkErrors([]);
    setBulkProgressText(null);
    setIsBulkSettleMode(true);
  }, [sortedSelectedRows.length, ui.selectAtLeastOne]);

  const submitBulkSettle = useCallback(async () => {
    if (sortedSelectedRows.length === 0) {
      toast.error(ui.selectPoToSettle);
      return;
    }
    const paymentReference = bulkReferenceInput.trim();
    if (!paymentReference) {
      toast.error(ui.paymentReferenceRequired);
      return;
    }

    const hasStatementTotal = bulkStatementTotalInput.trim().length > 0;
    const parsedStatementTotal = Math.round(Number(bulkStatementTotalInput));
    if (
      hasStatementTotal &&
      (!Number.isFinite(parsedStatementTotal) || parsedStatementTotal <= 0)
    ) {
      toast.error(ui.statementTotalRequired);
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
    setBulkProgressText(ui.bulkStarting);

    try {
      for (let i = 0; i < sortedSelectedRows.length; i += 1) {
        const row = sortedSelectedRows[i]!;
        setBulkProgressText(
          interpolatePurchaseText(ui.bulkProcessing, {
            current: i + 1,
            total: sortedSelectedRows.length,
            poNumber: row.poNumber,
          }),
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
            interpolatePurchaseText(ui.settleFailed, {
              poNumber: row.poNumber,
              message: data?.message ?? ui.unknown,
            }),
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
          interpolatePurchaseText(ui.settleSuccess, {
            count: settledCount,
            total: sortedSelectedRows.length,
            amount: fmtPrice(settledAmountTotal, storeCurrency, language),
          }),
        );
      }
      if ((remainingStatementBudget ?? 0) > 0) {
        toast(
          interpolatePurchaseText(ui.unmatchedStatement, {
            amount: fmtPrice(
              remainingStatementBudget ?? 0,
              storeCurrency,
              language,
            ),
          }),
        );
      }
      if (errors.length > 0) {
        toast.error(
          interpolatePurchaseText(ui.failedCount, { count: errors.length }),
        );
      } else {
        setSelectedPoIds([]);
        setIsBulkSettleMode(false);
      }

      setBulkErrors(errors);
      await loadSupplierSummary();
      await loadStatement();
      await onAfterBulkSettle?.();
    } catch {
      toast.error(ui.bulkConnectionFailed);
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
    language,
    ui.bulkConnectionFailed,
    ui.bulkProcessing,
    ui.bulkStarting,
    ui.failedCount,
    ui.paymentReferenceRequired,
    ui.selectPoToSettle,
    ui.settleFailed,
    ui.settleSuccess,
    ui.statementTotalRequired,
    ui.unmatchedStatement,
    ui.unknown,
  ]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            {ui.apBySupplierTitle}
          </p>
          <p className="text-[11px] text-slate-500">
            {ui.apBySupplierDescription}
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
          {isLoadingSuppliers ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ui.refresh}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,300px)_1fr]">
        <div className="space-y-2">
          <input
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
            placeholder={ui.searchSupplierPlaceholder}
            value={supplierSearchInput}
            onChange={(event) => setSupplierSearchInput(event.target.value)}
          />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {isLoadingSuppliers ? (
              <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500">
                {ui.loadingSuppliers}
              </p>
            ) : supplierError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                {supplierError}
              </div>
            ) : suppliers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-4 text-center">
                <p className="text-xs text-slate-500">{ui.noApMatches}</p>
                {supplierSearchInput.trim().length > 0 ? (
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    onClick={resetSupplierSearch}
                  >
                    {ui.clearSupplierSearch}
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
                      {interpolatePurchaseText(ui.supplierPoSummary, {
                        count: formatNumberByLanguage(language, supplier.poCount),
                        amount: fmtPrice(supplier.totalOutstandingBase, storeCurrency, language),
                      })}
                    </p>
                    {(supplier.overdueOutstandingBase > 0 ||
                      supplier.dueSoonOutstandingBase > 0) && (
                      <p className="mt-1 text-[10px] text-amber-700">
                        {interpolatePurchaseText(ui.supplierRiskSummary, {
                          overdue: fmtPrice(supplier.overdueOutstandingBase, storeCurrency, language),
                          dueSoon: fmtPrice(supplier.dueSoonOutstandingBase, storeCurrency, language),
                        })}
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
                {selectedSupplier?.supplierName ?? ui.selectSupplier}
              </p>
              {statementSummary ? (
                <p className="text-xs text-slate-500">
                  {interpolatePurchaseText(ui.statementSummary, {
                    count: formatNumberByLanguage(language, statementSummary.poCount),
                    amount: fmtPrice(statementSummary.totalOutstandingBase, storeCurrency, language),
                  })}
                </p>
              ) : (
                <p className="text-xs text-slate-500">{ui.noStatementData}</p>
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
              {ui.exportSupplierCsv}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <span className="text-[11px] text-slate-600">
              {interpolatePurchaseText(ui.selectedCount, {
                selected: formatNumberByLanguage(language, selectedPoIds.length),
                total: formatNumberByLanguage(language, selectableStatementRows.length),
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={selectAllRows}
              disabled={selectableStatementRows.length === 0 || isBulkSettling}
            >
              {ui.selectAll}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={clearSelectedRows}
              disabled={selectedPoIds.length === 0 || isBulkSettling}
            >
              {ui.clearSelection}
            </Button>
            <Button
              type="button"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={openBulkSettleMode}
              disabled={selectedPoIds.length === 0 || isBulkSettling}
            >
              {ui.bulkSettle}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 xl:col-span-2"
              placeholder={ui.searchPoPlaceholder}
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
              <option value="ALL">{ui.paymentStatuses.ALL}</option>
              <option value="UNPAID">{ui.paymentStatuses.UNPAID}</option>
              <option value="PARTIAL">{ui.paymentStatuses.PARTIAL}</option>
              <option value="PAID">{ui.paymentStatuses.PAID}</option>
            </select>
            <select
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300"
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value as DueFilter)}
            >
              <option value="ALL">{ui.dueStatuses.ALL}</option>
              <option value="OVERDUE">{ui.dueStatuses.OVERDUE}</option>
              <option value="DUE_SOON">{ui.dueStatuses.DUE_SOON}</option>
              <option value="NOT_DUE">{ui.dueStatuses.NOT_DUE}</option>
              <option value="NO_DUE_DATE">{ui.dueStatuses.NO_DUE_DATE}</option>
            </select>
            <select
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-slate-300"
              value={statementSort}
              onChange={(event) => setStatementSort(event.target.value as StatementSort)}
            >
              <option value="DUE_ASC">{ui.sortDueAsc}</option>
              <option value="OUTSTANDING_DESC">{ui.sortOutstandingDesc}</option>
            </select>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-600">
              {ui.dueRangeHelp}
            </p>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <div className="space-y-1 min-w-0">
                <label className="text-[11px] text-slate-500">{ui.dueFrom}</label>
                <PurchaseDatePickerField
                  language={language}
                  value={dueFrom}
                  onChange={setDueFrom}
                  triggerClassName="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-left text-xs outline-none focus:ring-2 focus:ring-slate-300 flex items-center justify-between gap-2"
                  ariaLabel={ui.dueFromAria}
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "TODAY")}
                  >
                    {ui.today}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "PLUS_7")}
                  >
                    {ui.plusSevenDays}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "END_OF_MONTH")}
                  >
                    {ui.endOfMonth}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueFrom", "CLEAR")}
                  >
                    {ui.clear}
                  </button>
                </div>
              </div>
              <div className="space-y-1 min-w-0">
                <label className="text-[11px] text-slate-500">{ui.dueTo}</label>
                <PurchaseDatePickerField
                  language={language}
                  value={dueTo}
                  onChange={setDueTo}
                  triggerClassName="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-left text-xs outline-none focus:ring-2 focus:ring-slate-300 flex items-center justify-between gap-2"
                  ariaLabel={ui.dueToAria}
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "TODAY")}
                  >
                    {ui.today}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "PLUS_7")}
                  >
                    {ui.plusSevenDays}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "END_OF_MONTH")}
                  >
                    {ui.endOfMonth}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => applyStatementDateShortcut("dueTo", "CLEAR")}
                  >
                    {ui.clear}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {statementSummary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">{ui.overdue}</p>
                <p className="text-xs font-medium text-red-600">
                  {fmtPrice(statementSummary.overdueOutstandingBase, storeCurrency, language)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">{ui.dueSoon}</p>
                <p className="text-xs font-medium text-amber-700">
                  {fmtPrice(statementSummary.dueSoonOutstandingBase, storeCurrency, language)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">{ui.notDue}</p>
                <p className="text-xs font-medium text-emerald-700">
                  {fmtPrice(statementSummary.notDueOutstandingBase, storeCurrency, language)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] text-slate-500">{ui.noDueDate}</p>
                <p className="text-xs font-medium text-slate-700">
                  {fmtPrice(statementSummary.noDueDateOutstandingBase, storeCurrency, language)}
                </p>
              </div>
            </div>
          )}

          {isBulkSettleMode ? (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="text-xs font-semibold text-emerald-800">
                {ui.bulkSettleTitle}
              </p>
              <p className="text-[11px] text-emerald-700/90">
                {ui.bulkSettleHelp}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    {ui.paidAtLabel}
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
                    {ui.referenceLabel}
                  </label>
                  <input
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkReferenceInput}
                    onChange={(event) => setBulkReferenceInput(event.target.value)}
                    placeholder={ui.referencePlaceholder}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    {ui.statementTotalLabel}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkStatementTotalInput}
                    onChange={(event) => setBulkStatementTotalInput(event.target.value)}
                    placeholder={ui.statementTotalPlaceholder}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-emerald-700">
                    {ui.noteOptional}
                  </label>
                  <input
                    className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-300"
                    value={bulkNoteInput}
                    onChange={(event) => setBulkNoteInput(event.target.value)}
                    placeholder={ui.notePlaceholder}
                  />
                </div>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white p-2">
                <p className="text-[11px] text-slate-600">
                  {interpolatePurchaseText(ui.allocationSummary, {
                    outstanding: fmtPrice(bulkAllocationPreview.totalOutstanding, storeCurrency, language),
                    planned: fmtPrice(bulkAllocationPreview.plannedTotal, storeCurrency, language),
                    after: fmtPrice(bulkAllocationPreview.outstandingAfter, storeCurrency, language),
                  })}
                </p>
                {bulkAllocationPreview.statementTotal !== null ? (
                  <p className="mt-1 text-[11px] text-slate-600">
                    {interpolatePurchaseText(ui.unmatchedStatement, {
                      amount: fmtPrice(bulkAllocationPreview.remainingUnallocated, storeCurrency, language),
                    })}
                  </p>
                ) : null}
                {bulkAllocationPreview.invalidStatementTotal ? (
                  <p className="mt-1 text-[11px] text-red-600">
                    {ui.invalidStatementTotal}
                  </p>
                ) : null}
              </div>
              {bulkProgressText ? (
                <p className="text-[11px] text-emerald-700">{bulkProgressText}</p>
              ) : null}
              {bulkErrors.length > 0 ? (
                <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2">
                  <p className="text-[11px] font-semibold text-red-700">
                    {interpolatePurchaseText(ui.failedListTitle, {
                      count: bulkErrors.length,
                    })}
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
                  {ui.cancel}
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
                    ui.confirmBulkSettle
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {isLoadingStatement ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-3 text-xs text-slate-500">
              {ui.loadingStatement}
            </p>
          ) : statementError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
              {statementError}
            </div>
          ) : displayStatementRows.length === 0 ? (
            <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-4 text-center">
              <p className="text-xs text-slate-500">{ui.noRowsMatch}</p>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={resetStatementFilters}
              >
                {ui.clearStatementFilters}
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
                        {interpolatePurchaseText(ui.rowMeta, {
                          due: formatDate(row.dueDate, language),
                          received: formatDate(row.receivedAt, language),
                        })}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {ui.paymentStatuses[row.paymentStatus]} · {ui.dueStatuses[row.dueStatus]}
                        {row.daysUntilDue !== null
                          ? ` (${row.daysUntilDue >= 0
                              ? interpolatePurchaseText(ui.daysLeft, {
                                  days: formatNumberByLanguage(language, row.daysUntilDue),
                                })
                              : interpolatePurchaseText(ui.overdueDays, {
                                  days: formatNumberByLanguage(language, Math.abs(row.daysUntilDue)),
                                })})`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-900">
                        {fmtPrice(row.outstandingBase, storeCurrency, language)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {interpolatePurchaseText(ui.paidAmount, {
                          amount: fmtPrice(row.totalPaidBase, storeCurrency, language),
                        })}
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
