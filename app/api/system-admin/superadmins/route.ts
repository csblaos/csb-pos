import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { enforceSystemAdminSession, toSystemAdminErrorResponse } from "@/lib/auth/system-admin";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { listSuperadmins } from "@/lib/system-admin/superadmins";

const createSuperadminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  canCreateStores: z.boolean().default(true),
  maxStores: z.number().int().min(1).max(100).nullable().default(null),
  canCreateBranches: z.boolean().nullable().default(null),
  maxBranchesPerStore: z.number().int().min(0).max(500).nullable().default(null),
});

export async function GET() {
  try {
    await enforceSystemAdminSession();

    const superadmins = await listSuperadmins();
    return NextResponse.json({ ok: true, superadmins });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session } = await enforceSystemAdminSession();

    const payload = createSuperadminSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ message: "ข้อมูลผู้ดูแลลูกค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const normalizedEmail = payload.data.email.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ message: "อีเมลนี้มีในระบบแล้ว" }, { status: 409 });
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(payload.data.password);

    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: payload.data.name,
      passwordHash,
      createdBy: session.userId,
      systemRole: "SUPERADMIN",
      canCreateStores: payload.data.canCreateStores,
      maxStores: payload.data.canCreateStores ? payload.data.maxStores : null,
      canCreateBranches: payload.data.canCreateBranches,
      maxBranchesPerStore:
        payload.data.canCreateBranches === false ? null : payload.data.maxBranchesPerStore,
    });

    const superadmins = await listSuperadmins();
    return NextResponse.json({ ok: true, superadmins });
  } catch (error) {
    return toSystemAdminErrorResponse(error);
  }
}
