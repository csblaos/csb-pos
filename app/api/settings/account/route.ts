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
import { execute, queryOne } from "@/lib/db/query";
import { resolveAppLanguage } from "@/lib/i18n/config";
import { appLanguageValues } from "@/lib/i18n/types";
import { readJsonRouteRequest } from "@/lib/http/route-handler";
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

const updateLanguageSchema = z.object({
  action: z.literal("update_language"),
  language: z.enum(appLanguageValues),
});

const patchAccountSchema = z.discriminatedUnion("action", [
  updateProfileSchema,
  changePasswordSchema,
  updateLanguageSchema,
]);

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const user = await queryOne<{
    id: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
    passwordUpdatedAt: string | null;
    preferredLanguage: string | null;
  }>(
    `
      select
        id,
        name,
        email,
        must_change_password as "mustChangePassword",
        password_updated_at as "passwordUpdatedAt",
        preferred_language as "preferredLanguage"
      from users
      where id = :userId
      limit 1
    `,
    {
      replacements: { userId: session.userId },
    },
  );

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
  let requestContext = {
    requestId: request.headers.get("x-request-id"),
    ipAddress:
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };

  try {
    const requestEnvelope = await readJsonRouteRequest(request);
    requestContext = requestEnvelope.value.requestContext;
    if (!requestEnvelope.ok) {
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
        reasonCode: "INVALID_JSON",
        requestContext,
      });
      return requestEnvelope.response;
    }

    const payload = patchAccountSchema.safeParse(requestEnvelope.value.body);
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
        requestContext,
      });
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    auditAction =
      payload.data.action === "update_profile"
        ? "account.profile.update"
        : payload.data.action === "update_language"
          ? "account.language.update"
          : "account.password.change";

    const user = await queryOne<{
      id: string;
      name: string;
      email: string;
      passwordHash: string;
      preferredLanguage: string | null;
    }>(
      `
        select
          id,
          name,
          email,
          password_hash as "passwordHash",
          preferred_language as "preferredLanguage"
        from users
        where id = :userId
        limit 1
      `,
      {
        replacements: { userId: session.userId },
      },
    );

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
        requestContext,
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
        requestContext,
      });
        return NextResponse.json({
          ok: true,
          user: {
            name: user.name,
            email: user.email,
          },
        });
      }

      await execute(
        `
          update users
          set name = :name
          where id = :userId
        `,
        {
          replacements: {
            name: nextName,
            userId: user.id,
          },
        },
      );

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
        requestContext,
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

    if (payload.data.action === "update_language") {
      const nextLanguage = resolveAppLanguage(payload.data.language);
      const currentLanguage = resolveAppLanguage(user.preferredLanguage);

      if (nextLanguage === currentLanguage) {
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
            preferredLanguage: currentLanguage,
          },
          requestContext,
        });

        return NextResponse.json({
          ok: true,
          user: {
            preferredLanguage: currentLanguage,
          },
        });
      }

      await execute(
        `
          update users
          set preferred_language = :preferredLanguage
          where id = :userId
        `,
        {
          replacements: {
            preferredLanguage: nextLanguage,
            userId: user.id,
          },
        },
      );

      let sessionCookie: Awaited<ReturnType<typeof createSessionCookie>> | null = null;
      let warning: string | null = null;

      try {
        const nextSession = await buildSessionForUser(
          {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          {
            preferredStoreId: session.activeStoreId,
            preferredBranchId: session.activeBranchId,
          },
        );
        sessionCookie = await createSessionCookie(nextSession);
      } catch (error) {
        if (error instanceof SessionStoreUnavailableError) {
          warning = "บันทึกภาษาแล้ว แต่ยังรีเฟรชเซสชันไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง";
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
          preferredLanguage: currentLanguage,
        },
        after: {
          preferredLanguage: nextLanguage,
        },
        requestContext,
      });

      const response = NextResponse.json({
        ok: true,
        warning,
        token: sessionCookie?.value,
        user: {
          preferredLanguage: nextLanguage,
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
        requestContext,
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
        requestContext,
      });
      return NextResponse.json(
        { message: "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม" },
        { status: 400 },
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await execute(
      `
        update users
        set
          password_hash = :passwordHash,
          must_change_password = false,
          password_updated_at = current_timestamp
        where id = :userId
      `,
      {
        replacements: {
          passwordHash: newPasswordHash,
          userId: user.id,
        },
      },
    );

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
      requestContext,
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
      requestContext,
    });
    return NextResponse.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}
