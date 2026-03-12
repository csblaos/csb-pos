import { NextResponse } from "next/server";

import { queryMany, queryOne } from "@/lib/db/query";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

export async function GET(request: Request) {
  try {
    const { storeId, session } = await enforcePermission("members.create");

    const actor = await queryOne<{ systemRole: string | null }>(
      `
        select system_role as "systemRole"
        from users
        where id = :userId
        limit 1
      `,
      {
        replacements: { userId: session.userId },
      },
    );

    if (actor?.systemRole !== "SUPERADMIN") {
      return NextResponse.json({ ok: true, candidates: [] });
    }

    const ownedStoreRows = await queryMany<{ storeId: string }>(
      `
        select sm.store_id as "storeId"
        from store_members sm
        inner join roles r on sm.role_id = r.id
        where
          sm.user_id = :userId
          and sm.status = 'ACTIVE'
          and r.name = 'Owner'
      `,
      {
        replacements: { userId: session.userId },
      },
    );

    const ownedStoreIds = ownedStoreRows.map((row) => row.storeId);
    if (ownedStoreIds.length === 0) {
      return NextResponse.json({ ok: true, candidates: [] });
    }

    const currentStoreMemberRows = await queryMany<{ userId: string }>(
      `
        select user_id as "userId"
        from store_members
        where store_id = :storeId
      `,
      {
        replacements: { storeId },
      },
    );
    const currentStoreMemberSet = new Set(currentStoreMemberRows.map((row) => row.userId));

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    const candidateRows = await queryMany<{
      userId: string;
      name: string;
      email: string;
      systemRole: string | null;
      sourceStoreName: string;
    }>(
      `
        select
          u.id as "userId",
          u.name,
          u.email,
          u.system_role as "systemRole",
          s.name as "sourceStoreName"
        from store_members sm
        inner join users u on sm.user_id = u.id
        inner join stores s on sm.store_id = s.id
        where
          sm.store_id in (:ownedStoreIds)
          and sm.store_id <> :storeId
        order by u.name asc
      `,
      {
        replacements: {
          ownedStoreIds,
          storeId,
        },
      },
    );

    const filteredRows =
      q.length > 0
        ? candidateRows.filter((row) => {
            const search = q.toLowerCase();
            return row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search);
          })
        : candidateRows;

    const map = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string;
        sourceStores: string[];
      }
    >();

    for (const row of filteredRows) {
      if (row.systemRole === "SYSTEM_ADMIN") {
        continue;
      }
      if (currentStoreMemberSet.has(row.userId)) {
        continue;
      }

      const existing = map.get(row.userId);
      if (existing) {
        if (!existing.sourceStores.includes(row.sourceStoreName)) {
          existing.sourceStores.push(row.sourceStoreName);
        }
      } else {
        map.set(row.userId, {
          userId: row.userId,
          name: row.name,
          email: row.email,
          sourceStores: [row.sourceStoreName],
        });
      }
    }

    const candidates = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));

    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    return toRBACErrorResponse(error);
  }
}
