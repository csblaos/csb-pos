"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { setClientAuthToken } from "@/lib/auth/client-token";

const loginSchema = z.object({
  email: z.string().email("กรอกอีเมลให้ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
});

type LoginInput = z.infer<typeof loginSchema>;

const demoAccounts = [
  {
    id: "superadmin",
    label: "Superadmin",
    email: "spadmin@123.com",
    password: "123123123",
  },
  {
    id: "test-user",
    label: "Test",
    email: "test@123.com",
    password: "12341234",
  },
  {
    id: "staff",
    label: "Staff",
    email: "staff@gmail.com",
    password: "123123123",
  },
  {
    id: "system-admin",
    label: "System Admin",
    email: "systemadmin@demo-pos.local",
    password: "Admin@12345",
  },
  {
    id: "owner",
    label: "Owner",
    email: "owner@demo-pos.local",
    password: "password123",
  },
] as const;

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "owner@demo-pos.local",
      password: "password123",
    },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const data = (await response.json().catch(() => null)) as
      | { next?: string; token?: string; message?: string }
      | null;

    if (!response.ok) {
      setServerError(data?.message ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    window.location.assign(data?.next ?? "/dashboard");
  };

  const fillDemoAccount = (account: (typeof demoAccounts)[number]) => {
    setServerError(null);
    form.setValue("email", account.email, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    form.setValue("password", account.password, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const copyDemoAccount = async (account: (typeof demoAccounts)[number]) => {
    if (typeof window === "undefined" || !window.navigator?.clipboard) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(`${account.email}\n${account.password}`);
      setCopiedAccountId(account.id);
      window.setTimeout(() => {
        setCopiedAccountId((currentId) => (currentId === account.id ? null : currentId));
      }, 1200);
    } catch {
      setCopiedAccountId(null);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          อีเมล
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
          {...form.register("email")}
        />
        <p className="text-xs text-red-600">{form.formState.errors.email?.message}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          รหัสผ่าน
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
          {...form.register("password")}
        />
        <p className="text-xs text-red-600">{form.formState.errors.password?.message}</p>
      </div>

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <Button className="h-11 w-full" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </Button>

      <section className="space-y-2 rounded-xl border bg-slate-50 p-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">บัญชีสำหรับเข้าสู่ระบบ</p>
          <p className="text-xs text-slate-600">กด Fill เพื่อกรอกอัตโนมัติ หรือกด Copy เพื่อคัดลอกอีเมลและรหัสผ่าน</p>
        </div>

        <ul className="space-y-2">
          {demoAccounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {account.label}: {account.email}
                </p>
                <p className="truncate text-xs text-slate-500">รหัสผ่าน: *****</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => fillDemoAccount(account)}
                >
                  Fill
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => copyDemoAccount(account)}
                >
                  {copiedAccountId === account.id ? "Copied" : "Copy"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
