"use client";

import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import {
  currencyLabel,
  storeCurrencyValues,
  storeVatModeValues,
  vatModeLabel,
  type StoreCurrency,
  type StoreVatMode,
} from "@/lib/finance/store-financial";

type StoreFinancialSettingsProps = {
  initialCurrency: StoreCurrency;
  initialSupportedCurrencies: StoreCurrency[];
  initialVatEnabled: boolean;
  initialVatRate: number;
  initialVatMode: StoreVatMode;
  canUpdate: boolean;
};

type UpdateStoreResponse = {
  ok?: boolean;
  message?: string;
  store?: {
    currency?: StoreCurrency;
    supportedCurrencies?: StoreCurrency[];
    vatEnabled?: boolean;
    vatRate?: number;
    vatMode?: StoreVatMode;
  };
};

const normalizeRateToBasisPoints = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.round(value * 100);
  if (rounded < 0) {
    return 0;
  }

  if (rounded > 10000) {
    return 10000;
  }

  return rounded;
};

const toPercentText = (basisPoints: number) => (basisPoints / 100).toFixed(2);

export function StoreFinancialSettings({
  initialCurrency,
  initialSupportedCurrencies,
  initialVatEnabled,
  initialVatRate,
  initialVatMode,
  canUpdate,
}: StoreFinancialSettingsProps) {
  const [currency, setCurrency] = useState<StoreCurrency>(initialCurrency);
  const [supportedCurrencies, setSupportedCurrencies] =
    useState<StoreCurrency[]>(initialSupportedCurrencies);
  const [vatEnabled, setVatEnabled] = useState(initialVatEnabled);
  const [vatRateText, setVatRateText] = useState(toPercentText(initialVatRate));
  const [vatMode, setVatMode] = useState<StoreVatMode>(initialVatMode);

  const [savedCurrency, setSavedCurrency] = useState(initialCurrency);
  const [savedSupportedCurrencies, setSavedSupportedCurrencies] =
    useState(initialSupportedCurrencies);
  const [savedVatEnabled, setSavedVatEnabled] = useState(initialVatEnabled);
  const [savedVatRate, setSavedVatRate] = useState(initialVatRate);
  const [savedVatMode, setSavedVatMode] = useState(initialVatMode);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const normalizedSupported = useMemo(() => {
    const dedupe = new Set<StoreCurrency>(supportedCurrencies);
    dedupe.add(currency);
    return storeCurrencyValues.filter((item) => dedupe.has(item));
  }, [currency, supportedCurrencies]);

  const parsedVatRate = useMemo(() => {
    const asNumber = Number(vatRateText);
    if (!Number.isFinite(asNumber)) {
      return null;
    }

    return normalizeRateToBasisPoints(asNumber);
  }, [vatRateText]);

  const isDirty =
    currency !== savedCurrency ||
    normalizedSupported.join("|") !== savedSupportedCurrencies.join("|") ||
    vatEnabled !== savedVatEnabled ||
    (parsedVatRate ?? -1) !== savedVatRate ||
    vatMode !== savedVatMode;

  const toggleSupportedCurrency = (target: StoreCurrency) => {
    if (target === currency) {
      return;
    }

    setSupportedCurrencies((current) => {
      if (current.includes(target)) {
        return current.filter((item) => item !== target);
      }

      return [...current, target];
    });
  };

  const onChangeBaseCurrency = (value: StoreCurrency) => {
    setCurrency(value);
    setSupportedCurrencies((current) => {
      if (current.includes(value)) {
        return current;
      }
      return [...current, value];
    });
  };

  const saveFinancialSettings = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!canUpdate) {
      setErrorMessage("บัญชีนี้ไม่มีสิทธิ์อัปเดตค่าการเงินร้าน");
      return;
    }

    if (parsedVatRate === null) {
      setErrorMessage("กรุณากรอกอัตรา VAT ให้ถูกต้อง");
      return;
    }

    setIsSaving(true);

    try {
      const response = await authFetch("/api/settings/store", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currency,
          supportedCurrencies: normalizedSupported,
          vatEnabled,
          vatRate: parsedVatRate,
          vatMode,
        }),
      });

      const data = (await response.json().catch(() => null)) as UpdateStoreResponse | null;
      if (!response.ok) {
        setErrorMessage(data?.message ?? "บันทึกค่าการเงินร้านไม่สำเร็จ");
        return;
      }

      const nextCurrency = data?.store?.currency ?? currency;
      const nextSupported = data?.store?.supportedCurrencies ?? normalizedSupported;
      const nextVatEnabled = data?.store?.vatEnabled ?? vatEnabled;
      const nextVatRate = data?.store?.vatRate ?? parsedVatRate;
      const nextVatMode = data?.store?.vatMode ?? vatMode;

      setCurrency(nextCurrency);
      setSupportedCurrencies(nextSupported);
      setVatEnabled(nextVatEnabled);
      setVatRateText(toPercentText(nextVatRate));
      setVatMode(nextVatMode);

      setSavedCurrency(nextCurrency);
      setSavedSupportedCurrencies(nextSupported);
      setSavedVatEnabled(nextVatEnabled);
      setSavedVatRate(nextVatRate);
      setSavedVatMode(nextVatMode);

      setSuccessMessage("บันทึกค่าการเงินร้านเรียบร้อยแล้ว");
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  return (
    <section className="space-y-4">
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Currency & VAT Policy</p>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              isDirty
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {isDirty ? <CircleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {isDirty ? "ยังไม่บันทึก" : "บันทึกแล้ว"}
          </span>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="store-base-currency">
              Base Currency ของร้าน
            </label>
            <select
              id="store-base-currency"
              value={currency}
              className={fieldClassName}
              disabled={!canUpdate || isSaving}
              onChange={(event) => onChangeBaseCurrency(event.target.value as StoreCurrency)}
            >
              {storeCurrencyValues.map((item) => (
                <option key={item} value={item}>
                  {currencyLabel(item)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              ยอดขาย รายงาน และ VAT จะคำนวณบนสกุลนี้เสมอ
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">สกุลที่ร้านรองรับตอนรับชำระ</p>
            <div className="grid grid-cols-3 gap-2">
              {storeCurrencyValues.map((item) => {
                const checked = normalizedSupported.includes(item);
                const isBase = item === currency;

                return (
                  <label
                    key={item}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                      checked ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <span>{currencyLabel(item)}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canUpdate || isSaving || isBase}
                      onChange={() => toggleSupportedCurrency(item)}
                    />
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">Base currency ต้องถูกเปิดไว้เสมอ</p>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={vatEnabled}
                disabled={!canUpdate || isSaving}
                onChange={(event) => setVatEnabled(event.target.checked)}
              />
              เปิดใช้งาน VAT ในใบขาย
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="store-vat-rate">
                อัตรา VAT (%)
              </label>
              <input
                id="store-vat-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={vatRateText}
                disabled={!canUpdate || isSaving}
                onChange={(event) => setVatRateText(event.target.value)}
                className={fieldClassName}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="store-vat-mode">
                โหมด VAT
              </label>
              <select
                id="store-vat-mode"
                value={vatMode}
                disabled={!canUpdate || isSaving}
                onChange={(event) => setVatMode(event.target.value as StoreVatMode)}
                className={fieldClassName}
              >
                {storeVatModeValues.map((item) => (
                  <option key={item} value={item}>
                    {vatModeLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
          {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}

          <div className="flex justify-end">
            <Button
              type="button"
              className="h-11 min-w-[220px] rounded-xl"
              disabled={!canUpdate || isSaving || !isDirty}
              onClick={saveFinancialSettings}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                "บันทึกการตั้งค่าการเงิน"
              )}
            </Button>
          </div>
        </div>
      </article>
    </section>
  );
}
