"use client";

import { CheckCircle2, Circle, Facebook, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type ChannelStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";

type ChannelState = {
  facebook: ChannelStatus;
  whatsapp: ChannelStatus;
};

type WizardProps = {
  hasStoreMembership: boolean;
};

const storeTypeOptions = [
  {
    value: "ONLINE_RETAIL",
    title: "ขายออนไลน์",
    description: "รองรับการขายผ่านช่องทางแชตและหน้าร้าน",
    available: true,
  },
  {
    value: "RESTAURANT",
    title: "ร้านอาหาร",
    description: "เร็วๆ นี้",
    available: false,
  },
  {
    value: "CAFE",
    title: "คาเฟ่",
    description: "เร็วๆ นี้",
    available: false,
  },
  {
    value: "OTHER",
    title: "อื่นๆ",
    description: "เร็วๆ นี้",
    available: false,
  },
] as const;

const defaultChannelState: ChannelState = {
  facebook: "DISCONNECTED",
  whatsapp: "DISCONNECTED",
};

const statusLabel: Record<ChannelStatus, string> = {
  DISCONNECTED: "ยังไม่เชื่อมต่อ",
  CONNECTED: "เชื่อมต่อแล้ว",
  ERROR: "พบข้อผิดพลาด",
};

function formatVatRateFromBasisPoints(vatRateBasisPoints: number) {
  return (vatRateBasisPoints / 100).toFixed(2);
}

function toBasisPoints(vatRatePercentText: string) {
  const parsed = Number(vatRatePercentText);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(10000, Math.round(parsed * 100)));
}

export function OnboardingWizard({ hasStoreMembership }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(hasStoreMembership ? 3 : 1);
  const [storeType, setStoreType] = useState<(typeof storeTypeOptions)[number]["value"]>(
    "ONLINE_RETAIL",
  );
  const [storeName, setStoreName] = useState("");
  const [currency, setCurrency] = useState<"LAK" | "THB" | "USD">("LAK");
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatRatePercent, setVatRatePercent] = useState("7.00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [channelStatus, setChannelStatus] = useState<ChannelState>(defaultChannelState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeStoreType = useMemo(
    () => storeTypeOptions.find((option) => option.value === storeType),
    [storeType],
  );

  useEffect(() => {
    if (step === 3) {
      void loadChannelStatus();
    }
  }, [step]);

  const loadChannelStatus = async () => {
    const response = await fetch("/api/onboarding/channels", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { status?: ChannelState };
    if (data.status) {
      setChannelStatus(data.status);
    }
  };

  const goToStep2 = () => {
    if (!activeStoreType?.available) {
      return;
    }

    setStep(2);
    setErrorMessage(null);
  };

  const submitStore = async () => {
    if (!storeName.trim()) {
      setErrorMessage("กรุณากรอกชื่อร้าน");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await fetch("/api/onboarding/store", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storeType,
        storeName: storeName.trim(),
        currency,
        vatEnabled,
        vatRate: toBasisPoints(vatRatePercent),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "สร้างร้านไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    await loadChannelStatus();
    setStep(3);
    setIsSubmitting(false);
  };

  const connectChannel = async (channel: "FACEBOOK" | "WHATSAPP") => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await fetch("/api/onboarding/channels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string; status?: ChannelState }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "เชื่อมต่อช่องทางไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    if (data?.status) {
      setChannelStatus(data.status);
    }

    setIsSubmitting(false);
  };

  const completeOnboarding = () => {
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2 text-center">
        <p className="text-sm font-medium text-blue-600">ตั้งค่าร้านค้าเริ่มต้น</p>
        <h1 className="text-2xl font-semibold tracking-tight">เริ่มใช้งานระบบขาย</h1>
      </header>

      <div className="rounded-xl border bg-slate-50 p-3">
        <ol className="grid grid-cols-3 gap-2 text-xs">
          {["ประเภทร้าน", "ตั้งค่าร้าน", "เชื่อมช่องทาง"].map((title, index) => {
            const current = index + 1;
            const done = step > current;
            const active = step === current;

            return (
              <li
                key={title}
                className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                  active ? "bg-blue-100 text-blue-800" : "text-slate-500"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                <span className="truncate">{title}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {step === 1 ? (
        <div className="space-y-3">
          {storeTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStoreType(option.value)}
              className={`w-full rounded-xl border p-4 text-left transition ${
                storeType === option.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <p className="text-sm font-medium">{option.title}</p>
              <p
                className={`text-xs ${
                  option.available ? "text-slate-500" : "text-amber-600"
                }`}
              >
                {option.description}
              </p>
            </button>
          ))}

          <Button
            className="h-11 w-full"
            onClick={goToStep2}
            disabled={!activeStoreType?.available}
          >
            ดำเนินการต่อ
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="storeName" className="text-sm font-medium">
              ชื่อร้าน
            </label>
            <input
              id="storeName"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
              placeholder="เช่น ร้านกาแฟริมทาง"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="currency" className="text-sm font-medium">
              สกุลเงิน
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value as "LAK" | "THB" | "USD")
              }
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2"
            >
              <option value="LAK">LAK</option>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div className="rounded-xl border bg-white p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              <span>เปิดใช้งาน VAT</span>
              <input
                type="checkbox"
                checked={vatEnabled}
                onChange={(event) => setVatEnabled(event.target.checked)}
                className="h-4 w-4"
              />
            </label>

            <div className="mt-3 space-y-2">
              <label htmlFor="vatRate" className="text-sm text-muted-foreground">
                อัตรา VAT (%)
              </label>
              <input
                id="vatRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formatVatRateFromBasisPoints(toBasisPoints(vatRatePercent))}
                onChange={(event) => setVatRatePercent(event.target.value)}
                disabled={!vatEnabled}
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none ring-primary focus:ring-2 disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
            >
              ย้อนกลับ
            </Button>
            <Button className="h-11" onClick={submitStore} disabled={isSubmitting}>
              {isSubmitting ? "กำลังสร้างร้าน..." : "สร้างร้านและดำเนินการต่อ"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <article className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2">
              <Facebook className="h-5 w-5 text-blue-600" />
              <p className="font-medium">Facebook</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              สถานะ: {statusLabel[channelStatus.facebook]}
            </p>
            <Button
              variant={channelStatus.facebook === "CONNECTED" ? "outline" : "default"}
              className="mt-3 h-10 w-full"
              onClick={() => connectChannel("FACEBOOK")}
              disabled={isSubmitting}
            >
              {channelStatus.facebook === "CONNECTED"
                ? "เชื่อมต่อแล้ว"
                : "เชื่อมต่อ Facebook"}
            </Button>
          </article>

          <article className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              <p className="font-medium">WhatsApp</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              สถานะ: {statusLabel[channelStatus.whatsapp]}
            </p>
            <Button
              variant={channelStatus.whatsapp === "CONNECTED" ? "outline" : "default"}
              className="mt-3 h-10 w-full"
              onClick={() => connectChannel("WHATSAPP")}
              disabled={isSubmitting}
            >
              {channelStatus.whatsapp === "CONNECTED"
                ? "เชื่อมต่อแล้ว"
                : "เชื่อมต่อ WhatsApp"}
            </Button>
          </article>

          <Button className="h-11 w-full" onClick={completeOnboarding}>
            เข้าสู่หน้าแดชบอร์ด
          </Button>
        </div>
      ) : null}

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
