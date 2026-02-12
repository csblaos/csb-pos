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

  if (!(await columnExists("users", "can_create_branches"))) {
    await client.execute("alter table `users` add `can_create_branches` integer");
    console.info("[db:repair] added column users.can_create_branches");
  }

  if (!(await columnExists("users", "max_branches_per_store"))) {
    await client.execute("alter table `users` add `max_branches_per_store` integer");
    console.info("[db:repair] added column users.max_branches_per_store");
  }

  if (!(await columnExists("stores", "max_branches_override"))) {
    await client.execute("alter table `stores` add `max_branches_override` integer");
    console.info("[db:repair] added column stores.max_branches_override");
  }

  if (!(await columnExists("stores", "logo_name"))) {
    await client.execute("alter table `stores` add `logo_name` text");
    console.info("[db:repair] added column stores.logo_name");
  }

  if (!(await columnExists("stores", "logo_url"))) {
    await client.execute("alter table `stores` add `logo_url` text");
    console.info("[db:repair] added column stores.logo_url");
  }

  if (!(await columnExists("stores", "address"))) {
    await client.execute("alter table `stores` add `address` text");
    console.info("[db:repair] added column stores.address");
  }

  if (!(await columnExists("stores", "phone_number"))) {
    await client.execute("alter table `stores` add `phone_number` text");
    console.info("[db:repair] added column stores.phone_number");
  }

  await client.execute(`
    create table if not exists \`system_config\` (
      \`id\` text primary key not null default 'global',
      \`default_can_create_branches\` integer not null default 1,
      \`default_max_branches_per_store\` integer default 1,
      \`default_session_limit\` integer not null default 1,
      \`created_at\` text not null default (CURRENT_TIMESTAMP),
      \`updated_at\` text not null default (CURRENT_TIMESTAMP)
    )
  `);
  console.info("[db:repair] ensured table system_config");

  await client.execute(`
    insert into \`system_config\`
      (\`id\`, \`default_can_create_branches\`, \`default_max_branches_per_store\`, \`default_session_limit\`)
    values ('global', 1, 1, 1)
    on conflict(\`id\`) do nothing
  `);
  console.info("[db:repair] ensured default row system_config(global)");

  if (!(await columnExists("system_config", "default_session_limit"))) {
    await client.execute(
      "alter table `system_config` add `default_session_limit` integer not null default 1",
    );
    console.info("[db:repair] added column system_config.default_session_limit");
  }

  if (!(await columnExists("system_config", "store_logo_max_size_mb"))) {
    await client.execute(
      "alter table `system_config` add `store_logo_max_size_mb` integer not null default 5",
    );
    console.info("[db:repair] added column system_config.store_logo_max_size_mb");
  }

  if (!(await columnExists("system_config", "store_logo_auto_resize"))) {
    await client.execute(
      "alter table `system_config` add `store_logo_auto_resize` integer not null default 1",
    );
    console.info("[db:repair] added column system_config.store_logo_auto_resize");
  }

  if (!(await columnExists("system_config", "store_logo_resize_max_width"))) {
    await client.execute(
      "alter table `system_config` add `store_logo_resize_max_width` integer not null default 1280",
    );
    console.info("[db:repair] added column system_config.store_logo_resize_max_width");
  }

  await client.execute(`
    update \`system_config\`
    set
      \`default_max_branches_per_store\` = 1,
      \`default_session_limit\` = coalesce(\`default_session_limit\`, 1),
      \`store_logo_max_size_mb\` = coalesce(\`store_logo_max_size_mb\`, 5),
      \`store_logo_auto_resize\` = coalesce(\`store_logo_auto_resize\`, 1),
      \`store_logo_resize_max_width\` = coalesce(\`store_logo_resize_max_width\`, 1280),
      \`updated_at\` = CURRENT_TIMESTAMP
    where \`id\` = 'global'
  `);
  console.info(
    "[db:repair] normalized system_config(global) default_max_branches_per_store=1 default_session_limit=1 store_logo_max_size_mb=5 store_logo_auto_resize=1 store_logo_resize_max_width=1280",
  );

  await client.execute(`
    create table if not exists \`store_type_templates\` (
      \`store_type\` text primary key not null,
      \`app_layout\` text not null,
      \`display_name\` text not null,
      \`description\` text not null,
      \`created_at\` text not null default (CURRENT_TIMESTAMP),
      \`updated_at\` text not null default (CURRENT_TIMESTAMP)
    )
  `);
  console.info("[db:repair] ensured table store_type_templates");

  await client.execute(
    "create index if not exists `store_type_templates_app_layout_idx` on `store_type_templates` (`app_layout`)",
  );
  console.info("[db:repair] ensured store_type_templates index");

  await client.execute(`
    insert into \`store_type_templates\` (\`store_type\`, \`app_layout\`, \`display_name\`, \`description\`)
    values
      ('ONLINE_RETAIL', 'ONLINE_POS', 'Online POS', 'UI หลักสำหรับร้านค้าที่เน้นขายออนไลน์'),
      ('RESTAURANT', 'RESTAURANT_POS', 'Restaurant POS', 'Template ขั้นต้นสำหรับร้านอาหาร'),
      ('CAFE', 'CAFE_POS', 'Cafe POS', 'Template ขั้นต้นสำหรับคาเฟ่'),
      ('OTHER', 'OTHER_POS', 'Other POS', 'Template ขั้นต้นสำหรับธุรกิจอื่นๆ')
    on conflict(\`store_type\`) do update set
      \`app_layout\` = excluded.\`app_layout\`,
      \`display_name\` = excluded.\`display_name\`,
      \`description\` = excluded.\`description\`,
      \`updated_at\` = CURRENT_TIMESTAMP
  `);
  console.info("[db:repair] ensured default rows store_type_templates");

  await client.execute(`
    create table if not exists \`store_branches\` (
      \`id\` text primary key not null,
      \`store_id\` text not null references \`stores\`(\`id\`) on delete cascade,
      \`name\` text not null,
      \`code\` text,
      \`address\` text,
      \`created_at\` text not null default (CURRENT_TIMESTAMP)
    )
  `);
  console.info("[db:repair] ensured table store_branches");

  await client.execute(
    "create index if not exists `store_branches_store_id_idx` on `store_branches` (`store_id`)",
  );
  await client.execute(
    "create index if not exists `store_branches_store_created_at_idx` on `store_branches` (`store_id`,`created_at`)",
  );
  await client.execute(
    "create unique index if not exists `store_branches_store_name_unique` on `store_branches` (`store_id`,`name`)",
  );
  await client.execute(
    "create unique index if not exists `store_branches_store_code_unique` on `store_branches` (`store_id`,`code`)",
  );
  console.info("[db:repair] ensured store_branches indexes");
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
