"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type SuperadminPaymentPolicyConfigProps = {
  initialConfig: {
    maxAccountsPerStore: number;
    requireSlipForLaoQr: boolean;
  };
};

type PaymentPolicyResponse = {
  message?: string;
  policy?: {
    maxAccountsPerStore: number;
    requireSlipForLaoQr: boolean;
  };
};

export function SuperadminPaymentPolicyConfig({
  initialConfig,
}: SuperadminPaymentPolicyConfigProps) {
  const [maxAccountsPerStore, setMaxAccountsPerStore] = useState(
    String(initialConfig.maxAccountsPerStore),
  );
  const [requireSlipForLaoQr, setRequireSlipForLaoQr] = useState(
    initialConfig.requireSlipForLaoQr,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    const parsedMaxAccounts = Number(maxAccountsPerStore);
    if (!Number.isInteger(parsedMaxAccounts) || parsedMaxAccounts < 1 || parsedMaxAccounts > 20) {
      setErrorMessage("จำนวนบัญชีต่อร้านต้องเป็นตัวเลข 1-20");
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/settings/superadmin/payment-policy", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxAccountsPerStore: parsedMaxAccounts,
        requireSlipForLaoQr,
      }),
    });

    const data = (await response.json().catch(() => null)) as PaymentPolicyResponse | null;
    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึก Payment Policy ไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    const nextValue = data?.policy?.maxAccountsPerStore ?? parsedMaxAccounts;
    setMaxAccountsPerStore(String(nextValue));
    if (data?.policy) {
      setRequireSlipForLaoQr(data.policy.requireSlipForLaoQr);
    }
    setSuccessMessage("บันทึก Payment Policy แล้ว");
    setIsSubmitting(false);
  };

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-900">Payment Account Policy</p>
        <p className="mt-0.5 text-xs text-slate-500">
          จำกัดจำนวนบัญชีรับเงินต่อร้านเพื่อลดความซับซ้อนและควบคุมมาตรฐานข้อมูล
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500" htmlFor="global-payment-max-accounts">
          จำนวนบัญชีรับเงินสูงสุดต่อร้าน
        </label>
        <input
          id="global-payment-max-accounts"
          type="number"
          min={1}
          max={20}
          value={maxAccountsPerStore}
          onChange={(event) => setMaxAccountsPerStore(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
          disabled={isSubmitting}
        />
      </div>

      <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span>บังคับแนบสลิปเมื่อชำระแบบ QR</span>
        <input
          type="checkbox"
          checked={requireSlipForLaoQr}
          onChange={(event) => setRequireSlipForLaoQr(event.target.checked)}
          disabled={isSubmitting}
        />
      </label>

      <Button className="h-10 w-full rounded-xl" onClick={save} disabled={isSubmitting}>
        {isSubmitting ? "กำลังบันทึก..." : "บันทึก Payment Policy"}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </article>
  );
}
