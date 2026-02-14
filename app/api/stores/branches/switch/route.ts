import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildSessionForUser, findActiveMembershipByStore } from "@/lib/auth/session-db";
import {
  createSessionCookie,
  getSession,
  SessionStoreUnavailableError,
} from "@/lib/auth/session";
import { canMemberAccessBranch, ensureMainBranchExists } from "@/lib/branches/access";
import { db } from "@/lib/db/client";
import { storeBranches } from "@/lib/db/schema";
import { getUserPermissions } from "@/lib/rbac/access";
import { getStorefrontEntryRoute } from "@/lib/storefront/routing";

const switchBranchSchema = z.object({
  branchId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  if (!session.activeStoreId) {
    return NextResponse.json({ message: "ยังไม่ได้เลือกร้านค้า" }, { status: 400 });
  }

  const payload = switchBranchSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลสาขาไม่ถูกต้อง" }, { status: 400 });
  }

  await ensureMainBranchExists(session.activeStoreId);

  const membership = await findActiveMembershipByStore(session.userId, session.activeStoreId);
  if (!membership) {
    return NextResponse.json(
      { message: "คุณไม่มีสิทธิ์เข้าถึงร้านที่เลือก หรือสมาชิกไม่ได้อยู่สถานะ ACTIVE" },
      { status: 403 },
    );
  }

  const [branch] = await db
    .select({
      id: storeBranches.id,
      name: storeBranches.name,
    })
    .from(storeBranches)
    .where(
      and(
        eq(storeBranches.storeId, session.activeStoreId),
        eq(storeBranches.id, payload.data.branchId),
      ),
    )
    .limit(1);

  if (!branch) {
    return NextResponse.json({ message: "ไม่พบสาขาที่เลือก" }, { status: 404 });
  }

  const canAccess = await canMemberAccessBranch(
    session.userId,
    session.activeStoreId,
    payload.data.branchId,
  );

  if (!canAccess) {
    return NextResponse.json(
      { message: "คุณไม่มีสิทธิ์เข้าถึงสาขาที่เลือก" },
      { status: 403 },
    );
  }

  const refreshedSession = await buildSessionForUser(
    {
      id: session.userId,
      email: session.email,
      name: session.displayName,
    },
    {
      preferredStoreId: session.activeStoreId,
      preferredBranchId: branch.id,
    },
  );

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

  const permissionKeys = await getUserPermissions(
    { userId: session.userId },
    session.activeStoreId,
  );
  const nextRoute = getStorefrontEntryRoute(
    refreshedSession.activeStoreType,
    permissionKeys,
  );

  const response = NextResponse.json({
    ok: true,
    token: sessionCookie.value,
    next: nextRoute,
    activeBranchName: refreshedSession.activeBranchName,
  });
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
  return response;
}
