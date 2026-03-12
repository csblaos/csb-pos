import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { execute, queryMany, queryOne } from "@/lib/db/query";
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

    const existing = await queryOne<{ id: string }>(
      `
        select id
        from shipping_providers
        where store_id = :storeId and code = :code
        limit 1
      `,
      {
        replacements: {
          storeId,
          code: candidate,
        },
      },
    );

    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
  }

  return `${baseCode.slice(0, 30)}_${Date.now().toString().slice(-6)}`;
};

export async function GET() {
  try {
    const { storeId } = await enforcePermission("settings.view");
    const rows = await queryMany<{
      id: string;
      code: string;
      displayName: string;
      branchName: string | null;
      aliases: string;
      active: boolean;
      sortOrder: number;
      createdAt: string;
    }>(
      `
        select
          id,
          code,
          display_name as "displayName",
          branch_name as "branchName",
          aliases,
          active,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from shipping_providers
        where store_id = :storeId
        order by sort_order asc, display_name asc, created_at asc
      `,
      {
        replacements: { storeId },
      },
    );

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
    const parsed = createShippingProviderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ให้บริการขนส่งไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = parsed.data;
    const displayName = payload.displayName.trim();
    const branchName = normalizeOptionalText(payload.branchName);
    const aliases = normalizeAliases(payload.aliases);
    const requestedCode = normalizeProviderCode(displayName);

    const code = await resolveUniqueProviderCode(storeId, requestedCode);
    const providerId = randomUUID();

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
          :branchName,
          :aliases,
          :active,
          :sortOrder
        )
      `,
      {
        replacements: {
          id: providerId,
          storeId,
          code,
          displayName,
          branchName,
          aliases: JSON.stringify(aliases),
          active: payload.active ?? true,
          sortOrder: payload.sortOrder ?? 0,
        },
      },
    );

    const created = await queryOne<{
      id: string;
      code: string;
      displayName: string;
      branchName: string | null;
      aliases: string;
      active: boolean;
      sortOrder: number;
      createdAt: string;
    }>(
      `
        select
          id,
          code,
          display_name as "displayName",
          branch_name as "branchName",
          aliases,
          active,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from shipping_providers
        where id = :id and store_id = :storeId
        limit 1
      `,
      {
        replacements: { id: providerId, storeId },
      },
    );

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
    const parsed = updateShippingProviderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ให้บริการขนส่งไม่ถูกต้อง" }, { status: 400 });
    }

    const payload = parsed.data;
    const target = await queryOne<{ id: string }>(
      `
        select id
        from shipping_providers
        where id = :id and store_id = :storeId
        limit 1
      `,
      {
        replacements: { id: payload.id, storeId },
      },
    );

    if (!target) {
      return NextResponse.json({ message: "ไม่พบผู้ให้บริการขนส่งที่ต้องการแก้ไข" }, { status: 404 });
    }

    const nextValues: Record<string, unknown> = {};
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

    if (payload.displayName !== undefined) {
      nextValues.code = await resolveUniqueProviderCode(
        storeId,
        normalizeProviderCode(payload.displayName.trim()),
        payload.id,
      );
    }

    const assignments = Object.keys(nextValues)
      .map((key) => {
        const columnMap: Record<string, string> = {
          code: "code",
          displayName: "display_name",
          branchName: "branch_name",
          aliases: "aliases",
          sortOrder: "sort_order",
          active: "active",
        };
        return `${columnMap[key]} = :${key}`;
      })
      .join(", ");

    await execute(
      `
        update shipping_providers
        set ${assignments}
        where id = :id and store_id = :storeId
      `,
      {
        replacements: {
          ...nextValues,
          id: payload.id,
          storeId,
        },
      },
    );

    const updated = await queryOne<{
      id: string;
      code: string;
      displayName: string;
      branchName: string | null;
      aliases: string;
      active: boolean;
      sortOrder: number;
      createdAt: string;
    }>(
      `
        select
          id,
          code,
          display_name as "displayName",
          branch_name as "branchName",
          aliases,
          active,
          sort_order as "sortOrder",
          created_at as "createdAt"
        from shipping_providers
        where id = :id and store_id = :storeId
        limit 1
      `,
      {
        replacements: { id: payload.id, storeId },
      },
    );

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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ message: "กรุณาระบุผู้ให้บริการที่ต้องการลบ" }, { status: 400 });
    }

    const target = await queryOne<{ id: string }>(
      `
        select id
        from shipping_providers
        where id = :id and store_id = :storeId
        limit 1
      `,
      {
        replacements: { id, storeId },
      },
    );

    if (!target) {
      return NextResponse.json({ message: "ไม่พบผู้ให้บริการขนส่งที่ต้องการลบ" }, { status: 404 });
    }

    await execute(
      `
        delete from shipping_providers
        where id = :id and store_id = :storeId
      `,
      {
        replacements: { id, storeId },
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
