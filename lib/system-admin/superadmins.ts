import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { roles, storeMembers, users } from "@/lib/db/schema";

export type SuperadminItem = {
  userId: string;
  email: string;
  name: string;
  canCreateStores: boolean;
  maxStores: number | null;
  activeOwnerStoreCount: number;
  createdAt: string;
};

export async function listSuperadmins(): Promise<SuperadminItem[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      canCreateStores: users.canCreateStores,
      maxStores: users.maxStores,
      createdAt: users.createdAt,
      activeOwnerStoreCount: sql<number>`
        coalesce(sum(case
          when ${storeMembers.status} = 'ACTIVE' and ${roles.name} = 'Owner' then 1
          else 0
        end), 0)
      `,
    })
    .from(users)
    .leftJoin(storeMembers, eq(storeMembers.userId, users.id))
    .leftJoin(
      roles,
      and(eq(storeMembers.roleId, roles.id), eq(storeMembers.storeId, roles.storeId)),
    )
    .where(eq(users.systemRole, "SUPERADMIN"))
    .groupBy(
      users.id,
      users.email,
      users.name,
      users.canCreateStores,
      users.maxStores,
      users.createdAt,
    )
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name,
    canCreateStores: row.canCreateStores === true,
    maxStores: typeof row.maxStores === "number" && row.maxStores > 0 ? row.maxStores : null,
    activeOwnerStoreCount: Number(row.activeOwnerStoreCount ?? 0),
    createdAt: row.createdAt,
  }));
}
