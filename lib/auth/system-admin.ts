import "server-only";

import { getSession } from "@/lib/auth/session";
import { getUserSystemRoleFromPostgres } from "@/lib/platform/postgres-auth-rbac";

export type SystemRole = "USER" | "SUPERADMIN" | "SYSTEM_ADMIN";

export class SystemAdminAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getUserSystemRole(userId: string): Promise<SystemRole> {
  const postgresRole = await getUserSystemRoleFromPostgres(userId);
  if (postgresRole !== undefined) {
    return postgresRole;
  }
  throw new Error("POSTGRES_AUTH_RBAC_READ_ENABLED is required for getUserSystemRole");
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
