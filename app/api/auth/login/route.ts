import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { buildSessionForUser, getUserMembershipFlags } from "@/lib/auth/session-db";
import { createSessionCookie, SessionStoreUnavailableError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getUserPermissions } from "@/lib/rbac/access";
import { getStorefrontEntryRoute } from "@/lib/storefront/routing";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  newPassword: z.string().min(8).max(128).optional(),
});

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" }, { status: 400 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      systemRole: users.systemRole,
    })
    .from(users)
    .where(eq(users.email, payload.data.email.toLowerCase()))
    .limit(1);

  if (!user) {
    return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
  }

  const isValid = await verifyPassword(payload.data.password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  if (user.mustChangePassword) {
    const nextPassword = payload.data.newPassword?.trim();
    if (!nextPassword) {
      return NextResponse.json({
        ok: false,
        requiresPasswordChange: true,
        email: user.email,
        message: "บัญชีนี้ต้องเปลี่ยนรหัสผ่านก่อนเข้าใช้งาน",
      });
    }

    const isSamePassword = await verifyPassword(nextPassword, user.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { message: "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม" },
        { status: 400 },
      );
    }

    const nextPasswordHash = await hashPassword(nextPassword);
    await db
      .update(users)
      .set({
        passwordHash: nextPasswordHash,
        mustChangePassword: false,
        passwordUpdatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, user.id));
  }

  const membershipFlags = await getUserMembershipFlags(user.id);
  if (membershipFlags.hasSuspendedMembership && !membershipFlags.hasActiveMembership) {
    return NextResponse.json(
      { message: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" },
      { status: 403 },
    );
  }

  const canAccessOnboarding = user.systemRole === "SUPERADMIN";
  const canAccessSystemAdmin = user.systemRole === "SYSTEM_ADMIN";
  if (!membershipFlags.hasActiveMembership && !canAccessOnboarding && !canAccessSystemAdmin) {
    return NextResponse.json(
      {
        message:
          "บัญชีนี้ยังไม่มีร้านที่เปิดใช้งาน และไม่มีสิทธิ์สร้างร้านใหม่ กรุณาติดต่อ SUPERADMIN",
      },
      { status: 403 },
    );
  }

  const session = await buildSessionForUser({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  let sessionCookie;
  try {
    sessionCookie = await createSessionCookie(session);
  } catch (error) {
    if (error instanceof SessionStoreUnavailableError) {
      return NextResponse.json(
        { message: "ระบบเซสชันไม่พร้อมใช้งาน กรุณาลองอีกครั้ง" },
        { status: 503 },
      );
    }
    throw error;
  }

  let nextRoute = "/onboarding";
  if (canAccessSystemAdmin) {
    nextRoute = "/system-admin";
  } else if (session.hasStoreMembership && session.activeStoreId) {
    const permissionKeys = await getUserPermissions(
      { userId: session.userId },
      session.activeStoreId,
    );
    nextRoute = getStorefrontEntryRoute(session.activeStoreType, permissionKeys);
  }

  const response = NextResponse.json({
    ok: true,
    token: sessionCookie.value,
    next: nextRoute,
  });

  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );

  return response;
}
