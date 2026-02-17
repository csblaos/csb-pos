import { randomUUID } from "node:crypto";

import { createClient } from "@libsql/client";

const databaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url: databaseUrl,
  authToken,
});

async function ensureTableExists(tableName) {
  const result = await client.execute({
    sql: "select 1 as ok from sqlite_master where type = 'table' and name = ? limit 1",
    args: [tableName],
  });

  if (result.rows.length === 0) {
    throw new Error(`table_missing:${tableName}`);
  }
}

async function run() {
  await ensureTableExists("stores");
  await ensureTableExists("purchase_orders");
  await ensureTableExists("audit_events");
  await ensureTableExists("idempotency_requests");

  const suffix = `${Date.now()}`;
  const storeId = `smoke_store_${suffix}`;
  const poNumber = `PO-SMOKE-${suffix}`;
  const auditAction = `smoke.tx.rollback.${suffix}`;

  await client.execute({
    sql: "insert into stores (id, name) values (?, ?)",
    args: [storeId, `Smoke ${suffix}`],
  });

  let rollbackTriggered = false;
  try {
    await client.execute("begin");
    await client.execute({
      sql: "insert into purchase_orders (id, store_id, po_number) values (?, ?, ?)",
      args: [randomUUID(), storeId, poNumber],
    });
    await client.execute({
      sql: "insert into audit_events (id, scope, store_id, action, entity_type) values (?, 'STORE', ?, ?, 'purchase_order')",
      args: [randomUUID(), storeId, auditAction],
    });

    // Trigger unique violation on (store_id, po_number) to force rollback.
    await client.execute({
      sql: "insert into purchase_orders (id, store_id, po_number) values (?, ?, ?)",
      args: [randomUUID(), storeId, poNumber],
    });
    await client.execute("commit");
  } catch {
    rollbackTriggered = true;
    try {
      await client.execute("rollback");
    } catch {
      // no-op
    }
  }

  if (!rollbackTriggered) {
    throw new Error("rollback_not_triggered");
  }

  const poCountResult = await client.execute({
    sql: "select count(*) as c from purchase_orders where store_id = ? and po_number = ?",
    args: [storeId, poNumber],
  });
  const auditCountResult = await client.execute({
    sql: "select count(*) as c from audit_events where store_id = ? and action = ?",
    args: [storeId, auditAction],
  });

  const poCount = Number(poCountResult.rows[0]?.c ?? 0);
  const auditCount = Number(auditCountResult.rows[0]?.c ?? 0);

  if (poCount !== 0 || auditCount !== 0) {
    throw new Error(`rollback_assert_failed: po=${poCount} audit=${auditCount}`);
  }

  const idemKey = `smoke-key-${suffix}`;
  const idemHash = `hash-${suffix}`;

  await client.execute({
    sql: `
      insert into idempotency_requests
      (id, store_id, action, idempotency_key, request_hash, status)
      values (?, ?, 'po.create', ?, ?, 'PROCESSING')
    `,
    args: [randomUUID(), storeId, idemKey, idemHash],
  });

  let duplicateBlocked = false;
  try {
    await client.execute({
      sql: `
        insert into idempotency_requests
        (id, store_id, action, idempotency_key, request_hash, status)
        values (?, ?, 'po.create', ?, ?, 'PROCESSING')
      `,
      args: [randomUUID(), storeId, idemKey, idemHash],
    });
  } catch {
    duplicateBlocked = true;
  }

  if (!duplicateBlocked) {
    throw new Error("idempotency_unique_not_enforced");
  }

  await client.execute({
    sql: `
      update idempotency_requests
      set status = 'SUCCEEDED', response_status = 200, response_body = ?, completed_at = CURRENT_TIMESTAMP
      where store_id = ? and action = 'po.create' and idempotency_key = ?
    `,
    args: [JSON.stringify({ ok: true }), storeId, idemKey],
  });

  const replayResult = await client.execute({
    sql: `
      select status, response_status, response_body
      from idempotency_requests
      where store_id = ? and action = 'po.create' and idempotency_key = ?
      limit 1
    `,
    args: [storeId, idemKey],
  });

  const replayRow = replayResult.rows[0];
  if (!replayRow || replayRow.status !== "SUCCEEDED" || Number(replayRow.response_status) !== 200) {
    throw new Error("idempotency_replay_row_invalid");
  }

  await client.execute({
    sql: "delete from stores where id = ?",
    args: [storeId],
  });

  console.info("[smoke] tx rollback + idempotency checks passed");
}

run().catch((error) => {
  console.error(
    `[smoke] failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
  process.exit(1);
});
