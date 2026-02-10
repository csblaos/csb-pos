#!/usr/bin/env node

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("[bench] missing TURSO_DATABASE_URL or DATABASE_URL");
  process.exit(1);
}

function toMs(value) {
  return `${value.toFixed(1)}ms`;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, item) => sum + item, 0) / values.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  return {
    avg: toMs(avg),
    p50: toMs(p50),
    p90: toMs(p90),
    min: toMs(sorted[0]),
    max: toMs(sorted[sorted.length - 1]),
  };
}

async function benchmark(label, iterations, fn) {
  const times = [];
  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    await fn(i);
    times.push(performance.now() - startedAt);
  }

  console.log(label, summarize(times));
}

async function main() {
  const sharedClient = createClient({ url, authToken });
  const storeRows = await sharedClient.execute("select id from stores limit 1");
  const storeId = storeRows.rows[0]?.id;

  if (!storeId) {
    console.error("[bench] no store found in database");
    process.exit(1);
  }

  console.log(`[bench] store=${String(storeId)}`);

  await benchmark("A) new client + first query", 8, async () => {
    const client = createClient({ url, authToken });
    await client.execute({
      sql: "select status from fb_connections where store_id = ? limit 1",
      args: [storeId],
    });
    client.close();
  });

  await benchmark("B) shared client + single query", 12, async () => {
    await sharedClient.execute({
      sql: "select status from fb_connections where store_id = ? limit 1",
      args: [storeId],
    });
  });

  await benchmark("C) shared client + two sequential queries", 12, async () => {
    await sharedClient.execute({
      sql: "select status from fb_connections where store_id = ? limit 1",
      args: [storeId],
    });
    await sharedClient.execute({
      sql: "select status from wa_connections where store_id = ? limit 1",
      args: [storeId],
    });
  });

  await benchmark("D) shared client + two parallel queries", 12, async () => {
    await Promise.all([
      sharedClient.execute({
        sql: "select status from fb_connections where store_id = ? limit 1",
        args: [storeId],
      }),
      sharedClient.execute({
        sql: "select status from wa_connections where store_id = ? limit 1",
        args: [storeId],
      }),
    ]);
  });

  await benchmark("E) shared client + combined single SQL", 12, async () => {
    await sharedClient.execute({
      sql: `
        select
          coalesce((select status from fb_connections where store_id = ? limit 1), 'DISCONNECTED') as facebook,
          coalesce((select status from wa_connections where store_id = ? limit 1), 'DISCONNECTED') as whatsapp
      `,
      args: [storeId, storeId],
    });
  });

  sharedClient.close();
}

main().catch((error) => {
  console.error("[bench] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
