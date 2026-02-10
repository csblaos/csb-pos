import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildSessionForUser } from "@/lib/auth/session-db";
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

const createStoreSchema = z.object({
  storeType: z.enum(["ONLINE_RETAIL", "RESTAURANT", "CAFE", "OTHER"]),
  storeName: z.string().trim().min(2).max(120),
  currency: z.enum(["LAK", "THB", "USD"]),
  vatEnabled: z.boolean(),
  vatRate: z.number().int().min(0).max(10000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  if (session.hasStoreMembership) {
    return NextResponse.json({ ok: true, next: "/onboarding?step=3" });
  }

  const payload = createStoreSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลร้านค้าไม่ถูกต้อง" }, { status: 400 });
  }

  if (payload.data.storeType !== "ONLINE_RETAIL") {
    return NextResponse.json(
      { message: "ประเภทร้านนี้ยังไม่เปิดให้ใช้งาน" },
      { status: 400 },
    );
  }

  const storeId = randomUUID();
  const roleIds = Object.fromEntries(
    defaultRoleNames.map((name) => [name, randomUUID()]),
  ) as Record<(typeof defaultRoleNames)[number], string>;

  await ensurePermissionCatalog();

  await db.transaction(async (tx) => {
    await tx.insert(stores).values({
      id: storeId,
      name: payload.data.storeName,
      storeType: payload.data.storeType,
      currency: payload.data.currency,
      vatEnabled: payload.data.vatEnabled,
      vatRate: payload.data.vatRate,
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

  const refreshedSession = await buildSessionForUser(user);
  const response = NextResponse.json({ ok: true, next: "/onboarding?step=3" });

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

  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );

  return response;
}
