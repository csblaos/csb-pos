"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Boxes,
  Building2,
  CheckCircle2,
  Coffee,
  Grid3X3,
  Link2,
  Plus,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch, setClientAuthToken } from "@/lib/auth/client-token";
import { createTranslator, formatNumberByLanguage } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import {
  formatLaosAddress,
  getDistrictsByProvinceId,
  laosProvinces,
} from "@/lib/location/laos-address";

type StoreMembershipItem = {
  storeId: string;
  storeName: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
  roleName: string;
};

type BranchItem = {
  id: string;
  storeId: string;
  name: string;
  code: string | null;
  address: string | null;
  sourceBranchId: string | null;
  sourceBranchName: string | null;
  sharingMode: "MAIN" | "BALANCED" | "FULL_SYNC" | "INDEPENDENT";
  sharingConfig: BranchSharingConfig | null;
  canAccess?: boolean;
  createdAt: string;
};

type BranchSharingMode = "BALANCED" | "FULL_SYNC" | "INDEPENDENT";

type BranchSharingConfig = {
  shareCatalog: boolean;
  sharePricing: boolean;
  sharePromotions: boolean;
  shareCustomers: boolean;
  shareStaffRoles: boolean;
  shareInventory: boolean;
};

type BranchPolicySummary = {
  isSuperadmin: boolean;
  isStoreOwner: boolean;
  effectiveCanCreateBranches: boolean;
  effectiveMaxBranchesPerStore: number | null;
  effectiveLimitSource: "STORE_OVERRIDE" | "SUPERADMIN_OVERRIDE" | "GLOBAL_DEFAULT" | "UNLIMITED";
  currentBranchCount: number;
  summary: string;
};

type BranchCreateStep = 1 | 2 | 3;

type BranchFieldErrors = Partial<
  Record<"name" | "code" | "address" | "sourceBranchId", string>
>;

type StoresManagementMode = "all" | "quick" | "store-config" | "branch-config";

type StoresManagementProps = {
  language: AppLanguage;
  memberships: StoreMembershipItem[];
  activeStoreId: string;
  activeBranchId: string | null;
  isSuperadmin: boolean;
  canCreateStore: boolean;
  createStoreBlockedReason: string | null;
  storeQuotaSummary: string | null;
  mode?: StoresManagementMode;
};

const storeTypeOptionsBase = [
  {
    value: "ONLINE_RETAIL",
    icon: ShoppingBag,
    iconColorClassName: "text-sky-700",
    iconBgClassName: "bg-sky-100 ring-sky-200",
  },
  {
    value: "RESTAURANT",
    icon: UtensilsCrossed,
    iconColorClassName: "text-amber-700",
    iconBgClassName: "bg-amber-100 ring-amber-200",
  },
  {
    value: "CAFE",
    icon: Coffee,
    iconColorClassName: "text-emerald-700",
    iconBgClassName: "bg-emerald-100 ring-emerald-200",
  },
  {
    value: "OTHER",
    icon: Grid3X3,
    iconColorClassName: "text-violet-700",
    iconBgClassName: "bg-violet-100 ring-violet-200",
  },
] as const;

const branchSharingDefaultsByMode: Record<BranchSharingMode, BranchSharingConfig> = {
  BALANCED: {
    shareCatalog: true,
    sharePricing: true,
    sharePromotions: true,
    shareCustomers: true,
    shareStaffRoles: true,
    shareInventory: false,
  },
  FULL_SYNC: {
    shareCatalog: true,
    sharePricing: true,
    sharePromotions: true,
    shareCustomers: true,
    shareStaffRoles: true,
    shareInventory: true,
  },
  INDEPENDENT: {
    shareCatalog: false,
    sharePricing: false,
    sharePromotions: false,
    shareCustomers: false,
    shareStaffRoles: false,
    shareInventory: false,
  },
};

const getStoreTypeLabels = (t: (key: string, values?: Record<string, string | number>) => string) => ({
  ONLINE_RETAIL: t("stores.type.online"),
  RESTAURANT: t("stores.type.restaurant"),
  CAFE: t("stores.type.cafe"),
  OTHER: t("stores.type.other"),
});

const getBranchSharingModeOptions = (
  t: (key: string, values?: Record<string, string | number>) => string,
) => [
  {
    value: "BALANCED" as const,
    label: t("stores.branchSharing.balanced"),
    description: t("stores.branchSharing.balancedDescription"),
    recommended: true,
  },
  {
    value: "FULL_SYNC" as const,
    label: t("stores.branchSharing.fullSync"),
    description: t("stores.branchSharing.fullSyncDescription"),
  },
  {
    value: "INDEPENDENT" as const,
    label: t("stores.branchSharing.independent"),
    description: t("stores.branchSharing.independentDescription"),
  },
];

const getBranchSharingToggleOptions = (
  t: (key: string, values?: Record<string, string | number>) => string,
) => [
  {
    key: "shareCatalog" as const,
    label: t("stores.sharingToggle.catalog"),
    description: t("stores.sharingToggle.catalogDescription"),
  },
  {
    key: "sharePricing" as const,
    label: t("stores.sharingToggle.pricing"),
    description: t("stores.sharingToggle.pricingDescription"),
  },
  {
    key: "sharePromotions" as const,
    label: t("stores.sharingToggle.promotions"),
    description: t("stores.sharingToggle.promotionsDescription"),
  },
  {
    key: "shareCustomers" as const,
    label: t("stores.sharingToggle.customers"),
    description: t("stores.sharingToggle.customersDescription"),
  },
  {
    key: "shareStaffRoles" as const,
    label: t("stores.sharingToggle.staffRoles"),
    description: t("stores.sharingToggle.staffRolesDescription"),
  },
  {
    key: "shareInventory" as const,
    label: t("stores.sharingToggle.inventory"),
    description: t("stores.sharingToggle.inventoryDescription"),
  },
];

const getBranchCreateSteps = (
  t: (key: string, values?: Record<string, string | number>) => string,
) => [
  {
    id: 1 as const,
    title: t("stores.branchStep.infoTitle"),
    description: t("stores.branchStep.infoDescription"),
  },
  {
    id: 2 as const,
    title: t("stores.branchStep.modeTitle"),
    description: t("stores.branchStep.modeDescription"),
  },
  {
    id: 3 as const,
    title: t("stores.branchStep.reviewTitle"),
    description: t("stores.branchStep.reviewDescription"),
  },
];

const describeSharingConfig = (
  config: BranchSharingConfig | null,
  toggleOptions: Array<{ key: keyof BranchSharingConfig; label: string }>,
  t: (key: string, values?: Record<string, string | number>) => string,
) => {
  if (!config) {
    return t("stores.branchSummary.main");
  }

  const shared = toggleOptions
    .filter((item) => config[item.key])
    .map((item) => item.label);
  const isolated = toggleOptions
    .filter((item) => !config[item.key])
    .map((item) => item.label);

  const sharedLabel =
    shared.length > 0
      ? t("stores.branchSummary.shared", { items: shared.join(", ") })
      : t("stores.branchSummary.sharedNone");
  const isolatedLabel =
    isolated.length > 0
      ? t("stores.branchSummary.isolated", { items: isolated.join(", ") })
      : t("stores.branchSummary.isolatedNone");

  return `${sharedLabel} · ${isolatedLabel}`;
};

export function StoresManagement({
  language,
  memberships,
  activeStoreId,
  activeBranchId,
  isSuperadmin,
  canCreateStore,
  createStoreBlockedReason,
  storeQuotaSummary,
  mode = "all",
}: StoresManagementProps) {
  const router = useRouter();
  const t = useMemo(() => createTranslator(language), [language]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [storeType, setStoreType] =
    useState<(typeof storeTypeOptionsBase)[number]["value"]>("ONLINE_RETAIL");
  const [storeName, setStoreName] = useState("");
  const [provinceId, setProvinceId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [village, setVillage] = useState("");
  const [storePhoneNumber, setStorePhoneNumber] = useState("");

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchPolicy, setBranchPolicy] = useState<BranchPolicySummary | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchSourceBranchId, setBranchSourceBranchId] = useState("");
  const [branchSharingMode, setBranchSharingMode] = useState<BranchSharingMode>("BALANCED");
  const [branchSharingConfig, setBranchSharingConfig] = useState<BranchSharingConfig>(
    branchSharingDefaultsByMode.BALANCED,
  );
  const [branchCreateStep, setBranchCreateStep] = useState<BranchCreateStep>(1);
  const [branchFieldErrors, setBranchFieldErrors] = useState<BranchFieldErrors>({});
  const [isCreateBranchSheetOpen, setIsCreateBranchSheetOpen] = useState(false);
  const [isBranchAdvancedOpen, setIsBranchAdvancedOpen] = useState(false);
  const [switchToCreatedBranch, setSwitchToCreatedBranch] = useState(false);
  const [isCreateStoreSheetOpen, setIsCreateStoreSheetOpen] = useState(false);

  const activeStore = useMemo(
    () => memberships.find((item) => item.storeId === activeStoreId) ?? null,
    [activeStoreId, memberships],
  );
  const storeTypeOptions = useMemo(
    () =>
      storeTypeOptionsBase.map((option) => ({
        ...option,
        title: getStoreTypeLabels(t)[option.value],
      })),
    [t],
  );
  const storeTypeLabels = useMemo(() => getStoreTypeLabels(t), [t]);
  const branchSharingModeOptions = useMemo(() => getBranchSharingModeOptions(t), [t]);
  const branchSharingToggleOptions = useMemo(() => getBranchSharingToggleOptions(t), [t]);
  const branchCreateSteps = useMemo(() => getBranchCreateSteps(t), [t]);
  const districtOptions = useMemo(() => getDistrictsByProvinceId(provinceId), [provinceId]);
  const formattedAddress = useMemo(
    () =>
      formatLaosAddress({
        provinceId,
        districtId,
        detail: village,
      }),
    [provinceId, districtId, village],
  );
  const mainBranch = useMemo(
    () => branches.find((branch) => branch.code === "MAIN") ?? branches[0] ?? null,
    [branches],
  );
  const branchSourceOptions = useMemo(
    () => branches.filter((branch) => branch.code === "MAIN" || branch.sharingMode !== "MAIN"),
    [branches],
  );
  const mainBranchLabel = useMemo(() => t("stores.branchSummary.main"), [t]);
  const branchModeLabels = useMemo(
    () => ({
      MAIN: mainBranchLabel,
      BALANCED: t("stores.branchSharing.balanced"),
      FULL_SYNC: t("stores.branchSharing.fullSync"),
      INDEPENDENT: t("stores.branchSharing.independent"),
    }),
    [mainBranchLabel, t],
  );
  const branchSharingSummary = useMemo(
    () => describeSharingConfig(branchSharingConfig, branchSharingToggleOptions, t),
    [branchSharingConfig, branchSharingToggleOptions, t],
  );
  const canCreateBranch = Boolean(
    branchPolicy?.isStoreOwner && branchPolicy?.effectiveCanCreateBranches,
  );
  const sourceBranchLabel = useMemo(
    () =>
      branchSourceOptions.find((branch) => branch.id === branchSourceBranchId)?.name ??
      null,
    [branchSourceBranchId, branchSourceOptions],
  );
  const sharedBranchSharingLabels = useMemo(
    () =>
      branchSharingToggleOptions
        .filter((item) => branchSharingConfig[item.key])
        .map((item) => item.label),
    [branchSharingConfig, branchSharingToggleOptions],
  );
  const isolatedBranchSharingLabels = useMemo(
    () =>
      branchSharingToggleOptions
        .filter((item) => !branchSharingConfig[item.key])
        .map((item) => item.label),
    [branchSharingConfig, branchSharingToggleOptions],
  );
  const normalizedBranchName = branchName.trim();
  const normalizedBranchCode = branchCode.trim().toUpperCase();
  const isDuplicateBranchName = useMemo(() => {
    if (!normalizedBranchName) {
      return false;
    }
    const target = normalizedBranchName.toLocaleLowerCase();
    return branches.some((branch) => branch.name.trim().toLocaleLowerCase() === target);
  }, [branches, normalizedBranchName]);
  const isDuplicateBranchCode = useMemo(() => {
    if (!normalizedBranchCode) {
      return false;
    }
    return branches.some((branch) => (branch.code ?? "").trim().toUpperCase() === normalizedBranchCode);
  }, [branches, normalizedBranchCode]);
  const activeBranchCreateStepMeta = useMemo(
    () =>
      branchCreateSteps.find((step) => step.id === branchCreateStep) ??
      branchCreateSteps[0],
    [branchCreateStep, branchCreateSteps],
  );
  const showSwitchPanels = mode === "all" || mode === "quick";
  const showStoreCreatePanel = isSuperadmin && (mode === "all" || mode === "store-config");
  const showBranchManagePanel = isSuperadmin && (mode === "all" || mode === "branch-config");

  const switchStore = async (storeId: string) => {
    if (storeId === activeStoreId) {
      return;
    }

    setLoadingKey(`switch-${storeId}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/stores/switch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storeId }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string; token?: string; next?: string; activeStoreName?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? t("stores.toast.switchStoreFailed"));
      setLoadingKey(null);
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    setSuccessMessage(
      t("stores.toast.switchStoreSuccess", {
        name: data?.activeStoreName ?? t("stores.fallback.selectedStore"),
      }),
    );
    setLoadingKey(null);
    router.replace(data?.next ?? "/dashboard");
    router.refresh();
  };

  const switchBranch = async (branchId: string) => {
    if (!branchId || branchId === activeBranchId) {
      return;
    }

    setLoadingKey(`switch-branch-${branchId}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/stores/branches/switch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ branchId }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string; token?: string; next?: string; activeBranchName?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? t("stores.toast.switchBranchFailed"));
      setLoadingKey(null);
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    setSuccessMessage(
      t("stores.toast.switchBranchSuccess", {
        name: data?.activeBranchName ?? t("stores.fallback.selectedBranch"),
      }),
    );
    setLoadingKey(null);
    router.replace(data?.next ?? "/dashboard");
    router.refresh();
  };

  const createStore = async () => {
    if (!isSuperadmin) {
      setErrorMessage(t("stores.validation.superadminOnly"));
      return;
    }

    if (!canCreateStore) {
      setErrorMessage(createStoreBlockedReason ?? t("stores.validation.createStoreBlocked"));
      return;
    }

    if (!storeName.trim()) {
      setErrorMessage(t("stores.validation.storeNameRequired"));
      return;
    }
    if (!provinceId) {
      setErrorMessage(t("stores.validation.provinceRequired"));
      return;
    }
    if (!districtId) {
      setErrorMessage(t("stores.validation.districtRequired"));
      return;
    }
    if (!village.trim()) {
      setErrorMessage(t("stores.validation.villageRequired"));
      return;
    }
    if (!formattedAddress) {
      setErrorMessage(t("stores.validation.addressIncomplete"));
      return;
    }
    const finalAddress = formattedAddress;
    if (finalAddress.length > 300) {
      setErrorMessage(t("stores.validation.addressTooLong"));
      return;
    }
    if (!storePhoneNumber.trim()) {
      setErrorMessage(t("stores.validation.phoneRequired"));
      return;
    }
    if (!/^[0-9+\-\s()]{6,20}$/.test(storePhoneNumber.trim())) {
      setErrorMessage(t("stores.validation.phoneInvalid"));
      return;
    }

    setLoadingKey("create-store");
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/onboarding/store", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storeType,
        storeName: storeName.trim(),
        logoName: storeName.trim(),
        address: finalAddress,
        phoneNumber: storePhoneNumber.trim(),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string; token?: string; next?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? t("stores.toast.createStoreFailed"));
      setLoadingKey(null);
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    setLoadingKey(null);
    setSuccessMessage(t("stores.toast.createStoreSuccess"));
    router.replace(data?.next ?? "/dashboard");
    router.refresh();
  };

  const loadBranches = useCallback(async () => {
    setLoadingKey("load-branches");
    const response = await authFetch("/api/stores/branches", {
      method: "GET",
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as
        | {
            message?: string;
            branches?: BranchItem[];
            policy?: BranchPolicySummary;
            branchAccessMode?: "ALL" | "SELECTED";
          }
        | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? t("stores.toast.loadBranchesFailed"));
      setLoadingKey(null);
      return;
    }

    setBranches(data?.branches ?? []);
    setBranchPolicy(data?.policy ?? null);
    setLoadingKey(null);
  }, [t]);

  useEffect(() => {
    void loadBranches();
  }, [activeStoreId, isSuperadmin, loadBranches]);

  useEffect(() => {
    if (branchSharingMode === "INDEPENDENT") {
      setBranchSourceBranchId("");
      return;
    }

    if (branchSourceBranchId) {
      const exists = branches.some((branch) => branch.id === branchSourceBranchId);
      if (exists) {
        return;
      }
    }

    if (mainBranch) {
      setBranchSourceBranchId(mainBranch.id);
    }
  }, [branchSharingMode, branchSourceBranchId, branches, mainBranch]);

  useEffect(() => {
    setBranchCreateStep(1);
    setBranchFieldErrors({});
    setBranchName("");
    setBranchCode("");
    setBranchAddress("");
    setBranchSourceBranchId("");
    setBranchSharingMode("BALANCED");
    setBranchSharingConfig(branchSharingDefaultsByMode.BALANCED);
    setIsBranchAdvancedOpen(false);
    setSwitchToCreatedBranch(false);
    setIsCreateBranchSheetOpen(false);
  }, [activeStoreId]);

  const clearBranchFieldError = (field: keyof BranchFieldErrors) => {
    setBranchFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      return { ...current, [field]: undefined };
    });
  };

  const validateBranchInfoStep = (): BranchFieldErrors => {
    const errors: BranchFieldErrors = {};
    const normalizedName = branchName.trim();
    const normalizedCode = branchCode.trim().toUpperCase();
    const normalizedAddress = branchAddress.trim();

    if (!normalizedName) {
      errors.name = t("stores.branchValidation.nameRequired");
    } else if (normalizedName.length < 2 || normalizedName.length > 120) {
      errors.name = t("stores.branchValidation.nameLength");
    } else if (isDuplicateBranchName) {
      errors.name = t("stores.branchValidation.nameDuplicate");
    }

    if (normalizedCode.length > 40) {
      errors.code = t("stores.branchValidation.codeLength");
    } else if (normalizedCode && isDuplicateBranchCode) {
      errors.code = t("stores.branchValidation.codeDuplicate");
    }

    if (normalizedAddress.length > 240) {
      errors.address = t("stores.branchValidation.addressLength");
    }

    return errors;
  };

  const validateBranchSharingStep = (): BranchFieldErrors => {
    const errors: BranchFieldErrors = {};

    if (branchSharingMode !== "INDEPENDENT" && !branchSourceBranchId) {
      errors.sourceBranchId = t("stores.branchValidation.sourceRequired");
    }

    return errors;
  };

  const getBranchFormErrorsByStep = (
    step: BranchCreateStep,
  ): BranchFieldErrors => {
    if (step === 1) {
      return validateBranchInfoStep();
    }
    if (step === 2) {
      return validateBranchSharingStep();
    }
    return {
      ...validateBranchInfoStep(),
      ...validateBranchSharingStep(),
    };
  };

  const hasBranchFormErrors = (errors: BranchFieldErrors) =>
    Object.values(errors).some((value) => typeof value === "string" && value.length > 0);

  const moveBranchStepForward = () => {
    if (branchCreateStep === 3) {
      void createBranch();
      return;
    }

    const errors = getBranchFormErrorsByStep(branchCreateStep);
    if (hasBranchFormErrors(errors)) {
      setBranchFieldErrors((current) => ({ ...current, ...errors }));
      setErrorMessage(t("stores.branchValidation.checkCurrentStep"));
      return;
    }

    setErrorMessage(null);
    setBranchCreateStep((current) =>
      current >= 3 ? current : ((current + 1) as BranchCreateStep),
    );
  };

  const moveBranchStepBackward = () => {
    setErrorMessage(null);
    setBranchCreateStep((current) =>
      current <= 1 ? current : ((current - 1) as BranchCreateStep),
    );
  };

  const jumpToBranchStep = (targetStep: BranchCreateStep) => {
    if (targetStep > branchCreateStep || loadingKey === "create-branch") {
      return;
    }
    setErrorMessage(null);
    setBranchCreateStep(targetStep);
  };

  const createBranch = async () => {
    if (!canCreateBranch) {
      setErrorMessage(t("stores.branchValidation.noBranchPermission"));
      return;
    }

    const errors = getBranchFormErrorsByStep(3);
    if (hasBranchFormErrors(errors)) {
      setBranchFieldErrors(errors);
      setErrorMessage(t("stores.branchValidation.checkAll"));
      setBranchCreateStep(
        errors.name || errors.code || errors.address ? 1 : 2,
      );
      return;
    }

    setLoadingKey("create-branch");
    setErrorMessage(null);
    setSuccessMessage(null);
    const existingBranchIds = new Set(branches.map((branch) => branch.id));
    const requestName = branchName.trim();
    const requestCode = branchCode.trim().toUpperCase();

    const response = await authFetch("/api/stores/branches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: requestName,
        code: requestCode || null,
        address: branchAddress.trim() || null,
        sourceBranchId: branchSharingMode === "INDEPENDENT" ? null : branchSourceBranchId || null,
        sharingMode: branchSharingMode,
        sharingConfig: branchSharingConfig,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          branches?: BranchItem[];
          policy?: BranchPolicySummary;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? t("stores.toast.createBranchFailed"));
      setLoadingKey(null);
      return;
    }

    const nextBranches = data?.branches ?? [];
    const createdBranch =
      nextBranches.find((branch) => !existingBranchIds.has(branch.id)) ??
      nextBranches.find(
        (branch) =>
          branch.name.trim().toLocaleLowerCase() === requestName.toLocaleLowerCase() &&
          (branch.code ?? "").trim().toUpperCase() === requestCode,
      ) ??
      null;

    setBranches(nextBranches);
    setBranchPolicy(data?.policy ?? null);
    setBranchName("");
    setBranchCode("");
    setBranchAddress("");
    setBranchSharingMode("BALANCED");
    setBranchSharingConfig(branchSharingDefaultsByMode.BALANCED);
    setBranchSourceBranchId(mainBranch?.id ?? "");
    setBranchCreateStep(1);
    setBranchFieldErrors({});
    setIsBranchAdvancedOpen(false);
    setIsCreateBranchSheetOpen(false);
    setSuccessMessage(t("stores.toast.createBranchSuccess"));
    setLoadingKey(null);

    if (switchToCreatedBranch && createdBranch?.id) {
      await switchBranch(createdBranch.id);
    }
  };

  const applySharingMode = (mode: BranchSharingMode) => {
    setBranchSharingMode(mode);
    setBranchSharingConfig(branchSharingDefaultsByMode[mode]);
    if (mode === "INDEPENDENT") {
      clearBranchFieldError("sourceBranchId");
    }
  };

  const updateSharingToggle = (key: keyof BranchSharingConfig, checked: boolean) => {
    setBranchSharingConfig((current) => ({
      ...current,
      [key]: checked,
    }));
  };

  const openCreateBranchSheet = () => {
    if (!canCreateBranch || loadingKey !== null) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsCreateBranchSheetOpen(true);
  };

  const closeCreateBranchSheet = () => {
    if (loadingKey === "create-branch") {
      return;
    }
    setIsCreateBranchSheetOpen(false);
  };

  const closeCreateStoreSheet = () => {
    if (loadingKey === "create-store") {
      return;
    }
    setIsCreateStoreSheetOpen(false);
  };

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("stores.sections.currentStore")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{activeStore?.storeName ?? "-"}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("stores.currentStore.summary", {
                role: activeStore?.roleName ?? "-",
                count: formatNumberByLanguage(language, memberships.length),
              })}
            </p>
          </div>
        </div>
      </div>

      {showSwitchPanels ? (
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("stores.sections.switchStore")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {t("stores.switchStore.showing", {
                count: formatNumberByLanguage(language, memberships.length),
              })}
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {memberships.map((membership) => {
              const isActive = membership.storeId === activeStoreId;

              return (
                <li key={membership.storeId} className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Store className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{membership.storeName}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {t("stores.switchStore.itemMeta", {
                        type: storeTypeLabels[membership.storeType],
                        role: membership.roleName,
                      })}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      {t("stores.switchStore.active")}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      disabled={loadingKey !== null}
                      onClick={() => switchStore(membership.storeId)}
                    >
                      {loadingKey === `switch-${membership.storeId}`
                        ? t("stores.actions.switching")
                        : t("stores.actions.select")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      ) : null}

      {showSwitchPanels ? (
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("stores.sections.switchBranch")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {t("stores.switchBranch.showing", {
                count: formatNumberByLanguage(language, branches.length),
              })}
            </p>
          </div>
          {loadingKey === "load-branches" ? (
            <p className="px-4 py-4 text-sm text-slate-500">{t("stores.switchBranch.loading")}</p>
          ) : branches.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">{t("stores.switchBranch.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {branches.map((branch) => {
                const isActiveBranch = branch.id === activeBranchId;
                const canAccessBranch = branch.canAccess ?? true;

                return (
                  <li key={branch.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {branch.name}
                        {branch.code === "MAIN" ? (
                          <span className="ml-1 rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                            {mainBranchLabel}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {branch.address ?? t("stores.fallback.noBranchAddress")}
                      </p>
                    </div>
                    {isActiveBranch ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("stores.switchBranch.active")}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        disabled={loadingKey !== null || !canAccessBranch}
                        onClick={() => switchBranch(branch.id)}
                      >
                        {canAccessBranch
                          ? loadingKey === `switch-branch-${branch.id}`
                            ? t("stores.actions.switching")
                            : t("stores.actions.select")
                          : t("stores.actions.noAccess")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      ) : null}

      {showStoreCreatePanel ? (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("stores.sections.createStore")}</p>
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t("stores.createStore.cardTitle")}</p>
                <p className="mt-0.5 text-xs text-slate-500">{t("stores.createStore.cardDescription")}</p>
                {storeQuotaSummary ? <p className="mt-1 text-xs text-slate-500">{storeQuotaSummary}</p> : null}
              </div>
              <Button
                type="button"
                className="h-10 w-full"
                onClick={() => setIsCreateStoreSheetOpen(true)}
                disabled={loadingKey !== null || !canCreateStore}
              >
                <Plus className="h-4 w-4" />
                {t("stores.createStore.openAction")}
              </Button>
              {!canCreateStore && createStoreBlockedReason ? (
                <p className="text-sm text-red-600">{createStoreBlockedReason}</p>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      {showBranchManagePanel ? (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("stores.sections.branchManage")}</p>
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{t("stores.branchManage.title")}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t("stores.branchManage.store", { name: activeStore?.storeName ?? "-" })}</p>
              {branchPolicy ? <p className="mt-1 text-xs text-slate-500">{t("stores.branchManage.quota", { summary: branchPolicy.summary })}</p> : null}
              <p className="mt-1 text-xs text-slate-500">{t("stores.branchManage.policyNote")}</p>
            </div>

            <div className="space-y-4 border-b border-slate-100 px-4 py-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">
                  {t("stores.branchManage.recommendedFlowTitle")}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t("stores.branchManage.recommendedFlowDescription")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-sm font-medium text-slate-900">{t("stores.branchManage.createCardTitle")}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t("stores.branchManage.createCardDescription")}
                </p>
                <Button
                  type="button"
                  className="mt-3 h-10 w-full"
                  onClick={openCreateBranchSheet}
                  disabled={loadingKey !== null || !canCreateBranch}
                >
                  <Plus className="h-4 w-4" />
                  {t("stores.branchManage.openCreateBranch")}
                </Button>
              </div>

              {branchPolicy && !branchPolicy.effectiveCanCreateBranches ? (
                <p className="text-sm text-red-600">{t("stores.branchValidation.noBranchPermission")}</p>
              ) : null}
            </div>

            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{t("stores.branchManage.listTitle")}</p>
              {loadingKey === "load-branches" ? (
                <p className="text-sm text-slate-500">{t("stores.switchBranch.loading")}</p>
              ) : branches.length === 0 ? (
                <p className="text-sm text-slate-500">{t("stores.switchBranch.empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {branches.map((branch) => (
                    <li key={branch.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-slate-500">
                          <Building2 className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {branch.name}
                            {branch.sharingMode === "MAIN" ? (
                              <span className="ml-1.5 inline-flex items-center rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {mainBranchLabel}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {t("stores.branchManage.branchMeta", {
                              code: branch.code ?? "-",
                              address: branch.address ?? "-",
                            })}
                          </p>
                          {branch.sharingMode !== "MAIN" ? (
                            <>
                              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <Boxes className="h-3.5 w-3.5" />
                                {t("stores.branchManage.sharingMode", {
                                  value: branchModeLabels[branch.sharingMode],
                                })}
                              </p>
                              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <Warehouse className="h-3.5 w-3.5" />
                                {t("stores.branchManage.sourceBranch", { value: branch.sourceBranchName ?? "-" })}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {describeSharingConfig(branch.sharingConfig, branchSharingToggleOptions, t)}
                              </p>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </div>
      ) : null}

      {showBranchManagePanel ? (
        <SlideUpSheet
          isOpen={isCreateBranchSheetOpen}
          onClose={closeCreateBranchSheet}
          title={t("stores.branchSheet.title")}
          description={t("stores.branchSheet.description")}
          panelMaxWidthClass="min-[1200px]:max-w-2xl"
          disabled={loadingKey === "create-branch"}
          footer={
            <>
              {branchPolicy && !branchPolicy.effectiveCanCreateBranches ? (
                <p className="mb-2 text-sm text-red-600">{t("stores.branchValidation.noBranchPermission")}</p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-4"
                  onClick={branchCreateStep === 1 ? closeCreateBranchSheet : moveBranchStepBackward}
                  disabled={loadingKey !== null}
                >
                  {branchCreateStep === 1 ? t("common.cancel") : t("stores.actions.back")}
                </Button>
                <Button
                  type="button"
                  className="h-10 min-w-[9rem] px-4"
                  onClick={moveBranchStepForward}
                  disabled={loadingKey !== null || !canCreateBranch}
                >
                  {branchCreateStep === 3
                    ? loadingKey === "create-branch"
                      ? t("stores.branchSheet.creating")
                      : t("stores.branchSheet.create")
                    : t("stores.actions.next")}
                </Button>
              </div>
            </>
          }
        >
          <div className="space-y-4">
            <div className="sticky top-0 z-10 -mx-4 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div className="relative">
                  <div className="absolute left-5 right-5 top-4 h-px bg-slate-200" />
                  <ol className="relative grid grid-cols-3 gap-2">
                    {branchCreateSteps.map((step) => {
                      const isActiveStep = branchCreateStep === step.id;
                      const isCompletedStep = branchCreateStep > step.id;
                      const canJump = step.id <= branchCreateStep;

                      return (
                        <li key={step.id} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => jumpToBranchStep(step.id)}
                            disabled={!canJump || loadingKey === "create-branch"}
                            className={`flex w-full flex-col items-center gap-1 text-center ${!canJump ? "opacity-60" : ""}`}
                          >
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition ${
                                isCompletedStep
                                  ? "border-emerald-300 bg-emerald-500 text-white"
                                  : isActiveStep
                                    ? "border-blue-400 bg-blue-500 text-white shadow-sm"
                                    : "border-slate-300 bg-white text-slate-500"
                              }`}
                            >
                              {isCompletedStep ? "✓" : step.id}
                            </span>
                            <span
                              className={`block w-full truncate text-[11px] font-medium ${
                                isActiveStep || isCompletedStep ? "text-slate-900" : "text-slate-500"
                              }`}
                            >
                              {step.title}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {t("stores.branchSheet.step", { step: activeBranchCreateStepMeta.id })}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {activeBranchCreateStepMeta.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{activeBranchCreateStepMeta.description}</p>
                </div>
              </div>
            </div>

            {branchCreateStep === 1 ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="create-branch-name">
                    {t("stores.form.branchName")}
                  </label>
                  <input
                    id="create-branch-name"
                    value={branchName}
                    onChange={(event) => {
                      setBranchName(event.target.value);
                      clearBranchFieldError("name");
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder={t("stores.form.branchNamePlaceholder")}
                    disabled={loadingKey !== null}
                  />
                  {branchFieldErrors.name ? (
                    <p className="text-xs text-red-600">{branchFieldErrors.name}</p>
                  ) : isDuplicateBranchName ? (
                    <p className="text-xs text-red-600">{t("stores.branchValidation.nameDuplicate")}</p>
                  ) : (
                    <p className="text-xs text-slate-500">{t("stores.branchValidation.nameHint")}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500" htmlFor="create-branch-code">
                      {t("stores.form.branchCode")}
                    </label>
                    <input
                      id="create-branch-code"
                      value={branchCode}
                      onChange={(event) => {
                        setBranchCode(event.target.value.toUpperCase());
                        clearBranchFieldError("code");
                      }}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder={t("stores.form.optional")}
                      disabled={loadingKey !== null}
                    />
                    {branchFieldErrors.code ? (
                      <p className="text-xs text-red-600">{branchFieldErrors.code}</p>
                    ) : isDuplicateBranchCode ? (
                      <p className="text-xs text-red-600">{t("stores.branchValidation.codeDuplicate")}</p>
                    ) : (
                      <p className="text-xs text-slate-500">{t("stores.branchValidation.codeHint")}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500" htmlFor="create-branch-address">
                      {t("stores.form.branchAddress")}
                    </label>
                    <input
                      id="create-branch-address"
                      value={branchAddress}
                      onChange={(event) => {
                        setBranchAddress(event.target.value);
                        clearBranchFieldError("address");
                      }}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder={t("stores.form.optional")}
                      disabled={loadingKey !== null}
                    />
                    {branchFieldErrors.address ? (
                      <p className="text-xs text-red-600">{branchFieldErrors.address}</p>
                    ) : (
                      <p className="text-xs text-slate-500">{t("stores.branchValidation.addressHint")}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {branchCreateStep === 2 ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">{t("stores.branchSheet.modeLabel")}</p>
                  <p className="text-xs text-slate-500">{t("stores.branchSheet.modeHint")}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {branchSharingModeOptions.map((option) => {
                      const selected = branchSharingMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-left transition ${
                            selected
                              ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            applySharingMode(option.value);
                            clearBranchFieldError("sourceBranchId");
                          }}
                          disabled={loadingKey !== null}
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            {option.label}
                            {option.recommended ? (
                              <span className="ml-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                {t("stores.branchSheet.recommended")}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="create-branch-source">
                    {t("stores.branchSheet.sourceLabel")}
                  </label>
                  <div className="relative">
                    <ArrowRightLeft className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      id="create-branch-source"
                      value={branchSharingMode === "INDEPENDENT" ? "" : branchSourceBranchId}
                      onChange={(event) => {
                        setBranchSourceBranchId(event.target.value);
                        clearBranchFieldError("sourceBranchId");
                      }}
                      disabled={loadingKey !== null || branchSharingMode === "INDEPENDENT"}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">{t("stores.branchSheet.sourcePlaceholder")}</option>
                      {branchSourceOptions.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                          {branch.code === "MAIN" ? ` (${mainBranchLabel})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {branchFieldErrors.sourceBranchId ? (
                    <p className="text-xs text-red-600">{branchFieldErrors.sourceBranchId}</p>
                  ) : (
                    <p className="text-xs text-slate-500">{t("stores.branchSheet.sourceHint")}</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <button
                    type="button"
                    className="w-full text-left text-xs font-medium text-slate-700"
                    onClick={() => setIsBranchAdvancedOpen((current) => !current)}
                  >
                    {isBranchAdvancedOpen
                      ? t("stores.branchSheet.hideAdvanced")
                      : t("stores.branchSheet.showAdvanced")}
                  </button>

                  {isBranchAdvancedOpen ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {branchSharingToggleOptions.map((item) => (
                        <label
                          key={item.key}
                          className={`flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-2.5 py-2 ${
                            branchSharingMode === "INDEPENDENT" ? "opacity-70" : ""
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-slate-900">{item.label}</span>
                            <span className="block text-[11px] text-slate-500">{item.description}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={branchSharingConfig[item.key]}
                            onChange={(event) => updateSharingToggle(item.key, event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            disabled={loadingKey !== null}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="inline-flex items-center gap-1 text-xs font-medium text-blue-800">
                    <Link2 className="h-3.5 w-3.5" />
                    {t("stores.branchSheet.sharingSummary")}
                  </p>
                  <p className="mt-1 text-xs text-blue-800">{branchSharingSummary}</p>
                </div>
              </div>
            ) : null}

            {branchCreateStep === 3 ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-medium text-emerald-700">{t("stores.branchSheet.readyTitle")}</p>
                  <p className="mt-1 text-xs text-emerald-800">
                    {t("stores.branchSheet.readyDescription")}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t("stores.branchSheet.reviewTitle")}</p>
                  <dl className="mt-2 space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">{t("stores.form.branchName")}</dt>
                      <dd className="text-right font-medium text-slate-900">{normalizedBranchName || "-"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">{t("stores.form.branchCode")}</dt>
                      <dd className="text-right font-medium text-slate-900">{normalizedBranchCode || "-"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">{t("stores.form.branchAddress")}</dt>
                      <dd className="text-right font-medium text-slate-900">{branchAddress.trim() || "-"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">{t("stores.branchSheet.modeLabel")}</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {branchModeLabels[branchSharingMode]}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">{t("stores.branchSheet.sourceShortLabel")}</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {branchSharingMode === "INDEPENDENT"
                          ? t("stores.branchSheet.noSource")
                          : sourceBranchLabel ?? "-"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-xs font-medium text-emerald-700">{t("stores.branchSheet.sharedData")}</p>
                    <p className="mt-1 text-xs text-emerald-800">
                      {sharedBranchSharingLabels.length > 0
                        ? sharedBranchSharingLabels.join(", ")
                        : t("stores.branchSummary.sharedNonePlain")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-700">{t("stores.branchSheet.isolatedData")}</p>
                    <p className="mt-1 text-xs text-slate-700">
                      {isolatedBranchSharingLabels.length > 0
                        ? isolatedBranchSharingLabels.join(", ")
                        : t("stores.branchSummary.isolatedNonePlain")}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={switchToCreatedBranch}
                    onChange={(event) => setSwitchToCreatedBranch(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    disabled={loadingKey !== null}
                  />
                  <span className="text-sm text-slate-700">{t("stores.branchSheet.switchAfterCreate")}</span>
                </label>
              </div>
            ) : null}
          </div>
        </SlideUpSheet>
      ) : null}

      {showStoreCreatePanel ? (
        <SlideUpSheet
          isOpen={isCreateStoreSheetOpen}
          onClose={closeCreateStoreSheet}
          title={t("stores.createStore.sheetTitle")}
          description={t("stores.createStore.sheetDescription")}
          panelMaxWidthClass="min-[1200px]:max-w-md"
          disabled={loadingKey === "create-store"}
          footer={
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                onClick={closeCreateStoreSheet}
                disabled={loadingKey === "create-store"}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="h-10 min-w-[9rem] px-4"
                onClick={createStore}
                disabled={loadingKey !== null || !canCreateStore}
              >
                {loadingKey === "create-store" ? t("stores.createStore.creating") : t("stores.createStore.confirm")}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">{t("stores.form.storeType")}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("stores.form.storeType")}>
                {storeTypeOptions.map((option) => {
                  const selected = storeType === option.value;
                  const Icon = option.icon;

                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${
                        selected
                          ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      } ${loadingKey !== null || !canCreateStore ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="create-store-type"
                        value={option.value}
                        checked={selected}
                        onChange={() => setStoreType(option.value)}
                        className="sr-only"
                        disabled={loadingKey !== null || !canCreateStore}
                      />
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${option.iconBgClassName}`}
                      >
                        <Icon className={`h-4 w-4 ${option.iconColorClassName}`} />
                      </span>
                      <span className="text-sm font-medium text-slate-900">{option.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-name">
                {t("stores.form.storeName")}
              </label>
              <input
                id="create-store-name"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
                placeholder={t("stores.form.storeNamePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-province">
                {t("stores.form.province")}
              </label>
              <select
                id="create-store-province"
                value={provinceId ?? ""}
                onChange={(event) => {
                  const nextProvinceId = Number(event.target.value) || null;
                  setProvinceId(nextProvinceId);
                  setDistrictId(null);
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
              >
                <option value="">{t("stores.form.provincePlaceholder")}</option>
                {laosProvinces.map((province) => (
                  <option key={province.id} value={province.id}>
                    {province.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-district">
                {t("stores.form.district")}
              </label>
              <select
                id="create-store-district"
                value={districtId ?? ""}
                onChange={(event) => setDistrictId(Number(event.target.value) || null)}
                disabled={!provinceId || loadingKey !== null || !canCreateStore}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">{t("stores.form.districtPlaceholder")}</option>
                {districtOptions.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-village">
                {t("stores.form.village")}
              </label>
              <input
                id="create-store-village"
                value={village}
                onChange={(event) => setVillage(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
                placeholder={t("stores.form.villagePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-phone">
                {t("stores.form.phone")}
              </label>
              <input
                id="create-store-phone"
                value={storePhoneNumber}
                onChange={(event) => setStorePhoneNumber(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
                placeholder={t("stores.form.phonePlaceholder")}
              />
            </div>

            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t("stores.createStore.defaultsHint")}
            </p>
          </div>
        </SlideUpSheet>
      ) : null}

      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}
    </section>
  );
}
