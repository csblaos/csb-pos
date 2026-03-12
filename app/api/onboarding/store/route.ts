import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { buildSessionForUser, getUserMembershipFlags } from "@/lib/auth/session-db";
import { canUserCreateStore } from "@/lib/auth/store-creation";
import {
  createSessionCookie,
  getSession,
  SessionStoreUnavailableError,
} from "@/lib/auth/session";
import { execute, queryOne } from "@/lib/db/query";
import { runInTransaction } from "@/lib/db/transaction";
import {
  defaultPermissionCatalog,
  defaultRoleNames,
  defaultRolePermissions,
  permissionIdFromKey,
  permissionKey,
} from "@/lib/rbac/defaults";
import { ensurePermissionCatalog } from "@/lib/rbac/catalog";
import { isR2Configured, uploadStoreLogoToR2 } from "@/lib/storage/r2";
import { DEFAULT_SHIPPING_PROVIDER_SEEDS } from "@/lib/shipping/provider-master";
import { getGlobalStoreLogoPolicy } from "@/lib/system-config/policy";
import {
  defaultStoreVatMode,
  parseSupportedCurrencies,
  parseStoreCurrency,
  parseStoreVatMode,
  storeCurrencyValues,
  storeVatModeValues,
  type StoreCurrency,
  type StoreVatMode,
} from "@/lib/finance/store-financial";

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
  currency: z.enum(storeCurrencyValues).optional(),
  supportedCurrencies: z.array(z.enum(storeCurrencyValues)).min(1).max(3).optional(),
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().int().min(0).max(10000).optional(),
  vatMode: z.enum(storeVatModeValues).optional(),
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
  currency: StoreCurrency;
  supportedCurrencies: StoreCurrency[];
  vatEnabled: boolean;
  vatRate: number;
  vatMode: StoreVatMode;
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
        supportedCurrencies: ["LAK"],
        vatEnabled: false,
        vatRate: 700,
        vatMode: "EXCLUSIVE",
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
      currency: parseStoreCurrency(payload.data.currency),
      supportedCurrencies: parseSupportedCurrencies(
        payload.data.supportedCurrencies,
        parseStoreCurrency(payload.data.currency),
      ),
      vatEnabled: payload.data.vatEnabled ?? false,
      vatRate: payload.data.vatRate ?? 700,
      vatMode: parseStoreVatMode(payload.data.vatMode, defaultStoreVatMode),
      logoFile: null,
    } satisfies CreateStoreInput,
  };
}

const createStoreSchema = z.object({
  storeType: z.enum(["ONLINE_RETAIL", "RESTAURANT", "CAFE", "OTHER"]),
  storeName: z.string().trim().min(2).max(120),
});

function buildDefaultRolePermissionRows(roleIds: Record<(typeof defaultRoleNames)[number], string>) {
  return defaultRoleNames.flatMap((name) => {
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
  });
}

async function createStoreInPostgres(input: {
  storeId: string;
  mainBranchId: string;
  ownerUserId: string;
  storeName: string;
  storeType: z.infer<typeof storeTypeSchema>;
  logoName: string | null;
  logoUrl: string | null;
  address: string | null;
  phoneNumber: string | null;
  currency: StoreCurrency;
  supportedCurrencies: StoreCurrency[];
  vatEnabled: boolean;
  vatRate: number;
  vatMode: StoreVatMode;
  roleIds: Record<(typeof defaultRoleNames)[number], string>;
}) {
  const rolePermissionRows = buildDefaultRolePermissionRows(input.roleIds);

  await runInTransaction(async (tx) => {
    await execute(
      `
        insert into stores (
          id,
          name,
          logo_name,
          logo_url,
          address,
          phone_number,
          store_type,
          currency,
          supported_currencies,
          vat_enabled,
          vat_rate,
          vat_mode
        )
        values (
          :id,
          :name,
          :logoName,
          :logoUrl,
          :address,
          :phoneNumber,
          :storeType,
          :currency,
          :supportedCurrencies,
          :vatEnabled,
          :vatRate,
          :vatMode
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: input.storeId,
          name: input.storeName,
          logoName: input.logoName,
          logoUrl: input.logoUrl,
          address: input.address,
          phoneNumber: input.phoneNumber,
          storeType: input.storeType,
          currency: input.currency,
          supportedCurrencies: JSON.stringify(input.supportedCurrencies),
          vatEnabled: input.vatEnabled,
          vatRate: input.vatRate,
          vatMode: input.vatMode,
        },
      },
    );

    for (const roleName of defaultRoleNames) {
      await execute(
        `
          insert into roles (
            id,
            store_id,
            name,
            is_system
          )
          values (
            :id,
            :storeId,
            :name,
            true
          )
        `,
        {
          transaction: tx,
          replacements: {
            id: input.roleIds[roleName],
            storeId: input.storeId,
            name: roleName,
          },
        },
      );
    }

    for (const row of rolePermissionRows) {
      await execute(
        `
          insert into role_permissions (
            role_id,
            permission_id
          )
          values (
            :roleId,
            :permissionId
          )
        `,
        {
          transaction: tx,
          replacements: row,
        },
      );
    }

    await execute(
      `
        insert into store_members (
          store_id,
          user_id,
          role_id,
          status,
          added_by
        )
        values (
          :storeId,
          :userId,
          :roleId,
          'ACTIVE',
          :addedBy
        )
      `,
      {
        transaction: tx,
        replacements: {
          storeId: input.storeId,
          userId: input.ownerUserId,
          roleId: input.roleIds.Owner,
          addedBy: input.ownerUserId,
        },
      },
    );

    await execute(
      `
        insert into store_branches (
          id,
          store_id,
          name,
          code,
          address,
          source_branch_id,
          sharing_mode,
          sharing_config
        )
        values (
          :id,
          :storeId,
          'สาขาหลัก',
          'MAIN',
          null,
          null,
          'MAIN',
          null
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: input.mainBranchId,
          storeId: input.storeId,
        },
      },
    );

    await execute(
      `
        insert into fb_connections (
          id,
          store_id,
          status,
          page_name,
          page_id,
          connected_at
        )
        values (
          :id,
          :storeId,
          'DISCONNECTED',
          null,
          null,
          null
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: input.storeId,
        },
      },
    );

    await execute(
      `
        insert into wa_connections (
          id,
          store_id,
          status,
          phone_number,
          connected_at
        )
        values (
          :id,
          :storeId,
          'DISCONNECTED',
          null,
          null
        )
      `,
      {
        transaction: tx,
        replacements: {
          id: randomUUID(),
          storeId: input.storeId,
        },
      },
    );

    for (const provider of DEFAULT_SHIPPING_PROVIDER_SEEDS) {
      await execute(
        `
          insert into shipping_providers (
            id,
            store_id,
            code,
            display_name,
            branch_name,
            aliases,
            active,
            sort_order
          )
          values (
            :id,
            :storeId,
            :code,
            :displayName,
            null,
            '[]',
            true,
            :sortOrder
          )
        `,
        {
          transaction: tx,
          replacements: {
            id: randomUUID(),
            storeId: input.storeId,
            code: provider.code,
            displayName: provider.displayName,
            sortOrder: provider.sortOrder,
          },
        },
      );
    }
  });
}

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

  await createStoreInPostgres({
    storeId,
    mainBranchId,
    ownerUserId: session.userId,
    storeName: payload.data.storeName,
    storeType: payload.data.storeType,
    logoName: input.logoName,
    logoUrl,
    address: input.address,
    phoneNumber: input.phoneNumber,
    currency: input.currency,
    supportedCurrencies: input.supportedCurrencies,
    vatEnabled: input.vatEnabled,
    vatRate: input.vatRate,
    vatMode: input.vatMode,
    roleIds,
  });

  const user = await queryOne<{
    id: string;
    email: string;
    name: string;
  }>(
    `
      select
        id,
        email,
        name
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId: session.userId },
    },
  );

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
