"use client";

import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type StoreInventorySettingsProps = {
  initialOutStockThreshold: number;
  initialLowStockThreshold: number;
  canUpdate: boolean;
};

type UpdateStoreResponse = {
  ok?: boolean;
  message?: string;
  store?: {
    outStockThreshold?: number;
    lowStockThreshold?: number;
  };
};

const toInt = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

export function StoreInventorySettings({
  initialOutStockThreshold,
  initialLowStockThreshold,
  canUpdate,
}: StoreInventorySettingsProps) {
  const [outStockText, setOutStockText] = useState(`${initialOutStockThreshold}`);
  const [lowStockText, setLowStockText] = useState(`${initialLowStockThreshold}`);

  const [savedOutStock, setSavedOutStock] = useState(initialOutStockThreshold);
  const [savedLowStock, setSavedLowStock] = useState(initialLowStockThreshold);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const parsedOut = useMemo(() => toInt(outStockText), [outStockText]);
  const parsedLow = useMemo(() => toInt(lowStockText), [lowStockText]);

  const validationError = useMemo(() => {
    if (parsedOut === null) {
      return "กรุณากรอกค่าสต็อกหมดเป็นจำนวนเต็มที่ไม่ติดลบ";
    }
    if (parsedLow === null) {
      return "กรุณากรอกค่าสต็อกต่ำเป็นจำนวนเต็มที่ไม่ติดลบ";
    }
    if (parsedLow < parsedOut) {
      return "ค่าสต็อกต่ำต้องมากกว่าหรือเท่ากับค่าสต็อกหมด";
    }
    return null;
  }, [parsedLow, parsedOut]);

  const isDirty =
    parsedOut !== null &&
    parsedLow !== null &&
    (parsedOut !== savedOutStock || parsedLow !== savedLowStock);

  const saveInventorySettings = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!canUpdate) {
      setErrorMessage("บัญชีนี้ไม่มีสิทธิ์อัปเดตค่าคลังสินค้า");
      return;
    }

    if (validationError || parsedOut === null || parsedLow === null) {
      setErrorMessage(validationError ?? "ข้อมูลไม่ถูกต้อง");
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
          outStockThreshold: parsedOut,
          lowStockThreshold: parsedLow,
        }),
      });

      const data = (await response.json().catch(() => null)) as UpdateStoreResponse | null;
      if (!response.ok) {
        setErrorMessage(data?.message ?? "บันทึกค่าคลังสินค้าไม่สำเร็จ");
        return;
      }

      const nextOut = data?.store?.outStockThreshold ?? parsedOut;
      const nextLow = data?.store?.lowStockThreshold ?? parsedLow;

      setOutStockText(`${nextOut}`);
      setLowStockText(`${nextLow}`);
      setSavedOutStock(nextOut);
      setSavedLowStock(nextLow);

      setSuccessMessage("บันทึกค่าคลังสินค้าเรียบร้อยแล้ว");
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
          <p className="text-sm font-semibold text-slate-900">ตั้งค่าแจ้งเตือนสต็อก</p>
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

        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="store-out-threshold">
                สต็อกหมด (≤)
              </label>
              <input
                id="store-out-threshold"
                type="number"
                min={0}
                step={1}
                value={outStockText}
                onChange={(e) => setOutStockText(e.target.value)}
                className={fieldClassName}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="store-low-threshold">
                สต็อกต่ำ (≤)
              </label>
              <input
                id="store-low-threshold"
                type="number"
                min={0}
                step={1}
                value={lowStockText}
                onChange={(e) => setLowStockText(e.target.value)}
                className={fieldClassName}
                disabled={isSaving}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            สต็อกต่ำต้องมากกว่าหรือเท่ากับสต็อกหมด ตัวอย่าง: หมด ≤ 0, ต่ำ ≤ 10
          </p>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              className="h-10 px-4"
              onClick={saveInventorySettings}
              disabled={isSaving || !isDirty || Boolean(validationError)}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </span>
              ) : (
                "บันทึกการตั้งค่า"
              )}
            </Button>
          </div>
        </div>
      </article>
    </section>
  );
}
