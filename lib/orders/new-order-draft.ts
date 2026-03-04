export const NEW_ORDER_DRAFT_STORAGE_KEY = "csb.orders.new.has_draft";
export const NEW_ORDER_DRAFT_PAYLOAD_STORAGE_KEY = "csb.orders.new.form_draft.v1";
export const NEW_ORDER_DRAFT_DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

export type NewOrderDraftCheckoutFlow = "WALK_IN_NOW" | "PICKUP_LATER" | "ONLINE_DELIVERY";

export type NewOrderDraftPayload = {
  checkoutFlow: NewOrderDraftCheckoutFlow;
  form: {
    channel: "WALK_IN" | "FACEBOOK" | "WHATSAPP";
    contactId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    shippingProvider: string;
    shippingCarrier: string;
    discount: number;
    shippingFeeCharged: number;
    shippingCost: number;
    paymentCurrency: "LAK" | "THB" | "USD";
    paymentMethod: "CASH" | "LAO_QR" | "ON_CREDIT" | "COD" | "BANK_TRANSFER";
    paymentAccountId: string;
    items: Array<{
      productId: string;
      unitId: string;
      qty: number;
    }>;
  };
};

type StoredNewOrderDraft = {
  version: 1;
  savedAt: number;
  payload: NewOrderDraftPayload;
};

const allowedChannels = new Set(["WALK_IN", "FACEBOOK", "WHATSAPP"]);
const allowedPaymentCurrencies = new Set(["LAK", "THB", "USD"]);
const allowedPaymentMethods = new Set(["CASH", "LAO_QR", "ON_CREDIT", "COD", "BANK_TRANSFER"]);
const allowedCheckoutFlows = new Set(["WALK_IN_NOW", "PICKUP_LATER", "ONLINE_DELIVERY"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function parseDraftPayload(value: unknown): NewOrderDraftPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const checkoutFlowRaw = normalizeString(value.checkoutFlow);
  const formRaw = value.form;
  if (!allowedCheckoutFlows.has(checkoutFlowRaw) || !isRecord(formRaw)) {
    return null;
  }

  const channelRaw = normalizeString(formRaw.channel);
  const paymentCurrencyRaw = normalizeString(formRaw.paymentCurrency);
  const paymentMethodRaw = normalizeString(formRaw.paymentMethod);
  const itemsRaw = Array.isArray(formRaw.items) ? formRaw.items : [];

  if (
    !allowedChannels.has(channelRaw) ||
    !allowedPaymentCurrencies.has(paymentCurrencyRaw) ||
    !allowedPaymentMethods.has(paymentMethodRaw)
  ) {
    return null;
  }

  const normalizedItems = itemsRaw
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const productId = normalizeString(item.productId);
      const unitId = normalizeString(item.unitId);
      const qty = normalizeInteger(item.qty);
      if (!productId || !unitId || qty <= 0) {
        return null;
      }
      return { productId, unitId, qty };
    })
    .filter((item): item is { productId: string; unitId: string; qty: number } => item !== null);

  return {
    checkoutFlow: checkoutFlowRaw as NewOrderDraftCheckoutFlow,
    form: {
      channel: channelRaw as "WALK_IN" | "FACEBOOK" | "WHATSAPP",
      contactId: normalizeString(formRaw.contactId),
      customerName: normalizeString(formRaw.customerName),
      customerPhone: normalizeString(formRaw.customerPhone),
      customerAddress: normalizeString(formRaw.customerAddress),
      shippingProvider: normalizeString(formRaw.shippingProvider),
      shippingCarrier: normalizeString(formRaw.shippingCarrier),
      discount: normalizeInteger(formRaw.discount),
      shippingFeeCharged: normalizeInteger(formRaw.shippingFeeCharged),
      shippingCost: normalizeInteger(formRaw.shippingCost),
      paymentCurrency: paymentCurrencyRaw as "LAK" | "THB" | "USD",
      paymentMethod: paymentMethodRaw as
        | "CASH"
        | "LAO_QR"
        | "ON_CREDIT"
        | "COD"
        | "BANK_TRANSFER",
      paymentAccountId: normalizeString(formRaw.paymentAccountId),
      items: normalizedItems,
    },
  };
}

export function setNewOrderDraftFlag(hasDraft: boolean) {
  if (typeof window === "undefined") return;
  if (hasDraft) {
    window.sessionStorage.setItem(NEW_ORDER_DRAFT_STORAGE_KEY, "1");
    return;
  }
  window.sessionStorage.removeItem(NEW_ORDER_DRAFT_STORAGE_KEY);
}

export function hasNewOrderDraftFlag() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(NEW_ORDER_DRAFT_STORAGE_KEY) === "1";
}

export function setNewOrderDraftPayload(payload: NewOrderDraftPayload) {
  if (typeof window === "undefined") return;
  const record: StoredNewOrderDraft = {
    version: 1,
    savedAt: Date.now(),
    payload,
  };
  window.sessionStorage.setItem(NEW_ORDER_DRAFT_PAYLOAD_STORAGE_KEY, JSON.stringify(record));
}

export function clearNewOrderDraftPayload() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(NEW_ORDER_DRAFT_PAYLOAD_STORAGE_KEY);
}

export function clearNewOrderDraftState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(NEW_ORDER_DRAFT_STORAGE_KEY);
  window.sessionStorage.removeItem(NEW_ORDER_DRAFT_PAYLOAD_STORAGE_KEY);
}

export function getNewOrderDraftPayload(options?: {
  maxAgeMs?: number;
}): NewOrderDraftPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(NEW_ORDER_DRAFT_PAYLOAD_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      clearNewOrderDraftPayload();
      return null;
    }

    if (parsed.version !== 1) {
      clearNewOrderDraftPayload();
      return null;
    }

    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : Number(parsed.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0) {
      clearNewOrderDraftPayload();
      return null;
    }

    const maxAgeMs = Math.max(1, options?.maxAgeMs ?? NEW_ORDER_DRAFT_DEFAULT_MAX_AGE_MS);
    if (Date.now() - savedAt > maxAgeMs) {
      clearNewOrderDraftPayload();
      return null;
    }

    const payload = parseDraftPayload(parsed.payload);
    if (!payload) {
      clearNewOrderDraftPayload();
      return null;
    }

    return payload;
  } catch {
    clearNewOrderDraftPayload();
    return null;
  }
}
