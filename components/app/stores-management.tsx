"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authFetch, setClientAuthToken } from "@/lib/auth/client-token";

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
  createdAt: string;
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
  isSuperadmin: boolean;
  canCreateStore: boolean;
  createStoreBlockedReason: string | null;
  storeQuotaSummary: string | null;
};

const storeTypeOptions = [
  { value: "ONLINE_RETAIL", label: "Online POS" },
  { value: "RESTAURANT", label: "Restaurant POS" },
  { value: "CAFE", label: "Cafe POS" },
  { value: "OTHER", label: "Other POS" },
] as const;

export function StoresManagement({
  memberships,
  activeStoreId,
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
  const [currency, setCurrency] = useState<"LAK" | "THB" | "USD">("LAK");
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatRatePercent, setVatRatePercent] = useState("7.00");

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchPolicy, setBranchPolicy] = useState<BranchPolicySummary | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchAddress, setBranchAddress] = useState("");

  const activeStore = useMemo(
    () => memberships.find((item) => item.storeId === activeStoreId) ?? null,
    [activeStoreId, memberships],
  );

  const toBasisPoints = (text: string) => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(10000, Math.round(parsed * 100)));
  };

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
        currency,
        vatEnabled,
        vatRate: toBasisPoints(vatRatePercent),
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
    if (!isSuperadmin) {
      return;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId, isSuperadmin]);

  const createBranch = async () => {
    if (!branchName.trim()) {
      setErrorMessage("กรุณากรอกชื่อสาขา");
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
    setSuccessMessage("สร้างสาขาเรียบร้อยแล้ว");
    setLoadingKey(null);
  };

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold">เลือกร้านที่ต้องการใช้งาน</h2>
          <p className="text-xs text-muted-foreground">
            บัญชีนี้มีสิทธิ์เข้าใช้งาน {memberships.length.toLocaleString("th-TH")} ร้าน
          </p>
        </div>

        <div className="space-y-2">
          {memberships.map((membership) => {
            const isActive = membership.storeId === activeStoreId;
            return (
              <div
                key={membership.storeId}
                className={`rounded-lg border p-3 ${
                  isActive ? "border-blue-300 bg-blue-50/50" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{membership.storeName}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {membership.storeType}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">บทบาท: {membership.roleName}</p>

                <div className="mt-2">
                  {isActive ? (
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
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
                      {loadingKey === `switch-${membership.storeId}`
                        ? "กำลังเปลี่ยน..."
                        : "สลับไปร้านนี้"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {activeStore ? (
          <p className="text-xs text-muted-foreground">
            ร้านปัจจุบัน: {activeStore.storeName} ({activeStore.roleName})
          </p>
        ) : null}
      </article>

      {isSuperadmin ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold">สร้างร้านใหม่ (SUPERADMIN)</h2>
            <p className="text-xs text-muted-foreground">
              ใช้สำหรับเพิ่มร้านใหม่ภายใต้ client เดียวกัน
            </p>
            {storeQuotaSummary ? (
              <p className="mt-1 text-xs text-muted-foreground">{storeQuotaSummary}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="create-store-type">
              ประเภทร้าน
            </label>
            <select
              id="create-store-type"
              value={storeType}
              onChange={(event) =>
                setStoreType(event.target.value as (typeof storeTypeOptions)[number]["value"])
              }
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loadingKey !== null || !canCreateStore}
            >
              {storeTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="create-store-name">
              ชื่อร้าน
            </label>
            <input
              id="create-store-name"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loadingKey !== null || !canCreateStore}
              placeholder="เช่น ร้านสาขา 2"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="create-store-currency">
                สกุลเงิน
              </label>
              <select
                id="create-store-currency"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as "LAK" | "THB" | "USD")
                }
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loadingKey !== null || !canCreateStore}
              >
                <option value="LAK">LAK</option>
                <option value="THB">THB</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="create-store-vat-rate">
                VAT (%)
              </label>
              <input
                id="create-store-vat-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={vatRatePercent}
                onChange={(event) => setVatRatePercent(event.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loadingKey !== null || !canCreateStore || !vatEnabled}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <span>เปิดใช้งาน VAT</span>
            <input
              type="checkbox"
              checked={vatEnabled}
              onChange={(event) => setVatEnabled(event.target.checked)}
              disabled={loadingKey !== null || !canCreateStore}
            />
          </label>

          {!canCreateStore && createStoreBlockedReason ? (
            <p className="text-xs text-red-600">{createStoreBlockedReason}</p>
          ) : null}

          <Button
            className="h-10 w-full"
            onClick={createStore}
            disabled={loadingKey !== null || !canCreateStore}
          >
            {loadingKey === "create-store" ? "กำลังสร้างร้าน..." : "สร้างร้านใหม่"}
          </Button>
        </article>
      ) : null}

      {isSuperadmin ? (
        <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold">จัดการสาขาของร้านปัจจุบัน</h2>
            <p className="text-xs text-muted-foreground">
              ร้าน: {activeStore?.storeName ?? "-"}
            </p>
            {branchPolicy ? (
              <p className="mt-1 text-xs text-muted-foreground">
                โควตาสาขา: {branchPolicy.summary}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              การตั้งค่าโควตา (override) ปรับได้โดย SYSTEM_ADMIN เท่านั้น
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              placeholder="ชื่อสาขา เช่น สาขาเวียงจันทน์"
              disabled={loadingKey !== null}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={branchCode}
                onChange={(event) => setBranchCode(event.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                placeholder="รหัสสาขา (ไม่บังคับ)"
                disabled={loadingKey !== null}
              />
              <input
                value={branchAddress}
                onChange={(event) => setBranchAddress(event.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                placeholder="ที่อยู่สาขา (ไม่บังคับ)"
                disabled={loadingKey !== null}
              />
            </div>
            <Button
              className="h-10 w-full"
              onClick={createBranch}
              disabled={
                loadingKey !== null ||
                !branchPolicy?.isStoreOwner ||
                !branchPolicy?.effectiveCanCreateBranches
              }
            >
              {loadingKey === "create-branch" ? "กำลังสร้างสาขา..." : "สร้างสาขาใหม่"}
            </Button>
            {branchPolicy && !branchPolicy.effectiveCanCreateBranches ? (
              <p className="text-xs text-red-600">บัญชีนี้ยังไม่ได้รับสิทธิ์สร้างสาขา</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">รายการสาขา</p>
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลสาขา</p>
            ) : (
              branches.map((branch) => (
                <div key={branch.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{branch.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    รหัส: {branch.code ?? "-"} | ที่อยู่: {branch.address ?? "-"}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      ) : null}

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
