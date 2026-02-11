export const SESSION_COOKIE_NAME = "csb_pos_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_SESSION_TOKEN_LENGTH = 4096;

const resolveSecureCookie = () => {
  const override = process.env.SESSION_COOKIE_SECURE?.trim();
  if (override === "1") {
    return true;
  }

  if (override === "0") {
    return false;
  }

  return process.env.NODE_ENV === "production";
};

export const sessionCookieOptions = {
  httpOnly: true,
  secure: resolveSecureCookie(),
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export function parseSessionToken(rawValue?: string | null) {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.length > MAX_SESSION_TOKEN_LENGTH) {
    return null;
  }

  return trimmed;
}

export const clearSessionCookie = () => ({
  name: SESSION_COOKIE_NAME,
  value: "",
  options: {
    ...sessionCookieOptions,
    maxAge: 0,
  },
});
