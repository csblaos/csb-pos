"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type SystemStoreLogoPolicyConfigProps = {
  initialConfig: {
    maxSizeMb: number;
    autoResize: boolean;
    resizeMaxWidth: number;
  };
};

export function SystemStoreLogoPolicyConfig({ initialConfig }: SystemStoreLogoPolicyConfigProps) {
  const [maxSizeMb, setMaxSizeMb] = useState(String(initialConfig.maxSizeMb));
  const [autoResize, setAutoResize] = useState(initialConfig.autoResize);
  const [resizeMaxWidth, setResizeMaxWidth] = useState(String(initialConfig.resizeMaxWidth));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    const parsedMaxSizeMb = Number(maxSizeMb);
    const parsedResizeMaxWidth = Number(resizeMaxWidth);

    if (!Number.isInteger(parsedMaxSizeMb) || parsedMaxSizeMb < 1 || parsedMaxSizeMb > 20) {
      setErrorMessage("ขนาดไฟล์สูงสุดต้องเป็นตัวเลข 1-20 MB");
      setSuccessMessage(null);
      return;
    }

    if (
      !Number.isInteger(parsedResizeMaxWidth) ||
      parsedResizeMaxWidth < 256 ||
      parsedResizeMaxWidth > 4096
    ) {
      setErrorMessage("ขนาดกว้างสำหรับ Resize ต้องเป็นตัวเลข 256-4096 px");
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/system-admin/config/store-logo-policy", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxSizeMb: parsedMaxSizeMb,
        autoResize,
        resizeMaxWidth: parsedResizeMaxWidth,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          config?: {
            maxSizeMb: number;
            autoResize: boolean;
            resizeMaxWidth: number;
          };
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึก Store Logo Policy ไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    if (data?.config) {
      setMaxSizeMb(String(data.config.maxSizeMb));
      setAutoResize(data.config.autoResize);
      setResizeMaxWidth(String(data.config.resizeMaxWidth));
    }

    setSuccessMessage("บันทึก Store Logo Policy แล้ว");
    setIsSubmitting(false);
  };

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-sm font-semibold">Store Logo Upload Policy</h2>
      <p className="text-sm text-muted-foreground">
        จำกัดขนาดไฟล์ และตั้งค่า Resize อัตโนมัติก่อนอัปโหลดไป R2 เพื่อลดต้นทุนจัดเก็บ
      </p>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-store-logo-max-size">
          ขนาดไฟล์สูงสุด (MB)
        </label>
        <input
          id="global-store-logo-max-size"
          type="number"
          min={1}
          max={20}
          value={maxSizeMb}
          onChange={(event) => setMaxSizeMb(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting}
        />
      </div>

      <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>เปิด Resize โลโก้อัตโนมัติ</span>
        <input
          type="checkbox"
          checked={autoResize}
          onChange={(event) => setAutoResize(event.target.checked)}
          disabled={isSubmitting}
        />
      </label>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-store-logo-resize-width">
          ความกว้างสูงสุดหลัง Resize (px)
        </label>
        <input
          id="global-store-logo-resize-width"
          type="number"
          min={256}
          max={4096}
          value={resizeMaxWidth}
          onChange={(event) => setResizeMaxWidth(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting || !autoResize}
        />
      </div>

      <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
        คำแนะนำ: เปิด Resize และตั้ง 1024-1280px จะช่วยลดขนาดไฟล์และค่า R2 ได้มาก โดยยังคมชัดพอสำหรับโลโก้
      </p>

      <Button className="h-10 w-full" onClick={save} disabled={isSubmitting}>
        {isSubmitting ? "กำลังบันทึก..." : "บันทึก Store Logo Policy"}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </article>
  );
}
