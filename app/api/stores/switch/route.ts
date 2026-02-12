import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionCookie, getSession, SessionStoreUnavailableError } from "@/lib/auth/session";
import { findActiveMembershipByStore } from "@/lib/auth/session-db";
import { getUserPermissions } from "@/lib/rbac/access";
import { getStorefrontEntryRoute } from "@/lib/storefront/routing";

const switchStoreSchema = z.object({
  storeId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const payload = switchStoreSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ message: "ข้อมูลร้านไม่ถูกต้อง" }, { status: 400 });
  }

  const membership = await findActiveMembershipByStore(session.userId, payload.data.storeId);
  if (!membership) {
    return NextResponse.json(
      { message: "คุณไม่มีสิทธิ์เข้าถึงร้านที่เลือก หรือสมาชิกไม่ได้อยู่สถานะ ACTIVE" },
      { status: 403 },
    );
  }

  let sessionCookie;
  try {
    sessionCookie = await createSessionCookie({
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      hasStoreMembership: true,
      activeStoreId: membership.storeId,
      activeStoreName: membership.storeName,
      activeStoreType: membership.storeType,
      activeRoleId: membership.roleId,
      activeRoleName: membership.roleName,
    });
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
    membership.storeId,
  );
  const nextRoute = getStorefrontEntryRoute(membership.storeType, permissionKeys);

  const response = NextResponse.json({
    ok: true,
    token: sessionCookie.value,
    next: nextRoute,
    activeStoreName: membership.storeName,
  });
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  return response;
}
