"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type SystemSessionPolicyConfigProps = {
  initialConfig: {
    defaultSessionLimit: number;
  };
};

export function SystemSessionPolicyConfig({ initialConfig }: SystemSessionPolicyConfigProps) {
  const [defaultSessionLimit, setDefaultSessionLimit] = useState(
    String(initialConfig.defaultSessionLimit),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    const parsed = Number(defaultSessionLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
      setErrorMessage("Default session limit ต้องเป็นตัวเลข 1-10");
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/system-admin/config/session-policy", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        defaultSessionLimit: parsed,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          config?: {
            defaultSessionLimit: number;
          };
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึก Session Policy ไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    if (data?.config?.defaultSessionLimit) {
      setDefaultSessionLimit(String(data.config.defaultSessionLimit));
    }

    setSuccessMessage("บันทึก Session Policy แล้ว");
    setIsSubmitting(false);
  };

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-sm font-semibold">Global Session Policy</h2>
      <p className="text-sm text-muted-foreground">
        กำหนดจำนวน session เริ่มต้นต่อผู้ใช้ (ใช้เมื่อ user ไม่ได้ตั้งค่า override)
      </p>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-session-limit">
          Default Session Limit (1-10)
        </label>
        <input
          id="global-session-limit"
          type="number"
          min={1}
          max={10}
          value={defaultSessionLimit}
          onChange={(event) => setDefaultSessionLimit(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting}
        />
      </div>

      <Button className="h-10 w-full" onClick={save} disabled={isSubmitting}>
        {isSubmitting ? "กำลังบันทึก..." : "บันทึก Session Policy"}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </article>
  );
}
