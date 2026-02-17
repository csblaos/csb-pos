import "server-only";

import { z } from "zod";

type ShippingProviderMode = "STUB" | "HTTP";

export type CreateShippingLabelByProviderInput = {
  provider: string;
  storeId: string;
  orderId: string;
  orderNo: string;
  status: string;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  forceRegenerate: boolean;
  idempotencyKey: string;
};

export type CreateShippingLabelByProviderResult = {
  provider: string;
  providerRequestId: string;
  trackingNo: string;
  labelUrl: string;
  shippingCarrier: string | null;
  raw: unknown;
};

export class ShippingProviderError extends Error {
  status: number;
  reasonCode: string;

  constructor(status: number, reasonCode: string, message: string) {
    super(message);
    this.status = status;
    this.reasonCode = reasonCode;
  }
}

const httpProviderResponseSchema = z.object({
  provider: z.string().trim().min(1).max(60).optional(),
  providerRequestId: z.string().trim().min(1).max(120).optional(),
  trackingNo: z.string().trim().min(1).max(120),
  labelUrl: z.string().trim().min(1).max(2000),
  shippingCarrier: z.string().trim().max(120).optional().nullable(),
  raw: z.unknown().optional(),
});

const nowEpoch = () => Date.now();

const resolveMode = (): ShippingProviderMode => {
  const raw = process.env.SHIPPING_PROVIDER_MODE?.trim().toUpperCase();
  if (raw === "HTTP") {
    return "HTTP";
  }
  return "STUB";
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const buildStubTrackingNo = (provider: string) => {
  const datePart = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${provider.slice(0, 4)}-${datePart}-${randomPart}`;
};

const buildStubProviderRequestId = (orderId: string, provider: string) =>
  `${provider}-${orderId.slice(0, 8)}-${nowEpoch()}`;

const buildStubLabelUrl = (orderId: string, provider: string, trackingNo: string) =>
  `/orders/${orderId}/print/label?provider=${encodeURIComponent(provider)}&tracking=${encodeURIComponent(trackingNo)}`;

async function createViaStubProvider(
  input: CreateShippingLabelByProviderInput,
): Promise<CreateShippingLabelByProviderResult> {
  const trackingNo = buildStubTrackingNo(input.provider);
  const providerRequestId = buildStubProviderRequestId(input.orderId, input.provider);
  const labelUrl = buildStubLabelUrl(input.orderId, input.provider, trackingNo);

  return {
    provider: input.provider,
    providerRequestId,
    trackingNo,
    labelUrl,
    shippingCarrier: input.provider,
    raw: {
      mode: "STUB",
      generatedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey,
    },
  };
}

const toJsonPayload = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ShippingProviderError(
      502,
      "PROVIDER_BAD_RESPONSE",
      "ผู้ให้บริการขนส่งตอบกลับไม่ใช่ JSON ที่ถูกต้อง",
    );
  }
};

async function createViaHttpProvider(
  input: CreateShippingLabelByProviderInput,
): Promise<CreateShippingLabelByProviderResult> {
  const endpoint = process.env.SHIPPING_PROVIDER_HTTP_ENDPOINT?.trim();
  if (!endpoint) {
    throw new ShippingProviderError(
      500,
      "PROVIDER_CONFIG_MISSING",
      "ยังไม่ได้ตั้งค่า SHIPPING_PROVIDER_HTTP_ENDPOINT",
    );
  }

  const timeoutMs = parsePositiveInt(process.env.SHIPPING_PROVIDER_TIMEOUT_MS, 8000);
  const authToken = process.env.SHIPPING_PROVIDER_HTTP_TOKEN?.trim();
  const authScheme = process.env.SHIPPING_PROVIDER_HTTP_AUTH_SCHEME?.trim() || "Bearer";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `${authScheme} ${authToken}` } : {}),
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        provider: input.provider,
        storeId: input.storeId,
        order: {
          id: input.orderId,
          orderNo: input.orderNo,
          status: input.status,
        },
        recipient: {
          name: input.customerName,
          address: input.customerAddress,
          phone: input.customerPhone,
        },
        forceRegenerate: input.forceRegenerate,
      }),
      signal: controller.signal,
    });

    const payload = await toJsonPayload(response);
    if (!response.ok) {
      throw new ShippingProviderError(
        502,
        "PROVIDER_HTTP_ERROR",
        `ผู้ให้บริการขนส่งตอบกลับไม่สำเร็จ (HTTP ${response.status})`,
      );
    }

    const parsed = httpProviderResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ShippingProviderError(
        502,
        "PROVIDER_BAD_RESPONSE",
        "ข้อมูลตอบกลับจากผู้ให้บริการขนส่งไม่ครบ",
      );
    }

    return {
      provider: parsed.data.provider ?? input.provider,
      providerRequestId:
        parsed.data.providerRequestId ??
        response.headers.get("x-request-id") ??
        buildStubProviderRequestId(input.orderId, input.provider),
      trackingNo: parsed.data.trackingNo,
      labelUrl: parsed.data.labelUrl,
      shippingCarrier: parsed.data.shippingCarrier ?? parsed.data.provider ?? input.provider,
      raw: parsed.data.raw ?? payload,
    };
  } catch (error) {
    if (error instanceof ShippingProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ShippingProviderError(
        504,
        "PROVIDER_TIMEOUT",
        "หมดเวลาเชื่อมต่อผู้ให้บริการขนส่ง",
      );
    }
    throw new ShippingProviderError(
      502,
      "PROVIDER_NETWORK_ERROR",
      "เชื่อมต่อผู้ให้บริการขนส่งไม่สำเร็จ",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function createShippingLabelByProvider(
  input: CreateShippingLabelByProviderInput,
): Promise<CreateShippingLabelByProviderResult> {
  const mode = resolveMode();
  if (mode === "HTTP") {
    return createViaHttpProvider(input);
  }
  return createViaStubProvider(input);
}
