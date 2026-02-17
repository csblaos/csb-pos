import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  clearSessionCookie,
  createSessionCookie,
  getSession,
  invalidateUserSessions,
  SessionStoreUnavailableError,
} from "@/lib/auth/session";
import { buildSessionForUser } from "@/lib/auth/session-db";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { safeLogAuditEvent } from "@/server/services/audit.service";

const updateProfileSchema = z.object({
  action: z.literal("update_profile"),
  name: z.string().trim().min(2).max(120),
});

const changePasswordSchema = z.object({
  action: z.literal("change_password"),
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

const patchAccountSchema = z.discriminatedUnion("action", [
  updateProfileSchema,
  changePasswordSchema,
]);

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      passwordUpdatedAt: users.passwordUpdatedAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    user,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const auditScope = session.activeStoreId ? "STORE" : "SYSTEM";
  const auditStoreId = session.activeStoreId ?? null;
  let auditAction = "account.settings.update";

  try {
    const payload = patchAccountSchema.safeParse(await request.json());
    if (!payload.success) {
      await safeLogAuditEvent({
        scope: auditScope,
        storeId: auditStoreId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user_account",
        entityId: session.userId,
        result: "FAIL",
        reasonCode: "VALIDATION_ERROR",
        metadata: {
          issues: payload.error.issues.map((issue) => issue.path.join(".")).slice(0, 5),
        },
        request,
      });
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    auditAction =
      payload.data.action === "update_profile"
        ? "account.profile.update"
        : "account.password.change";

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      await safeLogAuditEvent({
        scope: auditScope,
        storeId: auditStoreId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user_account",
        entityId: session.userId,
        result: "FAIL",
        reasonCode: "NOT_FOUND",
        request,
      });
      return NextResponse.json({ message: "ไม่พบบัญชีผู้ใช้" }, { status: 404 });
    }

    if (payload.data.action === "update_profile") {
      const nextName = payload.data.name.trim();

      if (nextName === user.name.trim()) {
        await safeLogAuditEvent({
          scope: auditScope,
          storeId: auditStoreId,
          actorUserId: session.userId,
          actorName: session.displayName,
          actorRole: session.activeRoleName,
          action: auditAction,
          entityType: "user_account",
          entityId: user.id,
          metadata: {
            noChange: true,
          },
          request,
        });
        return NextResponse.json({
          ok: true,
          user: {
            name: user.name,
            email: user.email,
          },
        });
      }

      await db
        .update(users)
        .set({ name: nextName })
        .where(eq(users.id, user.id));

      let sessionCookie: Awaited<ReturnType<typeof createSessionCookie>> | null = null;
      let warning: string | null = null;

      try {
        const nextSession = await buildSessionForUser(
          {
            id: user.id,
            email: user.email,
            name: nextName,
          },
          {
            preferredStoreId: session.activeStoreId,
            preferredBranchId: session.activeBranchId,
          },
        );
        sessionCookie = await createSessionCookie(nextSession);
      } catch (error) {
        if (error instanceof SessionStoreUnavailableError) {
          warning = "บันทึกชื่อแล้ว แต่ยังรีเฟรชเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
        } else {
          throw error;
        }
      }

      await safeLogAuditEvent({
        scope: auditScope,
        storeId: auditStoreId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user_account",
        entityId: user.id,
        metadata: {
          sessionRefreshWarning: Boolean(warning),
        },
        before: {
          name: user.name,
        },
        after: {
          name: nextName,
        },
        request,
      });

      const response = NextResponse.json({
        ok: true,
        warning,
        token: sessionCookie?.value,
        user: {
          name: nextName,
          email: user.email,
        },
      });

      if (sessionCookie) {
        response.cookies.set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.options,
        );
      }

      return response;
    }

    const currentPassword = payload.data.currentPassword.trim();
    const newPassword = payload.data.newPassword.trim();

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      await safeLogAuditEvent({
        scope: auditScope,
        storeId: auditStoreId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user_account",
        entityId: user.id,
        result: "FAIL",
        reasonCode: "BUSINESS_RULE",
        metadata: {
          message: "invalid_current_password",
        },
        request,
      });
      return NextResponse.json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 400 });
    }

    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      await safeLogAuditEvent({
        scope: auditScope,
        storeId: auditStoreId,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        action: auditAction,
        entityType: "user_account",
        entityId: user.id,
        result: "FAIL",
        reasonCode: "BUSINESS_RULE",
        metadata: {
          message: "new_password_same_as_old",
        },
        request,
      });
      return NextResponse.json(
        { message: "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม" },
        { status: 400 },
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        passwordUpdatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, user.id));

    const invalidated = await invalidateUserSessions(user.id);
    await safeLogAuditEvent({
      scope: auditScope,
      storeId: auditStoreId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action: auditAction,
      entityType: "user_account",
      entityId: user.id,
      metadata: {
        sessionsInvalidated: invalidated,
      },
      request,
    });

    const response = NextResponse.json({
      ok: true,
      requireRelogin: true,
      warning: invalidated
        ? null
        : "เปลี่ยนรหัสผ่านสำเร็จแล้ว แต่ระบบนี้ไม่รองรับการบังคับออกจากทุกอุปกรณ์",
      message: "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่",
    });

    const clearedCookie = clearSessionCookie();
    response.cookies.set(clearedCookie.name, clearedCookie.value, clearedCookie.options);
    return response;
  } catch (error) {
    await safeLogAuditEvent({
      scope: auditScope,
      storeId: auditStoreId,
      actorUserId: session.userId,
      actorName: session.displayName,
      actorRole: session.activeRoleName,
      action: auditAction,
      entityType: "user_account",
      entityId: session.userId,
      result: "FAIL",
      reasonCode: "INTERNAL_ERROR",
      metadata: {
        message: error instanceof Error ? error.message : "unknown",
      },
      request,
    });
    return NextResponse.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}
