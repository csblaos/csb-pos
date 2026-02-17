import "server-only";

import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";

type AuditScope = "STORE" | "SYSTEM";
type AuditResult = "SUCCESS" | "FAIL";

export type AuditEventInput = {
  scope: AuditScope;
  storeId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  result?: AuditResult;
  reasonCode?: string | null;
  request?: Request | null;
  requestId?: string | null;
  metadata?: unknown;
  before?: unknown;
  after?: unknown;
  occurredAt?: string;
};

const asJsonText = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const getIpAddress = (request?: Request | null) => {
  if (!request) {
    return null;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
};

const getRequestId = (request?: Request | null) => {
  if (!request) {
    return null;
  }

  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    null
  );
};

export function buildAuditEventValues(input: AuditEventInput) {
  return {
    scope: input.scope,
    storeId: input.storeId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    result: input.result ?? "SUCCESS",
    reasonCode: input.reasonCode ?? null,
    ipAddress: getIpAddress(input.request),
    userAgent: input.request?.headers.get("user-agent") ?? null,
    requestId: input.requestId ?? getRequestId(input.request),
    metadata: asJsonText(input.metadata),
    before: asJsonText(input.before),
    after: asJsonText(input.after),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

export async function logAuditEvent(input: AuditEventInput) {
  await db.insert(auditEvents).values(buildAuditEventValues(input));
}

export async function safeLogAuditEvent(input: AuditEventInput) {
  try {
    await logAuditEvent(input);
  } catch (error) {
    console.error(
      `[audit] write failed action=${input.action} entity=${input.entityType}: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
}
