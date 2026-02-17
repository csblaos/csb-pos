import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import {
  parseStoreCurrency,
  parseStoreVatMode,
  parseSupportedCurrencies,
  serializeSupportedCurrencies,
  storeCurrencyValues,
  storeVatModeValues,
} from "@/lib/finance/store-financial";
import { formatLaosAddress, getDistrictById, getProvinceById } from "@/lib/location/laos-address";
import { RBACError, enforcePermission, hasPermission, toRBACErrorResponse } from "@/lib/rbac/access";
import { getStoreFinancialConfig } from "@/lib/stores/financial";
import { deleteStoreLogoFromR2, isR2Configured, uploadStoreLogoToR2 } from "@/lib/storage/r2";
import { getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const phoneNumberPattern = /^[0-9+\-\s()]+$/;
const STORE_SETTINGS_UPDATE_ACTION = "store.settings.update";

type StoreSettingsAuditContext = {
  storeId: string;
  userId: string;
  actorName: string | null;
  actorRole: string | null;
};

const updateStoreJsonSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.union([z.string(), z.null()]).optional(),
    phoneNumber: z.union([z.string(), z.null()]).optional(),
    currency: z.enum(storeCurrencyValues).optional(),
    supportedCurrencies: z.array(z.enum(storeCurrencyValues)).min(1).max(3).optional(),
    vatEnabled: z.boolean().optional(),
    vatRate: z.number().int().min(0).max(10000).optional(),
    vatMode: z.enum(storeVatModeValues).optional(),
    outStockThreshold: z.number().int().min(0).max(100000).optional(),
    lowStockThreshold: z.number().int().min(0).max(100000).optional(),
  })
  .refine(
    (payload) =>
      payload.name !== undefined ||
      payload.address !== undefined ||
      payload.phoneNumber !== undefined ||
      payload.currency !== undefined ||
      payload.supportedCurrencies !== undefined ||
      payload.vatEnabled !== undefined ||
      payload.vatRate !== undefined ||
      payload.vatMode !== undefined ||
      payload.outStockThreshold !== undefined ||
      payload.lowStockThreshold !== undefined,
    {
      message: "ไม่มีข้อมูลสำหรับอัปเดต",
      path: ["address"],
    },
  )
  .superRefine((payload, ctx) => {
    if (
      payload.outStockThreshold !== undefined &&
      payload.lowStockThreshold !== undefined &&
      payload.lowStockThreshold < payload.outStockThreshold
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lowStockThreshold"],
        message: "ค่าสต็อกต่ำต้องมากกว่าหรือเท่ากับค่าสต็อกหมด",
      });
    }
  });

const updateStoreMultipartSchema = z.object({
  name: z.string().trim().min(2).max(120),
  provinceId: z.coerce.number().int().positive(),
  districtId: z.coerce.number().int().positive(),
  village: z.string().trim().min(1).max(120),
  addressDetail: z.string().trim().max(160).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  logoName: z.string().trim().min(1).max(120).optional(),
});

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    size?: unknown;
    type?: unknown;
    arrayBuffer?: unknown;
  };

  return (
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function buildVillageDetail(village: string, addressDetail: string) {
  const normalizedVillage = village.trim();
  const normalizedAddressDetail = addressDetail.trim();
  if (!normalizedAddressDetail) {
    return normalizedVillage;
  }

  return `${normalizedVillage} | ${normalizedAddressDetail}`;
}

function validatePhoneNumber(phoneNumber: string | null) {
  if (!phoneNumber) {
    return null;
  }

  if (
    phoneNumber.length < 6 ||
    phoneNumber.length > 20 ||
    !phoneNumberPattern.test(phoneNumber)
  ) {
    return "รูปแบบเบอร์โทรไม่ถูกต้อง";
  }

  return null;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function appendWarningMessage(current: string | null, next: string) {
  if (!current) {
    return next;
  }

  return `${current} ${next}`;
}

async function patchByMultipartForm(
  storeId: string,
  request: Request,
  auditContext: StoreSettingsAuditContext,
) {
  const formData = await request.formData();
  const payload = updateStoreMultipartSchema.safeParse({
    name: getFormString(formData, "name"),
    provinceId: getFormString(formData, "provinceId"),
    districtId: getFormString(formData, "districtId"),
    village: getFormString(formData, "village"),
    addressDetail: getFormString(formData, "addressDetail"),
    phoneNumber: getFormString(formData, "phoneNumber"),
    logoName: getFormString(formData, "logoName"),
  });

  if (!payload.success) {
    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: auditContext.userId,
      actorName: auditContext.actorName,
      actorRole: auditContext.actorRole,
      action: STORE_SETTINGS_UPDATE_ACTION,
      entityType: "store",
      entityId: storeId,
      result: "FAIL",
      reasonCode: "VALIDATION_ERROR",
      metadata: {
        channel: "multipart",
        issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
      },
      request,
    });
    return NextResponse.json({ message: "ข้อมูลร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const province = getProvinceById(payload.data.provinceId);
  if (!province) {
    return NextResponse.json({ message: "Province ไม่ถูกต้อง" }, { status: 400 });
  }

  const district = getDistrictById(payload.data.districtId);
  if (!district || district.provinceId !== payload.data.provinceId) {
    return NextResponse.json({ message: "District ไม่ถูกต้องสำหรับ Province ที่เลือก" }, { status: 400 });
  }

  const normalizedPhoneNumber = normalizeOptionalText(payload.data.phoneNumber);
  const phoneError = validatePhoneNumber(normalizedPhoneNumber);
  if (phoneError) {
    return NextResponse.json({ message: phoneError }, { status: 400 });
  }

  const formattedAddress = formatLaosAddress({
    provinceId: payload.data.provinceId,
    districtId: payload.data.districtId,
    detail: buildVillageDetail(payload.data.village, payload.data.addressDetail ?? ""),
  });

  if (!formattedAddress || formattedAddress.length > 300) {
    return NextResponse.json({ message: "ข้อมูลที่อยู่ร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const [targetStore] = await db
    .select({
      id: stores.id,
      name: stores.name,
      address: stores.address,
      phoneNumber: stores.phoneNumber,
      logoName: stores.logoName,
      logoUrl: stores.logoUrl,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (!targetStore) {
    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: auditContext.userId,
      actorName: auditContext.actorName,
      actorRole: auditContext.actorRole,
      action: STORE_SETTINGS_UPDATE_ACTION,
      entityType: "store",
      entityId: storeId,
      result: "FAIL",
      reasonCode: "NOT_FOUND",
      metadata: {
        channel: "multipart",
      },
      request,
    });
    return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
  }

  let nextLogoName = targetStore.logoName;
  let nextLogoUrl = targetStore.logoUrl;
  let warningMessage: string | null = null;
  let configuredLogoMaxSizeMb = 5;
  const logoFileValue = formData.get("logoFile");
  const logoFile = isFileLike(logoFileValue) && logoFileValue.size > 0 ? logoFileValue : null;

  if (logoFile) {
    if (!isR2Configured()) {
      warningMessage = "ยังไม่ได้ตั้งค่า Cloudflare R2 ระบบจึงยังไม่อัปเดตโลโก้";
    } else {
      try {
        const storeLogoPolicy = await getGlobalStoreLogoPolicy();
        configuredLogoMaxSizeMb = storeLogoPolicy.maxSizeMb;
        const upload = await uploadStoreLogoToR2({
          storeId,
          logoName: payload.data.logoName ?? payload.data.name,
          file: logoFile,
          policy: {
            maxSizeBytes: storeLogoPolicy.maxSizeMb * 1024 * 1024,
            autoResize: storeLogoPolicy.autoResize,
            resizeMaxWidth: storeLogoPolicy.resizeMaxWidth,
          },
        });

        nextLogoName = payload.data.logoName ?? payload.data.name;
        nextLogoUrl = upload.url;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "UNSUPPORTED_FILE_TYPE") {
            return NextResponse.json(
              { message: "รองรับเฉพาะไฟล์รูปภาพสำหรับโลโก้ร้าน" },
              { status: 400 },
            );
          }

          if (error.message === "FILE_TOO_LARGE") {
            return NextResponse.json(
              {
                message: `ไฟล์โลโก้ใหญ่เกินกำหนด (ไม่เกิน ${configuredLogoMaxSizeMb}MB)`,
              },
              { status: 400 },
            );
          }
        }

        return NextResponse.json({ message: "อัปโหลดโลโก้ไม่สำเร็จ" }, { status: 500 });
      }
    }
  }

  await db
    .update(stores)
    .set({
      name: payload.data.name,
      address: formattedAddress,
      phoneNumber: normalizedPhoneNumber,
      logoName: nextLogoName,
      logoUrl: nextLogoUrl,
    })
    .where(eq(stores.id, storeId));

  if (logoFile && targetStore.logoUrl && nextLogoUrl && targetStore.logoUrl !== nextLogoUrl) {
    try {
      await deleteStoreLogoFromR2({ logoUrl: targetStore.logoUrl });
    } catch {
      warningMessage = appendWarningMessage(
        warningMessage,
        "ลบโลโก้เก่าใน Cloudflare R2 ไม่สำเร็จ กรุณาลบไฟล์เก่าด้วยตนเอง",
      );
    }
  }

  const nextStore = {
    name: payload.data.name,
    address: formattedAddress,
    phoneNumber: normalizedPhoneNumber,
    logoName: nextLogoName,
    logoUrl: nextLogoUrl,
  };

  await safeLogAuditEvent({
    scope: "STORE",
    storeId,
    actorUserId: auditContext.userId,
    actorName: auditContext.actorName,
    actorRole: auditContext.actorRole,
    action: STORE_SETTINGS_UPDATE_ACTION,
    entityType: "store",
    entityId: storeId,
    metadata: {
      channel: "multipart",
      logoUpdated: Boolean(logoFile),
    },
    before: {
      name: targetStore.name,
      address: targetStore.address,
      phoneNumber: targetStore.phoneNumber,
      logoName: targetStore.logoName,
      logoUrl: targetStore.logoUrl,
    },
    after: nextStore,
    request,
  });

  return NextResponse.json({
    ok: true,
    warning: warningMessage,
    store: nextStore,
  });
}

async function patchByJsonBody(
  storeId: string,
  request: Request,
  auditContext: StoreSettingsAuditContext,
) {
  const payload = updateStoreJsonSchema.safeParse(await request.json());
  if (!payload.success) {
    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: auditContext.userId,
      actorName: auditContext.actorName,
      actorRole: auditContext.actorRole,
      action: STORE_SETTINGS_UPDATE_ACTION,
      entityType: "store",
      entityId: storeId,
      result: "FAIL",
      reasonCode: "VALIDATION_ERROR",
      metadata: {
        channel: "json",
        issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
      },
      request,
    });
    return NextResponse.json({ message: "ข้อมูลร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const requiresFinancialUpdate =
    payload.data.currency !== undefined ||
    payload.data.supportedCurrencies !== undefined ||
    payload.data.vatEnabled !== undefined ||
    payload.data.vatRate !== undefined ||
    payload.data.vatMode !== undefined;

  if (requiresFinancialUpdate) {
    const canManageFinancial = await hasPermission({ userId: auditContext.userId }, storeId, "stores.update");
    if (!canManageFinancial) {
      throw new RBACError(403, "คุณไม่มีสิทธิ์อัปเดตการตั้งค่าการเงินของร้าน");
    }
  }

  const updateValues: Partial<typeof stores.$inferInsert> = {};

  if (payload.data.name !== undefined) {
    updateValues.name = payload.data.name.trim();
  }

  if (payload.data.address !== undefined) {
    const normalizedAddress = payload.data.address?.trim() ?? "";
    if (normalizedAddress.length > 300) {
      return NextResponse.json({ message: "ที่อยู่ร้านต้องไม่เกิน 300 ตัวอักษร" }, { status: 400 });
    }
    updateValues.address = normalizedAddress.length > 0 ? normalizedAddress : null;
  }

  let targetStore:
    | {
        id: string;
        name: string;
        address: string | null;
        phoneNumber: string | null;
        logoName: string | null;
        logoUrl: string | null;
        currency: string;
        supportedCurrencies: string;
        vatEnabled: boolean;
        vatRate: number;
        vatMode: string;
        outStockThreshold: number;
        lowStockThreshold: number;
      }
    | null = null;

  try {
    [targetStore] = await db
      .select({
        id: stores.id,
        name: stores.name,
        address: stores.address,
        phoneNumber: stores.phoneNumber,
        logoName: stores.logoName,
        logoUrl: stores.logoUrl,
        currency: stores.currency,
        supportedCurrencies: stores.supportedCurrencies,
        vatEnabled: stores.vatEnabled,
        vatRate: stores.vatRate,
        vatMode: stores.vatMode,
        outStockThreshold: stores.outStockThreshold,
        lowStockThreshold: stores.lowStockThreshold,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
  } catch {
    return NextResponse.json(
      { message: "ระบบยังไม่พร้อมสำหรับการตั้งค่า currency/VAT กรุณารันฐานข้อมูลล่าสุดก่อน" },
      { status: 409 },
    );
  }

  if (!targetStore) {
    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: auditContext.userId,
      actorName: auditContext.actorName,
      actorRole: auditContext.actorRole,
      action: STORE_SETTINGS_UPDATE_ACTION,
      entityType: "store",
      entityId: storeId,
      result: "FAIL",
      reasonCode: "NOT_FOUND",
      metadata: {
        channel: "json",
      },
      request,
    });
    return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
  }

  if (payload.data.phoneNumber !== undefined) {
    const normalizedPhoneNumber = normalizeOptionalText(payload.data.phoneNumber);
    const phoneError = validatePhoneNumber(normalizedPhoneNumber);
    if (phoneError) {
      return NextResponse.json({ message: phoneError }, { status: 400 });
    }
    updateValues.phoneNumber = normalizedPhoneNumber;
  }

  const currentBaseCurrency = parseStoreCurrency(targetStore.currency);
  const nextBaseCurrency =
    payload.data.currency !== undefined
      ? parseStoreCurrency(payload.data.currency, currentBaseCurrency)
      : currentBaseCurrency;
  const nextSupportedCurrencies = parseSupportedCurrencies(
    payload.data.supportedCurrencies ?? targetStore.supportedCurrencies,
    nextBaseCurrency,
  );

  if (
    payload.data.currency !== undefined ||
    payload.data.supportedCurrencies !== undefined
  ) {
    updateValues.currency = nextBaseCurrency;
    updateValues.supportedCurrencies = serializeSupportedCurrencies(nextSupportedCurrencies);
  }

  if (payload.data.vatEnabled !== undefined) {
    updateValues.vatEnabled = payload.data.vatEnabled;
  }

  if (payload.data.vatRate !== undefined) {
    updateValues.vatRate = payload.data.vatRate;
  }

  if (payload.data.vatMode !== undefined) {
    updateValues.vatMode = parseStoreVatMode(payload.data.vatMode);
  }

  if (payload.data.outStockThreshold !== undefined) {
    updateValues.outStockThreshold = payload.data.outStockThreshold;
  }

  if (payload.data.lowStockThreshold !== undefined) {
    updateValues.lowStockThreshold = payload.data.lowStockThreshold;
  }

  await db.update(stores).set(updateValues).where(eq(stores.id, storeId));

  const nextStore = {
    name: updateValues.name ?? targetStore.name,
    address: updateValues.address ?? targetStore.address,
    phoneNumber: updateValues.phoneNumber ?? targetStore.phoneNumber,
    logoName: targetStore.logoName,
    logoUrl: targetStore.logoUrl,
    currency: updateValues.currency ?? currentBaseCurrency,
    supportedCurrencies:
      updateValues.supportedCurrencies !== undefined
        ? nextSupportedCurrencies
        : parseSupportedCurrencies(targetStore.supportedCurrencies, currentBaseCurrency),
    vatEnabled: updateValues.vatEnabled ?? Boolean(targetStore.vatEnabled),
    vatRate: updateValues.vatRate ?? targetStore.vatRate,
    vatMode: updateValues.vatMode ?? parseStoreVatMode(targetStore.vatMode),
    outStockThreshold:
      updateValues.outStockThreshold ?? targetStore.outStockThreshold,
    lowStockThreshold:
      updateValues.lowStockThreshold ?? targetStore.lowStockThreshold,
  };

  await safeLogAuditEvent({
    scope: "STORE",
    storeId,
    actorUserId: auditContext.userId,
    actorName: auditContext.actorName,
    actorRole: auditContext.actorRole,
    action: STORE_SETTINGS_UPDATE_ACTION,
    entityType: "store",
    entityId: storeId,
    metadata: {
      channel: "json",
      fields: Object.keys(updateValues),
    },
    before: {
      name: targetStore.name,
      address: targetStore.address,
      phoneNumber: targetStore.phoneNumber,
      logoName: targetStore.logoName,
      logoUrl: targetStore.logoUrl,
      currency: currentBaseCurrency,
      supportedCurrencies: parseSupportedCurrencies(
        targetStore.supportedCurrencies,
        currentBaseCurrency,
      ),
      vatEnabled: Boolean(targetStore.vatEnabled),
      vatRate: targetStore.vatRate,
      vatMode: parseStoreVatMode(targetStore.vatMode),
      outStockThreshold: targetStore.outStockThreshold,
      lowStockThreshold: targetStore.lowStockThreshold,
    },
    after: nextStore,
    request,
  });

  return NextResponse.json({
    ok: true,
    store: nextStore,
  });
}

export async function GET() {
  try {
    const { storeId } = await enforcePermission("settings.view");
    const financial = await getStoreFinancialConfig(storeId);

    const [store] = await db
      .select({
        id: stores.id,
        name: stores.name,
        logoName: stores.logoName,
        logoUrl: stores.logoUrl,
        address: stores.address,
        phoneNumber: stores.phoneNumber,
        outStockThreshold: stores.outStockThreshold,
        lowStockThreshold: stores.lowStockThreshold,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (!store) {
      return NextResponse.json({ message: "ไม่พบข้อมูลร้านค้า" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      store: {
        ...store,
        currency: financial?.currency ?? "LAK",
        supportedCurrencies: financial?.supportedCurrencies ?? ["LAK"],
        vatEnabled: financial?.vatEnabled ?? false,
        vatRate: financial?.vatRate ?? 700,
        vatMode: financial?.vatMode ?? "EXCLUSIVE",
        outStockThreshold: store.outStockThreshold ?? 0,
        lowStockThreshold: store.lowStockThreshold ?? 10,
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let auditContext: StoreSettingsAuditContext | null = null;

  try {
    const { storeId, session } = await enforcePermission("settings.update");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return patchByMultipartForm(storeId, request, auditContext);
    }

    return patchByJsonBody(storeId, request, auditContext);
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: STORE_SETTINGS_UPDATE_ACTION,
        entityType: "store",
        entityId: auditContext.storeId,
        result: "FAIL",
        reasonCode: error instanceof RBACError ? "FORBIDDEN" : "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toRBACErrorResponse(error);
  }
}
