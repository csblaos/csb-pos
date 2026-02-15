const HOUR_MS = 60 * 60 * 1000;

export const isWithin24Hours = (lastInboundAt?: string | null) => {
  if (!lastInboundAt) {
    return false;
  }

  const inbound = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(inbound)) {
    return false;
  }

  return Date.now() - inbound <= 24 * HOUR_MS;
};

export const buildOrderMessageTemplate = (payload: {
  orderNo: string;
  total: number;
  currency?: string;
  customerName?: string | null;
}) => {
  const customerLabel = payload.customerName?.trim() || "ลูกค้า";
  const currencyLabel = payload.currency?.trim() || "LAK";

  return [
    `เรียน ${customerLabel}`,
    `ออเดอร์เลขที่ ${payload.orderNo}`,
    `ยอดชำระทั้งหมด ${payload.total.toLocaleString("th-TH")} ${currencyLabel}`,
    "สามารถแจ้งชำระเงินกลับมาได้ที่แชทนี้",
    "ขอบคุณที่ใช้บริการค่ะ",
  ].join("\n");
};

export const buildWhatsappDeepLink = (phone: string, message: string) => {
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) {
    return null;
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

export const FACEBOOK_INBOX_URL = "https://www.facebook.com/messages";
