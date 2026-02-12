"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authFetch, setClientAuthToken } from "@/lib/auth/client-token";

type StoreMembershipItem = {
  storeId: string;
  storeName: string;
  roleName: string;
};

type StoresManagementProps = {
  memberships: StoreMembershipItem[];
  activeStoreId: string;
  isSuperadmin: boolean;
  canCreateStore: boolean;
  createStoreBlockedReason: string | null;
  storeQuotaSummary: string | null;
};

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

  const [storeName, setStoreName] = useState("");
  const [currency, setCurrency] = useState<"LAK" | "THB" | "USD">("LAK");
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatRatePercent, setVatRatePercent] = useState("7.00");

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
        storeType: "ONLINE_RETAIL",
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
                <p className="text-sm font-medium">{membership.storeName}</p>
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

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
