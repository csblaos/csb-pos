"use client";

import { CheckCircle2, ChevronRight, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { SlideUpSheet } from "@/components/ui/slide-up-sheet";
import { authFetch, clearClientAuthToken } from "@/lib/auth/client-token";
import { clearPurchaseLocalStorage } from "@/lib/purchases/client-storage";

type AccountPasswordSettingsProps = {
  mustChangePassword: boolean;
};

type ChangePasswordResponse = {
  ok?: boolean;
  message?: string;
  warning?: string | null;
  requireRelogin?: boolean;
};

export function AccountPasswordSettings({ mustChangePassword }: AccountPasswordSettingsProps) {
  const router = useRouter();
  const [isSheetOpen, setIsSheetOpen] = useState(mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeSheet = useCallback(() => {
    if (isSaving) return;
    setIsSheetOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMessage(null);
    setWarningMessage(null);
    // Keep success message visible briefly after close
    if (!successMessage) setSuccessMessage(null);
  }, [isSaving, successMessage]);

  const validate = () => {
    if (currentPassword.trim().length < 8) {
      return "กรุณากรอกรหัสผ่านปัจจุบันให้ถูกต้อง";
    }

    if (newPassword.trim().length < 8 || newPassword.trim().length > 128) {
      return "รหัสผ่านใหม่ต้องมี 8-128 ตัวอักษร";
    }

    if (newPassword !== confirmPassword) {
      return "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน";
    }

    if (currentPassword === newPassword) {
      return "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม";
    }

    return null;
  };

  const changePassword = async () => {
    setErrorMessage(null);
    setWarningMessage(null);
    setSuccessMessage(null);

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
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
          action: "change_password",
          currentPassword,
          newPassword,
        }),
      });

      const data = (await response.json().catch(() => null)) as ChangePasswordResponse | null;
      if (!response.ok) {
        setErrorMessage(data?.message ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }

      setWarningMessage(data?.warning ?? null);
      setSuccessMessage(data?.message ?? "เปลี่ยนรหัสผ่านสำเร็จ");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      if (data?.requireRelogin) {
        clearClientAuthToken();
        clearPurchaseLocalStorage();
        window.setTimeout(() => {
          router.replace("/login");
          router.refresh();
        }, 650);
      }
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClassName =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none ring-primary focus:ring-2 disabled:bg-slate-100";

  return (
    <>
      {/* CTA Card */}
      <button
        type="button"
        className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-colors hover:bg-slate-50"
        onClick={() => setIsSheetOpen(true)}
      >
        <div className="flex min-h-14 items-center gap-3 px-4 py-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <KeyRound className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">เปลี่ยนรหัสผ่าน</span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              อัปเดตรหัสผ่านเพื่อความปลอดภัยบัญชี
            </span>
          </span>
          {mustChangePassword ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              ควรเปลี่ยนทันที
            </span>
          ) : successMessage ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              เปลี่ยนแล้ว
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>

      {/* Slide-up sheet with password form */}
      <SlideUpSheet
        isOpen={isSheetOpen}
        onClose={closeSheet}
        title="เปลี่ยนรหัสผ่าน"
        description="หลังบันทึกรหัสผ่านใหม่ คุณจะต้องล็อกอินใหม่ทันที"
        disabled={isSaving}
      >
        <div className="space-y-4">
          {mustChangePassword ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ระบบแจ้งว่าบัญชีนี้ควรเปลี่ยนรหัสผ่านทันทีเพื่อความปลอดภัย
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="current-password">
              รหัสผ่านปัจจุบัน
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className={fieldClassName}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="new-password">
              รหัสผ่านใหม่
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className={fieldClassName}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="confirm-password">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className={fieldClassName}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <p className="text-xs text-slate-500">
            แนะนำให้ใช้รหัสผ่านที่ยาวอย่างน้อย 8 ตัว และไม่ซ้ำกับบัญชีอื่น
          </p>

          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
          {warningMessage ? <p className="text-sm text-amber-700">{warningMessage}</p> : null}
          {successMessage ? (
            <p className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              className="h-11 min-w-[200px] rounded-xl"
              disabled={isSaving}
              onClick={changePassword}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                "บันทึกรหัสผ่านใหม่"
              )}
            </Button>
          </div>
        </div>
      </SlideUpSheet>
    </>
  );
}
