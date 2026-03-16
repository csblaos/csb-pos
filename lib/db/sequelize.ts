import "server-only";

// Ensure Vercel/Next output tracing includes Postgres driver packages.
import "pg";
import "pg-hstore";

import { Sequelize, type Options, type QueryOptions, type Transaction } from "sequelize";

const DEFAULT_POSTGRES_POOL_MAX = 10;
const DEFAULT_POSTGRES_POOL_MIN = 0;
const DEFAULT_POSTGRES_POOL_IDLE_MS = 10_000;
const DEFAULT_POSTGRES_POOL_ACQUIRE_MS = 30_000;

const toPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const isPostgresSqlLoggingEnabled = () => process.env.POSTGRES_LOG_SQL === "1";

const sanitizeDatabaseUrl = (databaseUrl: string) => {
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

const buildSequelizeOptions = (): Options => {
  const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("POSTGRES_DATABASE_URL is not configured");
  }

  const sslMode = (process.env.POSTGRES_SSL_MODE ?? "require").trim().toLowerCase();
  const shouldUseSsl = sslMode !== "disable" && sslMode !== "off" && sslMode !== "false";
  const rejectUnauthorized =
    (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED ?? "0").trim() === "1";

  return {
    dialect: "postgres",
    dialectOptions: shouldUseSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized,
          },
        }
      : undefined,
    logging: isPostgresSqlLoggingEnabled()
      ? (sql, timing) => {
          if (typeof timing === "number") {
            console.info(`[pg] ${timing}ms ${sql}`);
            return;
          }
          console.info(`[pg] ${sql}`);
        }
      : false,
    pool: {
      max: toPositiveInt(process.env.POSTGRES_POOL_MAX, DEFAULT_POSTGRES_POOL_MAX),
      min: Number.parseInt(process.env.POSTGRES_POOL_MIN ?? "", 10) || DEFAULT_POSTGRES_POOL_MIN,
      idle: toPositiveInt(process.env.POSTGRES_POOL_IDLE_MS, DEFAULT_POSTGRES_POOL_IDLE_MS),
      acquire: toPositiveInt(
        process.env.POSTGRES_POOL_ACQUIRE_MS,
        DEFAULT_POSTGRES_POOL_ACQUIRE_MS,
      ),
    },
  };
};

const globalForSequelize = globalThis as typeof globalThis & {
  postgresSequelize?: Sequelize;
  postgresSequelizeProbe?: Promise<void>;
};

export const isPostgresConfigured = () =>
  Boolean(process.env.POSTGRES_DATABASE_URL && process.env.POSTGRES_DATABASE_URL.trim().length > 0);

export const createSequelize = () => {
  const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("POSTGRES_DATABASE_URL is not configured");
  }

  return new Sequelize(sanitizeDatabaseUrl(databaseUrl), buildSequelizeOptions());
};

export const getSequelize = () => {
  if (!globalForSequelize.postgresSequelize) {
    globalForSequelize.postgresSequelize = createSequelize();
  }

  return globalForSequelize.postgresSequelize;
};

export const ensurePostgresConnection = async () => {
  if (!globalForSequelize.postgresSequelizeProbe) {
    const sequelize = getSequelize();
    globalForSequelize.postgresSequelizeProbe = sequelize.authenticate();
  }

  return globalForSequelize.postgresSequelizeProbe;
};

export type PostgresTransaction = Transaction;
export type PostgresQueryOptions = QueryOptions;
