"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import type { UnitOption } from "@/lib/products/service";
import {
  createUnitSchema,
  type CreateUnitFormInput,
  type CreateUnitInput,
} from "@/lib/products/validation";

type UnitsManagementProps = {
  units: UnitOption[];
  canCreate: boolean;
};

export function UnitsManagement({ units, canCreate }: UnitsManagementProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<CreateUnitFormInput, unknown, CreateUnitInput>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      code: "",
      nameTh: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setMessage(null);
    setErrorMessage(null);

    const response = await fetch("/api/units", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "เพิ่มหน่วยไม่สำเร็จ");
      return;
    }

    form.reset({ code: "", nameTh: "" });
    setMessage("เพิ่มหน่วยสินค้าเรียบร้อย");
    router.refresh();
  });

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">เพิ่มหน่วยสินค้า</h2>

        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="unit-code">
              รหัสหน่วย (เช่น PCS, PACK)
            </label>
            <input
              id="unit-code"
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={!canCreate || form.formState.isSubmitting}
              {...form.register("code")}
            />
            <p className="text-xs text-red-600">{form.formState.errors.code?.message}</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="unit-name">
              ชื่อหน่วยภาษาไทย
            </label>
            <input
              id="unit-name"
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={!canCreate || form.formState.isSubmitting}
              {...form.register("nameTh")}
            />
            <p className="text-xs text-red-600">{form.formState.errors.nameTh?.message}</p>
          </div>

          <Button type="submit" className="h-10 w-full" disabled={!canCreate || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "กำลังบันทึก..." : "บันทึกหน่วยสินค้า"}
          </Button>
        </form>
      </article>

      <article className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">รายการหน่วยสินค้า</h2>
        <div className="space-y-2">
          {units.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <p className="text-sm font-medium">{unit.code}</p>
              <p className="text-xs text-muted-foreground">{unit.nameTh}</p>
            </div>
          ))}
        </div>
      </article>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
