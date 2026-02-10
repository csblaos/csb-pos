import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseSessionId, SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

const APP_PATHS = ["/dashboard", "/orders", "/stock", "/products", "/reports", "/settings"];
const ONBOARDING_PATH = "/onboarding";

const isAppPath = (pathname: string) =>
  APP_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const isOnboardingPath = (pathname: string) =>
  pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);

export const authMiddleware = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionId = parseSessionId(sessionCookie);
  const hasSession = Boolean(sessionId);
  const appPath = isAppPath(pathname);
  const onboardingPath = isOnboardingPath(pathname);

  if (!hasSession && (appPath || onboardingPath)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!hasSession) {
    return NextResponse.next();
  }

  return NextResponse.next();
};
