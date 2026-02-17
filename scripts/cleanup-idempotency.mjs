import { createClient } from "@libsql/client";

const databaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const retentionDays = Number(process.env.IDEMPOTENCY_RETENTION_DAYS ?? 14);
const staleProcessingMinutes = Number(
  process.env.IDEMPOTENCY_STALE_PROCESSING_MINUTES ?? 15,
);

const normalizedRetentionDays =
  Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 14;
const normalizedStaleMinutes =
  Number.isFinite(staleProcessingMinutes) && staleProcessingMinutes > 0
    ? Math.floor(staleProcessingMinutes)
    : 15;

const db = createClient({
  url: databaseUrl,
  authToken,
});

const parseCount = (value) => {
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

const getRowsAffected = (result) =>
  typeof result.rowsAffected === "number" ? result.rowsAffected : 0;

async function hasIdempotencyTable() {
  const result = await db.execute({
    sql: "select 1 as ok from sqlite_master where type = 'table' and name = 'idempotency_requests' limit 1",
    args: [],
  });
  return result.rows.length > 0;
}

async function run() {
  if (!(await hasIdempotencyTable())) {
    console.info("[idempotency:cleanup] skipped because table idempotency_requests does not exist");
    return;
  }

  const staleResult = await db.execute({
    sql: `
      UPDATE idempotency_requests
      SET
        status = 'FAILED',
        response_status = 408,
        response_body = ?,
        completed_at = CURRENT_TIMESTAMP
      WHERE status = 'PROCESSING'
        AND datetime(created_at) <= datetime('now', '-' || ? || ' minutes')
    `,
    args: [
      JSON.stringify({
        message: "idempotency request expired",
      }),
      normalizedStaleMinutes,
    ],
  });

  const deleteResult = await db.execute({
    sql: `
      DELETE FROM idempotency_requests
      WHERE status IN ('SUCCEEDED', 'FAILED')
        AND datetime(coalesce(completed_at, created_at)) <= datetime('now', '-' || ? || ' days')
    `,
    args: [normalizedRetentionDays],
  });

  const [summary] = (
    await db.execute({
      sql: `
        SELECT
          sum(case when status = 'PROCESSING' then 1 else 0 end) as processing_count,
          sum(case when status = 'SUCCEEDED' then 1 else 0 end) as succeeded_count,
          sum(case when status = 'FAILED' then 1 else 0 end) as failed_count
        FROM idempotency_requests
      `,
      args: [],
    })
  ).rows;

  console.info(
    `[idempotency:cleanup] done stale_marked=${getRowsAffected(staleResult)} deleted=${getRowsAffected(
      deleteResult,
    )} remaining(processing=${parseCount(summary?.processing_count)},succeeded=${parseCount(
      summary?.succeeded_count,
    )},failed=${parseCount(summary?.failed_count)}) retention_days=${normalizedRetentionDays} stale_minutes=${normalizedStaleMinutes}`,
  );
}

run().catch((error) => {
  console.error(
    `[idempotency:cleanup] failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
  process.exit(1);
});
