import { cookies, headers } from "next/headers";
import { cache } from "react";
import { eq } from "drizzle-orm";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import {
  clearSessionCookie,
  parseSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session-cookie";
import {
  createSessionToken,
  verifySessionTokenClaims,
} from "@/lib/auth/session-token";
import { sessionSchema, type AppSession } from "@/lib/auth/session-types";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getGlobalSessionPolicy } from "@/lib/system-config/policy";

export type { AppSession } from "@/lib/auth/session-types";

const SESSION_TOKEN_KEY_PREFIX = "auth:session-token";
const USER_TOKEN_VERSION_KEY_PREFIX = "auth:user-token-version";
const USER_ACTIVE_SESSIONS_KEY_PREFIX = "auth:user-active-sessions";
const USER_TOKEN_VERSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";

const sessionTokenCacheKey = (tokenId: string) =>
  `${SESSION_TOKEN_KEY_PREFIX}:${tokenId}`;
const userTokenVersionCacheKey = (userId: string) =>
  `${USER_TOKEN_VERSION_KEY_PREFIX}:${userId}`;
const userActiveSessionsCacheKey = (userId: string) =>
  `${USER_ACTIVE_SESSIONS_KEY_PREFIX}:${userId}`;

type ActiveSessionRef = {
  jti: string;
  issuedAt: number;
};

const isRedisSessionCheckEnabled = () => {
  const configured = process.env.AUTH_JWT_REDIS_CHECK?.trim().toLowerCase();
  return configured !== "0" && configured !== "false" && configured !== "off";
};

const createTokenId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

const parseTokenVersion = (rawValue: unknown) => {
  if (typeof rawValue !== "number") {
    return null;
  }

  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return null;
  }

  return rawValue;
};

const parseSessionLimit = (rawValue: unknown) => {
  if (typeof rawValue !== "number" || !Number.isInteger(rawValue) || rawValue <= 0) {
    return null;
  }

  return rawValue;
};

const isActiveSessionRef = (rawValue: unknown): rawValue is ActiveSessionRef => {
  if (typeof rawValue !== "object" || rawValue === null) {
    return false;
  }

  const value = rawValue as { jti?: unknown; issuedAt?: unknown };
  return (
    typeof value.jti === "string" &&
    value.jti.length >= 16 &&
    typeof value.issuedAt === "number" &&
    Number.isFinite(value.issuedAt) &&
    value.issuedAt > 0
  );
};

const normalizeActiveSessionRefs = (rawValue: unknown): ActiveSessionRef[] => {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const dedup = new Map<string, ActiveSessionRef>();
  for (const item of rawValue) {
    if (!isActiveSessionRef(item)) {
      continue;
    }

    const current = dedup.get(item.jti);
    if (!current || item.issuedAt > current.issuedAt) {
      dedup.set(item.jti, item);
    }
  }

  return [...dedup.values()].sort((a, b) => a.issuedAt - b.issuedAt);
};

const readActiveSessionRefs = async (userId: string) => {
  const raw = await redisGetJson<unknown>(userActiveSessionsCacheKey(userId));
  return normalizeActiveSessionRefs(raw);
};

const writeActiveSessionRefs = async (userId: string, refs: ActiveSessionRef[]) => {
  const stored = await redisSetJson(
    userActiveSessionsCacheKey(userId),
    refs,
    USER_TOKEN_VERSION_TTL_SECONDS,
  );
  if (!stored) {
    throw new SessionStoreUnavailableError();
  }
};

const pruneMissingActiveSessionRefs = async (refs: ActiveSessionRef[]) => {
  const checks = await Promise.all(
    refs.map(async (item) => ({
      item,
      exists: Boolean(await redisGetJson<unknown>(sessionTokenCacheKey(item.jti))),
    })),
  );

  return checks.filter((row) => row.exists).map((row) => row.item);
};

const getUserSessionLimitOverride = async (userId: string) => {
  const [row] = await db
    .select({ sessionLimit: users.sessionLimit })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return parseSessionLimit(row?.sessionLimit);
};

const getEffectiveSessionLimit = async (userId: string) => {
  const overrideLimit = await getUserSessionLimitOverride(userId);
  if (overrideLimit) {
    return overrideLimit;
  }

  const globalPolicy = await getGlobalSessionPolicy();
  return globalPolicy.defaultSessionLimit;
};

async function enforceSessionLimit(userId: string, nextSession?: ActiveSessionRef) {
  const limit = await getEffectiveSessionLimit(userId);
  const existingRefs = await readActiveSessionRefs(userId);
  const prunedRefs = await pruneMissingActiveSessionRefs(existingRefs);

  const merged = [...prunedRefs];
  if (nextSession) {
    const withoutSameToken = merged.filter((item) => item.jti !== nextSession.jti);
    merged.splice(0, merged.length, ...withoutSameToken, nextSession);
  }

  merged.sort((a, b) => a.issuedAt - b.issuedAt);
  const revoked: ActiveSessionRef[] = [];

  while (merged.length > limit) {
    const oldest = merged.shift();
    if (oldest) {
      revoked.push(oldest);
    }
  }

  await Promise.all(revoked.map((item) => redisDelete(sessionTokenCacheKey(item.jti))));
  await writeActiveSessionRefs(userId, merged);

  if (AUTH_DEBUG) {
    console.info(
      `[auth] enforceSessionLimit user=${userId} limit=${limit} active=${merged.length} revoked=${revoked.length}`,
    );
  }
}

async function removeActiveSessionRef(userId: string, tokenId: string) {
  const existingRefs = await readActiveSessionRefs(userId);
  const nextRefs = existingRefs.filter((item) => item.jti !== tokenId);
  await writeActiveSessionRefs(userId, nextRefs);
}

export class SessionStoreUnavailableError extends Error {
  constructor() {
    super("SESSION_STORE_UNAVAILABLE");
  }
}

async function getOrCreateUserTokenVersion(userId: string) {
  const current = parseTokenVersion(
    await redisGetJson<unknown>(userTokenVersionCacheKey(userId)),
  );
  if (current) {
    return current;
  }

  const defaultVersion = 1;
  const stored = await redisSetJson(
    userTokenVersionCacheKey(userId),
    defaultVersion,
    USER_TOKEN_VERSION_TTL_SECONDS,
  );
  if (!stored) {
    throw new SessionStoreUnavailableError();
  }

  return defaultVersion;
}

async function getUserTokenVersion(userId: string) {
  return parseTokenVersion(await redisGetJson<unknown>(userTokenVersionCacheKey(userId)));
}

export async function createSessionCookie(session: AppSession) {
  const parsed = sessionSchema.parse(session);
  const tokenId = createTokenId();
  let tokenVersion = 1;

  if (isRedisSessionCheckEnabled()) {
    tokenVersion = await getOrCreateUserTokenVersion(parsed.userId);
  }

  const token = await createSessionToken(parsed, {
    jti: tokenId,
    tokenVersion,
  });

  if (isRedisSessionCheckEnabled()) {
    const stored = await redisSetJson(
      sessionTokenCacheKey(tokenId),
      { userId: parsed.userId, tokenVersion },
      SESSION_TTL_SECONDS,
    );
    if (!stored) {
      if (AUTH_DEBUG) {
        console.warn("[auth] createSessionCookie failed to persist token state");
      }
      throw new SessionStoreUnavailableError();
    }

    await enforceSessionLimit(parsed.userId, {
      jti: tokenId,
      issuedAt: Date.now(),
    });
  }

  if (AUTH_DEBUG) {
    console.info(
      `[auth] session token created id=${tokenId.slice(0, 8)}... user=${parsed.userId} store=${parsed.activeStoreId ?? "-"} redisCheck=${isRedisSessionCheckEnabled() ? "on" : "off"}`,
    );
  }

  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    options: sessionCookieOptions,
  };
}

export async function deleteSessionById(sessionToken?: string | null) {
  const normalizedSessionToken = parseSessionToken(sessionToken);
  if (!normalizedSessionToken || !isRedisSessionCheckEnabled()) {
    return;
  }

  const claims = await verifySessionTokenClaims(normalizedSessionToken);
  if (!claims) {
    return;
  }

  await redisDelete(sessionTokenCacheKey(claims.jti));
  try {
    await removeActiveSessionRef(claims.userId, claims.jti);
  } catch (error) {
    if (AUTH_DEBUG) {
      console.warn(
        `[auth] deleteSessionById cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}

export async function getSessionTokenFromCookieStore() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

function parseBearerToken(rawAuthorizationHeader?: string | null) {
  if (!rawAuthorizationHeader) {
    return null;
  }

  const match = rawAuthorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    return null;
  }

  return parseSessionToken(match[1]);
}

export async function getSessionTokenFromAuthorizationHeader() {
  const requestHeaders = await headers();
  return parseBearerToken(requestHeaders.get("authorization"));
}

export async function getSessionTokenFromRequest() {
  const authorizationToken = await getSessionTokenFromAuthorizationHeader();
  if (authorizationToken) {
    return authorizationToken;
  }

  return getSessionTokenFromCookieStore();
}

export async function invalidateUserSessions(userId: string) {
  if (!isRedisSessionCheckEnabled()) {
    return false;
  }

  const currentVersion = (await getUserTokenVersion(userId)) ?? 1;
  const nextVersion = currentVersion + 1;
  const stored = await redisSetJson(
    userTokenVersionCacheKey(userId),
    nextVersion,
    USER_TOKEN_VERSION_TTL_SECONDS,
  );
  await redisDelete(userActiveSessionsCacheKey(userId));

  if (AUTH_DEBUG) {
    console.info(
      `[auth] invalidateUserSessions user=${userId} version=${nextVersion} ok=${stored ? "yes" : "no"}`,
    );
  }

  return stored;
}

export async function enforceUserSessionLimitNow(userId: string) {
  if (!isRedisSessionCheckEnabled()) {
    return false;
  }

  await enforceSessionLimit(userId);
  return true;
}

const readSession = async () => {
  const sessionToken = await getSessionTokenFromRequest();
  if (!sessionToken) {
    if (AUTH_DEBUG) {
      console.info("[auth] readSession: missing bearer token and session cookie");
    }
    return null;
  }

  const claims = await verifySessionTokenClaims(sessionToken);
  if (!claims) {
    if (AUTH_DEBUG) {
      console.warn("[auth] readSession: invalid token");
    }
    return null;
  }

  if (isRedisSessionCheckEnabled()) {
    const tokenState = await redisGetJson<unknown>(sessionTokenCacheKey(claims.jti));
    if (!tokenState) {
      if (AUTH_DEBUG) {
        console.warn(`[auth] readSession: token revoked id=${claims.jti.slice(0, 8)}...`);
      }
      return null;
    }

    const currentVersion = await getUserTokenVersion(claims.userId);
    if (!currentVersion || claims.tokenVersion !== currentVersion) {
      if (AUTH_DEBUG) {
        console.warn(
          `[auth] readSession: token version mismatch id=${claims.jti.slice(0, 8)}...`,
        );
      }
      return null;
    }
  }

  const parsed = sessionSchema.safeParse(claims);
  if (!parsed.success) {
    return null;
  }

  if (AUTH_DEBUG) {
    console.info(
      `[auth] readSession: ok id=${claims.jti.slice(0, 8)}... user=${parsed.data.userId}`,
    );
  }

  return parsed.data;
};

const getSessionForRequest = cache(readSession);

export const getSession = async () => getSessionForRequest();

export {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  clearSessionCookie,
  parseSessionToken,
};
