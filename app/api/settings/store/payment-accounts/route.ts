import { and, asc, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { storePaymentAccounts } from "@/lib/db/schema";
import { normalizeLaosBankStorageValue } from "@/lib/payments/laos-banks";
import { paymentAccountTypeValues, type PaymentAccountType } from "@/lib/payments/store-payment";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";
import {
  deletePaymentQrImageFromR2,
  isPaymentQrR2Configured,
  uploadPaymentQrImageToR2,
} from "@/lib/storage/r2";
import { getGlobalPaymentPolicy } from "@/lib/system-config/policy";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const PAYMENT_QR_MAX_SIZE_MB = 4;
const PAYMENT_ACCOUNT_CREATE_ACTION = "store.payment_account.create";
const PAYMENT_ACCOUNT_UPDATE_ACTION = "store.payment_account.update";
const PAYMENT_ACCOUNT_DELETE_ACTION = "store.payment_account.delete";

type PaymentAuditContext = {
  storeId: string;
  userId: string;
  actorName: string | null;
  actorRole: string | null;
};

const createPaymentAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  accountType: z.enum(paymentAccountTypeValues),
  bankName: z.union([z.string(), z.null()]).optional(),
  accountName: z.string().trim().min(1).max(120),
  accountNumber: z.union([z.string(), z.null()]).optional(),
  qrImageUrl: z.union([z.string().url(), z.string().trim().max(500), z.null()]).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  hasQrImageFile: z.boolean().optional(),
});

const updatePaymentAccountSchema = z
  .object({
    id: z.string().trim().min(1),
    displayName: z.string().trim().min(1).max(80).optional(),
    accountType: z.enum(paymentAccountTypeValues).optional(),
    bankName: z.union([z.string(), z.null()]).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
    accountNumber: z.union([z.string(), z.null()]).optional(),
    qrImageUrl: z.union([z.string().url(), z.string().trim().max(500), z.null()]).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    removeQrImage: z.boolean().optional(),
    hasQrImageFile: z.boolean().optional(),
  })
  .refine(
    (payload) =>
      payload.displayName !== undefined ||
      payload.accountType !== undefined ||
      payload.bankName !== undefined ||
      payload.accountName !== undefined ||
      payload.accountNumber !== undefined ||
      payload.qrImageUrl !== undefined ||
      payload.isDefault !== undefined ||
      payload.isActive !== undefined ||
      payload.removeQrImage !== undefined ||
      payload.hasQrImageFile,
    {
      path: ["id"],
      message: "ไม่มีข้อมูลสำหรับอัปเดต",
    },
  );

type ParsedCreatePaymentPayload = {
  displayName: string;
  accountType: PaymentAccountType;
  bankName?: string | null;
  accountName: string;
  accountNumber?: string | null;
  qrImageUrl?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  hasQrImageFile?: boolean;
  qrImageFile: File | null;
};

type ParsedUpdatePaymentPayload = {
  id: string;
  displayName?: string;
  accountType?: PaymentAccountType;
  bankName?: string | null;
  accountName?: string;
  accountNumber?: string | null;
  qrImageUrl?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  removeQrImage?: boolean;
  hasQrImageFile?: boolean;
  qrImageFile: File | null;
};

const normalizeOptionalText = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeBankNameForStorage = (value: string | null | undefined) => {
  const normalized = normalizeLaosBankStorageValue(value);
  if (!normalized) {
    return { value: null, error: null as string | null };
  }

  if (normalized.length > 120) {
    return {
      value: null,
      error: "ชื่อธนาคารต้องไม่เกิน 120 ตัวอักษร",
    };
  }

  return { value: normalized, error: null as string | null };
};

const isHttpUrl = (value: string | null) => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeAccountType = (value: unknown): PaymentAccountType => {
  if (value === "LAO_QR" || value === "PROMPTPAY") {
    return "LAO_QR";
  }
  return "BANK";
};

const validateByType = (params: {
  accountType: PaymentAccountType;
  bankName: string | null;
  accountNumber: string | null;
  qrImageUrl: string | null;
  hasQrImageFile: boolean;
}) => {
  if (!params.bankName) {
    return "กรุณาเลือกธนาคารหรือระบุชื่อธนาคาร";
  }
  if (!params.accountNumber) {
    return "กรุณาระบุเลขบัญชี";
  }
  if (params.accountType === "LAO_QR" && !params.qrImageUrl && !params.hasQrImageFile) {
    return "กรุณาอัปโหลดรูป QR";
  }
  if (params.accountType === "LAO_QR" && params.qrImageUrl && !isHttpUrl(params.qrImageUrl)) {
    return "ลิงก์รูป QR ต้องเป็น http/https";
  }
  return null;
};

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

function parseBooleanField(value: string | undefined) {
  if (value === undefined) {
    return { ok: true as const, value: undefined as boolean | undefined };
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return { ok: true as const, value: true };
  }

  if (normalized === "false") {
    return { ok: true as const, value: false };
  }

  return { ok: false as const };
}

function toSchemaOutdatedResponse() {
  return NextResponse.json(
    { message: "ระบบยังไม่พร้อมสำหรับบัญชี QR กรุณารันฐานข้อมูลล่าสุดก่อน" },
    { status: 409 },
  );
}

function toQrUploadErrorResponse(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNSUPPORTED_FILE_TYPE") {
      return NextResponse.json({ message: "รองรับเฉพาะไฟล์รูปภาพสำหรับ QR" }, { status: 400 });
    }

    if (error.message === "FILE_TOO_LARGE") {
      return NextResponse.json(
        {
          message: `ไฟล์รูป QR ใหญ่เกินกำหนด (ไม่เกิน ${PAYMENT_QR_MAX_SIZE_MB}MB)`,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ message: "อัปโหลดรูป QR ไม่สำเร็จ" }, { status: 500 });
}

function maskAccountNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  return `${"*".repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}

async function parseCreatePayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const parsedIsDefault = parseBooleanField(getFormString(formData, "isDefault"));
    const parsedIsActive = parseBooleanField(getFormString(formData, "isActive"));
    if (!parsedIsDefault.ok || !parsedIsActive.ok) {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "ค่าฟิลด์สถานะไม่ถูกต้อง" }, { status: 400 }),
      };
    }

    const qrImageFileValue = formData.get("qrImageFile");
    const qrImageFile =
      isFileLike(qrImageFileValue) && qrImageFileValue.size > 0 ? qrImageFileValue : null;

    const payload = createPaymentAccountSchema.safeParse({
      displayName: getFormString(formData, "displayName"),
      accountType: getFormString(formData, "accountType"),
      bankName: getFormString(formData, "bankName"),
      accountName: getFormString(formData, "accountName"),
      accountNumber: getFormString(formData, "accountNumber"),
      qrImageUrl: getFormString(formData, "qrImageUrl"),
      isDefault: parsedIsDefault.value,
      isActive: parsedIsActive.value,
      hasQrImageFile: Boolean(qrImageFile),
    });

    if (!payload.success) {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "ข้อมูลบัญชีรับเงินไม่ถูกต้อง" }, { status: 400 }),
      };
    }

    return {
      ok: true as const,
      value: {
        ...payload.data,
        qrImageFile,
      } satisfies ParsedCreatePaymentPayload,
    };
  }

  const raw = await request.json().catch(() => null);
  const payload = createPaymentAccountSchema.safeParse({
    ...(raw ?? {}),
    hasQrImageFile: false,
  });

  if (!payload.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "ข้อมูลบัญชีรับเงินไม่ถูกต้อง" }, { status: 400 }),
    };
  }

  return {
    ok: true as const,
    value: {
      ...payload.data,
      qrImageFile: null,
    } satisfies ParsedCreatePaymentPayload,
  };
}

async function parseUpdatePayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const parsedIsDefault = parseBooleanField(getFormString(formData, "isDefault"));
    const parsedIsActive = parseBooleanField(getFormString(formData, "isActive"));
    const parsedRemoveQrImage = parseBooleanField(getFormString(formData, "removeQrImage"));
    if (!parsedIsDefault.ok || !parsedIsActive.ok || !parsedRemoveQrImage.ok) {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "ค่าฟิลด์สถานะไม่ถูกต้อง" }, { status: 400 }),
      };
    }

    const qrImageFileValue = formData.get("qrImageFile");
    const qrImageFile =
      isFileLike(qrImageFileValue) && qrImageFileValue.size > 0 ? qrImageFileValue : null;

    const payload = updatePaymentAccountSchema.safeParse({
      id: getFormString(formData, "id"),
      displayName: getFormString(formData, "displayName"),
      accountType: getFormString(formData, "accountType"),
      bankName: getFormString(formData, "bankName"),
      accountName: getFormString(formData, "accountName"),
      accountNumber: getFormString(formData, "accountNumber"),
      qrImageUrl: getFormString(formData, "qrImageUrl"),
      isDefault: parsedIsDefault.value,
      isActive: parsedIsActive.value,
      removeQrImage: parsedRemoveQrImage.value,
      hasQrImageFile: Boolean(qrImageFile),
    });

    if (!payload.success) {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "ข้อมูลบัญชีรับเงินไม่ถูกต้อง" }, { status: 400 }),
      };
    }

    return {
      ok: true as const,
      value: {
        ...payload.data,
        qrImageFile,
      } satisfies ParsedUpdatePaymentPayload,
    };
  }

  const raw = await request.json().catch(() => null);
  const payload = updatePaymentAccountSchema.safeParse({
    ...(raw ?? {}),
    hasQrImageFile: false,
  });

  if (!payload.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "ข้อมูลบัญชีรับเงินไม่ถูกต้อง" }, { status: 400 }),
    };
  }

  return {
    ok: true as const,
    value: {
      ...payload.data,
      qrImageFile: null,
    } satisfies ParsedUpdatePaymentPayload,
  };
}

async function listPaymentAccounts(storeId: string) {
  const rows = await db
    .select({
      id: storePaymentAccounts.id,
      displayName: storePaymentAccounts.displayName,
      accountType: storePaymentAccounts.accountType,
      bankName: storePaymentAccounts.bankName,
      accountName: storePaymentAccounts.accountName,
      accountNumber: storePaymentAccounts.accountNumber,
      qrImageUrl: storePaymentAccounts.qrImageUrl,
      promptpayId: storePaymentAccounts.promptpayId,
      isDefault: storePaymentAccounts.isDefault,
      isActive: storePaymentAccounts.isActive,
      createdAt: storePaymentAccounts.createdAt,
      updatedAt: storePaymentAccounts.updatedAt,
    })
    .from(storePaymentAccounts)
    .where(eq(storePaymentAccounts.storeId, storeId))
    .orderBy(
      desc(storePaymentAccounts.isDefault),
      desc(storePaymentAccounts.isActive),
      asc(storePaymentAccounts.createdAt),
    );

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    accountType: normalizeAccountType(row.accountType),
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    qrImageUrl: row.qrImageUrl ?? row.promptpayId ?? null,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async function ensureDefaultAccount(storeId: string) {
  const [existingDefault] = await db
    .select({ id: storePaymentAccounts.id })
    .from(storePaymentAccounts)
    .where(
      and(
        eq(storePaymentAccounts.storeId, storeId),
        eq(storePaymentAccounts.isActive, true),
        eq(storePaymentAccounts.isDefault, true),
      ),
    )
    .limit(1);

  if (existingDefault) {
    return;
  }

  const [fallback] = await db
    .select({ id: storePaymentAccounts.id })
    .from(storePaymentAccounts)
    .where(
      and(eq(storePaymentAccounts.storeId, storeId), eq(storePaymentAccounts.isActive, true)),
    )
    .orderBy(asc(storePaymentAccounts.createdAt))
    .limit(1);

  if (!fallback) {
    return;
  }

  await db
    .update(storePaymentAccounts)
    .set({
      isDefault: true,
      updatedAt: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(storePaymentAccounts.id, fallback.id));
}

export async function GET() {
  try {
    const { storeId } = await enforcePermission("settings.view");
    try {
      const [accounts, policy] = await Promise.all([
        listPaymentAccounts(storeId),
        getGlobalPaymentPolicy(),
      ]);
      return NextResponse.json({ ok: true, accounts, policy });
    } catch {
      return toSchemaOutdatedResponse();
    }
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let auditContext: PaymentAuditContext | null = null;

  try {
    const { storeId, session } = await enforcePermission("stores.update");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };
    const parsedPayload = await parseCreatePayload(request);
    if (!parsedPayload.ok) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: PAYMENT_ACCOUNT_CREATE_ACTION,
        entityType: "store_payment_account",
        entityId: null,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        request,
      });
      return parsedPayload.response;
    }

    const payload = parsedPayload.value;
    const bankNameNormalizedResult = normalizeBankNameForStorage(payload.bankName ?? null);
    if (bankNameNormalizedResult.error) {
      return NextResponse.json({ message: bankNameNormalizedResult.error }, { status: 400 });
    }
    const bankName = bankNameNormalizedResult.value;
    const accountNumber = normalizeOptionalText(payload.accountNumber ?? null);
    const qrImageUrl = normalizeOptionalText(payload.qrImageUrl ?? null);
    const validationError = validateByType({
      accountType: payload.accountType,
      bankName,
      accountNumber,
      qrImageUrl,
      hasQrImageFile: Boolean(payload.qrImageFile),
    });
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    let uploadedQrImageUrl: string | null = null;
    if (payload.accountType === "LAO_QR" && payload.qrImageFile) {
      if (!isPaymentQrR2Configured()) {
        return NextResponse.json(
          { message: "ยังไม่ได้ตั้งค่า Cloudflare R2 สำหรับรูป QR" },
          { status: 409 },
        );
      }

      try {
        const upload = await uploadPaymentQrImageToR2({
          storeId,
          accountLabel: payload.displayName,
          file: payload.qrImageFile,
        });
        uploadedQrImageUrl = upload.url;
      } catch (error) {
        return toQrUploadErrorResponse(error);
      }
    }

    const nextQrImageUrl = payload.accountType === "LAO_QR" ? uploadedQrImageUrl ?? qrImageUrl : null;

    try {
      const [policy, countRows] = await Promise.all([
        getGlobalPaymentPolicy(),
        db
          .select({ value: sql<number>`count(*)` })
          .from(storePaymentAccounts)
          .where(eq(storePaymentAccounts.storeId, storeId)),
      ]);

      const currentCount = Number(countRows[0]?.value ?? 0);
      if (currentCount >= policy.maxAccountsPerStore) {
        if (uploadedQrImageUrl) {
          try {
            await deletePaymentQrImageFromR2({ qrImageUrl: uploadedQrImageUrl });
          } catch {
            // ignore cleanup error
          }
        }

        return NextResponse.json(
          { message: `ร้านนี้มีบัญชีรับเงินครบเพดานแล้ว (${policy.maxAccountsPerStore} บัญชี)` },
          { status: 409 },
        );
      }

      const nextIsActive = payload.isActive ?? true;
      let nextIsDefault = payload.isDefault ?? false;
      if (currentCount === 0 && nextIsActive) {
        nextIsDefault = true;
      }

      if (nextIsDefault && !nextIsActive) {
        if (uploadedQrImageUrl) {
          try {
            await deletePaymentQrImageFromR2({ qrImageUrl: uploadedQrImageUrl });
          } catch {
            // ignore cleanup error
          }
        }

        return NextResponse.json(
          { message: "ไม่สามารถตั้งเป็นบัญชีหลักพร้อมกับปิดการใช้งานได้" },
          { status: 400 },
        );
      }

      if (nextIsDefault) {
        await db
          .update(storePaymentAccounts)
          .set({ isDefault: false, updatedAt: sql`(CURRENT_TIMESTAMP)` })
          .where(eq(storePaymentAccounts.storeId, storeId));
      }

      await db.insert(storePaymentAccounts).values({
        storeId,
        displayName: payload.displayName.trim(),
        accountType: payload.accountType,
        bankName,
        accountName: payload.accountName.trim(),
        accountNumber,
        qrImageUrl: nextQrImageUrl,
        promptpayId: null,
        isDefault: nextIsDefault,
        isActive: nextIsActive,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      });

      await ensureDefaultAccount(storeId);
      const accounts = await listPaymentAccounts(storeId);
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: PAYMENT_ACCOUNT_CREATE_ACTION,
        entityType: "store_payment_account",
        metadata: {
          displayName: payload.displayName.trim(),
          accountType: payload.accountType,
          bankName,
          accountName: payload.accountName.trim(),
          accountNumberMasked: maskAccountNumber(accountNumber),
          isDefault: nextIsDefault,
          isActive: nextIsActive,
          hasQrImage: Boolean(nextQrImageUrl),
        },
        after: {
          displayName: payload.displayName.trim(),
          accountType: payload.accountType,
          bankName,
          accountName: payload.accountName.trim(),
          accountNumberMasked: maskAccountNumber(accountNumber),
          isDefault: nextIsDefault,
          isActive: nextIsActive,
          hasQrImage: Boolean(nextQrImageUrl),
        },
        request,
      });

      return NextResponse.json({ ok: true, accounts, policy });
    } catch (error) {
      if (uploadedQrImageUrl) {
        try {
          await deletePaymentQrImageFromR2({ qrImageUrl: uploadedQrImageUrl });
        } catch {
          // ignore cleanup error
        }
      }

      if (auditContext) {
        await safeLogAuditEvent({
          scope: "STORE",
          storeId: auditContext.storeId,
          actorUserId: auditContext.userId,
          actorName: auditContext.actorName,
          actorRole: auditContext.actorRole,
          action: PAYMENT_ACCOUNT_CREATE_ACTION,
          entityType: "store_payment_account",
          entityId: null,
          result: "FAIL",
          reasonCode: "INTERNAL_ERROR",
          metadata: {
            message: error instanceof Error ? error.message : "unknown",
          },
          request,
        });
      }

      return toSchemaOutdatedResponse();
    }
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: PAYMENT_ACCOUNT_CREATE_ACTION,
        entityType: "store_payment_account",
        entityId: null,
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let auditContext: PaymentAuditContext | null = null;

  try {
    const { storeId, session } = await enforcePermission("stores.update");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };
    const parsedPayload = await parseUpdatePayload(request);
    if (!parsedPayload.ok) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: PAYMENT_ACCOUNT_UPDATE_ACTION,
        entityType: "store_payment_account",
        entityId: null,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        request,
      });
      return parsedPayload.response;
    }

    const payload = parsedPayload.value;
    let uploadedQrImageUrl: string | null = null;
    let didPersistUpdate = false;

    try {
      const [target] = await db
        .select({
          id: storePaymentAccounts.id,
          accountType: storePaymentAccounts.accountType,
          displayName: storePaymentAccounts.displayName,
          bankName: storePaymentAccounts.bankName,
          accountName: storePaymentAccounts.accountName,
          accountNumber: storePaymentAccounts.accountNumber,
          qrImageUrl: storePaymentAccounts.qrImageUrl,
          promptpayId: storePaymentAccounts.promptpayId,
          isDefault: storePaymentAccounts.isDefault,
          isActive: storePaymentAccounts.isActive,
        })
        .from(storePaymentAccounts)
        .where(
          and(
            eq(storePaymentAccounts.id, payload.id),
            eq(storePaymentAccounts.storeId, storeId),
          ),
        )
        .limit(1);

      if (!target) {
        await safeLogAuditEvent({
          scope: "STORE",
          storeId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action: PAYMENT_ACCOUNT_UPDATE_ACTION,
          entityType: "store_payment_account",
          entityId: payload.id,
          result: "FAIL",
          reasonCode: "NOT_FOUND",
          request,
        });
        return NextResponse.json({ message: "ไม่พบบัญชีรับเงินที่ต้องการแก้ไข" }, { status: 404 });
      }

      const previousQrImageUrl = target.qrImageUrl ?? target.promptpayId ?? null;
      const nextAccountType = payload.accountType ?? normalizeAccountType(target.accountType);
      let nextBankName = target.bankName;
      if (payload.bankName !== undefined) {
        const bankNameNormalizedResult = normalizeBankNameForStorage(payload.bankName);
        if (bankNameNormalizedResult.error) {
          return NextResponse.json({ message: bankNameNormalizedResult.error }, { status: 400 });
        }
        nextBankName = bankNameNormalizedResult.value;
      }
      const nextAccountName = payload.accountName?.trim() ?? target.accountName;
      const nextAccountNumber =
        payload.accountNumber !== undefined
          ? normalizeOptionalText(payload.accountNumber)
          : target.accountNumber;

      let nextQrImageUrl =
        payload.qrImageUrl !== undefined
          ? normalizeOptionalText(payload.qrImageUrl)
          : previousQrImageUrl;

      if (payload.removeQrImage) {
        nextQrImageUrl = null;
      }

      if (nextAccountType === "LAO_QR" && payload.qrImageFile) {
        if (!isPaymentQrR2Configured()) {
          return NextResponse.json(
            { message: "ยังไม่ได้ตั้งค่า Cloudflare R2 สำหรับรูป QR" },
            { status: 409 },
          );
        }

        try {
          const upload = await uploadPaymentQrImageToR2({
            storeId,
            accountLabel: payload.displayName?.trim() || target.displayName,
            file: payload.qrImageFile,
          });
          uploadedQrImageUrl = upload.url;
          nextQrImageUrl = uploadedQrImageUrl;
        } catch (error) {
          return toQrUploadErrorResponse(error);
        }
      }

      if (nextAccountType !== "LAO_QR") {
        nextQrImageUrl = null;
      }

      const validationError = validateByType({
        accountType: nextAccountType,
        bankName: nextBankName,
        accountNumber: nextAccountNumber,
        qrImageUrl: nextQrImageUrl,
        hasQrImageFile: false,
      });
      if (validationError) {
        if (uploadedQrImageUrl) {
          try {
            await deletePaymentQrImageFromR2({ qrImageUrl: uploadedQrImageUrl });
          } catch {
            // ignore cleanup error
          }
        }

        return NextResponse.json({ message: validationError }, { status: 400 });
      }

      const nextIsActive = payload.isActive ?? target.isActive;
      const nextIsDefault = payload.isDefault ?? target.isDefault;

      if (nextIsDefault && !nextIsActive) {
        if (uploadedQrImageUrl) {
          try {
            await deletePaymentQrImageFromR2({ qrImageUrl: uploadedQrImageUrl });
          } catch {
            // ignore cleanup error
          }
        }

        return NextResponse.json(
          { message: "ไม่สามารถตั้งเป็นบัญชีหลักพร้อมกับปิดการใช้งานได้" },
          { status: 400 },
        );
      }

      if (nextIsDefault) {
        await db
          .update(storePaymentAccounts)
          .set({ isDefault: false, updatedAt: sql`(CURRENT_TIMESTAMP)` })
          .where(eq(storePaymentAccounts.storeId, storeId));
      }

      await db
        .update(storePaymentAccounts)
        .set({
          displayName: payload.displayName?.trim() ?? target.displayName,
          accountType: nextAccountType,
          bankName: nextBankName,
          accountName: nextAccountName,
          accountNumber: nextAccountNumber,
          qrImageUrl: nextQrImageUrl,
          promptpayId: null,
          isDefault: nextIsDefault,
          isActive: nextIsActive,
          updatedAt: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(storePaymentAccounts.id, target.id));
      didPersistUpdate = true;

      if (previousQrImageUrl && previousQrImageUrl !== nextQrImageUrl) {
        try {
          await deletePaymentQrImageFromR2({ qrImageUrl: previousQrImageUrl });
        } catch {
          // ignore cleanup error
        }
      }

      await ensureDefaultAccount(storeId);
      const [accounts, policy] = await Promise.all([
        listPaymentAccounts(storeId),
        getGlobalPaymentPolicy(),
      ]);

      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: PAYMENT_ACCOUNT_UPDATE_ACTION,
        entityType: "store_payment_account",
        entityId: target.id,
        before: {
          id: target.id,
          displayName: target.displayName,
          accountType: normalizeAccountType(target.accountType),
          bankName: target.bankName,
          accountName: target.accountName,
          accountNumberMasked: maskAccountNumber(target.accountNumber),
          qrImageUrl: target.qrImageUrl ?? target.promptpayId ?? null,
          isDefault: target.isDefault,
          isActive: target.isActive,
        },
        after: {
          id: target.id,
          displayName: payload.displayName?.trim() ?? target.displayName,
          accountType: nextAccountType,
          bankName: nextBankName,
          accountName: nextAccountName,
          accountNumberMasked: maskAccountNumber(nextAccountNumber),
          qrImageUrl: nextQrImageUrl,
          isDefault: nextIsDefault,
          isActive: nextIsActive,
        },
        request,
      });
      return NextResponse.json({ ok: true, accounts, policy });
    } catch (error) {
      if (uploadedQrImageUrl && !didPersistUpdate) {
        try {
          await deletePaymentQrImageFromR2({ qrImageUrl: uploadedQrImageUrl });
        } catch {
          // ignore cleanup error
        }
      }

      if (auditContext) {
        await safeLogAuditEvent({
          scope: "STORE",
          storeId: auditContext.storeId,
          actorUserId: auditContext.userId,
          actorName: auditContext.actorName,
          actorRole: auditContext.actorRole,
          action: PAYMENT_ACCOUNT_UPDATE_ACTION,
          entityType: "store_payment_account",
          entityId: payload.id,
          result: "FAIL",
          reasonCode: "INTERNAL_ERROR",
          metadata: {
            message: error instanceof Error ? error.message : "unknown",
          },
          request,
        });
      }

      return toSchemaOutdatedResponse();
    }
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: PAYMENT_ACCOUNT_UPDATE_ACTION,
        entityType: "store_payment_account",
        entityId: null,
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toRBACErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  let auditContext: PaymentAuditContext | null = null;

  try {
    const { storeId, session } = await enforcePermission("stores.update");
    auditContext = {
      storeId,
      userId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
    };
    const url = new URL(request.url);
    const accountId = url.searchParams.get("id")?.trim() ?? "";
    if (!accountId) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: PAYMENT_ACCOUNT_DELETE_ACTION,
        entityType: "store_payment_account",
        entityId: null,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        request,
      });
      return NextResponse.json({ message: "ไม่พบรหัสบัญชีรับเงิน" }, { status: 400 });
    }

    const [target] = await db
      .select({
        id: storePaymentAccounts.id,
        qrImageUrl: storePaymentAccounts.qrImageUrl,
        promptpayId: storePaymentAccounts.promptpayId,
      })
      .from(storePaymentAccounts)
      .where(
        and(eq(storePaymentAccounts.id, accountId), eq(storePaymentAccounts.storeId, storeId)),
      )
      .limit(1);

    if (!target) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: PAYMENT_ACCOUNT_DELETE_ACTION,
        entityType: "store_payment_account",
        entityId: accountId,
        result: "FAIL",
        reasonCode: "NOT_FOUND",
        request,
      });
      return NextResponse.json({ message: "ไม่พบบัญชีรับเงินที่ต้องการลบ" }, { status: 404 });
    }

    const targetQrImageUrl = target.qrImageUrl ?? target.promptpayId ?? null;

    await db.delete(storePaymentAccounts).where(eq(storePaymentAccounts.id, target.id));
    await ensureDefaultAccount(storeId);

    if (targetQrImageUrl) {
      try {
        await deletePaymentQrImageFromR2({ qrImageUrl: targetQrImageUrl });
      } catch {
        // ignore cleanup error
      }
    }

    await safeLogAuditEvent({
      scope: "STORE",
      storeId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action: PAYMENT_ACCOUNT_DELETE_ACTION,
      entityType: "store_payment_account",
      entityId: target.id,
      before: {
        id: target.id,
        qrImageUrl: targetQrImageUrl,
      },
      after: {
        id: target.id,
        deleted: true,
      },
      request,
    });

    try {
      const [accounts, policy] = await Promise.all([
        listPaymentAccounts(storeId),
        getGlobalPaymentPolicy(),
      ]);
      return NextResponse.json({ ok: true, accounts, policy });
    } catch {
      return toSchemaOutdatedResponse();
    }
  } catch (error) {
    if (auditContext) {
      await safeLogAuditEvent({
        scope: "STORE",
        storeId: auditContext.storeId,
        actorUserId: auditContext.userId,
        actorName: auditContext.actorName,
        actorRole: auditContext.actorRole,
        action: PAYMENT_ACCOUNT_DELETE_ACTION,
        entityType: "store_payment_account",
        entityId: null,
        result: "FAIL",
        reasonCode: "INTERNAL_ERROR",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        request,
      });
    }
    return toRBACErrorResponse(error);
  }
}
