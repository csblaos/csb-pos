"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  ArrowUpDown,
  ChevronRight,
  Copy,
  ListFilter,
  Minus,
  Package,
  Pencil,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch } from "@/lib/auth/client-token";
import type {
  CategoryItem,
  ProductListItem,
  ProductSummaryCounts,
  UnitOption,
} from "@/lib/products/service";
import {
  type ProductUpsertFormInput,
  type ProductUpsertInput,
  productUpsertSchema,
} from "@/lib/products/validation";
import { currencySymbol, type StoreCurrency } from "@/lib/finance/store-financial";

/* ─── Types ─── */

type ProductsManagementProps = {
  products: ProductListItem[];
  initialTotalCount: number;
  initialSummaryCounts: ProductSummaryCounts;
  units: UnitOption[];
  categories: CategoryItem[];
  currency: StoreCurrency;
  storeOutStockThreshold: number;
  storeLowStockThreshold: number;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canViewCost: boolean;
  canUpdateCost: boolean;
};

type StatusFilter = "all" | "active" | "inactive";
type SortOption = "newest" | "name-asc" | "name-desc" | "price-asc" | "price-desc";
type DetailTab = "info" | "price" | "cost" | "conversions";
type MatrixVariantOption = {
  attributeCode: string;
  attributeName: string;
  valueCode: string;
  valueName: string;
};
type MatrixVariantRow = {
  id: string;
  variantLabel: string;
  sku: string;
  barcode: string;
  sortOrder: number;
  options: MatrixVariantOption[];
};

/* ─── Helpers ─── */

const PRODUCT_PAGE_SIZE = 30;

const fmtNumber = (n: number) => n.toLocaleString("th-TH");
const fmtPrice = (n: number, cur: StoreCurrency) =>
  `${currencySymbol(cur)}${n.toLocaleString("th-TH")}`;
const LAO_TO_LATIN_MAP: Record<string, string> = {
  "ກ": "k",
  "ຂ": "kh",
  "ຄ": "kh",
  "ງ": "ng",
  "ຈ": "ch",
  "ສ": "s",
  "ຊ": "s",
  "ຍ": "ny",
  "ດ": "d",
  "ຕ": "t",
  "ຖ": "th",
  "ທ": "th",
  "ນ": "n",
  "ບ": "b",
  "ປ": "p",
  "ຜ": "ph",
  "ຝ": "f",
  "ພ": "ph",
  "ຟ": "f",
  "ມ": "m",
  "ຢ": "y",
  "ຣ": "r",
  "ລ": "l",
  "ວ": "v",
  "ຫ": "h",
  "ໜ": "hn",
  "ໝ": "hm",
  "ອ": "o",
  "ຮ": "h",
  "ະ": "a",
  "າ": "aa",
  "ິ": "i",
  "ີ": "ii",
  "ຶ": "ue",
  "ື": "uue",
  "ຸ": "u",
  "ູ": "uu",
  "ເ": "e",
  "ແ": "ae",
  "ໂ": "o",
  "ໃ": "ai",
  "ໄ": "ai",
  "ັ": "a",
  "ົ": "o",
  "ໍ": "o",
  "໐": "0",
  "໑": "1",
  "໒": "2",
  "໓": "3",
  "໔": "4",
  "໕": "5",
  "໖": "6",
  "໗": "7",
  "໘": "8",
  "໙": "9",
};
const LAO_IGNORED_MARKS = new Set(["່", "້", "໊", "໋", "໌", "ໆ"]);
const transliterateLaoToLatin = (value: string) => {
  let output = "";
  for (const char of value) {
    if (LAO_IGNORED_MARKS.has(char)) continue;
    output += LAO_TO_LATIN_MAP[char] ?? char;
  }
  return output;
};
const toSkuBaseCandidate = (value: string) =>
  transliterateLaoToLatin(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const toCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "option";
const parseMatrixValues = (raw: string) =>
  [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const defaultValues = (baseUnitId: string): ProductUpsertFormInput => ({
  sku: "",
  name: "",
  barcode: "",
  baseUnitId,
  priceBase: 0,
  costBase: 0,
  outStockThreshold: "",
  lowStockThreshold: "",
  categoryId: "",
  conversions: [],
  variant: {
    enabled: false,
    modelName: "",
    variantLabel: "",
    variantSortOrder: 0,
    options: [],
  },
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Main Component
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export function ProductsManagement({
  products: initialProducts,
  initialTotalCount,
  initialSummaryCounts,
  units,
  categories: initialCategories,
  currency,
  storeOutStockThreshold,
  storeLowStockThreshold,
  canCreate,
  canUpdate,
  canArchive,
  canViewCost,
  canUpdateCost,
}: ProductsManagementProps) {
  const router = useRouter();

  /* ── Data state ── */
  const [productItems, setProductItems] = useState(initialProducts);
  const [totalMatchingCount, setTotalMatchingCount] = useState(initialTotalCount);
  const [summaryCounts, setSummaryCounts] = useState(initialSummaryCounts);
  const [categories, setCategories] = useState(initialCategories);
  const [isListLoading, setIsListLoading] = useState(false);
  const productListRequestIdRef = useRef(0);
  const hasInitializedListEffectRef = useRef(false);
  const submitIntentRef = useRef<"save" | "save-and-next">("save");

  /* ── Filter / search ── */
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [productPage, setProductPage] = useState(1);

  /* ── Sheets ── */
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showScannerSheet, setShowScannerSheet] = useState(false);
  const [showScannerPermissionSheet, setShowScannerPermissionSheet] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [hasSeenScannerPermission, setHasSeenScannerPermission] = useState(false);
  const [scanContext, setScanContext] = useState<"search" | "form">("search");
  const deactivateConfirmCloseTimerRef = useRef<number | null>(null);
  const detailImageOverlayRef = useRef<HTMLDivElement>(null);
  const detailImageCloseButtonRef = useRef<HTMLButtonElement>(null);
  const deactivateConfirmOverlayRef = useRef<HTMLDivElement>(null);
  const deactivateCancelButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedBeforeImagePreviewRef = useRef<HTMLElement | null>(null);
  const lastFocusedBeforeDeactivateConfirmRef = useRef<HTMLElement | null>(null);

  /* ── Form ── */
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isImageMarkedForRemoval, setIsImageMarkedForRemoval] = useState(false);
  const [matrixAxisOneName, setMatrixAxisOneName] = useState("Color");
  const [matrixAxisOneValues, setMatrixAxisOneValues] = useState("");
  const [matrixAxisTwoName, setMatrixAxisTwoName] = useState("Size");
  const [matrixAxisTwoValues, setMatrixAxisTwoValues] = useState("");
  const [matrixUseSecondAxis, setMatrixUseSecondAxis] = useState(false);
  const [matrixRows, setMatrixRows] = useState<MatrixVariantRow[]>([]);
  const [showVariantCodeFields, setShowVariantCodeFields] = useState(false);
  const [isMatrixSectionExpanded, setIsMatrixSectionExpanded] = useState(false);
  const [skuReferenceName, setSkuReferenceName] = useState("");
  const [showSkuReferenceField, setShowSkuReferenceField] = useState(false);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [isModelSuggestOpen, setIsModelSuggestOpen] = useState(false);
  const [isModelSuggestLoading, setIsModelSuggestLoading] = useState(false);
  const [variantLabelSuggestions, setVariantLabelSuggestions] = useState<string[]>([]);
  const [isVariantLabelSuggestOpen, setIsVariantLabelSuggestOpen] = useState(false);
  const [isVariantLabelSuggestLoading, setIsVariantLabelSuggestLoading] = useState(false);
  const [hasManualVariantSortOrder, setHasManualVariantSortOrder] = useState(false);
  const [hasManualSku, setHasManualSku] = useState(false);
  const modelSuggestRequestIdRef = useRef(0);
  const variantSortRequestIdRef = useRef(0);
  const variantLabelSuggestRequestIdRef = useRef(0);
  const modelSuggestContainerRef = useRef<HTMLDivElement>(null);
  const variantLabelSuggestContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  /* ── Detail ── */
  const [detailProduct, setDetailProduct] = useState<ProductListItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState(0);
  const [showDetailImagePreview, setShowDetailImagePreview] = useState(false);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const [detailContentHeight, setDetailContentHeight] = useState<number | null>(null);

  const getEffectiveStockThresholds = (product: ProductListItem) => {
    const outThreshold = product.outStockThreshold ?? storeOutStockThreshold;
    const lowThreshold = Math.max(
      product.lowStockThreshold ?? storeLowStockThreshold,
      outThreshold,
    );
    const hasOverride =
      product.outStockThreshold !== null || product.lowStockThreshold !== null;

    return {
      outThreshold,
      lowThreshold,
      badgeLabel: hasOverride ? "กำหนดเฉพาะสินค้า" : "ใช้ค่าร้าน",
    };
  };

  /* ── Units lookup ── */
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  /* ── Sync server data ── */
  useEffect(() => setProductItems(initialProducts), [initialProducts]);
  useEffect(() => setTotalMatchingCount(initialTotalCount), [initialTotalCount]);
  useEffect(() => setSummaryCounts(initialSummaryCounts), [initialSummaryCounts]);
  useEffect(() => setCategories(initialCategories), [initialCategories]);

  useLayoutEffect(() => {
    if (!detailContentRef.current) return;
    const nextHeight = detailContentRef.current.getBoundingClientRect().height;
    setDetailContentHeight(nextHeight);
  }, [detailTab, detailProduct, editingCost, costDraft]);

  useEffect(() => {
    const seen = window.localStorage.getItem("scanner-permission-seen") === "1";
    setHasSeenScannerPermission(seen);
  }, []);

  useEffect(() => {
    return () => {
      if (deactivateConfirmCloseTimerRef.current !== null) {
        window.clearTimeout(deactivateConfirmCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showDetailImagePreview) return;
    lastFocusedBeforeImagePreviewRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      detailImageCloseButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDetailImagePreview(false);
        return;
      }

      if (event.key === "Tab") {
        const overlay = detailImageOverlayRef.current;
        if (!overlay) return;
        const focusableElements = overlay.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey) {
          if (activeElement === firstElement || !overlay.contains(activeElement)) {
            event.preventDefault();
            lastElement.focus();
          }
          return;
        }

        if (activeElement === lastElement || !overlay.contains(activeElement)) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      lastFocusedBeforeImagePreviewRef.current?.focus();
      lastFocusedBeforeImagePreviewRef.current = null;
    };
  }, [showDetailImagePreview]);

  /* ── Load-more ── */
  const hasMore = productItems.length < totalMatchingCount;

  /* ── Summary counters ── */
  const totalCount = summaryCounts.total;
  const activeCount = summaryCounts.active;
  const inactiveCount = summaryCounts.inactive;

  /* ── Form setup ── */
  const form = useForm<ProductUpsertFormInput, unknown, ProductUpsertInput>({
    resolver: zodResolver(productUpsertSchema),
    defaultValues: defaultValues(units[0]?.id ?? ""),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "conversions",
  });
  const {
    fields: variantOptionFields,
    append: appendVariantOption,
    remove: removeVariantOption,
  } = useFieldArray({
    control: form.control,
    name: "variant.options",
  });

  const baseUnitId = form.watch("baseUnitId");
  const watchedConversionsRaw = form.watch("conversions");
  const watchedConversions = useMemo(
    () => watchedConversionsRaw ?? [],
    [watchedConversionsRaw],
  );
  const variantForm = form.watch("variant");
  const isVariantEnabled = variantForm?.enabled ?? false;
  const skuField = form.register("sku");
  const nameField = form.register("name");
  const variantModelNameField = form.register("variant.modelName");
  const variantLabelField = form.register("variant.variantLabel");
  const variantSortOrderField = form.register("variant.variantSortOrder");
  const watchedSkuValue = form.watch("sku");
  const watchedNameValue = form.watch("name");
  const watchedCategoryIdValue = form.watch("categoryId");
  const watchedSku = typeof watchedSkuValue === "string" ? watchedSkuValue : "";
  const watchedName = typeof watchedNameValue === "string" ? watchedNameValue : "";
  const watchedCategoryId =
    typeof watchedCategoryIdValue === "string" ? watchedCategoryIdValue : "";
  const watchedVariantModelName =
    typeof variantForm?.modelName === "string" ? variantForm.modelName : "";
  const watchedVariantLabel =
    typeof variantForm?.variantLabel === "string" ? variantForm.variantLabel : "";
  const baseUnit = unitById.get(baseUnitId);
  const knownModelNames = useMemo(
    () =>
      [...new Set(productItems.flatMap((item) => (item.modelName ? [item.modelName] : [])))]
        .sort((a, b) => a.localeCompare(b, "th")),
    [productItems],
  );
  const knownSkus = useMemo(
    () => new Set(productItems.map((item) => item.sku.trim().toUpperCase()).filter(Boolean)),
    [productItems],
  );
  const selectedConversionUnitIds = useMemo(
    () =>
      new Set(
        watchedConversions
          .map((conversion) => conversion?.unitId ?? "")
          .filter((unitId) => unitId.length > 0),
      ),
    [watchedConversions],
  );
  const canUseConversionUnit = useCallback(
    (unitId: string) =>
      unitId.length > 0 &&
      unitId !== baseUnitId &&
      !selectedConversionUnitIds.has(unitId),
    [baseUnitId, selectedConversionUnitIds],
  );
  const nextAvailableConversionUnitId = useMemo(
    () =>
      units.find((unit) => canUseConversionUnit(unit.id))?.id ??
      units.find((unit) => unit.id !== baseUnitId)?.id ??
      units[0]?.id ??
      "",
    [baseUnitId, canUseConversionUnit, units],
  );
  const packUnitTemplate = useMemo(
    () => units.find((unit) => ["PACK", "PK"].includes(unit.code.toUpperCase())),
    [units],
  );
  const boxUnitTemplate = useMemo(
    () =>
      units.find((unit) =>
        ["BOX", "BX", "CTN", "CARTON"].includes(unit.code.toUpperCase()),
      ),
    [units],
  );

  const ensureUniqueSku = useCallback(
    (base: string, currentSku?: string) => {
      const existing = new Set(knownSkus);
      if (currentSku?.trim()) {
        existing.delete(currentSku.trim().toUpperCase());
      }

      let candidate = base.slice(0, 60);
      let counter = 2;

      while (existing.has(candidate.toUpperCase())) {
        const suffix = `-${counter}`;
        const maxBaseLength = Math.max(1, 60 - suffix.length);
        candidate = `${base.slice(0, maxBaseLength)}${suffix}`;
        counter += 1;
      }

      return candidate;
    },
    [knownSkus],
  );

  const deriveFallbackPrefix = useCallback(
    (categoryId: string) => {
      const categoryName =
        categories.find((category) => category.id === categoryId)?.name ?? "";
      const categoryBase = toSkuBaseCandidate(categoryName).replace(/[^A-Z]/g, "").slice(0, 3);

      if (categoryBase.length >= 2) {
        return categoryBase;
      }
      if (categoryName.trim()) {
        return "CAT";
      }
      return "P";
    },
    [categories],
  );

  const getNextRunningSku = useCallback(
    (prefix: string, currentSku?: string) => {
      const normalizedPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "P";
      const regex = new RegExp(`^${normalizedPrefix}-(\\d{6})$`);
      let maxNumber = 0;

      for (const sku of knownSkus) {
        if (currentSku?.trim() && sku === currentSku.trim().toUpperCase()) continue;
        const match = regex.exec(sku);
        if (!match) continue;
        const number = Number(match[1]);
        if (Number.isFinite(number)) {
          maxNumber = Math.max(maxNumber, number);
        }
      }

      const nextNumber = String(maxNumber + 1).padStart(6, "0");
      return `${normalizedPrefix}-${nextNumber}`;
    },
    [knownSkus],
  );

  const suggestSkuFromInputs = useCallback(
    ({
      productName,
      referenceName,
      categoryId,
      currentSku,
    }: {
      productName: string;
      referenceName: string;
      categoryId: string;
      currentSku?: string;
    }) => {
      const preferredText = referenceName.trim() || productName.trim();
      if (!preferredText) return "";

      const transliteratedBase = toSkuBaseCandidate(preferredText);
      if (transliteratedBase) {
        return ensureUniqueSku(transliteratedBase, currentSku);
      }

      const prefix = deriveFallbackPrefix(categoryId);
      return getNextRunningSku(prefix, currentSku);
    },
    [deriveFallbackPrefix, ensureUniqueSku, getNextRunningSku],
  );

  /* ── Image preview ── */
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const fetchModelSuggestions = useCallback(
    async (search: string) => {
      const requestId = ++modelSuggestRequestIdRef.current;
      const normalizedSearch = search.trim();
      setIsModelSuggestLoading(true);

      try {
        const params = new URLSearchParams({
          limit: "10",
        });
        if (normalizedSearch) {
          params.set("q", normalizedSearch);
        }

        const res = await authFetch(`/api/products/models?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as
          | {
              models?: string[];
            }
          | null;

        if (requestId !== modelSuggestRequestIdRef.current) return;

        if (!res.ok) {
          const fallback = normalizedSearch
            ? knownModelNames.filter((name) =>
                name.toLowerCase().includes(normalizedSearch.toLowerCase()),
              )
            : knownModelNames;
          setModelSuggestions(fallback.slice(0, 10));
          return;
        }

        const nextModels = Array.isArray(data?.models)
          ? data.models.filter((name) => typeof name === "string" && name.trim().length > 0)
          : [];
        setModelSuggestions(nextModels.slice(0, 10));
      } catch {
        if (requestId !== modelSuggestRequestIdRef.current) return;
        const fallback = normalizedSearch
          ? knownModelNames.filter((name) =>
              name.toLowerCase().includes(normalizedSearch.toLowerCase()),
            )
          : knownModelNames;
        setModelSuggestions(fallback.slice(0, 10));
      } finally {
        if (requestId === modelSuggestRequestIdRef.current) {
          setIsModelSuggestLoading(false);
        }
      }
    },
    [knownModelNames],
  );

  const getLocalVariantLabelSuggestions = useCallback(
    (modelName: string, search: string) => {
      const normalizedModelName = modelName.trim().toLowerCase();
      if (!normalizedModelName) return [];

      const normalizedSearch = search.trim().toLowerCase();
      const rank = new Map<string, { count: number; label: string }>();

      for (const item of productItems) {
        if ((item.modelName ?? "").trim().toLowerCase() !== normalizedModelName) continue;
        const label = (item.variantLabel ?? "").trim();
        if (!label) continue;
        if (normalizedSearch && !label.toLowerCase().includes(normalizedSearch)) continue;

        const key = label.toLowerCase();
        const current = rank.get(key);
        if (current) {
          current.count += 1;
        } else {
          rank.set(key, { count: 1, label });
        }
      }

      return [...rank.values()]
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"))
        .map((item) => item.label)
        .slice(0, 10);
    },
    [productItems],
  );

  const fetchVariantLabelSuggestions = useCallback(
    async (modelName: string, search: string) => {
      const normalizedModelName = modelName.trim();
      const normalizedSearch = search.trim();

      if (!normalizedModelName) {
        setVariantLabelSuggestions([]);
        return;
      }

      const requestId = ++variantLabelSuggestRequestIdRef.current;
      setIsVariantLabelSuggestLoading(true);

      try {
        const params = new URLSearchParams({
          name: normalizedModelName,
          limit: "10",
        });
        if (normalizedSearch) {
          params.set("variantQ", normalizedSearch);
        }

        const res = await authFetch(`/api/products/models?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as
          | {
              variantLabels?: string[];
            }
          | null;

        if (requestId !== variantLabelSuggestRequestIdRef.current) return;

        if (!res.ok) {
          setVariantLabelSuggestions(
            getLocalVariantLabelSuggestions(normalizedModelName, normalizedSearch),
          );
          return;
        }

        const nextLabels = Array.isArray(data?.variantLabels)
          ? data.variantLabels.filter((label) => typeof label === "string" && label.trim().length > 0)
          : [];

        setVariantLabelSuggestions(nextLabels.slice(0, 10));
      } catch {
        if (requestId !== variantLabelSuggestRequestIdRef.current) return;
        setVariantLabelSuggestions(
          getLocalVariantLabelSuggestions(normalizedModelName, normalizedSearch),
        );
      } finally {
        if (requestId === variantLabelSuggestRequestIdRef.current) {
          setIsVariantLabelSuggestLoading(false);
        }
      }
    },
    [getLocalVariantLabelSuggestions],
  );

  const fetchNextVariantSortOrder = useCallback(
    async (modelName: string) => {
      const normalizedModelName = modelName.trim();

      if (!normalizedModelName) {
        form.setValue("variant.variantSortOrder", 0, {
          shouldDirty: true,
          shouldValidate: true,
        });
        return;
      }

      const requestId = ++variantSortRequestIdRef.current;

      try {
        const params = new URLSearchParams({
          name: normalizedModelName,
          limit: "1",
        });

        const res = await authFetch(`/api/products/models?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as
          | {
              nextSortOrder?: number | null;
            }
          | null;

        if (requestId !== variantSortRequestIdRef.current) return;

        if (res.ok && typeof data?.nextSortOrder === "number") {
          form.setValue("variant.variantSortOrder", Math.max(0, data.nextSortOrder), {
            shouldDirty: true,
            shouldValidate: true,
          });
          return;
        }
      } catch {
        if (requestId !== variantSortRequestIdRef.current) return;
      }

      if (requestId !== variantSortRequestIdRef.current) return;

      const normalizedLower = normalizedModelName.toLowerCase();
      const fallbackNextSortOrder =
        productItems.reduce((maxSortOrder, item) => {
          if ((item.modelName ?? "").trim().toLowerCase() !== normalizedLower) {
            return maxSortOrder;
          }
          return Math.max(maxSortOrder, Number(item.variantSortOrder ?? 0));
        }, -1) + 1;

      form.setValue("variant.variantSortOrder", Math.max(0, fallbackNextSortOrder), {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form, productItems],
  );

  useEffect(() => {
    if (!isModelSuggestOpen || !isVariantEnabled) return;

    const timer = window.setTimeout(() => {
      void fetchModelSuggestions(watchedVariantModelName);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [fetchModelSuggestions, isModelSuggestOpen, isVariantEnabled, watchedVariantModelName]);

  useEffect(() => {
    if (!showCreateSheet || mode !== "create" || hasManualSku) return;

    const timer = window.setTimeout(() => {
      const nextSku = suggestSkuFromInputs({
        productName: watchedName,
        referenceName: skuReferenceName,
        categoryId: watchedCategoryId,
        currentSku: watchedSku,
      });
      form.setValue("sku", nextSku, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }, 140);

    return () => window.clearTimeout(timer);
  }, [
    form,
    hasManualSku,
    mode,
    showCreateSheet,
    skuReferenceName,
    suggestSkuFromInputs,
    watchedCategoryId,
    watchedName,
    watchedSku,
  ]);

  useEffect(() => {
    if (!isVariantLabelSuggestOpen || !isVariantEnabled) return;

    const timer = window.setTimeout(() => {
      void fetchVariantLabelSuggestions(watchedVariantModelName, watchedVariantLabel);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    fetchVariantLabelSuggestions,
    isVariantEnabled,
    isVariantLabelSuggestOpen,
    watchedVariantLabel,
    watchedVariantModelName,
  ]);

  useEffect(() => {
    if (!showCreateSheet || mode !== "create" || !isVariantEnabled || hasManualVariantSortOrder) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchNextVariantSortOrder(watchedVariantModelName);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    fetchNextVariantSortOrder,
    hasManualVariantSortOrder,
    isVariantEnabled,
    mode,
    showCreateSheet,
    watchedVariantModelName,
  ]);

  useEffect(() => {
    if (!isModelSuggestOpen && !isVariantLabelSuggestOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        modelSuggestContainerRef.current &&
        event.target instanceof Node &&
        !modelSuggestContainerRef.current.contains(event.target)
      ) {
        setIsModelSuggestOpen(false);
      }
      if (
        variantLabelSuggestContainerRef.current &&
        event.target instanceof Node &&
        !variantLabelSuggestContainerRef.current.contains(event.target)
      ) {
        setIsVariantLabelSuggestOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isModelSuggestOpen, isVariantLabelSuggestOpen]);

  const fetchProductsPage = useCallback(
    async ({ page, append }: { page: number; append: boolean }) => {
      const requestId = ++productListRequestIdRef.current;
      setIsListLoading(true);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PRODUCT_PAGE_SIZE),
          status: statusFilter,
          sort: sortOption,
        });
        const keyword = deferredQuery.trim();
        if (keyword) {
          params.set("q", keyword);
        }
        if (selectedCategoryId) {
          params.set("categoryId", selectedCategoryId);
        }

        const res = await authFetch(`/api/products?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as
          | {
              message?: string;
              products?: ProductListItem[];
              total?: number;
              summary?: ProductSummaryCounts;
            }
          | null;

        if (requestId !== productListRequestIdRef.current) return;
        if (!res.ok) {
          toast.error(data?.message ?? "โหลดรายการสินค้าไม่สำเร็จ");
          return;
        }

        const nextItems = data?.products ?? [];
        setProductItems((prev) => {
          if (!append) return nextItems;

          const existingIds = new Set(prev.map((item) => item.id));
          const appended = nextItems.filter((item) => !existingIds.has(item.id));
          return [...prev, ...appended];
        });
        setTotalMatchingCount(
          typeof data?.total === "number" ? data.total : nextItems.length,
        );
        if (data?.summary) {
          setSummaryCounts(data.summary);
        }
        setProductPage(page);
      } finally {
        if (requestId === productListRequestIdRef.current) {
          setIsListLoading(false);
        }
      }
    },
    [deferredQuery, selectedCategoryId, sortOption, statusFilter],
  );

  useEffect(() => {
    if (!hasInitializedListEffectRef.current) {
      hasInitializedListEffectRef.current = true;
      return;
    }

    void fetchProductsPage({ page: 1, append: false });
  }, [fetchProductsPage]);

  /* ─── Actions ─── */

  const beginCreate = () => {
    if (!canCreate) return;
    submitIntentRef.current = "save";
    setMode("create");
    setEditingProductId(null);
    setImageFile(null);
    setCurrentImageUrl(null);
    setIsImageMarkedForRemoval(false);
    setMatrixAxisOneName("Color");
    setMatrixAxisOneValues("");
    setMatrixAxisTwoName("Size");
    setMatrixAxisTwoValues("");
    setMatrixUseSecondAxis(false);
    setMatrixRows([]);
    setShowVariantCodeFields(false);
    setIsMatrixSectionExpanded(false);
    setSkuReferenceName("");
    setShowSkuReferenceField(false);
    setIsModelSuggestOpen(false);
    setIsVariantLabelSuggestOpen(false);
    setHasManualVariantSortOrder(false);
    setHasManualSku(false);
    form.reset(defaultValues(units[0]?.id ?? ""));
    setShowCreateSheet(true);
  };

  const beginEdit = (product: ProductListItem) => {
    if (!canUpdate) return;
    submitIntentRef.current = "save";
    hideDeactivateConfirmImmediately();
    setShowDetailImagePreview(false);
    const hasVariantMeta = Boolean(
      product.modelId ||
        product.modelName ||
        product.variantLabel ||
        product.variantOptions.length > 0,
    );
    setMode("edit");
    setEditingProductId(product.id);
    setImageFile(null);
    setCurrentImageUrl(product.imageUrl ?? null);
    setIsImageMarkedForRemoval(false);
    setMatrixUseSecondAxis(false);
    setMatrixRows([]);
    setShowVariantCodeFields(false);
    setIsMatrixSectionExpanded(false);
    setSkuReferenceName("");
    setShowSkuReferenceField(false);
    setIsModelSuggestOpen(false);
    setIsVariantLabelSuggestOpen(false);
    setHasManualVariantSortOrder(false);
    setHasManualSku(true);
    form.reset({
      sku: product.sku,
      name: product.name,
      barcode: product.barcode ?? "",
      baseUnitId: product.baseUnitId,
      priceBase: product.priceBase,
      costBase: product.costBase,
      outStockThreshold: product.outStockThreshold ?? "",
      lowStockThreshold: product.lowStockThreshold ?? "",
      categoryId: product.categoryId ?? "",
      conversions: product.conversions.map((c) => ({
        unitId: c.unitId,
        multiplierToBase: c.multiplierToBase,
      })),
      variant: hasVariantMeta
        ? {
            enabled: true,
            modelName: product.modelName ?? "",
            variantLabel: product.variantLabel ?? "",
            variantSortOrder: product.variantSortOrder ?? 0,
            options: product.variantOptions.map((option) => ({
              attributeCode: option.attributeCode,
              attributeName: option.attributeName,
              valueCode: option.valueCode,
              valueName: option.valueName,
            })),
          }
        : {
            enabled: false,
            modelName: "",
            variantLabel: "",
            variantSortOrder: 0,
            options: [],
          },
    });
    setShowDetailSheet(false);
    setShowCreateSheet(true);
  };

  const openDetail = (product: ProductListItem) => {
    hideDeactivateConfirmImmediately();
    setShowDetailImagePreview(false);
    setDetailProduct(product);
    setDetailTab("info");
    setEditingCost(false);
    setCostDraft(product.costBase);
    setShowDetailSheet(true);
  };

  const closeCreateSheet = () => {
    submitIntentRef.current = "save";
    setShowCreateSheet(false);
    setEditingProductId(null);
    setImageFile(null);
    setCurrentImageUrl(null);
    setIsImageMarkedForRemoval(false);
    setMatrixUseSecondAxis(false);
    setMatrixRows([]);
    setShowVariantCodeFields(false);
    setIsMatrixSectionExpanded(false);
    setSkuReferenceName("");
    setShowSkuReferenceField(false);
    setIsModelSuggestOpen(false);
    setIsVariantLabelSuggestOpen(false);
    setHasManualVariantSortOrder(false);
    setHasManualSku(false);
  };

  const duplicateProduct = (product: ProductListItem) => {
    if (!canCreate) return;
    submitIntentRef.current = "save";
    hideDeactivateConfirmImmediately();
    setShowDetailImagePreview(false);
    const hasVariantMeta = Boolean(
      product.modelId ||
        product.modelName ||
        product.variantLabel ||
        product.variantOptions.length > 0,
    );
    setMode("create");
    setEditingProductId(null);
    setImageFile(null);
    setCurrentImageUrl(null);
    setIsImageMarkedForRemoval(false);
    setMatrixUseSecondAxis(false);
    setMatrixRows([]);
    setShowVariantCodeFields(false);
    setIsMatrixSectionExpanded(false);
    setSkuReferenceName("");
    setShowSkuReferenceField(false);
    setIsModelSuggestOpen(false);
    setIsVariantLabelSuggestOpen(false);
    setHasManualVariantSortOrder(false);
    setHasManualSku(true);
    form.reset({
      sku: `${product.sku}-COPY`,
      name: `${product.name} (สำเนา)`,
      barcode: "",
      baseUnitId: product.baseUnitId,
      priceBase: product.priceBase,
      costBase: product.costBase,
      outStockThreshold: product.outStockThreshold ?? "",
      lowStockThreshold: product.lowStockThreshold ?? "",
      categoryId: product.categoryId ?? "",
      conversions: product.conversions.map((c) => ({
        unitId: c.unitId,
        multiplierToBase: c.multiplierToBase,
      })),
      variant: hasVariantMeta
        ? {
            enabled: true,
            modelName: product.modelName ?? product.name,
            variantLabel: product.variantLabel ?? "",
            variantSortOrder: product.variantSortOrder ?? 0,
            options: product.variantOptions.map((option) => ({
              attributeCode: option.attributeCode,
              attributeName: option.attributeName,
              valueCode: option.valueCode,
              valueName: option.valueName,
            })),
          }
        : {
            enabled: false,
            modelName: "",
            variantLabel: "",
            variantSortOrder: 0,
            options: [],
          },
    });
    setShowDetailSheet(false);
    setShowCreateSheet(true);
  };

  const buildSkuWithNumericSuffix = (baseSku: string, suffixNumber: number) => {
    const fallbackBase = baseSku.trim() || "SKU";
    const suffix = `-${suffixNumber}`;
    const maxBaseLength = Math.max(1, 60 - suffix.length);
    return `${fallbackBase.slice(0, maxBaseLength)}${suffix}`;
  };

  const createProductWithAutoUniqueSku = async (payload: ProductUpsertInput) => {
    let nextSku = payload.sku.trim() || "SKU";
    let attempt = 1;
    let lastResponse: Response | undefined;
    let lastData: { message?: string; product?: ProductListItem } | null = null;
    let autoAdjusted = false;

    while (attempt <= 30) {
      const response = await authFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          sku: nextSku,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        product?: ProductListItem;
      } | null;

      lastResponse = response;
      lastData = data;

      if (response.ok) {
        return {
          response,
          data,
          finalSku: nextSku,
          autoAdjusted,
        };
      }

      const isSkuConflict =
        response.status === 409 &&
        typeof data?.message === "string" &&
        data.message.includes("SKU");

      if (!isSkuConflict) {
        return {
          response,
          data,
          finalSku: nextSku,
          autoAdjusted,
        };
      }

      attempt += 1;
      autoAdjusted = true;
      nextSku = buildSkuWithNumericSuffix(payload.sku.trim() || "SKU", attempt);
    }

    return {
      response: lastResponse ?? new Response(null, { status: 500 }),
      data: lastData,
      finalSku: nextSku,
      autoAdjusted,
    };
  };

  /* ── Submit product ── */
  const onSubmit = form.handleSubmit(async (values) => {
    const submitIntent = submitIntentRef.current;
    const key = mode === "create" ? "create" : `update-${editingProductId}`;
    setLoadingKey(key);

    const prevProducts = productItems;

    // Optimistic update for edit
    if (mode === "edit" && editingProductId) {
      const selBaseUnit = unitById.get(values.baseUnitId);
      const nextConversions = values.conversions
        .flatMap((c) => {
          const u = unitById.get(c.unitId);
          return u
            ? [
                {
                  unitId: c.unitId,
                  unitCode: u.code,
                  unitNameTh: u.nameTh,
                  multiplierToBase: c.multiplierToBase,
                },
              ]
            : [];
        })
                .sort((a, b) => a.multiplierToBase - b.multiplierToBase);
      const nextVariantOptions = values.variant.enabled
        ? values.variant.options.flatMap((option) =>
            option.attributeName && option.valueName
              ? [
                  {
                    attributeCode: option.attributeCode,
                    attributeName: option.attributeName,
                    valueCode: option.valueCode,
                    valueName: option.valueName,
                  },
                ]
              : [],
          )
        : [];
      const nextVariantOptionsJson =
        nextVariantOptions.length > 0 ? JSON.stringify(nextVariantOptions) : null;

      setProductItems((prev) =>
        prev.map((item) =>
          item.id === editingProductId
            ? {
                ...item,
                sku: values.sku,
                name: values.name,
                barcode: values.barcode?.trim() || null,
                baseUnitId: values.baseUnitId,
                baseUnitCode: selBaseUnit?.code ?? item.baseUnitCode,
                baseUnitNameTh: selBaseUnit?.nameTh ?? item.baseUnitNameTh,
                priceBase: values.priceBase,
                costBase: values.costBase,
                outStockThreshold: values.outStockThreshold ?? null,
                lowStockThreshold: values.lowStockThreshold ?? null,
                categoryId: values.categoryId?.trim() || null,
                categoryName:
                  categories.find((c) => c.id === values.categoryId)?.name ??
                  null,
                modelId: values.variant.enabled ? item.modelId : null,
                modelName: values.variant.enabled ? values.variant.modelName : null,
                variantLabel: values.variant.enabled
                  ? values.variant.variantLabel
                  : null,
                variantOptions: values.variant.enabled ? nextVariantOptions : [],
                variantOptionsJson: values.variant.enabled
                  ? nextVariantOptionsJson
                  : null,
                variantSortOrder: values.variant.enabled
                  ? values.variant.variantSortOrder
                  : 0,
                conversions: nextConversions,
              }
            : item,
        ),
      );
    }

    let response: Response;
    let data: {
      message?: string;
      product?: ProductListItem;
    } | null;
    let finalCreatedSku = values.sku.trim();

    if (mode === "create") {
      const createResult = await createProductWithAutoUniqueSku(values);
      response = createResult.response;
      data = createResult.data;
      finalCreatedSku = createResult.finalSku;

      if (createResult.autoAdjusted && response.ok && finalCreatedSku) {
        form.setValue("sku", finalCreatedSku, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setHasManualSku(true);
        toast.success(`SKU ซ้ำ ระบบปรับเป็น ${finalCreatedSku}`);
      }
    } else {
      response = await authFetch(`/api/products/${editingProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", data: values }),
      });
      data = (await response.json().catch(() => null)) as {
        message?: string;
        product?: ProductListItem;
      } | null;
    }

    if (!response.ok) {
      setProductItems(prevProducts);
      toast.error(data?.message ?? "บันทึกสินค้าไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    // Apply image deletion only after main save succeeds.
    const targetId = mode === "create" ? data?.product?.id : editingProductId;
    if (mode === "edit" && targetId && isImageMarkedForRemoval && !imageFile) {
      const removeRes = await authFetch(`/api/products/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_image" }),
      });

      if (!removeRes.ok) {
        toast.error("ลบรูปสินค้าไม่สำเร็จ");
      } else {
        setProductItems((prev) =>
          prev.map((item) =>
            item.id === targetId ? { ...item, imageUrl: null } : item,
          ),
        );
        setDetailProduct((prev) =>
          prev && prev.id === targetId ? { ...prev, imageUrl: null } : prev,
        );
      }
    }

    // Upload image after create/update if selected.
    if (imageFile && targetId) {
      const fd = new FormData();
      fd.append("image", imageFile);
      const imgRes = await authFetch(`/api/products/${targetId}`, {
        method: "PATCH",
        body: fd,
      });
      if (!imgRes.ok) {
        toast.error("อัปโหลดรูปสินค้าไม่สำเร็จ");
      }
    }

    if (mode === "create" && data?.product) {
      setProductItems((prev) => [data.product!, ...prev]);
    }

    if (mode === "create" && values.variant.enabled && submitIntent === "save-and-next") {
      toast.success("บันทึกแล้ว เพิ่ม Variant ถัดไปได้เลย");
      setLoadingKey(null);
      setImageFile(null);
      setImagePreview(null);
      setCurrentImageUrl(null);
      setIsImageMarkedForRemoval(false);
      setIsModelSuggestOpen(false);
      setIsVariantLabelSuggestOpen(false);
      form.reset({
        ...values,
        sku: "",
        barcode: "",
        variant: {
          ...values.variant,
          variantLabel: "",
          variantSortOrder: (values.variant.variantSortOrder ?? 0) + 1,
        },
      });
      setHasManualVariantSortOrder(false);
      setHasManualSku(false);
      submitIntentRef.current = "save";
      router.refresh();
      return;
    }

    toast.success(mode === "create" ? "สร้างสินค้าเรียบร้อย" : "อัปเดตสินค้าเรียบร้อย");
    setLoadingKey(null);
    submitIntentRef.current = "save";
    closeCreateSheet();
    router.refresh();
  });

  /* ── Toggle active ── */
  const setActiveState = async (
    product: ProductListItem,
    nextActive: boolean,
  ) => {
    setLoadingKey(`active-${product.id}`);
    setProductItems((prev) =>
      prev.map((item) =>
        item.id === product.id ? { ...item, active: nextActive } : item,
      ),
    );
    setDetailProduct((prev) =>
      prev && prev.id === product.id ? { ...prev, active: nextActive } : prev,
    );

    const res = await authFetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", active: nextActive }),
    });

    if (!res.ok) {
      setProductItems((prev) =>
        prev.map((item) =>
          item.id === product.id ? { ...item, active: product.active } : item,
        ),
      );
      setDetailProduct((prev) =>
        prev && prev.id === product.id ? { ...prev, active: product.active } : prev,
      );
      const d = await res.json().catch(() => null);
      toast.error(
        (d as { message?: string })?.message ?? "เปลี่ยนสถานะไม่สำเร็จ",
      );
    } else {
      toast.success(
        nextActive ? "เปิดใช้งานสินค้าแล้ว" : "ปิดใช้งานสินค้าแล้ว",
      );
      router.refresh();
    }

    setLoadingKey(null);
  };

  const handleDetailToggleActive = () => {
    if (!detailProduct || !canArchive || isDetailToggleActiveLoading) return;
    const nextActive = !detailProduct.active;

    if (!nextActive) {
      if (deactivateConfirmCloseTimerRef.current !== null) {
        window.clearTimeout(deactivateConfirmCloseTimerRef.current);
        deactivateConfirmCloseTimerRef.current = null;
      }
      setShowDeactivateConfirm(true);
      window.requestAnimationFrame(() => setIsDeactivateConfirmOpen(true));
      return;
    }

    void setActiveState(detailProduct, nextActive);
  };

  const closeDeactivateConfirm = useCallback(() => {
    setIsDeactivateConfirmOpen(false);
    if (deactivateConfirmCloseTimerRef.current !== null) {
      window.clearTimeout(deactivateConfirmCloseTimerRef.current);
    }
    deactivateConfirmCloseTimerRef.current = window.setTimeout(() => {
      setShowDeactivateConfirm(false);
      deactivateConfirmCloseTimerRef.current = null;
    }, 200);
  }, []);

  const hideDeactivateConfirmImmediately = () => {
    if (deactivateConfirmCloseTimerRef.current !== null) {
      window.clearTimeout(deactivateConfirmCloseTimerRef.current);
      deactivateConfirmCloseTimerRef.current = null;
    }
    setIsDeactivateConfirmOpen(false);
    setShowDeactivateConfirm(false);
  };

  const confirmDeactivateProduct = () => {
    if (!detailProduct || !detailProduct.active || isDetailToggleActiveLoading) return;
    closeDeactivateConfirm();
    void setActiveState(detailProduct, false);
  };

  useEffect(() => {
    if (!showDeactivateConfirm) return;
    lastFocusedBeforeDeactivateConfirmRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      deactivateCancelButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDeactivateConfirm();
        return;
      }

      if (event.key === "Tab") {
        const overlay = deactivateConfirmOverlayRef.current;
        if (!overlay) return;
        const focusableElements = overlay.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey) {
          if (activeElement === firstElement || !overlay.contains(activeElement)) {
            event.preventDefault();
            lastElement.focus();
          }
          return;
        }

        if (activeElement === lastElement || !overlay.contains(activeElement)) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      lastFocusedBeforeDeactivateConfirmRef.current?.focus();
      lastFocusedBeforeDeactivateConfirmRef.current = null;
    };
  }, [showDeactivateConfirm, closeDeactivateConfirm]);

  /* ── Update cost ── */
  const saveCost = async () => {
    if (!detailProduct) return;
    setLoadingKey(`cost-${detailProduct.id}`);

    const res = await authFetch(`/api/products/${detailProduct.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_cost", costBase: costDraft }),
    });

    if (!res.ok) {
      toast.error("บันทึกต้นทุนไม่สำเร็จ");
    } else {
      setProductItems((prev) =>
        prev.map((p) =>
          p.id === detailProduct.id ? { ...p, costBase: costDraft } : p,
        ),
      );
      setDetailProduct((prev) =>
        prev ? { ...prev, costBase: costDraft } : prev,
      );
      toast.success("อัปเดตต้นทุนเรียบร้อย");
      setEditingCost(false);
      router.refresh();
    }

    setLoadingKey(null);
  };

  const copyTextToClipboard = useCallback(async (value: string, fieldLabel: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error(`ไม่มี${fieldLabel}ให้คัดลอก`);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(trimmed);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = trimmed;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success(`คัดลอก${fieldLabel}แล้ว`);
    } catch {
      toast.error(`คัดลอก${fieldLabel}ไม่สำเร็จ`);
    }
  }, []);

  /* ── Generate internal barcode ── */
  const generateBarcode = async () => {
    setLoadingKey("gen-barcode");
    try {
      const res = await authFetch("/api/products/generate-barcode", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "สร้างบาร์โค้ดไม่สำเร็จ");
        return;
      }
      form.setValue("barcode", data.barcode, { shouldDirty: true });
      toast.success(`สร้างบาร์โค้ด ${data.barcode} แล้ว`);
    } catch {
      toast.error("สร้างบาร์โค้ดไม่สำเร็จ");
    } finally {
      setLoadingKey(null);
    }
  };

  const buildMatrixRows = () => {
    const currentValues = form.getValues();
    const axisOneName = matrixAxisOneName.trim();
    const axisTwoName = matrixUseSecondAxis ? matrixAxisTwoName.trim() : "";
    const axisOneValues = parseMatrixValues(matrixAxisOneValues);
    const axisTwoValues = matrixUseSecondAxis ? parseMatrixValues(matrixAxisTwoValues) : [];

    if (!axisOneName || axisOneValues.length === 0) {
      toast.error("กรุณากรอกแกนหลักและค่าของแกนหลักอย่างน้อย 1 ค่า");
      return;
    }

    if (matrixUseSecondAxis && (!axisTwoName || axisTwoValues.length === 0)) {
      toast.error("หากเปิดแกนที่ 2 ต้องระบุชื่อแกนและค่าอย่างน้อย 1 ค่า");
      return;
    }

    const baseSku = String(currentValues.sku ?? "").trim();
    const startSortOrder = Number(currentValues.variant?.variantSortOrder ?? 0);
    const currentModelName = String(currentValues.variant?.modelName ?? "").trim();
    const currentName = String(currentValues.name ?? "").trim();

    const combinations =
      axisTwoValues.length > 0
        ? axisOneValues.flatMap((axisOneValue) =>
            axisTwoValues.map((axisTwoValue) => ({
              labels: [axisOneValue, axisTwoValue],
              options: [
                {
                  attributeCode: toCode(axisOneName),
                  attributeName: axisOneName,
                  valueCode: toCode(axisOneValue),
                  valueName: axisOneValue,
                },
                {
                  attributeCode: toCode(axisTwoName),
                  attributeName: axisTwoName,
                  valueCode: toCode(axisTwoValue),
                  valueName: axisTwoValue,
                },
              ] as MatrixVariantOption[],
            })),
          )
        : axisOneValues.map((axisOneValue) => ({
            labels: [axisOneValue],
            options: [
              {
                attributeCode: toCode(axisOneName),
                attributeName: axisOneName,
                valueCode: toCode(axisOneValue),
                valueName: axisOneValue,
              },
            ] as MatrixVariantOption[],
          }));

    const nextRows = combinations.map((combo, index) => {
      const codeSuffix = combo.options
        .map((option) => option.valueCode.replace(/-/g, ""))
        .join("-")
        .toUpperCase();
      return {
        id: `matrix-${Date.now()}-${index}`,
        variantLabel: combo.labels.join(" / "),
        sku: baseSku ? `${baseSku}-${codeSuffix}` : "",
        barcode: "",
        sortOrder: startSortOrder + index,
        options: combo.options,
      };
    });

    setMatrixRows(nextRows);
    setIsMatrixSectionExpanded(true);
    if (!currentModelName && currentName) {
      form.setValue("variant.modelName", currentName, {
        shouldDirty: true,
      });
    }
    toast.success(`สร้างตารางรุ่นย่อย ${nextRows.length} รายการ`);
  };

  const updateMatrixRow = (
    rowId: string,
    patch: Partial<Pick<MatrixVariantRow, "variantLabel" | "sku" | "barcode" | "sortOrder">>,
  ) => {
    setMatrixRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  };

  const fillMatrixBarcodes = async () => {
    const missingRows = matrixRows.filter((row) => !row.barcode.trim());
    if (missingRows.length === 0) {
      toast("ทุกรายการมีบาร์โค้ดแล้ว");
      return;
    }

    setLoadingKey("matrix-gen-barcode");
    let successCount = 0;

    try {
      for (const row of missingRows) {
        const res = await authFetch("/api/products/generate-barcode", {
          method: "POST",
        });
        const data = (await res.json().catch(() => null)) as
          | { barcode?: string; message?: string }
          | null;
        if (!res.ok || !data?.barcode) {
          toast.error(data?.message ?? `สร้างบาร์โค้ดไม่สำเร็จ (${row.variantLabel})`);
          continue;
        }

        successCount += 1;
        updateMatrixRow(row.id, { barcode: data.barcode });
      }
    } finally {
      setLoadingKey(null);
    }

    if (successCount > 0) {
      toast.success(`สร้างบาร์โค้ดแล้ว ${successCount} รายการ`);
    }
  };

  const saveMatrixVariants = async () => {
    const values = form.getValues();
    const variant = values.variant;
    if (!variant?.enabled) {
      toast.error("กรุณาเปิดโหมดสินค้าแบบ Variant ก่อน");
      return;
    }
    const modelName = String(variant.modelName ?? "").trim();
    if (!modelName) {
      toast.error("กรุณากรอกชื่อสินค้าแม่ (Model)");
      return;
    }
    if (matrixRows.length === 0) {
      toast.error("ยังไม่มีรุ่นย่อยในตาราง");
      return;
    }

    const duplicateSku = new Set<string>();
    for (const row of matrixRows) {
      const sku = row.sku.trim();
      if (!sku) {
        toast.error(`กรุณากรอก SKU สำหรับรุ่นย่อย "${row.variantLabel}"`);
        return;
      }
      if (duplicateSku.has(sku)) {
        toast.error(`SKU ซ้ำในตาราง: ${sku}`);
        return;
      }
      duplicateSku.add(sku);
    }

    setLoadingKey("matrix-bulk-create");
    let createdCount = 0;
    const errors: string[] = [];
    const createdItems: ProductListItem[] = [];

    try {
      for (const row of matrixRows) {
        const payload = {
          ...values,
          sku: row.sku.trim(),
          barcode: row.barcode.trim(),
          variant: {
            enabled: true,
            modelName,
            variantLabel: row.variantLabel.trim(),
            variantSortOrder: Number(row.sortOrder) || 0,
            options: row.options.map((option) => ({
              attributeCode: option.attributeCode,
              attributeName: option.attributeName,
              valueCode: option.valueCode,
              valueName: option.valueName,
            })),
          },
        };

        const res = await authFetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as
          | { product?: ProductListItem; message?: string }
          | null;

        if (!res.ok) {
          errors.push(`${row.variantLabel}: ${data?.message ?? "บันทึกไม่สำเร็จ"}`);
          continue;
        }

        if (data?.product) {
          createdItems.push(data.product);
        }
        createdCount += 1;
      }
    } finally {
      setLoadingKey(null);
    }

    if (createdItems.length > 0) {
      setProductItems((prev) => [...createdItems.reverse(), ...prev]);
    }

    if (createdCount > 0) {
      toast.success(`สร้างรุ่นย่อยสำเร็จ ${createdCount}/${matrixRows.length} รายการ`);
      router.refresh();
    }

    if (errors.length > 0) {
      toast.error(errors[0]);
    }

    if (createdCount === matrixRows.length) {
      setMatrixRows([]);
      closeCreateSheet();
    }
  };

  /* ── Print barcode label ── */
  const printBarcodeLabel = useCallback(
    (product: ProductListItem) => {
      if (!product.barcode) return;

      const barcodeFormat =
        product.barcode.length === 13
          ? "EAN13"
          : product.barcode.length === 8
            ? "EAN8"
            : "CODE128";
      const safeName = escapeHtml(product.name);
      const safePrice = escapeHtml(fmtPrice(product.priceBase, currency));
      const safeTitle = escapeHtml(`พิมพ์บาร์โค้ด — ${product.name}`);
      const barcodeValueJson = JSON.stringify(product.barcode);
      const barcodeFormatJson = JSON.stringify(barcodeFormat);

      const printWindow = window.open("", "_blank", "width=420,height=320");
      if (!printWindow) {
        toast.error("ไม่สามารถเปิดหน้าต่างพิมพ์ได้ — กรุณาอนุญาต popup");
        return;
      }

      printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 50mm 30mm; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .label {
      width: 50mm; height: 30mm;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 1mm 2mm;
      page-break-after: always;
    }
    .product-name {
      font-size: 7pt; font-weight: 600;
      text-align: center; margin-bottom: 1mm;
      max-width: 46mm; overflow: hidden;
      white-space: nowrap; text-overflow: ellipsis;
    }
    .price {
      font-size: 8pt; font-weight: 700;
      margin-top: 0.5mm;
    }
    svg { max-width: 44mm; height: auto; }
    @media print {
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="product-name">${safeName}</div>
    <svg id="barcode"></svg>
    <div class="price">${safePrice}</div>
  </div>
  <script>
    JsBarcode("#barcode", ${barcodeValueJson}, {
      format: ${barcodeFormatJson},
      width: 1.5,
      height: 30,
      fontSize: 10,
      margin: 0,
      displayValue: true,
    });
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  <\/script>
</body>
</html>`);
      printWindow.document.close();
    },
    [currency],
  );

  /* ── Open scanner with context ── */
  const openScanner = useCallback((ctx: "search" | "form") => {
    setScanContext(ctx);
    if (hasSeenScannerPermission) {
      setShowScannerSheet(true);
    } else {
      setShowScannerPermissionSheet(true);
    }
  }, [hasSeenScannerPermission]);

  /* ── Barcode scan result ── */
  const handleBarcodeResult = (barcode: string) => {
    void (async () => {
      setShowScannerSheet(false);

      // If scanning from within the form → just fill the field
      if (scanContext === "form") {
        form.setValue("barcode", barcode, { shouldDirty: true });
        toast.success(`ใส่บาร์โค้ด ${barcode} แล้ว`);
        return;
      }

      let found = productItems.find(
        (p) => p.barcode === barcode || p.sku.toLowerCase() === barcode.toLowerCase(),
      );

      if (!found) {
        try {
          const searchRes = await authFetch(
            `/api/products/search?q=${encodeURIComponent(barcode)}`,
          );
          const searchData = (await searchRes.json().catch(() => null)) as
            | { products?: ProductListItem[] }
            | null;
          if (searchRes.ok && searchData?.products) {
            found = searchData.products.find(
              (p) => p.barcode === barcode || p.sku.toLowerCase() === barcode.toLowerCase(),
            );
          }
        } catch {
          // ignore and continue to create/not-found flow
        }
      }

      if (found) {
        openDetail(found);
        return;
      }

      // Not found → ask to create new product with barcode
      if (canCreate) {
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <span className="text-sm">
                ไม่พบสินค้า <strong>{barcode}</strong>
              </span>
              <button
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => {
                  toast.dismiss(t.id);
                  setMode("create");
                  setEditingProductId(null);
                  setImageFile(null);
                  setImagePreview(null);
                  setCurrentImageUrl(null);
                  setIsImageMarkedForRemoval(false);
                  form.reset({
                    ...defaultValues(units[0]?.id ?? ""),
                    barcode,
                  });
                  setSkuReferenceName("");
                  setShowSkuReferenceField(false);
                  setHasManualSku(false);
                  setShowCreateSheet(true);
                }}
              >
                + สร้างสินค้า
              </button>
            </div>
          ),
          { duration: 6000 },
        );
      } else {
        toast.error(`ไม่พบสินค้าที่มีบาร์โค้ด "${barcode}"`);
      }
    })();
  };

  const displayedImage = imagePreview ?? (isImageMarkedForRemoval ? null : currentImageUrl);
  const isMatrixBulkMode = mode === "create" && isVariantEnabled && matrixRows.length > 0;
  const showSaveAndAddNextVariantButton =
    mode === "create" && isVariantEnabled && !isMatrixBulkMode;
  const isDetailToggleActiveLoading =
    detailProduct !== null && loadingKey === `active-${detailProduct.id}`;
  const detailPrimaryActionCount =
    (canUpdate ? 1 : 0) + (canCreate ? 1 : 0) + (canArchive ? 1 : 0);
  const detailPrimaryActionGridClass =
    detailPrimaryActionCount >= 3
      ? "grid grid-cols-3 gap-2"
      : detailPrimaryActionCount === 2
        ? "grid grid-cols-2 gap-2"
        : "grid grid-cols-1 gap-2";
  const shouldShowSkuReferenceField =
    showSkuReferenceField || skuReferenceName.trim().length > 0;
  const regenerateSkuFromName = () => {
    const currentName = String(form.getValues("name") ?? "").trim();
    const currentSku = String(form.getValues("sku") ?? "").trim();
    const currentCategoryId = String(form.getValues("categoryId") ?? "").trim();
    const nextSku = suggestSkuFromInputs({
      productName: currentName,
      referenceName: skuReferenceName,
      categoryId: currentCategoryId,
      currentSku,
    });
    form.setValue("sku", nextSku, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setHasManualSku(false);
  };
  const appendConversionUnit = (unitId: string, multiplierToBase: number) => {
    if (!canUseConversionUnit(unitId)) return;
    append({
      unitId,
      multiplierToBase: Math.max(2, Math.trunc(multiplierToBase)),
    });
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * RENDER
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  return (
    <section className="space-y-3 pb-24">
      {/* ── Summary strip (clickable status filter) ── */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: "all" as StatusFilter, count: totalCount, label: "ทั้งหมด", color: "text-slate-900" },
          { key: "active" as StatusFilter, count: activeCount, label: "ใช้งาน", color: "text-emerald-600" },
          { key: "inactive" as StatusFilter, count: inactiveCount, label: "ปิดใช้งาน", color: "text-slate-400" },
        ]).map((card) => (
          <button
            key={card.key}
            type="button"
            className={`rounded-xl border p-3 text-center shadow-sm transition-colors ${
              statusFilter === card.key
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                : "border-slate-200 bg-white"
            }`}
            onClick={() => {
              setStatusFilter(statusFilter === card.key ? "all" : card.key);
            }}
          >
            <p className={`text-lg font-bold ${card.color}`}>
              {fmtNumber(card.count)}
            </p>
            <p className="text-[11px] text-muted-foreground">{card.label}</p>
          </button>
        ))}
      </div>

      {/* ── Sticky search bar ── */}
      <div className="sticky top-0 z-10 -mx-1 bg-slate-50/90 px-1 py-1 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="ค้นหา SKU, ชื่อ, บาร์โค้ด"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none ring-blue-500 focus:ring-2"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100"
            onClick={() => openScanner("search")}
            aria-label="สแกนบาร์โค้ด"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>

          {/* Desktop CTA — inline button */}
          {canCreate && (
            <button
              type="button"
              onClick={beginCreate}
              disabled={loadingKey !== null}
              className="hidden h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.98] sm:inline-flex"
            >
              <Plus className="h-4 w-4" />
              เพิ่มสินค้า
            </button>
          )}
        </div>
      </div>

      {/* ── Filter & sort bar ── */}
      <div className="flex items-center gap-2">
        {/* Category dropdown */}
        <div className="relative flex items-center">
          <ListFilter className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
          <select
            value={selectedCategoryId ?? ""}
            onChange={(e) => {
              setSelectedCategoryId(e.target.value || null);
            }}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-7 text-xs text-slate-700 outline-none ring-blue-500 focus:ring-1"
          >
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.productCount})
              </option>
            ))}
          </select>
        </div>

        {/* Sort dropdown */}
        <div className="relative flex items-center">
          <ArrowUpDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
          <select
            value={sortOption}
            onChange={(e) => {
              setSortOption(e.target.value as SortOption);
            }}
            className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-7 text-xs text-slate-700 outline-none ring-blue-500 focus:ring-1"
          >
            <option value="newest">ใหม่สุด</option>
            <option value="name-asc">ชื่อ A→Z</option>
            <option value="name-desc">ชื่อ Z→A</option>
            <option value="price-asc">ราคา ต่ำ→สูง</option>
            <option value="price-desc">ราคา สูง→ต่ำ</option>
          </select>
        </div>

        {/* Result count */}
        <span className="text-[11px] text-muted-foreground">
          {fmtNumber(totalMatchingCount)}
        </span>
      </div>

      {/* ── Product list ── */}
      <div className="space-y-2">
        {productItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-white py-12 text-center shadow-sm">
            <Package className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              {isListLoading
                ? "กำลังโหลดสินค้า..."
                : query || selectedCategoryId || statusFilter !== "all"
                ? "ไม่พบสินค้าที่ตรงกัน"
                : "ยังไม่มีสินค้า"}
            </p>
            {!isListLoading &&
              !query &&
              !selectedCategoryId &&
              statusFilter === "all" &&
              canCreate && (
              <Button
                type="button"
                className="h-9 rounded-lg text-xs"
                onClick={beginCreate}
              >
                <Plus className="mr-1 h-4 w-4" />
                เพิ่มสินค้าแรก
              </Button>
              )}
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
            {productItems.map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors active:bg-slate-50"
                onClick={() => openDetail(product)}
              >
                {/* Thumbnail */}
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {product.sku}
                    {product.categoryName ? ` · ${product.categoryName}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Barcode: {product.barcode ?? "—"}
                  </p>
                  {(product.modelName || product.variantLabel) && (
                    <p className="mt-0.5 text-[11px] text-blue-600">
                      {product.modelName ?? "Model"} · {product.variantLabel ?? "Variant"}
                    </p>
                  )}
                </div>

                {/* Price + Status */}
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {fmtPrice(product.priceBase, currency)}
                  </p>
                  <span
                    className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      product.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {product.active ? "ใช้งาน" : "ปิด"}
                  </span>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {/* ── Load more ── */}
        {hasMore && (
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl text-xs"
            onClick={() => {
              void fetchProductsPage({ page: productPage + 1, append: true });
            }}
            disabled={isListLoading}
          >
            {isListLoading
              ? "กำลังโหลด..."
              : `โหลดเพิ่มเติม (${fmtNumber(Math.max(totalMatchingCount - productItems.length, 0))} รายการ)`}
          </Button>
        )}
      </div>

      {/* ── FAB — Create product (mobile only) ── */}
      {canCreate && (
        <button
          type="button"
          onClick={beginCreate}
          disabled={loadingKey !== null}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform active:scale-95 sm:hidden"
          aria-label="เพิ่มสินค้า"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Create / Edit
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showCreateSheet}
        onClose={closeCreateSheet}
        title={mode === "create" ? "เพิ่มสินค้าใหม่" : "แก้ไขสินค้า"}
        panelMaxWidthClass="max-w-3xl"
        closeOnBackdrop={false}
        disabled={loadingKey !== null}
        footer={
          <div
            className={
              isMatrixBulkMode
                ? "grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]"
                : showSaveAndAddNextVariantButton
                ? "grid grid-cols-1 gap-2 sm:grid-cols-3"
                : "grid grid-cols-2 gap-2"
            }
          >
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl text-sm"
              onClick={closeCreateSheet}
              disabled={loadingKey !== null}
            >
              ยกเลิก
            </Button>
            {!isMatrixBulkMode && (
              <Button
                type="submit"
                form="product-upsert-form"
                className="relative h-11 rounded-xl text-sm"
                onClick={() => {
                  submitIntentRef.current = "save";
                }}
                disabled={loadingKey !== null}
              >
                {loadingKey === "create" || loadingKey === `update-${editingProductId}`
                  ? "กำลังบันทึก..."
                  : mode === "create"
                    ? "บันทึกสินค้า"
                    : "บันทึกการแก้ไข"}
                {Object.keys(form.formState.errors).length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {Object.keys(form.formState.errors).length}
                  </span>
                )}
              </Button>
            )}
            {showSaveAndAddNextVariantButton && (
              <Button
                type="submit"
                form="product-upsert-form"
                variant="outline"
                className="h-11 rounded-xl text-sm text-blue-700"
                onClick={() => {
                  submitIntentRef.current = "save-and-next";
                }}
                disabled={loadingKey !== null}
              >
                บันทึกและเพิ่ม Variant ถัดไป
              </Button>
            )}
            {isMatrixBulkMode && (
              <Button
                type="button"
                className="h-11 rounded-xl text-sm"
                onClick={saveMatrixVariants}
                disabled={loadingKey !== null || matrixRows.length === 0}
              >
                {loadingKey === "matrix-bulk-create"
                  ? "กำลังบันทึกรุ่นย่อย..."
                  : `ตรวจสอบและบันทึกหลายรุ่นย่อย (${fmtNumber(matrixRows.length)} รายการ)`}
              </Button>
            )}
          </div>
        }
      >
        <form id="product-upsert-form" className="space-y-4" onSubmit={onSubmit}>
          {/* Image picker */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-50 transition-colors ${
                displayedImage
                  ? "border border-slate-200 hover:border-blue-300"
                  : "border-2 border-dashed border-slate-300 hover:border-blue-400"
              }`}
              onClick={() => imageInputRef.current?.click()}
            >
              {displayedImage ? (
                <Image
                  src={displayedImage}
                  alt={imageFile ? "รูปใหม่ที่เลือก" : "รูปสินค้าปัจจุบัน"}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-slate-400">
                  <Package className="h-5 w-5" />
                  <span className="text-[10px]">เพิ่มรูป</span>
                </div>
              )}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setImageFile(f);
                  setIsImageMarkedForRemoval(false);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              รูปสินค้า (ไม่บังคับ)
              <br />
              {mode === "edit" && isImageMarkedForRemoval
                ? "รูปนี้จะถูกลบเมื่อกดบันทึก"
                : mode === "edit" && currentImageUrl && !imageFile
                ? "กำลังแสดงรูปปัจจุบัน"
                : mode === "edit" && imageFile
                  ? "กำลังแสดงรูปใหม่ (ยังไม่บันทึก)"
                  : null}
              {mode === "edit" ? <br /> : null}
              สูงสุด 3 MB · จะถูกปรับเป็น 640px WebP
            </p>
            {imageFile && (
              <button
                type="button"
                className="shrink-0 rounded-lg border border-red-200 p-1.5 text-red-500 transition-colors hover:bg-red-50"
                onClick={() => {
                  setImageFile(null);
                  if (imageInputRef.current) imageInputRef.current.value = "";
                }}
                aria-label="ลบรูปที่เลือก"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {!imageFile && mode === "edit" && currentImageUrl && !isImageMarkedForRemoval && (
              <button
                type="button"
                className="shrink-0 rounded-lg border border-red-200 p-1.5 text-red-500 transition-colors hover:bg-red-50"
                onClick={() => setIsImageMarkedForRemoval(true)}
                aria-label="ตั้งค่าลบรูปปัจจุบัน"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {!imageFile && mode === "edit" && currentImageUrl && isImageMarkedForRemoval && (
              <button
                type="button"
                className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50"
                onClick={() => setIsImageMarkedForRemoval(false)}
                aria-label="ยกเลิกลบรูปปัจจุบัน"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* SKU + Name */}
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-slate-700"
              htmlFor="pf-name"
            >
              ชื่อสินค้า
            </label>
            <input
              id="pf-name"
              className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
              disabled={loadingKey !== null}
              {...nameField}
              onChange={(event) => {
                nameField.onChange(event);
              }}
            />
            {mode === "create" && (
              <p className="text-[11px] text-muted-foreground">
                กรอกชื่อก่อน ระบบจะช่วยสร้าง SKU ให้อัตโนมัติ (แก้เองได้)
              </p>
            )}
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            {shouldShowSkuReferenceField ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <label
                    className="text-xs font-medium text-slate-700"
                    htmlFor="pf-sku-reference-en"
                  >
                    ชื่ออ้างอิงอังกฤษ (optional)
                  </label>
                  {skuReferenceName.trim().length === 0 ? (
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      disabled={loadingKey !== null}
                      onClick={() => setShowSkuReferenceField(false)}
                    >
                      ซ่อน
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      disabled={loadingKey !== null}
                      onClick={() => {
                        setSkuReferenceName("");
                        setShowSkuReferenceField(false);
                      }}
                    >
                      ล้างค่า
                    </button>
                  )}
                </div>
                <input
                  id="pf-sku-reference-en"
                  className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                  disabled={loadingKey !== null}
                  value={skuReferenceName}
                  onChange={(event) => {
                    setSkuReferenceName(event.target.value);
                    if (!showSkuReferenceField) {
                      setShowSkuReferenceField(true);
                    }
                  }}
                  placeholder="เช่น Rice Cracker"
                />
                <p className="text-[11px] text-muted-foreground">
                  ใช้ช่วยสร้าง SKU ให้แม่นขึ้น โดยไม่กระทบชื่อสินค้าที่แสดงจริง
                </p>
              </>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                disabled={loadingKey !== null}
                onClick={() => setShowSkuReferenceField(true)}
              >
                + เพิ่มชื่ออ้างอิงอังกฤษ (optional)
              </button>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-sku"
              >
                SKU
              </label>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                disabled={loadingKey !== null}
                onClick={regenerateSkuFromName}
              >
                สร้างใหม่
              </button>
            </div>
            <input
              id="pf-sku"
              className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
              disabled={loadingKey !== null}
              {...skuField}
              onChange={(event) => {
                setHasManualSku(true);
                skuField.onChange(event);
              }}
            />
            {mode === "create" && (
              <p className="text-[11px] text-muted-foreground">
                ระบบแปลงชื่อ (ลาว/ไทย/อังกฤษ) เป็น Latin ก่อนสร้าง SKU; ถ้าแปลงไม่ได้จะ fallback เป็นรหัสแบบ P-000001 หรือ CAT-000001
              </p>
            )}
            {mode === "create" && (
              <p className="text-[11px] text-muted-foreground">
                หลังแก้ SKU เอง ระบบจะไม่ auto ทับ และถ้าบันทึกแล้วซ้ำระบบจะเติม -2, -3 อัตโนมัติ
              </p>
            )}
            {mode === "edit" && (
              <p className="text-[11px] text-muted-foreground">
                แก้ชื่อหรือชื่ออ้างอิงอังกฤษแล้วกด{" "}
                <span className="font-medium">สร้างใหม่</span> ได้ แต่ระบบจะไม่ auto
                เปลี่ยน SKU เอง
              </p>
            )}
            {form.formState.errors.sku && (
              <p className="text-xs text-red-600">
                {form.formState.errors.sku.message}
              </p>
            )}
          </div>

          {/* Barcode */}
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-slate-700"
              htmlFor="pf-barcode"
            >
              บาร์โค้ด (ถ้ามี)
            </label>
            <div className="flex gap-2">
              <input
                id="pf-barcode"
                className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("barcode")}
              />
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
                onClick={() => openScanner("form")}
                disabled={loadingKey !== null}
                aria-label="สแกนบาร์โค้ดใส่ช่อง"
              >
                <ScanBarcode className="h-4 w-4" />
              </button>
              {!form.watch("barcode")?.trim() && (
                <button
                  type="button"
                  className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100"
                  onClick={generateBarcode}
                  disabled={loadingKey !== null}
                  title="สร้างบาร์โค้ดภายในร้าน (EAN-13)"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  สร้าง
                </button>
              )}
            </div>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-category"
              >
                หมวดหมู่
              </label>
              <select
                id="pf-category"
                className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("categoryId")}
              >
                <option value="">— ไม่ระบุ —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Variant */}
          <div className="space-y-3 rounded-xl bg-slate-50/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={isVariantEnabled}
                  disabled={loadingKey !== null}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    form.setValue("variant.enabled", enabled, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    if (!enabled) {
                      form.setValue("variant.modelName", "", { shouldDirty: true });
                      form.setValue("variant.variantLabel", "", { shouldDirty: true });
                      form.setValue("variant.variantSortOrder", 0, { shouldDirty: true });
                      form.setValue("variant.options", [], { shouldDirty: true });
                      setMatrixUseSecondAxis(false);
                      setMatrixRows([]);
                      setShowVariantCodeFields(false);
                      setIsMatrixSectionExpanded(false);
                      setIsModelSuggestOpen(false);
                      setIsVariantLabelSuggestOpen(false);
                      setHasManualVariantSortOrder(false);
                    }
                  }}
                />
                <span className="text-xs font-medium leading-5 text-slate-700">
                  สินค้าแบบ Variant (มีสี/ขนาด/ตัวเลือก)
                </span>
              </label>

              {mode === "create" && isVariantEnabled && (
                <button
                  type="button"
                  className="self-start rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700"
                  disabled={loadingKey !== null}
                  onClick={() => setIsMatrixSectionExpanded((prev) => !prev)}
                >
                  {isMatrixSectionExpanded ? "ซ่อน Matrix" : "เปิด Matrix"}
                </button>
              )}
            </div>

            {isVariantEnabled && (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
                  {mode === "create" ? (
                    <>
                      ฟอร์มนี้บันทึกได้ทีละ 1 SKU เท่านั้น หากต้องการหลายรุ่นย่อยให้ใช้ปุ่ม{" "}
                      <span className="font-semibold">บันทึกและเพิ่ม Variant ถัดไป</span>
                    </>
                  ) : (
                    <>
                      ฟอร์มแก้ไขนี้จัดการได้ทีละ 1 SKU เท่านั้น หากต้องการแก้หลายรุ่นย่อย
                      ให้แก้ทีละ SKU เพื่อป้องกันข้อมูลผิดพลาด
                    </>
                  )}
                </div>

                <div ref={modelSuggestContainerRef} className="relative space-y-1">
                  <label
                    className="text-xs font-medium text-slate-700"
                    htmlFor="pf-variant-model-name"
                  >
                    ชื่อสินค้าแม่ (Model)
                  </label>
                  <input
                    id="pf-variant-model-name"
                    className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                    disabled={loadingKey !== null}
                    placeholder="เช่น กล่องอาหาร, เสื้อยืด"
                    {...variantModelNameField}
                    autoComplete="off"
                    onFocus={() => {
                      setIsModelSuggestOpen(true);
                    }}
                    onChange={(event) => {
                      variantModelNameField.onChange(event);
                      if (!isModelSuggestOpen) {
                        setIsModelSuggestOpen(true);
                      }
                    }}
                  />
                  {isModelSuggestOpen && (
                    <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                      {isModelSuggestLoading ? (
                        <p className="px-2 py-1.5 text-xs text-slate-500">กำลังค้นหา...</p>
                      ) : modelSuggestions.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-slate-500">
                          ไม่พบชื่อเดิม สามารถพิมพ์ชื่อใหม่ได้
                        </p>
                      ) : (
                        <div className="max-h-44 overflow-y-auto">
                          {modelSuggestions.map((modelName) => (
                            <button
                              key={modelName}
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                form.setValue("variant.modelName", modelName, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                setIsModelSuggestOpen(false);
                              }}
                            >
                              {modelName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {form.formState.errors.variant?.modelName && (
                    <p className="text-xs text-red-600">
                      {form.formState.errors.variant.modelName.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div
                    ref={variantLabelSuggestContainerRef}
                    className="relative space-y-1 min-w-0"
                  >
                    <label
                      className="text-xs font-medium text-slate-700"
                      htmlFor="pf-variant-label"
                    >
                      ชื่อ Variant
                    </label>
                    <input
                      id="pf-variant-label"
                      className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                      disabled={loadingKey !== null}
                      placeholder="เช่น 750ml / สีขาว"
                      {...variantLabelField}
                      autoComplete="off"
                      onFocus={() => {
                        setIsVariantLabelSuggestOpen(true);
                      }}
                      onChange={(event) => {
                        variantLabelField.onChange(event);
                        if (!isVariantLabelSuggestOpen) {
                          setIsVariantLabelSuggestOpen(true);
                        }
                      }}
                    />
                    {isVariantLabelSuggestOpen && (
                      <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                        {!watchedVariantModelName.trim() ? (
                          <p className="px-2 py-1.5 text-xs text-slate-500">
                            กรอกชื่อสินค้าแม่ก่อน เพื่อดูชื่อ Variant ที่เคยใช้
                          </p>
                        ) : isVariantLabelSuggestLoading ? (
                          <p className="px-2 py-1.5 text-xs text-slate-500">กำลังค้นหา...</p>
                        ) : variantLabelSuggestions.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-slate-500">
                            ไม่พบชื่อเดิม สามารถพิมพ์ชื่อใหม่ได้
                          </p>
                        ) : (
                          <div className="max-h-44 overflow-y-auto">
                            {variantLabelSuggestions.map((variantLabel) => (
                              <button
                                key={variantLabel}
                                type="button"
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  form.setValue("variant.variantLabel", variantLabel, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                  setIsVariantLabelSuggestOpen(false);
                                }}
                              >
                                {variantLabel}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      แนะนำชื่อเดิมจาก Model เดียวกัน (เลือกได้ หรือพิมพ์ใหม่เอง)
                    </p>
                    {form.formState.errors.variant?.variantLabel && (
                      <p className="text-xs text-red-600">
                        {form.formState.errors.variant.variantLabel.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label
                      className="text-xs font-medium text-slate-700"
                      htmlFor="pf-variant-sort-order"
                    >
                      ลำดับแสดง
                    </label>
                    <input
                      id="pf-variant-sort-order"
                      type="number"
                      min={0}
                      step={1}
                      className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                      disabled={loadingKey !== null}
                      {...variantSortOrderField}
                      onChange={(event) => {
                        setHasManualVariantSortOrder(true);
                        variantSortOrderField.onChange(event);
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      ระบบตั้งให้อัตโนมัติจากลำดับถัดไป (ปรับเองได้)
                    </p>
                    {form.formState.errors.variant?.variantSortOrder && (
                      <p className="text-xs text-red-600">
                        {form.formState.errors.variant.variantSortOrder.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg bg-white/70 p-3 ring-1 ring-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-700">คุณสมบัติของ SKU นี้</p>
                    <button
                      type="button"
                      className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                      disabled={loadingKey !== null}
                      onClick={() =>
                        appendVariantOption({
                          attributeCode: "",
                          attributeName: "",
                          valueCode: "",
                          valueName: "",
                        })
                      }
                    >
                      + เพิ่มคุณสมบัติ
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    กรอกแค่ชื่อคุณสมบัติและค่าได้เลย ระบบจะสร้างรหัสให้อัตโนมัติ
                  </p>
                  <button
                    type="button"
                    className="text-left text-[11px] font-medium text-slate-600 underline underline-offset-2"
                    disabled={loadingKey !== null}
                    onClick={() => setShowVariantCodeFields((prev) => !prev)}
                  >
                    {showVariantCodeFields
                      ? "ซ่อนช่องรหัส (ขั้นสูง)"
                      : "แสดงช่องรหัส (ขั้นสูง)"}
                  </button>

                  {variantOptionFields.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      ยังไม่มีคุณสมบัติ (บันทึกด้วยชื่อ Variant อย่างเดียวได้)
                    </p>
                  )}

                  {variantOptionFields.map((field, idx) => (
                    <div key={field.id} className="space-y-2 rounded-md bg-white p-2 sm:p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                        <input
                          className="h-9 w-full min-w-0 rounded-md border px-2 text-sm outline-none ring-blue-500 focus:ring-2"
                          disabled={loadingKey !== null}
                          placeholder="คุณสมบัติ (เช่น Size)"
                          {...form.register(`variant.options.${idx}.attributeName`)}
                        />
                        <input
                          className="h-9 w-full min-w-0 rounded-md border px-2 text-sm outline-none ring-blue-500 focus:ring-2"
                          disabled={loadingKey !== null}
                          placeholder="ค่า (เช่น 750ml)"
                          {...form.register(`variant.options.${idx}.valueName`)}
                        />
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-red-200 px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 sm:w-9 sm:border-transparent sm:px-0"
                          onClick={() => removeVariantOption(idx)}
                          disabled={loadingKey !== null}
                        >
                          <Minus className="h-4 w-4" />
                          <span className="sm:hidden">ลบแถว</span>
                        </button>
                      </div>
                      {showVariantCodeFields && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            className="h-9 rounded-md border px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                            disabled={loadingKey !== null}
                            placeholder="รหัสคุณสมบัติ (auto ได้)"
                            {...form.register(`variant.options.${idx}.attributeCode`)}
                          />
                          <input
                            className="h-9 rounded-md border px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                            disabled={loadingKey !== null}
                            placeholder="รหัสค่า (auto ได้)"
                            {...form.register(`variant.options.${idx}.valueCode`)}
                          />
                        </div>
                      )}
                      {form.formState.errors.variant?.options?.[idx] && (
                        <p className="text-xs text-red-600">
                          {form.formState.errors.variant.options[idx]?.message ??
                            form.formState.errors.variant.options[idx]?.attributeCode
                              ?.message ??
                            form.formState.errors.variant.options[idx]?.attributeName
                              ?.message ??
                            form.formState.errors.variant.options[idx]?.valueCode
                              ?.message ??
                            form.formState.errors.variant.options[idx]?.valueName
                              ?.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {mode === "create" && (
                  <div className="space-y-3 rounded-lg bg-blue-50/80 p-3 ring-1 ring-blue-200/70">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-blue-800">
                          สร้างหลายรุ่นย่อยอัตโนมัติ (Matrix)
                        </p>
                        <p className="text-[11px] text-blue-700">
                          ระบุแกนตัวเลือกแล้วให้ระบบสร้างตารางรุ่นย่อยพร้อม SKU
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-700"
                        disabled={loadingKey !== null}
                        onClick={() => setIsMatrixSectionExpanded((prev) => !prev)}
                      >
                        {isMatrixSectionExpanded ? "ย่อส่วน Matrix" : "ขยายส่วน Matrix"}
                      </button>
                    </div>

                    {isMatrixSectionExpanded && (
                      <>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-700"
                              disabled={loadingKey !== null}
                              onClick={() => {
                                setMatrixAxisOneName("Color");
                                setMatrixUseSecondAxis(false);
                              }}
                            >
                              Color อย่างเดียว
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-700"
                              disabled={loadingKey !== null}
                              onClick={() => {
                                setMatrixAxisOneName("Size");
                                setMatrixUseSecondAxis(false);
                              }}
                            >
                              Size อย่างเดียว
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-700"
                              disabled={loadingKey !== null}
                              onClick={() => {
                                setMatrixAxisOneName("Color");
                                setMatrixAxisTwoName("Size");
                                setMatrixUseSecondAxis(true);
                              }}
                            >
                              Color + Size
                            </button>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2">
                            <input
                              className="h-9 rounded-md border border-blue-200 bg-white px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                              value={matrixAxisOneName}
                              onChange={(event) => setMatrixAxisOneName(event.target.value)}
                              placeholder="แกนหลัก (เช่น Color หรือ Size)"
                              disabled={loadingKey !== null}
                            />
                            <input
                              className="h-9 rounded-md border border-blue-200 bg-white px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                              value={matrixAxisOneValues}
                              onChange={(event) => setMatrixAxisOneValues(event.target.value)}
                              placeholder="ค่าคั่นด้วย , เช่น White,Black หรือ 750ml,1000ml"
                              disabled={loadingKey !== null}
                            />
                          </div>

                          <label className="flex items-center gap-2 text-[11px] text-blue-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-blue-200 text-blue-600 focus:ring-blue-500"
                              checked={matrixUseSecondAxis}
                              disabled={loadingKey !== null}
                              onChange={(event) => setMatrixUseSecondAxis(event.target.checked)}
                            />
                            ใช้แกนที่ 2 (เช่น Size)
                          </label>

                          {matrixUseSecondAxis && (
                            <div className="grid gap-2 md:grid-cols-2">
                              <input
                                className="h-9 rounded-md border border-blue-200 bg-white px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                                value={matrixAxisTwoName}
                                onChange={(event) => setMatrixAxisTwoName(event.target.value)}
                                placeholder="แกนที่ 2 (เช่น Size)"
                                disabled={loadingKey !== null}
                              />
                              <input
                                className="h-9 rounded-md border border-blue-200 bg-white px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                                value={matrixAxisTwoValues}
                                onChange={(event) => setMatrixAxisTwoValues(event.target.value)}
                                placeholder="ค่าคั่นด้วย , เช่น M,L,XL"
                                disabled={loadingKey !== null}
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 text-xs"
                            onClick={buildMatrixRows}
                            disabled={loadingKey !== null}
                          >
                            สร้างตารางรุ่นย่อย
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 text-xs"
                            onClick={fillMatrixBarcodes}
                            disabled={loadingKey !== null || matrixRows.length === 0}
                          >
                            {loadingKey === "matrix-gen-barcode"
                              ? "กำลังสร้างบาร์โค้ด..."
                              : "สร้างบาร์โค้ดที่ยังว่าง"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 text-xs"
                            onClick={() => {
                              setMatrixRows([]);
                              setIsMatrixSectionExpanded(false);
                            }}
                            disabled={loadingKey !== null || matrixRows.length === 0}
                          >
                            ล้างตาราง
                          </Button>
                        </div>

                        {matrixRows.length > 0 && (
                          <div className="space-y-2 rounded-lg bg-white/90 p-2 ring-1 ring-blue-200/70">
                            <p className="text-[11px] text-blue-700">
                              ตารางรุ่นย่อย ({fmtNumber(matrixRows.length)} รายการ)
                            </p>
                            <div className="space-y-2 md:max-h-[38dvh] md:overflow-y-auto md:pr-1">
                              {matrixRows.map((row, index) => (
                                <div key={row.id} className="rounded-md bg-white p-2 ring-1 ring-slate-200/80">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium text-slate-600">
                                      แถวที่ {index + 1}
                                    </p>
                                    <button
                                      type="button"
                                      className="text-[11px] text-red-600"
                                      disabled={loadingKey !== null}
                                      onClick={() =>
                                        setMatrixRows((prev) =>
                                          prev.filter((item) => item.id !== row.id),
                                        )
                                      }
                                    >
                                      ลบ
                                    </button>
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <input
                                      className="h-9 rounded-md border px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                                      value={row.variantLabel}
                                      onChange={(event) =>
                                        updateMatrixRow(row.id, {
                                          variantLabel: event.target.value,
                                        })
                                      }
                                      placeholder="ชื่อรุ่นย่อย"
                                      disabled={loadingKey !== null}
                                    />
                                    <input
                                      className="h-9 rounded-md border px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                                      value={row.sku}
                                      onChange={(event) =>
                                        updateMatrixRow(row.id, { sku: event.target.value })
                                      }
                                      placeholder="SKU"
                                      disabled={loadingKey !== null}
                                    />
                                    <input
                                      className="h-9 rounded-md border px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                                      value={row.barcode}
                                      onChange={(event) =>
                                        updateMatrixRow(row.id, { barcode: event.target.value })
                                      }
                                      placeholder="Barcode (ไม่บังคับ)"
                                      disabled={loadingKey !== null}
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      className="h-9 rounded-md border px-2 text-xs outline-none ring-blue-500 focus:ring-2"
                                      value={row.sortOrder}
                                      onChange={(event) =>
                                        updateMatrixRow(row.id, {
                                          sortOrder: Number(event.target.value) || 0,
                                        })
                                      }
                                      placeholder="ลำดับ"
                                      disabled={loadingKey !== null}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="rounded-md bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700">
                              ใช้ปุ่มด้านล่างเพื่อยืนยันและบันทึกหลายรุ่นย่อย
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Unit + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-unit"
              >
                หน่วยหลัก
              </label>
              <select
                id="pf-unit"
                className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("baseUnitId")}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} ({u.nameTh})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-slate-700"
                htmlFor="pf-price"
              >
                ราคาขาย/{baseUnit?.code ?? "หน่วย"}
              </label>
              <input
                id="pf-price"
                type="number"
                min={0}
                step={1}
                className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                disabled={loadingKey !== null}
                {...form.register("priceBase")}
              />
              {form.formState.errors.priceBase && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.priceBase.message}
                </p>
              )}
            </div>
          </div>

          {/* Stock threshold overrides */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">
              ตั้งค่าแจ้งเตือนสต็อก (Override)
            </p>
            <p className="text-[11px] text-muted-foreground">
              เว้นว่างเพื่อใช้ค่าตั้งต้นของร้าน: หมด ≤ {fmtNumber(storeOutStockThreshold)},
              ต่ำ ≤ {fmtNumber(storeLowStockThreshold)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-slate-700"
                  htmlFor="pf-out-threshold"
                >
                  สต็อกหมด (≤)
                </label>
                <input
                  id="pf-out-threshold"
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                  disabled={loadingKey !== null}
                  placeholder={`${storeOutStockThreshold}`}
                  {...form.register("outStockThreshold")}
                />
                {form.formState.errors.outStockThreshold && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.outStockThreshold.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-slate-700"
                  htmlFor="pf-low-threshold"
                >
                  สต็อกต่ำ (≤)
                </label>
                <input
                  id="pf-low-threshold"
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                  disabled={loadingKey !== null}
                  placeholder={`${storeLowStockThreshold}`}
                  {...form.register("lowStockThreshold")}
                />
                {form.formState.errors.lowStockThreshold && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.lowStockThreshold.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Conversions */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-700">
                การแปลงหน่วย
              </p>
              <button
                type="button"
                className="text-xs font-medium text-blue-700"
                disabled={loadingKey !== null || !nextAvailableConversionUnitId}
                onClick={() => {
                  if (!nextAvailableConversionUnitId) return;
                  appendConversionUnit(nextAvailableConversionUnitId, 2);
                }}
                title={!nextAvailableConversionUnitId ? "ไม่มีหน่วยให้เพิ่มแล้ว" : undefined}
              >
                + เพิ่มหน่วย
              </button>
            </div>

            {(packUnitTemplate || boxUnitTemplate) && (
              <div className="flex flex-wrap gap-2">
                {packUnitTemplate && (
                  <button
                    type="button"
                    className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loadingKey !== null || !canUseConversionUnit(packUnitTemplate.id)}
                    onClick={() => appendConversionUnit(packUnitTemplate.id, 12)}
                  >
                    + {packUnitTemplate.code} (12)
                  </button>
                )}
                {boxUnitTemplate && (
                  <button
                    type="button"
                    className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loadingKey !== null || !canUseConversionUnit(boxUnitTemplate.id)}
                    onClick={() => appendConversionUnit(boxUnitTemplate.id, 60)}
                  >
                    + {boxUnitTemplate.code} (60)
                  </button>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              หน่วยหลัก:{" "}
              {baseUnit ? `${baseUnit.code} (${baseUnit.nameTh})` : "-"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              ตัวคูณต้องเทียบกับหน่วยหลักเสมอ เช่น 1 PACK = 12 {baseUnit?.code ?? "หน่วยหลัก"}, 1 BOX = 60 {baseUnit?.code ?? "หน่วยหลัก"}
            </p>

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                ยังไม่มีหน่วยแปลง
              </p>
            )}

            {fields.map((field, idx) => {
              const selUnit = unitById.get(
                watchedConversions[idx]?.unitId ?? "",
              );
              const mult = watchedConversions[idx]?.multiplierToBase;

              return (
                <div key={field.id} className="space-y-1 rounded-lg border p-2">
                  <div className="grid grid-cols-[1fr_80px_auto] items-center gap-2">
                    <select
                      className="h-9 rounded-md border px-2 text-sm outline-none ring-blue-500 focus:ring-2"
                      disabled={loadingKey !== null}
                      {...form.register(`conversions.${idx}.unitId`)}
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} ({u.nameTh})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={2}
                      step={1}
                      className="h-9 rounded-md border px-2 text-sm outline-none ring-blue-500 focus:ring-2"
                      disabled={loadingKey !== null}
                      {...form.register(
                        `conversions.${idx}.multiplierToBase`,
                      )}
                    />
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => remove(idx)}
                      disabled={loadingKey !== null}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                  </div>

                  {selUnit && baseUnit && mult ? (
                    <p className="text-[11px] text-blue-700">
                      1 {selUnit.code} ={" "}
                      {Number(mult).toLocaleString("th-TH")} {baseUnit.code}
                    </p>
                  ) : null}

                  {form.formState.errors.conversions?.[idx] && (
                    <p className="text-xs text-red-600">
                      {form.formState.errors.conversions[idx]?.unitId
                        ?.message ??
                        form.formState.errors.conversions[idx]
                          ?.multiplierToBase?.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

        </form>
      </SlideUpSheet>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Product Detail
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showDetailSheet}
        onClose={() => {
          setShowDetailSheet(false);
          setShowDetailImagePreview(false);
          hideDeactivateConfirmImmediately();
        }}
        title={detailProduct?.name ?? "รายละเอียดสินค้า"}
        description={detailProduct ? `SKU: ${detailProduct.sku}` : undefined}
        footer={
          detailProduct ? (
            <div className="space-y-2">
              {detailPrimaryActionCount > 0 && (
                <div className={detailPrimaryActionGridClass}>
                  {canUpdate && (
                    <Button
                      variant="outline"
                      className="h-9 rounded-lg text-xs"
                      onClick={() => beginEdit(detailProduct)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      แก้ไข
                    </Button>
                  )}
                  {canCreate && (
                    <Button
                      variant="outline"
                      className="h-9 rounded-lg text-xs"
                      onClick={() => duplicateProduct(detailProduct)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      สำเนา
                    </Button>
                  )}
                  {canArchive && (
                    <Button
                      variant={detailProduct.active ? "outline" : "default"}
                      className="h-9 rounded-lg text-xs"
                      onClick={handleDetailToggleActive}
                      disabled={isDetailToggleActiveLoading}
                    >
                      {isDetailToggleActiveLoading
                        ? "กำลังอัปเดต..."
                        : detailProduct.active
                          ? "ปิดใช้งาน"
                          : "เปิดใช้งาน"}
                    </Button>
                  )}
                </div>
              )}
              {detailProduct.barcode && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full rounded-lg text-xs"
                  onClick={() => printBarcodeLabel(detailProduct)}
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  พิมพ์บาร์โค้ด
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {detailProduct && (
          <div className="space-y-4">
            {/* Product image + actions */}
            <div className="flex flex-col items-center gap-2">
              {detailProduct.imageUrl ? (
                <button
                  type="button"
                  className="group relative h-24 w-24 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-28"
                  onClick={() => setShowDetailImagePreview(true)}
                  aria-label="ดูรูปเต็มจอ"
                >
                  <Image
                    src={detailProduct.imageUrl}
                    alt={detailProduct.name}
                    fill
                    className="object-cover transition-transform duration-200 group-active:scale-[0.98]"
                    sizes="(max-width: 640px) 96px, 112px"
                  />
                </button>
              ) : (
                <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-28">
                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                    <Package className="h-8 w-8" />
                  </div>
                </div>
              )}
              {detailProduct.imageUrl && (
                <p className="text-[11px] text-muted-foreground">แตะรูปเพื่อดูเต็มจอ</p>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { key: "info", label: "ข้อมูล" },
                  { key: "price", label: "ราคา" },
                  ...(canViewCost
                    ? [{ key: "cost" as DetailTab, label: "ต้นทุน 🔒" }]
                    : []),
                  { key: "conversions", label: "หน่วยแปลง" },
                ] as { key: DetailTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    detailTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                  onClick={() => {
                    setDetailTab(tab.key);
                    if (tab.key === "cost") {
                      setCostDraft(detailProduct.costBase);
                      setEditingCost(false);
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              className="overflow-hidden transition-[height] duration-300 ease-out"
              style={{
                height: detailContentHeight ? `${detailContentHeight}px` : "auto",
              }}
            >
              <div ref={detailContentRef}>
                {/* Tab — ข้อมูล */}
                {detailTab === "info" && (
                  <div className="space-y-3">
                    <InfoRow label="ชื่อ" value={detailProduct.name} />
                    <InfoRow
                      label="SKU"
                      value={detailProduct.sku}
                      action={{
                        label: "คัดลอก",
                        ariaLabel: "คัดลอก SKU",
                        onClick: () => {
                          void copyTextToClipboard(detailProduct.sku, "SKU");
                        },
                      }}
                    />
                    <InfoRow
                      label="บาร์โค้ด"
                      value={detailProduct.barcode ?? "—"}
                      action={
                        detailProduct.barcode
                          ? {
                              label: "คัดลอก",
                              ariaLabel: "คัดลอกบาร์โค้ด",
                              onClick: () => {
                                void copyTextToClipboard(detailProduct.barcode ?? "", "บาร์โค้ด");
                              },
                            }
                          : undefined
                      }
                    />
                    <InfoRow
                      label="สินค้าแม่ (Model)"
                      value={detailProduct.modelName ?? "—"}
                    />
                    <InfoRow
                      label="รุ่นย่อย"
                      value={detailProduct.variantLabel ?? "—"}
                    />
                    <InfoRow
                      label="หมวดหมู่"
                      value={detailProduct.categoryName ?? "— ไม่ระบุ —"}
                    />
                    <InfoRow
                      label="หน่วยหลัก"
                      value={`${detailProduct.baseUnitCode} (${detailProduct.baseUnitNameTh})`}
                    />
                    <InfoRow
                      label="สถานะ"
                      value={detailProduct.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    />

                    {(() => {
                      const thresholds = getEffectiveStockThresholds(detailProduct);
                      return (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-700">
                              เกณฑ์แจ้งเตือนสต็อก
                            </p>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {thresholds.badgeLabel}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">สต็อกคงเหลือปัจจุบัน</span>
                              <span
                                className={`font-semibold ${
                                  detailProduct.stockAvailable <= thresholds.outThreshold
                                    ? "text-red-600"
                                    : detailProduct.stockAvailable <= thresholds.lowThreshold
                                      ? "text-amber-600"
                                      : "text-emerald-700"
                                }`}
                              >
                                {detailProduct.stockAvailable.toLocaleString("th-TH")}{" "}
                                {detailProduct.baseUnitCode}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">สต็อกหมด (≤)</span>
                              <span className="font-semibold text-slate-900">
                                {thresholds.outThreshold.toLocaleString("th-TH")}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">สต็อกต่ำ (≤)</span>
                              <span className="font-semibold text-slate-900">
                                {thresholds.lowThreshold.toLocaleString("th-TH")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {detailProduct.variantOptions.length > 0 && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-medium text-blue-800">
                          คุณสมบัติของรุ่นย่อย
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {detailProduct.variantOptions.map((option) => (
                            <span
                              key={`${option.attributeCode}:${option.valueCode}`}
                              className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] text-blue-700"
                            >
                              {option.attributeName}: {option.valueName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Tab — ราคา */}
                {detailTab === "price" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-blue-50 p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">
                        {fmtPrice(detailProduct.priceBase, currency)}
                      </p>
                      <p className="text-xs text-blue-600">
                        ราคาขาย / {detailProduct.baseUnitCode}
                      </p>
                    </div>
                    {detailProduct.conversions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-700">
                          ราคาตามหน่วยแปลง
                        </p>
                        {detailProduct.conversions.map((c) => (
                          <div
                            key={c.unitId}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                          >
                            <span className="text-xs text-slate-600">
                              {c.unitCode} ({c.unitNameTh})
                            </span>
                            <span className="text-sm font-semibold">
                              {fmtPrice(
                                detailProduct.priceBase * c.multiplierToBase,
                                currency,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab — ต้นทุน 🔒 */}
                {detailTab === "cost" && canViewCost && (
                  <div className="space-y-3">
                    {editingCost ? (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700">
                          ต้นทุน / {detailProduct.baseUnitCode}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={costDraft}
                          onChange={(e) => setCostDraft(Number(e.target.value))}
                          className="h-10 w-full rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 flex-1 text-xs"
                            onClick={() => setEditingCost(false)}
                            disabled={loadingKey !== null}
                          >
                            ยกเลิก
                          </Button>
                          <Button
                            type="button"
                            className="h-9 flex-1 text-xs"
                            onClick={saveCost}
                            disabled={loadingKey !== null}
                          >
                            {loadingKey === `cost-${detailProduct.id}`
                              ? "กำลังบันทึก..."
                              : "บันทึก"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Price vs Cost comparison */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-blue-50 p-3 text-center">
                            <p className="text-lg font-bold text-blue-700">
                              {fmtPrice(detailProduct.priceBase, currency)}
                            </p>
                            <p className="text-[10px] text-blue-500">
                              ราคาขาย / {detailProduct.baseUnitCode}
                            </p>
                          </div>
                          <div className="rounded-xl bg-amber-50 p-3 text-center">
                            <p className="text-lg font-bold text-amber-700">
                              {fmtPrice(detailProduct.costBase, currency)}
                            </p>
                            <p className="text-[10px] text-amber-500">
                              ต้นทุน / {detailProduct.baseUnitCode}
                            </p>
                          </div>
                        </div>

                        {/* Profit summary */}
                        {detailProduct.priceBase > 0 && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">กำไร/หน่วยหลัก</span>
                              <span className="text-sm font-semibold text-emerald-700">
                                {fmtPrice(
                                  detailProduct.priceBase -
                                    detailProduct.costBase,
                                  currency,
                                )}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-xs text-slate-500">อัตรากำไร</span>
                              <span className="text-sm font-semibold text-emerald-700">
                                {detailProduct.costBase > 0
                                  ? `${(((detailProduct.priceBase - detailProduct.costBase) / detailProduct.costBase) * 100).toFixed(1)}%`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        )}

                        {canUpdateCost && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 w-full text-xs"
                            onClick={() => setEditingCost(true)}
                            disabled={loadingKey !== null}
                          >
                            แก้ไขต้นทุน
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Tab — หน่วยแปลง */}
                {detailTab === "conversions" && (
                  <div className="space-y-2">
                    {detailProduct.conversions.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        ไม่มีหน่วยแปลง
                      </p>
                    ) : (
                      detailProduct.conversions.map((c) => (
                        <div
                          key={c.unitId}
                          className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                        >
                          <span className="text-sm font-medium">
                            {c.unitCode} ({c.unitNameTh})
                          </span>
                          <span className="text-xs text-muted-foreground">
                            1 {c.unitCode} = {fmtNumber(c.multiplierToBase)}{" "}
                            {detailProduct.baseUnitCode}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SlideUpSheet>

      {showDetailImagePreview && detailProduct?.imageUrl && (
        <div ref={detailImageOverlayRef} className="fixed inset-0 z-[90] bg-black/90">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setShowDetailImagePreview(false)}
            aria-label="ปิดตัวอย่างรูป"
          />
          <div
            className="relative z-10 flex h-full w-full items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="ตัวอย่างรูปสินค้าเต็มจอ"
          >
            <button
              ref={detailImageCloseButtonRef}
              type="button"
              className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white"
              onClick={() => setShowDetailImagePreview(false)}
              aria-label="ปิด"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative h-full w-full max-w-4xl">
              <Image
                src={detailProduct.imageUrl}
                alt={`${detailProduct.name} (เต็มจอ)`}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            </div>
          </div>
        </div>
      )}

      {showDeactivateConfirm && detailProduct && (
        <div
          ref={deactivateConfirmOverlayRef}
          className={`fixed inset-0 z-[91] flex items-center justify-center p-4 transition-opacity duration-200 ${
            isDeactivateConfirmOpen
              ? "bg-black/50 opacity-100"
              : "pointer-events-none bg-black/0 opacity-0"
          }`}
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="ปิดกล่องยืนยัน"
            onClick={closeDeactivateConfirm}
          />
          <div
            className={`relative z-10 w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl transition-all duration-200 ${
              isDeactivateConfirmOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-95 opacity-0"
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-product-title"
            aria-describedby="deactivate-product-description"
          >
            <p id="deactivate-product-title" className="text-sm font-semibold text-slate-900">
              ยืนยันปิดใช้งานสินค้า
            </p>
            <p id="deactivate-product-description" className="mt-2 text-xs text-slate-600">
              สินค้า <span className="font-medium text-slate-900">{detailProduct.name}</span>{" "}
              จะถูกซ่อนจากรายการที่ใช้งานจนกว่าจะเปิดใช้งานอีกครั้ง
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                ref={deactivateCancelButtonRef}
                type="button"
                variant="outline"
                className="h-10"
                onClick={closeDeactivateConfirm}
                disabled={isDetailToggleActiveLoading}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                className="h-10"
                onClick={confirmDeactivateProduct}
                disabled={isDetailToggleActiveLoading}
              >
                ยืนยันปิดใช้งาน
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Barcode Scanner
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showScannerPermissionSheet}
        onClose={() => setShowScannerPermissionSheet(false)}
        title="ขออนุญาตใช้กล้อง"
        description="ระบบต้องใช้กล้องเพื่อสแกนบาร์โค้ดสินค้า"
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">ทำไมต้องใช้กล้อง?</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>สแกนบาร์โค้ดได้เร็วขึ้น</li>
              <li>ลดความผิดพลาดจากการพิมพ์</li>
              <li>ใช้งานได้ทันทีในหน้านี้</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              onClick={() => setShowScannerPermissionSheet(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              className="h-10 flex-1"
              onClick={() => {
                window.localStorage.setItem("scanner-permission-seen", "1");
                setHasSeenScannerPermission(true);
                setShowScannerPermissionSheet(false);
                setShowScannerSheet(true);
              }}
            >
              อนุญาตและสแกน
            </Button>
          </div>
        </div>
      </SlideUpSheet>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       * SlideUpSheet — Barcode Scanner
       * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SlideUpSheet
        isOpen={showScannerSheet}
        onClose={() => setShowScannerSheet(false)}
        title="สแกนบาร์โค้ด"
        description="ส่องกล้องไปที่บาร์โค้ดสินค้า"
      >
        <BarcodeScanner
          isOpen={showScannerSheet}
          onResult={handleBarcodeResult}
          onClose={() => setShowScannerSheet(false)}
        />
      </SlideUpSheet>
    </section>
  );
}

/* ─── InfoRow ─── */

function InfoRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: {
    label: string;
    ariaLabel: string;
    onClick: () => void;
  };
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{value}</span>
        {action ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            onClick={action.onClick}
            aria-label={action.ariaLabel}
          >
            <Copy className="h-3 w-3" />
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── BarcodeScanner ─── */

function BarcodeScanner({
  isOpen,
  onResult,
  onClose,
}: {
  isOpen: boolean;
  onResult: (barcode: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<import("@zxing/browser").BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<import("@zxing/browser").IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "opening" | "scanning" | "paused" | "no-permission" | "no-camera" | "error"
  >("opening");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [manualBarcode, setManualBarcode] = useState("");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
  };

  type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
    torch?: boolean;
    zoom?: { min: number; max: number; step: number };
  };

  const safeStop = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    stopStream();
  }, []);

  const refreshDevices = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    const cams = list.filter((d) => d.kind === "videoinput");
    setDevices(cams);
    return cams;
  }, []);

  const syncCapabilities = useCallback((track: MediaStreamTrack) => {
    const caps = (track.getCapabilities?.() as ExtendedMediaTrackCapabilities | null) ?? null;
    if (caps && "torch" in caps) {
      setTorchSupported(Boolean(caps.torch));
    } else {
      setTorchSupported(false);
    }
    if (caps && "zoom" in caps) {
      const zoomCaps = caps.zoom;
      if (zoomCaps) {
        setZoomRange({
          min: zoomCaps.min ?? 1,
          max: zoomCaps.max ?? 1,
          step: zoomCaps.step ?? 0.1,
        });
        const current = track.getSettings?.().zoom as number | undefined;
        if (typeof current === "number") setZoom(current);
      }
    } else {
      setZoomRange(null);
    }
  }, []);

  const startScanner = useCallback(async (deviceId?: string) => {
    setError(null);
    setStatus("opening");

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: "environment" },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      trackRef.current = track ?? null;
      if (track) {
        const settings = track.getSettings?.();
        if (settings?.deviceId) {
          setActiveDeviceId(settings.deviceId);
          window.localStorage.setItem("scanner-camera-id", settings.deviceId);
        }
        syncCapabilities(track);
      }

      await refreshDevices();

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 200,
      });
      codeReaderRef.current = reader;

      if (!scannerRef.current) return;

      const controls = await reader.decodeFromStream(
        stream,
        scannerRef.current,
        (result) => {
          if (!result) return;
          safeStop();
          onResult(result.getText());
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("no-permission");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatus("no-camera");
      } else {
        setStatus("error");
      }
      setError("ไม่สามารถเปิดกล้องได้ — กรุณาพิมพ์บาร์โค้ดด้านล่าง");
      safeStop();
    }
  }, [onResult, refreshDevices, safeStop, syncCapabilities]);

  useEffect(() => {
    if (!isOpen) {
      safeStop();
      setStatus("paused");
      return;
    }

    let mounted = true;
    const storedDeviceId = window.localStorage.getItem("scanner-camera-id");
    if (mounted) {
      startScanner(storedDeviceId || undefined);
    }

    return () => {
      mounted = false;
      safeStop();
      codeReaderRef.current = null;
    };
  }, [isOpen, safeStop, startScanner]);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-full max-w-sm">
        <video
          ref={scannerRef}
          className="mx-auto aspect-[3/2] w-full rounded-xl bg-black"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[46%] w-[80%] rounded-lg border-2 border-blue-400/80" />
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        วางบาร์โค้ดให้อยู่กลางกรอบและมีแสงสว่างเพียงพอ
      </p>

      {status === "opening" && (
        <p className="text-center text-xs text-slate-500">กำลังเปิดกล้อง...</p>
      )}
      {status === "no-permission" && (
        <p className="text-center text-xs text-amber-600">
          ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณาเปิดสิทธิ์ในเบราว์เซอร์
        </p>
      )}
      {status === "no-camera" && (
        <p className="text-center text-xs text-amber-600">ไม่พบกล้องในอุปกรณ์นี้</p>
      )}
      {status === "error" && error && (
        <p className="text-center text-xs text-amber-600">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {devices.length > 1 && (
          <div className="space-y-2">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="product-barcode-scanner-camera-select"
            >
              เลือกกล้อง
            </label>
            <select
              id="product-barcode-scanner-camera-select"
              value={activeDeviceId ?? devices[0]?.deviceId ?? ""}
              onChange={async (event) => {
                const nextDeviceId = event.target.value;
                if (!nextDeviceId || nextDeviceId === activeDeviceId) return;
                safeStop();
                setActiveDeviceId(nextDeviceId);
                window.localStorage.setItem("scanner-camera-id", nextDeviceId);
                await startScanner(nextDeviceId);
              }}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `กล้อง ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={async () => {
            if (status === "paused") {
              await startScanner(activeDeviceId ?? undefined);
            } else {
              safeStop();
              setStatus("paused");
            }
          }}
        >
          {status === "paused" ? "เปิดกล้อง" : "พักกล้อง"}
        </Button>

        {torchSupported && (
          <Button
            type="button"
            variant={torchOn ? "default" : "outline"}
            className="h-10 w-full"
            onClick={async () => {
              const track = trackRef.current;
              if (!track) return;
              try {
                await track.applyConstraints({
                  advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
                });
                setTorchOn((prev) => !prev);
              } catch {
                setTorchSupported(false);
              }
            }}
          >
            {torchOn ? "ปิดไฟแฟลช" : "เปิดไฟแฟลช"}
          </Button>
        )}

        {zoomRange && (
          <div className="rounded-lg border px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>ซูม</span>
              <span>{zoom.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={async (e) => {
                const next = Number(e.target.value);
                setZoom(next);
                const track = trackRef.current;
                if (!track) return;
                try {
                  await track.applyConstraints({
                    advanced: [{ zoom: next } as MediaTrackConstraintSet],
                  });
                } catch {
                  setZoomRange(null);
                }
              }}
              className="mt-2 w-full"
            />
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="พิมพ์บาร์โค้ดด้วยมือ"
            className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none ring-blue-500 focus:ring-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualBarcode.trim()) {
                safeStop();
                onResult(manualBarcode.trim());
              }
            }}
          />
          <Button
            type="button"
            className="h-10"
            disabled={!manualBarcode.trim()}
            onClick={() => {
              safeStop();
              onResult(manualBarcode.trim());
            }}
          >
            ค้นหา
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => {
            safeStop();
            onClose();
          }}
        >
          ปิดสแกนเนอร์
        </Button>
      </div>
    </div>
  );
}
