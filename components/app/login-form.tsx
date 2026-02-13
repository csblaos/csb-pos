"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
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

type LoginResponse = {
  next?: string;
  token?: string;
  message?: string;
  requiresPasswordChange?: boolean;
  email?: string;
};

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

  const [isForceChangeOpen, setIsForceChangeOpen] = useState(false);
  const [forceChangeEmail, setForceChangeEmail] = useState("");
  const [forceChangeCurrentPassword, setForceChangeCurrentPassword] = useState("");
  const [forceChangePassword, setForceChangePassword] = useState("");
  const [forceChangeConfirmPassword, setForceChangeConfirmPassword] = useState("");
  const [forceChangeError, setForceChangeError] = useState<string | null>(null);
  const [isForceChanging, setIsForceChanging] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "owner@demo-pos.local",
      password: "password123",
    },
  });

  const completeLogin = (data: LoginResponse | null) => {
    if (data?.token) {
      setClientAuthToken(data.token);
    }

    window.location.assign(data?.next ?? "/dashboard");
  };

  const openForceChangeModal = (email: string, currentPassword: string, message?: string) => {
    setForceChangeEmail(email);
    setForceChangeCurrentPassword(currentPassword);
    setForceChangePassword("");
    setForceChangeConfirmPassword("");
    setForceChangeError(message ?? null);
    setIsForceChangeOpen(true);
  };

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    setForceChangeError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const data = (await response.json().catch(() => null)) as LoginResponse | null;

    if (!response.ok) {
      setServerError(data?.message ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    if (data?.requiresPasswordChange) {
      openForceChangeModal(data.email ?? values.email, values.password, data.message);
      return;
    }

    completeLogin(data);
  };

  const submitForceChangePassword = async () => {
    setForceChangeError(null);

    if (forceChangePassword.trim().length < 8) {
      setForceChangeError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    if (forceChangePassword !== forceChangeConfirmPassword) {
      setForceChangeError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }

    if (forceChangePassword === forceChangeCurrentPassword) {
      setForceChangeError("รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านชั่วคราว");
      return;
    }

    setIsForceChanging(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forceChangeEmail,
          password: forceChangeCurrentPassword,
          newPassword: forceChangePassword,
        }),
      });

      const data = (await response.json().catch(() => null)) as LoginResponse | null;
      if (!response.ok) {
        setForceChangeError(data?.message ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }

      if (data?.requiresPasswordChange) {
        setForceChangeError(data.message ?? "ยังไม่สามารถเปลี่ยนรหัสผ่านได้");
        return;
      }

      setIsForceChangeOpen(false);
      completeLogin(data);
    } finally {
      setIsForceChanging(false);
    }
  };

  const closeForceChangeModal = () => {
    if (isForceChanging) {
      return;
    }
    setIsForceChangeOpen(false);
    setForceChangeError(null);
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
    <>
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

      <div className={`fixed inset-0 z-50 ${isForceChangeOpen ? "" : "pointer-events-none"}`} aria-hidden={!isForceChangeOpen}>
        <button
          type="button"
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${isForceChangeOpen ? "opacity-100" : "opacity-0"}`}
          onClick={closeForceChangeModal}
          disabled={isForceChanging}
          aria-label="ปิดหน้าต่างเปลี่ยนรหัสผ่าน"
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-2xl ${
            isForceChangeOpen
              ? "translate-y-0 opacity-100 sm:-translate-x-1/2 sm:-translate-y-1/2"
              : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">ตั้งรหัสผ่านใหม่ก่อนใช้งาน</p>
              <p className="mt-0.5 text-xs text-slate-500">{forceChangeEmail}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              onClick={closeForceChangeModal}
              disabled={isForceChanging}
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:pb-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              รหัสผ่านปัจจุบันเป็นรหัสชั่วคราว กรุณาตั้งรหัสใหม่เพื่อเข้าใช้งานระบบ
            </p>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="force-change-password">
                รหัสผ่านใหม่
              </label>
              <input
                id="force-change-password"
                type="password"
                value={forceChangePassword}
                onChange={(event) => setForceChangePassword(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={isForceChanging}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-500" htmlFor="force-change-confirm-password">
                ยืนยันรหัสผ่านใหม่
              </label>
              <input
                id="force-change-confirm-password"
                type="password"
                value={forceChangeConfirmPassword}
                onChange={(event) => setForceChangeConfirmPassword(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={isForceChanging}
              />
            </div>

            {forceChangeError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {forceChangeError}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={closeForceChangeModal} disabled={isForceChanging}>
                ภายหลัง
              </Button>
              <Button type="button" className="h-10 rounded-xl" onClick={submitForceChangePassword} disabled={isForceChanging}>
                {isForceChanging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกรหัสใหม่"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
