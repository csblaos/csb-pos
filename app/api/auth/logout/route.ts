import { clearSessionResponse } from "@/lib/auth/session-db";
import { getSessionTokenFromRequest } from "@/lib/auth/session";

export async function POST() {
  const sessionToken = await getSessionTokenFromRequest();
  return clearSessionResponse({ ok: true }, { sessionId: sessionToken });
}
