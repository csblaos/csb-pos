import { clearSessionResponse } from "@/lib/auth/session-db";
import { getSessionIdFromCookieStore } from "@/lib/auth/session";

export async function POST() {
  const sessionId = await getSessionIdFromCookieStore();
  return clearSessionResponse({ ok: true }, { sessionId });
}
