import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const dbUrl =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

const client = createClient({
  url: dbUrl,
  authToken: authToken ? authToken : undefined,
});

const escapeSqlIdentifier = (value) => value.replaceAll("'", "''");

async function tableExists(tableName) {
  const result = await client.execute({
    sql: "select 1 as ok from sqlite_master where type = 'table' and name = ? limit 1",
    args: [tableName],
  });
  return result.rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const result = await client.execute(
    `pragma table_info('${escapeSqlIdentifier(tableName)}')`,
  );
  return result.rows.some((row) => row.name === columnName);
}

async function ensureSchemaCompatForLatestAuthChanges() {
  const hasContacts = await tableExists("contacts");
  if (!hasContacts) {
    throw new Error(
      "Database looks empty (table 'contacts' not found). Run `npm run db:migrate` on a fresh database instead of repair.",
    );
  }

  if (!(await columnExists("orders", "shipping_carrier"))) {
    await client.execute("alter table `orders` add `shipping_carrier` text");
    console.info("[db:repair] added column orders.shipping_carrier");
  }

  if (!(await columnExists("orders", "tracking_no"))) {
    await client.execute("alter table `orders` add `tracking_no` text");
    console.info("[db:repair] added column orders.tracking_no");
  }

  await client.execute(
    "create index if not exists `orders_store_created_at_idx` on `orders` (`store_id`,`created_at`)",
  );
  await client.execute(
    "create index if not exists `orders_store_status_created_at_idx` on `orders` (`store_id`,`status`,`created_at`)",
  );
  await client.execute(
    "create index if not exists `orders_store_status_paid_at_idx` on `orders` (`store_id`,`status`,`paid_at`)",
  );
  console.info("[db:repair] ensured 3 orders indexes from migration 0002");

  if (!(await columnExists("users", "session_limit"))) {
    await client.execute("alter table `users` add `session_limit` integer");
    console.info("[db:repair] added column users.session_limit");
  }

  if (!(await columnExists("users", "system_role"))) {
    await client.execute(
      "alter table `users` add `system_role` text not null default 'USER'",
    );
    console.info("[db:repair] added column users.system_role");
  }

  if (!(await columnExists("users", "can_create_stores"))) {
    await client.execute("alter table `users` add `can_create_stores` integer");
    console.info("[db:repair] added column users.can_create_stores");
  }

  if (!(await columnExists("users", "max_stores"))) {
    await client.execute("alter table `users` add `max_stores` integer");
    console.info("[db:repair] added column users.max_stores");
  }
}

async function ensureMigrationTable() {
  await client.execute(`
    create table if not exists "__drizzle_migrations" (
      id integer primary key autoincrement,
      hash text not null,
      created_at numeric
    )
  `);
}

async function migrationHashFromSqlFile(sqlFilePath) {
  const content = await readFile(sqlFilePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

async function backfillMigrationHistory() {
  const journalPath = path.join(rootDir, "drizzle", "meta", "_journal.json");
  const journalRaw = await readFile(journalPath, "utf8");
  const journal = JSON.parse(journalRaw);
  const entries = Array.isArray(journal?.entries) ? journal.entries : [];

  let inserted = 0;
  for (const entry of entries) {
    const tag = entry?.tag;
    const createdAt = entry?.when;
    if (typeof tag !== "string" || typeof createdAt !== "number") {
      continue;
    }

    const sqlFilePath = path.join(rootDir, "drizzle", `${tag}.sql`);
    const hash = await migrationHashFromSqlFile(sqlFilePath);

    const existing = await client.execute({
      sql: "select 1 as ok from __drizzle_migrations where hash = ? limit 1",
      args: [hash],
    });

    if (existing.rows.length > 0) {
      continue;
    }

    await client.execute({
      sql: "insert into __drizzle_migrations (hash, created_at) values (?, ?)",
      args: [hash, createdAt],
    });
    inserted += 1;
  }

  return inserted;
}

async function main() {
  console.info(`[db:repair] target=${dbUrl}`);
  await ensureMigrationTable();
  await ensureSchemaCompatForLatestAuthChanges();
  const insertedCount = await backfillMigrationHistory();
  console.info(`[db:repair] migration history backfilled rows=${insertedCount}`);
  console.info("[db:repair] done");
}

main()
  .catch((error) => {
    console.error(
      `[db:repair] failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exit(1);
  })
  .finally(async () => {
    try {
      await client.close();
    } catch {
      // no-op
    }
  });
