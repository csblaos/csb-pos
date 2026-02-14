"use client";

import { type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
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
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { authFetch, setClientAuthToken } from "@/lib/auth/client-token";
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

type StoresManagementProps = {
  memberships: StoreMembershipItem[];
  activeStoreId: string;
  activeBranchId: string | null;
  isSuperadmin: boolean;
  canCreateStore: boolean;
  createStoreBlockedReason: string | null;
  storeQuotaSummary: string | null;
};

const storeTypeOptions = [
  {
    value: "ONLINE_RETAIL",
    title: "Online POS",
    icon: ShoppingBag,
    iconColorClassName: "text-sky-700",
    iconBgClassName: "bg-sky-100 ring-sky-200",
  },
  {
    value: "RESTAURANT",
    title: "Restaurant POS",
    icon: UtensilsCrossed,
    iconColorClassName: "text-amber-700",
    iconBgClassName: "bg-amber-100 ring-amber-200",
  },
  {
    value: "CAFE",
    title: "Cafe POS",
    icon: Coffee,
    iconColorClassName: "text-emerald-700",
    iconBgClassName: "bg-emerald-100 ring-emerald-200",
  },
  {
    value: "OTHER",
    title: "Other POS",
    icon: Grid3X3,
    iconColorClassName: "text-violet-700",
    iconBgClassName: "bg-violet-100 ring-violet-200",
  },
] as const;

const storeTypeLabels: Record<StoreMembershipItem["storeType"], string> = {
  ONLINE_RETAIL: "Online POS",
  RESTAURANT: "Restaurant POS",
  CAFE: "Cafe POS",
  OTHER: "Other POS",
};

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

const branchSharingModeOptions: Array<{
  value: BranchSharingMode;
  label: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    value: "BALANCED",
    label: "Balanced",
    description: "แชร์ข้อมูลหลักจาก Main Branch แต่แยกสต็อกตามสาขา",
    recommended: true,
  },
  {
    value: "FULL_SYNC",
    label: "Full Sync",
    description: "แชร์ข้อมูลทั้งหมดรวมถึงสต็อกกับ Main Branch",
  },
  {
    value: "INDEPENDENT",
    label: "Independent",
    description: "สาขาแยกข้อมูลเองเกือบทั้งหมด",
  },
];

const branchSharingToggleOptions: Array<{
  key: keyof BranchSharingConfig;
  label: string;
  description: string;
}> = [
  {
    key: "shareCatalog",
    label: "สินค้าและหน่วยนับ",
    description: "Products, category, units",
  },
  {
    key: "sharePricing",
    label: "ราคา",
    description: "ราคาและโครงสร้างราคา",
  },
  {
    key: "sharePromotions",
    label: "โปรโมชัน",
    description: "ชุดโปรโมชันกลาง",
  },
  {
    key: "shareCustomers",
    label: "ฐานลูกค้า",
    description: "รายชื่อและข้อมูลลูกค้า",
  },
  {
    key: "shareStaffRoles",
    label: "บทบาทมาตรฐาน",
    description: "Role templates และสิทธิ์พื้นฐาน",
  },
  {
    key: "shareInventory",
    label: "สต็อกรวม",
    description: "คงเหลือรวมร่วมกับ Main Branch",
  },
];

const describeSharingConfig = (config: BranchSharingConfig | null) => {
  if (!config) {
    return "สาขาหลัก";
  }

  const shared = branchSharingToggleOptions
    .filter((item) => config[item.key])
    .map((item) => item.label);
  const isolated = branchSharingToggleOptions
    .filter((item) => !config[item.key])
    .map((item) => item.label);

  const sharedLabel = shared.length > 0 ? `แชร์: ${shared.join(", ")}` : "แชร์: ไม่แชร์ข้อมูลร่วม";
  const isolatedLabel =
    isolated.length > 0 ? `แยก: ${isolated.join(", ")}` : "แยก: ไม่มี (แชร์ทั้งหมด)";

  return `${sharedLabel} · ${isolatedLabel}`;
};

export function StoresManagement({
  memberships,
  activeStoreId,
  activeBranchId,
  isSuperadmin,
  canCreateStore,
  createStoreBlockedReason,
  storeQuotaSummary,
}: StoresManagementProps) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [storeType, setStoreType] =
    useState<(typeof storeTypeOptions)[number]["value"]>("ONLINE_RETAIL");
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
  const [isCreateStoreSheetOpen, setIsCreateStoreSheetOpen] = useState(false);
  const [isCreateStoreSheetDragging, setIsCreateStoreSheetDragging] = useState(false);
  const [createStoreSheetDragY, setCreateStoreSheetDragY] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const createStoreSheetStartYRef = useRef<number | null>(null);
  const createStoreSheetCanDragRef = useRef(false);
  const createStoreSheetScrollYRef = useRef(0);
  const createStoreSheetBodyStyleRef = useRef<{
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
  } | null>(null);

  const activeStore = useMemo(
    () => memberships.find((item) => item.storeId === activeStoreId) ?? null,
    [activeStoreId, memberships],
  );
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
  const branchSharingSummary = useMemo(
    () => describeSharingConfig(branchSharingConfig),
    [branchSharingConfig],
  );

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
      setErrorMessage(data?.message ?? "สลับร้านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    setSuccessMessage(`เปลี่ยนร้านเป็น ${data?.activeStoreName ?? "ร้านที่เลือก"} แล้ว`);
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
      setErrorMessage(data?.message ?? "เปลี่ยนสาขาไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    setSuccessMessage(`เปลี่ยนสาขาเป็น ${data?.activeBranchName ?? "สาขาที่เลือก"} แล้ว`);
    setLoadingKey(null);
    router.replace(data?.next ?? "/dashboard");
    router.refresh();
  };

  const createStore = async () => {
    if (!isSuperadmin) {
      setErrorMessage("เฉพาะบัญชี SUPERADMIN เท่านั้น");
      return;
    }

    if (!canCreateStore) {
      setErrorMessage(createStoreBlockedReason ?? "บัญชีนี้ยังไม่สามารถสร้างร้านเพิ่มได้");
      return;
    }

    if (!storeName.trim()) {
      setErrorMessage("กรุณากรอกชื่อร้าน");
      return;
    }
    if (!provinceId) {
      setErrorMessage("กรุณาเลือก Province");
      return;
    }
    if (!districtId) {
      setErrorMessage("กรุณาเลือก District");
      return;
    }
    if (!village.trim()) {
      setErrorMessage("กรุณากรอก Village");
      return;
    }
    if (!formattedAddress) {
      setErrorMessage("ข้อมูลที่อยู่ร้านไม่ครบ");
      return;
    }
    const finalAddress = formattedAddress;
    if (finalAddress.length > 300) {
      setErrorMessage("ข้อมูลที่อยู่ร้านยาวเกินกำหนด");
      return;
    }
    if (!storePhoneNumber.trim()) {
      setErrorMessage("กรุณากรอกเบอร์โทรร้าน");
      return;
    }
    if (!/^[0-9+\-\s()]{6,20}$/.test(storePhoneNumber.trim())) {
      setErrorMessage("รูปแบบเบอร์โทรไม่ถูกต้อง");
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
      setErrorMessage(data?.message ?? "สร้างร้านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    setLoadingKey(null);
    setSuccessMessage("สร้างร้านใหม่เรียบร้อยแล้ว");
    router.replace(data?.next ?? "/dashboard");
    router.refresh();
  };

  const loadBranches = async () => {
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
      setErrorMessage(data?.message ?? "โหลดข้อมูลสาขาไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setBranches(data?.branches ?? []);
    setBranchPolicy(data?.policy ?? null);
    setLoadingKey(null);
  };

  useEffect(() => {
    void loadBranches();
  }, [activeStoreId, isSuperadmin]);

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
    if (!isCreateStoreSheetOpen) {
      return;
    }

    const body = document.body;
    createStoreSheetScrollYRef.current = window.scrollY;
    createStoreSheetBodyStyleRef.current = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${createStoreSheetScrollYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || loadingKey === "create-store") {
        return;
      }
      setCreateStoreSheetDragY(0);
      setIsCreateStoreSheetDragging(false);
      createStoreSheetStartYRef.current = null;
      createStoreSheetCanDragRef.current = false;
      setIsCreateStoreSheetOpen(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      const previousBodyStyle = createStoreSheetBodyStyleRef.current;
      if (previousBodyStyle) {
        body.style.position = previousBodyStyle.position;
        body.style.top = previousBodyStyle.top;
        body.style.left = previousBodyStyle.left;
        body.style.right = previousBodyStyle.right;
        body.style.width = previousBodyStyle.width;
        body.style.overflow = previousBodyStyle.overflow;
      }
      window.scrollTo(0, createStoreSheetScrollYRef.current);
    };
  }, [isCreateStoreSheetOpen, loadingKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const applyViewportState = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    applyViewportState();
    mediaQuery.addEventListener("change", applyViewportState);
    return () => {
      mediaQuery.removeEventListener("change", applyViewportState);
    };
  }, []);

  const createBranch = async () => {
    if (!branchName.trim()) {
      setErrorMessage("กรุณากรอกชื่อสาขา");
      return;
    }
    if (branchSharingMode !== "INDEPENDENT" && !branchSourceBranchId) {
      setErrorMessage("กรุณาเลือกสาขาต้นทาง (แนะนำ: สาขาหลัก)");
      return;
    }

    setLoadingKey("create-branch");
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/stores/branches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: branchName.trim(),
        code: branchCode.trim() || null,
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
      setErrorMessage(data?.message ?? "สร้างสาขาไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    setBranches(data?.branches ?? []);
    setBranchPolicy(data?.policy ?? null);
    setBranchName("");
    setBranchCode("");
    setBranchAddress("");
    setBranchSharingMode("BALANCED");
    setBranchSharingConfig(branchSharingDefaultsByMode.BALANCED);
    setBranchSourceBranchId(mainBranch?.id ?? "");
    setSuccessMessage("สร้างสาขาเรียบร้อยแล้ว");
    setLoadingKey(null);
  };

  const applySharingMode = (mode: BranchSharingMode) => {
    setBranchSharingMode(mode);
    setBranchSharingConfig(branchSharingDefaultsByMode[mode]);
  };

  const updateSharingToggle = (key: keyof BranchSharingConfig, checked: boolean) => {
    setBranchSharingConfig((current) => ({
      ...current,
      [key]: checked,
    }));
  };

  const closeCreateStoreSheet = () => {
    if (loadingKey === "create-store") {
      return;
    }
    setCreateStoreSheetDragY(0);
    setIsCreateStoreSheetDragging(false);
    createStoreSheetStartYRef.current = null;
    createStoreSheetCanDragRef.current = false;
    setIsCreateStoreSheetOpen(false);
  };

  const resetCreateStoreSheetDrag = () => {
    setCreateStoreSheetDragY(0);
    setIsCreateStoreSheetDragging(false);
    createStoreSheetStartYRef.current = null;
    createStoreSheetCanDragRef.current = false;
  };

  const handleCreateStoreSheetTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isCreateStoreSheetOpen || loadingKey === "create-store" || isDesktopViewport) {
      return;
    }

    createStoreSheetCanDragRef.current = true;
    createStoreSheetStartYRef.current = event.touches[0]?.clientY ?? null;
    setCreateStoreSheetDragY(0);
    setIsCreateStoreSheetDragging(false);
  };

  const handleCreateStoreSheetTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktopViewport || !createStoreSheetCanDragRef.current || createStoreSheetStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") {
      return;
    }

    const deltaY = Math.max(0, currentY - createStoreSheetStartYRef.current);
    if (deltaY <= 0) {
      return;
    }

    setIsCreateStoreSheetDragging(true);
    setCreateStoreSheetDragY(deltaY);
    event.preventDefault();
  };

  const handleCreateStoreSheetTouchEnd = () => {
    if (isDesktopViewport) {
      return;
    }

    if (!createStoreSheetCanDragRef.current && createStoreSheetStartYRef.current === null) {
      return;
    }

    const shouldClose = createStoreSheetDragY > 120;
    if (shouldClose) {
      closeCreateStoreSheet();
      return;
    }

    resetCreateStoreSheetDrag();
  };

  const createStoreSheetBackdropOpacity = isCreateStoreSheetOpen
    ? Math.max(0, 1 - Math.min(createStoreSheetDragY / 220, 1) * 0.55)
    : 0;
  const createStoreSheetInlineStyle =
    isCreateStoreSheetOpen && !isDesktopViewport ? { transform: `translateY(${createStoreSheetDragY}px)` } : undefined;

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          สรุปร้านปัจจุบัน
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{activeStore?.storeName ?? "-"}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              บทบาท {activeStore?.roleName ?? "-"} · เข้าถึงทั้งหมด {memberships.length.toLocaleString("th-TH")} ร้าน
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          เลือกร้าน / เปลี่ยนร้าน
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">แสดง {memberships.length.toLocaleString("th-TH")} ร้าน</p>
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
                      {storeTypeLabels[membership.storeType]} · บทบาท {membership.roleName}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      ร้านที่กำลังใช้งาน
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      disabled={loadingKey !== null}
                      onClick={() => switchStore(membership.storeId)}
                    >
                      {loadingKey === `switch-${membership.storeId}` ? "กำลังเปลี่ยน..." : "เลือก"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          เลือกสาขา / เปลี่ยนสาขา
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              แสดง {branches.length.toLocaleString("th-TH")} สาขาในร้านนี้
            </p>
          </div>
          {loadingKey === "load-branches" ? (
            <p className="px-4 py-4 text-sm text-slate-500">กำลังโหลดข้อมูลสาขา...</p>
          ) : branches.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">ยังไม่มีข้อมูลสาขา</p>
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
                            MAIN
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {branch.address ?? "ไม่มีที่อยู่สาขา"}
                      </p>
                    </div>
                    {isActiveBranch ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        สาขาที่กำลังใช้งาน
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
                            ? "กำลังเปลี่ยน..."
                            : "เลือก"
                          : "ไม่มีสิทธิ์"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {isSuperadmin ? (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">สร้างร้านใหม่</p>
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">สร้างร้านใหม่ (SUPERADMIN)</p>
                <p className="mt-0.5 text-xs text-slate-500">เปิดฟอร์มแบบแผ่นเลื่อนจากด้านล่างเพื่อสร้างร้านใหม่</p>
                {storeQuotaSummary ? <p className="mt-1 text-xs text-slate-500">{storeQuotaSummary}</p> : null}
              </div>
              <Button
                type="button"
                className="h-10 w-full"
                onClick={() => setIsCreateStoreSheetOpen(true)}
                disabled={loadingKey !== null || !canCreateStore}
              >
                <Plus className="h-4 w-4" />
                สร้างร้านใหม่
              </Button>
              {!canCreateStore && createStoreBlockedReason ? (
                <p className="text-sm text-red-600">{createStoreBlockedReason}</p>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      {isSuperadmin ? (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">จัดการสาขา</p>
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">จัดการสาขาของร้านปัจจุบัน</p>
              <p className="mt-0.5 text-xs text-slate-500">ร้าน: {activeStore?.storeName ?? "-"}</p>
              {branchPolicy ? <p className="mt-1 text-xs text-slate-500">โควตาสาขา: {branchPolicy.summary}</p> : null}
              <p className="mt-1 text-xs text-slate-500">การตั้งค่าโควตา (override) ปรับได้โดย SYSTEM_ADMIN เท่านั้น</p>
            </div>

            <div className="space-y-4 border-b border-slate-100 px-4 py-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">Flow แนะนำ: ข้อมูลสาขา → นโยบายแชร์ข้อมูล → สร้างสาขา</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  แนะนำให้ใช้โหมด Balanced และเลือกสาขาหลัก (MAIN) เป็นต้นทาง
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500" htmlFor="create-branch-name">
                  ชื่อสาขา
                </label>
                <input
                  id="create-branch-name"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="เช่น สาขาเวียงจันทน์"
                  disabled={loadingKey !== null}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="create-branch-code">
                    รหัสสาขา
                  </label>
                  <input
                    id="create-branch-code"
                    value={branchCode}
                    onChange={(event) => setBranchCode(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="ไม่บังคับ"
                    disabled={loadingKey !== null}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500" htmlFor="create-branch-address">
                    ที่อยู่สาขา
                  </label>
                  <input
                    id="create-branch-address"
                    value={branchAddress}
                    onChange={(event) => setBranchAddress(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="ไม่บังคับ"
                    disabled={loadingKey !== null}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500" htmlFor="create-branch-source">
                  สาขาต้นทางสำหรับคัดลอกการตั้งค่า
                </label>
                <div className="relative">
                  <ArrowRightLeft className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="create-branch-source"
                    value={branchSharingMode === "INDEPENDENT" ? "" : branchSourceBranchId}
                    onChange={(event) => setBranchSourceBranchId(event.target.value)}
                    disabled={loadingKey !== null || branchSharingMode === "INDEPENDENT"}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">เลือกสาขาต้นทาง</option>
                    {branchSourceOptions.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.code === "MAIN" ? " (MAIN)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500">รูปแบบการแชร์ข้อมูลจาก Main Branch</p>
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
                        onClick={() => applySharingMode(option.value)}
                        disabled={loadingKey !== null}
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {option.label}
                          {option.recommended ? (
                            <span className="ml-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              แนะนำ
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">ปรับรายการข้อมูลที่แชร์</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="inline-flex items-center gap-1 text-xs font-medium text-blue-800">
                  <Link2 className="h-3.5 w-3.5" />
                  สรุปนโยบายแชร์
                </p>
                <p className="mt-1 text-xs text-blue-800">{branchSharingSummary}</p>
              </div>

              <Button
                className="h-10 w-full"
                onClick={createBranch}
                disabled={
                  loadingKey !== null ||
                  !branchPolicy?.isStoreOwner ||
                  !branchPolicy?.effectiveCanCreateBranches ||
                  (branchSharingMode !== "INDEPENDENT" && !branchSourceBranchId)
                }
              >
                {loadingKey === "create-branch" ? "กำลังสร้างสาขา..." : "สร้างสาขาใหม่"}
              </Button>
              {branchPolicy && !branchPolicy.effectiveCanCreateBranches ? (
                <p className="text-sm text-red-600">บัญชีนี้ยังไม่ได้รับสิทธิ์สร้างสาขา</p>
              ) : null}
            </div>

            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">รายการสาขา</p>
              {loadingKey === "load-branches" ? (
                <p className="text-sm text-slate-500">กำลังโหลดข้อมูลสาขา...</p>
              ) : branches.length === 0 ? (
                <p className="text-sm text-slate-500">ยังไม่มีข้อมูลสาขา</p>
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
                                MAIN
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            รหัส: {branch.code ?? "-"} · ที่อยู่: {branch.address ?? "-"}
                          </p>
                          {branch.sharingMode !== "MAIN" ? (
                            <>
                              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <Boxes className="h-3.5 w-3.5" />
                                โหมดแชร์: {branch.sharingMode}
                              </p>
                              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <Warehouse className="h-3.5 w-3.5" />
                                ต้นทาง: {branch.sourceBranchName ?? "-"}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {describeSharingConfig(branch.sharingConfig)}
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

      <div
        className={`fixed inset-0 z-50 ${isCreateStoreSheetOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isCreateStoreSheetOpen}
      >
        <button
          type="button"
          aria-label="ปิดหน้าต่างสร้างร้านใหม่"
          className={`absolute inset-0 bg-slate-900/45 backdrop-blur-[1px] transition-opacity duration-200 ${
            isCreateStoreSheetOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ opacity: createStoreSheetBackdropOpacity }}
          onClick={closeCreateStoreSheet}
          disabled={loadingKey === "create-store"}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            isCreateStoreSheetDragging && !isDesktopViewport
              ? "transition-none"
              : "transition-all duration-300 ease-out"
          } ${
            isCreateStoreSheetOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
          style={createStoreSheetInlineStyle}
        >
          <div
            className="flex touch-none justify-center pt-2 sm:hidden"
            onTouchStart={handleCreateStoreSheetTouchStart}
            onTouchMove={handleCreateStoreSheetTouchMove}
            onTouchEnd={handleCreateStoreSheetTouchEnd}
            onTouchCancel={handleCreateStoreSheetTouchEnd}
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">สร้างร้านใหม่</p>
              <p className="mt-0.5 text-xs text-slate-500">กรอกข้อมูลร้านแล้วกดยืนยันการสร้าง</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeCreateStoreSheet}
              disabled={loadingKey === "create-store"}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[82dvh] space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">ประเภทร้าน</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="ประเภทร้าน">
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
                ชื่อร้าน
              </label>
              <input
                id="create-store-name"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
                placeholder="เช่น ร้านสาขา 2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-province">
                Province
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
                <option value="">เลือก Province</option>
                {laosProvinces.map((province) => (
                  <option key={province.id} value={province.id}>
                    {province.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-district">
                District
              </label>
              <select
                id="create-store-district"
                value={districtId ?? ""}
                onChange={(event) => setDistrictId(Number(event.target.value) || null)}
                disabled={!provinceId || loadingKey !== null || !canCreateStore}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">เลือก District</option>
                {districtOptions.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-village">
                Village
              </label>
              <input
                id="create-store-village"
                value={village}
                onChange={(event) => setVillage(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
                placeholder="เช่น Ban Phonxay"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="create-store-phone">
                เบอร์โทรร้าน
              </label>
              <input
                id="create-store-phone"
                value={storePhoneNumber}
                onChange={(event) => setStorePhoneNumber(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={loadingKey !== null || !canCreateStore}
                placeholder="เช่น +856 20 9999 9999"
              />
            </div>

            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              ค่าเริ่มต้นหลังสร้างร้าน: สกุลเงิน LAK และปิด VAT (7.00%) ปรับได้ภายหลังที่หน้าข้อมูลร้าน
            </p>

            <Button className="h-10 w-full" onClick={createStore} disabled={loadingKey !== null || !canCreateStore}>
              {loadingKey === "create-store" ? "กำลังสร้างร้าน..." : "ยืนยันสร้างร้าน"}
            </Button>
          </div>
        </div>
      </div>

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
