import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { idempotencyRequests } from "@/lib/db/schema";

type IdempotencyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type IdempotencyExecutor = typeof db | IdempotencyTx;

const IDEMPOTENCY_KEY_MAX_LEN = 120;

export type IdempotencyClaimResult =
  | { kind: "acquired"; recordId: string }
  | { kind: "replay"; statusCode: number; body: unknown }
  | { kind: "processing" }
  | { kind: "conflict" };

const isUniqueConstraintError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  return /unique|constraint/i.test(error.message);
};

const parseStoredBody = (value: string | null): unknown => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return { message: "cached_response_parse_failed" };
  }
};

export function getIdempotencyKey(request: Request): string | null {
  const raw =
    request.headers.get("idempotency-key") ??
    request.headers.get("x-idempotency-key");

  if (!raw) {
    return null;
  }

  const key = raw.trim();
  if (!key) {
    return null;
  }

  return key.slice(0, IDEMPOTENCY_KEY_MAX_LEN);
}

export function hashRequestBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export async function claimIdempotency(input: {
  storeId: string;
  action: string;
  idempotencyKey: string;
  requestHash: string;
  createdBy?: string | null;
}): Promise<IdempotencyClaimResult> {
  try {
    const [inserted] = await db
      .insert(idempotencyRequests)
      .values({
        storeId: input.storeId,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        status: "PROCESSING",
        createdBy: input.createdBy ?? null,
      })
      .returning({ id: idempotencyRequests.id });

    if (!inserted?.id) {
      throw new Error("claim_idempotency_insert_failed");
    }

    return { kind: "acquired", recordId: inserted.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const [existing] = await db
      .select({
        id: idempotencyRequests.id,
        requestHash: idempotencyRequests.requestHash,
        status: idempotencyRequests.status,
        responseStatus: idempotencyRequests.responseStatus,
        responseBody: idempotencyRequests.responseBody,
      })
      .from(idempotencyRequests)
      .where(
        and(
          eq(idempotencyRequests.storeId, input.storeId),
          eq(idempotencyRequests.action, input.action),
          eq(idempotencyRequests.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (!existing) {
      throw error;
    }

    if (existing.requestHash !== input.requestHash) {
      return { kind: "conflict" };
    }

    if (existing.status === "PROCESSING") {
      return { kind: "processing" };
    }

    if (existing.status === "SUCCEEDED" || existing.status === "FAILED") {
      return {
        kind: "replay",
        statusCode: existing.responseStatus ?? (existing.status === "FAILED" ? 500 : 200),
        body: parseStoredBody(existing.responseBody),
      };
    }

    return { kind: "processing" };
  }
}

export async function markIdempotencySucceeded(input: {
  recordId: string;
  statusCode: number;
  body: unknown;
  tx?: IdempotencyTx;
}) {
  const executor: IdempotencyExecutor = input.tx ?? db;

  await executor
    .update(idempotencyRequests)
    .set({
      status: "SUCCEEDED",
      responseStatus: input.statusCode,
      responseBody: JSON.stringify(input.body),
      completedAt: new Date().toISOString(),
    })
    .where(eq(idempotencyRequests.id, input.recordId));
}

export async function markIdempotencyFailed(input: {
  recordId: string;
  statusCode: number;
  body: unknown;
  tx?: IdempotencyTx;
}) {
  const executor: IdempotencyExecutor = input.tx ?? db;

  await executor
    .update(idempotencyRequests)
    .set({
      status: "FAILED",
      responseStatus: input.statusCode,
      responseBody: JSON.stringify(input.body),
      completedAt: new Date().toISOString(),
    })
    .where(eq(idempotencyRequests.id, input.recordId));
}

export async function safeMarkIdempotencyFailed(input: {
  recordId: string;
  statusCode: number;
  body: unknown;
}) {
  try {
    await markIdempotencyFailed(input);
  } catch (error) {
    console.error(
      `[idempotency] mark failed recordId=${input.recordId}: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
}

const normalizePositiveInt = (value: number | undefined, fallback: number) => {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return fallback;
  }
  return Math.floor(value);
};

const parseDbNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export type IdempotencyCleanupSummary = {
  retentionDays: number;
  staleProcessingMinutes: number;
  staleMarked: number;
  deleted: number;
  remaining: {
    processing: number;
    succeeded: number;
    failed: number;
  };
};

export async function cleanupIdempotencyRequests(input?: {
  retentionDays?: number;
  staleProcessingMinutes?: number;
}): Promise<IdempotencyCleanupSummary> {
  const retentionDays = normalizePositiveInt(input?.retentionDays, 14);
  const staleProcessingMinutes = normalizePositiveInt(
    input?.staleProcessingMinutes,
    15,
  );

  const staleWhere = and(
    eq(idempotencyRequests.status, "PROCESSING"),
    sql`datetime(${idempotencyRequests.createdAt}) <= datetime('now', '-' || ${String(
      staleProcessingMinutes,
    )} || ' minutes')`,
  );

  const deletableWhere = and(
    sql`${idempotencyRequests.status} in ('SUCCEEDED', 'FAILED')`,
    sql`datetime(coalesce(${idempotencyRequests.completedAt}, ${idempotencyRequests.createdAt})) <= datetime('now', '-' || ${String(
      retentionDays,
    )} || ' days')`,
  );

  const [staleRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(idempotencyRequests)
    .where(staleWhere);
  const staleMarked = parseDbNumber(staleRow?.count);

  if (staleMarked > 0) {
    await db
      .update(idempotencyRequests)
      .set({
        status: "FAILED",
        responseStatus: 408,
        responseBody: JSON.stringify({
          message: "idempotency request expired",
        }),
        completedAt: new Date().toISOString(),
      })
      .where(staleWhere);
  }

  const [deletableRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(idempotencyRequests)
    .where(deletableWhere);
  const deleted = parseDbNumber(deletableRow?.count);

  if (deleted > 0) {
    await db.delete(idempotencyRequests).where(deletableWhere);
  }

  const [remainingRow] = await db.select({
    processing: sql<number>`sum(case when ${idempotencyRequests.status} = 'PROCESSING' then 1 else 0 end)`,
    succeeded: sql<number>`sum(case when ${idempotencyRequests.status} = 'SUCCEEDED' then 1 else 0 end)`,
    failed: sql<number>`sum(case when ${idempotencyRequests.status} = 'FAILED' then 1 else 0 end)`,
  }).from(idempotencyRequests);

  return {
    retentionDays,
    staleProcessingMinutes,
    staleMarked,
    deleted,
    remaining: {
      processing: parseDbNumber(remainingRow?.processing),
      succeeded: parseDbNumber(remainingRow?.succeeded),
      failed: parseDbNumber(remainingRow?.failed),
    },
  };
}
