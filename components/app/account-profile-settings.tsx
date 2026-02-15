"use client";

import { CheckCircle2, CircleAlert, Loader2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { authFetch, setClientAuthToken } from "@/lib/auth/client-token";

type AccountProfileSettingsProps = {
  initialName: string;
  email: string;
};

type UpdateProfileResponse = {
  ok?: boolean;
  message?: string;
  warning?: string | null;
  token?: string;
  user?: {
    name?: string;
    email?: string;
  };
};

export function AccountProfileSettings({ initialName, email }: AccountProfileSettingsProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedName = name.trim();
  const isDirty = normalizedName !== savedName.trim();
  const profileStatus = useMemo(() => {
    if (isDirty) {
      return {
        text: "ยังไม่บันทึก",
        className: "border-amber-200 bg-amber-50 text-amber-700",
        icon: CircleAlert,
      };
    }

    return {
      text: "บันทึกแล้ว",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  }, [isDirty]);
  const ProfileStatusIcon = profileStatus.icon;

  const validate = () => {
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      return "ชื่อผู้ใช้ต้องมี 2-120 ตัวอักษร";
    }

    return null;
  };

  const saveProfile = async () => {
    setSuccessMessage(null);
    setWarningMessage(null);
    setErrorMessage(null);

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!isDirty) {
      setSuccessMessage("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
      return;
    }

    setIsSaving(true);

    try {
      const response = await authFetch("/api/settings/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_profile",
          name: normalizedName,
        }),
      });

      const data = (await response.json().catch(() => null)) as UpdateProfileResponse | null;
      if (!response.ok) {
        setErrorMessage(data?.message ?? "อัปเดตโปรไฟล์ไม่สำเร็จ");
        return;
      }

      const nextName = data?.user?.name?.trim() || normalizedName;
      setName(nextName);
      setSavedName(nextName);
      setWarningMessage(data?.warning ?? null);
      setSuccessMessage("บันทึกโปรไฟล์เรียบร้อยแล้ว");

      if (data?.token) {
        setClientAuthToken(data.token);
      }

      router.refresh();
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  return (
    <section className="space-y-4">
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-900">โปรไฟล์บัญชี</p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${profileStatus.className}`}
          >
            <ProfileStatusIcon className="h-3.5 w-3.5" />
            {profileStatus.text}
          </span>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="account-name">
              ชื่อที่แสดง
            </label>
            <input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClassName}
              disabled={isSaving}
              maxLength={120}
              placeholder="เช่น คุณบี - ผู้จัดการร้าน"
            />
            <p className="text-xs text-slate-500">ชื่อนี้จะใช้แสดงในหน้า dashboard และข้อมูลผู้ใช้ในร้าน</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="account-email">
              อีเมลล็อกอิน
            </label>
            <input
              id="account-email"
              value={email}
              className={fieldClassName}
              disabled
              readOnly
            />
            <p className="text-xs text-slate-500">อีเมลใช้สำหรับเข้าสู่ระบบเท่านั้น (ยังไม่รองรับการเปลี่ยนอีเมล)</p>
          </div>

          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
          {warningMessage ? <p className="text-sm text-amber-700">{warningMessage}</p> : null}
          {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}

          <div className="flex justify-end">
            <Button
              type="button"
              className="h-11 min-w-[180px] rounded-xl"
              disabled={isSaving || !isDirty}
              onClick={saveProfile}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                "บันทึกชื่อผู้ใช้"
              )}
            </Button>
          </div>
        </div>
      </article>
    </section>
  );
}
