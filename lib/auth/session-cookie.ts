export const SESSION_COOKIE_NAME = "csb_pos_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export function parseSessionId(rawValue?: string | null) {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.length > 256) {
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
