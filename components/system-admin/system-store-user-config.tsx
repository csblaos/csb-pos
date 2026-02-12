"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type StoreConfigItem = {
  id: string;
  name: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
  currency: string;
  vatEnabled: boolean;
  vatRate: number;
  maxBranchesOverride: number | null;
  createdAt: string;
};

type UserConfigItem = {
  id: string;
  email: string;
  name: string;
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
  canCreateStores: boolean | null;
  maxStores: number | null;
  canCreateBranches: boolean | null;
  maxBranchesPerStore: number | null;
  sessionLimit: number | null;
  createdAt: string;
};

type StoreDraft = {
  name: string;
  storeType: "ONLINE_RETAIL" | "RESTAURANT" | "CAFE" | "OTHER";
  currency: string;
  vatEnabled: boolean;
  vatRatePercent: string;
  maxBranchesOverride: string;
};

type BranchMode = "GLOBAL" | "ALLOW" | "BLOCK";

type UserDraft = {
  name: string;
  systemRole: "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";
  canCreateStores: boolean;
  maxStores: string;
  branchMode: BranchMode;
  maxBranchesPerStore: string;
  sessionLimit: string;
};

type SystemStoreUserConfigProps = {
  stores: StoreConfigItem[];
  users: UserConfigItem[];
};

const storeTypeOptions = [
  { value: "ONLINE_RETAIL", label: "Online POS" },
  { value: "RESTAURANT", label: "Restaurant POS" },
  { value: "CAFE", label: "Cafe POS" },
  { value: "OTHER", label: "Other POS" },
] as const;

const systemRoleOptions = [
  { value: "USER", label: "USER" },
  { value: "SUPERADMIN", label: "SUPERADMIN" },
  { value: "SYSTEM_ADMIN", label: "SYSTEM_ADMIN" },
] as const;

const toVatPercentText = (basisPoints: number) => (basisPoints / 100).toFixed(2);

const toVatBasisPoints = (percentText: string) => {
  const parsed = Number(percentText);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return Math.max(0, Math.min(10000, Math.round(parsed * 100)));
};

const parseOptionalInt = (rawValue: string, options: { min: number; max: number }) => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
    return Number.NaN;
  }

  return parsed;
};

const toBranchMode = (value: boolean | null): BranchMode => {
  if (value === true) {
    return "ALLOW";
  }
  if (value === false) {
    return "BLOCK";
  }
  return "GLOBAL";
};

export function SystemStoreUserConfig({ stores, users }: SystemStoreUserConfigProps) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [storeDrafts, setStoreDrafts] = useState<Record<string, StoreDraft>>(() =>
    Object.fromEntries(
      stores.map((store) => [
        store.id,
        {
          name: store.name,
          storeType: store.storeType,
          currency: store.currency,
          vatEnabled: store.vatEnabled,
          vatRatePercent: toVatPercentText(store.vatRate),
          maxBranchesOverride:
            typeof store.maxBranchesOverride === "number"
              ? String(store.maxBranchesOverride)
              : "",
        },
      ]),
    ),
  );

  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>(() =>
    Object.fromEntries(
      users.map((user) => [
        user.id,
        {
          name: user.name,
          systemRole: user.systemRole,
          canCreateStores: user.canCreateStores === true,
          maxStores: typeof user.maxStores === "number" ? String(user.maxStores) : "",
          branchMode: toBranchMode(user.canCreateBranches),
          maxBranchesPerStore:
            typeof user.maxBranchesPerStore === "number"
              ? String(user.maxBranchesPerStore)
              : "",
          sessionLimit:
            typeof user.sessionLimit === "number" ? String(user.sessionLimit) : "",
        },
      ]),
    ),
  );

  const handleError = (message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
  };

  const handleSuccess = (message: string) => {
    setErrorMessage(null);
    setSuccessMessage(message);
  };

  const saveStoreConfig = async (storeId: string) => {
    const draft = storeDrafts[storeId];
    if (!draft) {
      return;
    }

    const vatRate = toVatBasisPoints(draft.vatRatePercent);
    if (Number.isNaN(vatRate)) {
      handleError("อัตรา VAT ของร้านต้องเป็นตัวเลขที่ถูกต้อง");
      return;
    }

    if (!draft.currency.trim()) {
      handleError("กรุณาระบุสกุลเงินของร้าน");
      return;
    }

    const maxBranchesOverride = parseOptionalInt(draft.maxBranchesOverride, {
      min: 0,
      max: 500,
    });
    if (Number.isNaN(maxBranchesOverride)) {
      handleError("โควตาสาขา override ต้องเป็นตัวเลข 0-500 หรือเว้นว่าง");
      return;
    }

    setLoadingKey(`store-${storeId}`);
    setErrorMessage(null);

    const response = await authFetch(`/api/system-admin/config/stores/${storeId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: draft.name.trim(),
        storeType: draft.storeType,
        currency: draft.currency.trim().toUpperCase(),
        vatEnabled: draft.vatEnabled,
        vatRate,
        maxBranchesOverride,
      }),
    });

    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      handleError(data?.message ?? "บันทึกค่าร้านไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    handleSuccess("บันทึกค่าร้านเรียบร้อยแล้ว");
    setLoadingKey(null);
    router.refresh();
  };

  const saveUserConfig = async (userId: string) => {
    const draft = userDrafts[userId];
    if (!draft) {
      return;
    }

    if (!draft.name.trim()) {
      handleError("ชื่อผู้ใช้ต้องไม่ว่าง");
      return;
    }

    const sessionLimit = parseOptionalInt(draft.sessionLimit, { min: 1, max: 10 });
    if (Number.isNaN(sessionLimit)) {
      handleError("Session limit ต้องเป็นตัวเลข 1-10 หรือเว้นว่าง");
      return;
    }

    const isSuperadmin = draft.systemRole === "SUPERADMIN";

    const maxStores = parseOptionalInt(draft.maxStores, { min: 1, max: 100 });
    if (Number.isNaN(maxStores)) {
      handleError("โควตาร้านต้องเป็นตัวเลข 1-100 หรือเว้นว่าง");
      return;
    }

    const maxBranchesPerStore = parseOptionalInt(draft.maxBranchesPerStore, {
      min: 0,
      max: 500,
    });
    if (Number.isNaN(maxBranchesPerStore)) {
      handleError("โควตาสาขาต่อร้านต้องเป็นตัวเลข 0-500 หรือเว้นว่าง");
      return;
    }

    const canCreateBranches =
      draft.branchMode === "GLOBAL" ? null : draft.branchMode === "ALLOW";

    setLoadingKey(`user-${userId}`);
    setErrorMessage(null);

    const response = await authFetch(`/api/system-admin/config/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: draft.name.trim(),
        systemRole: draft.systemRole,
        canCreateStores: isSuperadmin ? draft.canCreateStores : null,
        maxStores: isSuperadmin && draft.canCreateStores ? maxStores : null,
        canCreateBranches: isSuperadmin ? canCreateBranches : null,
        maxBranchesPerStore:
          isSuperadmin && canCreateBranches !== false ? maxBranchesPerStore : null,
        sessionLimit,
      }),
    });

    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      handleError(data?.message ?? "บันทึกค่าผู้ใช้ไม่สำเร็จ");
      setLoadingKey(null);
      return;
    }

    handleSuccess("บันทึกค่าผู้ใช้เรียบร้อยแล้ว");
    setLoadingKey(null);
    router.refresh();
  };

  return (
    <section className="space-y-5">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Store Config (SYSTEM_ADMIN)</h2>
        <p className="text-xs text-muted-foreground">
          ตั้งค่าร้านทั้งหมด รวมถึง branch override ต่อร้าน
        </p>

        <div className="space-y-3">
          {stores.map((store) => {
            const draft = storeDrafts[store.id];
            if (!draft) {
              return null;
            }

            return (
              <div key={store.id} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{store.name}</p>
                <p className="text-xs text-muted-foreground">Store ID: {store.id}</p>

                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setStoreDrafts((previous) => ({
                        ...previous,
                        [store.id]: { ...previous[store.id], name: event.target.value },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="ชื่อร้าน"
                    disabled={loadingKey !== null}
                  />

                  <select
                    value={draft.storeType}
                    onChange={(event) =>
                      setStoreDrafts((previous) => ({
                        ...previous,
                        [store.id]: {
                          ...previous[store.id],
                          storeType: event.target.value as StoreDraft["storeType"],
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loadingKey !== null}
                  >
                    {storeTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={draft.currency}
                    onChange={(event) =>
                      setStoreDrafts((previous) => ({
                        ...previous,
                        [store.id]: {
                          ...previous[store.id],
                          currency: event.target.value.toUpperCase(),
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="สกุลเงิน เช่น LAK"
                    disabled={loadingKey !== null}
                  />

                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={draft.vatRatePercent}
                    onChange={(event) =>
                      setStoreDrafts((previous) => ({
                        ...previous,
                        [store.id]: { ...previous[store.id], vatRatePercent: event.target.value },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="VAT (%)"
                    disabled={loadingKey !== null || !draft.vatEnabled}
                  />

                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={draft.maxBranchesOverride}
                    onChange={(event) =>
                      setStoreDrafts((previous) => ({
                        ...previous,
                        [store.id]: {
                          ...previous[store.id],
                          maxBranchesOverride: event.target.value,
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="Branch Override (ว่าง = ใช้ superadmin/global)"
                    disabled={loadingKey !== null}
                  />

                  <label className="flex h-9 items-center justify-between rounded-md border px-3 text-sm">
                    <span>เปิดใช้งาน VAT</span>
                    <input
                      type="checkbox"
                      checked={draft.vatEnabled}
                      onChange={(event) =>
                        setStoreDrafts((previous) => ({
                          ...previous,
                          [store.id]: { ...previous[store.id], vatEnabled: event.target.checked },
                        }))
                      }
                      disabled={loadingKey !== null}
                    />
                  </label>
                </div>

                <Button
                  variant="outline"
                  className="mt-3 h-9"
                  onClick={() => saveStoreConfig(store.id)}
                  disabled={loadingKey !== null}
                >
                  {loadingKey === `store-${store.id}` ? "กำลังบันทึก..." : "บันทึก Store Config"}
                </Button>
              </div>
            );
          })}

          {stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีร้านในระบบ</p>
          ) : null}
        </div>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">User Config (SYSTEM_ADMIN)</h2>
        <p className="text-xs text-muted-foreground">
          ตั้งค่าผู้ใช้ทั้งหมด รวมสิทธิ์ระบบและโควตาสำหรับ SUPERADMIN
        </p>

        <div className="space-y-3">
          {users.map((user) => {
            const draft = userDrafts[user.id];
            if (!draft) {
              return null;
            }

            const isSuperadmin = draft.systemRole === "SUPERADMIN";

            return (
              <div key={user.id} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">User ID: {user.id}</p>

                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setUserDrafts((previous) => ({
                        ...previous,
                        [user.id]: { ...previous[user.id], name: event.target.value },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="ชื่อผู้ใช้"
                    disabled={loadingKey !== null}
                  />

                  <select
                    value={draft.systemRole}
                    onChange={(event) =>
                      setUserDrafts((previous) => ({
                        ...previous,
                        [user.id]: {
                          ...previous[user.id],
                          systemRole: event.target.value as UserDraft["systemRole"],
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loadingKey !== null}
                  >
                    {systemRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <label className="flex h-9 items-center justify-between rounded-md border px-3 text-sm">
                    <span>อนุญาตสร้างร้าน</span>
                    <input
                      type="checkbox"
                      checked={draft.canCreateStores}
                      onChange={(event) =>
                        setUserDrafts((previous) => ({
                          ...previous,
                          [user.id]: {
                            ...previous[user.id],
                            canCreateStores: event.target.checked,
                          },
                        }))
                      }
                      disabled={loadingKey !== null || !isSuperadmin}
                    />
                  </label>

                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.maxStores}
                    onChange={(event) =>
                      setUserDrafts((previous) => ({
                        ...previous,
                        [user.id]: { ...previous[user.id], maxStores: event.target.value },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="โควตาร้าน (ว่าง = ไม่จำกัด)"
                    disabled={loadingKey !== null || !isSuperadmin || !draft.canCreateStores}
                  />

                  <select
                    value={draft.branchMode}
                    onChange={(event) =>
                      setUserDrafts((previous) => ({
                        ...previous,
                        [user.id]: {
                          ...previous[user.id],
                          branchMode: event.target.value as BranchMode,
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    disabled={loadingKey !== null || !isSuperadmin}
                  >
                    <option value="GLOBAL">ใช้ค่า Global</option>
                    <option value="ALLOW">อนุญาตสร้างสาขา</option>
                    <option value="BLOCK">ไม่อนุญาตสร้างสาขา</option>
                  </select>

                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={draft.maxBranchesPerStore}
                    onChange={(event) =>
                      setUserDrafts((previous) => ({
                        ...previous,
                        [user.id]: {
                          ...previous[user.id],
                          maxBranchesPerStore: event.target.value,
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="โควตาสาขาต่อร้าน (ว่าง = ไม่จำกัด)"
                    disabled={
                      loadingKey !== null ||
                      !isSuperadmin ||
                      draft.branchMode === "BLOCK"
                    }
                  />

                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={draft.sessionLimit}
                    onChange={(event) =>
                      setUserDrafts((previous) => ({
                        ...previous,
                        [user.id]: {
                          ...previous[user.id],
                          sessionLimit: event.target.value,
                        },
                      }))
                    }
                    className="h-9 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                    placeholder="Session Limit (1-10, ว่าง = ใช้ค่า ENV)"
                    disabled={loadingKey !== null}
                  />
                </div>

                <Button
                  variant="outline"
                  className="mt-3 h-9"
                  onClick={() => saveUserConfig(user.id)}
                  disabled={loadingKey !== null}
                >
                  {loadingKey === `user-${user.id}` ? "กำลังบันทึก..." : "บันทึก User Config"}
                </Button>
              </div>
            );
          })}

          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีผู้ใช้ในระบบ</p>
          ) : null}
        </div>
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
