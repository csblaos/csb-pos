import "server-only";

import { execute } from "@/lib/db/query";
import {
  buildRequestContext,
  type RequestContext,
} from "@/lib/http/request-context";

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
  requestContext?: RequestContext | null;
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

export function buildAuditEventValues(input: AuditEventInput) {
  const requestContext = input.requestContext ?? buildRequestContext(input.request);

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
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    requestId: input.requestId ?? requestContext.requestId,
    metadata: asJsonText(input.metadata),
    before: asJsonText(input.before),
    after: asJsonText(input.after),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

export async function logAuditEvent(input: AuditEventInput) {
  const values = buildAuditEventValues(input);
  await execute(
    `
      insert into audit_events (
        id,
        scope,
        store_id,
        actor_user_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        result,
        reason_code,
        ip_address,
        user_agent,
        request_id,
        metadata,
        before,
        after,
        occurred_at
      )
      values (
        gen_random_uuid(),
        :scope,
        :storeId,
        :actorUserId,
        :actorName,
        :actorRole,
        :action,
        :entityType,
        :entityId,
        :result,
        :reasonCode,
        :ipAddress,
        :userAgent,
        :requestId,
        cast(:metadata as jsonb),
        cast(:before as jsonb),
        cast(:after as jsonb),
        :occurredAt
      )
    `,
    {
      replacements: values,
    },
  );
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
