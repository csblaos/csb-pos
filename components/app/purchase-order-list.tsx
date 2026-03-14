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

function kpiShortcutDefaultLabel(shortcut: KpiShortcut): string {
  if (shortcut === "OPEN_PO") return "Open PO";
  if (shortcut === "PENDING_RATE") return "Month-End";
  if (shortcut === "OVERDUE_AP") return "Overdue AP";
  return "Outstanding AP";
}

function getShortcutDescription(language: AppLanguage, shortcut: KpiShortcut): string {
  const labels = {
    lo: {
      OPEN_PO: "Open PO: ກອງວຽກທີ່ຍັງເປີດຢູ່",
      PENDING_RATE: "Pending Rate: ໂຟກັດວຽກປິດເຣດປາຍເດືອນ",
      OVERDUE_AP: "Overdue AP: ລາຍການເກີນກຳນົດຈ່າຍ",
      OUTSTANDING_AP: "Outstanding: AP by Supplier + ຮຽງຕາມຍອດຄ້າງສູງສຸດ",
    },
    th: {
      OPEN_PO: "Open PO: กรองเฉพาะงานที่ยังเปิด",
      PENDING_RATE: "Pending Rate: โฟกัสงานปิดเรทปลายเดือน",
      OVERDUE_AP: "Overdue AP: รายการเจ้าหนี้เลยกำหนด",
      OUTSTANDING_AP: "Outstanding: AP by Supplier + เรียงยอดค้างมากสุด",
    },
    en: {
      OPEN_PO: "Open PO: filter only active purchasing work",
      PENDING_RATE: "Pending Rate: focus on month-end rate finalization",
      OVERDUE_AP: "Overdue AP: suppliers past due",
      OUTSTANDING_AP: "Outstanding: AP by supplier sorted by highest balance",
    },
  } as const;
  return labels[language][shortcut];
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
      loadPoDetailFailed: "ໂຫຼດລາຍລະອຽດໃບສັ່ງຊື້ບໍ່ສຳເລັດ",
      poNotFound: "ບໍ່ພົບຂໍ້ມູນໃບສັ່ງຊື້",
      connectionRetry: "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່",
      loadPoListFailed: "ໂຫຼດລາຍການໃບສັ່ງຊື້ບໍ່ສຳເລັດ",
      invalidPoList: "ຮູບແບບຂໍ້ມູນໃບສັ່ງຊື້ບໍ່ຖືກຕ້ອງ",
      loadPendingRateFailed: "ໂຫຼດຄິວລໍຖ້າປິດເຣດບໍ່ສຳເລັດ",
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
      loadPoDetailFailed: "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ",
      poNotFound: "ไม่พบข้อมูลใบสั่งซื้อ",
      connectionRetry: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
      loadPoListFailed: "โหลดรายการใบสั่งซื้อไม่สำเร็จ",
      invalidPoList: "รูปแบบข้อมูลใบสั่งซื้อไม่ถูกต้อง",
      loadPendingRateFailed: "โหลดคิวรอปิดเรทไม่สำเร็จ",
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
      loadPoDetailFailed: "Unable to load purchase order details",
      poNotFound: "Purchase order not found",
      connectionRetry: "Unable to connect. Please try again.",
      loadPoListFailed: "Unable to load purchase orders",
      invalidPoList: "Invalid purchase order payload",
      loadPendingRateFailed: "Unable to load the pending-rate queue",
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
      loadPoDetailFailed: string;
      poNotFound: string;
      connectionRetry: string;
      loadPoListFailed: string;
      invalidPoList: string;
      loadPendingRateFailed: string;
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
    const defaultLabel = kpiShortcutDefaultLabel(activeKpiShortcut);
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
  }, [activeKpiShortcut, ui.common.presetSaved, ui.common.savePresetPrompt]);

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
      toast.error("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ");
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
        toast.error(
          data?.message ??
            (language === "en"
              ? "Failed to create purchase order"
              : language === "lo"
                ? "ສ້າງໃບສັ່ງຊື້ບໍ່ສຳເລັດ"
                : "สร้างใบสั่งซื้อไม่สำเร็จ"),
        );
        return;
      }
      toast.success(
        receiveImmediately
          ? language === "en"
            ? "Purchase order created and received"
            : language === "lo"
              ? "ສ້າງໃບສັ່ງຊື້ແລະຮັບສິນຄ້າແລ້ວ"
              : "สร้างใบสั่งซื้อ + รับสินค้าเรียบร้อย"
          : language === "en"
            ? "Purchase order created"
            : language === "lo"
              ? "ສ້າງໃບສັ່ງຊື້ແລ້ວ"
              : "สร้างใบสั่งซื้อเรียบร้อย",
      );
      if (
        data?.purchaseOrder?.purchaseCurrency &&
        data.purchaseOrder.purchaseCurrency !== storeCurrency &&
        !data.purchaseOrder.exchangeRateLockedAt
      ) {
        toast(
          language === "en"
            ? "This PO still needs final exchange rate confirmation later"
            : language === "lo"
              ? "PO ນີ້ຍັງຕ້ອງປິດເຣດຈິງໃນພາຍຫຼັງ"
              : "PO นี้อยู่สถานะรอปิดเรท สามารถปิดเรทจริงได้ภายหลัง",
          {
          icon: "🧾",
          },
        );
      }
      forceCloseCreateSheet();
      await reloadFirstPage();
      router.refresh();
    } catch {
      toast.error(
        language === "en"
          ? "Connection failed. Please try again."
          : language === "lo"
            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"
            : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
      );
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
        toast.error(
          data?.message ??
            (language === "en"
              ? "Failed to update status"
              : language === "lo"
                ? "ອັບເດດສະຖານະບໍ່ສຳເລັດ"
                : "อัปเดตสถานะไม่สำเร็จ"),
        );
        return;
      }
      toast.success(
        language === "en"
          ? `Status updated to "${purchaseStatusLabel(status)}"`
          : language === "lo"
            ? `ອັບເດດສະຖານະເປັນ "${purchaseStatusLabel(status)}" ແລ້ວ`
            : `อัปเดตสถานะเป็น "${purchaseStatusLabel(status)}" เรียบร้อย`,
      );
      invalidatePoDetailCache(poId);
      await reloadFirstPage();
      setSelectedPO(null);
      router.refresh();
    } catch {
      toast.error(
        language === "en"
          ? "Connection failed"
          : language === "lo"
            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
            : "เชื่อมต่อไม่สำเร็จ",
      );
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
              Open PO
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {workspaceSummary.openPoCount.toLocaleString("th-TH")}
            </p>
            <p className="text-[11px] text-slate-500">{t("stock.purchase.openPo")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Pending Rate
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {workspaceSummary.pendingRateCount.toLocaleString("th-TH")}
            </p>
            <p className="text-[11px] text-slate-500">{t("stock.purchase.pendingRate")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Overdue AP
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {workspaceSummary.overduePoCount.toLocaleString("th-TH")}
            </p>
            <p className="text-[11px] text-slate-500">
              {t("stock.purchase.overdueAp", {
                count: formatNumberByLanguage(language, workspaceSummary.dueSoonPoCount),
              })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Outstanding
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
              {language === "en"
                ? "Applied filter:"
                : language === "lo"
                  ? "ຕົວກອງທີ່ໃຊ້:"
                  : "ตัวกรองที่ใช้:"}{" "}
              {activeKpiShortcutLabel}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={saveCurrentShortcutPreset}
              >
                {language === "en"
                  ? "Save preset"
                  : language === "lo"
                    ? "ບັນທຶກ preset"
                    : "บันทึก preset นี้"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={clearKpiShortcut}
              >
                {language === "en"
                  ? "Clear quick filter"
                  : language === "lo"
                    ? "ລ້າງຕົວກອງດ່ວນ"
                    : "ล้างตัวกรองด่วน"}
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
                    language === "en"
                      ? `Remove preset ${preset.label}`
                      : language === "lo"
                        ? `ລຶບ preset ${preset.label}`
                        : `ลบ preset ${preset.label}`
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
          {language === "en"
            ? "Workspace"
            : language === "lo"
              ? "ໂໝດການເຮັດວຽກ"
              : "โหมดการทำงาน"}
        </p>
        <div className="mt-1 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              {
                id: "OPERATIONS" as PurchaseWorkspace,
                label:
                  language === "en"
                    ? "PO Operations"
                    : language === "lo"
                      ? "ວຽກ PO"
                      : "PO Operations",
                icon: ShoppingCart,
                desc:
                  language === "en"
                    ? "Create and track POs"
                    : language === "lo"
                      ? "ສ້າງ/ຕິດຕາມສະຖານະ PO"
                      : "สร้าง/ติดตามสถานะ PO",
                badge: workspaceSummary.openPoCount,
              },
              {
                id: "MONTH_END" as PurchaseWorkspace,
                label:
                  language === "en"
                    ? "Month-End Close"
                    : language === "lo"
                      ? "ປິດງວດປາຍເດືອນ"
                      : "Month-End Close",
                icon: Banknote,
                desc:
                  language === "en"
                    ? "Finalize rate and settle"
                    : language === "lo"
                      ? "ປິດເຣດແລະຊຳລະປາຍເດືອນ"
                      : "ปิดเรทและชำระปลายเดือน",
                badge: workspaceSummary.pendingRateCount,
              },
              {
                id: "SUPPLIER_AP" as PurchaseWorkspace,
                label:
                  language === "en"
                    ? "AP by Supplier"
                    : language === "lo"
                      ? "AP ຕາມຊັບພລາຍເອີ"
                      : "AP by Supplier",
                icon: FileText,
                desc: "statement/filter/export",
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
                    {workspace.badge.toLocaleString("th-TH")}
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
              {language === "en"
                ? "Pending rate-finalization queue"
                : language === "lo"
                  ? "ຄິວ PO ລໍຖ້າປິດເຣດ"
                  : "คิว PO รอปิดเรท"}
            </p>
            <p className="text-[11px] text-amber-700/90">
              {pendingRateQueue.length} รายการ
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
            {language === "en" ? "Export CSV" : language === "lo" ? "ສົ່ງອອກ CSV" : "Export CSV"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] text-amber-700">{ui.common.supplier}</label>
            <input
              className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
              placeholder={
                language === "en"
                  ? "Filter supplier"
                  : language === "lo"
                    ? "ກອງຕາມຊັບພລາຍເອີ"
                    : "กรองซัพพลายเออร์"
              }
              value={pendingSupplierFilter}
              onChange={(event) => setPendingSupplierFilter(event.target.value)}
            />
          </div>
          <div className="space-y-1 min-w-0">
            <label className="text-[11px] text-amber-700">
              {language === "en" ? "Received from" : language === "lo" ? "ຮັບຕັ້ງແຕ່" : "วันที่รับตั้งแต่"}
            </label>
            <PurchaseDatePickerField
              language={language}
              value={pendingReceivedFrom}
              onChange={setPendingReceivedFrom}
              triggerClassName="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-left text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300 flex items-center justify-between gap-2"
              placeholder="dd/mm/yyyy"
              ariaLabel={
                language === "en"
                  ? "Choose received-from date"
                  : language === "lo"
                    ? "ເລືອກວັນທີຮັບເລີ່ມຕົ້ນ"
                    : "เลือกวันที่รับตั้งแต่ในคิว PO รอปิดเรท"
              }
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "TODAY")}
              >
                {language === "en" ? "Today" : language === "lo" ? "ມື້ນີ້" : "วันนี้"}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "PLUS_7")}
              >
                {language === "en" ? "+7 days" : language === "lo" ? "+7 ມື້" : "+7 วัน"}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "END_OF_MONTH")}
              >
                {language === "en" ? "Month end" : language === "lo" ? "ສິ້ນເດືອນ" : "สิ้นเดือน"}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedFrom", "CLEAR")}
              >
                {language === "en" ? "Clear" : language === "lo" ? "ລ້າງ" : "ล้างค่า"}
              </button>
            </div>
          </div>
          <div className="space-y-1 min-w-0">
            <label className="text-[11px] text-amber-700">
              {language === "en" ? "Received to" : language === "lo" ? "ຮັບເຖິງ" : "วันที่รับถึง"}
            </label>
            <PurchaseDatePickerField
              language={language}
              value={pendingReceivedTo}
              onChange={setPendingReceivedTo}
              triggerClassName="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-left text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300 flex items-center justify-between gap-2"
              placeholder="dd/mm/yyyy"
              ariaLabel={
                language === "en"
                  ? "Choose received-to date"
                  : language === "lo"
                    ? "ເລືອກວັນທີຮັບສິ້ນສຸດ"
                    : "เลือกวันที่รับถึงในคิว PO รอปิดเรท"
              }
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "TODAY")}
              >
                {language === "en" ? "Today" : language === "lo" ? "ມື້ນີ້" : "วันนี้"}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "PLUS_7")}
              >
                {language === "en" ? "+7 days" : language === "lo" ? "+7 ມື້" : "+7 วัน"}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "END_OF_MONTH")}
              >
                {language === "en" ? "Month end" : language === "lo" ? "ສິ້ນເດືອນ" : "สิ้นเดือน"}
              </button>
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => applyPendingQueueDateShortcut("receivedTo", "CLEAR")}
              >
                {language === "en" ? "Clear" : language === "lo" ? "ລ້າງ" : "ล้างค่า"}
              </button>
            </div>
          </div>
        </div>
        {isLoadingPendingQueue ? (
          <p className="text-xs text-amber-700">
            {language === "en"
              ? "Loading pending rate-finalization queue..."
              : language === "lo"
                ? "ກຳລັງໂຫຼດຄິວລໍຖ້າປິດເຣດ..."
                : "กำลังโหลดคิวรอปิดเรท..."}
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
              {language === "en"
                ? "No purchase orders are waiting for rate finalization"
                : language === "lo"
                  ? "ບໍ່ມີ PO ທີ່ລໍຖ້າປິດເຣດຕາມເງື່ອນໄຂ"
                  : "ไม่มี PO ที่รอปิดเรทตามเงื่อนไข"}
            </p>
            <p className="text-[11px] text-slate-500">
              ลองกลับไป `PO Operations` เพื่อเช็กงานรับเข้าสินค้าหรือสร้าง PO เพิ่ม
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                onClick={() => handleWorkspaceChange("OPERATIONS")}
              >
                ไป PO Operations
              </button>
              {canCreate ? (
                <button
                  type="button"
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
                  onClick={openCreateSheet}
                >
                  สร้าง PO ใหม่
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2">
              <p className="text-[11px] text-amber-800">
                เลือกแล้ว {selectedPendingQueueIds.length}/{pendingRateQueue.length} รายการ
                {selectedPendingCurrency ? ` · สกุล ${selectedPendingCurrency}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  onClick={selectAllPendingQueue}
                  disabled={isBulkSubmitting}
                >
                {language === "en" ? "Select all" : language === "lo" ? "ເລືອກທັງໝົດ" : "เลือกทั้งหมด"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  onClick={clearPendingQueueSelection}
                  disabled={isBulkSubmitting}
                >
                {language === "en" ? "Clear" : language === "lo" ? "ລ້າງທີ່ເລືອກ" : "ล้างเลือก"}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  onClick={openBulkMonthEndMode}
                  disabled={selectedPendingQueueIds.length === 0 || isBulkSubmitting}
                >
                  {language === "en"
                    ? "Finalize rate + settle month-end"
                    : language === "lo"
                      ? "ປິດເຣດ + ຊຳລະປາຍເດືອນ"
                      : "ปิดเรท + ชำระปลายเดือน"}
                </button>
              </div>
            </div>
            {hasMixedPendingCurrencies ? (
              <p className="text-[11px] text-red-600">
                {language === "en"
                  ? "Selected items contain multiple currencies. Please finalize one currency at a time."
                  : language === "lo"
                    ? "ລາຍການທີ່ເລືອກມີຫຼາຍສະກຸນເງິນ ກະລຸນາເລືອກທີລະສະກຸນເພື່ອປິດເຣດແບບກຸ່ມ"
                    : "รายการที่เลือกมีหลายสกุลเงิน กรุณาเลือกทีละสกุลเพื่อปิดเรทแบบกลุ่ม"}
              </p>
            ) : null}
            {isBulkMonthEndMode ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-white p-3">
                <p className="text-xs font-semibold text-amber-800">
                  {language === "en"
                    ? "Bulk finalize rate + settle (month-end cycle)"
                    : language === "lo"
                      ? "ປິດເຣດ + ບັນທຶກຊຳລະແບບກຸ່ມ (ຮອບປາຍເດືອນ)"
                      : "ปิดเรท + บันทึกชำระแบบกลุ่ม (รอบบัตรปลายเดือน)"}
                </p>
                <p className="text-[11px] text-amber-700/90">
                  ระบบจะจับคู่ยอดชำระอัตโนมัติแบบครบกำหนดเก่าสุดก่อน (oldest due first)
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600">
                      อัตราแลกเปลี่ยนจริง (1 {selectedPendingCurrency ?? "-"} = ? {storeCurrency})
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
                    <label className="text-[11px] text-slate-600">วันที่ชำระ (top-up date)</label>
                    <input
                      type="date"
                      className="po-date-input h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkPaidAtInput}
                      onChange={(event) => setBulkPaidAtInput(event.target.value)}
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600">
                      ยอดชำระรวมตาม statement (ไม่บังคับ)
                    </label>
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
                      ถ้าเว้นว่าง ระบบจะชำระเต็มยอดค้างทุก PO ที่เลือก
                    </p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] text-slate-600">
                      เลขอ้างอิงรอบบัตร/รอบชำระ (บังคับ)
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkReferenceInput}
                      onChange={(event) => setBulkReferenceInput(event.target.value)}
                      placeholder="เช่น BCEL-VISA-2026-02"
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] text-slate-600">หมายเหตุ (ไม่บังคับ)</label>
                    <input
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
                      value={bulkNoteInput}
                      onChange={(event) => setBulkNoteInput(event.target.value)}
                      placeholder="เช่น top-up รอบปลายเดือน"
                      disabled={isBulkSubmitting}
                    />
                  </div>
                </div>
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50/50 p-2">
                  <p className="text-[11px] font-medium text-amber-800">
                    แผนกระทบยอดอัตโนมัติ (ก่อนกดยืนยัน)
                  </p>
                  <p className="text-[11px] text-amber-800">
                    ยอดค้างที่เลือก {fmtPrice(bulkAllocationPreview.totalOutstanding, storeCurrency)}
                    {" · "}
                    จะลงชำระ {fmtPrice(bulkAllocationPreview.plannedTotal, storeCurrency)}
                    {" · "}
                    ค้างหลังรอบนี้ {fmtPrice(bulkAllocationPreview.outstandingAfter, storeCurrency)}
                  </p>
                  {bulkAllocationPreview.statementTotal !== null ? (
                    <p className="text-[11px] text-amber-800">
                      ยอด statement ที่ยังไม่ถูกจับคู่{" "}
                      {fmtPrice(bulkAllocationPreview.remainingUnallocated, storeCurrency)}
                    </p>
                  ) : null}
                  {bulkAllocationPreview.invalidStatementTotal ? (
                    <p className="text-[11px] text-red-600">
                      ยอดชำระรวมต้องมากกว่า 0
                    </p>
                  ) : null}
                  <div className="max-h-24 space-y-0.5 overflow-y-auto pr-1">
                    {bulkAllocationPreview.rows.map((row) => (
                      <p key={row.id} className="text-[11px] text-amber-800">
                        {row.poNumber}
                        {row.supplierName ? ` · ${row.supplierName}` : ""}
                        {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ""}
                        {" · "}
                        จับคู่ {fmtPrice(row.planned, storeCurrency)}
                        {" / ค้าง "}
                        {fmtPrice(row.outstanding, storeCurrency)}
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
                      รายการที่ไม่สำเร็จ ({bulkErrors.length})
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
                      language === "en"
                        ? "Start finalize + settle"
                        : language === "lo"
                          ? "ເລີ່ມປິດເຣດ + ຊຳລະ"
                          : "เริ่มปิดเรท + ชำระ"
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
                          ? `รับเมื่อ ${formatDate(item.receivedAt)}`
                          : "ยังไม่มีวันที่รับ"}
                        {" · "}
                        เรทตั้งต้น {item.exchangeRateInitial} {storeCurrency}/{item.purchaseCurrency}
                        {item.dueDate ? ` · ครบกำหนด ${formatDate(item.dueDate)}` : ""}
                        {" · "}
                        ค้าง {fmtPrice(item.outstandingBase, storeCurrency)}
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
            ลองใหม่
          </Button>
        </div>
      ) : null}

      {/* ── Filter chips (full-width, scrollable) ── */}
      <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { id: "ALL" as StatusFilter, label: language === "en" ? "All" : language === "lo" ? "ທັງໝົດ" : "ทั้งหมด" },
            { id: "OPEN" as StatusFilter, label: language === "en" ? "Open" : language === "lo" ? "ເປີດຢູ່" : "งานเปิด" },
            { id: "DRAFT" as StatusFilter, label: getPurchaseStatusLabel(language, "DRAFT") },
            { id: "ORDERED" as StatusFilter, label: getPurchaseStatusLabel(language, "ORDERED") },
            { id: "SHIPPED" as StatusFilter, label: language === "en" ? "Shipping" : language === "lo" ? "ຈັດສົ່ງ" : "จัดส่ง" },
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
                        {language === "en"
                          ? "Pending rate finalization"
                          : language === "lo"
                            ? "ລໍຖ້າປິດເຣດ"
                            : "รอปิดเรท"}
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
                          ? language === "en"
                            ? "Paid"
                            : language === "lo"
                              ? "ຊຳລະແລ້ວ"
                              : "ชำระแล้ว"
                          : po.paymentStatus === "PARTIAL"
                            ? language === "en"
                              ? "Partially paid"
                              : language === "lo"
                                ? "ຊຳລະບາງສ່ວນ"
                                : "ชำระบางส่วน"
                            : language === "en"
                              ? "Unpaid"
                              : language === "lo"
                                ? "ຍັງບໍ່ຊຳລະ"
                                : "ยังไม่ชำระ"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {formatNumberByLanguage(language, po.itemCount)}{" "}
                      {language === "en" ? "items" : language === "lo" ? "ລາຍການ" : "รายการ"} ·{" "}
                      {fmtPrice(
                        po.totalCostBase + po.shippingCost + po.otherCost,
                        storeCurrency,
                        language,
                      )}
                      {po.status === "RECEIVED"
                        ? ` · ${
                            language === "en" ? "Outstanding" : language === "lo" ? "ຄ້າງ" : "ค้าง"
                          } ${fmtPrice(po.outstandingBase, storeCurrency, language)}`
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
                        {language === "en" ? "Created" : language === "lo" ? "ສ້າງເມື່ອ" : "สั่งเมื่อ"}{" "}
                        {formatDate(po.createdAt, language)}
                      </div>
                    )}
                    {po.status === "ORDERED" && (
                      <div>
                        {language === "en" ? "Created" : language === "lo" ? "ສ້າງເມື່ອ" : "สั่งเมื่อ"}{" "}
                        {formatDate(po.createdAt, language)}
                        {po.orderedAt && (
                          <>
                            {" "}
                            →{" "}
                            {language === "en" ? "Ordered" : language === "lo" ? "ຢືນຢັນເມື່ອ" : "ยืนยันเมื่อ"}{" "}
                            {formatDate(po.orderedAt, language)}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "SHIPPED" && (
                      <div>
                        {language === "en" ? "Created" : language === "lo" ? "ສ້າງເມື່ອ" : "สั่งเมื่อ"}{" "}
                        {formatDate(po.createdAt, language)}
                        {po.shippedAt && (
                          <>
                            {" "}
                            →{" "}
                            {language === "en" ? "Shipped" : language === "lo" ? "ຈັດສົ່ງເມື່ອ" : "จัดส่งเมื่อ"}{" "}
                            {formatDate(po.shippedAt, language)}
                          </>
                        )}
                        {po.expectedAt && (
                          <>
                            {" "}
                            →{" "}
                            {language === "en" ? "Expected" : language === "lo" ? "ຄາດວ່າ" : "คาดว่า"}{" "}
                            {formatDate(po.expectedAt, language)}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "RECEIVED" && (
                      <div>
                        {language === "en" ? "Created" : language === "lo" ? "ສ້າງເມື່ອ" : "สั่งเมื่อ"}{" "}
                        {formatDate(po.createdAt, language)}
                        {po.shippedAt && (
                          <>
                            {" "}
                            →{" "}
                            {language === "en" ? "Shipped" : language === "lo" ? "ຈັດສົ່ງເມື່ອ" : "จัดส่งเมื่อ"}{" "}
                            {formatDate(po.shippedAt, language)}
                          </>
                        )}
                        {po.receivedAt && (
                          <>
                            {" "}
                            →{" "}
                            {language === "en" ? "Received" : language === "lo" ? "ຮັບເມື່ອ" : "รับเมื่อ"}{" "}
                            {formatDate(po.receivedAt, language)}
                          </>
                        )}
                      </div>
                    )}
    {po.status === "CANCELLED" && (
                      <div>
                        {language === "en" ? "Created" : language === "lo" ? "ສ້າງເມື່ອ" : "สั่งเมื่อ"}{" "}
                        {formatDate(po.createdAt, language)}{" "}
                        {po.cancelledAt && (
                          <>
                            ·{" "}
                            <span className="text-red-600">
                              {language === "en" ? "Cancelled" : language === "lo" ? "ຍົກເລີກເມື່ອ" : "ยกเลิกเมื่อ"}{" "}
                              {formatDate(po.cancelledAt, language)}
                            </span>
                          </>
                        )}
                        {!po.cancelledAt && (
                          <>
                            ·{" "}
                            <span className="text-red-600">
                              {language === "en" ? "Cancelled" : language === "lo" ? "ຍົກເລີກ" : "ยกเลิก"}
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
                        {language === "en" ? "Progress" : language === "lo" ? "ຄວາມຄືບໜ້າ" : "ความคืบหน้า"}
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
                          ? language === "en"
                            ? "Overdue"
                            : language === "lo"
                              ? "ເກີນກຳນົດ"
                              : "เลยกำหนด"
                          : language === "en"
                            ? `${remaining} days left`
                            : language === "lo"
                              ? `ເຫຼືອ ${remaining} ມື້`
                              : `เหลือ ${remaining} วัน`}
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
        title={
          language === "en"
            ? "Create purchase order"
            : language === "lo"
              ? "ສ້າງໃບສັ່ງຊື້"
              : "สร้างใบสั่งซื้อ"
        }
        description={`${
          language === "en" ? "Step" : language === "lo" ? "ຂັ້ນຕອນ" : "ขั้นตอน"
        } ${wizardStep}/3`}
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
                      {language === "en"
                        ? "Supplier name (optional)"
                        : language === "lo"
                          ? "ຊື່ຊັບພລາຍເອີ (ບໍ່ບັງຄັບ)"
                          : "ชื่อซัพพลายเออร์ (ไม่บังคับ)"}
                    </label>
                    {supplierNameOptions.length > 0 ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => setIsSupplierPickerOpen((current) => !current)}
                      >
                        {isSupplierPickerOpen
                          ? language === "en"
                            ? "Hide suppliers"
                            : language === "lo"
                              ? "ຊ່ອນລາຍການຊັບພລາຍເອີ"
                              : "ซ่อนรายการซัพพลายเออร์"
                          : language === "en"
                            ? "All suppliers"
                            : language === "lo"
                              ? "ເບິ່ງຊັບພລາຍເອີທັງໝົດ"
                              : "ดูซัพพลายเออร์ทั้งหมด"}
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
                    placeholder={
                      language === "en"
                        ? "e.g. Somchai Supply, Morning Market"
                        : language === "lo"
                          ? "ເຊັ່ນ ຮ້ານສົມໄຊ, ຕະຫຼາດເຊົ້າ"
                          : "เช่น ร้านสมชาย, ตลาดเช้า"
                    }
                  />
                  {supplierNameOptions.length > 0 ? (
                    <p className="text-[11px] text-slate-500">
                      {language === "en"
                        ? "Type to search and pick from existing suppliers, or enter a new name."
                        : language === "lo"
                          ? "ພິມເພື່ອຄົ້ນຫາ ແລະເລືອກຈາກລາຍຊື່ເກົ່າ ຫຼືພິມຊື່ໃໝ່ໄດ້"
                          : "พิมพ์เพื่อค้นหาและแตะเลือกจากรายการเดิม หรือพิมพ์ชื่อใหม่เองได้"}
                    </p>
                  ) : null}
                  {supplierNameOptions.length > 0 && (isSupplierPickerOpen || supplierName) ? (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {visibleSupplierPickerOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          {language === "en"
                            ? "No supplier matches this search. You can use the typed name."
                            : language === "lo"
                              ? "ບໍ່ພົບຊື່ຊັບພລາຍເອີຕາມຄຳຄົ້ນຫາ ສາມາດໃຊ້ຊື່ທີ່ພິມໄດ້ເລີຍ"
                              : "ไม่พบชื่อซัพพลายเออร์ที่ตรงกับคำค้นหา (ใช้ชื่อที่พิมพ์ได้เลย)"}
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
                    {language === "en"
                      ? "Contact number (optional)"
                      : language === "lo"
                        ? "ເບີຕິດຕໍ່ (ບໍ່ບັງຄັບ)"
                        : "เบอร์ติดต่อ (ไม่บังคับ)"}
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
                    {language === "en"
                      ? "Purchase currency"
                      : language === "lo"
                        ? "ສະກຸນເງິນທີ່ຊື້"
                        : "สกุลเงินที่ซื้อ"}
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
                      {language === "en"
                        ? "Actual exchange rate (if known)"
                        : language === "lo"
                          ? "ອັດຕາແລກປ່ຽນຈິງ (ຖ້າຮູ້)"
                          : "อัตราแลกเปลี่ยนจริง (ถ้าทราบ)"}
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="decimal"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder={`เช่น 600 (1 ${purchaseCurrency} = ? ${storeCurrency})`}
                    />
                    <p className="text-[11px] text-slate-500">
                      {language === "en"
                        ? "Leave this blank if the final rate is not known yet. You can finalize it after receiving goods or at payment time."
                        : language === "lo"
                          ? "ຖ້າຍັງບໍ່ຮູ້ເຣດຈິງ ສາມາດປ່ອຍວ່າງໄວ້ ແລະໄປປິດເຣດຫຼັງຮັບສິນຄ້າ/ຕອນຊຳລະ"
                          : <>ถ้ายังไม่ทราบเรทตอนนี้ สามารถเว้นว่างได้ แล้วไปกด{" "}<span className="font-medium">ปิดเรท</span> หลังรับสินค้า/ตอนชำระจริง</>}
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
                  {language === "en" ? "Next →" : language === "lo" ? "ຖັດໄປ →" : "ถัดไป →"}
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
                      {language === "en" ? "Add products" : language === "lo" ? "ເພີ່ມສິນຄ້າ" : "เพิ่มสินค้า"}
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
                        ? language === "en"
                          ? "Hide products"
                          : language === "lo"
                            ? "ຊ່ອນລາຍການສິນຄ້າ"
                            : "ซ่อนรายการสินค้า"
                        : language === "en"
                          ? "All products"
                          : language === "lo"
                            ? "ເບິ່ງສິນຄ້າທັງໝົດ"
                            : "ดูสินค้าทั้งหมด"}
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
                    placeholder={
                      language === "en"
                        ? "Search products..."
                        : language === "lo"
                          ? "ຄົ້ນຫາສິນຄ້າ..."
                          : "🔍 ค้นหาสินค้า..."
                    }
                  />
                  <p className="text-[11px] text-slate-500">
                    {language === "en"
                      ? "Search by name or SKU, or open the full product list."
                      : language === "lo"
                        ? "ຄົ້ນຫາດ້ວຍຊື່ ຫຼື SKU ຫຼືກົດເພື່ອເລືອກຈາກລາຍການ"
                        : "ค้นหาด้วยชื่อหรือ SKU หรือกดปุ่มเพื่อเลือกจากรายการ"}
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
                            ? language === "en"
                              ? "No matching products"
                              : language === "lo"
                                ? "ບໍ່ພົບສິນຄ້າຕາມຄຳຄົ້ນຫາ"
                                : "ไม่พบสินค้าที่ค้นหา"
                            : language === "en"
                              ? "No products available"
                              : language === "lo"
                                ? "ບໍ່ມີສິນຄ້າໃຫ້ເລືອກ"
                                : "ไม่มีสินค้าให้เลือก"}
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
                    {language === "en"
                      ? "No products added yet"
                      : language === "lo"
                        ? "ຍັງບໍ່ໄດ້ເພີ່ມສິນຄ້າ"
                        : "ยังไม่ได้เพิ่มสินค้า"}
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
                              {language === "en" ? "Quantity" : language === "lo" ? "ຈຳນວນ" : "จำนวน"}
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
                              {language === "en"
                                ? `Cost / ${currencySymbol(purchaseCurrency)}`
                                : language === "lo"
                                  ? `ລາຄາ / ${currencySymbol(purchaseCurrency)}`
                                  : `ราคา/${currencySymbol(purchaseCurrency)}`}
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
                    {language === "en" ? "← Back" : language === "lo" ? "← ກັບ" : "← ย้อนกลับ"}
                  </Button>
                  <Button
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setWizardStep(3)}
                    disabled={items.length === 0}
                  >
                    {language === "en" ? "Next →" : language === "lo" ? "ຖັດໄປ →" : "ถัดไป →"}
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
                      {language === "en"
                        ? `Shipping (${currencySymbol(storeCurrency)})`
                        : language === "lo"
                          ? `ຄ່າຂົນສົ່ງ (${currencySymbol(storeCurrency)})`
                          : `ค่าขนส่ง (${currencySymbol(storeCurrency)})`}
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
                      {language === "en"
                        ? `Other costs (${currencySymbol(storeCurrency)})`
                        : language === "lo"
                          ? `ຄ່າອື່ນໆ (${currencySymbol(storeCurrency)})`
                          : `ค่าอื่นๆ (${currencySymbol(storeCurrency)})`}
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
                      {language === "en"
                        ? "Other cost note"
                        : language === "lo"
                          ? "ໝາຍເຫດຄ່າອື່ນໆ"
                          : "หมายเหตุค่าอื่นๆ"}
                    </label>
                    <input
                      className={fieldClassName}
                      value={otherCostNote}
                      onChange={(e) => setOtherCostNote(e.target.value)}
                      placeholder="เช่น ค่าภาษี, ค่าดำเนินการ"
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2 min-w-0">
                    <label className="text-xs text-muted-foreground">
                      {language === "en"
                        ? "Expected receive date (optional)"
                        : language === "lo"
                          ? "ຄາດວ່າຈະໄດ້ຮັບ (ບໍ່ບັງຄັບ)"
                          : "คาดว่าจะได้รับ (ไม่บังคับ)"}
                    </label>
                    <PurchaseDatePickerField
                      language={language}
                      value={expectedAt}
                      onChange={setExpectedAt}
                      triggerClassName={`${fieldClassName} flex items-center justify-between gap-2 text-left`}
                      ariaLabel="เลือกวันที่คาดว่าจะได้รับ"
                    />
                    <p className="text-[11px] text-slate-500">
                      {language === "en"
                        ? "You can leave this blank and set it later."
                        : language === "lo"
                          ? "ຍັງບໍ່ຈຳເປັນຕ້ອງລະບຸ ເລືອກພາຍຫຼັງໄດ້"
                          : "ยังไม่ระบุได้ เลือกภายหลังได้"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "TODAY")}
                      >
                        {language === "en" ? "Today" : language === "lo" ? "ມື້ນີ້" : "วันนี้"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "PLUS_7")}
                      >
                        {language === "en" ? "+7 days" : language === "lo" ? "+7 ມື້" : "+7 วัน"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "END_OF_MONTH")}
                      >
                        {language === "en" ? "Month end" : language === "lo" ? "ສິ້ນເດືອນ" : "สิ้นเดือน"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("expectedAt", "CLEAR")}
                      >
                        {language === "en" ? "Clear" : language === "lo" ? "ລ້າງ" : "ล้างค่า"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 min-w-0">
                    <label className="text-xs text-muted-foreground">
                      {language === "en"
                        ? "Due date"
                        : language === "lo"
                          ? "ຄົບກຳນົດຊຳລະ"
                          : "ครบกำหนดชำระ (due date)"}
                    </label>
                    <PurchaseDatePickerField
                      language={language}
                      value={dueDate}
                      onChange={setDueDate}
                      triggerClassName={`${fieldClassName} flex items-center justify-between gap-2 text-left`}
                      ariaLabel="เลือกวันที่ครบกำหนดชำระ"
                    />
                    <p className="text-[11px] text-slate-500">
                      {language === "en"
                        ? "Leave blank if the actual due date is not known yet."
                        : language === "lo"
                          ? "ຖ້າຍັງບໍ່ຮູ້ກຳນົດຈິງ ສາມາດປ່ອຍວ່າງໄວ້ກ່ອນ"
                          : "ถ้ายังไม่รู้กำหนดจริง ให้เว้นว่างไว้ก่อนได้"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "TODAY")}
                      >
                        {language === "en" ? "Today" : language === "lo" ? "ມື້ນີ້" : "วันนี้"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "PLUS_7")}
                      >
                        {language === "en" ? "+7 days" : language === "lo" ? "+7 ມື້" : "+7 วัน"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "END_OF_MONTH")}
                      >
                        {language === "en" ? "Month end" : language === "lo" ? "ສິ້ນເດືອນ" : "สิ้นเดือน"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => applyCreateDateShortcut("dueDate", "CLEAR")}
                      >
                        {language === "en" ? "Clear" : language === "lo" ? "ລ້າງ" : "ล้างค่า"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    {language === "en"
                      ? "Note (optional)"
                      : language === "lo"
                        ? "ໝາຍເຫດ (ບໍ່ບັງຄັບ)"
                        : "หมายเหตุ (ไม่บังคับ)"}
                  </label>
                  <input
                    className={fieldClassName}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      language === "en"
                        ? "Additional note"
                        : language === "lo"
                          ? "ໝາຍເຫດເພີ່ມເຕີມ"
                          : "หมายเหตุเพิ่มเติม"
                    }
                  />
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {language === "en" ? "Summary" : language === "lo" ? "ສະຫຼຸບ" : "สรุป"}
                  </p>
                  {purchaseCurrency !== storeCurrency && !hasExchangeRateInput && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {language === "en"
                        ? "Final exchange rate is still pending: the system will temporarily use rate 1 and let you finalize it later."
                        : language === "lo"
                          ? "ຍັງບໍ່ໄດ້ປິດເຣດຈິງ: ລະບົບຈະໃຊ້ເຣດຊົ່ວຄາວ 1 ເພື່ອບັນທຶກ PO ແລະໃຫ້ໄປປິດເຣດພາຍຫຼັງ"
                          : "ยังไม่ปิดเรทจริง: ระบบจะใช้เรทชั่วคราว 1 เพื่อบันทึก PO และให้ไปปิดเรทภายหลัง"}
                    </p>
                  )}
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-600">
                          {language === "en"
                            ? `Products (${items.length})`
                            : language === "lo"
                              ? `ສິນຄ້າ (${items.length} ລາຍການ)`
                              : `สินค้า (${items.length} รายการ)`}
                        </span>
                      <span className="font-medium">
                        {fmtPrice(itemsTotalBase, storeCurrency)}
                      </span>
                    </div>
                    {shipping > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          {language === "en" ? "Shipping" : language === "lo" ? "ຄ່າຂົນສົ່ງ" : "ค่าขนส่ง"}
                        </span>
                        <span>{fmtPrice(shipping, storeCurrency)}</span>
                      </div>
                    )}
                    {other > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          {language === "en" ? "Other costs" : language === "lo" ? "ຄ່າອື່ນໆ" : "ค่าอื่นๆ"}
                        </span>
                        <span>{fmtPrice(other, storeCurrency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                      <span>{language === "en" ? "Grand total" : language === "lo" ? "ລວມທັງໝົດ" : "รวมทั้งหมด"}</span>
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
                  {language === "en" ? "← Back" : language === "lo" ? "← ກັບ" : "← ย้อนกลับ"}
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
                    บันทึกร่าง
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
                    รับสินค้าทันที
                  </Button>
                </div>
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={async () => {
                    if (items.length === 0) {
                      toast.error(
                        language === "en"
                          ? "Please add at least 1 product"
                          : language === "lo"
                            ? "ກະລຸນາເພີ່ມສິນຄ້າຢ່າງນ້ອຍ 1 ລາຍການ"
                            : "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ",
                      );
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
                        toast.error(
                          data?.message ??
                            (language === "en"
                              ? "Failed to create"
                              : language === "lo"
                                ? "ສ້າງບໍ່ສຳເລັດ"
                                : "สร้างไม่สำเร็จ"),
                        );
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
                        language === "en"
                          ? "Purchase order created and confirmed"
                          : language === "lo"
                            ? "ສ້າງໃບສັ່ງຊື້ແລະຢືນຢັນແລ້ວ"
                            : "สร้างใบสั่งซื้อ + ยืนยันสั่งแล้ว",
                      );
                      forceCloseCreateSheet();
                      await reloadFirstPage();
                      router.refresh();
                    } catch {
                      toast.error(
                        language === "en"
                          ? "Connection failed"
                          : language === "lo"
                            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
                            : "เชื่อมต่อไม่สำเร็จ",
                      );
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
                  {language === "en" ? "Confirm order" : language === "lo" ? "ຢືນຢັນການສັ່ງຊື້" : "ยืนยันสั่งซื้อ"}
                </Button>
              </div>
            )}
      </SlideUpSheet>

      {isCreateOpen && isCreateCloseConfirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="ปิดกล่องยืนยันปิดฟอร์ม"
            className="absolute inset-0 bg-slate-900/55"
            onClick={() => setIsCreateCloseConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ยืนยันปิดฟอร์มสร้างใบสั่งซื้อ"
            className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          >
            <p className="text-sm font-semibold text-slate-900">
              ยืนยันปิดฟอร์มสร้างใบสั่งซื้อ
            </p>
            <p className="mt-2 text-xs text-slate-600">
              มีข้อมูลที่ยังไม่บันทึก ต้องการปิดและทิ้งข้อมูลที่กรอกไว้หรือไม่
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg text-xs"
                onClick={() => setIsCreateCloseConfirmOpen(false)}
              >
                กลับไปแก้ไข
              </Button>
              <Button
                type="button"
                className="h-9 rounded-lg bg-red-600 text-xs text-white hover:bg-red-700"
                onClick={forceCloseCreateSheet}
              >
                ปิดและทิ้งข้อมูล
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
          result.error ??
            (language === "en"
              ? "Failed to load purchase order detail"
              : language === "lo"
                ? "ໂຫຼດລາຍລະອຽດໃບສັ່ງຊື້ບໍ່ສຳເລັດ"
                : "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ"),
        );
      }
    },
    [language, loadPoDetail],
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
          result.error ??
            (language === "en"
              ? "Failed to load purchase order detail"
              : language === "lo"
                ? "ໂຫຼດລາຍລະອຽດໃບສັ່ງຊື້ບໍ່ສຳເລັດ"
                : "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ"),
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [getCachedPoDetail, language, loadPoDetail, poId]);

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
      toast.error(
        language === "en"
          ? "Please enter a valid final exchange rate"
          : language === "lo"
            ? "ກະລຸນາກອກອັດຕາແລກປ່ຽນຈິງໃຫ້ຖືກຕ້ອງ"
            : "กรุณากรอกอัตราแลกเปลี่ยนจริงให้ถูกต้อง",
      );
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
          data?.message ??
            (language === "en"
              ? "Failed to finalize exchange rate"
              : language === "lo"
                ? "ປິດເຣດບໍ່ສຳເລັດ"
                : "ปิดเรทไม่สำเร็จ"),
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
      toast.success(
        language === "en"
          ? "Exchange rate finalized"
          : language === "lo"
            ? "ປິດເຣດຮຽບຮ້ອຍແລ້ວ"
            : "ปิดเรทเรียบร้อย",
      );
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error(
        language === "en"
          ? "Connection failed"
          : language === "lo"
            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
            : "เชื่อมต่อไม่สำเร็จ",
      );
    } finally {
      setIsFinalizingRate(false);
    }
  }, [finalRateInput, finalRateNoteInput, language, onCacheUpdate, onRefreshList, po, router]);

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
      toast.error(
        language === "en"
          ? "Please enter a valid payment amount"
          : language === "lo"
            ? "ກະລຸນາກອກຍອດຊຳລະໃຫ້ຖືກຕ້ອງ"
            : "กรุณากรอกยอดชำระให้ถูกต้อง",
      );
      return;
    }
    if (amountBase > po.outstandingBase) {
      toast.error(
        language === "en"
          ? "Payment amount exceeds outstanding balance"
          : language === "lo"
            ? "ຍອດຊຳລະເກີນຍອດຄ້າງ"
            : "ยอดชำระเกินยอดค้าง",
      );
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
          data?.message ??
            (language === "en"
              ? "Failed to record payment"
              : language === "lo"
                ? "ບັນທຶກການຊຳລະບໍ່ສຳເລັດ"
                : "บันทึกชำระไม่สำเร็จ"),
        );
        return;
      }

      const updatedPo = data?.purchaseOrder;
      if (updatedPo) {
        setPo(updatedPo);
        onCacheUpdate(updatedPo);
      }
      setIsSettleMode(false);
      toast.success(
        language === "en"
          ? "Payment recorded"
          : language === "lo"
            ? "ບັນທຶກການຊຳລະຮຽບຮ້ອຍ"
            : "บันทึกชำระเรียบร้อย",
      );
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error(
        language === "en"
          ? "Connection failed"
          : language === "lo"
            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
            : "เชื่อมต่อไม่สำเร็จ",
      );
    } finally {
      setIsSettlingPayment(false);
    }
  }, [
    onCacheUpdate,
    onRefreshList,
    po,
    router,
    settleAmountInput,
    language,
    settleNoteInput,
    settlePaidAtInput,
    settleReferenceInput,
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
      toast.error(
        language === "en"
          ? "Please enter a valid shipping cost"
          : language === "lo"
            ? "ກະລຸນາກອກຄ່າຂົນສົ່ງໃຫ້ຖືກຕ້ອງ"
            : "กรุณากรอกค่าขนส่งให้ถูกต้อง",
      );
      return;
    }
    if (!Number.isFinite(otherCost) || otherCost < 0) {
      toast.error(
        language === "en"
          ? "Please enter a valid additional cost"
          : language === "lo"
            ? "ກະລຸນາກອກຄ່າໃຊ້ຈ່າຍອື່ນໃຫ້ຖືກຕ້ອງ"
            : "กรุณากรอกค่าอื่นๆ ให้ถูกต้อง",
      );
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
          data?.message ??
            (language === "en"
              ? "Failed to update extra costs"
              : language === "lo"
                ? "ອັບເດດຄ່າໃຊ້ຈ່າຍບໍ່ສຳເລັດ"
                : "อัปเดตค่าขนส่ง/ค่าอื่นไม่สำเร็จ"),
        );
        return;
      }
      if (data?.purchaseOrder) {
        setPo(data.purchaseOrder);
        onCacheUpdate(data.purchaseOrder);
      }
      setIsApplyExtraCostMode(false);
      toast.success(
        language === "en"
          ? "Extra costs updated"
          : language === "lo"
            ? "ອັບເດດຄ່າໃຊ້ຈ່າຍຮຽບຮ້ອຍ"
            : "อัปเดตค่าขนส่ง/ค่าอื่นเรียบร้อย",
      );
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error(
        language === "en"
          ? "Connection failed"
          : language === "lo"
            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
            : "เชื่อมต่อไม่สำเร็จ",
      );
    } finally {
      setIsApplyingExtraCost(false);
    }
  }, [
    extraCostOtherInput,
    extraCostOtherNoteInput,
    extraCostShippingInput,
    language,
    onCacheUpdate,
    onRefreshList,
    po,
    router,
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
            data?.message ??
              (language === "en"
                ? "Failed to reverse payment entry"
                : language === "lo"
                  ? "ຍ້ອນລາຍການຊຳລະບໍ່ສຳເລັດ"
                  : "ย้อนรายการชำระไม่สำเร็จ"),
          );
          return;
        }
        if (data?.purchaseOrder) {
          setPo(data.purchaseOrder);
          onCacheUpdate(data.purchaseOrder);
        }
        toast.success(
          language === "en"
            ? "Payment entry reversed"
            : language === "lo"
              ? "ຍ້ອນລາຍການຊຳລະຮຽບຮ້ອຍ"
              : "ย้อนรายการชำระเรียบร้อย",
        );
        await onRefreshList();
        router.refresh();
      } catch {
        toast.error(
          language === "en"
            ? "Connection failed"
            : language === "lo"
              ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
              : "เชื่อมต่อไม่สำเร็จ",
        );
      } finally {
        setReversingPaymentId(null);
      }
    },
    [language, onCacheUpdate, onRefreshList, po, router],
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
      toast.error(
        language === "en"
          ? "At least one line item is required"
          : language === "lo"
            ? "ຕ້ອງມີສິນຄ້າຢ່າງໜ້ອຍ 1 ລາຍການ"
            : "ต้องมีอย่างน้อย 1 รายการสินค้า",
      );
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
          data?.message ??
            (language === "en"
              ? "Failed to update purchase order"
              : language === "lo"
                ? "ອັບເດດໃບສັ່ງຊື້ບໍ່ສຳເລັດ"
                : "อัปเดต PO ไม่สำเร็จ"),
        );
        return;
      }

      const updatedPo = data.purchaseOrder as PurchaseOrderDetail;
      setPo(updatedPo);
      onCacheUpdate(updatedPo);
      setIsEditMode(false);
      toast.success(
        language === "en"
          ? "Purchase order updated"
          : language === "lo"
            ? "ບັນທຶກການແກ້ໄຂໃບສັ່ງຊື້ຮຽບຮ້ອຍ"
            : "บันทึกการแก้ไข PO เรียบร้อย",
      );
      router.refresh();
    } catch {
      toast.error(
        language === "en"
          ? "Connection failed"
          : language === "lo"
            ? "ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ"
            : "เชื่อมต่อไม่สำเร็จ",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isOpen = poId !== null;
  const detailUi = {
    mustFinalizeRateBeforePayment:
      language === "en"
        ? "Finalize the exchange rate before recording payment"
        : language === "lo"
          ? "ຕ້ອງປິດເຣດກ່ອນບັນທຶກການຊຳລະ"
          : "ต้องปิดเรทก่อนบันทึกชำระ",
    pdfDocTitle:
      language === "en"
        ? "Purchase order"
        : language === "lo"
          ? "ໃບສັ່ງຊື້"
          : "ใบสั่งซื้อ",
    referenceRate:
      language === "en"
        ? "Reference rate"
        : language === "lo"
          ? "ເຣດອ້າງອີງ"
          : "เรทอ้างอิง",
    initialRate:
      language === "en"
        ? "Initial rate at PO creation"
        : language === "lo"
          ? "ເຣດຕັ້ງຕົ້ນຕອນສ້າງ PO"
          : "เรทตั้งต้นตอนสร้าง PO",
    rateStatusPending:
      language === "en"
        ? "Status: waiting for final exchange rate (recommended at actual settlement)"
        : language === "lo"
          ? "ສະຖານະ: ລໍຖ້າປິດເຣດຈິງ (ແນະນຳຕອນຊຳລະຈິງ)"
          : "สถานะ: รอปิดเรทจริง (แนะนำปิดเรทตอนชำระจริงปลายงวด)",
    rateStatusLocked:
      language === "en"
        ? "Status: finalized"
        : language === "lo"
          ? "ສະຖານະ: ປິດເຣດແລ້ວ"
          : "สถานะ: ปิดเรทแล้ว",
    when:
      language === "en" ? "on" : language === "lo" ? "ເມື່ອ" : "เมื่อ",
    rateDifference:
      language === "en"
        ? "rate diff"
        : language === "lo"
          ? "ສ່ວນຕ່າງເຣດ"
          : "ส่วนต่างเรท",
    paymentStatus:
      language === "en"
        ? "Payment status"
        : language === "lo"
          ? "ສະຖານະການຊຳລະ"
          : "สถานะชำระ",
    paid: language === "en" ? "Paid" : language === "lo" ? "ຊຳລະແລ້ວ" : "ชำระแล้ว",
    partialPaid:
      language === "en" ? "Partially paid" : language === "lo" ? "ຊຳລະບາງສ່ວນ" : "ชำระบางส่วน",
    unpaid:
      language === "en" ? "Unpaid" : language === "lo" ? "ຍັງບໍ່ຊຳລະ" : "ยังไม่ชำระ",
    paidAmount:
      language === "en" ? "Paid" : language === "lo" ? "ຈ່າຍແລ້ວ" : "จ่ายแล้ว",
    outstanding:
      language === "en" ? "Outstanding" : language === "lo" ? "ຄ້າງ" : "ค้าง",
    paidAt:
      language === "en" ? "Paid on" : language === "lo" ? "ຊຳລະເມື່ອ" : "ชำระเมื่อ",
    paymentRecorded:
      language === "en"
        ? "Payment recorded"
        : language === "lo"
          ? "ບັນທຶກການຊຳລະແລ້ວ"
          : "บันทึกชำระแล้ว",
    by: language === "en" ? "by" : language === "lo" ? "ໂດຍ" : "โดย",
    reference:
      language === "en" ? "ref" : language === "lo" ? "ອ້າງອີງ" : "อ้างอิง",
    pendingPaymentHint:
      language === "en"
        ? "Exchange rate is still pending: finalize the rate before recording payment"
        : language === "lo"
          ? "ຍັງບໍ່ປິດເຣດ: ຕ້ອງປິດເຣດກ່ອນບັນທຶກການຊຳລະ"
          : "ยังปิดเรทไม่ครบ: ต้องปิดเรทก่อนบันทึกชำระ",
    readyToSettle:
      language === "en"
        ? "Ready to record payment when settlement happens"
        : language === "lo"
          ? "ພ້ອມບັນທຶກການຊຳລະເມື່ອຈ່າຍຈິງ"
          : "พร้อมบันทึกชำระเมื่อจ่ายจริง",
    finalizeRateTitle:
      language === "en" ? "Finalize exchange rate" : language === "lo" ? "ປິດເຣດແລກປ່ຽນຈິງ" : "ปิดเรทแลกเปลี่ยนจริง",
    finalRateLabel:
      language === "en"
        ? `Final exchange rate (1 ${po?.purchaseCurrency ?? "-"} = ? ${storeCurrency})`
        : language === "lo"
          ? `ອັດຕາແລກປ່ຽນຈິງ (1 ${po?.purchaseCurrency ?? "-"} = ? ${storeCurrency})`
          : `อัตราแลกเปลี่ยนจริง (1 ${po?.purchaseCurrency ?? "-"} = ? ${storeCurrency})`,
    finalRatePlaceholder:
      language === "en" ? "e.g. 670" : language === "lo" ? "ເຊັ່ນ 670" : "เช่น 670",
    finalizeRateNoteLabel:
      language === "en"
        ? "Finalize rate note (optional)"
        : language === "lo"
          ? "ໝາຍເຫດການປິດເຣດ (ບໍ່ບັງຄັບ)"
          : "หมายเหตุการปิดเรท (ไม่บังคับ)",
    finalizeRateNotePlaceholder:
      language === "en"
        ? "e.g. month-end settlement / invoice ref"
        : language === "lo"
          ? "ເຊັ່ນ ຊຳລະປາຍເດືອນ / ອ້າງອີງໃບແຈ້ງໜີ້"
          : "เช่น ชำระปลายเดือน/อ้างอิงใบแจ้งหนี้",
    finalizeRateHelp:
      language === "en"
        ? "Finalizing the rate updates the base values for accounting reference on this PO only and does not retroactively change closed documents."
        : language === "lo"
          ? "ການປິດເຣດຈະອັບເດດມູນຄ່າຖານສຳລັບອ້າງອີງບັນຊີໃນ PO ນີ້ເທົ່ານັ້ນ ແລະບໍ່ຍ້ອນແກ້ເອກະສານທີ່ປິດແລ້ວ"
          : "หมายเหตุ: การปิดเรทจะอัปเดตราคาฐานใน PO นี้สำหรับการอ้างอิงบัญชี ไม่ย้อนแก้เอกสารที่ปิดไปแล้ว",
    confirmFinalizeRate:
      language === "en" ? "Confirm finalize rate" : language === "lo" ? "ຢືນຢັນປິດເຣດ" : "ยืนยันปิดเรท",
    settlePaymentTitle:
      language === "en" ? "Record PO payment" : language === "lo" ? "ບັນທຶກການຊຳລະ PO" : "บันทึกชำระ PO",
    paymentAmountLabel:
      language === "en" ? `Payment amount (${storeCurrency})` : language === "lo" ? `ຍອດຊຳລະ (${storeCurrency})` : `ยอดชำระ (${storeCurrency})`,
    currentOutstanding:
      language === "en"
        ? "Current outstanding"
        : language === "lo"
          ? "ຍອດຄ້າງປັດຈຸບັນ"
          : "ยอดค้างปัจจุบัน",
    paymentDate:
      language === "en" ? "Payment date" : language === "lo" ? "ວັນທີຊຳລະ" : "วันที่ชำระ",
    paymentReferenceLabel:
      language === "en"
        ? "Payment reference (optional)"
        : language === "lo"
          ? "ເລກອ້າງອີງການຊຳລະ (ບໍ່ບັງຄັບ)"
          : "เลขอ้างอิงชำระ (ไม่บังคับ)",
    paymentReferencePlaceholder:
      language === "en"
        ? "e.g. month-end statement / invoice number"
        : language === "lo"
          ? "ເຊັ່ນ statement ປາຍເດືອນ / ເລກໃບແຈ້ງໜີ້"
          : "เช่น Statement ปลายเดือน / เลขใบแจ้งหนี้",
    optionalNote:
      language === "en" ? "Note (optional)" : language === "lo" ? "ໝາຍເຫດ (ບໍ່ບັງຄັບ)" : "หมายเหตุ (ไม่บังคับ)",
    confirmSettlePayment:
      language === "en" ? "Confirm payment" : language === "lo" ? "ຢືນຢັນບັນທຶກການຊຳລະ" : "ยืนยันบันทึกชำระ",
    updateCostsTitle:
      language === "en"
        ? "Update shipping and extra costs after receiving"
        : language === "lo"
          ? "ອັບເດດຄ່າຂົນສົ່ງ/ຄ່າອື່ນຫຼັງຮັບສິນຄ້າ"
          : "อัปเดตค่าขนส่ง/ค่าอื่นหลังรับสินค้า",
    shippingCostLabel:
      language === "en" ? `Shipping cost (${storeCurrency})` : language === "lo" ? `ຄ່າຂົນສົ່ງ (${storeCurrency})` : `ค่าขนส่ง (${storeCurrency})`,
    otherCostLabel:
      language === "en" ? `Other cost (${storeCurrency})` : language === "lo" ? `ຄ່າອື່ນໆ (${storeCurrency})` : `ค่าอื่นๆ (${storeCurrency})`,
    otherCostNoteLabel:
      language === "en"
        ? "Other cost note (optional)"
        : language === "lo"
          ? "ໝາຍເຫດຄ່າອື່ນໆ (ບໍ່ບັງຄັບ)"
          : "หมายเหตุค่าอื่นๆ (ไม่บังคับ)",
    otherCostNotePlaceholder:
      language === "en"
        ? "e.g. month-end freight / extra service fee"
        : language === "lo"
          ? "ເຊັ່ນ ຄ່າຂົນສົ່ງປາຍເດືອນ / ຄ່າບໍລິການເພີ່ມ"
          : "เช่น ค่าขนส่งปลายเดือน / ค่าบริการเพิ่มเติม",
    newGrandTotal:
      language === "en" ? "New grand total" : language === "lo" ? "ຍອດລວມໃໝ່" : "ยอดรวมใหม่",
    newOutstanding:
      language === "en" ? "New outstanding" : language === "lo" ? "ຍອດຄ້າງໃໝ່" : "คงค้างใหม่",
    updateCostsHelp:
      language === "en"
        ? "This updates AP and statement balances immediately, but does not retroactively change product costs."
        : language === "lo"
          ? "ລະບົບຈະອັບເດດ AP/statement ທັນທີ ແຕ່ບໍ່ຍ້ອນປັບຕົ້ນທຶນສິນຄ້າ"
          : "หมายเหตุ: อัปเดตยอด AP/statement ทันที แต่ไม่ปรับต้นทุนสินค้าแบบย้อนย้อนหลัง",
    confirmUpdate:
      language === "en" ? "Confirm update" : language === "lo" ? "ຢືນຢັນອັບເດດ" : "ยืนยันอัปเดต",
    paymentHistory:
      language === "en" ? "Payment history" : language === "lo" ? "ປະຫວັດການຊຳລະ" : "ประวัติการชำระ",
    paymentEntry:
      language === "en" ? "Payment" : language === "lo" ? "ຊຳລະ" : "ชำระ",
    reversalEntry:
      language === "en" ? "Reversal" : language === "lo" ? "ຍ້ອນລາຍການ" : "ย้อนรายการ",
    systemUser:
      language === "en" ? "system" : language === "lo" ? "ລະບົບ" : "โดยระบบ",
    reverseEntry:
      language === "en" ? "Reverse entry" : language === "lo" ? "ຍ້ອນລາຍການ" : "ย้อนรายการ",
    reversed:
      language === "en" ? "Reversed" : language === "lo" ? "ຖືກຍ້ອນແລ້ວ" : "ถูกย้อนแล้ว",
    editPo:
      language === "en" ? "Edit purchase order" : language === "lo" ? "ແກ້ໄຂໃບສັ່ງຊື້" : "แก้ไข PO",
    exchangeRateHint:
      language === "en"
        ? "Leave blank if the final exchange rate is not known yet. The PO will remain pending final rate."
        : language === "lo"
          ? "ປ່ອຍວ່າງໄວ້ໄດ້ຖ້າຍັງບໍ່ຮູ້ເຣດຈິງ (ລະບົບຈະຕັ້ງເປັນລໍຖ້າປິດເຣດ)"
          : "เว้นว่างได้ถ้ายังไม่ทราบเรทจริง (ระบบจะตั้งเป็นรอปิดเรท)",
    itemLines:
      language === "en" ? "Line items" : language === "lo" ? "ລາຍການສິນຄ້າ" : "รายการสินค้า",
    expectedDateAria:
      language === "en"
        ? "Select expected receive date in edit form"
        : language === "lo"
          ? "ເລືອກວັນທີຄາດຮັບໃນຟອມແກ້ໄຂ PO"
          : "เลือกวันที่คาดรับในฟอร์มแก้ไข PO",
    dueDateAria:
      language === "en"
        ? "Select due date in edit form"
        : language === "lo"
          ? "ເລືອກວັນທີຄົບກຳນົດຊຳລະໃນຟອມແກ້ໄຂ PO"
          : "เลือกวันที่ครบกำหนดชำระในฟอร์มแก้ไข PO",
    saveEdit:
      language === "en" ? "Save changes" : language === "lo" ? "ບັນທຶກການແກ້ໄຂ" : "บันทึกการแก้ไข",
    created:
      language === "en" ? "Created" : language === "lo" ? "ສ້າງ" : "สร้าง",
    confirmedOrder:
      language === "en" ? "Confirmed" : language === "lo" ? "ຢືນຢັນສັ່ງຊື້" : "ยืนยันสั่งซื้อ",
    shipped:
      language === "en" ? "Shipped" : language === "lo" ? "ຈັດສົ່ງ" : "จัดส่ง",
    received:
      language === "en" ? "Received" : language === "lo" ? "ຮັບສິນຄ້າແລ້ວ" : "รับสินค้าแล้ว",
    expectedOn:
      language === "en" ? "Expected on" : language === "lo" ? "ຄາດວ່າ" : "คาดว่า",
    dueOn:
      language === "en" ? "Due on" : language === "lo" ? "ຄົບກຳນົດຊຳລະ" : "ครบกำหนดชำระ",
    receivedQty:
      language === "en" ? "received" : language === "lo" ? "ຮັບແລ້ວ" : "ได้รับ",
    goods:
      language === "en" ? "Goods" : language === "lo" ? "ສິນຄ້າ" : "สินค้า",
    confirmOrder:
      language === "en" ? "Confirm order" : language === "lo" ? "ຢືນຢັນສັ່ງຊື້" : "ยืนยันสั่งซื้อ",
    supplierShipped:
      language === "en" ? "Supplier shipped" : language === "lo" ? "ຜູ້ສະໜອງຈັດສົ່ງແລ້ວ" : "ซัพพลายเออร์ส่งแล้ว",
    receiveGoods:
      language === "en" ? "Receive goods" : language === "lo" ? "ຮັບສິນຄ້າ" : "รับสินค้า",
  };

  return (
    <SlideUpSheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        po?.poNumber ??
        (language === "en" ? "Detail" : language === "lo" ? "ລາຍລະອຽດ" : "รายละเอียด")
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
                        toast.success(
                          language === "en"
                            ? "PDF downloaded"
                            : language === "lo"
                              ? "ດາວໂຫລດ PDF ຮຽບຮ້ອຍ"
                              : "ดาวน์โหลด PDF เรียบร้อย",
                        );
                      } catch {
                        toast.error(
                          language === "en"
                            ? "Failed to generate PDF"
                            : language === "lo"
                              ? "ສ້າງ PDF ບໍ່ສຳເລັດ"
                              : "สร้าง PDF ไม่สำเร็จ",
                        );
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
                            `${
                              language === "en"
                                ? "Purchase order"
                                : language === "lo"
                                  ? "ໃບສັ່ງຊື້"
                                  : "ใบสั่งซื้อ"
                            } ${po.poNumber}`,
                          );
                          if (result === "downloaded") {
                            toast.success(
                              language === "en"
                                ? "PDF downloaded"
                                : language === "lo"
                                  ? "ດາວໂຫລດ PDF ຮຽບຮ້ອຍ"
                                  : "ดาวน์โหลด PDF เรียบร้อย",
                            );
                          }
                        } catch {
                          toast.error(
                            language === "en"
                              ? "Failed to share PDF"
                              : language === "lo"
                                ? "ແບ່ງປັນ PDF ບໍ່ສຳເລັດ"
                                : "แชร์ PDF ไม่สำเร็จ",
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
                      {detailUi.finalRateLabel} (1 {po.purchaseCurrency} = ? {storeCurrency})
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
                      {detailUi.paymentAmountLabel} ({storeCurrency})
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
                        {detailUi.shippingCostLabel} ({storeCurrency})
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
                        {detailUi.otherCostLabel} ({storeCurrency})
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
                      <label className="text-[11px] text-slate-500">Tracking</label>
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
                  (language === "en"
                    ? "No data found"
                    : language === "lo"
                      ? "ບໍ່ພົບຂໍ້ມູນ"
                      : "ไม่พบข้อมูล")}
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
