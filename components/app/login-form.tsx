"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { clearClientAuthToken, setClientAuthToken } from "@/lib/auth/client-token";
import { createTranslator } from "@/lib/i18n/translate";
import type { AppLanguage } from "@/lib/i18n/types";

type LoginInput = {
  email: string;
  password: string;
};

type LoginResponse = {
  ok?: boolean;
  blocked?: boolean;
  accountStatus?: "INVITED" | "SUSPENDED" | "NO_ACTIVE_STORE";
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

type LoginFormProps = {
  language: AppLanguage;
};

export function LoginForm({ language }: LoginFormProps) {
  const t = useMemo(() => createTranslator(language), [language]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  const [isForceChangeOpen, setIsForceChangeOpen] = useState(false);
  const [forceChangeEmail, setForceChangeEmail] = useState("");
  const [forceChangeCurrentPassword, setForceChangeCurrentPassword] = useState("");
  const [forceChangePassword, setForceChangePassword] = useState("");
  const [forceChangeConfirmPassword, setForceChangeConfirmPassword] = useState("");
  const [forceChangeError, setForceChangeError] = useState<string | null>(null);
  const [isForceChanging, setIsForceChanging] = useState(false);

  const loginSchema = useMemo(() =>
    z.object({
      email: z.string().email(t("auth.login.validation.email")),
      password: z.string().min(8, t("auth.login.validation.password")),
    }),
  [t]);

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
    } else {
      clearClientAuthToken();
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
      setServerError(data?.message ?? t("auth.login.error"));
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
      setForceChangeError(t("auth.login.forceChange.validation.password"));
      return;
    }

    if (forceChangePassword !== forceChangeConfirmPassword) {
      setForceChangeError(t("auth.login.forceChange.validation.confirm"));
      return;
    }

    if (forceChangePassword === forceChangeCurrentPassword) {
      setForceChangeError(t("auth.login.forceChange.validation.mustChange"));
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
        setForceChangeError(data?.message ?? t("auth.login.forceChange.error"));
        return;
      }

      if (data?.requiresPasswordChange) {
        setForceChangeError(data.message ?? t("auth.login.forceChange.stillBlocked"));
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
            {t("auth.login.email")}
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
            {t("auth.login.password")}
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
          {form.formState.isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>

        <section className="space-y-2 rounded-xl border bg-slate-50 p-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("auth.login.demo.title")}</p>
            <p className="text-xs text-slate-600">{t("auth.login.demo.description")}</p>
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
                    {t("auth.login.demo.fill")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => copyDemoAccount(account)}
                  >
                    {copiedAccountId === account.id
                      ? t("auth.login.demo.copied")
                      : t("auth.login.demo.copy")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </form>

      <SlideUpSheet
        isOpen={isForceChangeOpen}
        onClose={closeForceChangeModal}
        title={t("auth.login.forceChange.title")}
        description={forceChangeEmail}
        panelMaxWidthClass="min-[1200px]:max-w-md"
        disabled={isForceChanging}
      >
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {t("auth.login.forceChange.description")}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-500" htmlFor="force-change-password">
              {t("auth.login.forceChange.password")}
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
              {t("auth.login.forceChange.confirmPassword")}
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
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              onClick={closeForceChangeModal}
              disabled={isForceChanging}
            >
              {t("auth.login.forceChange.later")}
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl"
              onClick={submitForceChangePassword}
              disabled={isForceChanging}
            >
              {isForceChanging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("auth.login.forceChange.saving")}
                </>
              ) : (
                t("auth.login.forceChange.save")
              )}
            </Button>
          </div>
        </div>
      </SlideUpSheet>
    </>
  );
}
