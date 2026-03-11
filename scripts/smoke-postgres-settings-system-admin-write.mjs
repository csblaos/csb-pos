import "./load-local-env.mjs";

import { createHash } from "node:crypto";

import { Sequelize } from "sequelize";

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

const hashPassword = (input) =>
  `smoke$${createHash("sha256").update(input).digest("hex")}`;

let targetStore = null;
let tempEmail = null;
let beforeSessionPolicy = null;
let beforeLogoPolicy = null;
let beforePaymentPolicy = null;

const run = async () => {
  try {
    await target.authenticate();

    const nowSuffix = Date.now();
    tempEmail = `smoke-system-admin-${nowSuffix}@example.com`;

    const [actorRows] = await target.query(`
      select id
      from users
      where system_role in ('SYSTEM_ADMIN', 'SUPERADMIN')
      order by created_at asc
      limit 1
    `);
    const actorUserId = Array.isArray(actorRows) ? actorRows[0]?.id : null;
    if (!actorUserId) {
      throw new Error("NO_SYSTEM_ADMIN_USER");
    }

    const [storeRows] = await target.query(`
      select
        id,
        name,
        store_type as "storeType",
        currency,
        vat_enabled as "vatEnabled",
        vat_rate as "vatRate",
        max_branches_override as "maxBranchesOverride"
      from stores
      order by created_at asc
      limit 1
    `);
    targetStore = Array.isArray(storeRows) ? storeRows[0] : null;
    if (!targetStore?.id) {
      throw new Error("NO_STORE_FOUND");
    }

    const [sessionPolicyRows] = await target.query(`
      select default_session_limit as "defaultSessionLimit"
      from system_config
      where id = 'global'
      limit 1
    `);
    const [logoPolicyRows] = await target.query(`
      select
        store_logo_max_size_mb as "maxSizeMb",
        store_logo_auto_resize as "autoResize",
        store_logo_resize_max_width as "resizeMaxWidth"
      from system_config
      where id = 'global'
      limit 1
    `);
    const [paymentPolicyRows] = await target.query(`
      select
        payment_max_accounts_per_store as "maxAccountsPerStore",
        payment_require_slip_for_lao_qr as "requireSlipForLaoQr"
      from system_config
      where id = 'global'
      limit 1
    `);

    beforeSessionPolicy = Array.isArray(sessionPolicyRows) ? sessionPolicyRows[0] : null;
    beforeLogoPolicy = Array.isArray(logoPolicyRows) ? logoPolicyRows[0] : null;
    beforePaymentPolicy = Array.isArray(paymentPolicyRows) ? paymentPolicyRows[0] : null;

    await target.query(
      `
        update system_config
        set default_session_limit = 3
        where id = 'global'
      `,
    );

    await target.query(
      `
        update system_config
        set
          store_logo_max_size_mb = 6,
          store_logo_auto_resize = false,
          store_logo_resize_max_width = 1400
        where id = 'global'
      `,
    );

    await target.query(
      `
        update system_config
        set
          payment_max_accounts_per_store = 7,
          payment_require_slip_for_lao_qr = false
        where id = 'global'
      `,
    );

    const [verifyPolicyRows] = await target.query(`
      select
        default_session_limit as "defaultSessionLimit",
        store_logo_max_size_mb as "maxSizeMb",
        store_logo_auto_resize as "autoResize",
        store_logo_resize_max_width as "resizeMaxWidth",
        payment_max_accounts_per_store as "maxAccountsPerStore",
        payment_require_slip_for_lao_qr as "requireSlipForLaoQr"
      from system_config
      where id = 'global'
      limit 1
    `);
    const verifyPolicy = Array.isArray(verifyPolicyRows) ? verifyPolicyRows[0] : null;
    if (
      Number(verifyPolicy?.defaultSessionLimit ?? 0) !== 3 ||
      Number(verifyPolicy?.maxSizeMb ?? 0) !== 6 ||
      verifyPolicy?.autoResize !== false ||
      Number(verifyPolicy?.resizeMaxWidth ?? 0) !== 1400 ||
      Number(verifyPolicy?.maxAccountsPerStore ?? 0) !== 7 ||
      verifyPolicy?.requireSlipForLaoQr !== false
    ) {
      throw new Error("SYSTEM_POLICY_WRITE_FAILED");
    }

    await target.query(
      `
        insert into users (
          id,
          email,
          name,
          password_hash,
          created_by,
          system_role,
          can_create_stores,
          max_stores,
          can_create_branches,
          max_branches_per_store,
          created_at
        )
        values (
          :id,
          :email,
          :name,
          :passwordHash,
          :createdBy,
          'SUPERADMIN',
          true,
          4,
          true,
          8,
          current_timestamp
        )
      `,
      {
        replacements: {
          id: `smoke-superadmin-${nowSuffix}`,
          email: tempEmail,
          name: `Smoke System Admin ${nowSuffix}`,
          passwordHash: hashPassword(`SmokePass!${nowSuffix}`),
          createdBy: actorUserId,
        },
      },
    );

    await target.query(
      `
        update users
        set
          name = :name,
          session_limit = 5,
          can_create_stores = true,
          max_stores = 6,
          can_create_branches = true,
          max_branches_per_store = 10
        where email = :email
      `,
      {
        replacements: {
          email: tempEmail,
          name: `Smoke System Admin Updated ${nowSuffix}`,
        },
      },
    );

    const [updatedUserRows] = await target.query(
      `
        select
          id,
          name,
          session_limit as "sessionLimit",
          max_stores as "maxStores",
          max_branches_per_store as "maxBranchesPerStore"
        from users
        where email = :email
        limit 1
      `,
      {
        replacements: { email: tempEmail },
      },
    );
    const updatedUser = Array.isArray(updatedUserRows) ? updatedUserRows[0] : null;
    if (
      !updatedUser?.id ||
      updatedUser.name !== `Smoke System Admin Updated ${nowSuffix}` ||
      Number(updatedUser.sessionLimit ?? 0) !== 5 ||
      Number(updatedUser.maxStores ?? 0) !== 6 ||
      Number(updatedUser.maxBranchesPerStore ?? 0) !== 10
    ) {
      throw new Error("SUPERADMIN_WRITE_FAILED");
    }

    await target.query(
      `
        update stores
        set
          name = :name,
          store_type = :storeType,
          currency = :currency,
          vat_enabled = :vatEnabled,
          vat_rate = :vatRate,
          max_branches_override = 12
        where id = :storeId
      `,
      {
        replacements: {
          storeId: targetStore.id,
          name: `${targetStore.name} Smoke`,
          storeType: targetStore.storeType,
          currency: targetStore.currency,
          vatEnabled: targetStore.vatEnabled,
          vatRate: targetStore.vatRate,
        },
      },
    );

    const [updatedStoreRows] = await target.query(
      `
        select
          name,
          max_branches_override as "maxBranchesOverride"
        from stores
        where id = :storeId
        limit 1
      `,
      {
        replacements: { storeId: targetStore.id },
      },
    );
    const updatedStore = Array.isArray(updatedStoreRows) ? updatedStoreRows[0] : null;
    if (
      updatedStore?.name !== `${targetStore.name} Smoke` ||
      Number(updatedStore?.maxBranchesOverride ?? 0) !== 12
    ) {
      throw new Error("STORE_CONFIG_WRITE_FAILED");
    }

    await target.query(
      `
        update stores
        set
          name = :name,
          store_type = :storeType,
          currency = :currency,
          vat_enabled = :vatEnabled,
          vat_rate = :vatRate,
          max_branches_override = :maxBranchesOverride
        where id = :storeId
      `,
      {
        replacements: {
          storeId: targetStore.id,
          name: targetStore.name,
          storeType: targetStore.storeType,
          currency: targetStore.currency,
          vatEnabled: targetStore.vatEnabled,
          vatRate: targetStore.vatRate,
          maxBranchesOverride: targetStore.maxBranchesOverride,
        },
      },
    );

    await target.query(
      `
        delete from users
        where email = :email
      `,
      {
        replacements: { email: tempEmail },
      },
    );

    await target.query(
      `
        update system_config
        set
          default_session_limit = :defaultSessionLimit,
          store_logo_max_size_mb = :maxSizeMb,
          store_logo_auto_resize = :autoResize,
          store_logo_resize_max_width = :resizeMaxWidth,
          payment_max_accounts_per_store = :maxAccountsPerStore,
          payment_require_slip_for_lao_qr = :requireSlipForLaoQr
        where id = 'global'
      `,
      {
        replacements: {
          defaultSessionLimit: beforeSessionPolicy?.defaultSessionLimit ?? 1,
          maxSizeMb: beforeLogoPolicy?.maxSizeMb ?? 5,
          autoResize: beforeLogoPolicy?.autoResize ?? true,
          resizeMaxWidth: beforeLogoPolicy?.resizeMaxWidth ?? 1280,
          maxAccountsPerStore: beforePaymentPolicy?.maxAccountsPerStore ?? 5,
          requireSlipForLaoQr: beforePaymentPolicy?.requireSlipForLaoQr ?? true,
        },
      },
    );

    console.info("[pg:smoke:settings-system-admin-write] passed");
  } catch (error) {
    console.error("[pg:smoke:settings-system-admin-write] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    try {
      if (targetStore?.id) {
        await target.query(
          `
            update stores
            set
              name = :name,
              store_type = :storeType,
              currency = :currency,
              vat_enabled = :vatEnabled,
              vat_rate = :vatRate,
              max_branches_override = :maxBranchesOverride
            where id = :storeId
          `,
          {
            replacements: {
              storeId: targetStore.id,
              name: targetStore.name,
              storeType: targetStore.storeType,
              currency: targetStore.currency,
              vatEnabled: targetStore.vatEnabled,
              vatRate: targetStore.vatRate,
              maxBranchesOverride: targetStore.maxBranchesOverride,
            },
          },
        );
      }

      if (tempEmail) {
        await target.query(
          `
            delete from users
            where email = :email
          `,
          {
            replacements: { email: tempEmail },
          },
        );
      }

      if (beforeSessionPolicy || beforeLogoPolicy || beforePaymentPolicy) {
        await target.query(
          `
            update system_config
            set
              default_session_limit = :defaultSessionLimit,
              store_logo_max_size_mb = :maxSizeMb,
              store_logo_auto_resize = :autoResize,
              store_logo_resize_max_width = :resizeMaxWidth,
              payment_max_accounts_per_store = :maxAccountsPerStore,
              payment_require_slip_for_lao_qr = :requireSlipForLaoQr
            where id = 'global'
          `,
          {
            replacements: {
              defaultSessionLimit: beforeSessionPolicy?.defaultSessionLimit ?? 1,
              maxSizeMb: beforeLogoPolicy?.maxSizeMb ?? 5,
              autoResize: beforeLogoPolicy?.autoResize ?? true,
              resizeMaxWidth: beforeLogoPolicy?.resizeMaxWidth ?? 1280,
              maxAccountsPerStore: beforePaymentPolicy?.maxAccountsPerStore ?? 5,
              requireSlipForLaoQr: beforePaymentPolicy?.requireSlipForLaoQr ?? true,
            },
          },
        );
      }
    } catch (cleanupError) {
      console.error(
        `[pg:smoke:settings-system-admin-write] cleanup failed: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`,
      );
      process.exitCode = 1;
    }

    await target.close();
  }
};

await run();
