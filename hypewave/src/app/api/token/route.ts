import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/server/spotify-auth";
import { setSessionCookies, COOKIE } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SKEW_MS = 30_000; // refresh a little early

export async function GET(req: NextRequest) {
  const access = req.cookies.get(COOKIE.access)?.value;
  const expiresAt = Number(req.cookies.get(COOKIE.expires)?.value ?? 0);
  const refresh = req.cookies.get(COOKIE.refresh)?.value;

  const stillValid = access && expiresAt - SKEW_MS > Date.now();
  if (stillValid) {
    return NextResponse.json({ access_token: access, expires_at: expiresAt });
  }

  if (!refresh) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const tokens = await refreshAccessToken(refresh);
    if (!tokens.refresh_token) tokens.refresh_token = refresh; // Spotify may omit it
    const expires = Date.now() + tokens.expires_in * 1000;
    const res = NextResponse.json({ access_token: tokens.access_token, expires_at: expires });
    setSessionCookies(res, tokens);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "refresh failed" },
      { status: 401 }
    );
  }
}
