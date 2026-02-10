import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { buildSessionForUser } from "@/lib/auth/session-db";
import { createSessionCookie, SessionStoreUnavailableError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

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

  const session = await buildSessionForUser({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const response = NextResponse.json({
    ok: true,
    next: session.hasStoreMembership ? "/dashboard" : "/onboarding",
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

  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );

  return response;
}
