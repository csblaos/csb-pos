import { NextResponse } from "next/server";

import { cleanupIdempotencyRequests } from "@/server/services/idempotency.service";

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const getBearerToken = (request: Request) => {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
};

const authorizeCronRequest = (request: Request) => {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    return {
      ok: false as const,
      status: 503,
      message: "CRON_SECRET is not configured",
    };
  }

  const providedSecret =
    getBearerToken(request) ?? request.headers.get("x-cron-secret")?.trim() ?? null;

  if (!providedSecret || providedSecret !== expectedSecret) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized",
    };
  }

  return { ok: true as const };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }

  try {
    const summary = await cleanupIdempotencyRequests({
      retentionDays: parsePositiveInt(process.env.IDEMPOTENCY_RETENTION_DAYS, 14),
      staleProcessingMinutes: parsePositiveInt(
        process.env.IDEMPOTENCY_STALE_PROCESSING_MINUTES,
        15,
      ),
    });

    return NextResponse.json({
      ok: true,
      summary,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "cleanup failed",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
