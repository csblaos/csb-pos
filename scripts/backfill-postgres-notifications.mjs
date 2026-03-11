import "./load-local-env.mjs";

import { createClient } from "@libsql/client";
import { Sequelize } from "sequelize";

const sourceDatabaseUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const sourceAuthToken = process.env.TURSO_AUTH_TOKEN;
const targetDatabaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();

if (!targetDatabaseUrl) {
  console.error("POSTGRES_DATABASE_URL is not configured");
  process.exit(1);
}

const sanitizeDatabaseUrl = (databaseUrl) => {
  const trimmed = databaseUrl.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslrootcert");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("uselibpqcompat");
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const sslMode = (process.env.POSTGRES_SSL_MODE ?? "require").trim().toLowerCase();
const shouldUseSsl = sslMode !== "disable" && sslMode !== "off" && sslMode !== "false";
const rejectUnauthorized =
  (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "0").trim() === "1";

const source = createClient({
  url: sourceDatabaseUrl,
  authToken: sourceAuthToken,
});

const target = new Sequelize(sanitizeDatabaseUrl(targetDatabaseUrl), {
  dialect: "postgres",
  logging: false,
  dialectOptions: shouldUseSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
};

const run = async () => {
  try {
    await target.authenticate();

    const inboxRows = await source.execute(`
      select
        id,
        store_id,
        topic,
        entity_type,
        entity_id,
        dedupe_key,
        title,
        message,
        severity,
        status,
        due_status,
        due_date,
        payload,
        first_detected_at,
        last_detected_at,
        read_at,
        resolved_at,
        created_at,
        updated_at
      from notification_inbox
      order by store_id asc, dedupe_key asc
    `);

    const ruleRows = await source.execute(`
      select
        id,
        store_id,
        topic,
        entity_type,
        entity_id,
        muted_forever,
        muted_until,
        snoozed_until,
        note,
        updated_by,
        created_at,
        updated_at
      from notification_rules
      order by store_id asc, topic asc, entity_type asc, entity_id asc
    `);

    await target.transaction(async (tx) => {
      for (const row of inboxRows.rows) {
        await target.query(
          `
            insert into notification_inbox (
              id,
              store_id,
              topic,
              entity_type,
              entity_id,
              dedupe_key,
              title,
              message,
              severity,
              status,
              due_status,
              due_date,
              payload,
              first_detected_at,
              last_detected_at,
              read_at,
              resolved_at,
              created_at,
              updated_at
            )
            values (
              :id,
              :storeId,
              :topic,
              :entityType,
              :entityId,
              :dedupeKey,
              :title,
              :message,
              :severity,
              :status,
              :dueStatus,
              :dueDate,
              :payload,
              :firstDetectedAt,
              :lastDetectedAt,
              :readAt,
              :resolvedAt,
              :createdAt,
              :updatedAt
            )
            on conflict (id)
            do update set
              store_id = excluded.store_id,
              topic = excluded.topic,
              entity_type = excluded.entity_type,
              entity_id = excluded.entity_id,
              dedupe_key = excluded.dedupe_key,
              title = excluded.title,
              message = excluded.message,
              severity = excluded.severity,
              status = excluded.status,
              due_status = excluded.due_status,
              due_date = excluded.due_date,
              payload = excluded.payload,
              first_detected_at = excluded.first_detected_at,
              last_detected_at = excluded.last_detected_at,
              read_at = excluded.read_at,
              resolved_at = excluded.resolved_at,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `,
          {
            replacements: {
              id: row.id,
              storeId: row.store_id,
              topic: row.topic,
              entityType: row.entity_type,
              entityId: row.entity_id,
              dedupeKey: row.dedupe_key,
              title: row.title,
              message: row.message,
              severity: row.severity,
              status: row.status,
              dueStatus: row.due_status ?? null,
              dueDate: row.due_date ?? null,
              payload: row.payload ?? "{}",
              firstDetectedAt: row.first_detected_at,
              lastDetectedAt: row.last_detected_at,
              readAt: row.read_at ?? null,
              resolvedAt: row.resolved_at ?? null,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
            transaction: tx,
          },
        );
      }

      for (const row of ruleRows.rows) {
        await target.query(
          `
            insert into notification_rules (
              id,
              store_id,
              topic,
              entity_type,
              entity_id,
              muted_forever,
              muted_until,
              snoozed_until,
              note,
              updated_by,
              created_at,
              updated_at
            )
            values (
              :id,
              :storeId,
              :topic,
              :entityType,
              :entityId,
              :mutedForever,
              :mutedUntil,
              :snoozedUntil,
              :note,
              :updatedBy,
              :createdAt,
              :updatedAt
            )
            on conflict (id)
            do update set
              store_id = excluded.store_id,
              topic = excluded.topic,
              entity_type = excluded.entity_type,
              entity_id = excluded.entity_id,
              muted_forever = excluded.muted_forever,
              muted_until = excluded.muted_until,
              snoozed_until = excluded.snoozed_until,
              note = excluded.note,
              updated_by = excluded.updated_by,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `,
          {
            replacements: {
              id: row.id,
              storeId: row.store_id,
              topic: row.topic,
              entityType: row.entity_type,
              entityId: row.entity_id,
              mutedForever: normalizeBoolean(row.muted_forever),
              mutedUntil: row.muted_until ?? null,
              snoozedUntil: row.snoozed_until ?? null,
              note: row.note ?? null,
              updatedBy: row.updated_by ?? null,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
            transaction: tx,
          },
        );
      }
    });

    console.info(
      `[pg:backfill:notifications] done notification_inbox=${inboxRows.rows.length} notification_rules=${ruleRows.rows.length}`,
    );
  } catch (error) {
    console.error("[pg:backfill:notifications] failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await target.close().catch(() => {});
    source.close();
  }
};

void run();
