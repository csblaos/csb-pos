"use client";

import { parseSessionToken } from "@/lib/auth/session-cookie";

export const AUTH_TOKEN_STORAGE_KEY = "csb_pos_auth_token";

export function getClientAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseSessionToken(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
}

export function setClientAuthToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = parseSessionToken(token);
  if (!normalizedToken) {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalizedToken);
}

export function clearClientAuthToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const requestHeaders = new Headers(init?.headers);
  const token = getClientAuthToken();

  if (token && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers: requestHeaders,
  });
}
