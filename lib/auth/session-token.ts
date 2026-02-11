import jwt from "jsonwebtoken";
import { z } from "zod";

import { SESSION_TTL_SECONDS } from "@/lib/auth/session-cookie";
import { sessionSchema, type AppSession } from "@/lib/auth/session-types";

const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";
const JWT_ALGORITHM = "HS256";
const JWT_TYPE = "JWT";
const FALLBACK_DEV_SECRET = "csb-pos-dev-jwt-secret-change-me";

const sessionTokenClaimsSchema = sessionSchema.extend({
  jti: z.string().min(16).max(128),
  tokenVersion: z.number().int().positive(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});
export type SessionTokenClaims = z.infer<typeof sessionTokenClaimsSchema>;

let warnedMissingSecret = false;

function getJwtSecret() {
  const configuredSecret = process.env.AUTH_JWT_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_JWT_SECRET is required in production");
  }

  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      "[auth] AUTH_JWT_SECRET is not set; using an insecure development fallback secret",
    );
  }

  return FALLBACK_DEV_SECRET;
}


const createTokenId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

export async function createSessionToken(
  session: AppSession,
  options?: { jti?: string; tokenVersion?: number },
) {
  const normalizedSession = sessionSchema.parse(session);
  const tokenId = options?.jti ?? createTokenId();
  const tokenVersion = options?.tokenVersion ?? 1;

  return jwt.sign(
    {
      ...normalizedSession,
      tokenVersion,
    },
    getJwtSecret(),
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: SESSION_TTL_SECONDS,
      jwtid: tokenId,
      header: {
        alg: JWT_ALGORITHM,
        typ: JWT_TYPE,
      },
    },
  );
}

async function parseAndVerifySessionTokenClaims(
  token: string,
): Promise<SessionTokenClaims | null> {
  try {
    const verified = jwt.verify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
      complete: true,
    });

    if (typeof verified === "string") {
      return null;
    }

    if (verified.header.alg !== JWT_ALGORITHM || verified.header.typ !== JWT_TYPE) {
      return null;
    }

    if (typeof verified.payload === "string") {
      return null;
    }

    const parsedClaims = sessionTokenClaimsSchema.safeParse(verified.payload);
    if (!parsedClaims.success) {
      return null;
    }

    return parsedClaims.data;
  } catch (error) {
    if (AUTH_DEBUG) {
      console.warn(
        `[auth] verifySessionToken failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    return null;
  }
}

export async function verifySessionTokenClaims(token: string) {
  return parseAndVerifySessionTokenClaims(token);
}

export async function verifySessionToken(token: string): Promise<AppSession | null> {
  const claims = await parseAndVerifySessionTokenClaims(token);
  if (!claims) {
    return null;
  }

  return sessionSchema.parse(claims);
}
