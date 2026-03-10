import "server-only";

import { eq } from "drizzle-orm";

import { getSession } from "@/lib/auth/session";
import { users } from "@/lib/db/schema";
import {
  getUserSystemRoleFromPostgres,
  logAuthRbacReadFallback,
} from "@/lib/platform/postgres-auth-rbac";

export type SystemRole = "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";

export class SystemAdminAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const getTursoDb = async () => (await import("@/lib/db/client")).db;

export async function getUserSystemRole(userId: string): Promise<SystemRole> {
  try {
    const postgresRole = await getUserSystemRoleFromPostgres(userId);
    if (postgresRole !== undefined) {
      return postgresRole;
    }
  } catch (error) {
    logAuthRbacReadFallback("auth.system-role", error);
  }

  const db = await getTursoDb();
  const [row] = await db
    .select({ systemRole: users.systemRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (
    row?.systemRole === "SUPERADMIN" ||
    row?.systemRole === "SYSTEM_ADMIN" ||
    row?.systemRole === "USER"
  ) {
    return row.systemRole;
  }

  return "USER";
}

export async function getCurrentUserSystemRole() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  return getUserSystemRole(session.userId);
}

export async function enforceSystemAdminSession() {
  const session = await getSession();
  if (!session) {
    throw new SystemAdminAccessError(401, "กรุณาเข้าสู่ระบบ");
  }

  const systemRole = await getUserSystemRole(session.userId);
  if (systemRole !== "SYSTEM_ADMIN") {
    throw new SystemAdminAccessError(403, "เฉพาะผู้ดูแลระบบกลางเท่านั้น");
  }

  return { session, systemRole };
}

export const toSystemAdminErrorResponse = (error: unknown) => {
  if (error instanceof SystemAdminAccessError) {
    return Response.json({ message: error.message }, { status: error.status });
  }

  return Response.json({ message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
};
