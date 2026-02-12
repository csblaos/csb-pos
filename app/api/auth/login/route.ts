import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { buildSessionForUser, getUserMembershipFlags } from "@/lib/auth/session-db";
import { createSessionCookie, SessionStoreUnavailableError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getUserPermissions } from "@/lib/rbac/access";
import { getPreferredAuthorizedRoute } from "@/lib/rbac/navigation";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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

  const membershipFlags = await getUserMembershipFlags(user.id);
  if (membershipFlags.hasSuspendedMembership && !membershipFlags.hasActiveMembership) {
    return NextResponse.json(
      { message: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" },
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
  if (user.systemRole === "SYSTEM_ADMIN") {
    nextRoute = "/system-admin";
  } else if (session.hasStoreMembership && session.activeStoreId) {
    const permissionKeys = await getUserPermissions(
      { userId: session.userId },
      session.activeStoreId,
    );
    nextRoute = getPreferredAuthorizedRoute(permissionKeys) ?? "/dashboard";
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
