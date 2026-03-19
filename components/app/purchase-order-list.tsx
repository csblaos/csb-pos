"use client";

import {
  Banknote,
  CalendarDays,
  Clock,
  ChevronLeft,
  Download,
  Loader2,
  Package,
  Pencil,
  Plus,
  Share2,
  ShoppingCart,
  Truck,
  CheckCircle2,
  XCircle,
  FileText,
  X,
  ChevronRight,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import {
  StockTabErrorState,
  StockTabLoadingState,
  StockTabToolbar,
} from "@/components/app/stock-tab-feedback";
import {
  PurchaseApSupplierPanel,
  type PurchaseApPanelPreset,
} from "@/components/app/purchase-ap-supplier-panel";
import { authFetch } from "@/lib/auth/client-token";
import type { StoreCurrency } from "@/lib/finance/store-financial";
import { currencySymbol } from "@/lib/finance/store-financial";
import { createTranslator, formatNumberByLanguage } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import {
  getLegacyPurchaseSavedPresetsStorageKey,
  getLegacyPurchaseWorkspaceStorageKey,
  getPurchaseSavedPresetsStorageKey,
  getPurchaseWorkspaceStorageKey,
} from "@/lib/purchases/client-storage";
import type { POPdfData } from "@/lib/pdf/generate-po-pdf";
import type { PoPdfConfig } from "@/lib/pdf/generate-po-pdf";
import { canNativeShare } from "@/lib/pdf/share-or-download";
import type { PurchaseOrderListItem } from "@/server/repositories/purchase.repo";

const localeByLanguage: Record<AppLanguage, string> = {
  lo: "lo-LA",
  th: "th-TH",
  en: "en-US",
};

/* ── Status config ── */
const statusConfig: Record<
  PurchaseOrderListItem["status"],
  { icon: typeof Clock; badgeClass: string }
> = {
  DRAFT: {
    icon: FileText,
    badgeClass: "bg-slate-100 text-slate-600",
  },
  ORDERED: {
    icon: ShoppingCart,
    badgeClass: "bg-amber-100 text-amber-700",
  },
  SHIPPED: {
    icon: Truck,
    badgeClass: "bg-blue-100 text-blue-700",
  },
  RECEIVED: {
    icon: CheckCircle2,
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  CANCELLED: {
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-600",
  },
};

type PurchaseOrderListProps = {
  language: AppLanguage;
  purchaseOrders: PurchaseOrderListItem[];
  activeStoreId: string;
  userId: string;
  storeCurrency: StoreCurrency;
  canCreate: boolean;
  pageSize: number;
  initialHasMore: boolean;
  storeLogoUrl?: string | null;
  pdfConfig?: Partial<PoPdfConfig>;
};

type StatusFilter = "ALL" | "OPEN" | PurchaseOrderListItem["status"];
type PurchaseWorkspace = "OPERATIONS" | "MONTH_END" | "SUPPLIER_AP";
type KpiShortcut = "OPEN_PO" | "PENDING_RATE" | "OVERDUE_AP" | "OUTSTANDING_AP";
type SavedPurchasePreset = {
  id: string;
  label: string;
  shortcut: KpiShortcut;
  createdAt: string;
};
const PURCHASE_WORKSPACE_QUERY_KEY = "workspace";
const PURCHASE_STATUS_QUERY_KEY = "poStatus";
const PURCHASE_AP_DUE_QUERY_KEY = "due";
const PURCHASE_AP_PAYMENT_QUERY_KEY = "payment";
const PURCHASE_AP_SORT_QUERY_KEY = "sort";

type PurchaseApDueFilter = "ALL" | "OVERDUE" | "DUE_SOON" | "NOT_DUE" | "NO_DUE_DATE";
type PurchaseApPaymentFilter = "ALL" | "UNPAID" | "PARTIAL" | "PAID";
type PurchaseApSort = "DUE_ASC" | "OUTSTANDING_DESC";
const DEFAULT_PO_STATUS_FILTER: StatusFilter = "OPEN";

function isPurchaseWorkspace(value: string | null): value is PurchaseWorkspace {
  return value === "OPERATIONS" || value === "MONTH_END" || value === "SUPPLIER_AP";
}

function isPurchaseStatusFilter(value: string | null): value is StatusFilter {
  return (
    value === "ALL" ||
    value === "OPEN" ||
    value === "DRAFT" ||
    value === "ORDERED" ||
    value === "SHIPPED" ||
    value === "RECEIVED" ||
    value === "CANCELLED"
  );
}

function isPurchaseApDueFilter(value: string | null): value is PurchaseApDueFilter {
  return (
    value === "ALL" ||
    value === "OVERDUE" ||
    value === "DUE_SOON" ||
    value === "NOT_DUE" ||
    value === "NO_DUE_DATE"
  );
}

function isPurchaseApPaymentFilter(value: string | null): value is PurchaseApPaymentFilter {
  return value === "ALL" || value === "UNPAID" || value === "PARTIAL" || value === "PAID";
}

function isPurchaseApSort(value: string | null): value is PurchaseApSort {
  return value === "DUE_ASC" || value === "OUTSTANDING_DESC";
}

const purchaseShortcutTextByLanguage = {
  lo: {
    defaults: {
      OPEN_PO: "Open PO",
      PENDING_RATE: "Month-End",
      OVERDUE_AP: "Overdue AP",
      OUTSTANDING_AP: "Outstanding AP",
    },
    descriptions: {
      OPEN_PO: "Open PO: ກອງວຽກທີ່ຍັງເປີດຢູ່",
      PENDING_RATE: "Pending Rate: ໂຟກັດວຽກປິດເຣດປາຍເດືອນ",
      OVERDUE_AP: "Overdue AP: ລາຍການເກີນກຳນົດຈ່າຍ",
      OUTSTANDING_AP: "Outstanding: AP by Supplier + ຮຽງຕາມຍອດຄ້າງສູງສຸດ",
    },
  },
  th: {
    defaults: {
      OPEN_PO: "Open PO",
      PENDING_RATE: "Month-End",
      OVERDUE_AP: "Overdue AP",
      OUTSTANDING_AP: "Outstanding AP",
    },
    descriptions: {
      OPEN_PO: "Open PO: กรองเฉพาะงานที่ยังเปิด",
      PENDING_RATE: "Pending Rate: โฟกัสงานปิดเรทปลายเดือน",
      OVERDUE_AP: "Overdue AP: รายการเจ้าหนี้เลยกำหนด",
      OUTSTANDING_AP: "Outstanding: AP by Supplier + เรียงยอดค้างมากสุด",
    },
  },
  en: {
    defaults: {
      OPEN_PO: "Open PO",
      PENDING_RATE: "Month-End",
      OVERDUE_AP: "Overdue AP",
      OUTSTANDING_AP: "Outstanding AP",
    },
    descriptions: {
      OPEN_PO: "Open PO: filter only active purchasing work",
      PENDING_RATE: "Pending Rate: focus on month-end rate finalization",
      OVERDUE_AP: "Overdue AP: suppliers past due",
      OUTSTANDING_AP: "Outstanding: AP by supplier sorted by highest balance",
    },
  },
} satisfies Record<
  AppLanguage,
  {
    defaults: Record<KpiShortcut, string>;
    descriptions: Record<KpiShortcut, string>;
  }
>;

function kpiShortcutDefaultLabel(
  language: AppLanguage,
  shortcut: KpiShortcut,
): string {
  return purchaseShortcutTextByLanguage[language].defaults[shortcut];
}

function getShortcutDescription(language: AppLanguage, shortcut: KpiShortcut): string {
  return purchaseShortcutTextByLanguage[language].descriptions[shortcut];
}

type PurchaseOrderDetail = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  supplierContact: string | null;
  purchaseCurrency: string;
  exchangeRate: number;
  exchangeRateInitial: number;
  exchangeRateLockedAt: string | null;
  exchangeRateLockNote: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paidAt: string | null;
  paidByName: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  dueDate: string | null;
  shippingCost: number;
  otherCost: number;
  otherCostNote: string | null;
  status: string;
  orderedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  expectedAt: string | null;
  trackingInfo: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  items: {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    qtyOrdered: number;
    qtyReceived: number;
    unitCostPurchase: number;
    unitCostBase: number;
    landedCostPerUnit: number;
  }[];
  totalCostBase: number;
  totalPaidBase: number;
  outstandingBase: number;
  paymentEntries: {
    id: string;
    entryType: "PAYMENT" | "REVERSAL";
    amountBase: number;
    paidAt: string;
    reference: string | null;
    note: string | null;
    reversedPaymentId: string | null;
    createdByName: string | null;
  }[];
};

type PoDetailLoadResult = {
  purchaseOrder: PurchaseOrderDetail | null;
  error: string | null;
};

type PendingRateQueueItem = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  purchaseCurrency: StoreCurrency;
  exchangeRateInitial: number;
  receivedAt: string | null;
  expectedAt: string | null;
  dueDate: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  itemCount: number;
  totalCostBase: number;
  outstandingBase: number;
};

function fmtPrice(
  amount: number,
  currency: StoreCurrency,
  language: AppLanguage = "th",
): string {
  return `${currencySymbol(currency)}${formatNumberByLanguage(language, amount)}`;
}

function daysUntil(dateStr: string): number {
  const targetDate = new Date(dateStr);
  const now = new Date();
  return Math.ceil(
    (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatDate(dateStr: string, language: AppLanguage = "th"): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(localeByLanguage[language], {
    day: "numeric",
    month: "short",
    year: undefined,
  });
}

function sortableDateValue(dateStr: string | null): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const parsed = new Date(dateStr).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
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
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!(key in values)) {
      return "";
    }
    return String(values[key]);
  });
}

const calendarWeekdayLabelsByLanguage: Record<
  AppLanguage,
  readonly string[]
> = {
  lo: ["ອາ", "ຈ", "ອ", "ພ", "ພຫ", "ສກ", "ສ"] as const,
  th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const,
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const,
};

const purchaseTextByLanguage = {
  lo: {
    common: {
      savePresetPrompt: "ຕັ້ງຊື່ preset ນີ້",
      presetSaved: "ບັນທຶກ preset ແລ້ວ",
      retry: "ລອງໃໝ່",
      cancel: "ຍົກເລີກ",
      close: "ປິດ",
      share: "ແບ່ງປັນ",
      loadMore: "ໂຫຼດເພີ່ມ",
      loading: "ກຳລັງໂຫຼດ...",
      total: "ລວມ",
      note: "ໝາຍເຫດ",
      supplier: "ຜູ້ສະໜອງ",
      contact: "ເບີຕິດຕໍ່",
      currency: "ສະກຸນເງິນ",
      dueDate: "ຄົບກຳນົດຊຳລະ",
      expectedAt: "ຄາດວ່າຈະໄດ້ຮັບ",
      tracking: "Tracking",
      today: "ມື້ນີ້",
      plusSevenDays: "+7 ມື້",
      endOfMonth: "ສິ້ນເດືອນ",
      clear: "ລ້າງ",
    },
    errors: {
      atLeastOneItem: "ກະລຸນາເພີ່ມສິນຄ້າຢ່າງນ້ອຍ 1 ລາຍການ",
      loadPoDetailFailed: "ໂຫຼດລາຍລະອຽດໃບສັ່ງຊື້ບໍ່ສຳເລັດ",
      poNotFound: "ບໍ່ພົບຂໍ້ມູນໃບສັ່ງຊື້",
      connectionRetry: "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່",
      loadPoListFailed: "ໂຫຼດລາຍການໃບສັ່ງຊື້ບໍ່ສຳເລັດ",
      invalidPoList: "ຮູບແບບຂໍ້ມູນໃບສັ່ງຊື້ບໍ່ຖືກຕ້ອງ",
      loadPendingRateFailed: "ໂຫຼດຄິວລໍຖ້າປິດເຣດບໍ່ສຳເລັດ",
    },
    pendingQueue: {
      emptyHint: "ລອງກັບໄປ `PO Operations` ເພື່ອເຊັກວຽກຮັບເຂົ້າ ຫຼືສ້າງ PO ເພີ່ມ",
      goOperations: "ໄປ PO Operations",
      selectedCount: "ເລືອກແລ້ວ {selected}/{total} ລາຍການ",
    },
    bulk: {
      selectAtLeastOne: "ກະລຸນາເລືອກ PO ຢ່າງນ້ອຍ 1 ລາຍການ",
      sameCurrencyOnly: "ປິດເຣດແບບກຸ່ມໄດ້ສະເພາະ PO ສະກຸນເງິນດຽວກັນຕໍ່ຮອບ",
      exchangeRateRequired: "ກະລຸນາກອກອັດຕາແລກປ່ຽນຈິງໃຫ້ຖືກຕ້ອງ",
      referenceRequired: "ກະລຸນາກອກເລກອ້າງອີງຮອບບັດ/ຮອບຊຳລະ",
      statementTotalRequired: "ກະລຸນາກອກຍອດຊຳລະລວມຈາກ statement ໃຫ້ຖືກຕ້ອງ",
      starting: "ເລີ່ມປະມວນຜົນ...",
      processing: "ກຳລັງປະມວນຜົນ {current}/{total} ({poNumber})",
      paymentRoundNote: "ຮອບຊຳລະ {reference}",
      autoMatchHint:
        "ລະບົບຈະຈັບຄູ່ຍອດຊຳລະອັດຕະໂນມັດແບບຄົບກຳນົດເກົ່າສຸດກ່ອນ (oldest due first)",
      exchangeRateLabel: "ອັດຕາແລກປ່ຽນຈິງ (1 {purchase} = ? {store})",
      paidAtLabel: "ວັນທີຊຳລະ (top-up date)",
      statementTotalLabel: "ຍອດຊຳລະລວມຕາມ statement (ບໍ່ບັງຄັບ)",
      statementTotalHelp: "ຖ້າເວັ້ນວ່າງ ລະບົບຈະຊຳລະເຕັມຍອດຄ້າງທຸກ PO ທີ່ເລືອກ",
      referenceLabel: "ເລກອ້າງອີງຮອບບັດ/ຮອບຊຳລະ (ບັງຄັບ)",
      referencePlaceholder: "ເຊັ່ນ BCEL-VISA-2026-02",
      noteLabel: "ໝາຍເຫດ (ບໍ່ບັງຄັບ)",
      notePlaceholder: "ເຊັ່ນ top-up ຮອບປາຍເດືອນ",
      reconcilePlanTitle: "ແຜນກະທົບຍອດອັດຕະໂນມັດ (ກ່ອນກົດຢືນຢັນ)",
      reconcilePlanSummary:
        "ຍອດຄ້າງທີ່ເລືອກ {outstanding} · ຈະລົງຊຳລະ {planned} · ຄ້າງຫຼັງຮອບນີ້ {after}",
      statementTotalMustBePositive: "ຍອດຊຳລະລວມຕ້ອງຫຼາຍກວ່າ 0",
      dueShort: "due",
      reconcileRowMatched: "ຈັບຄູ່",
      reconcileRowOutstanding: "ຄ້າງ",
      failedListTitle: "ລາຍການບໍ່ສຳເລັດ ({count})",
      startFinalizeAndSettle: "ເລີ່ມປິດເຣດ + ຊຳລະ",
      finalizeFailed: "{poNumber}: ປິດເຣດບໍ່ສຳເລັດ ({message})",
      detailReloadFailed: "{poNumber}: ໂຫຼດຍອດຄ້າງຫຼັງປິດເຣດບໍ່ສຳເລັດ ({message})",
      settleFailed: "{poNumber}: ບັນທຶກຊຳລະບໍ່ສຳເລັດ ({message})",
      finalizeSuccess: "ປິດເຣດສຳເລັດ {count}/{total} ລາຍການ",
      settleSuccess: "ບັນທຶກຊຳລະສຳເລັດ {count}/{total} ລາຍການ (ລວມ {amount})",
      unmatchedStatement: "ຍັງມີຍອດ statement ທີ່ຍັງບໍ່ຖືກຈັບຄູ່ {amount}",
      failedCount: "ມີລາຍການບໍ່ສຳເລັດ {count} ລາຍການ",
      processingConnectionFailed: "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດລະຫວ່າງປະມວນຜົນແບບກຸ່ມ",
      unknown: "unknown",
    },
    create: {
      title: "ສ້າງໃບສັ່ງຊື້",
      stepLabel: "ຂັ້ນຕອນ",
      supplierNameOptional: "ຊື່ຊັບພລາຍເອີ (ບໍ່ບັງຄັບ)",
      hideSuppliers: "ຊ່ອນລາຍການຊັບພລາຍເອີ",
      allSuppliers: "ເບິ່ງຊັບພລາຍເອີທັງໝົດ",
      supplierPlaceholder: "ເຊັ່ນ ຮ້ານສົມໄຊ, ຕະຫຼາດເຊົ້າ",
      supplierSearchHint:
        "ພິມເພື່ອຄົ້ນຫາ ແລະເລືອກຈາກລາຍຊື່ເກົ່າ ຫຼືພິມຊື່ໃໝ່ໄດ້",
      supplierSearchEmpty:
        "ບໍ່ພົບຊື່ຊັບພລາຍເອີຕາມຄຳຄົ້ນຫາ ສາມາດໃຊ້ຊື່ທີ່ພິມໄດ້ເລີຍ",
      contactOptional: "ເບີຕິດຕໍ່ (ບໍ່ບັງຄັບ)",
      purchaseCurrency: "ສະກຸນເງິນທີ່ຊື້",
      actualExchangeRateOptional: "ອັດຕາແລກປ່ຽນຈິງ (ຖ້າຮູ້)",
      exchangeRatePlaceholder: "ເຊັ່ນ 600 (1 {purchase} = ? {store})",
      exchangeRateHelp:
        "ຖ້າຍັງບໍ່ຮູ້ເຣດຈິງ ສາມາດປ່ອຍວ່າງໄວ້ ແລະໄປປິດເຣດຫຼັງຮັບສິນຄ້າ/ຕອນຊຳລະ",
      next: "ຖັດໄປ →",
      addProducts: "ເພີ່ມສິນຄ້າ",
      hideProducts: "ຊ່ອນລາຍການສິນຄ້າ",
      allProducts: "ເບິ່ງສິນຄ້າທັງໝົດ",
      searchProductsPlaceholder: "ຄົ້ນຫາສິນຄ້າ...",
      searchProductsHint: "ຄົ້ນຫາດ້ວຍຊື່ ຫຼື SKU ຫຼືກົດເພື່ອເລືອກຈາກລາຍການ",
      noMatchingProducts: "ບໍ່ພົບສິນຄ້າຕາມຄຳຄົ້ນຫາ",
      noProductsAvailable: "ບໍ່ມີສິນຄ້າໃຫ້ເລືອກ",
      noProductsAdded: "ຍັງບໍ່ໄດ້ເພີ່ມສິນຄ້າ",
      quantity: "ຈຳນວນ",
      costPerCurrency: "ລາຄາ / {currency}",
      back: "← ກັບ",
      shippingCostLabel: "ຄ່າຂົນສົ່ງ ({currency})",
      otherCostLabel: "ຄ່າອື່ນໆ ({currency})",
      otherCostNoteLabel: "ໝາຍເຫດຄ່າອື່ນໆ",
      otherCostNotePlaceholder: "ເຊັ່ນ ຄ່າພາສີ, ຄ່າດຳເນີນການ",
      expectedReceiveDateOptional: "ຄາດວ່າຈະໄດ້ຮັບ (ບໍ່ບັງຄັບ)",
      expectedReceiveAria: "ເລືອກວັນທີຄາດວ່າຈະໄດ້ຮັບ",
      expectedReceiveHelp: "ຍັງບໍ່ຈຳເປັນຕ້ອງລະບຸ ເລືອກພາຍຫຼັງໄດ້",
      dueDateLabel: "ຄົບກຳນົດຊຳລະ",
      dueDateAria: "ເລືອກວັນທີຄົບກຳນົດຊຳລະ",
      dueDateHelp: "ຖ້າຍັງບໍ່ຮູ້ກຳນົດຈິງ ສາມາດປ່ອຍວ່າງໄວ້ກ່ອນ",
      noteOptional: "ໝາຍເຫດ (ບໍ່ບັງຄັບ)",
      notePlaceholder: "ໝາຍເຫດເພີ່ມເຕີມ",
      summary: "ສະຫຼຸບ",
      pendingRateSummary:
        "ຍັງບໍ່ໄດ້ປິດເຣດຈິງ: ລະບົບຈະໃຊ້ເຣດຊົ່ວຄາວ 1 ເພື່ອບັນທຶກ PO ແລະໃຫ້ໄປປິດເຣດພາຍຫຼັງ",
      productsCount: "ສິນຄ້າ ({count} ລາຍການ)",
      shipping: "ຄ່າຂົນສົ່ງ",
      otherCosts: "ຄ່າອື່ນໆ",
      grandTotal: "ລວມທັງໝົດ",
      saveDraft: "ບັນທຶກຮ່າງ",
      receiveNow: "ຮັບສິນຄ້າທັນທີ",
      createFailed: "ສ້າງໃບສັ່ງຊື້ບໍ່ສຳເລັດ",
      createSuccess: "ສ້າງໃບສັ່ງຊື້ແລ້ວ",
      createAndReceivedSuccess: "ສ້າງໃບສັ່ງຊື້ແລະຮັບສິນຄ້າແລ້ວ",
      pendingRateToast: "PO ນີ້ຍັງຕ້ອງປິດເຣດຈິງໃນພາຍຫຼັງ",
      createAndConfirmSuccess: "ສ້າງໃບສັ່ງຊື້ແລະຢືນຢັນແລ້ວ",
      confirmOrder: "ຢືນຢັນການສັ່ງຊື້",
      closeConfirmBackdropAria: "ປິດກ່ອງຢືນຢັນການປິດແບບຟອມ",
      closeConfirmDialogAria: "ຢືນຢັນການປິດຟອມສ້າງໃບສັ່ງຊື້",
      closeConfirmTitle: "ຢືນຢັນປິດຟອມສ້າງໃບສັ່ງຊື້",
      closeConfirmBody: "ຍັງມີຂໍ້ມູນບໍ່ໄດ້ບັນທຶກ ຕ້ອງການປິດແລະຖິ້ມຂໍ້ມູນທີ່ກອກໄວ້ຫຼືບໍ່",
      closeConfirmBack: "ກັບໄປແກ້ໄຂ",
      closeConfirmDiscard: "ປິດແລະຖິ້ມຂໍ້ມູນ",
    },
    detail: {
      finalRateInvalid: "ກະລຸນາກອກອັດຕາແລກປ່ຽນຈິງໃຫ້ຖືກຕ້ອງ",
      finalizeRateFailed: "ປິດເຣດບໍ່ສຳເລັດ",
      finalizeRateSuccess: "ປິດເຣດຮຽບຮ້ອຍແລ້ວ",
      paymentAmountInvalid: "ກະລຸນາກອກຍອດຊຳລະໃຫ້ຖືກຕ້ອງ",
      paymentExceedsOutstanding: "ຍອດຊຳລະເກີນຍອດຄ້າງ",
      settleFailed: "ບັນທຶກການຊຳລະບໍ່ສຳເລັດ",
      settleSuccess: "ບັນທຶກການຊຳລະຮຽບຮ້ອຍ",
      shippingCostInvalid: "ກະລຸນາກອກຄ່າຂົນສົ່ງໃຫ້ຖືກຕ້ອງ",
      otherCostInvalid: "ກະລຸນາກອກຄ່າໃຊ້ຈ່າຍອື່ນໃຫ້ຖືກຕ້ອງ",
      updateCostsFailed: "ອັບເດດຄ່າໃຊ້ຈ່າຍບໍ່ສຳເລັດ",
      updateCostsSuccess: "ອັບເດດຄ່າໃຊ້ຈ່າຍຮຽບຮ້ອຍ",
      reversePaymentFailed: "ຍ້ອນລາຍການຊຳລະບໍ່ສຳເລັດ",
      reversePaymentSuccess: "ຍ້ອນລາຍການຊຳລະຮຽບຮ້ອຍ",
      editRequiresItem: "ຕ້ອງມີສິນຄ້າຢ່າງໜ້ອຍ 1 ລາຍການ",
      updatePoFailed: "ອັບເດດໃບສັ່ງຊື້ບໍ່ສຳເລັດ",
      updatePoSuccess: "ບັນທຶກການແກ້ໄຂໃບສັ່ງຊື້ຮຽບຮ້ອຍ",
      pdfDownloaded: "ດາວໂຫລດ PDF ຮຽບຮ້ອຍ",
      pdfGenerateFailed: "ສ້າງ PDF ບໍ່ສຳເລັດ",
      pdfShareFailed: "ແບ່ງປັນ PDF ບໍ່ສຳເລັດ",
      titleFallback: "ລາຍລະອຽດ",
      mustFinalizeRateBeforePayment: "ຕ້ອງປິດເຣດກ່ອນບັນທຶກການຊຳລະ",
      pdfDocTitle: "ໃບສັ່ງຊື້",
      referenceRate: "ເຣດອ້າງອີງ",
      initialRate: "ເຣດຕັ້ງຕົ້ນຕອນສ້າງ PO",
      rateStatusPending: "ສະຖານະ: ລໍຖ້າປິດເຣດຈິງ (ແນະນຳຕອນຊຳລະຈິງ)",
      rateStatusLocked: "ສະຖານະ: ປິດເຣດແລ້ວ",
      when: "ເມື່ອ",
      rateDifference: "ສ່ວນຕ່າງເຣດ",
      paymentStatus: "ສະຖານະການຊຳລະ",
      paid: "ຊຳລະແລ້ວ",
      partialPaid: "ຊຳລະບາງສ່ວນ",
      unpaid: "ຍັງບໍ່ຊຳລະ",
      paidAmount: "ຈ່າຍແລ້ວ",
      outstanding: "ຄ້າງ",
      paidAt: "ຊຳລະເມື່ອ",
      paymentRecorded: "ບັນທຶກການຊຳລະແລ້ວ",
      by: "ໂດຍ",
      reference: "ອ້າງອີງ",
      readyToSettle: "ພ້ອມບັນທຶກການຊຳລະເມື່ອຈ່າຍຈິງ",
      finalizeRateTitle: "ປິດເຣດແລກປ່ຽນຈິງ",
      finalRateLabel: "ອັດຕາແລກປ່ຽນຈິງ (1 {purchase} = ? {store})",
      finalRatePlaceholder: "ເຊັ່ນ 670",
      finalizeRateNoteLabel: "ໝາຍເຫດການປິດເຣດ (ບໍ່ບັງຄັບ)",
      finalizeRateNotePlaceholder: "ເຊັ່ນ ຊຳລະປາຍເດືອນ / ອ້າງອີງໃບແຈ້ງໜີ້",
      finalizeRateHelp:
        "ການປິດເຣດຈະອັບເດດມູນຄ່າຖານສຳລັບອ້າງອີງບັນຊີໃນ PO ນີ້ເທົ່ານັ້ນ ແລະບໍ່ຍ້ອນແກ້ເອກະສານທີ່ປິດແລ້ວ",
      confirmFinalizeRate: "ຢືນຢັນປິດເຣດ",
      settlePaymentTitle: "ບັນທຶກການຊຳລະ PO",
      paymentAmountLabel: "ຍອດຊຳລະ ({currency})",
      currentOutstanding: "ຍອດຄ້າງປັດຈຸບັນ",
      paymentDate: "ວັນທີຊຳລະ",
      paymentReferenceLabel: "ເລກອ້າງອີງການຊຳລະ (ບໍ່ບັງຄັບ)",
      paymentReferencePlaceholder: "ເຊັ່ນ statement ປາຍເດືອນ / ເລກໃບແຈ້ງໜີ້",
      optionalNote: "ໝາຍເຫດ (ບໍ່ບັງຄັບ)",
      confirmSettlePayment: "ຢືນຢັນບັນທຶກການຊຳລະ",
      updateCostsTitle: "ອັບເດດຄ່າຂົນສົ່ງ/ຄ່າອື່ນຫຼັງຮັບສິນຄ້າ",
      shippingCostLabel: "ຄ່າຂົນສົ່ງ ({currency})",
      otherCostLabel: "ຄ່າອື່ນໆ ({currency})",
      otherCostNoteLabel: "ໝາຍເຫດຄ່າອື່ນໆ (ບໍ່ບັງຄັບ)",
      otherCostNotePlaceholder: "ເຊັ່ນ ຄ່າຂົນສົ່ງປາຍເດືອນ / ຄ່າບໍລິການເພີ່ມ",
      newGrandTotal: "ຍອດລວມໃໝ່",
      newOutstanding: "ຍອດຄ້າງໃໝ່",
      updateCostsHelp:
        "ລະບົບຈະອັບເດດ AP/statement ທັນທີ ແຕ່ບໍ່ຍ້ອນປັບຕົ້ນທຶນສິນຄ້າ",
      confirmUpdate: "ຢືນຢັນອັບເດດ",
      paymentHistory: "ປະຫວັດການຊຳລະ",
      paymentEntry: "ຊຳລະ",
      reversalEntry: "ຍ້ອນລາຍການ",
      systemUser: "ລະບົບ",
      reverseEntry: "ຍ້ອນລາຍການ",
      reversed: "ຖືກຍ້ອນແລ້ວ",
      editPo: "ແກ້ໄຂໃບສັ່ງຊື້",
      exchangeRateHint:
        "ປ່ອຍວ່າງໄວ້ໄດ້ຖ້າຍັງບໍ່ຮູ້ເຣດຈິງ (ລະບົບຈະຕັ້ງເປັນລໍຖ້າປິດເຣດ)",
      itemLines: "ລາຍການສິນຄ້າ",
      expectedDateAria: "ເລືອກວັນທີຄາດຮັບໃນຟອມແກ້ໄຂ PO",
      dueDateAria: "ເລືອກວັນທີຄົບກຳນົດຊຳລະໃນຟອມແກ້ໄຂ PO",
      saveEdit: "ບັນທຶກການແກ້ໄຂ",
      created: "ສ້າງ",
      confirmedOrder: "ຢືນຢັນສັ່ງຊື້",
      shipped: "ຈັດສົ່ງ",
      received: "ຮັບສິນຄ້າແລ້ວ",
      expectedOn: "ຄາດວ່າ",
      dueOn: "ຄົບກຳນົດຊຳລະ",
      receivedQty: "ຮັບແລ້ວ",
      goods: "ສິນຄ້າ",
      confirmOrder: "ຢືນຢັນສັ່ງຊື້",
      supplierShipped: "ຜູ້ສະໜອງຈັດສົ່ງແລ້ວ",
      receiveGoods: "ຮັບສິນຄ້າ",
      emptyData: "ບໍ່ພົບຂໍ້ມູນ",
    },
  },
  th: {
    common: {
      savePresetPrompt: "ตั้งชื่อ preset นี้",
      presetSaved: "บันทึก preset แล้ว",
      retry: "ลองใหม่",
      cancel: "ยกเลิก",
      close: "ปิด",
      share: "แชร์",
      loadMore: "โหลดเพิ่ม",
      loading: "กำลังโหลด...",
      total: "รวม",
      note: "หมายเหตุ",
      supplier: "ซัพพลายเออร์",
      contact: "เบอร์ติดต่อ",
      currency: "สกุลเงิน",
      dueDate: "ครบกำหนดชำระ",
      expectedAt: "คาดว่าจะได้รับ",
      tracking: "Tracking",
      today: "วันนี้",
      plusSevenDays: "+7 วัน",
      endOfMonth: "สิ้นเดือน",
      clear: "ล้างค่า",
    },
    errors: {
      atLeastOneItem: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ",
      loadPoDetailFailed: "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ",
      poNotFound: "ไม่พบข้อมูลใบสั่งซื้อ",
      connectionRetry: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
      loadPoListFailed: "โหลดรายการใบสั่งซื้อไม่สำเร็จ",
      invalidPoList: "รูปแบบข้อมูลใบสั่งซื้อไม่ถูกต้อง",
      loadPendingRateFailed: "โหลดคิวรอปิดเรทไม่สำเร็จ",
    },
    pendingQueue: {
      emptyHint: "ลองกลับไป `PO Operations` เพื่อเช็กงานรับเข้าสินค้าหรือสร้าง PO เพิ่ม",
      goOperations: "ไป PO Operations",
      selectedCount: "เลือกแล้ว {selected}/{total} รายการ",
    },
    bulk: {
      selectAtLeastOne: "กรุณาเลือก PO อย่างน้อย 1 รายการ",
      sameCurrencyOnly: "ปิดเรทแบบกลุ่มได้เฉพาะ PO สกุลเงินเดียวกันต่อรอบ",
      exchangeRateRequired: "กรุณากรอกอัตราแลกเปลี่ยนจริงให้ถูกต้อง",
      referenceRequired: "กรุณากรอกเลขอ้างอิงรอบบัตร/รอบชำระ",
      statementTotalRequired: "กรุณากรอกยอดชำระรวมจาก statement ให้ถูกต้อง",
      starting: "เริ่มประมวลผล...",
      processing: "กำลังประมวลผล {current}/{total} ({poNumber})",
      paymentRoundNote: "รอบชำระ {reference}",
      autoMatchHint: "ระบบจะจับคู่ยอดชำระอัตโนมัติแบบครบกำหนดเก่าสุดก่อน (oldest due first)",
      exchangeRateLabel: "อัตราแลกเปลี่ยนจริง (1 {purchase} = ? {store})",
      paidAtLabel: "วันที่ชำระ (top-up date)",
      statementTotalLabel: "ยอดชำระรวมตาม statement (ไม่บังคับ)",
      statementTotalHelp: "ถ้าเว้นว่าง ระบบจะชำระเต็มยอดค้างทุก PO ที่เลือก",
      referenceLabel: "เลขอ้างอิงรอบบัตร/รอบชำระ (บังคับ)",
      referencePlaceholder: "เช่น BCEL-VISA-2026-02",
      noteLabel: "หมายเหตุ (ไม่บังคับ)",
      notePlaceholder: "เช่น top-up รอบปลายเดือน",
      reconcilePlanTitle: "แผนกระทบยอดอัตโนมัติ (ก่อนกดยืนยัน)",
      reconcilePlanSummary:
        "ยอดค้างที่เลือก {outstanding} · จะลงชำระ {planned} · ค้างหลังรอบนี้ {after}",
      statementTotalMustBePositive: "ยอดชำระรวมต้องมากกว่า 0",
      dueShort: "due",
      reconcileRowMatched: "จับคู่",
      reconcileRowOutstanding: "ค้าง",
      failedListTitle: "รายการที่ไม่สำเร็จ ({count})",
      startFinalizeAndSettle: "เริ่มปิดเรท + ชำระ",
      finalizeFailed: "{poNumber}: ปิดเรทไม่สำเร็จ ({message})",
      detailReloadFailed: "{poNumber}: โหลดยอดค้างหลังปิดเรทไม่สำเร็จ ({message})",
      settleFailed: "{poNumber}: บันทึกชำระไม่สำเร็จ ({message})",
      finalizeSuccess: "ปิดเรทสำเร็จ {count}/{total} รายการ",
      settleSuccess: "บันทึกชำระสำเร็จ {count}/{total} รายการ (รวม {amount})",
      unmatchedStatement: "ยังมียอด statement ที่ยังไม่ถูกจับคู่ {amount}",
      failedCount: "มีรายการไม่สำเร็จ {count} รายการ",
      processingConnectionFailed: "เชื่อมต่อไม่สำเร็จระหว่างประมวลผลแบบกลุ่ม",
      unknown: "unknown",
    },
    create: {
      title: "สร้างใบสั่งซื้อ",
      stepLabel: "ขั้นตอน",
      supplierNameOptional: "ชื่อซัพพลายเออร์ (ไม่บังคับ)",
      hideSuppliers: "ซ่อนรายการซัพพลายเออร์",
      allSuppliers: "ดูซัพพลายเออร์ทั้งหมด",
      supplierPlaceholder: "เช่น ร้านสมชาย, ตลาดเช้า",
      supplierSearchHint: "พิมพ์เพื่อค้นหาและแตะเลือกจากรายการเดิม หรือพิมพ์ชื่อใหม่เองได้",
      supplierSearchEmpty: "ไม่พบชื่อซัพพลายเออร์ที่ตรงกับคำค้นหา (ใช้ชื่อที่พิมพ์ได้เลย)",
      contactOptional: "เบอร์ติดต่อ (ไม่บังคับ)",
      purchaseCurrency: "สกุลเงินที่ซื้อ",
      actualExchangeRateOptional: "อัตราแลกเปลี่ยนจริง (ถ้าทราบ)",
      exchangeRatePlaceholder: "เช่น 600 (1 {purchase} = ? {store})",
      exchangeRateHelp:
        "ถ้ายังไม่ทราบเรทตอนนี้ สามารถเว้นว่างได้ แล้วไปปิดเรทหลังรับสินค้า/ตอนชำระจริง",
      next: "ถัดไป →",
      addProducts: "เพิ่มสินค้า",
      hideProducts: "ซ่อนรายการสินค้า",
      allProducts: "ดูสินค้าทั้งหมด",
      searchProductsPlaceholder: "🔍 ค้นหาสินค้า...",
      searchProductsHint: "ค้นหาด้วยชื่อหรือ SKU หรือกดปุ่มเพื่อเลือกจากรายการ",
      noMatchingProducts: "ไม่พบสินค้าที่ค้นหา",
      noProductsAvailable: "ไม่มีสินค้าให้เลือก",
      noProductsAdded: "ยังไม่ได้เพิ่มสินค้า",
      quantity: "จำนวน",
      costPerCurrency: "ราคา/{currency}",
      back: "← ย้อนกลับ",
      shippingCostLabel: "ค่าขนส่ง ({currency})",
      otherCostLabel: "ค่าอื่นๆ ({currency})",
      otherCostNoteLabel: "หมายเหตุค่าอื่นๆ",
      otherCostNotePlaceholder: "เช่น ค่าภาษี, ค่าดำเนินการ",
      expectedReceiveDateOptional: "คาดว่าจะได้รับ (ไม่บังคับ)",
      expectedReceiveAria: "เลือกวันที่คาดว่าจะได้รับ",
      expectedReceiveHelp: "ยังไม่ระบุได้ เลือกภายหลังได้",
      dueDateLabel: "ครบกำหนดชำระ (due date)",
      dueDateAria: "เลือกวันที่ครบกำหนดชำระ",
      dueDateHelp: "ถ้ายังไม่รู้กำหนดจริง ให้เว้นว่างไว้ก่อนได้",
      noteOptional: "หมายเหตุ (ไม่บังคับ)",
      notePlaceholder: "หมายเหตุเพิ่มเติม",
      summary: "สรุป",
      pendingRateSummary:
        "ยังไม่ปิดเรทจริง: ระบบจะใช้เรทชั่วคราว 1 เพื่อบันทึก PO และให้ไปปิดเรทภายหลัง",
      productsCount: "สินค้า ({count} รายการ)",
      shipping: "ค่าขนส่ง",
      otherCosts: "ค่าอื่นๆ",
      grandTotal: "รวมทั้งหมด",
      saveDraft: "บันทึกร่าง",
      receiveNow: "รับสินค้าทันที",
      createFailed: "สร้างใบสั่งซื้อไม่สำเร็จ",
      createSuccess: "สร้างใบสั่งซื้อเรียบร้อย",
      createAndReceivedSuccess: "สร้างใบสั่งซื้อ + รับสินค้าเรียบร้อย",
      pendingRateToast: "PO นี้อยู่สถานะรอปิดเรท สามารถปิดเรทจริงได้ภายหลัง",
      createAndConfirmSuccess: "สร้างใบสั่งซื้อ + ยืนยันสั่งแล้ว",
      confirmOrder: "ยืนยันสั่งซื้อ",
      closeConfirmBackdropAria: "ปิดกล่องยืนยันปิดฟอร์ม",
      closeConfirmDialogAria: "ยืนยันปิดฟอร์มสร้างใบสั่งซื้อ",
      closeConfirmTitle: "ยืนยันปิดฟอร์มสร้างใบสั่งซื้อ",
      closeConfirmBody: "มีข้อมูลที่ยังไม่บันทึก ต้องการปิดและทิ้งข้อมูลที่กรอกไว้หรือไม่",
      closeConfirmBack: "กลับไปแก้ไข",
      closeConfirmDiscard: "ปิดและทิ้งข้อมูล",
    },
    detail: {
      finalRateInvalid: "กรุณากรอกอัตราแลกเปลี่ยนจริงให้ถูกต้อง",
      finalizeRateFailed: "ปิดเรทไม่สำเร็จ",
      finalizeRateSuccess: "ปิดเรทเรียบร้อย",
      paymentAmountInvalid: "กรุณากรอกยอดชำระให้ถูกต้อง",
      paymentExceedsOutstanding: "ยอดชำระเกินยอดค้าง",
      settleFailed: "บันทึกชำระไม่สำเร็จ",
      settleSuccess: "บันทึกชำระเรียบร้อย",
      shippingCostInvalid: "กรุณากรอกค่าขนส่งให้ถูกต้อง",
      otherCostInvalid: "กรุณากรอกค่าอื่นๆ ให้ถูกต้อง",
      updateCostsFailed: "อัปเดตค่าขนส่ง/ค่าอื่นไม่สำเร็จ",
      updateCostsSuccess: "อัปเดตค่าขนส่ง/ค่าอื่นเรียบร้อย",
      reversePaymentFailed: "ย้อนรายการชำระไม่สำเร็จ",
      reversePaymentSuccess: "ย้อนรายการชำระเรียบร้อย",
      editRequiresItem: "ต้องมีอย่างน้อย 1 รายการสินค้า",
      updatePoFailed: "อัปเดต PO ไม่สำเร็จ",
      updatePoSuccess: "บันทึกการแก้ไข PO เรียบร้อย",
      pdfDownloaded: "ดาวน์โหลด PDF เรียบร้อย",
      pdfGenerateFailed: "สร้าง PDF ไม่สำเร็จ",
      pdfShareFailed: "แชร์ PDF ไม่สำเร็จ",
      titleFallback: "รายละเอียด",
      mustFinalizeRateBeforePayment: "ต้องปิดเรทก่อนบันทึกชำระ",
      pdfDocTitle: "ใบสั่งซื้อ",
      referenceRate: "เรทอ้างอิง",
      initialRate: "เรทตั้งต้นตอนสร้าง PO",
      rateStatusPending: "สถานะ: รอปิดเรทจริง (แนะนำปิดเรทตอนชำระจริงปลายงวด)",
      rateStatusLocked: "สถานะ: ปิดเรทแล้ว",
      when: "เมื่อ",
      rateDifference: "ส่วนต่างเรท",
      paymentStatus: "สถานะชำระ",
      paid: "ชำระแล้ว",
      partialPaid: "ชำระบางส่วน",
      unpaid: "ยังไม่ชำระ",
      paidAmount: "จ่ายแล้ว",
      outstanding: "ค้าง",
      paidAt: "ชำระเมื่อ",
      paymentRecorded: "บันทึกชำระแล้ว",
      by: "โดย",
      reference: "อ้างอิง",
      readyToSettle: "พร้อมบันทึกชำระเมื่อจ่ายจริง",
      finalizeRateTitle: "ปิดเรทแลกเปลี่ยนจริง",
      finalRateLabel: "อัตราแลกเปลี่ยนจริง (1 {purchase} = ? {store})",
      finalRatePlaceholder: "เช่น 670",
      finalizeRateNoteLabel: "หมายเหตุการปิดเรท (ไม่บังคับ)",
      finalizeRateNotePlaceholder: "เช่น ชำระปลายเดือน/อ้างอิงใบแจ้งหนี้",
      finalizeRateHelp:
        "หมายเหตุ: การปิดเรทจะอัปเดตราคาฐานใน PO นี้สำหรับการอ้างอิงบัญชี ไม่ย้อนแก้เอกสารที่ปิดไปแล้ว",
      confirmFinalizeRate: "ยืนยันปิดเรท",
      settlePaymentTitle: "บันทึกชำระ PO",
      paymentAmountLabel: "ยอดชำระ ({currency})",
      currentOutstanding: "ยอดค้างปัจจุบัน",
      paymentDate: "วันที่ชำระ",
      paymentReferenceLabel: "เลขอ้างอิงชำระ (ไม่บังคับ)",
      paymentReferencePlaceholder: "เช่น Statement ปลายเดือน / เลขใบแจ้งหนี้",
      optionalNote: "หมายเหตุ (ไม่บังคับ)",
      confirmSettlePayment: "ยืนยันบันทึกชำระ",
      updateCostsTitle: "อัปเดตค่าขนส่ง/ค่าอื่นหลังรับสินค้า",
      shippingCostLabel: "ค่าขนส่ง ({currency})",
      otherCostLabel: "ค่าอื่นๆ ({currency})",
      otherCostNoteLabel: "หมายเหตุค่าอื่นๆ (ไม่บังคับ)",
      otherCostNotePlaceholder: "เช่น ค่าขนส่งปลายเดือน / ค่าบริการเพิ่มเติม",
      newGrandTotal: "ยอดรวมใหม่",
      newOutstanding: "คงค้างใหม่",
      updateCostsHelp:
        "หมายเหตุ: อัปเดตยอด AP/statement ทันที แต่ไม่ปรับต้นทุนสินค้าแบบย้อนย้อนหลัง",
      confirmUpdate: "ยืนยันอัปเดต",
      paymentHistory: "ประวัติการชำระ",
      paymentEntry: "ชำระ",
      reversalEntry: "ย้อนรายการ",
      systemUser: "โดยระบบ",
      reverseEntry: "ย้อนรายการ",
      reversed: "ถูกย้อนแล้ว",
      editPo: "แก้ไข PO",
      exchangeRateHint: "เว้นว่างได้ถ้ายังไม่ทราบเรทจริง (ระบบจะตั้งเป็นรอปิดเรท)",
      itemLines: "รายการสินค้า",
      expectedDateAria: "เลือกวันที่คาดรับในฟอร์มแก้ไข PO",
      dueDateAria: "เลือกวันที่ครบกำหนดชำระในฟอร์มแก้ไข PO",
      saveEdit: "บันทึกการแก้ไข",
      created: "สร้าง",
      confirmedOrder: "ยืนยันสั่งซื้อ",
      shipped: "จัดส่ง",
      received: "รับสินค้าแล้ว",
      expectedOn: "คาดว่า",
      dueOn: "ครบกำหนดชำระ",
      receivedQty: "ได้รับ",
      goods: "สินค้า",
      confirmOrder: "ยืนยันสั่งซื้อ",
      supplierShipped: "ซัพพลายเออร์ส่งแล้ว",
      receiveGoods: "รับสินค้า",
      emptyData: "ไม่พบข้อมูล",
    },
  },
  en: {
    common: {
      savePresetPrompt: "Name this preset",
      presetSaved: "Preset saved",
      retry: "Retry",
      cancel: "Cancel",
      close: "Close",
      share: "Share",
      loadMore: "Load more",
      loading: "Loading...",
      total: "Total",
      note: "Note",
      supplier: "Supplier",
      contact: "Contact",
      currency: "Currency",
      dueDate: "Due date",
      expectedAt: "Expected on",
      tracking: "Tracking",
      today: "Today",
      plusSevenDays: "+7 days",
      endOfMonth: "Month end",
      clear: "Clear",
    },
    errors: {
      atLeastOneItem: "Please add at least one product",
      loadPoDetailFailed: "Unable to load purchase order details",
      poNotFound: "Purchase order not found",
      connectionRetry: "Unable to connect. Please try again.",
      loadPoListFailed: "Unable to load purchase orders",
      invalidPoList: "Invalid purchase order payload",
      loadPendingRateFailed: "Unable to load the pending-rate queue",
    },
    pendingQueue: {
      emptyHint: "Try going back to `PO Operations` to check receiving work or create a new PO.",
      goOperations: "Go to PO Operations",
      selectedCount: "Selected {selected}/{total} items",
    },
    bulk: {
      selectAtLeastOne: "Please select at least one PO",
      sameCurrencyOnly: "Bulk rate finalization only supports one purchase currency per run",
      exchangeRateRequired: "Please enter a valid finalized exchange rate",
      referenceRequired: "Please enter the card-cycle/payment reference",
      statementTotalRequired: "Please enter a valid statement total",
      starting: "Starting bulk processing...",
      processing: "Processing {current}/{total} ({poNumber})",
      paymentRoundNote: "Payment cycle {reference}",
      autoMatchHint: "Auto matching uses oldest due first.",
      exchangeRateLabel: "Final exchange rate (1 {purchase} = ? {store})",
      paidAtLabel: "Paid date (top-up date)",
      statementTotalLabel: "Statement total (optional)",
      statementTotalHelp: "If empty, the system settles the full outstanding amount for all selected POs.",
      referenceLabel: "Card-cycle/payment reference (required)",
      referencePlaceholder: "e.g. BCEL-VISA-2026-02",
      noteLabel: "Note (optional)",
      notePlaceholder: "e.g. month-end top-up",
      reconcilePlanTitle: "Auto reconciliation plan (before confirming)",
      reconcilePlanSummary:
        "Selected outstanding {outstanding} · will settle {planned} · remaining after this cycle {after}",
      statementTotalMustBePositive: "Statement total must be greater than 0",
      dueShort: "due",
      reconcileRowMatched: "Matched",
      reconcileRowOutstanding: "Outstanding",
      failedListTitle: "Failed items ({count})",
      startFinalizeAndSettle: "Start finalize + settle",
      finalizeFailed: "{poNumber}: finalize rate failed ({message})",
      detailReloadFailed: "{poNumber}: failed to reload outstanding balance ({message})",
      settleFailed: "{poNumber}: payment recording failed ({message})",
      finalizeSuccess: "Finalized rates for {count}/{total} POs",
      settleSuccess: "Recorded payments for {count}/{total} POs (total {amount})",
      unmatchedStatement: "Unmatched statement amount remaining {amount}",
      failedCount: "{count} items failed",
      processingConnectionFailed: "Connection failed during bulk processing",
      unknown: "unknown",
    },
    create: {
      title: "Create purchase order",
      stepLabel: "Step",
      supplierNameOptional: "Supplier name (optional)",
      hideSuppliers: "Hide suppliers",
      allSuppliers: "All suppliers",
      supplierPlaceholder: "e.g. Somchai Supply, Morning Market",
      supplierSearchHint: "Type to search and pick from existing suppliers, or enter a new name.",
      supplierSearchEmpty:
        "No supplier matches this search. You can use the typed name.",
      contactOptional: "Contact number (optional)",
      purchaseCurrency: "Purchase currency",
      actualExchangeRateOptional: "Actual exchange rate (if known)",
      exchangeRatePlaceholder: "e.g. 600 (1 {purchase} = ? {store})",
      exchangeRateHelp:
        "Leave this blank if the final rate is not known yet. You can finalize it after receiving goods or at payment time.",
      next: "Next →",
      addProducts: "Add products",
      hideProducts: "Hide products",
      allProducts: "All products",
      searchProductsPlaceholder: "Search products...",
      searchProductsHint: "Search by name or SKU, or open the full product list.",
      noMatchingProducts: "No matching products",
      noProductsAvailable: "No products available",
      noProductsAdded: "No products added yet",
      quantity: "Quantity",
      costPerCurrency: "Cost / {currency}",
      back: "← Back",
      shippingCostLabel: "Shipping ({currency})",
      otherCostLabel: "Other costs ({currency})",
      otherCostNoteLabel: "Other cost note",
      otherCostNotePlaceholder: "e.g. tax, handling fee",
      expectedReceiveDateOptional: "Expected receive date (optional)",
      expectedReceiveAria: "Select expected receive date",
      expectedReceiveHelp: "You can leave this blank and set it later.",
      dueDateLabel: "Due date",
      dueDateAria: "Select due date",
      dueDateHelp: "Leave blank if the actual due date is not known yet.",
      noteOptional: "Note (optional)",
      notePlaceholder: "Additional note",
      summary: "Summary",
      pendingRateSummary:
        "Final exchange rate is still pending: the system will temporarily use rate 1 and let you finalize it later.",
      productsCount: "Products ({count})",
      shipping: "Shipping",
      otherCosts: "Other costs",
      grandTotal: "Grand total",
      saveDraft: "Save draft",
      receiveNow: "Receive now",
      createFailed: "Failed to create purchase order",
      createSuccess: "Purchase order created",
      createAndReceivedSuccess: "Purchase order created and received",
      pendingRateToast: "This PO still needs final exchange rate confirmation later",
      createAndConfirmSuccess: "Purchase order created and confirmed",
      confirmOrder: "Confirm order",
      closeConfirmBackdropAria: "Close create form confirmation dialog",
      closeConfirmDialogAria: "Confirm closing purchase order creation form",
      closeConfirmTitle: "Confirm closing the create purchase order form",
      closeConfirmBody:
        "There is unsaved information. Do you want to close the form and discard the entered data?",
      closeConfirmBack: "Back to edit",
      closeConfirmDiscard: "Discard and close",
    },
    detail: {
      finalRateInvalid: "Please enter a valid final exchange rate",
      finalizeRateFailed: "Failed to finalize exchange rate",
      finalizeRateSuccess: "Exchange rate finalized",
      paymentAmountInvalid: "Please enter a valid payment amount",
      paymentExceedsOutstanding: "Payment amount exceeds outstanding balance",
      settleFailed: "Failed to record payment",
      settleSuccess: "Payment recorded",
      shippingCostInvalid: "Please enter a valid shipping cost",
      otherCostInvalid: "Please enter a valid additional cost",
      updateCostsFailed: "Failed to update extra costs",
      updateCostsSuccess: "Extra costs updated",
      reversePaymentFailed: "Failed to reverse payment entry",
      reversePaymentSuccess: "Payment entry reversed",
      editRequiresItem: "At least one line item is required",
      updatePoFailed: "Failed to update purchase order",
      updatePoSuccess: "Purchase order updated",
      pdfDownloaded: "PDF downloaded",
      pdfGenerateFailed: "Failed to generate PDF",
      pdfShareFailed: "Failed to share PDF",
      titleFallback: "Detail",
      mustFinalizeRateBeforePayment: "Finalize the exchange rate before recording payment",
      pdfDocTitle: "Purchase order",
      referenceRate: "Reference rate",
      initialRate: "Initial rate at PO creation",
      rateStatusPending: "Status: waiting for final exchange rate (recommended at actual settlement)",
      rateStatusLocked: "Status: finalized",
      when: "on",
      rateDifference: "rate diff",
      paymentStatus: "Payment status",
      paid: "Paid",
      partialPaid: "Partially paid",
      unpaid: "Unpaid",
      paidAmount: "Paid",
      outstanding: "Outstanding",
      paidAt: "Paid on",
      paymentRecorded: "Payment recorded",
      by: "by",
      reference: "ref",
      readyToSettle: "Ready to record payment when settlement happens",
      finalizeRateTitle: "Finalize exchange rate",
      finalRateLabel: "Final exchange rate (1 {purchase} = ? {store})",
      finalRatePlaceholder: "e.g. 670",
      finalizeRateNoteLabel: "Finalize rate note (optional)",
      finalizeRateNotePlaceholder: "e.g. month-end settlement / invoice ref",
      finalizeRateHelp:
        "Finalizing the rate updates the base values for accounting reference on this PO only and does not retroactively change closed documents.",
      confirmFinalizeRate: "Confirm finalize rate",
      settlePaymentTitle: "Record PO payment",
      paymentAmountLabel: "Payment amount ({currency})",
      currentOutstanding: "Current outstanding",
      paymentDate: "Payment date",
      paymentReferenceLabel: "Payment reference (optional)",
      paymentReferencePlaceholder: "e.g. month-end statement / invoice number",
      optionalNote: "Note (optional)",
      confirmSettlePayment: "Confirm payment",
      updateCostsTitle: "Update shipping and extra costs after receiving",
      shippingCostLabel: "Shipping cost ({currency})",
      otherCostLabel: "Other cost ({currency})",
      otherCostNoteLabel: "Other cost note (optional)",
      otherCostNotePlaceholder: "e.g. month-end freight / extra service fee",
      newGrandTotal: "New grand total",
      newOutstanding: "New outstanding",
      updateCostsHelp:
        "This updates AP and statement balances immediately, but does not retroactively change product costs.",
      confirmUpdate: "Confirm update",
      paymentHistory: "Payment history",
      paymentEntry: "Payment",
      reversalEntry: "Reversal",
      systemUser: "system",
      reverseEntry: "Reverse entry",
      reversed: "Reversed",
      editPo: "Edit purchase order",
      exchangeRateHint:
        "Leave blank if the final exchange rate is not known yet. The PO will remain pending final rate.",
      itemLines: "Line items",
      expectedDateAria: "Select expected receive date in edit form",
      dueDateAria: "Select due date in edit form",
      saveEdit: "Save changes",
      created: "Created",
      confirmedOrder: "Confirmed",
      shipped: "Shipped",
      received: "Received",
      expectedOn: "Expected on",
      dueOn: "Due on",
      receivedQty: "received",
      goods: "Goods",
      confirmOrder: "Confirm order",
      supplierShipped: "Supplier shipped",
      receiveGoods: "Receive goods",
      emptyData: "No data found",
    },
  },
} satisfies Record<
  AppLanguage,
  {
    common: {
      savePresetPrompt: string;
      presetSaved: string;
      retry: string;
      cancel: string;
      close: string;
      share: string;
      loadMore: string;
      loading: string;
      total: string;
      note: string;
      supplier: string;
      contact: string;
      currency: string;
      dueDate: string;
      expectedAt: string;
      tracking: string;
      today: string;
      plusSevenDays: string;
      endOfMonth: string;
      clear: string;
    };
    errors: {
      atLeastOneItem: string;
      loadPoDetailFailed: string;
      poNotFound: string;
      connectionRetry: string;
      loadPoListFailed: string;
      invalidPoList: string;
      loadPendingRateFailed: string;
    };
    pendingQueue: {
      emptyHint: string;
      goOperations: string;
      selectedCount: string;
    };
    bulk: {
      selectAtLeastOne: string;
      sameCurrencyOnly: string;
      exchangeRateRequired: string;
      referenceRequired: string;
      statementTotalRequired: string;
      starting: string;
      processing: string;
      paymentRoundNote: string;
      autoMatchHint: string;
      exchangeRateLabel: string;
      paidAtLabel: string;
      statementTotalLabel: string;
      statementTotalHelp: string;
      referenceLabel: string;
      referencePlaceholder: string;
      noteLabel: string;
      notePlaceholder: string;
      reconcilePlanTitle: string;
      reconcilePlanSummary: string;
      statementTotalMustBePositive: string;
      dueShort: string;
      reconcileRowMatched: string;
      reconcileRowOutstanding: string;
      failedListTitle: string;
      startFinalizeAndSettle: string;
      finalizeFailed: string;
      detailReloadFailed: string;
      settleFailed: string;
      finalizeSuccess: string;
      settleSuccess: string;
      unmatchedStatement: string;
      failedCount: string;
      processingConnectionFailed: string;
      unknown: string;
    };
    create: {
      title: string;
      stepLabel: string;
      supplierNameOptional: string;
      hideSuppliers: string;
      allSuppliers: string;
      supplierPlaceholder: string;
      supplierSearchHint: string;
      supplierSearchEmpty: string;
      contactOptional: string;
      purchaseCurrency: string;
      actualExchangeRateOptional: string;
      exchangeRatePlaceholder: string;
      exchangeRateHelp: string;
      next: string;
      addProducts: string;
      hideProducts: string;
      allProducts: string;
      searchProductsPlaceholder: string;
      searchProductsHint: string;
      noMatchingProducts: string;
      noProductsAvailable: string;
      noProductsAdded: string;
      quantity: string;
      costPerCurrency: string;
      back: string;
      shippingCostLabel: string;
      otherCostLabel: string;
      otherCostNoteLabel: string;
      otherCostNotePlaceholder: string;
      expectedReceiveDateOptional: string;
      expectedReceiveAria: string;
      expectedReceiveHelp: string;
      dueDateLabel: string;
      dueDateAria: string;
      dueDateHelp: string;
      noteOptional: string;
      notePlaceholder: string;
      summary: string;
      pendingRateSummary: string;
      productsCount: string;
      shipping: string;
      otherCosts: string;
      grandTotal: string;
      saveDraft: string;
      receiveNow: string;
      createFailed: string;
      createSuccess: string;
      createAndReceivedSuccess: string;
      pendingRateToast: string;
      createAndConfirmSuccess: string;
      confirmOrder: string;
      closeConfirmBackdropAria: string;
      closeConfirmDialogAria: string;
      closeConfirmTitle: string;
      closeConfirmBody: string;
      closeConfirmBack: string;
      closeConfirmDiscard: string;
    };
    detail: {
      finalRateInvalid: string;
      finalizeRateFailed: string;
      finalizeRateSuccess: string;
      paymentAmountInvalid: string;
      paymentExceedsOutstanding: string;
      settleFailed: string;
      settleSuccess: string;
      shippingCostInvalid: string;
      otherCostInvalid: string;
      updateCostsFailed: string;
      updateCostsSuccess: string;
      reversePaymentFailed: string;
      reversePaymentSuccess: string;
      editRequiresItem: string;
      updatePoFailed: string;
      updatePoSuccess: string;
      pdfDownloaded: string;
      pdfGenerateFailed: string;
      pdfShareFailed: string;
      titleFallback: string;
      mustFinalizeRateBeforePayment: string;
      pdfDocTitle: string;
      referenceRate: string;
      initialRate: string;
      rateStatusPending: string;
      rateStatusLocked: string;
      when: string;
      rateDifference: string;
      paymentStatus: string;
      paid: string;
      partialPaid: string;
      unpaid: string;
      paidAmount: string;
      outstanding: string;
      paidAt: string;
      paymentRecorded: string;
      by: string;
      reference: string;
      readyToSettle: string;
      finalizeRateTitle: string;
      finalRateLabel: string;
      finalRatePlaceholder: string;
      finalizeRateNoteLabel: string;
      finalizeRateNotePlaceholder: string;
      finalizeRateHelp: string;
      confirmFinalizeRate: string;
      settlePaymentTitle: string;
      paymentAmountLabel: string;
      currentOutstanding: string;
      paymentDate: string;
      paymentReferenceLabel: string;
      paymentReferencePlaceholder: string;
      optionalNote: string;
      confirmSettlePayment: string;
      updateCostsTitle: string;
      shippingCostLabel: string;
      otherCostLabel: string;
      otherCostNoteLabel: string;
      otherCostNotePlaceholder: string;
      newGrandTotal: string;
      newOutstanding: string;
      updateCostsHelp: string;
      confirmUpdate: string;
      paymentHistory: string;
      paymentEntry: string;
      reversalEntry: string;
      systemUser: string;
      reverseEntry: string;
      reversed: string;
      editPo: string;
      exchangeRateHint: string;
      itemLines: string;
      expectedDateAria: string;
      dueDateAria: string;
      saveEdit: string;
      created: string;
      confirmedOrder: string;
      shipped: string;
      received: string;
      expectedOn: string;
      dueOn: string;
      receivedQty: string;
      goods: string;
      confirmOrder: string;
      supplierShipped: string;
      receiveGoods: string;
      emptyData: string;
    };
  }
>;

const purchaseWorkspaceTextByLanguage = {
  lo: {
    kpiOpenPo: "Open PO",
    kpiPendingRate: "Pending Rate",
    kpiOverdueAp: "Overdue AP",
    kpiOutstanding: "Outstanding",
    appliedFilter: "ຕົວກອງທີ່ໃຊ້:",
    savePreset: "ບັນທຶກ preset",
    clearQuickFilter: "ລ້າງຕົວກອງດ່ວນ",
    removePreset: "ລຶບ preset {label}",
    workspaceTitle: "ໂໝດການເຮັດວຽກ",
    operationsLabel: "ວຽກ PO",
    operationsDesc: "ສ້າງ/ຕິດຕາມສະຖານະ PO",
    monthEndLabel: "ປິດງວດປາຍເດືອນ",
    monthEndDesc: "ປິດເຣດແລະຊຳລະປາຍເດືອນ",
    supplierApLabel: "AP ຕາມຊັບພລາຍເອີ",
    supplierApDesc: "statement/filter/export",
  },
  th: {
    kpiOpenPo: "Open PO",
    kpiPendingRate: "Pending Rate",
    kpiOverdueAp: "Overdue AP",
    kpiOutstanding: "Outstanding",
    appliedFilter: "ตัวกรองที่ใช้:",
    savePreset: "บันทึก preset นี้",
    clearQuickFilter: "ล้างตัวกรองด่วน",
    removePreset: "ลบ preset {label}",
    workspaceTitle: "โหมดการทำงาน",
    operationsLabel: "PO Operations",
    operationsDesc: "สร้าง/ติดตามสถานะ PO",
    monthEndLabel: "Month-End Close",
    monthEndDesc: "ปิดเรทและชำระปลายเดือน",
    supplierApLabel: "AP by Supplier",
    supplierApDesc: "statement/filter/export",
  },
  en: {
    kpiOpenPo: "Open PO",
    kpiPendingRate: "Pending Rate",
    kpiOverdueAp: "Overdue AP",
    kpiOutstanding: "Outstanding",
    appliedFilter: "Applied filter:",
    savePreset: "Save preset",
    clearQuickFilter: "Clear quick filter",
    removePreset: "Remove preset {label}",
    workspaceTitle: "Workspace",
    operationsLabel: "PO Operations",
    operationsDesc: "Create and track POs",
    monthEndLabel: "Month-End Close",
    monthEndDesc: "Finalize rate and settle",
    supplierApLabel: "AP by Supplier",
    supplierApDesc: "statement/filter/export",
  },
} satisfies Record<
  AppLanguage,
  {
    kpiOpenPo: string;
    kpiPendingRate: string;
    kpiOverdueAp: string;
    kpiOutstanding: string;
    appliedFilter: string;
    savePreset: string;
    clearQuickFilter: string;
    removePreset: string;
    workspaceTitle: string;
    operationsLabel: string;
    operationsDesc: string;
    monthEndLabel: string;
    monthEndDesc: string;
    supplierApLabel: string;
    supplierApDesc: string;
  }
>;

const purchaseMonthEndTextByLanguage = {
  lo: {
    queueTitle: "ຄິວ PO ລໍຖ້າປິດເຣດ",
    recordsCount: "{count} ລາຍການ",
    exportCsv: "ສົ່ງອອກ CSV",
    filterSupplierPlaceholder: "ກອງຕາມຊັບພລາຍເອີ",
    receivedFrom: "ຮັບຕັ້ງແຕ່",
    receivedTo: "ຮັບເຖິງ",
    receivedFromAria: "ເລືອກວັນທີຮັບເລີ່ມຕົ້ນ",
    receivedToAria: "ເລືອກວັນທີຮັບສິ້ນສຸດ",
    loadingQueue: "ກຳລັງໂຫຼດຄິວລໍຖ້າປິດເຣດ...",
    emptyQueue: "ບໍ່ມີ PO ທີ່ລໍຖ້າປິດເຣດຕາມເງື່ອນໄຂ",
    selectAll: "ເລືອກທັງໝົດ",
    clearSelection: "ລ້າງທີ່ເລືອກ",
    finalizeAndSettle: "ປິດເຣດ + ຊຳລະປາຍເດືອນ",
    mixedCurrencies:
      "ລາຍການທີ່ເລືອກມີຫຼາຍສະກຸນເງິນ ກະລຸນາເລືອກທີລະສະກຸນເພື່ອປິດເຣດແບບກຸ່ມ",
    bulkTitle: "ປິດເຣດ + ບັນທຶກຊຳລະແບບກຸ່ມ (ຮອບປາຍເດືອນ)",
    rowReceivedAt: "ຮັບເມື່ອ {date}",
    rowNoReceivedAt: "ຍັງບໍ່ມີວັນທີຮັບ",
    rowInitialRate: "ເຣດຕັ້ງຕົ້ນ {rate} {store}/{purchase}",
    rowDueDate: "ຄົບກຳນົດ {date}",
    rowOutstanding: "ຄ້າງ {amount}",
  },
  th: {
    queueTitle: "คิว PO รอปิดเรท",
    recordsCount: "{count} รายการ",
    exportCsv: "Export CSV",
    filterSupplierPlaceholder: "กรองซัพพลายเออร์",
    receivedFrom: "วันที่รับตั้งแต่",
    receivedTo: "วันที่รับถึง",
    receivedFromAria: "เลือกวันที่รับตั้งแต่ในคิว PO รอปิดเรท",
    receivedToAria: "เลือกวันที่รับถึงในคิว PO รอปิดเรท",
    loadingQueue: "กำลังโหลดคิวรอปิดเรท...",
    emptyQueue: "ไม่มี PO ที่รอปิดเรทตามเงื่อนไข",
    selectAll: "เลือกทั้งหมด",
    clearSelection: "ล้างเลือก",
    finalizeAndSettle: "ปิดเรท + ชำระปลายเดือน",
    mixedCurrencies: "รายการที่เลือกมีหลายสกุลเงิน กรุณาเลือกทีละสกุลเพื่อปิดเรทแบบกลุ่ม",
    bulkTitle: "ปิดเรท + บันทึกชำระแบบกลุ่ม (รอบบัตรปลายเดือน)",
    rowReceivedAt: "รับเมื่อ {date}",
    rowNoReceivedAt: "ยังไม่มีวันที่รับ",
    rowInitialRate: "เรทตั้งต้น {rate} {store}/{purchase}",
    rowDueDate: "ครบกำหนด {date}",
    rowOutstanding: "ค้าง {amount}",
  },
  en: {
    queueTitle: "Pending rate-finalization queue",
    recordsCount: "{count} items",
    exportCsv: "Export CSV",
    filterSupplierPlaceholder: "Filter supplier",
    receivedFrom: "Received from",
    receivedTo: "Received to",
    receivedFromAria: "Choose received-from date",
    receivedToAria: "Choose received-to date",
    loadingQueue: "Loading pending rate-finalization queue...",
    emptyQueue: "No purchase orders are waiting for rate finalization",
    selectAll: "Select all",
    clearSelection: "Clear",
    finalizeAndSettle: "Finalize rate + settle month-end",
    mixedCurrencies: "Selected items contain multiple currencies. Please finalize one currency at a time.",
    bulkTitle: "Bulk finalize rate + settle (month-end cycle)",
    rowReceivedAt: "Received {date}",
    rowNoReceivedAt: "No received date",
    rowInitialRate: "Initial rate {rate} {store}/{purchase}",
    rowDueDate: "Due {date}",
    rowOutstanding: "Outstanding {amount}",
  },
} satisfies Record<
  AppLanguage,
  {
    queueTitle: string;
    recordsCount: string;
    exportCsv: string;
    filterSupplierPlaceholder: string;
    receivedFrom: string;
    receivedTo: string;
    receivedFromAria: string;
    receivedToAria: string;
    loadingQueue: string;
    emptyQueue: string;
    selectAll: string;
    clearSelection: string;
    finalizeAndSettle: string;
    mixedCurrencies: string;
    bulkTitle: string;
    rowReceivedAt: string;
    rowNoReceivedAt: string;
    rowInitialRate: string;
    rowDueDate: string;
    rowOutstanding: string;
  }
>;

const purchaseOperationsTextByLanguage = {
  lo: {
    filterAll: "ທັງໝົດ",
    filterOpen: "ເປີດຢູ່",
    filterShipped: "ຈັດສົ່ງ",
    pendingRateFinalization: "ລໍຖ້າປິດເຣດ",
    itemCount: "{count} ລາຍການ",
    outstanding: "ຄ້າງ {amount}",
    createdAt: "ສ້າງເມື່ອ {date}",
    orderedAt: "ຢືນຢັນເມື່ອ {date}",
    shippedAt: "ຈັດສົ່ງເມື່ອ {date}",
    expectedAt: "ຄາດວ່າ {date}",
    receivedAt: "ຮັບເມື່ອ {date}",
    cancelledAt: "ຍົກເລີກເມື່ອ {date}",
    cancelled: "ຍົກເລີກ",
    progress: "ຄວາມຄືບໜ້າ",
    overdue: "ເກີນກຳນົດ",
    daysLeft: "ເຫຼືອ {days} ມື້",
  },
  th: {
    filterAll: "ทั้งหมด",
    filterOpen: "งานเปิด",
    filterShipped: "จัดส่ง",
    pendingRateFinalization: "รอปิดเรท",
    itemCount: "{count} รายการ",
    outstanding: "ค้าง {amount}",
    createdAt: "สั่งเมื่อ {date}",
    orderedAt: "ยืนยันเมื่อ {date}",
    shippedAt: "จัดส่งเมื่อ {date}",
    expectedAt: "คาดว่า {date}",
    receivedAt: "รับเมื่อ {date}",
    cancelledAt: "ยกเลิกเมื่อ {date}",
    cancelled: "ยกเลิก",
    progress: "ความคืบหน้า",
    overdue: "เลยกำหนด",
    daysLeft: "เหลือ {days} วัน",
  },
  en: {
    filterAll: "All",
    filterOpen: "Open",
    filterShipped: "Shipping",
    pendingRateFinalization: "Pending rate finalization",
    itemCount: "{count} items",
    outstanding: "Outstanding {amount}",
    createdAt: "Created {date}",
    orderedAt: "Ordered {date}",
    shippedAt: "Shipped {date}",
    expectedAt: "Expected {date}",
    receivedAt: "Received {date}",
    cancelledAt: "Cancelled {date}",
    cancelled: "Cancelled",
    progress: "Progress",
    overdue: "Overdue",
    daysLeft: "{days} days left",
  },
} satisfies Record<
  AppLanguage,
  {
    filterAll: string;
    filterOpen: string;
    filterShipped: string;
    pendingRateFinalization: string;
    itemCount: string;
    outstanding: string;
    createdAt: string;
    orderedAt: string;
    shippedAt: string;
    expectedAt: string;
    receivedAt: string;
    cancelledAt: string;
    cancelled: string;
    progress: string;
    overdue: string;
    daysLeft: string;
  }
>;

const purchaseStatusMutationTextByLanguage = {
  lo: {
    failed: "ອັບເດດສະຖານະບໍ່ສຳເລັດ",
    success: "ອັບເດດສະຖານະເປັນ \"{status}\" ແລ້ວ",
  },
  th: {
    failed: "อัปเดตสถานะไม่สำเร็จ",
    success: "อัปเดตสถานะเป็น \"{status}\" เรียบร้อย",
  },
  en: {
    failed: "Failed to update status",
    success: "Status updated to \"{status}\"",
  },
} satisfies Record<
  AppLanguage,
  {
    failed: string;
    success: string;
  }
>;

function getPurchaseStatusLabel(
  language: AppLanguage,
  status: PurchaseOrderListItem["status"],
): string {
  const labels: Record<AppLanguage, Record<PurchaseOrderListItem["status"], string>> = {
    lo: {
      DRAFT: "ຮ່າງ",
      ORDERED: "ສັ່ງແລ້ວ",
      SHIPPED: "ກຳລັງຂົນສົ່ງ",
      RECEIVED: "ຮັບແລ້ວ",
      CANCELLED: "ຍົກເລີກ",
    },
    th: {
      DRAFT: "ร่าง",
      ORDERED: "สั่งแล้ว",
      SHIPPED: "กำลังจัดส่ง",
      RECEIVED: "รับแล้ว",
      CANCELLED: "ยกเลิก",
    },
    en: {
      DRAFT: "Draft",
      ORDERED: "Ordered",
      SHIPPED: "Shipped",
      RECEIVED: "Received",
      CANCELLED: "Cancelled",
    },
  };
  return labels[language][status];
}

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

function sortPendingQueueForSettlement(
  items: PendingRateQueueItem[],
): PendingRateQueueItem[] {
  return [...items].sort((a, b) => {
    const dueDiff = sortableDateValue(a.dueDate) - sortableDateValue(b.dueDate);
    if (dueDiff !== 0) return dueDiff;
    const receivedDiff =
      sortableDateValue(a.receivedAt) - sortableDateValue(b.receivedAt);
    if (receivedDiff !== 0) return receivedDiff;
    return a.poNumber.localeCompare(b.poNumber);
  });
}

export function PurchaseOrderList({
  language,
  purchaseOrders: initialList,
  activeStoreId,
  userId,
  storeCurrency,
  canCreate,
  pageSize,
  initialHasMore,
  storeLogoUrl,
  pdfConfig,
}: PurchaseOrderListProps) {
  const t = useMemo(() => createTranslator(language), [language]);
  const ui = useMemo(() => purchaseTextByLanguage[language], [language]);
  const workspaceUi = useMemo(
    () => purchaseWorkspaceTextByLanguage[language],
    [language],
  );
  const monthEndUi = useMemo(
    () => purchaseMonthEndTextByLanguage[language],
    [language],
  );
  const operationsUi = useMemo(
    () => purchaseOperationsTextByLanguage[language],
    [language],
  );
  const statusMutationUi = useMemo(
    () => purchaseStatusMutationTextByLanguage[language],
    [language],
  );
  const purchaseStatusLabel = useCallback(
    (status: PurchaseOrderListItem["status"]) =>
      getPurchaseStatusLabel(language, status),
    [language],
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPurchaseTabActive = searchParams.get("tab") === "purchase";
  const workspaceFromQuery = useMemo(() => {
    const raw = searchParams.get(PURCHASE_WORKSPACE_QUERY_KEY);
    return isPurchaseWorkspace(raw) ? raw : null;
  }, [searchParams]);
  const statusFromQuery = useMemo(() => {
    const raw = searchParams.get(PURCHASE_STATUS_QUERY_KEY);
    return isPurchaseStatusFilter(raw) ? raw : null;
  }, [searchParams]);
  const apDueFromQuery = useMemo(() => {
    const raw = searchParams.get(PURCHASE_AP_DUE_QUERY_KEY);
    return isPurchaseApDueFilter(raw) ? raw : null;
  }, [searchParams]);
  const apPaymentFromQuery = useMemo(() => {
    const raw = searchParams.get(PURCHASE_AP_PAYMENT_QUERY_KEY);
    return isPurchaseApPaymentFilter(raw) ? raw : null;
  }, [searchParams]);
  const apSortFromQuery = useMemo(() => {
    const raw = searchParams.get(PURCHASE_AP_SORT_QUERY_KEY);
    return isPurchaseApSort(raw) ? raw : null;
  }, [searchParams]);
  const workspaceStorageKey = useMemo(
    () => getPurchaseWorkspaceStorageKey({ storeId: activeStoreId, userId }),
    [activeStoreId, userId],
  );
  const savedPresetsStorageKey = useMemo(
    () => getPurchaseSavedPresetsStorageKey({ storeId: activeStoreId, userId }),
    [activeStoreId, userId],
  );
  const [poList, setPoList] = useState(initialList);
  const [poPage, setPoPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    initialList.length > 0 ? new Date().toISOString() : null,
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    statusFromQuery ?? DEFAULT_PO_STATUS_FILTER,
  );
  const [workspaceTab, setWorkspaceTab] = useState<PurchaseWorkspace>("OPERATIONS");
  const [activeKpiShortcut, setActiveKpiShortcut] = useState<KpiShortcut | null>(null);
  const [apPanelPreset, setApPanelPreset] = useState<PurchaseApPanelPreset | null>(null);
  const [savedPresets, setSavedPresets] = useState<SavedPurchasePreset[]>([]);
  const [pendingRateQueue, setPendingRateQueue] = useState<PendingRateQueueItem[]>([]);
  const [isLoadingPendingQueue, setIsLoadingPendingQueue] = useState(false);
  const [pendingQueueError, setPendingQueueError] = useState<string | null>(null);
  const [pendingSupplierFilter, setPendingSupplierFilter] = useState("");
  const [pendingReceivedFrom, setPendingReceivedFrom] = useState("");
  const [pendingReceivedTo, setPendingReceivedTo] = useState("");
  const [selectedPendingQueueIds, setSelectedPendingQueueIds] = useState<string[]>([]);
  const [isBulkMonthEndMode, setIsBulkMonthEndMode] = useState(false);
  const [bulkRateInput, setBulkRateInput] = useState("");
  const [bulkPaidAtInput, setBulkPaidAtInput] = useState("");
  const [bulkStatementTotalInput, setBulkStatementTotalInput] = useState("");
  const [bulkReferenceInput, setBulkReferenceInput] = useState("");
  const [bulkNoteInput, setBulkNoteInput] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkProgressText, setBulkProgressText] = useState<string | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const pendingScrollRestoreRef = useRef<{ x: number; y: number } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateCloseConfirmOpen, setIsCreateCloseConfirmOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<string | null>(null);
  const poDetailCacheRef = useRef<Map<string, PurchaseOrderDetail>>(new Map());
  const poDetailPendingRef = useRef<Map<string, Promise<PoDetailLoadResult>>>(
    new Map(),
  );

  /* ── Create wizard state ── */
  const [wizardStep, setWizardStep] = useState(1);

  /* ── Create form ── */
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] =
    useState<StoreCurrency>(storeCurrency);
  const [exchangeRate, setExchangeRate] = useState("");
  const [items, setItems] = useState<
    { productId: string; productName: string; qtyOrdered: string; unitCostPurchase: string }[]
  >([]);
  const [shippingCost, setShippingCost] = useState("");
  const [otherCost, setOtherCost] = useState("");
  const [otherCostNote, setOtherCostNote] = useState("");
  const [note, setNote] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Product search for item picker ── */
  const [productSearch, setProductSearch] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productOptions, setProductOptions] = useState<
    { id: string; name: string; sku: string }[]
  >([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState(false);

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

  const applyCreateDateShortcut = useCallback(
    (
      field: "expectedAt" | "dueDate",
      shortcut: "TODAY" | "PLUS_7" | "END_OF_MONTH" | "CLEAR",
    ) => {
      const value = getDateShortcutValue(shortcut);
      if (field === "expectedAt") {
        setExpectedAt(value);
        return;
      }
      setDueDate(value);
    },
    [getDateShortcutValue],
  );

  const applyPendingQueueDateShortcut = useCallback(
    (
      field: "receivedFrom" | "receivedTo",
      shortcut: "TODAY" | "PLUS_7" | "END_OF_MONTH" | "CLEAR",
    ) => {
      const value = getDateShortcutValue(shortcut);
      if (field === "receivedFrom") {
        setPendingReceivedFrom(value);
        return;
      }
      setPendingReceivedTo(value);
    },
    [getDateShortcutValue],
  );

  const hasCreateDraftChanges = useMemo(() => {
    const hasSupplierDraft =
      supplierName.trim().length > 0 || supplierContact.trim().length > 0;
    const hasCurrencyDraft = purchaseCurrency !== storeCurrency;
    const hasExchangeRateDraft = exchangeRate.trim().length > 0;
    const hasItemDraft = items.length > 0;
    const hasCostDraft =
      (Number(shippingCost) || 0) > 0 ||
      (Number(otherCost) || 0) > 0 ||
      otherCostNote.trim().length > 0;
    const hasMetaDraft =
      note.trim().length > 0 || expectedAt.trim().length > 0 || dueDate.trim().length > 0;
    const hasWizardProgress = wizardStep !== 1;

    return (
      hasSupplierDraft ||
      hasCurrencyDraft ||
      hasExchangeRateDraft ||
      hasItemDraft ||
      hasCostDraft ||
      hasMetaDraft ||
      hasWizardProgress
    );
  }, [
    dueDate,
    exchangeRate,
    items.length,
    note,
    otherCost,
    otherCostNote,
    purchaseCurrency,
    shippingCost,
    storeCurrency,
    supplierContact,
    supplierName,
    wizardStep,
    expectedAt,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(savedPresetsStorageKey);
      const legacyKey = getLegacyPurchaseSavedPresetsStorageKey();
      const legacyRaw = window.localStorage.getItem(legacyKey);
      const payload = raw ?? legacyRaw;
      if (!payload) {
        setSavedPresets([]);
        return;
      }
      const parsed = JSON.parse(payload) as SavedPurchasePreset[];
      if (!Array.isArray(parsed)) {
        setSavedPresets([]);
        return;
      }
      const sanitized = parsed.filter(
        (item) =>
          Boolean(item?.id) &&
          Boolean(item?.label) &&
          typeof item?.createdAt === "string" &&
          (item?.shortcut === "OPEN_PO" ||
            item?.shortcut === "PENDING_RATE" ||
            item?.shortcut === "OVERDUE_AP" ||
            item?.shortcut === "OUTSTANDING_AP"),
      );
      const nextPresets = sanitized.slice(0, 6);
      setSavedPresets(nextPresets);
      if (!raw) {
        window.localStorage.setItem(savedPresetsStorageKey, JSON.stringify(nextPresets));
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // Ignore invalid localStorage payload.
      setSavedPresets([]);
    }
  }, [savedPresetsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      savedPresetsStorageKey,
      JSON.stringify(savedPresets),
    );
  }, [savedPresets, savedPresetsStorageKey]);

  const replacePurchaseQuery = useCallback(
    (apply: (params: URLSearchParams) => void) => {
      const latestQuery =
        typeof window !== "undefined"
          ? window.location.search.replace(/^\?/, "")
          : searchParams.toString();
      const params = new URLSearchParams(latestQuery);
      apply(params);
      const nextQuery = params.toString();
      const currentQuery = latestQuery;
      if (nextQuery === currentQuery) {
        return;
      }
      if (typeof window !== "undefined") {
        pendingScrollRestoreRef.current = {
          x: window.scrollX,
          y: window.scrollY,
        };
      }
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!isPurchaseTabActive || typeof window === "undefined") {
      pendingScrollRestoreRef.current = null;
      return;
    }

    const pending = pendingScrollRestoreRef.current;
    if (!pending) {
      return;
    }
    const restore = () => {
      window.scrollTo(pending.x, pending.y);
    };
    const rafId = window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 0);
    });
    pendingScrollRestoreRef.current = null;
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPurchaseTabActive, searchParams]);

  const replaceWorkspaceQuery = useCallback(
    (nextWorkspace: PurchaseWorkspace) => {
      replacePurchaseQuery((params) => {
        params.set(PURCHASE_WORKSPACE_QUERY_KEY, nextWorkspace);
      });
    },
    [replacePurchaseQuery],
  );

  const handleWorkspaceChange = useCallback(
    (
      nextWorkspace: PurchaseWorkspace,
      options?: {
        preserveShortcut?: boolean;
      },
    ) => {
      if (nextWorkspace === workspaceTab) {
        return;
      }
      setWorkspaceTab(nextWorkspace);
      if (!options?.preserveShortcut) {
        setActiveKpiShortcut(null);
        setApPanelPreset(null);
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(workspaceStorageKey, nextWorkspace);
      }
      replaceWorkspaceQuery(nextWorkspace);
    },
    [replaceWorkspaceQuery, workspaceStorageKey, workspaceTab],
  );

  useEffect(() => {
    if (!isPurchaseTabActive) {
      return;
    }

    if (workspaceFromQuery) {
      setWorkspaceTab(workspaceFromQuery);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(workspaceStorageKey, workspaceFromQuery);
      }
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const legacyKey = getLegacyPurchaseWorkspaceStorageKey();
    const scopedWorkspace = window.localStorage.getItem(workspaceStorageKey);
    const legacyWorkspace = window.localStorage.getItem(legacyKey);
    const savedWorkspace = scopedWorkspace ?? legacyWorkspace;
    if (!isPurchaseWorkspace(savedWorkspace)) {
      setWorkspaceTab("OPERATIONS");
      return;
    }
    setWorkspaceTab(savedWorkspace);
    if (!scopedWorkspace) {
      window.localStorage.setItem(workspaceStorageKey, savedWorkspace);
      window.localStorage.removeItem(legacyKey);
    }
    replaceWorkspaceQuery(savedWorkspace);
  }, [isPurchaseTabActive, replaceWorkspaceQuery, workspaceFromQuery, workspaceStorageKey]);

  useEffect(() => {
    if (!isPurchaseTabActive) {
      return;
    }
    setStatusFilter(statusFromQuery ?? DEFAULT_PO_STATUS_FILTER);
  }, [isPurchaseTabActive, statusFromQuery]);

  useEffect(() => {
    if (!isPurchaseTabActive) {
      return;
    }
    replacePurchaseQuery((params) => {
      if (statusFilter === DEFAULT_PO_STATUS_FILTER) {
        params.delete(PURCHASE_STATUS_QUERY_KEY);
      } else {
        params.set(PURCHASE_STATUS_QUERY_KEY, statusFilter);
      }
    });
  }, [isPurchaseTabActive, replacePurchaseQuery, statusFilter]);

  const handleApFiltersChange = useCallback(
    (filters: {
      dueFilter: PurchaseApDueFilter;
      paymentFilter: PurchaseApPaymentFilter;
      statementSort: PurchaseApSort;
    }) => {
      replacePurchaseQuery((params) => {
        params.set(PURCHASE_WORKSPACE_QUERY_KEY, "SUPPLIER_AP");
        if (filters.dueFilter === "ALL") {
          params.delete(PURCHASE_AP_DUE_QUERY_KEY);
        } else {
          params.set(PURCHASE_AP_DUE_QUERY_KEY, filters.dueFilter);
        }
        if (filters.paymentFilter === "ALL") {
          params.delete(PURCHASE_AP_PAYMENT_QUERY_KEY);
        } else {
          params.set(PURCHASE_AP_PAYMENT_QUERY_KEY, filters.paymentFilter);
        }
        if (filters.statementSort === "DUE_ASC") {
          params.delete(PURCHASE_AP_SORT_QUERY_KEY);
        } else {
          params.set(PURCHASE_AP_SORT_QUERY_KEY, filters.statementSort);
        }
      });
    },
    [replacePurchaseQuery],
  );

  const apQueryPreset = useMemo<PurchaseApPanelPreset | null>(() => {
    const hasAnyQueryFilter = Boolean(
      apDueFromQuery || apPaymentFromQuery || apSortFromQuery,
    );
    if (!hasAnyQueryFilter) {
      return null;
    }
    return {
      key: `query-${apDueFromQuery ?? "ALL"}-${apPaymentFromQuery ?? "ALL"}-${apSortFromQuery ?? "DUE_ASC"}`,
      dueFilter: apDueFromQuery ?? "ALL",
      paymentFilter: apPaymentFromQuery ?? "ALL",
      statementSort: apSortFromQuery ?? "DUE_ASC",
    };
  }, [apDueFromQuery, apPaymentFromQuery, apSortFromQuery]);

  const applyKpiShortcut = useCallback(
    (shortcut: KpiShortcut) => {
      const presetKey = `${shortcut}-${Date.now()}`;
      if (shortcut === "OPEN_PO") {
        setStatusFilter("OPEN");
        setActiveKpiShortcut(shortcut);
        setApPanelPreset(null);
        replacePurchaseQuery((params) => {
          params.delete(PURCHASE_AP_DUE_QUERY_KEY);
          params.delete(PURCHASE_AP_PAYMENT_QUERY_KEY);
          params.delete(PURCHASE_AP_SORT_QUERY_KEY);
        });
        handleWorkspaceChange("OPERATIONS", { preserveShortcut: true });
        return;
      }
      if (shortcut === "PENDING_RATE") {
        setStatusFilter(DEFAULT_PO_STATUS_FILTER);
        setActiveKpiShortcut(shortcut);
        setApPanelPreset(null);
        replacePurchaseQuery((params) => {
          params.delete(PURCHASE_AP_DUE_QUERY_KEY);
          params.delete(PURCHASE_AP_PAYMENT_QUERY_KEY);
          params.delete(PURCHASE_AP_SORT_QUERY_KEY);
        });
        handleWorkspaceChange("MONTH_END", { preserveShortcut: true });
        return;
      }
      if (shortcut === "OVERDUE_AP") {
        setStatusFilter(DEFAULT_PO_STATUS_FILTER);
        setActiveKpiShortcut(shortcut);
        setApPanelPreset({
          key: presetKey,
          dueFilter: "OVERDUE",
          statementSort: "DUE_ASC",
          resetDateRange: true,
          resetPoQuery: true,
        });
        handleWorkspaceChange("SUPPLIER_AP", { preserveShortcut: true });
        return;
      }
      setStatusFilter(DEFAULT_PO_STATUS_FILTER);
      setActiveKpiShortcut(shortcut);
      setApPanelPreset({
        key: presetKey,
        dueFilter: "ALL",
        statementSort: "OUTSTANDING_DESC",
        resetDateRange: true,
        resetPoQuery: true,
      });
      handleWorkspaceChange("SUPPLIER_AP", { preserveShortcut: true });
    },
    [handleWorkspaceChange, replacePurchaseQuery],
  );

  const clearKpiShortcut = useCallback(() => {
    setActiveKpiShortcut(null);
    setApPanelPreset(null);
    setStatusFilter(DEFAULT_PO_STATUS_FILTER);
    replacePurchaseQuery((params) => {
      params.delete(PURCHASE_AP_DUE_QUERY_KEY);
      params.delete(PURCHASE_AP_PAYMENT_QUERY_KEY);
      params.delete(PURCHASE_AP_SORT_QUERY_KEY);
    });
  }, [replacePurchaseQuery]);

  const saveCurrentShortcutPreset = useCallback(() => {
    if (!activeKpiShortcut || typeof window === "undefined") {
      return;
    }
    const defaultLabel = kpiShortcutDefaultLabel(language, activeKpiShortcut);
    const input = window.prompt(ui.common.savePresetPrompt, defaultLabel);
    if (input === null) {
      return;
    }
    const label = input.trim() || defaultLabel;
    setSavedPresets((current) => {
      const next = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          shortcut: activeKpiShortcut,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ];
      return next.slice(0, 6);
    });
    toast.success(ui.common.presetSaved);
  }, [activeKpiShortcut, language, ui.common.presetSaved, ui.common.savePresetPrompt]);

  const removeSavedPreset = useCallback((presetId: string) => {
    setSavedPresets((current) => current.filter((item) => item.id !== presetId));
  }, []);

  /* ── Filtered list ── */
  const filteredList = useMemo(() => {
    if (statusFilter === "ALL") return poList;
    if (statusFilter === "OPEN") {
      return poList.filter((po) => po.status !== "RECEIVED" && po.status !== "CANCELLED");
    }
    return poList.filter((po) => po.status === statusFilter);
  }, [poList, statusFilter]);
  const selectedPendingQueueSet = useMemo(
    () => new Set(selectedPendingQueueIds),
    [selectedPendingQueueIds],
  );
  const selectedPendingQueueItems = useMemo(() => {
    if (selectedPendingQueueIds.length === 0) return [] as PendingRateQueueItem[];
    const itemMap = new Map(pendingRateQueue.map((item) => [item.id, item]));
    return selectedPendingQueueIds
      .map((id) => itemMap.get(id))
      .filter((item): item is PendingRateQueueItem => Boolean(item));
  }, [pendingRateQueue, selectedPendingQueueIds]);
  const selectedPendingCurrencies = useMemo(
    () => Array.from(new Set(selectedPendingQueueItems.map((item) => item.purchaseCurrency))),
    [selectedPendingQueueItems],
  );
  const hasMixedPendingCurrencies = selectedPendingCurrencies.length > 1;
  const selectedPendingCurrency = selectedPendingCurrencies[0] ?? null;
  const sortedSelectedPendingQueueItems = useMemo(
    () => sortPendingQueueForSettlement(selectedPendingQueueItems),
    [selectedPendingQueueItems],
  );
  const bulkAllocationPreview = useMemo(() => {
    const hasStatementTotal = bulkStatementTotalInput.trim().length > 0;
    const parsedStatementTotal = Math.round(Number(bulkStatementTotalInput));
    const statementTotal =
      hasStatementTotal &&
      Number.isFinite(parsedStatementTotal) &&
      parsedStatementTotal > 0
        ? parsedStatementTotal
        : null;
    const invalidStatementTotal =
      hasStatementTotal &&
      (!Number.isFinite(parsedStatementTotal) || parsedStatementTotal <= 0);
    const totalOutstanding = sortedSelectedPendingQueueItems.reduce(
      (sum, item) => sum + Math.max(0, Math.round(item.outstandingBase)),
      0,
    );
    let remainingBudget = statementTotal ?? Number.POSITIVE_INFINITY;
    const rows = sortedSelectedPendingQueueItems.map((item) => {
      const outstanding = Math.max(0, Math.round(item.outstandingBase));
      const planned = Math.max(0, Math.min(outstanding, remainingBudget));
      if (Number.isFinite(remainingBudget)) {
        remainingBudget = Math.max(0, remainingBudget - planned);
      }
      return {
        id: item.id,
        poNumber: item.poNumber,
        dueDate: item.dueDate,
        supplierName: item.supplierName,
        outstanding,
        planned,
      };
    });
    const plannedTotal = rows.reduce((sum, row) => sum + row.planned, 0);
    return {
      hasStatementTotal,
      statementTotal,
      invalidStatementTotal,
      totalOutstanding,
      plannedTotal,
      remainingUnallocated:
        statementTotal === null ? 0 : Math.max(0, statementTotal - plannedTotal),
      outstandingAfter: Math.max(0, totalOutstanding - plannedTotal),
      rows,
    };
  }, [bulkStatementTotalInput, sortedSelectedPendingQueueItems]);

  const loadPoDetail = useCallback(
    async (
      poId: string,
      options?: {
        preferCache?: boolean;
      },
    ): Promise<PoDetailLoadResult> => {
      const preferCache = options?.preferCache ?? true;
      if (preferCache) {
        const cached = poDetailCacheRef.current.get(poId);
        if (cached) {
          return { purchaseOrder: cached, error: null };
        }
      }

      const existingRequest = poDetailPendingRef.current.get(poId);
      if (existingRequest) {
        return existingRequest;
      }

      const request = (async (): Promise<PoDetailLoadResult> => {
        try {
          const res = await authFetch(
            `/api/stock/purchase-orders/${encodeURIComponent(poId)}`,
          );
          const data = (await res.json().catch(() => null)) as
            | {
                ok?: boolean;
                message?: string;
                purchaseOrder?: unknown;
              }
            | null;

          if (!res.ok) {
            return {
              purchaseOrder: null,
              error: data?.message ?? ui.errors.loadPoDetailFailed,
            };
          }

          if (!data?.ok || !data.purchaseOrder) {
            return { purchaseOrder: null, error: ui.errors.poNotFound };
          }

          const purchaseOrder = data.purchaseOrder as PurchaseOrderDetail;
          poDetailCacheRef.current.set(poId, purchaseOrder);
          return { purchaseOrder, error: null };
        } catch {
          return {
            purchaseOrder: null,
            error: ui.errors.connectionRetry,
          };
        } finally {
          poDetailPendingRef.current.delete(poId);
        }
      })();

      poDetailPendingRef.current.set(poId, request);
      return request;
    },
    [ui.errors.connectionRetry, ui.errors.loadPoDetailFailed, ui.errors.poNotFound],
  );

  const getCachedPoDetail = useCallback((poId: string) => {
    return poDetailCacheRef.current.get(poId) ?? null;
  }, []);

  const upsertPoDetailCache = useCallback((purchaseOrder: PurchaseOrderDetail) => {
    poDetailCacheRef.current.set(purchaseOrder.id, purchaseOrder);
  }, []);

  const invalidatePoDetailCache = useCallback((poId: string) => {
    poDetailCacheRef.current.delete(poId);
    poDetailPendingRef.current.delete(poId);
  }, []);

  const loadPurchaseOrders = useCallback(
    async (page: number, replace = false) => {
      try {
        const res = await authFetch(
          `/api/stock/purchase-orders?page=${page}&pageSize=${pageSize}`,
        );
        const data = (await res.json().catch(() => null)) as
          | {
              purchaseOrders?: PurchaseOrderListItem[];
              hasMore?: boolean;
              message?: string;
            }
          | null;

        if (!res.ok) {
          setListError(data?.message ?? ui.errors.loadPoListFailed);
          return false;
        }

        if (!Array.isArray(data?.purchaseOrders)) {
          setListError(ui.errors.invalidPoList);
          return false;
        }

        const purchaseOrders = data.purchaseOrders;
        setPoList((prev) => (replace ? purchaseOrders : [...prev, ...purchaseOrders]));
        setPoPage(page);
        setHasMore(Boolean(data.hasMore));
        setListError(null);
        setLastUpdatedAt(new Date().toISOString());
        return true;
      } catch {
        setListError(ui.errors.connectionRetry);
        return false;
      }
    },
    [pageSize, ui.errors.connectionRetry, ui.errors.invalidPoList, ui.errors.loadPoListFailed],
  );

  const loadPendingQueue = useCallback(async () => {
    setIsLoadingPendingQueue(true);
    try {
      const params = new URLSearchParams();
      if (pendingSupplierFilter.trim()) {
        params.set("supplier", pendingSupplierFilter.trim());
      }
      if (pendingReceivedFrom) {
        params.set("receivedFrom", pendingReceivedFrom);
      }
      if (pendingReceivedTo) {
        params.set("receivedTo", pendingReceivedTo);
      }
      params.set("limit", "50");

      const query = params.toString();
      const res = await authFetch(
        `/api/stock/purchase-orders/pending-rate${query ? `?${query}` : ""}`,
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            queue?: PendingRateQueueItem[];
          }
        | null;

      if (!res.ok || !data?.ok) {
        setPendingQueueError(data?.message ?? ui.errors.loadPendingRateFailed);
        return;
      }

      setPendingRateQueue(Array.isArray(data.queue) ? data.queue : []);
      setPendingQueueError(null);
    } catch {
      setPendingQueueError(ui.errors.connectionRetry);
    } finally {
      setIsLoadingPendingQueue(false);
    }
  }, [
    pendingReceivedFrom,
    pendingReceivedTo,
    pendingSupplierFilter,
    ui.errors.connectionRetry,
    ui.errors.loadPendingRateFailed,
  ]);

  const reloadFirstPage = useCallback(async () => {
    setIsRefreshingList(true);
    try {
      await loadPurchaseOrders(1, true);
      await loadPendingQueue();
    } finally {
      setIsRefreshingList(false);
    }
  }, [loadPendingQueue, loadPurchaseOrders]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      await loadPurchaseOrders(poPage + 1, false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, loadPurchaseOrders, poPage]);

  useEffect(() => {
    if (!isPurchaseTabActive) return;

    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isPurchaseTabActive, loadMore]);

  useEffect(() => {
    if (!isPurchaseTabActive) {
      return;
    }
    void loadPendingQueue();
  }, [isPurchaseTabActive, loadPendingQueue]);

  useEffect(() => {
    setSelectedPendingQueueIds((prev) =>
      prev.filter((id) => pendingRateQueue.some((item) => item.id === id)),
    );
  }, [pendingRateQueue]);

  const togglePendingQueueSelection = useCallback((poId: string) => {
    setSelectedPendingQueueIds((prev) => {
      if (prev.includes(poId)) {
        return prev.filter((id) => id !== poId);
      }
      return [...prev, poId];
    });
  }, []);

  const selectAllPendingQueue = useCallback(() => {
    setSelectedPendingQueueIds(pendingRateQueue.map((item) => item.id));
  }, [pendingRateQueue]);

  const clearPendingQueueSelection = useCallback(() => {
    setSelectedPendingQueueIds([]);
  }, []);

  const openBulkMonthEndMode = useCallback(() => {
    if (selectedPendingQueueItems.length === 0) {
      toast.error(ui.bulk.selectAtLeastOne);
      return;
    }
    if (hasMixedPendingCurrencies) {
      toast.error(ui.bulk.sameCurrencyOnly);
      return;
    }
    setBulkRateInput("");
    setBulkStatementTotalInput("");
    setBulkReferenceInput("");
    setBulkNoteInput("");
    setBulkErrors([]);
    setBulkProgressText(null);
    setBulkPaidAtInput(new Date().toISOString().slice(0, 10));
    setIsBulkMonthEndMode(true);
  }, [
    hasMixedPendingCurrencies,
    selectedPendingQueueItems.length,
    ui.bulk.sameCurrencyOnly,
    ui.bulk.selectAtLeastOne,
  ]);

  const submitBulkMonthEnd = useCallback(async () => {
    if (sortedSelectedPendingQueueItems.length === 0) {
      toast.error(ui.bulk.selectAtLeastOne);
      return;
    }
    if (hasMixedPendingCurrencies) {
      toast.error(ui.bulk.sameCurrencyOnly);
      return;
    }

    const exchangeRate = Math.round(Number(bulkRateInput));
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      toast.error(ui.bulk.exchangeRateRequired);
      return;
    }

    const paymentReference = bulkReferenceInput.trim();
    if (!paymentReference) {
      toast.error(ui.bulk.referenceRequired);
      return;
    }

    const paymentNote = bulkNoteInput.trim();
    const paidAt = bulkPaidAtInput.trim();
    const hasStatementTotal = bulkStatementTotalInput.trim().length > 0;
    const parsedStatementTotal = Math.round(Number(bulkStatementTotalInput));
    if (
      hasStatementTotal &&
      (!Number.isFinite(parsedStatementTotal) || parsedStatementTotal <= 0)
    ) {
      toast.error(ui.bulk.statementTotalRequired);
      return;
    }

    setIsBulkSubmitting(true);
    setBulkErrors([]);
    setBulkProgressText(ui.bulk.starting);

    const errors: string[] = [];
    let settledCount = 0;
    let finalizedCount = 0;
    let settledAmountTotal = 0;
    let remainingStatementBudget = hasStatementTotal
      ? Math.max(0, parsedStatementTotal)
      : null;

    try {
      for (let i = 0; i < sortedSelectedPendingQueueItems.length; i += 1) {
        const item = sortedSelectedPendingQueueItems[i]!;
        setBulkProgressText(
          interpolatePurchaseText(ui.bulk.processing, {
            current: i + 1,
            total: sortedSelectedPendingQueueItems.length,
            poNumber: item.poNumber,
          }),
        );

        const finalizeRes = await authFetch(
          `/api/stock/purchase-orders/${item.id}/finalize-rate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `po-bulk-rate-${item.id}-${Date.now()}-${i}`,
            },
            body: JSON.stringify({
              exchangeRate,
              note:
                paymentNote ||
                interpolatePurchaseText(ui.bulk.paymentRoundNote, {
                  reference: paymentReference,
                }),
            }),
          },
        );
        const finalizeData = (await finalizeRes.json().catch(() => null)) as
          | { message?: string; purchaseOrder?: PurchaseOrderDetail }
          | null;
        if (!finalizeRes.ok) {
          errors.push(
            interpolatePurchaseText(ui.bulk.finalizeFailed, {
              poNumber: item.poNumber,
              message: finalizeData?.message ?? ui.bulk.unknown,
            }),
          );
          continue;
        }
        finalizedCount += 1;

        const detailResult = await loadPoDetail(item.id, { preferCache: false });
        if (!detailResult.purchaseOrder) {
          errors.push(
            interpolatePurchaseText(ui.bulk.detailReloadFailed, {
              poNumber: item.poNumber,
              message: detailResult.error ?? ui.bulk.unknown,
            }),
          );
          continue;
        }
        const outstandingAmount = Math.round(detailResult.purchaseOrder.outstandingBase);
        if (outstandingAmount <= 0) {
          settledCount += 1;
          continue;
        }
        const settleAmount =
          remainingStatementBudget === null
            ? outstandingAmount
            : Math.min(outstandingAmount, remainingStatementBudget);
        if (!Number.isFinite(settleAmount) || settleAmount <= 0) {
          continue;
        }

        const settleRes = await authFetch(
          `/api/stock/purchase-orders/${item.id}/settle`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `po-bulk-settle-${item.id}-${Date.now()}-${i}`,
            },
            body: JSON.stringify({
              amountBase: settleAmount,
              paidAt: paidAt || undefined,
              paymentReference,
              paymentNote: paymentNote || undefined,
            }),
          },
        );
        const settleData = (await settleRes.json().catch(() => null)) as
          | { message?: string; purchaseOrder?: PurchaseOrderDetail }
          | null;
        if (!settleRes.ok) {
          errors.push(
            interpolatePurchaseText(ui.bulk.settleFailed, {
              poNumber: item.poNumber,
              message: settleData?.message ?? ui.bulk.unknown,
            }),
          );
          continue;
        }
        if (settleData?.purchaseOrder) {
          poDetailCacheRef.current.set(item.id, settleData.purchaseOrder);
        }
        if (remainingStatementBudget !== null) {
          remainingStatementBudget = Math.max(0, remainingStatementBudget - settleAmount);
        }
        settledAmountTotal += settleAmount;
        settledCount += 1;
      }

      if (finalizedCount > 0) {
        toast.success(
          interpolatePurchaseText(ui.bulk.finalizeSuccess, {
            count: finalizedCount,
            total: sortedSelectedPendingQueueItems.length,
          }),
        );
      }
      if (settledCount > 0) {
        toast.success(
          interpolatePurchaseText(ui.bulk.settleSuccess, {
            count: settledCount,
            total: sortedSelectedPendingQueueItems.length,
            amount: fmtPrice(settledAmountTotal, storeCurrency),
          }),
        );
      }
      if ((remainingStatementBudget ?? 0) > 0) {
        toast(
          interpolatePurchaseText(ui.bulk.unmatchedStatement, {
            amount: fmtPrice(remainingStatementBudget ?? 0, storeCurrency),
          }),
        );
      }
      if (errors.length > 0) {
        toast.error(
          interpolatePurchaseText(ui.bulk.failedCount, {
            count: errors.length,
          }),
        );
      } else {
        setSelectedPendingQueueIds([]);
        setIsBulkMonthEndMode(false);
      }

      setBulkErrors(errors);
      await reloadFirstPage();
      router.refresh();
    } catch {
      toast.error(ui.bulk.processingConnectionFailed);
    } finally {
      setIsBulkSubmitting(false);
      setBulkProgressText(null);
    }
  }, [
    bulkNoteInput,
    bulkPaidAtInput,
    bulkRateInput,
    bulkStatementTotalInput,
    bulkReferenceInput,
    hasMixedPendingCurrencies,
    loadPoDetail,
    reloadFirstPage,
    router,
    sortedSelectedPendingQueueItems,
    storeCurrency,
    ui.bulk.detailReloadFailed,
    ui.bulk.exchangeRateRequired,
    ui.bulk.failedCount,
    ui.bulk.finalizeFailed,
    ui.bulk.finalizeSuccess,
    ui.bulk.paymentRoundNote,
    ui.bulk.processing,
    ui.bulk.processingConnectionFailed,
    ui.bulk.referenceRequired,
    ui.bulk.sameCurrencyOnly,
    ui.bulk.selectAtLeastOne,
    ui.bulk.settleFailed,
    ui.bulk.settleSuccess,
    ui.bulk.starting,
    ui.bulk.statementTotalRequired,
    ui.bulk.unknown,
    ui.bulk.unmatchedStatement,
  ]);

  /* ── Load products for item picker ── */
  const loadProducts = useCallback(async () => {
    if (productOptions.length > 0) return;
    setLoadingProducts(true);
    try {
      const res = await authFetch("/api/stock/movements");
      const data = await res.json();
      if (data.ok && data.products) {
        setProductOptions(
          data.products.map((p: { productId: string; name: string; sku: string }) => ({
            id: p.productId,
            name: p.name,
            sku: p.sku,
          })),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingProducts(false);
    }
  }, [productOptions.length]);

  /* ── Open/close ── */
  const openCreateSheet = () => {
    setSupplierName("");
    setSupplierContact("");
    setPurchaseCurrency(storeCurrency);
    setExchangeRate("");
    setIsSupplierPickerOpen(false);
    setProductSearch("");
    setIsProductPickerOpen(false);
    setItems([]);
    setShippingCost("");
    setOtherCost("");
    setOtherCostNote("");
    setNote("");
    setExpectedAt("");
    setDueDate("");
    setWizardStep(1);
    setIsCreateCloseConfirmOpen(false);
    setIsCreateOpen(true);
    loadProducts();
  };

  const forceCloseCreateSheet = useCallback(() => {
    setIsCreateCloseConfirmOpen(false);
    setIsSupplierPickerOpen(false);
    setIsCreateOpen(false);
  }, []);

  const closeCreateSheet = useCallback(() => {
    if (isSubmitting) return;
    if (hasCreateDraftChanges) {
      setIsCreateCloseConfirmOpen(true);
      return;
    }
    forceCloseCreateSheet();
  }, [forceCloseCreateSheet, hasCreateDraftChanges, isSubmitting]);

  /* ── Add item ── */
  const addItem = (product: { id: string; name: string }) => {
    if (items.some((i) => i.productId === product.id)) {
      toast.error("สินค้านี้เพิ่มไปแล้ว");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        qtyOrdered: "1",
        unitCostPurchase: "",
      },
    ]);
    setProductSearch("");
    setIsProductPickerOpen(false);
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const updateItem = (
    productId: string,
    field: "qtyOrdered" | "unitCostPurchase",
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, [field]: value } : i)),
    );
  };

  /* ── Computed totals ── */
  const normalizedExchangeRate = exchangeRate.trim();
  const hasExchangeRateInput =
    normalizedExchangeRate.length > 0 && Number(normalizedExchangeRate) > 0;
  const rate = hasExchangeRateInput ? Number(normalizedExchangeRate) : 1;
  const effectiveRate = purchaseCurrency === storeCurrency ? 1 : rate;
  const itemsTotalPurchase = items.reduce(
    (sum, i) => sum + (Number(i.qtyOrdered) || 0) * (Number(i.unitCostPurchase) || 0),
    0,
  );
  const itemsTotalBase = Math.round(itemsTotalPurchase * effectiveRate);
  const shipping = Number(shippingCost) || 0;
  const other = Number(otherCost) || 0;
  const grandTotal = itemsTotalBase + shipping + other;

  /* ── Submit ── */
  const submitPO = async (receiveImmediately: boolean) => {
    if (items.length === 0) {
      toast.error(ui.errors.atLeastOneItem);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await authFetch("/api/stock/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName || undefined,
          supplierContact: supplierContact || undefined,
          purchaseCurrency,
          exchangeRate:
            purchaseCurrency === storeCurrency
              ? 1
              : hasExchangeRateInput
                ? rate
                : undefined,
          shippingCost: shipping,
          otherCost: other,
          otherCostNote: otherCostNote || undefined,
          note: note || undefined,
          expectedAt: expectedAt || undefined,
          dueDate: dueDate || undefined,
          receiveImmediately,
          items: items.map((i) => ({
            productId: i.productId,
            qtyOrdered: Number(i.qtyOrdered) || 1,
            unitCostPurchase: Number(i.unitCostPurchase) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? ui.create.createFailed);
        return;
      }
      toast.success(
        receiveImmediately
          ? ui.create.createAndReceivedSuccess
          : ui.create.createSuccess,
      );
      if (
        data?.purchaseOrder?.purchaseCurrency &&
        data.purchaseOrder.purchaseCurrency !== storeCurrency &&
        !data.purchaseOrder.exchangeRateLockedAt
      ) {
        toast(ui.create.pendingRateToast, {
          icon: "🧾",
        });
      }
      forceCloseCreateSheet();
      await reloadFirstPage();
      router.refresh();
    } catch {
      toast.error(ui.errors.connectionRetry);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Update PO status ── */
  const updateStatus = async (
    poId: string,
    status: "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED",
  ) => {
    try {
      const res = await authFetch(`/api/stock/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? statusMutationUi.failed);
        return;
      }
      toast.success(
        interpolatePurchaseText(statusMutationUi.success, {
          status: purchaseStatusLabel(status),
        }),
      );
      invalidatePoDetailCache(poId);
      await reloadFirstPage();
      setSelectedPO(null);
      router.refresh();
    } catch {
      toast.error(ui.errors.connectionRetry);
    }
  };

  /* ── Style helpers ── */
  const fieldClassName =
    "h-11 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  const filteredProductOptions = productOptions.filter(
    (p) =>
      !items.some((i) => i.productId === p.id) &&
      (productSearch === "" ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())),
  );
  const visibleProductPickerOptions = useMemo(
    () => filteredProductOptions.slice(0, productSearch ? 10 : 20),
    [filteredProductOptions, productSearch],
  );
  const supplierNameOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const po of poList) {
      const supplier = po.supplierName?.trim();
      if (!supplier) {
        continue;
      }
      const key = supplier.toLocaleLowerCase("en-US");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push(supplier);
      if (options.length >= 100) {
        break;
      }
    }
    return options;
  }, [poList]);
  const filteredSupplierOptions = useMemo(() => {
    const keyword = supplierName.trim().toLocaleLowerCase("en-US");
    if (!keyword) {
      return supplierNameOptions;
    }
    return supplierNameOptions.filter((name) =>
      name.toLocaleLowerCase("en-US").includes(keyword),
    );
  }, [supplierName, supplierNameOptions]);
  const visibleSupplierPickerOptions = useMemo(
    () => filteredSupplierOptions.slice(0, supplierName.trim() ? 10 : 30),
    [filteredSupplierOptions, supplierName],
  );

  /* ── Status counts for badges ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: poList.length };
    for (const po of poList) {
      counts[po.status] = (counts[po.status] ?? 0) + 1;
    }
    counts.OPEN =
      (counts.DRAFT ?? 0) + (counts.ORDERED ?? 0) + (counts.SHIPPED ?? 0);
    return counts;
  }, [poList]);
  const workspaceSummary = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const dueSoonBoundary = startOfToday + 3 * 24 * 60 * 60 * 1000;

    let openPoCount = 0;
    let overduePoCount = 0;
    let dueSoonPoCount = 0;
    let outstandingBase = 0;

    for (const po of poList) {
      if (po.status !== "CANCELLED" && po.status !== "RECEIVED") {
        openPoCount += 1;
      }

      if (po.status !== "RECEIVED") {
        continue;
      }
      const outstanding = Math.max(0, Math.round(po.outstandingBase));
      if (outstanding <= 0) {
        continue;
      }

      outstandingBase += outstanding;
      if (!po.dueDate) {
        continue;
      }

      const dueAt = new Date(po.dueDate).getTime();
      if (!Number.isFinite(dueAt)) {
        continue;
      }
      if (dueAt < startOfToday) {
        overduePoCount += 1;
      } else if (dueAt <= dueSoonBoundary) {
        dueSoonPoCount += 1;
      }
    }

    return {
      openPoCount,
      pendingRateCount: pendingRateQueue.length,
      overduePoCount,
      dueSoonPoCount,
      outstandingBase,
    };
  }, [pendingRateQueue.length, poList]);
  const activeKpiShortcutLabel = useMemo(() => {
    if (!activeKpiShortcut) return null;
    return getShortcutDescription(language, activeKpiShortcut);
  }, [activeKpiShortcut, language]);

  return (
    <div className="space-y-3">
      {/* ── Header row: title + "+" button ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t("stock.purchase.title")}</h2>
          <p className="text-[11px] text-slate-500">
            {poList.length > 0
              ? `${formatNumberByLanguage(language, poList.length)} ${t("dashboard.unit.items")}`
              : t("stock.purchase.emptyAll")}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
              onClick={openCreateSheet}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {t("stock.purchase.create")}
            </button>
          </div>
        )}
      </div>
      <StockTabToolbar
        language={language}
        isRefreshing={isRefreshingList}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void reloadFirstPage();
        }}
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {t("stock.purchase.kpiTitle")}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          {t("stock.purchase.kpiDescription")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {workspaceUi.kpiOpenPo}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {formatNumberByLanguage(language, workspaceSummary.openPoCount)}
            </p>
            <p className="text-[11px] text-slate-500">{t("stock.purchase.openPo")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {workspaceUi.kpiPendingRate}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {formatNumberByLanguage(language, workspaceSummary.pendingRateCount)}
            </p>
            <p className="text-[11px] text-slate-500">{t("stock.purchase.pendingRate")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {workspaceUi.kpiOverdueAp}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {formatNumberByLanguage(language, workspaceSummary.overduePoCount)}
            </p>
            <p className="text-[11px] text-slate-500">
              {t("stock.purchase.overdueAp", {
                count: formatNumberByLanguage(language, workspaceSummary.dueSoonPoCount),
              })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {workspaceUi.kpiOutstanding}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {fmtPrice(workspaceSummary.outstandingBase, storeCurrency)}
            </p>
            <p className="text-[11px] text-slate-500">{t("stock.purchase.outstanding")}</p>
          </div>
        </div>
        {activeKpiShortcutLabel ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-600">
              {workspaceUi.appliedFilter}{" "}
              {activeKpiShortcutLabel}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={saveCurrentShortcutPreset}
              >
                {workspaceUi.savePreset}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={clearKpiShortcut}
              >
                {workspaceUi.clearQuickFilter}
              </button>
            </div>
          </div>
        ) : null}
        {savedPresets.length > 0 ? (
          <div className="mt-2 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {savedPresets.map((preset) => (
              <div
                key={preset.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1"
              >
                <button
                  type="button"
                  className="text-[11px] font-medium text-slate-700 hover:text-slate-900"
                  onClick={() => applyKpiShortcut(preset.shortcut)}
                >
                  {preset.label}
                </button>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  onClick={() => removeSavedPreset(preset.id)}
                  aria-label={
                    interpolatePurchaseText(workspaceUi.removePreset, {
                      label: preset.label,
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sticky top-2 z-10 rounded-2xl border border-slate-200 bg-white/95 p-2 backdrop-blur md:static md:z-auto md:bg-white md:p-2 md:backdrop-blur-0">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {workspaceUi.workspaceTitle}
        </p>
        <div className="mt-1 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              {
                id: "OPERATIONS" as PurchaseWorkspace,
                label: workspaceUi.operationsLabel,
                icon: ShoppingCart,
                desc: workspaceUi.operationsDesc,
                badge: workspaceSummary.openPoCount,
              },
              {
                id: "MONTH_END" as PurchaseWorkspace,
                label: workspaceUi.monthEndLabel,
                icon: Banknote,
                desc: workspaceUi.monthEndDesc,
                badge: workspaceSummary.pendingRateCount,
              },
              {
                id: "SUPPLIER_AP" as PurchaseWorkspace,
                label: workspaceUi.supplierApLabel,
                icon: FileText,
                desc: workspaceUi.supplierApDesc,
                badge: workspaceSummary.overduePoCount,
              },
            ] as const
          ).map((workspace) => {
            const WorkspaceIcon = workspace.icon;
            const isActive = workspaceTab === workspace.id;
            return (
              <button
                key={workspace.id}
                type="button"
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => handleWorkspaceChange(workspace.id)}
              >
                <WorkspaceIcon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{workspace.label}</span>
                {workspace.badge > 0 ? (
                  <span
                    className={`inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {formatNumberByLanguage(language, workspace.badge)}
                  </span>
                ) : null}
                <span
                  className={`hidden text-[11px] sm:inline ${
                    isActive ? "text-primary-foreground/80" : "text-slate-500"
                  }`}
                >
                  {workspace.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {workspaceTab === "MONTH_END" ? (
      <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              {monthEndUi.queueTitle}
            </p>
            <p className="text-[11px] text-amber-700/90">
              {interpolatePurchaseText(monthEndUi.recordsCount, {
                count: formatNumberByLanguage(language, pendingRateQueue.length),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              window.open("/api/stock/purchase-orders/outstanding/export-csv", "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
          >
            <Download className="h-3.5 w-3.5" />
            {monthEndUi.exportCsv}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] text-amber-700">{ui.common.supplier}</label>
            <input
              className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
              placeholder={monthEndUi.filterSupplierPlaceholder}
              value={pendingSupplierFilter}
              onChange={(event) => setPendingSupplierFilter(event.target.value)}
            />
          </div>
          <div className="space-y-1 min-w-0">
            <label className="text-[11px] text-amber-700">
              {monthEndUi.receivedFrom}
            </label>
            <PurchaseDatePickerField
              language={language}
              value={pendingReceivedFrom}
              onChange={setPendingReceivedFrom}
              triggerClassName="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-left text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300 flex items-center justify-between gap-2"
              placeholder="dd/mm/yyyy"
              ariaLabel={monthEndUi.receivedFromAria}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "TODAY")}
              >
                {ui.common.today}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "PLUS_7")}
              >
                {ui.common.plusSevenDays}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "END_OF_MONTH")}
              >
                {ui.common.endOfMonth}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "CLEAR")}
              >
                {ui.common.clear}
              </button>
            </div>
          </div>
          <div className="space-y-1 min-w-0">
            <label className="text-[11px] text-amber-700">
              {monthEndUi.receivedTo}
            </label>
            <PurchaseDatePickerField
              language={language}
              value={pendingReceivedTo}
              onChange={setPendingReceivedTo}
              triggerClassName="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-left text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300 flex items-center justify-between gap-2"
              placeholder="dd/mm/yyyy"
              ariaLabel={monthEndUi.receivedToAria}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "TODAY")}
              >
                {ui.common.today}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "PLUS_7")}
              >
                {ui.common.plusSevenDays}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "END_OF_MONTH")}
              >
                {ui.common.endOfMonth}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "CLEAR")}
              >
                {ui.common.clear}
              </button>
            </div>
          </div>
        </div>
        {isLoadingPendingQueue ? (
          <p className="text-xs text-amber-700">
            {monthEndUi.loadingQueue}
          </p>
        ) : pendingQueueError ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-red-600">{pendingQueueError}</p>
            <Button
              type="button"
              variant="outline"
              className="h-7 border-red-200 bg-white px-2.5 text-xs text-red-700 hover:bg-red-50"
              onClick={() => {
                void loadPendingQueue();
              }}
            >
              {ui.common.retry}
            </Button>
          </div>
        ) : pendingRateQueue.length === 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-4 text-center">
            <p className="text-xs text-amber-700/90">
              {monthEndUi.emptyQueue}
            </p>
            <p className="text-[11px] text-slate-500">
              {ui.pendingQueue.emptyHint}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => handleWorkspaceChange("OPERATIONS")}
              >
                {ui.pendingQueue.goOperations}
              </button>
              {canCreate ? (
                <button
                  type="button"
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
                  onClick={openCreateSheet}
                >
                  {t("stock.purchase.createNew")}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2">
              <p className="text-[11px] text-amber-800">
                {interpolatePurchaseText(ui.pendingQueue.selectedCount, {
                  selected: selectedPendingQueueIds.length,
                  total: pendingRateQueue.length,
                })}
                {selectedPendingCurrency ? ` · ${ui.common.currency} ${selectedPendingCurrency}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  onClick={selectAllPendingQueue}
                  disabled={isBulkSubmitting}
                >
                {monthEndUi.selectAll}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  onClick={clearPendingQueueSelection}
                  disabled={isBulkSubmitting}
                >
                {monthEndUi.clearSelection}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  onClick={openBulkMonthEndMode}
                  disabled={selectedPendingQueueIds.length === 0 || isBulkSubmitting}
                >
                  {monthEndUi.finalizeAndSettle}
                </button>
              </div>
            </div>
            {hasMixedPendingCurrencies ? (
              <p className="text-[11px] text-red-600">
                {monthEndUi.mixedCurrencies}
              </p>
            ) : null}
            {isBulkMonthEndMode ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-white p-3">
                <p className="text-xs font-semibold text-amber-800">
                  {monthEndUi.bulkTitle}
                </p>
                <p className="text-[11px] text-amber-700/90">
                  {ui.bulk.autoMatchHint}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600">
                      {interpolatePurchaseText(ui.bulk.exchangeRateLabel, {
                        purchase: selectedPendingCurrency ?? "-",
                        store: storeCurrency,
                      })}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkRateInput}
                      onChange={(event) => setBulkRateInput(event.target.value)}
                      placeholder="0"
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600">{ui.bulk.paidAtLabel}</label>
                    <input
                      type="date"
                      className="po-date-input h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkPaidAtInput}
                      onChange={(event) => setBulkPaidAtInput(event.target.value)}
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600">{ui.bulk.statementTotalLabel}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkStatementTotalInput}
                      onChange={(event) => setBulkStatementTotalInput(event.target.value)}
                      placeholder="0"
                      disabled={isBulkSubmitting}
                    />
                    <p className="text-[10px] text-slate-500">
                      {ui.bulk.statementTotalHelp}
                    </p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] text-slate-600">
                      {ui.bulk.referenceLabel}
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkReferenceInput}
                      onChange={(event) => setBulkReferenceInput(event.target.value)}
                      placeholder={ui.bulk.referencePlaceholder}
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] text-slate-600">{ui.bulk.noteLabel}</label>
                    <input
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkNoteInput}
                      onChange={(event) => setBulkNoteInput(event.target.value)}
                      placeholder={ui.bulk.notePlaceholder}
                      disabled={isBulkSubmitting}
                    />
                  </div>
                </div>
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50/50 p-2">
                  <p className="text-[11px] font-medium text-amber-800">
                    {ui.bulk.reconcilePlanTitle}
                  </p>
                  <p className="text-[11px] text-amber-800">
                    {interpolatePurchaseText(ui.bulk.reconcilePlanSummary, {
                      outstanding: fmtPrice(bulkAllocationPreview.totalOutstanding, storeCurrency),
                      planned: fmtPrice(bulkAllocationPreview.plannedTotal, storeCurrency),
                      after: fmtPrice(bulkAllocationPreview.outstandingAfter, storeCurrency),
                    })}
                  </p>
                  {bulkAllocationPreview.statementTotal !== null ? (
                    <p className="text-[11px] text-amber-800">
                      {interpolatePurchaseText(ui.bulk.unmatchedStatement, {
                        amount: fmtPrice(bulkAllocationPreview.remainingUnallocated, storeCurrency),
                      })}
                    </p>
                  ) : null}
                  {bulkAllocationPreview.invalidStatementTotal ? (
                    <p className="text-[11px] text-red-600">
                      {ui.bulk.statementTotalMustBePositive}
                    </p>
                  ) : null}
                  <div className="max-h-24 space-y-0.5 overflow-y-auto pr-1">
                    {bulkAllocationPreview.rows.map((row) => (
                      <p key={row.id} className="text-[11px] text-amber-800">
                        {row.poNumber}
                        {row.supplierName ? ` · ${row.supplierName}` : ""}
                        {row.dueDate ? ` · ${ui.bulk.dueShort} ${formatDate(row.dueDate)}` : ""}
                        {" · "}
                        {ui.bulk.reconcileRowMatched} {fmtPrice(row.planned, storeCurrency)}
                        {" / "}
                        {ui.bulk.reconcileRowOutstanding} {fmtPrice(row.outstanding, storeCurrency)}
                      </p>
                    ))}
                  </div>
                </div>
                {bulkProgressText ? (
                  <p className="text-[11px] text-amber-700">{bulkProgressText}</p>
                ) : null}
                {bulkErrors.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2">
                    <p className="text-[11px] font-medium text-red-700">
                      {interpolatePurchaseText(ui.bulk.failedListTitle, {
                        count: bulkErrors.length,
                      })}
                    </p>
                    <ul className="max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4 text-[11px] text-red-700">
                      {bulkErrors.map((error, index) => (
                        <li key={`${error}-${index}`}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-amber-200 bg-white text-xs text-amber-700 hover:bg-amber-50"
                    onClick={() => setIsBulkMonthEndMode(false)}
                    disabled={isBulkSubmitting}
                  >
                    {ui.common.cancel}
                  </Button>
                  <Button
                    type="button"
                    className="h-9 bg-amber-600 text-xs text-white hover:bg-amber-700"
                    onClick={() => {
                      void submitBulkMonthEnd();
                    }}
                    disabled={isBulkSubmitting || hasMixedPendingCurrencies}
                  >
                    {isBulkSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      ui.bulk.startFinalizeAndSettle
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {pendingRateQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-400"
                    checked={selectedPendingQueueSet.has(item.id)}
                    onChange={() => togglePendingQueueSelection(item.id)}
                    disabled={isBulkSubmitting}
                  />
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-between text-left"
                    onClick={() => setSelectedPO(item.id)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-900">
                        {item.poNumber}
                        {item.supplierName ? ` · ${item.supplierName}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.receivedAt
                          ? interpolatePurchaseText(monthEndUi.rowReceivedAt, {
                              date: formatDate(item.receivedAt, language),
                            })
                          : monthEndUi.rowNoReceivedAt}
                        {" · "}
                        {interpolatePurchaseText(monthEndUi.rowInitialRate, {
                          rate: item.exchangeRateInitial,
                          store: storeCurrency,
                          purchase: item.purchaseCurrency,
                        })}
                        {item.dueDate
                          ? ` · ${interpolatePurchaseText(monthEndUi.rowDueDate, {
                              date: formatDate(item.dueDate, language),
                            })}`
                          : ""}
                        {" · "}
                        {interpolatePurchaseText(monthEndUi.rowOutstanding, {
                          amount: fmtPrice(item.outstandingBase, storeCurrency, language),
                        })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-amber-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      ) : null}

      {workspaceTab === "SUPPLIER_AP" ? (
      <PurchaseApSupplierPanel
        language={language}
        storeCurrency={storeCurrency}
        refreshKey={lastUpdatedAt}
        preset={apPanelPreset ?? apQueryPreset}
        onFiltersChange={handleApFiltersChange}
        onAfterBulkSettle={reloadFirstPage}
        onOpenPurchaseOrder={(poId) => {
          setSelectedPO(poId);
        }}
      />
      ) : null}

      {workspaceTab === "OPERATIONS" ? (
      <>
      {listError && poList.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">{listError}</p>
          <Button
            type="button"
            variant="outline"
            className="h-7 border-red-200 bg-white px-2.5 text-xs text-red-700 hover:bg-red-100"
            onClick={() => {
              void reloadFirstPage();
            }}
          >
            {ui.common.retry}
          </Button>
        </div>
      ) : null}

      {/* ── Filter chips (full-width, scrollable) ── */}
      <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { id: "ALL" as StatusFilter, label: operationsUi.filterAll },
            { id: "OPEN" as StatusFilter, label: operationsUi.filterOpen },
            { id: "DRAFT" as StatusFilter, label: getPurchaseStatusLabel(language, "DRAFT") },
            { id: "ORDERED" as StatusFilter, label: getPurchaseStatusLabel(language, "ORDERED") },
            { id: "SHIPPED" as StatusFilter, label: operationsUi.filterShipped },
            { id: "RECEIVED" as StatusFilter, label: getPurchaseStatusLabel(language, "RECEIVED") },
            { id: "CANCELLED" as StatusFilter, label: getPurchaseStatusLabel(language, "CANCELLED") },
          ] as const
        ).map((f) => {
          const count = statusCounts[f.id] ?? 0;
          const isActive = statusFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 active:bg-slate-200"
              }`}
              onClick={() => {
                setStatusFilter(f.id);
                setActiveKpiShortcut(null);
                setApPanelPreset(null);
                replacePurchaseQuery((params) => {
                  params.delete(PURCHASE_AP_DUE_QUERY_KEY);
                  params.delete(PURCHASE_AP_PAYMENT_QUERY_KEY);
                  params.delete(PURCHASE_AP_SORT_QUERY_KEY);
                });
              }}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── PO list ── */}
      {isRefreshingList && poList.length === 0 ? (
        <StockTabLoadingState language={language} message={t("stock.purchase.loading")} />
      ) : listError && poList.length === 0 ? (
        <StockTabErrorState
          language={language}
          message={listError}
          onRetry={() => {
            void reloadFirstPage();
          }}
        />
      ) : filteredList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            {statusFilter === "ALL"
              ? t("stock.purchase.emptyAll")
              : statusFilter === "OPEN"
                ? t("stock.purchase.emptyOpen")
                : t("stock.purchase.emptyStatus")}
          </p>
          {canCreate && (statusFilter === "ALL" || statusFilter === "OPEN") && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
              onClick={openCreateSheet}
            >
              <Plus className="h-4 w-4" />
              {t("stock.purchase.createNew")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((po) => {
            const cfg = statusConfig[po.status];
            const Icon = cfg.icon;
            const isExchangeRatePending =
              po.purchaseCurrency !== storeCurrency && !po.exchangeRateLockedAt;
            const remaining =
              po.expectedAt && po.status !== "RECEIVED" && po.status !== "CANCELLED"
                ? daysUntil(po.expectedAt)
                : null;

            return (
              <button
                key={po.id}
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
                onClick={() => setSelectedPO(po.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {po.poNumber}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.badgeClass}`}
                      >
                        <Icon className="h-3 w-3" />
                        {purchaseStatusLabel(po.status)}
                      </span>
                    </div>
                    {po.supplierName && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {po.supplierName} ({po.purchaseCurrency})
                      </p>
                    )}
                    {isExchangeRatePending && (
                      <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {operationsUi.pendingRateFinalization}
                      </p>
                    )}
                    {po.status === "RECEIVED" && (
                      <p
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          po.paymentStatus === "PAID"
                            ? "bg-emerald-50 text-emerald-700"
                            : po.paymentStatus === "PARTIAL"
                              ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {po.paymentStatus === "PAID"
                          ? ui.detail.paid
                          : po.paymentStatus === "PARTIAL"
                            ? ui.detail.partialPaid
                            : ui.detail.unpaid}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {interpolatePurchaseText(operationsUi.itemCount, {
                        count: formatNumberByLanguage(language, po.itemCount),
                      })}{" "}
                      ·{" "}
                      {fmtPrice(
                        po.totalCostBase + po.shippingCost + po.otherCost,
                        storeCurrency,
                        language,
                      )}
                      {po.status === "RECEIVED"
                        ? ` · ${interpolatePurchaseText(operationsUi.outstanding, {
                            amount: fmtPrice(po.outstandingBase, storeCurrency, language),
                          })}`
                        : ""}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <div className="mt-2">
                  <div className="space-y-1 text-[11px] text-slate-600">
                    {/* Timeline based on status */}
                    {po.status === "DRAFT" && (
                      <div>
                        {interpolatePurchaseText(operationsUi.createdAt, {
                          date: formatDate(po.createdAt, language),
                        })}
                      </div>
                    )}
                    {po.status === "ORDERED" && (
                      <div>
                        {interpolatePurchaseText(operationsUi.createdAt, {
                          date: formatDate(po.createdAt, language),
                        })}
                        {po.orderedAt && (
                          <>
                            {" "}
                            →{" "}
                            {interpolatePurchaseText(operationsUi.orderedAt, {
                              date: formatDate(po.orderedAt, language),
                            })}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "SHIPPED" && (
                      <div>
                        {interpolatePurchaseText(operationsUi.createdAt, {
                          date: formatDate(po.createdAt, language),
                        })}
                        {po.shippedAt && (
                          <>
                            {" "}
                            →{" "}
                            {interpolatePurchaseText(operationsUi.shippedAt, {
                              date: formatDate(po.shippedAt, language),
                            })}
                          </>
                        )}
                        {po.expectedAt && (
                          <>
                            {" "}
                            →{" "}
                            {interpolatePurchaseText(operationsUi.expectedAt, {
                              date: formatDate(po.expectedAt, language),
                            })}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "RECEIVED" && (
                      <div>
                        {interpolatePurchaseText(operationsUi.createdAt, {
                          date: formatDate(po.createdAt, language),
                        })}
                        {po.shippedAt && (
                          <>
                            {" "}
                            →{" "}
                            {interpolatePurchaseText(operationsUi.shippedAt, {
                              date: formatDate(po.shippedAt, language),
                            })}
                          </>
                        )}
                        {po.receivedAt && (
                          <>
                            {" "}
                            →{" "}
                            {interpolatePurchaseText(operationsUi.receivedAt, {
                              date: formatDate(po.receivedAt, language),
                            })}
                          </>
                        )}
                      </div>
                    )}
    {po.status === "CANCELLED" && (
                      <div>
                        {interpolatePurchaseText(operationsUi.createdAt, {
                          date: formatDate(po.createdAt, language),
                        })}{" "}
                        {po.cancelledAt && (
                          <>
                            ·{" "}
                            <span className="text-red-600">
                              {interpolatePurchaseText(operationsUi.cancelledAt, {
                                date: formatDate(po.cancelledAt, language),
                              })}
                            </span>
                          </>
                        )}
                        {!po.cancelledAt && (
                          <>
                            ·{" "}
                            <span className="text-red-600">
                              {operationsUi.cancelled}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {remaining !== null && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {operationsUi.progress}
                      </span>
                      <span
                        className={
                          remaining <= 0
                            ? "font-medium text-red-600"
                            : remaining <= 3
                              ? "font-medium text-amber-600"
                              : "text-slate-500"
                        }
                      >
                        {remaining <= 0
                          ? operationsUi.overdue
                          : interpolatePurchaseText(operationsUi.daysLeft, {
                              days: formatNumberByLanguage(language, remaining),
                            })}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          remaining <= 0
                            ? "bg-red-500"
                            : remaining <= 3
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(5, 100 - remaining * 5))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {hasMore && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 text-xs"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? ui.common.loading : ui.common.loadMore}
              </Button>
              <div ref={loadMoreRef} className="h-2 w-full" />
            </div>
          )}
        </div>
      )}
      </>
      ) : null}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Create PO Wizard
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={isCreateOpen}
        onClose={closeCreateSheet}
        title={ui.create.title}
        description={`${ui.create.stepLabel} ${wizardStep}/3`}
        closeOnBackdrop={false}
        disabled={isSubmitting}
        footer={
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl"
            onClick={closeCreateSheet}
            disabled={isSubmitting}
          >
            {ui.common.cancel}
          </Button>
        }
      >
            {/* Step 1: Info */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-muted-foreground">
                      {ui.create.supplierNameOptional}
                    </label>
                    {supplierNameOptions.length > 0 ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => setIsSupplierPickerOpen((current) => !current)}
                      >
                        {isSupplierPickerOpen
                          ? ui.create.hideSuppliers
                          : ui.create.allSuppliers}
                      </button>
                    ) : null}
                  </div>
                  <input
                    className={fieldClassName}
                    value={supplierName}
                    onFocus={() => {
                      if (supplierNameOptions.length > 0) {
                        setIsSupplierPickerOpen(true);
                      }
                    }}
                    onChange={(e) => {
                      setSupplierName(e.target.value);
                      if (supplierNameOptions.length > 0) {
                        setIsSupplierPickerOpen(true);
                      }
                    }}
                    placeholder={ui.create.supplierPlaceholder}
                  />
                  {supplierNameOptions.length > 0 ? (
                    <p className="text-[11px] text-slate-500">
                      {ui.create.supplierSearchHint}
                    </p>
                  ) : null}
                  {supplierNameOptions.length > 0 && (isSupplierPickerOpen || supplierName) ? (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {visibleSupplierPickerOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          {ui.create.supplierSearchEmpty}
                        </p>
                      ) : (
                        visibleSupplierPickerOptions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setSupplierName(name);
                              setIsSupplierPickerOpen(false);
                            }}
                          >
                            {name}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    {ui.create.contactOptional}
                  </label>
                  <input
                    className={fieldClassName}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    enterKeyHint="next"
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    placeholder="020-xxxx-xxxx"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    {ui.create.purchaseCurrency}
                  </label>
                  <div className="flex gap-2">
                    {(["LAK", "THB", "USD"] as StoreCurrency[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          purchaseCurrency === c
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          setPurchaseCurrency(c);
                          if (c === storeCurrency) {
                            setExchangeRate("");
                          }
                        }}
                      >
                        {currencySymbol(c)} {c}
                      </button>
                    ))}
                  </div>
                </div>
                {purchaseCurrency !== storeCurrency && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      {ui.create.actualExchangeRateOptional}
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="decimal"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder={interpolatePurchaseText(
                        ui.create.exchangeRatePlaceholder,
                        { purchase: purchaseCurrency, store: storeCurrency },
                      )}
                    />
                    <p className="text-[11px] text-slate-500">
                      {ui.create.exchangeRateHelp}
                    </p>
                  </div>
                )}
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={() => {
                    setIsSupplierPickerOpen(false);
                    setWizardStep(2);
                  }}
                >
                  {ui.create.next}
                </Button>
              </div>
            )}

            {/* Step 2: Items */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                {/* Product search */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-muted-foreground">
                      {ui.create.addProducts}
                    </label>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        const nextOpen = !isProductPickerOpen;
                        setIsProductPickerOpen(nextOpen);
                        if (nextOpen) {
                          void loadProducts();
                        }
                      }}
                    >
                      {isProductPickerOpen
                        ? ui.create.hideProducts
                        : ui.create.allProducts}
                    </button>
                  </div>
                  <input
                    className={fieldClassName}
                    value={productSearch}
                    onFocus={() => {
                      setIsProductPickerOpen(true);
                      void loadProducts();
                    }}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setIsProductPickerOpen(true);
                    }}
                    placeholder={ui.create.searchProductsPlaceholder}
                  />
                  <p className="text-[11px] text-slate-500">
                    {ui.create.searchProductsHint}
                  </p>
                  {(isProductPickerOpen || productSearch) && (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {loadingProducts ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          {ui.common.loading}
                        </p>
                      ) : visibleProductPickerOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          {productSearch
                            ? ui.create.noMatchingProducts
                            : ui.create.noProductsAvailable}
                        </p>
                      ) : (
                        visibleProductPickerOptions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() =>
                              addItem({ id: p.id, name: p.name })
                            }
                          >
                            <span className="font-medium">{p.name}</span>
                            <span className="ml-2 text-xs text-slate-400">
                              {p.sku}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Item list */}
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                    {ui.create.noProductsAdded}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.productId}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-slate-900">
                            {item.productName}
                          </p>
                          <button
                            type="button"
                            className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                            onClick={() => removeItem(item.productId)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-slate-500">
                              {ui.create.quantity}
                            </label>
                            <input
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                              type="number"
                              inputMode="numeric"
                              value={item.qtyOrdered}
                              onChange={(e) =>
                                updateItem(
                                  item.productId,
                                  "qtyOrdered",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500">
                              {interpolatePurchaseText(ui.create.costPerCurrency, {
                                currency: currencySymbol(purchaseCurrency),
                              })}
                            </label>
                            <input
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                              type="number"
                              inputMode="numeric"
                              value={item.unitCostPurchase}
                              placeholder="0"
                              onChange={(e) =>
                                updateItem(
                                  item.productId,
                                  "unitCostPurchase",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-right text-xs text-slate-500">
                          ={" "}
                          {fmtPrice(
                            Math.round(
                              (Number(item.qtyOrdered) || 0) *
                                (Number(item.unitCostPurchase) || 0) *
                                effectiveRate,
                            ),
                            storeCurrency,
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setWizardStep(1)}
                  >
                    {ui.create.back}
                  </Button>
                  <Button
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setWizardStep(3)}
                    disabled={items.length === 0}
                  >
                    {ui.create.next}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Costs + Summary */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      {interpolatePurchaseText(ui.create.shippingCostLabel, {
                        currency: currencySymbol(storeCurrency),
                      })}
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="numeric"
                      value={shippingCost}
                      placeholder="0"
                      onChange={(e) => setShippingCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      {interpolatePurchaseText(ui.create.otherCostLabel, {
                        currency: currencySymbol(storeCurrency),
                      })}
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="numeric"
                      value={otherCost}
                      placeholder="0"
                      onChange={(e) => setOtherCost(e.target.value)}
                    />
                  </div>
                </div>
                {Number(otherCost) > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      {ui.create.otherCostNoteLabel}
                    </label>
                    <input
                      className={fieldClassName}
                      value={otherCostNote}
                      onChange={(e) => setOtherCostNote(e.target.value)}
                      placeholder={ui.create.otherCostNotePlaceholder}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2 min-w-0">
                    <label className="text-xs text-muted-foreground">
                      {ui.create.expectedReceiveDateOptional}
                    </label>
                    <PurchaseDatePickerField
                      language={language}
                      value={expectedAt}
                      onChange={setExpectedAt}
                      triggerClassName={`${fieldClassName} flex items-center justify-between gap-2 text-left`}
                      ariaLabel={ui.create.expectedReceiveAria}
                    />
                    <p className="text-[11px] text-slate-500">
                      {ui.create.expectedReceiveHelp}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "TODAY")}
                      >
                        {ui.common.today}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "PLUS_7")}
                      >
                        {ui.common.plusSevenDays}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "END_OF_MONTH")}
                      >
                        {ui.common.endOfMonth}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "CLEAR")}
                      >
                        {ui.common.clear}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 min-w-0">
                    <label className="text-xs text-muted-foreground">
                      {ui.create.dueDateLabel}
                    </label>
                    <PurchaseDatePickerField
                      language={language}
                      value={dueDate}
                      onChange={setDueDate}
                      triggerClassName={`${fieldClassName} flex items-center justify-between gap-2 text-left`}
                      ariaLabel={ui.create.dueDateAria}
                    />
                    <p className="text-[11px] text-slate-500">
                      {ui.create.dueDateHelp}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "TODAY")}
                      >
                        {ui.common.today}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "PLUS_7")}
                      >
                        {ui.common.plusSevenDays}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "END_OF_MONTH")}
                      >
                        {ui.common.endOfMonth}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "CLEAR")}
                      >
                        {ui.common.clear}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    {ui.create.noteOptional}
                  </label>
                  <input
                    className={fieldClassName}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={ui.create.notePlaceholder}
                  />
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {ui.create.summary}
                  </p>
                  {purchaseCurrency !== storeCurrency && !hasExchangeRateInput && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {ui.create.pendingRateSummary}
                    </p>
                  )}
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-600">
                          {interpolatePurchaseText(ui.create.productsCount, {
                            count: items.length,
                          })}
                        </span>
                      <span className="font-medium">
                        {fmtPrice(itemsTotalBase, storeCurrency)}
                      </span>
                    </div>
                    {shipping > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          {ui.create.shipping}
                        </span>
                        <span>{fmtPrice(shipping, storeCurrency)}</span>
                      </div>
                    )}
                    {other > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          {ui.create.otherCosts}
                        </span>
                        <span>{fmtPrice(other, storeCurrency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                      <span>{ui.create.grandTotal}</span>
                      <span>{fmtPrice(grandTotal, storeCurrency)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() => setWizardStep(2)}
                  disabled={isSubmitting}
                >
                  {ui.create.back}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl text-xs"
                    onClick={() => submitPO(false)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-1 h-3.5 w-3.5" />
                    )}
                    {ui.create.saveDraft}
                  </Button>
                  <Button
                    className="h-11 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    onClick={() => submitPO(true)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    {ui.create.receiveNow}
                  </Button>
                </div>
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={async () => {
                    if (items.length === 0) {
                      toast.error(ui.errors.atLeastOneItem);
                      return;
                    }
                    setIsSubmitting(true);
                    try {
                      const res = await authFetch("/api/stock/purchase-orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          supplierName: supplierName || undefined,
                          supplierContact: supplierContact || undefined,
                          purchaseCurrency,
                          exchangeRate:
                            purchaseCurrency === storeCurrency
                              ? 1
                              : hasExchangeRateInput
                                ? rate
                                : undefined,
                          shippingCost: shipping,
                          otherCost: other,
                          otherCostNote: otherCostNote || undefined,
                          note: note || undefined,
                          expectedAt: expectedAt || undefined,
                          dueDate: dueDate || undefined,
                          receiveImmediately: false,
                          items: items.map((i) => ({
                            productId: i.productId,
                            qtyOrdered: Number(i.qtyOrdered) || 1,
                            unitCostPurchase: Number(i.unitCostPurchase) || 0,
                          })),
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        toast.error(data?.message ?? ui.create.createFailed);
                        return;
                      }
                      // Now set it to ORDERED
                      const poId = data.purchaseOrder.id;
                      await authFetch(`/api/stock/purchase-orders/${poId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "ORDERED" }),
                      });
                      toast.success(
                        ui.create.createAndConfirmSuccess,
                      );
                      forceCloseCreateSheet();
                      await reloadFirstPage();
                      router.refresh();
                    } catch {
                      toast.error(ui.errors.connectionRetry);
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="mr-1 h-3.5 w-3.5" />
                  )}
                  {ui.create.confirmOrder}
                </Button>
              </div>
            )}
      </SlideUpSheet>

      {isCreateOpen && isCreateCloseConfirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label={ui.create.closeConfirmBackdropAria}
            className="absolute inset-0 bg-slate-900/55"
            onClick={() => setIsCreateCloseConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ui.create.closeConfirmDialogAria}
            className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          >
            <p className="text-sm font-semibold text-slate-900">
              {ui.create.closeConfirmTitle}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              {ui.create.closeConfirmBody}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg text-xs"
                onClick={() => setIsCreateCloseConfirmOpen(false)}
              >
                {ui.create.closeConfirmBack}
              </Button>
              <Button
                type="button"
                className="h-9 rounded-lg bg-red-600 text-xs text-white hover:bg-red-700"
                onClick={forceCloseCreateSheet}
              >
                {ui.create.closeConfirmDiscard}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * PO Detail Sheet (quick actions)
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <PODetailSheet
        poId={selectedPO}
        language={language}
        storeCurrency={storeCurrency}
        storeLogoUrl={storeLogoUrl}
        pdfConfig={pdfConfig}
        getCachedPoDetail={getCachedPoDetail}
        loadPoDetail={loadPoDetail}
        onCacheUpdate={upsertPoDetailCache}
        onRefreshList={reloadFirstPage}
        onClose={() => setSelectedPO(null)}
        onUpdateStatus={updateStatus}
      />
    </div>
  );
}

/* ── PO Detail Sheet ── */
function PODetailSheet({
  poId,
  language,
  storeCurrency,
  storeLogoUrl,
  pdfConfig,
  getCachedPoDetail,
  loadPoDetail,
  onCacheUpdate,
  onRefreshList,
  onClose,
  onUpdateStatus,
}: {
  poId: string | null;
  language: AppLanguage;
  storeCurrency: StoreCurrency;
  storeLogoUrl?: string | null;
  pdfConfig?: Partial<PoPdfConfig>;
  getCachedPoDetail: (poId: string) => PurchaseOrderDetail | null;
  loadPoDetail: (
    poId: string,
    options?: {
      preferCache?: boolean;
    },
  ) => Promise<PoDetailLoadResult>;
  onCacheUpdate: (purchaseOrder: PurchaseOrderDetail) => void;
  onRefreshList: () => Promise<void>;
  onClose: () => void;
  onUpdateStatus: (
    poId: string,
    status: "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED",
  ) => void;
}) {
  const router = useRouter();
  const ui = purchaseTextByLanguage[language];
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isFinalizeRateMode, setIsFinalizeRateMode] = useState(false);
  const [isFinalizingRate, setIsFinalizingRate] = useState(false);
  const [finalRateInput, setFinalRateInput] = useState("");
  const [finalRateNoteInput, setFinalRateNoteInput] = useState("");
  const [isSettleMode, setIsSettleMode] = useState(false);
  const [isSettlingPayment, setIsSettlingPayment] = useState(false);
  const [isApplyExtraCostMode, setIsApplyExtraCostMode] = useState(false);
  const [isApplyingExtraCost, setIsApplyingExtraCost] = useState(false);
  const [extraCostShippingInput, setExtraCostShippingInput] = useState("");
  const [extraCostOtherInput, setExtraCostOtherInput] = useState("");
  const [extraCostOtherNoteInput, setExtraCostOtherNoteInput] = useState("");
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState("");
  const [settlePaidAtInput, setSettlePaidAtInput] = useState("");
  const [settleReferenceInput, setSettleReferenceInput] = useState("");
  const [settleNoteInput, setSettleNoteInput] = useState("");
  const [editForm, setEditForm] = useState({
    supplierName: "",
    supplierContact: "",
    purchaseCurrency: storeCurrency,
    exchangeRate: "1",
    shippingCost: "0",
    otherCost: "0",
    otherCostNote: "",
    note: "",
    expectedAt: "",
    dueDate: "",
    trackingInfo: "",
    items: [] as { productId: string; productName: string; qtyOrdered: string; unitCostPurchase: string }[],
  });

  const getEditDateShortcutValue = useCallback(
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

  const applyEditDateShortcut = useCallback(
    (
      field: "expectedAt" | "dueDate",
      shortcut: "TODAY" | "PLUS_7" | "END_OF_MONTH" | "CLEAR",
    ) => {
      const value = getEditDateShortcutValue(shortcut);
      setEditForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [getEditDateShortcutValue],
  );

  const refreshDetail = useCallback(
    async (targetPoId: string, keepExisting: boolean): Promise<void> => {
      const result = await loadPoDetail(targetPoId, { preferCache: false });
      if (result.purchaseOrder) {
        setPo(result.purchaseOrder);
        setDetailError(null);
        return;
      }
      if (!keepExisting) {
        setPo(null);
        setDetailError(
          result.error ?? ui.errors.loadPoDetailFailed,
        );
      }
    },
    [loadPoDetail, ui.errors.loadPoDetailFailed],
  );

  useEffect(() => {
    if (!poId) {
      setLoading(false);
      setPo(null);
      setDetailError(null);
      setIsEditMode(false);
      setIsFinalizeRateMode(false);
      setIsSettleMode(false);
      setIsApplyExtraCostMode(false);
      setFinalRateInput("");
      setFinalRateNoteInput("");
      setSettleAmountInput("");
      setSettlePaidAtInput("");
      setSettleReferenceInput("");
      setSettleNoteInput("");
      setExtraCostShippingInput("");
      setExtraCostOtherInput("");
      setExtraCostOtherNoteInput("");
      setReversingPaymentId(null);
      return;
    }

    let cancelled = false;
    const cached = getCachedPoDetail(poId);
    setIsEditMode(false);
    setIsFinalizeRateMode(false);
    setIsSettleMode(false);
    setIsApplyExtraCostMode(false);
    setReversingPaymentId(null);
    setDetailError(null);

    if (cached) {
      setPo(cached);
      setLoading(false);
      void loadPoDetail(poId, { preferCache: false }).then((result) => {
        if (cancelled || !result.purchaseOrder) return;
        setPo(result.purchaseOrder);
        setDetailError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    setPo(null);
    setLoading(true);
    void loadPoDetail(poId).then((result) => {
      if (cancelled) return;
      if (result.purchaseOrder) {
        setPo(result.purchaseOrder);
        setDetailError(null);
      } else {
        setPo(null);
        setDetailError(
          result.error ?? ui.errors.loadPoDetailFailed,
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [getCachedPoDetail, loadPoDetail, poId, ui.errors.loadPoDetailFailed]);

  const handleStatusChange = async (
    newStatus: "ORDERED" | "SHIPPED" | "RECEIVED" | "CANCELLED",
  ) => {
    if (!po) return;
    setUpdating(true);
    await onUpdateStatus(po.id, newStatus);
    setUpdating(false);
  };

  const retryLoadDetail = useCallback(async () => {
    if (!poId) return;
    setLoading(true);
    setDetailError(null);
    await refreshDetail(poId, false);
    setLoading(false);
  }, [poId, refreshDetail]);

  const startFinalizeRate = useCallback(() => {
    if (!po) return;
    setFinalRateInput(
      po.exchangeRate > 1 || po.purchaseCurrency === storeCurrency
        ? String(po.exchangeRate)
        : "",
    );
    setFinalRateNoteInput("");
    setIsFinalizeRateMode(true);
  }, [po, storeCurrency]);

  const submitFinalizeRate = useCallback(async () => {
    if (!po) return;
    const nextRate = Number(finalRateInput);
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      toast.error(ui.detail.finalRateInvalid);
      return;
    }

    setIsFinalizingRate(true);
    try {
      const res = await authFetch(
        `/api/stock/purchase-orders/${po.id}/finalize-rate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `po-rate-lock-${po.id}-${Date.now()}`,
          },
          body: JSON.stringify({
            exchangeRate: nextRate,
            note: finalRateNoteInput || undefined,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            purchaseOrder?: PurchaseOrderDetail;
          }
        | null;
      if (!res.ok) {
        toast.error(
          data?.message ?? ui.detail.finalizeRateFailed,
        );
        return;
      }

      const updatedPo = data?.purchaseOrder;
      if (updatedPo) {
        setPo(updatedPo);
        onCacheUpdate(updatedPo);
      }
      setIsFinalizeRateMode(false);
      setFinalRateNoteInput("");
      toast.success(ui.detail.finalizeRateSuccess);
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error(ui.errors.connectionRetry);
    } finally {
      setIsFinalizingRate(false);
    }
  }, [
    finalRateInput,
    finalRateNoteInput,
    onCacheUpdate,
    onRefreshList,
    po,
    router,
    ui.detail.finalRateInvalid,
    ui.detail.finalizeRateFailed,
    ui.detail.finalizeRateSuccess,
    ui.errors.connectionRetry,
  ]);

  const startSettlePayment = useCallback(() => {
    if (!po) return;
    const today = new Date().toISOString().slice(0, 10);
    setSettleAmountInput(String(Math.max(0, po.outstandingBase)));
    setSettlePaidAtInput(today);
    setSettleReferenceInput("");
    setSettleNoteInput("");
    setIsSettleMode(true);
  }, [po]);

  const submitSettlePayment = useCallback(async () => {
    if (!po) return;
    const amountBase = Math.round(Number(settleAmountInput));
    if (!Number.isFinite(amountBase) || amountBase <= 0) {
      toast.error(ui.detail.paymentAmountInvalid);
      return;
    }
    if (amountBase > po.outstandingBase) {
      toast.error(ui.detail.paymentExceedsOutstanding);
      return;
    }
    setIsSettlingPayment(true);
    try {
      const res = await authFetch(`/api/stock/purchase-orders/${po.id}/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `po-settle-${po.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          amountBase,
          paidAt: settlePaidAtInput || undefined,
          paymentReference: settleReferenceInput || undefined,
          paymentNote: settleNoteInput || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            purchaseOrder?: PurchaseOrderDetail;
          }
        | null;

      if (!res.ok) {
        toast.error(
          data?.message ?? ui.detail.settleFailed,
        );
        return;
      }

      const updatedPo = data?.purchaseOrder;
      if (updatedPo) {
        setPo(updatedPo);
        onCacheUpdate(updatedPo);
      }
      setIsSettleMode(false);
      toast.success(ui.detail.settleSuccess);
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error(ui.errors.connectionRetry);
    } finally {
      setIsSettlingPayment(false);
    }
  }, [
    onCacheUpdate,
    onRefreshList,
    po,
    router,
    settleAmountInput,
    settleNoteInput,
    settlePaidAtInput,
    settleReferenceInput,
    ui.detail.paymentAmountInvalid,
    ui.detail.paymentExceedsOutstanding,
    ui.detail.settleFailed,
    ui.detail.settleSuccess,
    ui.errors.connectionRetry,
  ]);

  const startApplyExtraCost = useCallback(() => {
    if (!po) return;
    setExtraCostShippingInput(String(Math.max(0, po.shippingCost)));
    setExtraCostOtherInput(String(Math.max(0, po.otherCost)));
    setExtraCostOtherNoteInput(po.otherCostNote ?? "");
    setIsApplyExtraCostMode(true);
  }, [po]);

  const submitApplyExtraCost = useCallback(async () => {
    if (!po) return;
    const shippingCost = Math.round(Number(extraCostShippingInput));
    const otherCost = Math.round(Number(extraCostOtherInput));

    if (!Number.isFinite(shippingCost) || shippingCost < 0) {
      toast.error(ui.detail.shippingCostInvalid);
      return;
    }
    if (!Number.isFinite(otherCost) || otherCost < 0) {
      toast.error(ui.detail.otherCostInvalid);
      return;
    }

    setIsApplyingExtraCost(true);
    try {
      const res = await authFetch(
        `/api/stock/purchase-orders/${po.id}/apply-extra-cost`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `po-extra-cost-${po.id}-${Date.now()}`,
          },
          body: JSON.stringify({
            shippingCost,
            otherCost,
            otherCostNote: extraCostOtherNoteInput || undefined,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            purchaseOrder?: PurchaseOrderDetail;
          }
        | null;
      if (!res.ok) {
        toast.error(
          data?.message ?? ui.detail.updateCostsFailed,
        );
        return;
      }
      if (data?.purchaseOrder) {
        setPo(data.purchaseOrder);
        onCacheUpdate(data.purchaseOrder);
      }
      setIsApplyExtraCostMode(false);
      toast.success(ui.detail.updateCostsSuccess);
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error(ui.errors.connectionRetry);
    } finally {
      setIsApplyingExtraCost(false);
    }
  }, [
    extraCostOtherInput,
    extraCostOtherNoteInput,
    extraCostShippingInput,
    onCacheUpdate,
    onRefreshList,
    po,
    router,
    ui.detail.otherCostInvalid,
    ui.detail.shippingCostInvalid,
    ui.detail.updateCostsFailed,
    ui.detail.updateCostsSuccess,
    ui.errors.connectionRetry,
  ]);

  const reversePayment = useCallback(
    async (paymentId: string) => {
      if (!po) return;
      setReversingPaymentId(paymentId);
      try {
        const res = await authFetch(
          `/api/stock/purchase-orders/${po.id}/payments/${paymentId}/reverse`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `po-payment-reverse-${paymentId}-${Date.now()}`,
            },
            body: JSON.stringify({}),
          },
        );
        const data = (await res.json().catch(() => null)) as
          | {
              message?: string;
              purchaseOrder?: PurchaseOrderDetail;
            }
          | null;
        if (!res.ok) {
          toast.error(
            data?.message ?? ui.detail.reversePaymentFailed,
          );
          return;
        }
        if (data?.purchaseOrder) {
          setPo(data.purchaseOrder);
          onCacheUpdate(data.purchaseOrder);
        }
        toast.success(ui.detail.reversePaymentSuccess);
        await onRefreshList();
        router.refresh();
      } catch {
        toast.error(ui.errors.connectionRetry);
      } finally {
        setReversingPaymentId(null);
      }
    },
    [
      onCacheUpdate,
      onRefreshList,
      po,
      router,
      ui.detail.reversePaymentFailed,
      ui.detail.reversePaymentSuccess,
      ui.errors.connectionRetry,
    ],
  );

  const canEditPO =
    po?.status === "DRAFT" || po?.status === "ORDERED" || po?.status === "SHIPPED";
  const canPrintPO = po?.status === "ORDERED" || po?.status === "SHIPPED" || po?.status === "RECEIVED" || po?.status === "CANCELLED";
  const isDraftEditable = po?.status === "DRAFT";
  const isExchangeRatePending =
    po?.purchaseCurrency !== storeCurrency && !po?.exchangeRateLockedAt;
  const canFinalizeExchangeRate =
    po?.status === "RECEIVED" && isExchangeRatePending;
  const canSettlePayment =
    po?.status === "RECEIVED" && (po?.outstandingBase ?? 0) > 0;
  const canApplyExtraCost =
    po?.status === "RECEIVED" && po?.paymentStatus !== "PAID";
  const extraCostShippingPreview = Math.max(
    0,
    Math.round(Number(extraCostShippingInput) || 0),
  );
  const extraCostOtherPreview = Math.max(
    0,
    Math.round(Number(extraCostOtherInput) || 0),
  );
  const extraCostGrandTotalPreview = po
    ? po.totalCostBase + extraCostShippingPreview + extraCostOtherPreview
    : 0;
  const extraCostOutstandingPreview = po
    ? extraCostGrandTotalPreview - po.totalPaidBase
    : 0;

  const startEdit = () => {
    if (!po) return;
    setEditForm({
      supplierName: po.supplierName ?? "",
      supplierContact: po.supplierContact ?? "",
      purchaseCurrency: (po.purchaseCurrency as StoreCurrency) ?? storeCurrency,
      exchangeRate: String(po.exchangeRate ?? 1),
      shippingCost: String(po.shippingCost ?? 0),
      otherCost: String(po.otherCost ?? 0),
      otherCostNote: po.otherCostNote ?? "",
      note: po.note ?? "",
      expectedAt: po.expectedAt ? po.expectedAt.slice(0, 10) : "",
      dueDate: po.dueDate ? po.dueDate.slice(0, 10) : "",
      trackingInfo: po.trackingInfo ?? "",
      items: po.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        qtyOrdered: String(item.qtyOrdered),
        unitCostPurchase: String(item.unitCostPurchase),
      })),
    });
    setIsEditMode(true);
  };

  const saveEdit = async () => {
    if (!po) return;
    if (isDraftEditable && editForm.items.length === 0) {
      toast.error(ui.detail.editRequiresItem);
      return;
    }

    setIsSavingEdit(true);
    try {
      const editRateValue = Number(editForm.exchangeRate);
      const hasEditRate =
        editForm.exchangeRate.trim().length > 0 && Number.isFinite(editRateValue) && editRateValue > 0;
      const payload = isDraftEditable
        ? {
            supplierName: editForm.supplierName || undefined,
            supplierContact: editForm.supplierContact || undefined,
            purchaseCurrency: editForm.purchaseCurrency,
            exchangeRate:
              editForm.purchaseCurrency === storeCurrency
                ? 1
                : hasEditRate
                  ? editRateValue
                  : undefined,
            shippingCost: Number(editForm.shippingCost) || 0,
            otherCost: Number(editForm.otherCost) || 0,
            otherCostNote: editForm.otherCostNote || undefined,
            note: editForm.note || undefined,
            expectedAt: editForm.expectedAt || undefined,
            dueDate: editForm.dueDate || undefined,
            trackingInfo: editForm.trackingInfo || undefined,
            items: editForm.items.map((item) => ({
              productId: item.productId,
              qtyOrdered: Number(item.qtyOrdered) || 1,
              unitCostPurchase: Number(item.unitCostPurchase) || 0,
            })),
          }
        : {
            note: editForm.note || undefined,
            expectedAt: editForm.expectedAt || undefined,
            dueDate: editForm.dueDate || undefined,
            trackingInfo: editForm.trackingInfo || undefined,
          };

      const res = await authFetch(`/api/stock/purchase-orders/${po.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          data?.message ?? ui.detail.updatePoFailed,
        );
        return;
      }

      const updatedPo = data.purchaseOrder as PurchaseOrderDetail;
      setPo(updatedPo);
      onCacheUpdate(updatedPo);
      setIsEditMode(false);
      toast.success(ui.detail.updatePoSuccess);
      router.refresh();
    } catch {
      toast.error(ui.errors.connectionRetry);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isOpen = poId !== null;
  const detailUi = {
    ...ui.detail,
    finalRateLabel: interpolatePurchaseText(ui.detail.finalRateLabel, {
      purchase: po?.purchaseCurrency ?? "-",
      store: storeCurrency,
    }),
    paymentAmountLabel: interpolatePurchaseText(ui.detail.paymentAmountLabel, {
      currency: storeCurrency,
    }),
    shippingCostLabel: interpolatePurchaseText(ui.detail.shippingCostLabel, {
      currency: storeCurrency,
    }),
    otherCostLabel: interpolatePurchaseText(ui.detail.otherCostLabel, {
      currency: storeCurrency,
    }),
  };

  return (
    <SlideUpSheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        po?.poNumber ??
        detailUi.titleFallback
      }
      disabled={
        updating ||
        isSavingEdit ||
        isFinalizingRate ||
        isSettlingPayment ||
        isApplyingExtraCost ||
        reversingPaymentId !== null
      }
    >
      <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <div className="animate-pulse space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="h-3 w-28 rounded bg-slate-200" />
                <div className="h-3 w-4/5 rounded bg-slate-200" />
              </div>
              <div className="animate-pulse space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="h-3 w-16 rounded bg-slate-200" />
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-3/4 rounded bg-slate-200" />
              </div>
            </div>
          ) : po ? (
            <>
              {/* Status + timeline */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const cfg = statusConfig[po.status as PurchaseOrderListItem["status"]];
                    const Icon = cfg?.icon ?? FileText;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg?.badgeClass ?? "bg-slate-100 text-slate-600"}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {cfg ? getPurchaseStatusLabel(language, po.status as PurchaseOrderListItem["status"]) : po.status}
                      </span>
                    );
                  })()}
                  {po.supplierName && (
                    <span className="text-xs text-slate-500">
                      · {po.supplierName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canSettlePayment &&
                    !isEditMode &&
                    !isSettleMode &&
                    !isFinalizeRateMode &&
                    !isApplyExtraCostMode && (
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg border-emerald-300 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50"
                      onClick={startSettlePayment}
                      disabled={updating || isSettlingPayment || isExchangeRatePending}
                      title={
                        isExchangeRatePending
                          ? detailUi.mustFinalizeRateBeforePayment
                          : undefined
                      }
                    >
                      <Banknote className="mr-1 h-3.5 w-3.5" />
                      {detailUi.confirmSettlePayment}
                    </Button>
                  )}
                  {canApplyExtraCost &&
                    !isEditMode &&
                    !isSettleMode &&
                    !isFinalizeRateMode &&
                    !isApplyExtraCostMode && (
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg border-sky-300 px-2.5 text-xs text-sky-700 hover:bg-sky-50"
                      onClick={startApplyExtraCost}
                      disabled={updating || isApplyingExtraCost}
                    >
                      {detailUi.updateCostsTitle}
                    </Button>
                  )}
                  {canFinalizeExchangeRate &&
                    !isEditMode &&
                    !isSettleMode &&
                    !isFinalizeRateMode &&
                    !isApplyExtraCostMode && (
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg border-amber-300 px-2.5 text-xs text-amber-700 hover:bg-amber-50"
                      onClick={startFinalizeRate}
                      disabled={updating || isFinalizingRate}
                    >
                      {detailUi.finalizeRateTitle}
                    </Button>
                  )}
                  {canEditPO &&
                    !isEditMode &&
                    !isSettleMode &&
                    !isFinalizeRateMode &&
                    !isApplyExtraCostMode && (
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg px-2.5 text-xs"
                      onClick={startEdit}
                      disabled={updating}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {detailUi.editPo}
                    </Button>
                  )}
                </div>
              </div>

              {canPrintPO && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={isGeneratingPdf}
                    onClick={async () => {
                      if (!po) return;
                      setIsGeneratingPdf(true);
                      try {
                        const { generatePoPdf } = await import("@/lib/pdf/generate-po-pdf");
                        const pdfData: POPdfData = {
                          poNumber: po.poNumber,
                          status: po.status,
                          supplierName: po.supplierName,
                          supplierContact: po.supplierContact,
                          purchaseCurrency: po.purchaseCurrency,
                          exchangeRate: po.exchangeRate,
                          shippingCost: po.shippingCost,
                          otherCost: po.otherCost,
                          otherCostNote: po.otherCostNote,
                          note: po.note,
                          createdByName: po.createdByName,
                          createdAt: po.createdAt,
                          orderedAt: po.orderedAt,
                          shippedAt: po.shippedAt,
                          receivedAt: po.receivedAt,
                          expectedAt: po.expectedAt,
                          trackingInfo: po.trackingInfo,
                          totalCostBase: po.totalCostBase,
                          storeLogoUrl: storeLogoUrl,
                          items: po.items.map((item) => ({
                            productName: item.productName,
                            productSku: item.productSku,
                            qtyOrdered: item.qtyOrdered,
                            unitCostBase: item.unitCostBase,
                          })),
                        };
                        const blob = await generatePoPdf(pdfData, storeCurrency, pdfConfig);
                        const { downloadBlob } = await import("@/lib/pdf/share-or-download");
                        downloadBlob(blob, `${po.poNumber}.pdf`);
                        toast.success(ui.detail.pdfDownloaded);
                      } catch {
                        toast.error(ui.detail.pdfGenerateFailed);
                      } finally {
                        setIsGeneratingPdf(false);
                      }
                    }}
                  >
                    {isGeneratingPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    PDF
                  </button>
                  {canNativeShare() && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={isGeneratingPdf}
                      onClick={async () => {
                        if (!po) return;
                        setIsGeneratingPdf(true);
                        try {
                          const { generatePoPdf } = await import("@/lib/pdf/generate-po-pdf");
                          const pdfData: POPdfData = {
                            poNumber: po.poNumber,
                            status: po.status,
                            supplierName: po.supplierName,
                            supplierContact: po.supplierContact,
                            purchaseCurrency: po.purchaseCurrency,
                            exchangeRate: po.exchangeRate,
                            shippingCost: po.shippingCost,
                            otherCost: po.otherCost,
                            otherCostNote: po.otherCostNote,
                            note: po.note,
                            createdByName: po.createdByName,
                            createdAt: po.createdAt,
                            orderedAt: po.orderedAt,
                            shippedAt: po.shippedAt,
                            receivedAt: po.receivedAt,
                            expectedAt: po.expectedAt,
                            trackingInfo: po.trackingInfo,
                            totalCostBase: po.totalCostBase,
                            storeLogoUrl: storeLogoUrl,
                            items: po.items.map((item) => ({
                              productName: item.productName,
                              productSku: item.productSku,
                              qtyOrdered: item.qtyOrdered,
                              unitCostBase: item.unitCostBase,
                            })),
                          };
                          const blob = await generatePoPdf(pdfData, storeCurrency, pdfConfig);
                          const { shareOrDownload } = await import("@/lib/pdf/share-or-download");
                          const result = await shareOrDownload(
                            blob,
                            `${po.poNumber}.pdf`,
                            `${detailUi.pdfDocTitle} ${po.poNumber}`,
                          );
                          if (result === "downloaded") {
                            toast.success(ui.detail.pdfDownloaded);
                          }
                        } catch {
                          toast.error(
                            ui.detail.pdfShareFailed,
                          );
                        } finally {
                          setIsGeneratingPdf(false);
                        }
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      {ui.common.share}
                    </button>
                  )}
                </div>
              )}

              {po.purchaseCurrency !== storeCurrency && (
                <div
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    isExchangeRatePending
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  <p className="font-medium">
                    {detailUi.referenceRate}: 1 {po.purchaseCurrency} = {po.exchangeRate} {storeCurrency}
                  </p>
                  <p className="mt-1">
                    {detailUi.initialRate}: 1 {po.purchaseCurrency} = {po.exchangeRateInitial} {storeCurrency}
                  </p>
                  {isExchangeRatePending ? (
                    <p className="mt-1">
                      {detailUi.rateStatusPending}
                    </p>
                  ) : (
                    <p className="mt-1">
                      {detailUi.rateStatusLocked}
                      {po.exchangeRateLockedAt
                        ? ` ${detailUi.when} ${formatDate(po.exchangeRateLockedAt)}`
                        : ""}
                      {po.exchangeRate !== po.exchangeRateInitial
                        ? ` · ${detailUi.rateDifference} ${po.exchangeRate - po.exchangeRateInitial > 0 ? "+" : ""}${po.exchangeRate - po.exchangeRateInitial}`
                        : ""}
                      {po.exchangeRateLockNote ? ` · ${po.exchangeRateLockNote}` : ""}
                    </p>
                  )}
                </div>
              )}

              {po.status === "RECEIVED" && (
                <div
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    po.paymentStatus === "PAID"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : po.paymentStatus === "PARTIAL"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <p className="font-medium">
                    {detailUi.paymentStatus}: {po.paymentStatus === "PAID"
                      ? detailUi.paid
                      : po.paymentStatus === "PARTIAL"
                        ? detailUi.partialPaid
                        : detailUi.unpaid}
                  </p>
                  <p className="mt-1">
                    {detailUi.paidAmount} {fmtPrice(po.totalPaidBase, storeCurrency)} · {detailUi.outstanding} {fmtPrice(po.outstandingBase, storeCurrency)}
                  </p>
                  {po.paymentStatus === "PAID" || po.paymentStatus === "PARTIAL" ? (
                    <p className="mt-1">
                      {po.paidAt ? `${detailUi.paidAt} ${formatDate(po.paidAt)}` : detailUi.paymentRecorded}
                      {po.paidByName ? ` · ${detailUi.by} ${po.paidByName}` : ""}
                      {po.paymentReference ? ` · ${detailUi.reference} ${po.paymentReference}` : ""}
                      {po.paymentNote ? ` · ${po.paymentNote}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1">
                      {isExchangeRatePending
                        ? detailUi.mustFinalizeRateBeforePayment
                        : detailUi.readyToSettle}
                    </p>
                  )}
                </div>
              )}

              {isFinalizeRateMode && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                    {detailUi.finalizeRateTitle}
                  </p>
                  <div className="space-y-1">
                    <label className="text-[11px] text-amber-700">
                      {detailUi.finalRateLabel}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      value={finalRateInput}
                      onChange={(event) => setFinalRateInput(event.target.value)}
                      placeholder={detailUi.finalRatePlaceholder}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-amber-700">
                      {detailUi.finalizeRateNoteLabel}
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      value={finalRateNoteInput}
                      onChange={(event) => setFinalRateNoteInput(event.target.value)}
                      placeholder={detailUi.finalizeRateNotePlaceholder}
                    />
                  </div>
                  <p className="text-[11px] text-amber-700/90">
                    {detailUi.finalizeRateHelp}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-amber-200 bg-white text-xs text-amber-700 hover:bg-amber-100"
                      onClick={() => setIsFinalizeRateMode(false)}
                      disabled={isFinalizingRate}
                    >
                      {ui.common.cancel}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 bg-amber-600 text-xs text-white hover:bg-amber-700"
                      onClick={() => {
                        void submitFinalizeRate();
                      }}
                      disabled={isFinalizingRate}
                    >
                      {isFinalizingRate ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        detailUi.confirmFinalizeRate
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isSettleMode && (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    {detailUi.settlePaymentTitle}
                  </p>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      {detailUi.paymentAmountLabel}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settleAmountInput}
                      onChange={(event) => setSettleAmountInput(event.target.value)}
                    />
                    <p className="text-[11px] text-emerald-700/90">
                      {detailUi.currentOutstanding} {fmtPrice(po.outstandingBase, storeCurrency)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      {detailUi.paymentDate}
                    </label>
                    <input
                      type="date"
                      className="po-date-input h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settlePaidAtInput}
                      onChange={(event) => setSettlePaidAtInput(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      {detailUi.paymentReferenceLabel}
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settleReferenceInput}
                      onChange={(event) => setSettleReferenceInput(event.target.value)}
                      placeholder={detailUi.paymentReferencePlaceholder}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      {detailUi.optionalNote}
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settleNoteInput}
                      onChange={(event) => setSettleNoteInput(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-100"
                      onClick={() => setIsSettleMode(false)}
                      disabled={isSettlingPayment}
                    >
                      {ui.common.cancel}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                      onClick={() => {
                        void submitSettlePayment();
                      }}
                      disabled={isSettlingPayment}
                    >
                      {isSettlingPayment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        detailUi.confirmSettlePayment
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isApplyExtraCostMode && (
                <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                    {detailUi.updateCostsTitle}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-sky-700">
                        {detailUi.shippingCostLabel}
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="h-9 w-full rounded-lg border border-sky-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300"
                        value={extraCostShippingInput}
                        onChange={(event) => setExtraCostShippingInput(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-sky-700">
                        {detailUi.otherCostLabel}
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="h-9 w-full rounded-lg border border-sky-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300"
                        value={extraCostOtherInput}
                        onChange={(event) => setExtraCostOtherInput(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-sky-700">
                      {detailUi.otherCostNoteLabel}
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-sky-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300"
                      value={extraCostOtherNoteInput}
                      onChange={(event) => setExtraCostOtherNoteInput(event.target.value)}
                      placeholder={detailUi.otherCostNotePlaceholder}
                    />
                  </div>
                  <p className="text-[11px] text-sky-700/90">
                    {detailUi.newGrandTotal} {fmtPrice(extraCostGrandTotalPreview, storeCurrency)} ·
                    {detailUi.newOutstanding}{" "}
                    {fmtPrice(Math.max(0, extraCostOutstandingPreview), storeCurrency)}
                  </p>
                  <p className="text-[11px] text-sky-700/90">
                    {detailUi.updateCostsHelp}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-sky-200 bg-white text-xs text-sky-700 hover:bg-sky-100"
                      onClick={() => setIsApplyExtraCostMode(false)}
                      disabled={isApplyingExtraCost}
                    >
                      {ui.common.cancel}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 bg-sky-600 text-xs text-white hover:bg-sky-700"
                      onClick={() => {
                        void submitApplyExtraCost();
                      }}
                      disabled={isApplyingExtraCost}
                    >
                      {isApplyingExtraCost ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        detailUi.confirmUpdate
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {po.status === "RECEIVED" && po.paymentEntries.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {detailUi.paymentHistory}
                  </p>
                  <div className="space-y-2">
                    {po.paymentEntries.map((entry) => {
                      const isReversed = po.paymentEntries.some(
                        (item) => item.reversedPaymentId === entry.id,
                      );
                      return (
                        <div
                          key={entry.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-medium text-slate-700">
                                {entry.entryType === "PAYMENT" ? detailUi.paymentEntry : detailUi.reversalEntry}
                                {" · "}
                                {entry.paidAt ? formatDate(entry.paidAt) : "-"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {entry.createdByName ? `${detailUi.by} ${entry.createdByName}` : detailUi.systemUser}
                                {entry.reference ? ` · ${detailUi.reference} ${entry.reference}` : ""}
                                {entry.note ? ` · ${entry.note}` : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={`text-sm font-semibold ${
                                  entry.entryType === "PAYMENT"
                                    ? "text-emerald-700"
                                    : "text-red-600"
                                }`}
                              >
                                {entry.entryType === "PAYMENT" ? "+" : "-"}
                                {fmtPrice(entry.amountBase, storeCurrency)}
                              </p>
                              {entry.entryType === "PAYMENT" && !isReversed ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="mt-1 h-7 border-red-200 px-2 text-[11px] text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    void reversePayment(entry.id);
                                  }}
                                  disabled={reversingPaymentId === entry.id}
                                >
                                  {reversingPaymentId === entry.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    detailUi.reverseEntry
                                  )}
                                </Button>
                              ) : null}
                              {entry.entryType === "PAYMENT" && isReversed ? (
                                <p className="mt-1 text-[10px] text-slate-500">{detailUi.reversed}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isEditMode && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {detailUi.editPo}
                  </p>

                  {isDraftEditable && (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">{ui.common.supplier}</label>
                          <input
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.supplierName}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                supplierName: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">{ui.common.contact}</label>
                          <input
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            enterKeyHint="next"
                            value={editForm.supplierContact}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                supplierContact: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">{ui.common.currency}</label>
                          <select
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.purchaseCurrency}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                purchaseCurrency: e.target.value as StoreCurrency,
                              }))
                            }
                          >
                            <option value="LAK">LAK</option>
                            <option value="THB">THB</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">{detailUi.referenceRate}</label>
                          <input
                            type="number"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.exchangeRate}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                exchangeRate: e.target.value,
                              }))
                            }
                          />
                          {editForm.purchaseCurrency !== storeCurrency && (
                            <p className="text-[10px] text-slate-500">
                              {detailUi.exchangeRateHint}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">{detailUi.shippingCostLabel}</label>
                          <input
                            type="number"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.shippingCost}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                shippingCost: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">{detailUi.otherCostLabel}</label>
                          <input
                            type="number"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                            value={editForm.otherCost}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                otherCost: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-500">{detailUi.otherCostNoteLabel}</label>
                        <input
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                          value={editForm.otherCostNote}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              otherCostNote: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">{detailUi.itemLines}</p>
                        {editForm.items.map((item, index) => (
                          <div
                            key={`${item.productId}-${index}`}
                            className="rounded-lg border border-slate-200 bg-white p-2"
                          >
                            <p className="text-xs font-medium text-slate-700">
                              {item.productName}
                            </p>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                                value={item.qtyOrdered}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    items: prev.items.map((x, i) =>
                                      i === index
                                        ? { ...x, qtyOrdered: e.target.value }
                                        : x,
                                    ),
                                  }))
                                }
                              />
                              <input
                                type="number"
                                className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                                value={item.unitCostPurchase}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    items: prev.items.map((x, i) =>
                                      i === index
                                        ? { ...x, unitCostPurchase: e.target.value }
                                        : x,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-1 min-w-0">
                      <label className="text-[11px] text-slate-500">{ui.common.expectedAt}</label>
                      <PurchaseDatePickerField
                        language={language}
                        value={editForm.expectedAt}
                        onChange={(nextValue) =>
                          setEditForm((prev) => ({ ...prev, expectedAt: nextValue }))
                        }
                        triggerClassName="h-9 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-left text-base sm:text-sm outline-none focus:ring-2 focus:ring-primary"
                        ariaLabel={detailUi.expectedDateAria}
                      />
                      <div className="flex max-w-full flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("expectedAt", "TODAY")}
                        >
                          {ui.common.today}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("expectedAt", "PLUS_7")}
                        >
                          {ui.common.plusSevenDays}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("expectedAt", "END_OF_MONTH")}
                        >
                          {ui.common.endOfMonth}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("expectedAt", "CLEAR")}
                        >
                          {ui.common.clear}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <label className="text-[11px] text-slate-500">{ui.common.dueDate}</label>
                      <PurchaseDatePickerField
                        language={language}
                        value={editForm.dueDate}
                        onChange={(nextValue) =>
                          setEditForm((prev) => ({ ...prev, dueDate: nextValue }))
                        }
                        triggerClassName="h-9 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-left text-base sm:text-sm outline-none focus:ring-2 focus:ring-primary"
                        ariaLabel={detailUi.dueDateAria}
                      />
                      <div className="flex max-w-full flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("dueDate", "TODAY")}
                        >
                          {ui.common.today}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("dueDate", "PLUS_7")}
                        >
                          {ui.common.plusSevenDays}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("dueDate", "END_OF_MONTH")}
                        >
                          {ui.common.endOfMonth}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => applyEditDateShortcut("dueDate", "CLEAR")}
                        >
                          {ui.common.clear}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <label className="text-[11px] text-slate-500">{ui.common.tracking}</label>
                      <input
                        className="h-9 w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.trackingInfo}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            trackingInfo: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500">{ui.common.note}</label>
                    <input
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                      value={editForm.note}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-10 rounded-lg"
                      onClick={() => setIsEditMode(false)}
                      disabled={isSavingEdit}
                    >
                      {ui.common.cancel}
                    </Button>
                    <Button
                      className="h-10 rounded-lg"
                      onClick={saveEdit}
                      disabled={isSavingEdit}
                    >
                      {isSavingEdit ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        detailUi.saveEdit
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-1.5 text-xs">
                {po.createdAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {formatDate(po.createdAt)} {detailUi.created}
                    {po.createdByName ? ` ${detailUi.by} ${po.createdByName}` : ""}
                  </div>
                )}
                {po.orderedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {formatDate(po.orderedAt)} {detailUi.confirmedOrder}
                  </div>
                )}
                {po.shippedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {formatDate(po.shippedAt)} {detailUi.shipped}
                    {po.trackingInfo ? ` (${po.trackingInfo})` : ""}
                  </div>
                )}
                {po.receivedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {formatDate(po.receivedAt)} {detailUi.received}
                  </div>
                )}
                {po.paidAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                    {formatDate(po.paidAt)} {detailUi.paymentRecorded}
                    {po.paidByName ? ` ${detailUi.by} ${po.paidByName}` : ""}
                  </div>
                )}
                {po.expectedAt &&
                  po.status !== "RECEIVED" &&
                  po.status !== "CANCELLED" && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white" />
                      {detailUi.expectedOn} {formatDate(po.expectedAt)}
                    </div>
                  )}
                {po.dueDate && po.outstandingBase > 0 && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white" />
                    {detailUi.dueOn} {formatDate(po.dueDate)}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {detailUi.goods} ({po.items.length})
                </p>
                {po.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {item.productName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.qtyOrdered} ×{" "}
                        {fmtPrice(item.unitCostBase, storeCurrency)}
                        {item.qtyReceived > 0 &&
                          item.qtyReceived !== item.qtyOrdered && (
                            <span className="ml-1 text-amber-600">
                              ({detailUi.receivedQty} {item.qtyReceived})
                            </span>
                          )}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-slate-900">
                      {fmtPrice(
                        item.unitCostBase * item.qtyOrdered,
                        storeCurrency,
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Cost summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">{detailUi.goods}</span>
                  <span>{fmtPrice(po.totalCostBase, storeCurrency)}</span>
                </div>
                {po.shippingCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">{detailUi.shippingCostLabel}</span>
                    <span>{fmtPrice(po.shippingCost, storeCurrency)}</span>
                  </div>
                )}
                {po.otherCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">{detailUi.otherCostLabel}</span>
                    <span>{fmtPrice(po.otherCost, storeCurrency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>{ui.common.total}</span>
                  <span>
                    {fmtPrice(
                      po.totalCostBase + po.shippingCost + po.otherCost,
                      storeCurrency,
                    )}
                  </span>
                </div>
              </div>

              {po.note && (
                <p className="text-xs text-slate-500">📝 {po.note}</p>
              )}

              {/* Action buttons by status */}
              {!isEditMode && (
                <>
                  {po.status === "DRAFT" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => handleStatusChange("CANCELLED")}
                      disabled={updating}
                    >
                        {ui.common.cancel}
                      </Button>
                      <Button
                        className="h-11 rounded-xl text-xs"
                        onClick={() => handleStatusChange("ORDERED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          detailUi.confirmOrder
                        )}
                      </Button>
                    </div>
                  )}
                  {po.status === "ORDERED" && (
                    <div className="space-y-2">
                      <Button
                        className="h-11 w-full rounded-xl text-xs"
                        onClick={() => handleStatusChange("SHIPPED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Truck className="mr-1 h-3.5 w-3.5" />
                            {detailUi.supplierShipped}
                          </>
                        )}
                      </Button>
                      <Button
                        className="h-11 w-full rounded-xl bg-emerald-600 text-xs hover:bg-emerald-700"
                        onClick={() => handleStatusChange("RECEIVED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Package className="mr-1 h-3.5 w-3.5" />
                            {detailUi.receiveGoods}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  {po.status === "SHIPPED" && (
                    <div className="space-y-2">
                      <Button
                        className="h-11 w-full rounded-xl bg-emerald-600 text-xs hover:bg-emerald-700"
                        onClick={() => handleStatusChange("RECEIVED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Package className="mr-1 h-3.5 w-3.5" />
                            {detailUi.receiveGoods}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 w-full rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => handleStatusChange("CANCELLED")}
                        disabled={updating}
                      >
                        {ui.common.cancel}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-slate-400">
                {detailError ??
                  detailUi.emptyData}
              </p>
              {poId && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    void retryLoadDetail();
                  }}
                >
                  {ui.common.retry}
                </Button>
              )}
            </div>
          )}
      </div>
    </SlideUpSheet>
  );
}
