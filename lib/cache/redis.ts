import "server-only";

import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";

type LocalRedisClient = ReturnType<typeof createClient>;

type RedisDriver = "upstash" | "local" | "none";

type RedisGlobal = {
  driver?: RedisDriver;
  upstashClient?: UpstashRedis;
  localClient?: LocalRedisClient;
  localConnectPromise?: Promise<LocalRedisClient | null>;
  warnedKeys?: Set<string>;
};

const globalForRedis = globalThis as unknown as RedisGlobal;
const CACHE_PREFIX = "csb_pos";

function warnOnce(key: string, message: string) {
  if (!globalForRedis.warnedKeys) {
    globalForRedis.warnedKeys = new Set<string>();
  }

  if (globalForRedis.warnedKeys.has(key)) {
    return;
  }

  globalForRedis.warnedKeys.add(key);
  console.warn(message);
}

function getRedisDriver(): RedisDriver {
  if (globalForRedis.driver) {
    return globalForRedis.driver;
  }

  if (process.env.NODE_ENV === "production") {
    if (
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
    ) {
      globalForRedis.driver = "upstash";
      return globalForRedis.driver;
    }

    warnOnce(
      "upstash_missing_env",
      "[cache] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing, redis cache disabled",
    );
    globalForRedis.driver = "none";
    return globalForRedis.driver;
  }

  globalForRedis.driver = "local";
  return globalForRedis.driver;
}

function getUpstashClient() {
  if (globalForRedis.upstashClient) {
    return globalForRedis.upstashClient;
  }

  try {
    globalForRedis.upstashClient = UpstashRedis.fromEnv();
    return globalForRedis.upstashClient;
  } catch (error) {
    warnOnce(
      "upstash_init_error",
      `[cache] upstash init failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return null;
  }
}

async function getLocalRedisClient() {
  if (globalForRedis.localClient?.isOpen) {
    return globalForRedis.localClient;
  }

  if (globalForRedis.localConnectPromise) {
    return globalForRedis.localConnectPromise;
  }

  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const client = createClient({ url: redisUrl });

  globalForRedis.localConnectPromise = client
    .connect()
    .then(() => {
      globalForRedis.localClient = client;
      return client;
    })
    .catch((error) => {
      warnOnce(
        "local_redis_connect_error",
        `[cache] local redis unavailable (${redisUrl}): ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return null;
    })
    .finally(() => {
      globalForRedis.localConnectPromise = undefined;
    });

  return globalForRedis.localConnectPromise;
}

async function getRaw(key: string): Promise<string | null> {
  const driver = getRedisDriver();
  const namespacedKey = `${CACHE_PREFIX}:${key}`;

  try {
    if (driver === "upstash") {
      const client = getUpstashClient();
      if (!client) {
        return null;
      }

      const value = await client.get<string>(namespacedKey);
      return value ?? null;
    }

    if (driver === "local") {
      const client = await getLocalRedisClient();
      if (!client) {
        return null;
      }

      return client.get(namespacedKey);
    }

    return null;
  } catch (error) {
    warnOnce(
      `redis_get_${driver}`,
      `[cache] redis get failed (${driver}): ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return null;
  }
}

async function setRaw(key: string, value: string, ttlSeconds: number) {
  const driver = getRedisDriver();
  const namespacedKey = `${CACHE_PREFIX}:${key}`;

  try {
    if (driver === "upstash") {
      const client = getUpstashClient();
      if (!client) {
        return false;
      }

      await client.set(namespacedKey, value, { ex: ttlSeconds });
      return true;
    }

    if (driver === "local") {
      const client = await getLocalRedisClient();
      if (!client) {
        return false;
      }

      await client.set(namespacedKey, value, { EX: ttlSeconds });
      return true;
    }
    return false;
  } catch (error) {
    warnOnce(
      `redis_set_${driver}`,
      `[cache] redis set failed (${driver}): ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return false;
  }
}

async function deleteRaw(key: string) {
  const driver = getRedisDriver();
  const namespacedKey = `${CACHE_PREFIX}:${key}`;

  try {
    if (driver === "upstash") {
      const client = getUpstashClient();
      if (!client) {
        return;
      }

      await client.del(namespacedKey);
      return;
    }

    if (driver === "local") {
      const client = await getLocalRedisClient();
      if (!client) {
        return;
      }

      await client.del(namespacedKey);
    }
  } catch (error) {
    warnOnce(
      `redis_del_${driver}`,
      `[cache] redis delete failed (${driver}): ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const raw = await getRaw(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson<T>(
  key: string,
  value: T,
  ttlSeconds: number,
) {
  return setRaw(key, JSON.stringify(value), ttlSeconds);
}

export async function redisDelete(key: string) {
  await deleteRaw(key);
}
