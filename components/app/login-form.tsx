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

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);

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
    </form>
  );
}
