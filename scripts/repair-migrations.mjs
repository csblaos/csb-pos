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

  if (!(await columnExists("orders", "payment_currency"))) {
    await client.execute(
      "alter table `orders` add `payment_currency` text not null default 'LAK'",
    );
    console.info("[db:repair] added column orders.payment_currency");
  }

  if (!(await columnExists("orders", "payment_method"))) {
    await client.execute(
      "alter table `orders` add `payment_method` text not null default 'CASH'",
    );
    console.info("[db:repair] added column orders.payment_method");
  }

  if (!(await columnExists("orders", "payment_account_id"))) {
    await client.execute("alter table `orders` add `payment_account_id` text");
    console.info("[db:repair] added column orders.payment_account_id");
  }

  if (!(await columnExists("orders", "payment_slip_url"))) {
    await client.execute("alter table `orders` add `payment_slip_url` text");
    console.info("[db:repair] added column orders.payment_slip_url");
  }

  if (!(await columnExists("orders", "payment_proof_submitted_at"))) {
    await client.execute("alter table `orders` add `payment_proof_submitted_at` text");
    console.info("[db:repair] added column orders.payment_proof_submitted_at");
  }

  await client.execute(`
    update \`orders\`
    set \`payment_currency\` = case
      when \`store_id\` in (select \`id\` from \`stores\`) then (
        select
          case
            when \`stores\`.\`currency\` in ('LAK', 'THB', 'USD') then \`stores\`.\`currency\`
            else 'LAK'
          end
        from \`stores\`
        where \`stores\`.\`id\` = \`orders\`.\`store_id\`
        limit 1
      )
      else 'LAK'
    end
    where \`payment_currency\` is null or trim(\`payment_currency\`) = ''
  `);
  console.info("[db:repair] backfilled orders.payment_currency from stores.currency");

  await client.execute(`
    update \`orders\`
    set \`payment_currency\` = case
      when \`store_id\` in (select \`id\` from \`stores\`) then (
        select
          case
            when \`stores\`.\`currency\` in ('LAK', 'THB', 'USD') then \`stores\`.\`currency\`
            else 'LAK'
          end
        from \`stores\`
        where \`stores\`.\`id\` = \`orders\`.\`store_id\`
        limit 1
      )
      else 'LAK'
    end
    where \`payment_currency\` not in ('LAK', 'THB', 'USD')
  `);
  console.info("[db:repair] normalized orders.payment_currency");

  await client.execute(`
    update \`orders\`
    set \`payment_method\` = 'LAO_QR'
    where \`payment_method\` = 'PROMPTPAY'
  `);

  await client.execute(`
    update \`orders\`
    set \`payment_method\` = 'CASH'
    where \`payment_method\` is null
      or trim(\`payment_method\`) = ''
      or \`payment_method\` not in ('CASH', 'LAO_QR')
  `);
  console.info("[db:repair] normalized orders.payment_method");

  await client.execute(
    "create index if not exists `orders_store_created_at_idx` on `orders` (`store_id`,`created_at`)",
  );
  await client.execute(
    "create index if not exists `orders_store_status_created_at_idx` on `orders` (`store_id`,`status`,`created_at`)",
  );
  await client.execute(
    "create index if not exists `orders_store_status_paid_at_idx` on `orders` (`store_id`,`status`,`paid_at`)",
  );
  await client.execute(
    "create index if not exists `orders_store_payment_method_idx` on `orders` (`store_id`,`payment_method`)",
  );
  console.info("[db:repair] ensured orders indexes from migration 0002 and payment flow");

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

  if (!(await columnExists("users", "created_by"))) {
    await client.execute("alter table `users` add `created_by` text");
    console.info("[db:repair] added column users.created_by");
  }

  if (!(await columnExists("users", "must_change_password"))) {
    await client.execute(
      "alter table `users` add `must_change_password` integer not null default 0",
    );
    console.info("[db:repair] added column users.must_change_password");
  }

  if (!(await columnExists("users", "password_updated_at"))) {
    await client.execute("alter table `users` add `password_updated_at` text");
    console.info("[db:repair] added column users.password_updated_at");
  }

  if (!(await columnExists("stores", "out_stock_threshold"))) {
    await client.execute(
      "alter table `stores` add `out_stock_threshold` integer not null default 0",
    );
    console.info("[db:repair] added column stores.out_stock_threshold");
  }

  if (!(await columnExists("stores", "low_stock_threshold"))) {
    await client.execute(
      "alter table `stores` add `low_stock_threshold` integer not null default 10",
    );
    console.info("[db:repair] added column stores.low_stock_threshold");
  }

  await client.execute(
    "update `stores` set `out_stock_threshold` = 0 where `out_stock_threshold` is null",
  );
  await client.execute(
    "update `stores` set `low_stock_threshold` = 10 where `low_stock_threshold` is null",
  );
  console.info("[db:repair] backfilled stores stock thresholds");

  if (!(await columnExists("products", "out_stock_threshold"))) {
    await client.execute("alter table `products` add `out_stock_threshold` integer");
    console.info("[db:repair] added column products.out_stock_threshold");
  }

  if (!(await columnExists("products", "low_stock_threshold"))) {
    await client.execute("alter table `products` add `low_stock_threshold` integer");
    console.info("[db:repair] added column products.low_stock_threshold");
  }

  await client.execute(
    "update `users` set `password_updated_at` = coalesce(`created_at`, CURRENT_TIMESTAMP) where `password_updated_at` is null",
  );
  console.info("[db:repair] normalized users.password_updated_at");

  await client.execute(
    "create index if not exists `users_created_by_idx` on `users` (`created_by`)",
  );
  await client.execute(
    "create index if not exists `users_must_change_password_idx` on `users` (`must_change_password`)",
  );
  console.info("[db:repair] ensured users created_by/must_change_password indexes");

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

  if (!(await columnExists("stores", "supported_currencies"))) {
    await client.execute(
      "alter table `stores` add `supported_currencies` text not null default '[\"LAK\"]'",
    );
    console.info("[db:repair] added column stores.supported_currencies");
  }

  if (!(await columnExists("stores", "vat_mode"))) {
    await client.execute(
      "alter table `stores` add `vat_mode` text not null default 'EXCLUSIVE'",
    );
    console.info("[db:repair] added column stores.vat_mode");
  }

  await client.execute(`
    update \`stores\`
    set \`currency\` = 'LAK'
    where \`currency\` is null
      or trim(\`currency\`) = ''
      or \`currency\` not in ('LAK', 'THB', 'USD')
  `);
  console.info("[db:repair] normalized stores.currency");

  await client.execute(`
    update \`stores\`
    set \`supported_currencies\` = case
      when \`currency\` in ('LAK', 'THB', 'USD') then '[\"' || \`currency\` || '\"]'
      else '[\"LAK\"]'
    end
    where \`supported_currencies\` is null or trim(\`supported_currencies\`) = ''
  `);
  console.info("[db:repair] backfilled stores.supported_currencies");

  await client.execute(`
    update \`stores\`
    set \`supported_currencies\` = '[\"' || \`currency\` || '\"]'
    where \`currency\` in ('LAK', 'THB', 'USD')
      and \`supported_currencies\` not like '%"' || \`currency\` || '"%'
  `);
  console.info("[db:repair] normalized stores.supported_currencies");

  await client.execute(`
    update \`stores\`
    set \`vat_mode\` = 'EXCLUSIVE'
    where \`vat_mode\` is null
      or trim(\`vat_mode\`) = ''
      or \`vat_mode\` not in ('EXCLUSIVE', 'INCLUSIVE')
  `);
  console.info("[db:repair] normalized stores.vat_mode");

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

  if (!(await columnExists("system_config", "payment_max_accounts_per_store"))) {
    await client.execute(
      "alter table `system_config` add `payment_max_accounts_per_store` integer not null default 5",
    );
    console.info("[db:repair] added column system_config.payment_max_accounts_per_store");
  }

  if (!(await columnExists("system_config", "payment_require_slip_for_lao_qr"))) {
    await client.execute(
      "alter table `system_config` add `payment_require_slip_for_lao_qr` integer not null default 1",
    );
    console.info("[db:repair] added column system_config.payment_require_slip_for_lao_qr");
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
      \`payment_max_accounts_per_store\` = case
        when \`payment_max_accounts_per_store\` is null or \`payment_max_accounts_per_store\` < 1 then 5
        else \`payment_max_accounts_per_store\`
      end,
      \`payment_require_slip_for_lao_qr\` = coalesce(\`payment_require_slip_for_lao_qr\`, 1),
      \`store_logo_max_size_mb\` = coalesce(\`store_logo_max_size_mb\`, 5),
      \`store_logo_auto_resize\` = coalesce(\`store_logo_auto_resize\`, 1),
      \`store_logo_resize_max_width\` = coalesce(\`store_logo_resize_max_width\`, 1280),
      \`updated_at\` = CURRENT_TIMESTAMP
    where \`id\` = 'global'
  `);
  console.info(
    "[db:repair] normalized system_config(global) default_max_branches_per_store=1 default_session_limit=1 payment_max_accounts_per_store>=1 payment_require_slip_for_lao_qr=1 store_logo_max_size_mb=5 store_logo_auto_resize=1 store_logo_resize_max_width=1280",
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
  if (!(await columnExists("store_branches", "source_branch_id"))) {
    await client.execute(
      "alter table `store_branches` add `source_branch_id` text references `store_branches`(`id`) on delete set null",
    );
    console.info("[db:repair] added column store_branches.source_branch_id");
  }

  if (!(await columnExists("store_branches", "sharing_mode"))) {
    await client.execute("alter table `store_branches` add `sharing_mode` text");
    console.info("[db:repair] added column store_branches.sharing_mode");
  }

  if (!(await columnExists("store_branches", "sharing_config"))) {
    await client.execute("alter table `store_branches` add `sharing_config` text");
    console.info("[db:repair] added column store_branches.sharing_config");
  }

  await client.execute(
    "create index if not exists `store_branches_source_branch_id_idx` on `store_branches` (`source_branch_id`)",
  );
  console.info("[db:repair] ensured store_branches indexes");

  await client.execute(`
    insert into \`store_branches\`
      (\`id\`, \`store_id\`, \`name\`, \`code\`, \`address\`, \`source_branch_id\`, \`sharing_mode\`, \`sharing_config\`, \`created_at\`)
    select
      lower(
        hex(randomblob(4)) || '-' ||
        hex(randomblob(2)) || '-' ||
        '4' || substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
        hex(randomblob(6))
      ) as \`id\`,
      s.\`id\`,
      'สาขาหลัก',
      'MAIN',
      null,
      null,
      'MAIN',
      null,
      CURRENT_TIMESTAMP
    from \`stores\` s
    left join \`store_branches\` b
      on b.\`store_id\` = s.\`id\`
      and b.\`code\` = 'MAIN'
    where b.\`id\` is null
  `);
  console.info("[db:repair] ensured MAIN branch for all stores");

  await client.execute(`
    update \`store_branches\`
    set \`sharing_mode\` = case
      when \`code\` = 'MAIN' then 'MAIN'
      else 'BALANCED'
    end
    where \`sharing_mode\` is null or \`sharing_mode\` = ''
  `);
  console.info("[db:repair] normalized store_branches.sharing_mode");

  await client.execute(`
    update \`store_branches\`
    set \`source_branch_id\` = (
      select mb.\`id\`
      from \`store_branches\` mb
      where mb.\`store_id\` = \`store_branches\`.\`store_id\`
        and mb.\`code\` = 'MAIN'
      limit 1
    )
    where \`code\` <> 'MAIN'
      and \`source_branch_id\` is null
      and \`sharing_mode\` in ('BALANCED', 'FULL_SYNC')
  `);
  console.info("[db:repair] normalized store_branches.source_branch_id");

  if (!(await columnExists("store_members", "added_by"))) {
    await client.execute("alter table `store_members` add `added_by` text");
    console.info("[db:repair] added column store_members.added_by");
  }

  await client.execute(
    "create index if not exists `store_members_added_by_idx` on `store_members` (`added_by`)",
  );
  console.info("[db:repair] ensured store_members.added_by index");

  await client.execute(`
    create table if not exists \`store_member_branches\` (
      \`store_id\` text not null references \`stores\`(\`id\`) on delete cascade,
      \`user_id\` text not null references \`users\`(\`id\`) on delete cascade,
      \`branch_id\` text not null references \`store_branches\`(\`id\`) on delete cascade,
      \`created_at\` text not null default (CURRENT_TIMESTAMP),
      primary key (\`store_id\`, \`user_id\`, \`branch_id\`)
    )
  `);
  await client.execute(
    "create index if not exists `store_member_branches_store_user_idx` on `store_member_branches` (`store_id`, `user_id`)",
  );
  await client.execute(
    "create index if not exists `store_member_branches_branch_idx` on `store_member_branches` (`branch_id`)",
  );
  console.info("[db:repair] ensured store_member_branches table and indexes");

  await client.execute(`
    create table if not exists \`store_payment_accounts\` (
      \`id\` text primary key not null,
      \`store_id\` text not null references \`stores\`(\`id\`) on delete cascade,
      \`display_name\` text not null,
      \`account_type\` text not null,
      \`bank_name\` text,
      \`account_name\` text not null,
      \`account_number\` text,
      \`qr_image_url\` text,
      \`promptpay_id\` text,
      \`is_default\` integer not null default 0,
      \`is_active\` integer not null default 1,
      \`created_at\` text not null default (CURRENT_TIMESTAMP),
      \`updated_at\` text not null default (CURRENT_TIMESTAMP)
    )
  `);
  await client.execute(
    "create index if not exists `store_payment_accounts_store_id_idx` on `store_payment_accounts` (`store_id`)",
  );
  await client.execute(
    "create index if not exists `store_payment_accounts_store_active_idx` on `store_payment_accounts` (`store_id`, `is_active`)",
  );
  await client.execute(
    "create unique index if not exists `store_payment_accounts_store_default_unique` on `store_payment_accounts` (`store_id`) where `is_default` = 1 and `is_active` = 1",
  );
  if (!(await columnExists("store_payment_accounts", "qr_image_url"))) {
    await client.execute("alter table `store_payment_accounts` add `qr_image_url` text");
    console.info("[db:repair] added column store_payment_accounts.qr_image_url");
  }
  await client.execute(`
    update \`store_payment_accounts\`
    set \`account_type\` = 'LAO_QR'
    where \`account_type\` = 'PROMPTPAY'
  `);
  await client.execute(`
    update \`store_payment_accounts\`
    set \`account_type\` = 'BANK'
    where \`account_type\` is null
      or trim(\`account_type\`) = ''
      or \`account_type\` not in ('BANK', 'LAO_QR')
  `);
  await client.execute(`
    update \`store_payment_accounts\`
    set \`qr_image_url\` = \`promptpay_id\`
    where (\`qr_image_url\` is null or trim(\`qr_image_url\`) = '')
      and \`account_type\` = 'LAO_QR'
      and \`promptpay_id\` is not null
      and trim(\`promptpay_id\`) <> ''
  `);
  console.info("[db:repair] ensured store_payment_accounts table and indexes");

  // ── product_categories + products.image_url/category_id (migration 0022) ──

  await client.execute(`
    create table if not exists \`product_categories\` (
      \`id\` text primary key not null,
      \`store_id\` text not null references \`stores\`(\`id\`) on delete cascade,
      \`name\` text not null,
      \`sort_order\` integer not null default 0,
      \`created_at\` text not null default (CURRENT_TIMESTAMP)
    )
  `);
  await client.execute(
    "create index if not exists `product_categories_store_id_idx` on `product_categories` (`store_id`)",
  );
  await client.execute(
    "create unique index if not exists `product_categories_store_name_unique` on `product_categories` (`store_id`, `name`)",
  );
  console.info("[db:repair] ensured table product_categories");

  if (!(await columnExists("products", "image_url"))) {
    await client.execute("alter table `products` add `image_url` text");
    console.info("[db:repair] added column products.image_url");
  }

  if (!(await columnExists("products", "category_id"))) {
    await client.execute(
      "alter table `products` add `category_id` text references `product_categories`(`id`) on delete set null",
    );
    console.info("[db:repair] added column products.category_id");
  }

  await client.execute(
    "create index if not exists `products_category_id_idx` on `products` (`category_id`)",
  );
  console.info("[db:repair] ensured products.category_id index");

  // ── purchase_orders + purchase_order_items (migration 0023) ──

  await client.execute(`
    create table if not exists \`purchase_orders\` (
      \`id\` text primary key not null,
      \`store_id\` text not null references \`stores\`(\`id\`) on delete cascade,
      \`po_number\` text not null,
      \`supplier_name\` text,
      \`supplier_contact\` text,
      \`purchase_currency\` text not null default 'LAK',
      \`exchange_rate\` integer not null default 1,
      \`shipping_cost\` integer not null default 0,
      \`other_cost\` integer not null default 0,
      \`other_cost_note\` text,
      \`status\` text not null default 'DRAFT',
      \`ordered_at\` text,
      \`expected_at\` text,
      \`shipped_at\` text,
      \`received_at\` text,
      \`cancelled_at\` text,
      \`tracking_info\` text,
      \`note\` text,
      \`created_by\` text references \`users\`(\`id\`),
      \`created_at\` text not null default (CURRENT_TIMESTAMP)
    )
  `);
  await client.execute(
    "create index if not exists `po_store_id_idx` on `purchase_orders` (`store_id`)",
  );
  await client.execute(
    "create index if not exists `po_status_idx` on `purchase_orders` (`store_id`, `status`)",
  );
  await client.execute(
    "create index if not exists `po_created_at_idx` on `purchase_orders` (`store_id`, `created_at`)",
  );
  await client.execute(
    "create unique index if not exists `po_store_po_number_unique` on `purchase_orders` (`store_id`, `po_number`)",
  );
  console.info("[db:repair] ensured table purchase_orders + indexes");

  // Ensure cancelled_at column exists
  if (!(await columnExists("purchase_orders", "cancelled_at"))) {
    await client.execute("alter table `purchase_orders` add `cancelled_at` text");
    console.info("[db:repair] added column purchase_orders.cancelled_at");
  }

  await client.execute(`
    create table if not exists \`purchase_order_items\` (
      \`id\` text primary key not null,
      \`purchase_order_id\` text not null references \`purchase_orders\`(\`id\`) on delete cascade,
      \`product_id\` text not null references \`products\`(\`id\`) on delete restrict,
      \`qty_ordered\` integer not null,
      \`qty_received\` integer not null default 0,
      \`unit_cost_purchase\` integer not null default 0,
      \`unit_cost_base\` integer not null default 0,
      \`landed_cost_per_unit\` integer not null default 0
    )
  `);
  await client.execute(
    "create index if not exists `po_items_po_id_idx` on `purchase_order_items` (`purchase_order_id`)",
  );
  await client.execute(
    "create index if not exists `po_items_product_id_idx` on `purchase_order_items` (`product_id`)",
  );
  console.info("[db:repair] ensured table purchase_order_items + indexes");
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
