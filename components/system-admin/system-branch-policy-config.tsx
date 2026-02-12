"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";

type SystemBranchPolicyConfigProps = {
  initialConfig: {
    defaultCanCreateBranches: boolean;
    defaultMaxBranchesPerStore: number | null;
  };
};

export function SystemBranchPolicyConfig({ initialConfig }: SystemBranchPolicyConfigProps) {
  const [defaultCanCreateBranches, setDefaultCanCreateBranches] = useState(
    initialConfig.defaultCanCreateBranches,
  );
  const [defaultMaxBranchesPerStore, setDefaultMaxBranchesPerStore] = useState(
    initialConfig.defaultMaxBranchesPerStore !== null
      ? String(initialConfig.defaultMaxBranchesPerStore)
      : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parseOptionalLimit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 500) {
      return Number.NaN;
    }

    return parsed;
  };

  const save = async () => {
    const parsedLimit = parseOptionalLimit(defaultMaxBranchesPerStore);
    if (Number.isNaN(parsedLimit)) {
      setErrorMessage("โควตาสาขาต้องเป็นตัวเลข 0-500 หรือเว้นว่างเพื่อไม่จำกัด");
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/system-admin/config/branch-policy", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        defaultCanCreateBranches,
        defaultMaxBranchesPerStore: parsedLimit,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
          config?: {
            defaultCanCreateBranches: boolean;
            defaultMaxBranchesPerStore: number | null;
          };
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึก Global Branch Policy ไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    if (data?.config) {
      setDefaultCanCreateBranches(data.config.defaultCanCreateBranches);
      setDefaultMaxBranchesPerStore(
        data.config.defaultMaxBranchesPerStore !== null
          ? String(data.config.defaultMaxBranchesPerStore)
          : "",
      );
    }

    setSuccessMessage("บันทึก Global Branch Policy แล้ว");
    setIsSubmitting(false);
  };

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-sm font-semibold">Global Branch Policy</h2>
      <p className="text-sm text-muted-foreground">
        ค่าเริ่มต้นนี้จะถูกใช้เมื่อ SUPERADMIN ไม่ได้กำหนด override ของตัวเอง
      </p>

      <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>อนุญาตให้ SUPERADMIN สร้างสาขา</span>
        <input
          type="checkbox"
          checked={defaultCanCreateBranches}
          onChange={(event) => setDefaultCanCreateBranches(event.target.checked)}
          disabled={isSubmitting}
        />
      </label>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="global-max-branches">
          โควตาสาขาต่อร้าน (ว่าง = ไม่จำกัด)
        </label>
        <input
          id="global-max-branches"
          type="number"
          min={0}
          max={500}
          value={defaultMaxBranchesPerStore}
          onChange={(event) => setDefaultMaxBranchesPerStore(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
          disabled={isSubmitting || !defaultCanCreateBranches}
          placeholder="เช่น 5"
        />
      </div>

      <Button className="h-10 w-full" onClick={save} disabled={isSubmitting}>
        {isSubmitting ? "กำลังบันทึก..." : "บันทึก Global Policy"}
      </Button>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </article>
  );
}
