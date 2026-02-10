import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@/lib/db/schema";

const useLocalDbInDev =
  process.env.NODE_ENV === "development" && process.env.DEV_USE_LOCAL_DB === "1";

const databaseUrl = useLocalDbInDev
  ? process.env.DEV_DATABASE_URL ?? "file:./local.db"
  : process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./local.db";

const authToken = process.env.TURSO_AUTH_TOKEN;

const globalForDb = globalThis as unknown as {
  libsqlClient?: Client;
  libsqlConnectionProbe?: Promise<void>;
};

const getDatabaseMode = () => (databaseUrl.startsWith("file:") ? "local" : "turso");

const getDatabaseTarget = () => {
  if (databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return databaseUrl;
  }
};

const logDbConnectionInfo = (message: string) => {
  console.info(
    `[db] ${message} mode=${getDatabaseMode()} target=${getDatabaseTarget()}`,
  );
};

const getClient = () => {
  if (!globalForDb.libsqlClient) {
    try {
      logDbConnectionInfo("initializing client");
      globalForDb.libsqlClient = createClient({
        url: databaseUrl,
        authToken,
      });
    } catch (error) {
      console.error(
        `[db] client init failed mode=${getDatabaseMode()} target=${getDatabaseTarget()}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      throw error;
    }
  }

  if (!globalForDb.libsqlConnectionProbe) {
    globalForDb.libsqlConnectionProbe = globalForDb.libsqlClient
      .execute("select 1 as health_check")
      .then(() => {
        logDbConnectionInfo("connection success");
      })
      .catch((error) => {
        console.error(
          `[db] connection failed mode=${getDatabaseMode()} target=${getDatabaseTarget()}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      });
  }

  return globalForDb.libsqlClient;
};

export const db = drizzle(getClient(), { schema });

export const getDb = () => db;
