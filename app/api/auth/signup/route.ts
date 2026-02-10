import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { buildSessionForUser } from "@/lib/auth/session-db";
import { createSessionCookie, SessionStoreUnavailableError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const signupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const payload = signupSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" }, { status: 400 });
  }

  const normalizedEmail = payload.data.email.trim().toLowerCase();

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    return NextResponse.json({ message: "อีเมลนี้ถูกใช้งานแล้ว" }, { status: 409 });
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(payload.data.password);

  await db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    name: payload.data.name,
    passwordHash,
  });

  const session = await buildSessionForUser({
    id: userId,
    email: normalizedEmail,
    name: payload.data.name,
  });

  const response = NextResponse.json({ ok: true, next: "/onboarding" });

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
