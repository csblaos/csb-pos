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

const normalizeScalar = (value) => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return Number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
  return value ?? null;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeValue(value[key]);
        return acc;
      }, {});
  }
  return normalizeScalar(value);
};

const asComparableJson = (value) => JSON.stringify(normalizeValue(value));

const fetchSourceRows = async (sql) => {
  const result = await source.execute(sql);
  return result.rows.map((row) => ({ ...row }));
};

const fetchTargetRows = async (sql) => {
  const [rows] = await target.query(sql);
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
};

const compareRows = async ({ label, sourceSql, targetSql }) => {
  const [sourceRows, targetRows] = await Promise.all([
    fetchSourceRows(sourceSql),
    fetchTargetRows(targetSql),
  ]);

  if (asComparableJson(sourceRows) !== asComparableJson(targetRows)) {
    throw new Error(`parity mismatch ${label}`);
  }

  return sourceRows.length;
};

const run = async () => {
  try {
    await target.authenticate();

    const inboxCount = await compareRows({
      label: "notification_inbox",
      sourceSql: `
        select
          id,
          store_id as "storeId",
          topic,
          entity_type as "entityType",
          entity_id as "entityId",
          dedupe_key as "dedupeKey",
          title,
          message,
          severity,
          status,
          due_status as "dueStatus",
          due_date as "dueDate",
          payload,
          first_detected_at as "firstDetectedAt",
          last_detected_at as "lastDetectedAt",
          read_at as "readAt",
          resolved_at as "resolvedAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from notification_inbox
        order by store_id asc, dedupe_key asc
      `,
      targetSql: `
        select
          id,
          store_id as "storeId",
          topic,
          entity_type as "entityType",
          entity_id as "entityId",
          dedupe_key as "dedupeKey",
          title,
          message,
          severity,
          status,
          due_status as "dueStatus",
          due_date as "dueDate",
          payload,
          first_detected_at as "firstDetectedAt",
          last_detected_at as "lastDetectedAt",
          read_at as "readAt",
          resolved_at as "resolvedAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from notification_inbox
        order by store_id asc, dedupe_key asc
      `,
    });

    const ruleCount = await compareRows({
      label: "notification_rules",
      sourceSql: `
        select
          id,
          store_id as "storeId",
          topic,
          entity_type as "entityType",
          entity_id as "entityId",
          muted_forever as "mutedForever",
          muted_until as "mutedUntil",
          snoozed_until as "snoozedUntil",
          note,
          updated_by as "updatedBy",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from notification_rules
        order by store_id asc, topic asc, entity_type asc, entity_id asc
      `,
      targetSql: `
        select
          id,
          store_id as "storeId",
          topic,
          entity_type as "entityType",
          entity_id as "entityId",
          muted_forever as "mutedForever",
          muted_until as "mutedUntil",
          snoozed_until as "snoozedUntil",
          note,
          updated_by as "updatedBy",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from notification_rules
        order by store_id asc, topic asc, entity_type asc, entity_id asc
      `,
    });

    console.info(
      `[pg:compare:notifications] parity ok notification_inbox=${inboxCount} notification_rules=${ruleCount}`,
    );
  } catch (error) {
    console.error("[pg:compare:notifications] failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await target.close().catch(() => {});
    source.close();
  }
};

void run();
