import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { roles, storeMembers, stores, users } from "@/lib/db/schema";
import { enforcePermission, toRBACErrorResponse } from "@/lib/rbac/access";

export async function GET(request: Request) {
  try {
    const { storeId, session } = await enforcePermission("members.create");

    const [actor] = await db
      .select({ systemRole: users.systemRole })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (actor?.systemRole !== "SUPERADMIN") {
      return NextResponse.json({ ok: true, candidates: [] });
    }

    const ownedStoreRows = await db
      .select({ storeId: storeMembers.storeId })
      .from(storeMembers)
      .innerJoin(roles, eq(storeMembers.roleId, roles.id))
      .where(
        and(
          eq(storeMembers.userId, session.userId),
          eq(storeMembers.status, "ACTIVE"),
          eq(roles.name, "Owner"),
        ),
      );

    const ownedStoreIds = ownedStoreRows.map((row) => row.storeId);
    if (ownedStoreIds.length === 0) {
      return NextResponse.json({ ok: true, candidates: [] });
    }

    const currentStoreMemberRows = await db
      .select({ userId: storeMembers.userId })
      .from(storeMembers)
      .where(eq(storeMembers.storeId, storeId));
    const currentStoreMemberSet = new Set(currentStoreMemberRows.map((row) => row.userId));

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    const candidateRows = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        systemRole: users.systemRole,
        sourceStoreName: stores.name,
      })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .innerJoin(stores, eq(storeMembers.storeId, stores.id))
      .where(
        and(
          inArray(storeMembers.storeId, ownedStoreIds),
          ne(storeMembers.storeId, storeId),
        ),
      )
      .orderBy(asc(users.name));

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
