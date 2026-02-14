import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildSessionForUser, getUserMembershipFlags } from "@/lib/auth/session-db";
import { canUserCreateStore } from "@/lib/auth/store-creation";
import {
  createSessionCookie,
  getSession,
  SessionStoreUnavailableError,
} from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  fbConnections,
  rolePermissions,
  roles,
  storeMembers,
  storeBranches,
  stores,
  users,
  waConnections,
} from "@/lib/db/schema";
import {
  defaultPermissionCatalog,
  defaultRoleNames,
  defaultRolePermissions,
  permissionIdFromKey,
  permissionKey,
} from "@/lib/rbac/defaults";
import { ensurePermissionCatalog } from "@/lib/rbac/catalog";
import { isR2Configured, uploadStoreLogoToR2 } from "@/lib/storage/r2";
import { getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";

const storeTypeSchema = z.enum(["ONLINE_RETAIL", "RESTAURANT", "CAFE", "OTHER"]);

const createStoreJsonSchema = z.object({
  storeType: storeTypeSchema,
  storeName: z.string().trim().min(2).max(120),
  logoName: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().min(4).max(300).optional(),
  phoneNumber: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^[0-9+\-\s()]+$/)
    .optional(),
  currency: z.enum(["LAK", "THB", "USD"]).optional(),
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().int().min(0).max(10000).optional(),
});

const createStoreMultipartSchema = z.object({
  storeType: storeTypeSchema,
  storeName: z.string().trim().min(2).max(120),
  logoName: z.string().trim().min(1).max(120),
  address: z.string().trim().min(4).max(300),
  phoneNumber: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^[0-9+\-\s()]+$/),
});

type CreateStoreInput = {
  storeType: z.infer<typeof storeTypeSchema>;
  storeName: string;
  logoName: string | null;
  address: string | null;
  phoneNumber: string | null;
  currency: "LAK" | "THB" | "USD";
  vatEnabled: boolean;
  vatRate: number;
  logoFile: File | null;
};

function normalizeOptionalText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

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

async function parseCreateStoreInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const payload = createStoreMultipartSchema.safeParse({
      storeType: formData.get("storeType"),
      storeName: formData.get("storeName"),
      logoName: formData.get("logoName"),
      address: formData.get("address"),
      phoneNumber: formData.get("phoneNumber"),
    });

    if (!payload.success) {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "ข้อมูลร้านค้าไม่ถูกต้อง" }, { status: 400 }),
      };
    }

    const logoFileValue = formData.get("logoFile");
    const logoFile = isFileLike(logoFileValue) && logoFileValue.size > 0 ? logoFileValue : null;

    return {
      ok: true as const,
      value: {
        storeType: payload.data.storeType,
        storeName: payload.data.storeName,
        logoName: payload.data.logoName,
        address: payload.data.address,
        phoneNumber: payload.data.phoneNumber,
        // ค่าเริ่มต้นตาม requirement: ยังไม่ตั้งค่า currency/vat ใน onboarding
        currency: "LAK" as const,
        vatEnabled: false,
        vatRate: 700,
        logoFile,
      } satisfies CreateStoreInput,
    };
  }

  const raw = await request.json().catch(() => null);
  const payload = createStoreJsonSchema.safeParse(raw);
  if (!payload.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "ข้อมูลร้านค้าไม่ถูกต้อง" }, { status: 400 }),
    };
  }

  return {
    ok: true as const,
    value: {
      storeType: payload.data.storeType,
      storeName: payload.data.storeName,
      logoName: normalizeOptionalText(payload.data.logoName),
      address: normalizeOptionalText(payload.data.address),
      phoneNumber: normalizeOptionalText(payload.data.phoneNumber),
      currency: payload.data.currency ?? "LAK",
      vatEnabled: payload.data.vatEnabled ?? false,
      vatRate: payload.data.vatRate ?? 700,
      logoFile: null,
    } satisfies CreateStoreInput,
  };
}

const createStoreSchema = z.object({
  storeType: z.enum(["ONLINE_RETAIL", "RESTAURANT", "CAFE", "OTHER"]),
  storeName: z.string().trim().min(2).max(120),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const membershipFlags = await getUserMembershipFlags(session.userId);
  if (membershipFlags.hasSuspendedMembership && !membershipFlags.hasActiveMembership) {
    return NextResponse.json(
      { message: "บัญชีของคุณถูกระงับการใช้งาน ไม่สามารถสร้างร้านใหม่ได้" },
      { status: 403 },
    );
  }

  const storeCreationAccess = await canUserCreateStore(session.userId);
  if (!storeCreationAccess.allowed) {
    return NextResponse.json(
      { message: storeCreationAccess.reason ?? "ไม่สามารถสร้างร้านใหม่ได้" },
      { status: 403 },
    );
  }

  const parsedInput = await parseCreateStoreInput(request);
  if (!parsedInput.ok) {
    return parsedInput.response;
  }
  const input = parsedInput.value;

  const payload = createStoreSchema.safeParse({
    storeType: input.storeType,
    storeName: input.storeName,
  });
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลร้านค้าไม่ถูกต้อง" }, { status: 400 });
  }

  const storeId = randomUUID();
  const mainBranchId = randomUUID();
  let logoUrl: string | null = null;
  let warningMessage: string | null = null;
  let configuredLogoMaxSizeMb = 5;

  if (input.logoFile) {
    if (!isR2Configured()) {
      warningMessage = "ยังไม่ได้ตั้งค่า Cloudflare R2 ระบบจะข้ามการอัปโหลดโลโก้ชั่วคราว";
    } else {
      try {
        const storeLogoPolicy = await getGlobalStoreLogoPolicy();
        configuredLogoMaxSizeMb = storeLogoPolicy.maxSizeMb;
        const upload = await uploadStoreLogoToR2({
          storeId,
          logoName: input.logoName ?? input.storeName,
          file: input.logoFile,
          policy: {
            maxSizeBytes: storeLogoPolicy.maxSizeMb * 1024 * 1024,
            autoResize: storeLogoPolicy.autoResize,
            resizeMaxWidth: storeLogoPolicy.resizeMaxWidth,
          },
        });
        logoUrl = upload.url;
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

  const roleIds = Object.fromEntries(
    defaultRoleNames.map((name) => [name, randomUUID()]),
  ) as Record<(typeof defaultRoleNames)[number], string>;

  await ensurePermissionCatalog();

  await db.transaction(async (tx) => {
    await tx.insert(stores).values({
      id: storeId,
      name: payload.data.storeName,
      logoName: input.logoName,
      logoUrl,
      address: input.address,
      phoneNumber: input.phoneNumber,
      storeType: payload.data.storeType,
      currency: input.currency,
      vatEnabled: input.vatEnabled,
      vatRate: input.vatRate,
    });

    await tx.insert(roles).values(
      defaultRoleNames.map((name) => ({
        id: roleIds[name],
        storeId,
        name,
        isSystem: true,
      })),
    );

    await tx.insert(rolePermissions).values(
      defaultRoleNames.flatMap((name) => {
        const rolePermissionSet = defaultRolePermissions[name];
        const keys =
          rolePermissionSet === "ALL"
            ? defaultPermissionCatalog.map((permission) =>
                permissionKey(permission.resource, permission.action),
              )
            : rolePermissionSet;

        return keys.map((key) => ({
          roleId: roleIds[name],
          permissionId: permissionIdFromKey(key),
        }));
      }),
    );

    await tx.insert(storeMembers).values({
      storeId,
      userId: session.userId,
      roleId: roleIds.Owner,
      status: "ACTIVE",
      addedBy: session.userId,
    });

    await tx.insert(storeBranches).values({
      id: mainBranchId,
      storeId,
      name: "สาขาหลัก",
      code: "MAIN",
      address: null,
      sourceBranchId: null,
      sharingMode: "MAIN",
      sharingConfig: null,
    });

    await tx.insert(fbConnections).values({
      id: randomUUID(),
      storeId,
      status: "DISCONNECTED",
      pageName: null,
      pageId: null,
      connectedAt: null,
    });

    await tx.insert(waConnections).values({
      id: randomUUID(),
      storeId,
      status: "DISCONNECTED",
      phoneNumber: null,
      connectedAt: null,
    });
  });

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ message: "ไม่พบข้อมูลผู้ใช้" }, { status: 404 });
  }

  const refreshedSession = await buildSessionForUser(user, {
    preferredStoreId: storeId,
  });

  let sessionCookie;
  try {
    sessionCookie = await createSessionCookie(refreshedSession);
  } catch (error) {
    if (error instanceof SessionStoreUnavailableError) {
      return NextResponse.json(
        { message: "ระบบเซสชันไม่พร้อมใช้งาน กรุณาลองอีกครั้ง" },
        { status: 503 },
      );
    }
    throw error;
  }

  const response = NextResponse.json({
    ok: true,
    token: sessionCookie.value,
    next: "/dashboard",
    warning: warningMessage,
  });

  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );

  return response;
}
