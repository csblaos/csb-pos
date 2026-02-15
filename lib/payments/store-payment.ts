export const paymentAccountTypeValues = ["BANK", "LAO_QR"] as const;

export type PaymentAccountType = (typeof paymentAccountTypeValues)[number];

export const paymentAccountTypeLabel = (value: PaymentAccountType) => {
  if (value === "BANK") {
    return "บัญชีธนาคาร";
  }
  return "QR โอนเงิน (ลาว)";
};

export const maskAccountValue = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return "-";
  }

  if (normalized.length <= 4) {
    return normalized;
  }

  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
};

export const normalizeOptionalText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};
