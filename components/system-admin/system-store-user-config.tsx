"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";
import { translateSystemAdminApiMessage } from "@/lib/system-admin/i18n";

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
  language: AppLanguage;
  stores: StoreConfigItem[];
  users: UserConfigItem[];
};

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

export function SystemStoreUserConfig({
  language,
  stores,
  users,
}: SystemStoreUserConfigProps) {
  const router = useRouter();
  const t = useMemo(() => createTranslator(language), [language]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const storeTypeOptions = useMemo(
    () => [
      { value: "ONLINE_RETAIL", label: t("stores.type.online") },
      { value: "RESTAURANT", label: t("stores.type.restaurant") },
      { value: "CAFE", label: t("stores.type.cafe") },
      { value: "OTHER", label: t("stores.type.other") },
    ],
    [t],
  );
  const systemRoleOptions = useMemo(
    () => [
      { value: "USER", label: t("systemAdmin.storeUsers.role.user") },
      { value: "SUPERADMIN", label: t("systemAdmin.storeUsers.role.superadmin") },
      { value: "SYSTEM_ADMIN", label: t("systemAdmin.storeUsers.role.systemAdmin") },
    ],
    [t],
  );

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
      handleError(t("systemAdmin.storeUsers.validation.storeVat"));
      return;
    }

    if (!draft.currency.trim()) {
      handleError(t("systemAdmin.storeUsers.validation.storeCurrency"));
      return;
    }

    const maxBranchesOverride = parseOptionalInt(draft.maxBranchesOverride, {
      min: 0,
      max: 500,
    });
    if (Number.isNaN(maxBranchesOverride)) {
      handleError(t("systemAdmin.storeUsers.validation.storeBranchOverride"));
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
      handleError(
        translateSystemAdminApiMessage({
          message: data?.message,
          t,
          fallbackKey: "systemAdmin.storeUsers.storeSaveFailed",
          overrides: {
            "ไม่มีข้อมูลสำหรับอัปเดต": "systemAdmin.storeUsers.storeInvalidPayload",
            "ข้อมูลตั้งค่าร้านไม่ถูกต้อง": "systemAdmin.storeUsers.storeInvalidPayload",
            "ไม่พบร้านค้า": "systemAdmin.storeUsers.storeNotFound",
          },
        }),
      );
      setLoadingKey(null);
      return;
    }

    handleSuccess(t("systemAdmin.storeUsers.storeSaveSuccess"));
    setLoadingKey(null);
    router.refresh();
  };

  const saveUserConfig = async (userId: string) => {
    const draft = userDrafts[userId];
    if (!draft) {
      return;
    }

    if (!draft.name.trim()) {
      handleError(t("systemAdmin.storeUsers.validation.userName"));
      return;
    }

    const sessionLimit = parseOptionalInt(draft.sessionLimit, { min: 1, max: 10 });
    if (Number.isNaN(sessionLimit)) {
      handleError(t("systemAdmin.storeUsers.validation.userSessionLimit"));
      return;
    }

    const isSuperadmin = draft.systemRole === "SUPERADMIN";

    const maxStores = parseOptionalInt(draft.maxStores, { min: 1, max: 100 });
    if (Number.isNaN(maxStores)) {
      handleError(t("systemAdmin.storeUsers.validation.userMaxStores"));
      return;
    }

    const maxBranchesPerStore = parseOptionalInt(draft.maxBranchesPerStore, {
      min: 0,
      max: 500,
    });
    if (Number.isNaN(maxBranchesPerStore)) {
      handleError(t("systemAdmin.storeUsers.validation.userMaxBranches"));
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
      handleError(
        translateSystemAdminApiMessage({
          message: data?.message,
          t,
          fallbackKey: "systemAdmin.storeUsers.userSaveFailed",
          overrides: {
            "ไม่มีข้อมูลสำหรับอัปเดต": "systemAdmin.storeUsers.userInvalidPayload",
            "ข้อมูลผู้ใช้ไม่ถูกต้อง": "systemAdmin.storeUsers.userInvalidPayload",
            "ไม่พบบัญชีผู้ใช้": "systemAdmin.storeUsers.userNotFound",
            "ไม่สามารถลดสิทธิ์ SYSTEM_ADMIN ของบัญชีตัวเองได้":
              "systemAdmin.storeUsers.userCannotDemoteSelf",
          },
        }),
      );
      setLoadingKey(null);
      return;
    }

    handleSuccess(t("systemAdmin.storeUsers.userSaveSuccess"));
    setLoadingKey(null);
    router.refresh();
  };

  return (
    <section className="space-y-5">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{t("systemAdmin.storeUsers.storesTitle")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("systemAdmin.storeUsers.storesDescription")}
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
                <p className="text-xs text-muted-foreground">
                  {t("systemAdmin.storeUsers.storeId", { id: store.id })}
                </p>

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
                    placeholder={t("systemAdmin.storeUsers.storeNamePlaceholder")}
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
                    placeholder={t("systemAdmin.storeUsers.storeCurrencyPlaceholder")}
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
                    placeholder={t("systemAdmin.storeUsers.storeVatPlaceholder")}
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
                    placeholder={t("systemAdmin.storeUsers.storeBranchOverridePlaceholder")}
                    disabled={loadingKey !== null}
                  />

                  <label className="flex h-9 items-center justify-between rounded-md border px-3 text-sm">
                    <span>{t("systemAdmin.storeUsers.storeVatEnabled")}</span>
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
                  {loadingKey === `store-${store.id}`
                    ? t("systemAdmin.storeUsers.saving")
                    : t("systemAdmin.storeUsers.saveStore")}
                </Button>
              </div>
            );
          })}

          {stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("systemAdmin.storeUsers.emptyStores")}</p>
          ) : null}
        </div>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{t("systemAdmin.storeUsers.usersTitle")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("systemAdmin.storeUsers.usersDescription")}
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
                <p className="text-xs text-muted-foreground">
                  {t("systemAdmin.storeUsers.userId", { id: user.id })}
                </p>

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
                    placeholder={t("systemAdmin.storeUsers.userNamePlaceholder")}
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
                    <span>{t("systemAdmin.storeUsers.userCanCreateStores")}</span>
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
                    placeholder={t("systemAdmin.storeUsers.userMaxStoresPlaceholder")}
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
                    <option value="GLOBAL">{t("systemAdmin.storeUsers.branchMode.global")}</option>
                    <option value="ALLOW">{t("systemAdmin.storeUsers.branchMode.allow")}</option>
                    <option value="BLOCK">{t("systemAdmin.storeUsers.branchMode.block")}</option>
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
                    placeholder={t("systemAdmin.storeUsers.userMaxBranchesPlaceholder")}
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
                    placeholder={t("systemAdmin.storeUsers.userSessionLimitPlaceholder")}
                    disabled={loadingKey !== null}
                  />
                </div>

                <Button
                  variant="outline"
                  className="mt-3 h-9"
                  onClick={() => saveUserConfig(user.id)}
                  disabled={loadingKey !== null}
                >
                  {loadingKey === `user-${user.id}`
                    ? t("systemAdmin.storeUsers.saving")
                    : t("systemAdmin.storeUsers.saveUser")}
                </Button>
              </div>
            );
          })}

          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("systemAdmin.storeUsers.emptyUsers")}</p>
          ) : null}
        </div>
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
