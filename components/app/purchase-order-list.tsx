"use client";

import {
  Banknote,
  Clock,
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
  useId,
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

/* ── Status config ── */
const statusConfig: Record<
  PurchaseOrderListItem["status"],
  { label: string; icon: typeof Clock; badgeClass: string }
> = {
  DRAFT: {
    label: "ร่าง",
    icon: FileText,
    badgeClass: "bg-slate-100 text-slate-600",
  },
  ORDERED: {
    label: "สั่งแล้ว",
    icon: ShoppingCart,
    badgeClass: "bg-amber-100 text-amber-700",
  },
  SHIPPED: {
    label: "กำลังจัดส่ง",
    icon: Truck,
    badgeClass: "bg-blue-100 text-blue-700",
  },
  RECEIVED: {
    label: "รับแล้ว",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  CANCELLED: {
    label: "ยกเลิก",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-600",
  },
};

type PurchaseOrderListProps = {
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

function fmtPrice(amount: number, currency: StoreCurrency): string {
  return `${currencySymbol(currency)}${amount.toLocaleString("th-TH")}`;
}

function daysUntil(dateStr: string): number {
  const targetDate = new Date(dateStr);
  const now = new Date();
  return Math.ceil(
    (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("th-TH", {
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [shippingCost, setShippingCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
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
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

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
  }, [replaceWorkspaceQuery, workspaceFromQuery, workspaceStorageKey]);

  useEffect(() => {
    setStatusFilter(statusFromQuery ?? DEFAULT_PO_STATUS_FILTER);
  }, [statusFromQuery]);

  useEffect(() => {
    replacePurchaseQuery((params) => {
      if (statusFilter === DEFAULT_PO_STATUS_FILTER) {
        params.delete(PURCHASE_STATUS_QUERY_KEY);
      } else {
        params.set(PURCHASE_STATUS_QUERY_KEY, statusFilter);
      }
    });
  }, [replacePurchaseQuery, statusFilter]);

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
    const input = window.prompt("ตั้งชื่อ preset นี้", defaultLabel);
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
    toast.success("บันทึก preset แล้ว");
  }, [activeKpiShortcut]);

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
              error: data?.message ?? "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ",
            };
          }

          if (!data?.ok || !data.purchaseOrder) {
            return { purchaseOrder: null, error: "ไม่พบข้อมูลใบสั่งซื้อ" };
          }

          const purchaseOrder = data.purchaseOrder as PurchaseOrderDetail;
          poDetailCacheRef.current.set(poId, purchaseOrder);
          return { purchaseOrder, error: null };
        } catch {
          return {
            purchaseOrder: null,
            error: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่",
          };
        } finally {
          poDetailPendingRef.current.delete(poId);
        }
      })();

      poDetailPendingRef.current.set(poId, request);
      return request;
    },
    [],
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

  const prefetchPoDetail = useCallback(
    (poId: string) => {
      if (poDetailCacheRef.current.has(poId) || poDetailPendingRef.current.has(poId)) {
        return;
      }
      void loadPoDetail(poId, { preferCache: false });
    },
    [loadPoDetail],
  );

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
          setListError(data?.message ?? "โหลดรายการใบสั่งซื้อไม่สำเร็จ");
          return false;
        }

        if (!Array.isArray(data?.purchaseOrders)) {
          setListError("รูปแบบข้อมูลใบสั่งซื้อไม่ถูกต้อง");
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
        setListError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
        return false;
      }
    },
    [pageSize],
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
        setPendingQueueError(data?.message ?? "โหลดคิวรอปิดเรทไม่สำเร็จ");
        return;
      }

      setPendingRateQueue(Array.isArray(data.queue) ? data.queue : []);
      setPendingQueueError(null);
    } catch {
      setPendingQueueError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoadingPendingQueue(false);
    }
  }, [pendingReceivedFrom, pendingReceivedTo, pendingSupplierFilter]);

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
  }, [hasMore, loadMore]);

  useEffect(() => {
    const likelyNext = filteredList.slice(0, 3).map((po) => po.id);
    if (likelyNext.length === 0) return;
    const timer = window.setTimeout(() => {
      likelyNext.forEach((poId) => prefetchPoDetail(poId));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [filteredList, prefetchPoDetail]);

  useEffect(() => {
    void loadPendingQueue();
  }, [loadPendingQueue]);

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
      toast.error("กรุณาเลือก PO อย่างน้อย 1 รายการ");
      return;
    }
    if (hasMixedPendingCurrencies) {
      toast.error("ปิดเรทแบบกลุ่มได้เฉพาะ PO สกุลเงินเดียวกันต่อรอบ");
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
  }, [hasMixedPendingCurrencies, selectedPendingQueueItems.length]);

  const submitBulkMonthEnd = useCallback(async () => {
    if (sortedSelectedPendingQueueItems.length === 0) {
      toast.error("กรุณาเลือก PO ที่ต้องการปิดเรท");
      return;
    }
    if (hasMixedPendingCurrencies) {
      toast.error("ปิดเรทแบบกลุ่มได้เฉพาะ PO สกุลเงินเดียวกันต่อรอบ");
      return;
    }

    const exchangeRate = Math.round(Number(bulkRateInput));
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      toast.error("กรุณากรอกอัตราแลกเปลี่ยนจริงให้ถูกต้อง");
      return;
    }

    const paymentReference = bulkReferenceInput.trim();
    if (!paymentReference) {
      toast.error("กรุณากรอกเลขอ้างอิงรอบบัตร/รอบชำระ");
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
      toast.error("กรุณากรอกยอดชำระรวมจาก statement ให้ถูกต้อง");
      return;
    }

    setIsBulkSubmitting(true);
    setBulkErrors([]);
    setBulkProgressText("เริ่มประมวลผล...");

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
          `กำลังประมวลผล ${i + 1}/${sortedSelectedPendingQueueItems.length} (${item.poNumber})`,
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
              note: paymentNote || `รอบชำระ ${paymentReference}`,
            }),
          },
        );
        const finalizeData = (await finalizeRes.json().catch(() => null)) as
          | { message?: string; purchaseOrder?: PurchaseOrderDetail }
          | null;
        if (!finalizeRes.ok) {
          errors.push(
            `${item.poNumber}: ปิดเรทไม่สำเร็จ (${finalizeData?.message ?? "unknown"})`,
          );
          continue;
        }
        finalizedCount += 1;

        const detailResult = await loadPoDetail(item.id, { preferCache: false });
        if (!detailResult.purchaseOrder) {
          errors.push(
            `${item.poNumber}: โหลดยอดค้างหลังปิดเรทไม่สำเร็จ (${detailResult.error ?? "unknown"})`,
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
            `${item.poNumber}: บันทึกชำระไม่สำเร็จ (${settleData?.message ?? "unknown"})`,
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
          `ปิดเรทสำเร็จ ${finalizedCount}/${sortedSelectedPendingQueueItems.length} รายการ`,
        );
      }
      if (settledCount > 0) {
        toast.success(
          `บันทึกชำระสำเร็จ ${settledCount}/${sortedSelectedPendingQueueItems.length} รายการ (รวม ${fmtPrice(
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
        setSelectedPendingQueueIds([]);
        setIsBulkMonthEndMode(false);
      }

      setBulkErrors(errors);
      await reloadFirstPage();
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จระหว่างประมวลผลแบบกลุ่ม");
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
    setProductSearch("");
    setIsProductPickerOpen(false);
    setItems([]);
    setShippingCost("0");
    setOtherCost("0");
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
        unitCostPurchase: "0",
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
        toast.error(data?.message ?? "สร้างใบสั่งซื้อไม่สำเร็จ");
        return;
      }
      toast.success(
        receiveImmediately
          ? "สร้างใบสั่งซื้อ + รับสินค้าเรียบร้อย"
          : "สร้างใบสั่งซื้อเรียบร้อย",
      );
      if (
        data?.purchaseOrder?.purchaseCurrency &&
        data.purchaseOrder.purchaseCurrency !== storeCurrency &&
        !data.purchaseOrder.exchangeRateLockedAt
      ) {
        toast("PO นี้อยู่สถานะรอปิดเรท สามารถปิดเรทจริงได้ภายหลัง", {
          icon: "🧾",
        });
      }
      forceCloseCreateSheet();
      await reloadFirstPage();
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
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
        toast.error(data?.message ?? "อัปเดตสถานะไม่สำเร็จ");
        return;
      }
      toast.success(`อัปเดตสถานะเป็น "${statusConfig[status].label}" เรียบร้อย`);
      invalidatePoDetailCache(poId);
      await reloadFirstPage();
      setSelectedPO(null);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
    }
  };

  /* ── Style helpers ── */
  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

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
  const createSupplierDatalistId = useId();
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
    if (activeKpiShortcut === "OPEN_PO") return "Open PO: กรองเฉพาะงานที่ยังเปิด";
    if (activeKpiShortcut === "PENDING_RATE") return "Pending Rate: โฟกัสงานปิดเรทปลายเดือน";
    if (activeKpiShortcut === "OVERDUE_AP") {
      return "Overdue AP: AP by Supplier + due status = OVERDUE";
    }
    if (activeKpiShortcut === "OUTSTANDING_AP") {
      return "Outstanding: AP by Supplier + เรียงยอดค้างมากสุด";
    }
    return null;
  }, [activeKpiShortcut]);

  return (
    <div className="space-y-3">
      {/* ── Header row: title + "+" button ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">ใบสั่งซื้อ</h2>
          <p className="text-[11px] text-slate-500">
            {poList.length > 0 ? `${poList.length} รายการ` : "ยังไม่มีรายการ"}
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
              สร้างใบสั่งซื้อ
            </button>
          </div>
        )}
      </div>
      <StockTabToolbar
        isRefreshing={isRefreshingList}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => {
          void reloadFirstPage();
        }}
      />
      <div className="sticky top-2 z-10 rounded-2xl border border-slate-200 bg-white/95 p-2 backdrop-blur md:static md:z-auto md:bg-white md:p-2 md:backdrop-blur-0">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          โหมดการทำงาน
        </p>
        <div className="mt-1 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              {
                id: "OPERATIONS" as PurchaseWorkspace,
                label: "PO Operations",
                icon: ShoppingCart,
                desc: "สร้าง/ติดตามสถานะ PO",
                badge: workspaceSummary.openPoCount,
              },
              {
                id: "MONTH_END" as PurchaseWorkspace,
                label: "Month-End Close",
                icon: Banknote,
                desc: "ปิดเรทและชำระปลายเดือน",
                badge: workspaceSummary.pendingRateCount,
              },
              {
                id: "SUPPLIER_AP" as PurchaseWorkspace,
                label: "AP by Supplier",
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
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => handleWorkspaceChange(workspace.id)}
              >
                <WorkspaceIcon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{workspace.label}</span>
                {workspace.badge > 0 ? (
                  <span
                    className={`inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {workspace.badge.toLocaleString("th-TH")}
                  </span>
                ) : null}
                <span
                  className={`hidden text-[11px] sm:inline ${
                    isActive ? "text-white/80" : "text-slate-500"
                  }`}
                >
                  {workspace.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          ตัวชี้วัดและทางลัด
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          การ์ด KPI เป็นข้อมูลสรุป (ไม่รองรับการคลิก)
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div
            className="rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-left"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Open PO
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {workspaceSummary.openPoCount.toLocaleString("th-TH")}
            </p>
            <p className="text-[11px] text-slate-500">งานสั่งซื้อรายวัน</p>
          </div>
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-left"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Pending Rate
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {workspaceSummary.pendingRateCount.toLocaleString("th-TH")}
            </p>
            <p className="text-[11px] text-slate-500">คิวปิดเรทปลายเดือน</p>
          </div>
          <div
            className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-left"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Overdue AP
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {workspaceSummary.overduePoCount.toLocaleString("th-TH")}
            </p>
            <p className="text-[11px] text-slate-500">
              ใกล้ครบกำหนด {workspaceSummary.dueSoonPoCount.toLocaleString("th-TH")}
            </p>
          </div>
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-left"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Outstanding
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {fmtPrice(workspaceSummary.outstandingBase, storeCurrency)}
            </p>
            <p className="text-[11px] text-slate-500">ดู AP ราย supplier</p>
          </div>
        </div>
        {activeKpiShortcutLabel ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-600">
              Applied filter: {activeKpiShortcutLabel}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={saveCurrentShortcutPreset}
              >
                บันทึก preset นี้
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={clearKpiShortcut}
              >
                ล้างตัวกรองด่วน
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
                  aria-label={`ลบ preset ${preset.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {workspaceTab === "MONTH_END" ? (
      <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              คิว PO รอปิดเรท
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
            Export CSV
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
            placeholder="กรองซัพพลายเออร์"
            value={pendingSupplierFilter}
            onChange={(event) => setPendingSupplierFilter(event.target.value)}
          />
          <input
            type="date"
            className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
            value={pendingReceivedFrom}
            onChange={(event) => setPendingReceivedFrom(event.target.value)}
          />
          <input
            type="date"
            className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
            value={pendingReceivedTo}
            onChange={(event) => setPendingReceivedTo(event.target.value)}
          />
        </div>
        {isLoadingPendingQueue ? (
          <p className="text-xs text-amber-700">กำลังโหลดคิวรอปิดเรท...</p>
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
              ลองใหม่
            </Button>
          </div>
        ) : pendingRateQueue.length === 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-4 text-center">
            <p className="text-xs text-amber-700/90">ไม่มี PO ที่รอปิดเรทตามเงื่อนไข</p>
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
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                  onClick={clearPendingQueueSelection}
                  disabled={isBulkSubmitting}
                >
                  ล้างเลือก
                </button>
                <button
                  type="button"
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  onClick={openBulkMonthEndMode}
                  disabled={selectedPendingQueueIds.length === 0 || isBulkSubmitting}
                >
                  ปิดเรท + ชำระปลายเดือน
                </button>
              </div>
            </div>
            {hasMixedPendingCurrencies ? (
              <p className="text-[11px] text-red-600">
                รายการที่เลือกมีหลายสกุลเงิน กรุณาเลือกทีละสกุลเพื่อปิดเรทแบบกลุ่ม
              </p>
            ) : null}
            {isBulkMonthEndMode ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-white p-3">
                <p className="text-xs font-semibold text-amber-800">
                  ปิดเรท + บันทึกชำระแบบกลุ่ม (รอบบัตรปลายเดือน)
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
                      placeholder="เช่น 690"
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600">วันที่ชำระ (top-up date)</label>
                    <input
                      type="date"
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-300"
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
                      placeholder={`เช่น 12,500,000 ${storeCurrency}`}
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
                    ยกเลิก
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
                      "เริ่มปิดเรท + ชำระ"
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
          prefetchPoDetail(poId);
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
            { id: "ALL" as StatusFilter, label: "ทั้งหมด" },
            { id: "OPEN" as StatusFilter, label: "งานเปิด" },
            { id: "DRAFT" as StatusFilter, label: "ร่าง" },
            { id: "ORDERED" as StatusFilter, label: "สั่งแล้ว" },
            { id: "SHIPPED" as StatusFilter, label: "จัดส่ง" },
            { id: "RECEIVED" as StatusFilter, label: "รับแล้ว" },
            { id: "CANCELLED" as StatusFilter, label: "ยกเลิก" },
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
        <StockTabLoadingState message="กำลังอัปเดตรายการใบสั่งซื้อ..." />
      ) : listError && poList.length === 0 ? (
        <StockTabErrorState
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
              ? "ยังไม่มีใบสั่งซื้อ"
              : statusFilter === "OPEN"
                ? "ยังไม่มีงานเปิด"
                : "ไม่มีรายการในสถานะนี้"}
          </p>
          {canCreate && (statusFilter === "ALL" || statusFilter === "OPEN") && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
              onClick={openCreateSheet}
            >
              <Plus className="h-4 w-4" />
              สร้างใบสั่งซื้อใหม่
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
                onMouseEnter={() => prefetchPoDetail(po.id)}
                onFocus={() => prefetchPoDetail(po.id)}
                onTouchStart={() => prefetchPoDetail(po.id)}
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
                        {cfg.label}
                      </span>
                    </div>
                    {po.supplierName && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {po.supplierName} ({po.purchaseCurrency})
                      </p>
                    )}
                    {isExchangeRatePending && (
                      <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        รอปิดเรท
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
                          ? "ชำระแล้ว"
                          : po.paymentStatus === "PARTIAL"
                            ? "ชำระบางส่วน"
                            : "ยังไม่ชำระ"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {po.itemCount} รายการ ·{" "}
                      {fmtPrice(po.totalCostBase + po.shippingCost + po.otherCost, storeCurrency)}
                      {po.status === "RECEIVED" ? ` · ค้าง ${fmtPrice(po.outstandingBase, storeCurrency)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <div className="mt-2">
                  <div className="space-y-1 text-[11px] text-slate-600">
                    {/* Timeline based on status */}
                    {po.status === "DRAFT" && (
                      <div>สั่งเมื่อ {formatDate(po.createdAt)}</div>
                    )}
                    {po.status === "ORDERED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}
                        {po.orderedAt && (
                          <>
                            {" "}
                            → ยืนยันเมื่อ {formatDate(po.orderedAt)}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "SHIPPED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}
                        {po.shippedAt && (
                          <>
                            {" "}
                            → จัดส่งเมื่อ {formatDate(po.shippedAt)}
                          </>
                        )}
                        {po.expectedAt && (
                          <>
                            {" "}
                            → คาดว่า {formatDate(po.expectedAt)}
                          </>
                        )}
                      </div>
                    )}
                    {po.status === "RECEIVED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}
                        {po.shippedAt && (
                          <>
                            {" "}
                            → จัดส่งเมื่อ {formatDate(po.shippedAt)}
                          </>
                        )}
                        {po.receivedAt && (
                          <>
                            {" "}
                            → รับเมื่อ {formatDate(po.receivedAt)}
                          </>
                        )}
                      </div>
                    )}
    {po.status === "CANCELLED" && (
                      <div>
                        สั่งเมื่อ {formatDate(po.createdAt)}{" "}
                        {po.cancelledAt && (
                          <>
                            · <span className="text-red-600">ยกเลิกเมื่อ {formatDate(po.cancelledAt)}</span>
                          </>
                        )}
                        {!po.cancelledAt && (
                          <>
                            · <span className="text-red-600">ยกเลิก</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {remaining !== null && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">ความคืบหน้า</span>
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
                          ? "เลยกำหนด"
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
                {isLoadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
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
        title="สร้างใบสั่งซื้อ"
        description={`ขั้นตอน ${wizardStep}/3`}
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
            ยกเลิก
          </Button>
        }
      >
            {/* Step 1: Info */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    ชื่อซัพพลายเออร์ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    list={createSupplierDatalistId}
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="เช่น ร้านสมชาย, ตลาดเช้า"
                  />
                  {supplierNameOptions.length > 0 ? (
                    <p className="text-[11px] text-slate-500">
                      เลือกชื่อซัพพลายเออร์จากรายการเดิมได้ หรือพิมพ์ชื่อใหม่เอง
                    </p>
                  ) : null}
                  <datalist id={createSupplierDatalistId}>
                    {supplierNameOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    เบอร์ติดต่อ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    placeholder="020-xxxx-xxxx"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    สกุลเงินที่ซื้อ
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
                      อัตราแลกเปลี่ยนจริง (ถ้าทราบ)
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
                      ถ้ายังไม่ทราบเรทตอนนี้ สามารถเว้นว่างได้ แล้วไปกด{" "}
                      <span className="font-medium">ปิดเรท</span> หลังรับสินค้า/ตอนชำระจริง
                    </p>
                  </div>
                )}
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={() => setWizardStep(2)}
                >
                  ถัดไป →
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
                      เพิ่มสินค้า
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
                      {isProductPickerOpen ? "ซ่อนรายการสินค้า" : "ดูสินค้าทั้งหมด"}
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
                    placeholder="🔍 ค้นหาสินค้า..."
                  />
                  <p className="text-[11px] text-slate-500">
                    ค้นหาด้วยชื่อหรือ SKU หรือกดปุ่มเพื่อเลือกจากรายการ
                  </p>
                  {(isProductPickerOpen || productSearch) && (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {loadingProducts ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          กำลังโหลด...
                        </p>
                      ) : visibleProductPickerOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">
                          {productSearch ? "ไม่พบสินค้าที่ค้นหา" : "ไม่มีสินค้าให้เลือก"}
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
                    ยังไม่ได้เพิ่มสินค้า
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
                              จำนวน
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
                              ราคา/{currencySymbol(purchaseCurrency)}
                            </label>
                            <input
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                              type="number"
                              inputMode="numeric"
                              value={item.unitCostPurchase}
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
                    ← ย้อนกลับ
                  </Button>
                  <Button
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setWizardStep(3)}
                    disabled={items.length === 0}
                  >
                    ถัดไป →
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
                      ค่าขนส่ง ({currencySymbol(storeCurrency)})
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="numeric"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      ค่าอื่นๆ ({currencySymbol(storeCurrency)})
                    </label>
                    <input
                      className={fieldClassName}
                      type="number"
                      inputMode="numeric"
                      value={otherCost}
                      onChange={(e) => setOtherCost(e.target.value)}
                    />
                  </div>
                </div>
                {Number(otherCost) > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      หมายเหตุค่าอื่นๆ
                    </label>
                    <input
                      className={fieldClassName}
                      value={otherCostNote}
                      onChange={(e) => setOtherCostNote(e.target.value)}
                      placeholder="เช่น ค่าภาษี, ค่าดำเนินการ"
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      คาดว่าจะได้รับ (ไม่บังคับ)
                    </label>
                    <input
                      className={fieldClassName}
                      type="date"
                      value={expectedAt}
                      onChange={(e) => setExpectedAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      ครบกำหนดชำระ (due date)
                    </label>
                    <input
                      className={fieldClassName}
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    หมายเหตุ (ไม่บังคับ)
                  </label>
                  <input
                    className={fieldClassName}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="หมายเหตุเพิ่มเติม"
                  />
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    สรุป
                  </p>
                  {purchaseCurrency !== storeCurrency && !hasExchangeRateInput && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      ยังไม่ปิดเรทจริง: ระบบจะใช้เรทชั่วคราว 1 เพื่อบันทึก PO และให้ไปปิดเรทภายหลัง
                    </p>
                  )}
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">สินค้า ({items.length} รายการ)</span>
                      <span className="font-medium">
                        {fmtPrice(itemsTotalBase, storeCurrency)}
                      </span>
                    </div>
                    {shipping > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">ค่าขนส่ง</span>
                        <span>{fmtPrice(shipping, storeCurrency)}</span>
                      </div>
                    )}
                    {other > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">ค่าอื่นๆ</span>
                        <span>{fmtPrice(other, storeCurrency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                      <span>รวมทั้งหมด</span>
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
                  ← ย้อนกลับ
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
                        toast.error(data?.message ?? "สร้างไม่สำเร็จ");
                        return;
                      }
                      // Now set it to ORDERED
                      const poId = data.purchaseOrder.id;
                      await authFetch(`/api/stock/purchase-orders/${poId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "ORDERED" }),
                      });
                      toast.success("สร้างใบสั่งซื้อ + ยืนยันสั่งแล้ว");
                      forceCloseCreateSheet();
                      await reloadFirstPage();
                      router.refresh();
                    } catch {
                      toast.error("เชื่อมต่อไม่สำเร็จ");
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
                  ยืนยันสั่งซื้อ
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
        setDetailError(result.error ?? "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ");
      }
    },
    [loadPoDetail],
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
        setDetailError(result.error ?? "โหลดรายละเอียดใบสั่งซื้อไม่สำเร็จ");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [getCachedPoDetail, loadPoDetail, poId]);

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
      toast.error("กรุณากรอกอัตราแลกเปลี่ยนจริงให้ถูกต้อง");
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
        toast.error(data?.message ?? "ปิดเรทไม่สำเร็จ");
        return;
      }

      const updatedPo = data?.purchaseOrder;
      if (updatedPo) {
        setPo(updatedPo);
        onCacheUpdate(updatedPo);
      }
      setIsFinalizeRateMode(false);
      setFinalRateNoteInput("");
      toast.success("ปิดเรทเรียบร้อย");
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setIsFinalizingRate(false);
    }
  }, [finalRateInput, finalRateNoteInput, onCacheUpdate, onRefreshList, po, router]);

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
      toast.error("กรุณากรอกยอดชำระให้ถูกต้อง");
      return;
    }
    if (amountBase > po.outstandingBase) {
      toast.error("ยอดชำระเกินยอดค้าง");
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
        toast.error(data?.message ?? "บันทึกชำระไม่สำเร็จ");
        return;
      }

      const updatedPo = data?.purchaseOrder;
      if (updatedPo) {
        setPo(updatedPo);
        onCacheUpdate(updatedPo);
      }
      setIsSettleMode(false);
      toast.success("บันทึกชำระเรียบร้อย");
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
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
      toast.error("กรุณากรอกค่าขนส่งให้ถูกต้อง");
      return;
    }
    if (!Number.isFinite(otherCost) || otherCost < 0) {
      toast.error("กรุณากรอกค่าอื่นๆ ให้ถูกต้อง");
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
        toast.error(data?.message ?? "อัปเดตค่าขนส่ง/ค่าอื่นไม่สำเร็จ");
        return;
      }
      if (data?.purchaseOrder) {
        setPo(data.purchaseOrder);
        onCacheUpdate(data.purchaseOrder);
      }
      setIsApplyExtraCostMode(false);
      toast.success("อัปเดตค่าขนส่ง/ค่าอื่นเรียบร้อย");
      await onRefreshList();
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
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
          toast.error(data?.message ?? "ย้อนรายการชำระไม่สำเร็จ");
          return;
        }
        if (data?.purchaseOrder) {
          setPo(data.purchaseOrder);
          onCacheUpdate(data.purchaseOrder);
        }
        toast.success("ย้อนรายการชำระเรียบร้อย");
        await onRefreshList();
        router.refresh();
      } catch {
        toast.error("เชื่อมต่อไม่สำเร็จ");
      } finally {
        setReversingPaymentId(null);
      }
    },
    [onCacheUpdate, onRefreshList, po, router],
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
      toast.error("ต้องมีอย่างน้อย 1 รายการสินค้า");
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
        toast.error(data?.message ?? "อัปเดต PO ไม่สำเร็จ");
        return;
      }

      const updatedPo = data.purchaseOrder as PurchaseOrderDetail;
      setPo(updatedPo);
      onCacheUpdate(updatedPo);
      setIsEditMode(false);
      toast.success("บันทึกการแก้ไข PO เรียบร้อย");
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isOpen = poId !== null;

  return (
    <SlideUpSheet
      isOpen={isOpen}
      onClose={onClose}
      title={po?.poNumber ?? "รายละเอียด"}
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
                        {cfg?.label ?? po.status}
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
                          ? "ต้องปิดเรทก่อนบันทึกชำระ"
                          : undefined
                      }
                    >
                      <Banknote className="mr-1 h-3.5 w-3.5" />
                      บันทึกชำระ
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
                      อัปเดตค่าส่ง/ค่าอื่น
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
                      ปิดเรท
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
                      แก้ไข
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
                        toast.success("ดาวน์โหลด PDF เรียบร้อย");
                      } catch {
                        toast.error("สร้าง PDF ไม่สำเร็จ");
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
                          const result = await shareOrDownload(blob, `${po.poNumber}.pdf`, `ใบสั่งซื้อ ${po.poNumber}`);
                          if (result === "downloaded") toast.success("ดาวน์โหลด PDF เรียบร้อย");
                        } catch {
                          toast.error("แชร์ PDF ไม่สำเร็จ");
                        } finally {
                          setIsGeneratingPdf(false);
                        }
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      แชร์
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
                    เรทอ้างอิง: 1 {po.purchaseCurrency} = {po.exchangeRate} {storeCurrency}
                  </p>
                  <p className="mt-1">
                    เรทตั้งต้นตอนสร้าง PO: 1 {po.purchaseCurrency} = {po.exchangeRateInitial} {storeCurrency}
                  </p>
                  {isExchangeRatePending ? (
                    <p className="mt-1">
                      สถานะ: รอปิดเรทจริง (แนะนำปิดเรทตอนชำระจริงปลายงวด)
                    </p>
                  ) : (
                    <p className="mt-1">
                      สถานะ: ปิดเรทแล้ว
                      {po.exchangeRateLockedAt
                        ? ` เมื่อ ${formatDate(po.exchangeRateLockedAt)}`
                        : ""}
                      {po.exchangeRate !== po.exchangeRateInitial
                        ? ` · ส่วนต่างเรท ${po.exchangeRate - po.exchangeRateInitial > 0 ? "+" : ""}${po.exchangeRate - po.exchangeRateInitial}`
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
                    สถานะชำระ: {po.paymentStatus === "PAID"
                      ? "ชำระแล้ว"
                      : po.paymentStatus === "PARTIAL"
                        ? "ชำระบางส่วน"
                        : "ยังไม่ชำระ"}
                  </p>
                  <p className="mt-1">
                    จ่ายแล้ว {fmtPrice(po.totalPaidBase, storeCurrency)} · ค้าง {fmtPrice(po.outstandingBase, storeCurrency)}
                  </p>
                  {po.paymentStatus === "PAID" || po.paymentStatus === "PARTIAL" ? (
                    <p className="mt-1">
                      {po.paidAt ? `ชำระเมื่อ ${formatDate(po.paidAt)}` : "บันทึกชำระแล้ว"}
                      {po.paidByName ? ` · โดย ${po.paidByName}` : ""}
                      {po.paymentReference ? ` · อ้างอิง ${po.paymentReference}` : ""}
                      {po.paymentNote ? ` · ${po.paymentNote}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1">
                      {isExchangeRatePending
                        ? "ยังปิดเรทไม่ครบ: ต้องปิดเรทก่อนบันทึกชำระ"
                        : "พร้อมบันทึกชำระเมื่อจ่ายจริง"}
                    </p>
                  )}
                </div>
              )}

              {isFinalizeRateMode && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                    ปิดเรทแลกเปลี่ยนจริง
                  </p>
                  <div className="space-y-1">
                    <label className="text-[11px] text-amber-700">
                      อัตราแลกเปลี่ยนจริง (1 {po.purchaseCurrency} = ? {storeCurrency})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      value={finalRateInput}
                      onChange={(event) => setFinalRateInput(event.target.value)}
                      placeholder="เช่น 670"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-amber-700">
                      หมายเหตุการปิดเรท (ไม่บังคับ)
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-amber-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      value={finalRateNoteInput}
                      onChange={(event) => setFinalRateNoteInput(event.target.value)}
                      placeholder="เช่น ชำระปลายเดือน/อ้างอิงใบแจ้งหนี้"
                    />
                  </div>
                  <p className="text-[11px] text-amber-700/90">
                    หมายเหตุ: การปิดเรทจะอัปเดตราคาฐานใน PO นี้สำหรับการอ้างอิงบัญชี ไม่ย้อนแก้เอกสารที่ปิดไปแล้ว
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-amber-200 bg-white text-xs text-amber-700 hover:bg-amber-100"
                      onClick={() => setIsFinalizeRateMode(false)}
                      disabled={isFinalizingRate}
                    >
                      ยกเลิก
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
                        "ยืนยันปิดเรท"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isSettleMode && (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    บันทึกชำระ PO
                  </p>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      ยอดชำระ ({storeCurrency})
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settleAmountInput}
                      onChange={(event) => setSettleAmountInput(event.target.value)}
                    />
                    <p className="text-[11px] text-emerald-700/90">
                      ยอดค้างปัจจุบัน {fmtPrice(po.outstandingBase, storeCurrency)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      วันที่ชำระ
                    </label>
                    <input
                      type="date"
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settlePaidAtInput}
                      onChange={(event) => setSettlePaidAtInput(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      เลขอ้างอิงชำระ (ไม่บังคับ)
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                      value={settleReferenceInput}
                      onChange={(event) => setSettleReferenceInput(event.target.value)}
                      placeholder="เช่น Statement ปลายเดือน / เลขใบแจ้งหนี้"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-emerald-700">
                      หมายเหตุ (ไม่บังคับ)
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
                      ยกเลิก
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
                        "ยืนยันบันทึกชำระ"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isApplyExtraCostMode && (
                <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                    อัปเดตค่าขนส่ง/ค่าอื่นหลังรับสินค้า
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-sky-700">
                        ค่าขนส่ง ({storeCurrency})
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
                        ค่าอื่นๆ ({storeCurrency})
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
                      หมายเหตุค่าอื่นๆ (ไม่บังคับ)
                    </label>
                    <input
                      className="h-9 w-full rounded-lg border border-sky-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300"
                      value={extraCostOtherNoteInput}
                      onChange={(event) => setExtraCostOtherNoteInput(event.target.value)}
                      placeholder="เช่น ค่าขนส่งปลายเดือน / ค่าบริการเพิ่มเติม"
                    />
                  </div>
                  <p className="text-[11px] text-sky-700/90">
                    ยอดรวมใหม่ {fmtPrice(extraCostGrandTotalPreview, storeCurrency)} ·
                    คงค้างใหม่{" "}
                    {fmtPrice(Math.max(0, extraCostOutstandingPreview), storeCurrency)}
                  </p>
                  <p className="text-[11px] text-sky-700/90">
                    หมายเหตุ: อัปเดตยอด AP/statement ทันที แต่ไม่ปรับต้นทุนสินค้าแบบย้อนย้อนหลัง
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-sky-200 bg-white text-xs text-sky-700 hover:bg-sky-100"
                      onClick={() => setIsApplyExtraCostMode(false)}
                      disabled={isApplyingExtraCost}
                    >
                      ยกเลิก
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
                        "ยืนยันอัปเดต"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {po.status === "RECEIVED" && po.paymentEntries.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    ประวัติการชำระ
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
                                {entry.entryType === "PAYMENT" ? "ชำระ" : "ย้อนรายการ"}
                                {" · "}
                                {entry.paidAt ? formatDate(entry.paidAt) : "-"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {entry.createdByName ? `โดย ${entry.createdByName}` : "โดยระบบ"}
                                {entry.reference ? ` · อ้างอิง ${entry.reference}` : ""}
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
                                    "ย้อนรายการ"
                                  )}
                                </Button>
                              ) : null}
                              {entry.entryType === "PAYMENT" && isReversed ? (
                                <p className="mt-1 text-[10px] text-slate-500">ถูกย้อนแล้ว</p>
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
                    แก้ไข PO
                  </p>

                  {isDraftEditable && (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">ซัพพลายเออร์</label>
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
                          <label className="text-[11px] text-slate-500">เบอร์ติดต่อ</label>
                          <input
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
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
                          <label className="text-[11px] text-slate-500">สกุลเงิน</label>
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
                          <label className="text-[11px] text-slate-500">อัตราแลกเปลี่ยน</label>
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
                              เว้นว่างได้ถ้ายังไม่ทราบเรทจริง (ระบบจะตั้งเป็นรอปิดเรท)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">ค่าขนส่ง</label>
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
                          <label className="text-[11px] text-slate-500">ค่าอื่นๆ</label>
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
                        <label className="text-[11px] text-slate-500">หมายเหตุค่าอื่นๆ</label>
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
                        <p className="text-[11px] text-slate-500">รายการสินค้า</p>
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

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500">วันที่คาดรับ</label>
                      <input
                        type="date"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.expectedAt}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            expectedAt: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500">ครบกำหนดชำระ</label>
                      <input
                        type="date"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.dueDate}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            dueDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500">Tracking</label>
                      <input
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
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
                    <label className="text-[11px] text-slate-500">หมายเหตุ</label>
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
                      ยกเลิก
                    </Button>
                    <Button
                      className="h-10 rounded-lg"
                      onClick={saveEdit}
                      disabled={isSavingEdit}
                    >
                      {isSavingEdit ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "บันทึกการแก้ไข"
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
                    {formatDate(po.createdAt)} สร้าง
                    {po.createdByName ? ` โดย ${po.createdByName}` : ""}
                  </div>
                )}
                {po.orderedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {formatDate(po.orderedAt)} ยืนยันสั่งซื้อ
                  </div>
                )}
                {po.shippedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {formatDate(po.shippedAt)} จัดส่ง
                    {po.trackingInfo ? ` (${po.trackingInfo})` : ""}
                  </div>
                )}
                {po.receivedAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {formatDate(po.receivedAt)} รับสินค้าแล้ว
                  </div>
                )}
                {po.paidAt && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                    {formatDate(po.paidAt)} บันทึกชำระแล้ว
                    {po.paidByName ? ` โดย ${po.paidByName}` : ""}
                  </div>
                )}
                {po.expectedAt &&
                  po.status !== "RECEIVED" &&
                  po.status !== "CANCELLED" && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white" />
                      คาดว่า {formatDate(po.expectedAt)}
                    </div>
                  )}
                {po.dueDate && po.outstandingBase > 0 && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white" />
                    ครบกำหนดชำระ {formatDate(po.dueDate)}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  รายการสินค้า ({po.items.length})
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
                              (ได้รับ {item.qtyReceived})
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
                  <span className="text-slate-600">สินค้า</span>
                  <span>{fmtPrice(po.totalCostBase, storeCurrency)}</span>
                </div>
                {po.shippingCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">ค่าขนส่ง</span>
                    <span>{fmtPrice(po.shippingCost, storeCurrency)}</span>
                  </div>
                )}
                {po.otherCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">ค่าอื่นๆ</span>
                    <span>{fmtPrice(po.otherCost, storeCurrency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>รวม</span>
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
                        ยกเลิก
                      </Button>
                      <Button
                        className="h-11 rounded-xl text-xs"
                        onClick={() => handleStatusChange("ORDERED")}
                        disabled={updating}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "ยืนยันสั่งซื้อ"
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
                            ซัพพลายเออร์ส่งแล้ว
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
                            รับสินค้า
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
                            รับสินค้า
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 w-full rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => handleStatusChange("CANCELLED")}
                        disabled={updating}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-slate-400">{detailError ?? "ไม่พบข้อมูล"}</p>
              {poId && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    void retryLoadDetail();
                  }}
                >
                  ลองใหม่
                </Button>
              )}
            </div>
          )}
      </div>
    </SlideUpSheet>
  );
}
