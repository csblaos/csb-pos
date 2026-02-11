import { cookies, headers } from "next/headers";
import { cache } from "react";

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

export type { AppSession } from "@/lib/auth/session-types";

const SESSION_TOKEN_KEY_PREFIX = "auth:session-token";
const USER_TOKEN_VERSION_KEY_PREFIX = "auth:user-token-version";
const USER_TOKEN_VERSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";

const sessionTokenCacheKey = (tokenId: string) =>
  `${SESSION_TOKEN_KEY_PREFIX}:${tokenId}`;
const userTokenVersionCacheKey = (userId: string) =>
  `${USER_TOKEN_VERSION_KEY_PREFIX}:${userId}`;

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

  if (AUTH_DEBUG) {
    console.info(
      `[auth] invalidateUserSessions user=${userId} version=${nextVersion} ok=${stored ? "yes" : "no"}`,
    );
  }

  return stored;
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
