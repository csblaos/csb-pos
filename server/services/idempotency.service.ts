import "server-only";

import { createHash } from "node:crypto";

import { execute, queryOne } from "@/lib/db/query";
import type { PostgresTransaction } from "@/lib/db/sequelize";
import type { HeaderReader } from "@/lib/http/request-context";

export type IdempotencyTx = PostgresTransaction;

const IDEMPOTENCY_KEY_MAX_LEN = 120;

export type IdempotencyClaimResult =
  | { kind: "acquired"; recordId: string }
  | { kind: "replay"; statusCode: number; body: unknown }
  | { kind: "processing" }
  | { kind: "conflict" };

type IdempotencyStoredRow = {
  id: string;
  requestHash: string;
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  responseStatus: number | null;
  responseBody: string | null;
};

const queryOptions = (transaction?: IdempotencyTx) =>
  transaction
    ? {
        transaction,
      }
    : {};

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

export function getIdempotencyKeyFromHeaders(headers: HeaderReader): string | null {
  const raw =
    headers.get("idempotency-key") ??
    headers.get("x-idempotency-key");

  if (!raw) {
    return null;
  }

  const key = raw.trim();
  if (!key) {
    return null;
  }

  return key.slice(0, IDEMPOTENCY_KEY_MAX_LEN);
}

export function getIdempotencyKey(request: Request): string | null {
  return getIdempotencyKeyFromHeaders(request.headers);
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
  const inserted = await queryOne<{ id: string }>(
    `
      insert into idempotency_requests (
        id,
        store_id,
        action,
        idempotency_key,
        request_hash,
        status,
        created_by
      )
      values (
        gen_random_uuid(),
        :storeId,
        :action,
        :idempotencyKey,
        :requestHash,
        'PROCESSING',
        :createdBy
      )
      on conflict (store_id, action, idempotency_key) do nothing
      returning id
    `,
    {
      replacements: {
        storeId: input.storeId,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        createdBy: input.createdBy ?? null,
      },
    },
  );

  if (inserted?.id) {
    return { kind: "acquired", recordId: inserted.id };
  }

  const existing = await queryOne<IdempotencyStoredRow>(
    `
      select
        id as "id",
        request_hash as "requestHash",
        status as "status",
        response_status as "responseStatus",
        response_body as "responseBody"
      from idempotency_requests
      where store_id = :storeId
        and action = :action
        and idempotency_key = :idempotencyKey
      limit 1
    `,
    {
      replacements: {
        storeId: input.storeId,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
      },
    },
  );

  if (!existing) {
    throw new Error("claim_idempotency_lookup_failed");
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

export async function markIdempotencySucceeded(input: {
  recordId: string;
  statusCode: number;
  body: unknown;
  tx?: IdempotencyTx;
}) {
  await execute(
    `
      update idempotency_requests
      set
        status = 'SUCCEEDED',
        response_status = :statusCode,
        response_body = :responseBody,
        completed_at = :completedAt
      where id = :recordId
    `,
    {
      ...queryOptions(input.tx),
      replacements: {
        recordId: input.recordId,
        statusCode: input.statusCode,
        responseBody: JSON.stringify(input.body),
        completedAt: new Date().toISOString(),
      },
    },
  );
}

export async function markIdempotencyFailed(input: {
  recordId: string;
  statusCode: number;
  body: unknown;
  tx?: IdempotencyTx;
}) {
  await execute(
    `
      update idempotency_requests
      set
        status = 'FAILED',
        response_status = :statusCode,
        response_body = :responseBody,
        completed_at = :completedAt
      where id = :recordId
    `,
    {
      ...queryOptions(input.tx),
      replacements: {
        recordId: input.recordId,
        statusCode: input.statusCode,
        responseBody: JSON.stringify(input.body),
        completedAt: new Date().toISOString(),
      },
    },
  );
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

  const staleRow = await queryOne<{ count: number | string | null }>(
    `
      select count(*) as "count"
      from idempotency_requests
      where status = 'PROCESSING'
        and created_at <= now() - (:staleProcessingMinutes || ' minutes')::interval
    `,
    {
      replacements: { staleProcessingMinutes: String(staleProcessingMinutes) },
    },
  );
  const staleMarked = parseDbNumber(staleRow?.count);

  if (staleMarked > 0) {
    await execute(
      `
        update idempotency_requests
        set
          status = 'FAILED',
          response_status = 408,
          response_body = :responseBody,
          completed_at = :completedAt
        where status = 'PROCESSING'
          and created_at <= now() - (:staleProcessingMinutes || ' minutes')::interval
      `,
      {
        replacements: {
          staleProcessingMinutes: String(staleProcessingMinutes),
          responseBody: JSON.stringify({
            message: "idempotency request expired",
          }),
          completedAt: new Date().toISOString(),
        },
      },
    );
  }

  const deletableRow = await queryOne<{ count: number | string | null }>(
    `
      select count(*) as "count"
      from idempotency_requests
      where status in ('SUCCEEDED', 'FAILED')
        and coalesce(completed_at, created_at) <= now() - (:retentionDays || ' days')::interval
    `,
    {
      replacements: { retentionDays: String(retentionDays) },
    },
  );
  const deleted = parseDbNumber(deletableRow?.count);

  if (deleted > 0) {
    await execute(
      `
        delete from idempotency_requests
        where status in ('SUCCEEDED', 'FAILED')
          and coalesce(completed_at, created_at) <= now() - (:retentionDays || ' days')::interval
      `,
      {
        replacements: { retentionDays: String(retentionDays) },
      },
    );
  }

  const remainingRow = await queryOne<{
    processing: number | string | null;
    succeeded: number | string | null;
    failed: number | string | null;
  }>(
    `
      select
        sum(case when status = 'PROCESSING' then 1 else 0 end) as "processing",
        sum(case when status = 'SUCCEEDED' then 1 else 0 end) as "succeeded",
        sum(case when status = 'FAILED' then 1 else 0 end) as "failed"
      from idempotency_requests
    `,
  );

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
