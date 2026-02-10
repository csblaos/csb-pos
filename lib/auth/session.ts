import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";

import { redisDelete, redisGetJson, redisSetJson } from "@/lib/cache/redis";
import {
  clearSessionCookie,
  parseSessionId,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session-cookie";

const sessionSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  hasStoreMembership: z.boolean(),
  activeStoreId: z.string().nullable(),
  activeStoreName: z.string().nullable(),
  activeRoleId: z.string().nullable(),
  activeRoleName: z.string().nullable(),
});

export type AppSession = z.infer<typeof sessionSchema>;
const SESSION_KEY_PREFIX = "auth:session";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";

const sessionCacheKey = (sessionId: string) => `${SESSION_KEY_PREFIX}:${sessionId}`;

const createSessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

export class SessionStoreUnavailableError extends Error {
  constructor() {
    super("SESSION_STORE_UNAVAILABLE");
  }
}

export async function createSessionCookie(session: AppSession) {
  const sessionId = createSessionId();
  const parsed = sessionSchema.parse(session);

  const stored = await redisSetJson(
    sessionCacheKey(sessionId),
    parsed,
    SESSION_TTL_SECONDS,
  );
  if (!stored) {
    if (AUTH_DEBUG) {
      console.warn("[auth] createSessionCookie failed to persist session");
    }
    throw new SessionStoreUnavailableError();
  }

  if (AUTH_DEBUG) {
    console.info(
      `[auth] session created id=${sessionId.slice(0, 8)}... user=${parsed.userId} store=${parsed.activeStoreId ?? "-"}`,
    );
  }

  return {
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    options: sessionCookieOptions,
  };
}

export async function deleteSessionById(sessionId?: string | null) {
  const normalizedSessionId = parseSessionId(sessionId);
  if (!normalizedSessionId) {
    return;
  }

  await redisDelete(sessionCacheKey(normalizedSessionId));
}

export async function getSessionIdFromCookieStore() {
  const cookieStore = await cookies();
  return parseSessionId(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

const readSession = async () => {
  const sessionId = await getSessionIdFromCookieStore();
  if (!sessionId) {
    if (AUTH_DEBUG) {
      console.info("[auth] readSession: missing session cookie");
    }
    return null;
  }

  const rawSession = await redisGetJson<unknown>(sessionCacheKey(sessionId));
  if (!rawSession) {
    if (AUTH_DEBUG) {
      console.warn(`[auth] readSession: cache miss id=${sessionId.slice(0, 8)}...`);
    }
    return null;
  }

  const parsed = sessionSchema.safeParse(rawSession);
  if (!parsed.success) {
    if (AUTH_DEBUG) {
      console.warn(
        `[auth] readSession: invalid payload id=${sessionId.slice(0, 8)}...`,
      );
    }
    await deleteSessionById(sessionId);
    return null;
  }

  if (AUTH_DEBUG) {
    console.info(
      `[auth] readSession: ok id=${sessionId.slice(0, 8)}... user=${parsed.data.userId}`,
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
  parseSessionId,
};
