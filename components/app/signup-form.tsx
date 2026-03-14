"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { setClientAuthToken } from "@/lib/auth/client-token";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";

type SignupInput = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type SignupFormProps = {
  language: AppLanguage;
};

export function SignupForm({ language }: SignupFormProps) {
  const router = useRouter();
  const t = useMemo(() => createTranslator(language), [language]);
  const [serverError, setServerError] = useState<string | null>(null);

  const signupSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(2, t("auth.signup.validation.name")),
          email: z.string().email(t("auth.signup.validation.email")),
          password: z.string().min(8, t("auth.signup.validation.password")),
          confirmPassword: z.string().min(8, t("auth.signup.validation.confirmPassword")),
        })
        .refine((value) => value.password === value.confirmPassword, {
          path: ["confirmPassword"],
          message: t("auth.signup.validation.mismatch"),
        }),
    [t],
  );

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: SignupInput) => {
    setServerError(null);

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: values.name,
        email: values.email,
        password: values.password,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { next?: string; token?: string; message?: string }
      | null;

    if (!response.ok) {
      setServerError(data?.message ?? t("auth.signup.error"));
      return;
    }

    if (data?.token) {
      setClientAuthToken(data.token);
    }

    router.replace(data?.next ?? "/onboarding");
    router.refresh();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          {t("auth.signup.name")}
        </label>
        <input
          id="name"
          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
          {...form.register("name")}
        />
        <p className="text-xs text-red-600">{form.formState.errors.name?.message}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          {t("auth.signup.email")}
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
          {t("auth.signup.password")}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
          {...form.register("password")}
        />
        <p className="text-xs text-red-600">{form.formState.errors.password?.message}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          {t("auth.signup.confirmPassword")}
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
          {...form.register("confirmPassword")}
        />
        <p className="text-xs text-red-600">
          {form.formState.errors.confirmPassword?.message}
        </p>
      </div>

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <Button className="h-11 w-full" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("auth.signup.submitting") : t("auth.signup.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("auth.signup.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-blue-700 hover:underline">
          {t("auth.signup.loginLink")}
        </Link>
      </p>
    </form>
  );
}
