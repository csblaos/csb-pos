import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getTursoDb } from "@/lib/db/turso-lazy";
import { shippingProviders } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

const createShippingProviderSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  branchName: z.string().trim().max(120).optional().or(z.literal("")),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

const updateShippingProviderSchema = z
  .object({
    id: z.string().trim().min(1),
    displayName: z.string().trim().min(1).max(120).optional(),
    branchName: z.string().trim().max(120).optional().or(z.literal("")),
    aliases: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (payload) =>
      payload.displayName !== undefined ||
      payload.branchName !== undefined ||
      payload.aliases !== undefined ||
      payload.sortOrder !== undefined ||
      payload.active !== undefined,
    {
      path: ["id"],
      message: "ไม่มีข้อมูลสำหรับอัปเดต",
    },
  );

const normalizeOptionalText = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeAliases = (aliases: string[] | undefined) => {
  if (!aliases) {
    return [];
  }
  const deduped = new Set<string>();
  for (const alias of aliases) {
    const normalized = alias.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
  }
  return Array.from(deduped);
};

const parseAliases = (raw: string | null | undefined) => {
  if (!raw) {
    return [];
  }
  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) {
      return [];
    }
    return decoded
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
};

const normalizeProviderCode = (displayName: string) => {
  const normalized = displayName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .toUpperCase();

  if (!normalized) {
    return "PROVIDER";
  }
  return normalized.slice(0, 40);
};

const resolveUniqueProviderCode = async (
  storeId: string,
  requestedCode: string,
  excludeId?: string,
) => {
  const db = await getTursoDb();
  const safeCode = requestedCode.trim().toUpperCase() || "PROVIDER";
  const maxCodeLength = 40;
  const baseCode = safeCode.slice(0, maxCodeLength);

  let attempt = 0;
  // hard guard to avoid infinite loop in unexpected cases
  while (attempt < 200) {
    attempt += 1;
    const suffix = attempt === 1 ? "" : `_${attempt}`;
    const trunkMaxLength = maxCodeLength - suffix.length;
    const candidate = `${baseCode.slice(0, Math.max(1, trunkMaxLength))}${suffix}`;

    const [existing] = await db
      .select({ id: shippingProviders.id })
      .from(shippingProviders)
      .where(
        and(
          eq(shippingProviders.storeId, storeId),
          eq(shippingProviders.code, candidate),
        ),
      )
      .limit(1);

    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
  }

  return `${baseCode.slice(0, 30)}_${Date.now().toString().slice(-6)}`;
};

const toSchemaOutdatedResponse = () =>
  NextResponse.json(
    {
      message:
        "ระบบยังไม่พร้อมสำหรับข้อมูลขนส่ง กรุณารันฐานข้อมูลล่าสุด (`npm run db:migrate`) ก่อน",
    },
    { status: 409 },
  );

export async function GET() {
  try {
    const { storeId } = await enforcePermission("settings.view");
    const db = await getTursoDb();

    let rows: Array<{
      id: string;
      code: string;
      displayName: string;
      branchName: string | null;
      aliases: string;
      active: boolean;
      sortOrder: number;
      createdAt: string;
    }> = [];

    try {
      rows = await db
        .select({
          id: shippingProviders.id,
          code: shippingProviders.code,
          displayName: shippingProviders.displayName,
          branchName: shippingProviders.branchName,
          aliases: shippingProviders.aliases,
          active: shippingProviders.active,
          sortOrder: shippingProviders.sortOrder,
          createdAt: shippingProviders.createdAt,
        })
        .from(shippingProviders)
        .where(eq(shippingProviders.storeId, storeId))
        .orderBy(
          asc(shippingProviders.sortOrder),
          asc(shippingProviders.displayName),
          asc(shippingProviders.createdAt),
        );
    } catch {
      return toSchemaOutdatedResponse();
    }

    return NextResponse.json({
      ok: true,
      providers: rows.map((row) => ({
        id: row.id,
        code: row.code,
        displayName: row.displayName,
        branchName: row.branchName,
        aliases: parseAliases(row.aliases),
        active: row.active,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { storeId } = await enforcePermission("stores.update");
    const db = await getTursoDb();
    const parsed = createShippingProviderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ให้บริการขนส่งไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = parsed.data;
    const displayName = payload.displayName.trim();
    const branchName = normalizeOptionalText(payload.branchName);
    const aliases = normalizeAliases(payload.aliases);
    const requestedCode = normalizeProviderCode(displayName);

    let code = "";
    try {
      code = await resolveUniqueProviderCode(storeId, requestedCode);
    } catch {
      return toSchemaOutdatedResponse();
    }
    const providerId = randomUUID();

    try {
      await db.insert(shippingProviders).values({
        id: providerId,
        storeId,
        code,
        displayName,
        branchName,
        aliases: JSON.stringify(aliases),
        active: payload.active ?? true,
        sortOrder: payload.sortOrder ?? 0,
      });
    } catch {
      return toSchemaOutdatedResponse();
    }

    const [created] = await db
      .select({
        id: shippingProviders.id,
        code: shippingProviders.code,
        displayName: shippingProviders.displayName,
        branchName: shippingProviders.branchName,
        aliases: shippingProviders.aliases,
        active: shippingProviders.active,
        sortOrder: shippingProviders.sortOrder,
        createdAt: shippingProviders.createdAt,
      })
      .from(shippingProviders)
      .where(and(eq(shippingProviders.id, providerId), eq(shippingProviders.storeId, storeId)))
      .limit(1);

    return NextResponse.json(
      {
        ok: true,
        provider: created
          ? {
              ...created,
              aliases: parseAliases(created.aliases),
            }
          : {
              id: providerId,
              code,
              displayName,
              branchName,
              aliases,
              active: payload.active ?? true,
              sortOrder: payload.sortOrder ?? 0,
              createdAt: new Date().toISOString(),
            },
      },
      { status: 201 },
    );
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { storeId } = await enforcePermission("stores.update");
    const db = await getTursoDb();
    const parsed = updateShippingProviderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ให้บริการขนส่งไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = parsed.data;
    let target: { id: string } | undefined;
    try {
      [target] = await db
        .select({
          id: shippingProviders.id,
        })
        .from(shippingProviders)
        .where(and(eq(shippingProviders.id, payload.id), eq(shippingProviders.storeId, storeId)))
        .limit(1);
    } catch {
      return toSchemaOutdatedResponse();
    }

    if (!target) {
      return NextResponse.json({ message: "ไม่พบผู้ให้บริการขนส่งที่ต้องการแก้ไข" }, { status: 404 });
    }

    const nextValues: Partial<typeof shippingProviders.$inferInsert> = {};
    if (payload.displayName !== undefined) {
      nextValues.displayName = payload.displayName.trim();
    }
    if (payload.branchName !== undefined) {
      nextValues.branchName = normalizeOptionalText(payload.branchName);
    }
    if (payload.aliases !== undefined) {
      nextValues.aliases = JSON.stringify(normalizeAliases(payload.aliases));
    }
    if (payload.sortOrder !== undefined) {
      nextValues.sortOrder = payload.sortOrder;
    }
    if (payload.active !== undefined) {
      nextValues.active = payload.active;
    }

    try {
      await db
        .update(shippingProviders)
        .set(nextValues)
        .where(and(eq(shippingProviders.id, payload.id), eq(shippingProviders.storeId, storeId)));
    } catch {
      return toSchemaOutdatedResponse();
    }

    const [updated] = await db
      .select({
        id: shippingProviders.id,
        code: shippingProviders.code,
        displayName: shippingProviders.displayName,
        branchName: shippingProviders.branchName,
        aliases: shippingProviders.aliases,
        active: shippingProviders.active,
        sortOrder: shippingProviders.sortOrder,
        createdAt: shippingProviders.createdAt,
      })
      .from(shippingProviders)
      .where(and(eq(shippingProviders.id, payload.id), eq(shippingProviders.storeId, storeId)))
      .limit(1);

    if (!updated) {
      return NextResponse.json({ message: "ไม่พบข้อมูลผู้ให้บริการขนส่งหลังอัปเดต" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      provider: {
        ...updated,
        aliases: parseAliases(updated.aliases),
      },
    });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { storeId } = await enforcePermission("stores.update");
    const db = await getTursoDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ message: "กรุณาระบุผู้ให้บริการที่ต้องการลบ" }, { status: 400 });
    }

    let target: { id: string } | undefined;
    try {
      [target] = await db
        .select({ id: shippingProviders.id })
        .from(shippingProviders)
        .where(and(eq(shippingProviders.id, id), eq(shippingProviders.storeId, storeId)))
        .limit(1);
    } catch {
      return toSchemaOutdatedResponse();
    }

    if (!target) {
      return NextResponse.json({ message: "ไม่พบผู้ให้บริการขนส่งที่ต้องการลบ" }, { status: 404 });
    }

    try {
      await db
        .delete(shippingProviders)
        .where(and(eq(shippingProviders.id, id), eq(shippingProviders.storeId, storeId)));
    } catch {
      return toSchemaOutdatedResponse();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
