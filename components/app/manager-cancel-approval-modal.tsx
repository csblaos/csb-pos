"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

export type ManagerCancelApprovalPayload = {
  cancelReason: string;
  approvalMode: "MANAGER_PASSWORD" | "SELF_SLIDE";
  approvalEmail?: string;
  approvalPassword?: string;
  confirmBySlide?: true;
};

export type ManagerCancelApprovalResult = {
  ok: boolean;
  message?: string;
};

type ManagerCancelApprovalModalProps = {
  isOpen: boolean;
  orderNo?: string | null;
  mode: "MANAGER_PASSWORD" | "SELF_SLIDE";
  isHighRisk?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (
    payload: ManagerCancelApprovalPayload,
  ) => ManagerCancelApprovalResult | Promise<ManagerCancelApprovalResult>;
};

const MAX_FAILED_ATTEMPTS_BEFORE_COOLDOWN = 3;
const COOLDOWN_SECONDS = 30;

export function ManagerCancelApprovalModal({
  isOpen,
  orderNo,
  mode,
  isHighRisk = false,
  busy = false,
  onClose,
  onConfirm,
}: ManagerCancelApprovalModalProps) {
  const [mounted, setMounted] = useState(false);
  const [approvalEmail, setApprovalEmail] = useState("");
  const [approvalPassword, setApprovalPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [slideConfirmValue, setSlideConfirmValue] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApprovalEmail("");
    setApprovalPassword("");
    setCancelReason("");
    setSlideConfirmValue(0);
    setLocalError(null);
    setFailedAttempts(0);
    setCooldownUntilMs(null);
  }, [isOpen, orderNo]);

  useEffect(() => {
    if (!cooldownUntilMs) {
      setCooldownRemainingSeconds(0);
      return;
    }

    const syncRemaining = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntilMs - Date.now()) / 1000));
      setCooldownRemainingSeconds(remaining);
      if (remaining <= 0) {
        setCooldownUntilMs(null);
      }
    };

    syncRemaining();
    const timerId = window.setInterval(syncRemaining, 1000);
    return () => window.clearInterval(timerId);
  }, [cooldownUntilMs]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [busy, isOpen, onClose]);

  const canSubmit = useMemo(
    () =>
      !busy &&
      cooldownRemainingSeconds <= 0 &&
      (mode === "SELF_SLIDE" ||
        (approvalEmail.trim().length > 0 && approvalPassword.trim().length > 0)) &&
      (mode !== "SELF_SLIDE" || slideConfirmValue >= 100) &&
      cancelReason.trim().length > 0,
    [
      approvalEmail,
      approvalPassword,
      busy,
      cancelReason,
      cooldownRemainingSeconds,
      mode,
      slideConfirmValue,
    ],
  );

  if (!mounted || !isOpen) {
    return null;
  }

  const submit = async () => {
    const reason = cancelReason.trim();
    if (!reason) {
      setLocalError("กรุณาระบุเหตุผลการยกเลิก");
      return;
    }

    if (mode === "MANAGER_PASSWORD") {
      const email = approvalEmail.trim().toLowerCase();
      const password = approvalPassword.trim();
      if (!email || !password) {
        setLocalError("กรุณากรอกอีเมลผู้อนุมัติ และรหัสผ่าน");
        return;
      }

      setLocalError(null);
      const result = await onConfirm({
        approvalMode: "MANAGER_PASSWORD",
        approvalEmail: email,
        approvalPassword: password,
        cancelReason: reason,
      });
      if (result.ok) {
        setFailedAttempts(0);
        return;
      }

      const nextFailedAttempts = failedAttempts + 1;
      const isCooldownTriggered = nextFailedAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_COOLDOWN;
      if (isCooldownTriggered) {
        setFailedAttempts(0);
        setCooldownUntilMs(Date.now() + COOLDOWN_SECONDS * 1000);
        setLocalError(
          result.message ??
            `ลองรหัสผิดหลายครั้ง ระบบพักการยืนยันชั่วคราว ${COOLDOWN_SECONDS} วินาที`,
        );
        return;
      }

      setFailedAttempts(nextFailedAttempts);
      setLocalError(result.message ?? "ยืนยันไม่สำเร็จ กรุณาตรวจสอบข้อมูลผู้อนุมัติ");
      return;
    }

    if (slideConfirmValue < 100) {
      setLocalError("กรุณาลากสไลด์ให้สุดเพื่อยืนยันการยกเลิก");
      return;
    }

    setLocalError(null);
    const result = await onConfirm({
      cancelReason: reason,
      approvalMode: "SELF_SLIDE",
      confirmBySlide: true,
    });
    if (result.ok) {
      setFailedAttempts(0);
      return;
    }
    setLocalError(result.message ?? "ยืนยันไม่สำเร็จ");
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55"
        aria-label="ปิดหน้าต่างยืนยันรหัสผ่าน"
        onClick={() => {
          if (!busy) {
            onClose();
          }
        }}
        disabled={busy}
      />
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manager-cancel-approval-title"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          <h3 id="manager-cancel-approval-title" className="text-base font-semibold text-slate-900">
            {mode === "SELF_SLIDE" ? "ยืนยันการยกเลิกออเดอร์" : "ยืนยันรหัสผ่าน Manager"}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            {mode === "SELF_SLIDE"
              ? "ยืนยันด้วยการเลื่อนสไลด์แทนการกรอกรหัสผ่าน"
              : "ต้องใช้บัญชี Owner/Manager เพื่อยืนยันการยกเลิก"}
            {orderNo ? ` (${orderNo})` : ""}
          </p>
          {mode === "SELF_SLIDE" && isHighRisk ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              รายการนี้เป็นเคสเสี่ยงสูง กรุณาตรวจสอบข้อมูลออเดอร์ให้ถูกต้องก่อนยืนยัน
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {mode === "MANAGER_PASSWORD" ? (
              <>
                <input
                  type="email"
                  value={approvalEmail}
                  onChange={(event) => setApprovalEmail(event.target.value)}
                  placeholder="อีเมลผู้อนุมัติ"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none ring-primary focus:ring-2"
                  disabled={busy}
                />
                <input
                  type="password"
                  value={approvalPassword}
                  onChange={(event) => setApprovalPassword(event.target.value)}
                  placeholder="รหัสผ่านผู้อนุมัติ"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none ring-primary focus:ring-2"
                  disabled={busy}
                />
              </>
            ) : null}
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="เหตุผลการยกเลิก"
              className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none ring-primary focus:ring-2"
              disabled={busy}
            />
            {mode === "SELF_SLIDE" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                <label className="mb-1 block text-xs text-slate-600">
                  เลื่อนเพื่อยืนยันการยกเลิก
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={slideConfirmValue}
                  onChange={(event) => setSlideConfirmValue(Number(event.target.value))}
                  className="h-8 w-full accent-rose-600"
                  disabled={busy}
                />
                <p className="text-right text-[11px] text-slate-500">
                  {slideConfirmValue >= 100 ? "พร้อมยืนยัน" : `${slideConfirmValue}%`}
                </p>
              </div>
            ) : null}
          </div>

          {localError ? (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600">
              {localError}
            </p>
          ) : null}
          {cooldownRemainingSeconds > 0 ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              กรุณารอ {cooldownRemainingSeconds} วินาที ก่อนลองยืนยันอีกครั้ง
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={onClose}
              disabled={busy}
            >
              ปิด
            </Button>
            <Button
              type="button"
              className="h-9 bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                void submit();
              }}
              disabled={!canSubmit}
            >
              {busy ? "กำลังยืนยัน..." : "ยืนยันยกเลิก"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
