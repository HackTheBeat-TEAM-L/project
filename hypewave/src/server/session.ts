import type { NextResponse } from "next/server";
import type { SpotifyTokens } from "./spotify-auth";

const COMMON = { httpOnly: true as const, sameSite: "lax" as const, path: "/" };
const LONG_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const COOKIE = {
  access: "hw_access",
  expires: "hw_expires",
  refresh: "hw_refresh",
  state: "hw_state",
} as const;

export function setSessionCookies(res: NextResponse, tokens: SpotifyTokens): void {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  res.cookies.set(COOKIE.access, tokens.access_token, {
    ...COMMON,
    maxAge: tokens.expires_in,
  });
  res.cookies.set(COOKIE.expires, String(expiresAt), { ...COMMON, maxAge: LONG_MAX_AGE });
  if (tokens.refresh_token) {
    res.cookies.set(COOKIE.refresh, tokens.refresh_token, { ...COMMON, maxAge: LONG_MAX_AGE });
  }
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.delete(COOKIE.access);
  res.cookies.delete(COOKIE.expires);
  res.cookies.delete(COOKIE.refresh);
}
