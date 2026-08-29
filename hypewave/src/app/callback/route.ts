import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/server/spotify-auth";
import { setSessionCookies, COOKIE } from "@/server/session";
import { getEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Always redirect back to the SAME origin as the registered redirect URI
// (e.g. http://127.0.0.1:5173) — NOT req.url, which Next can normalize to
// "localhost" and drop the session cookie stored under 127.0.0.1.
function appOrigin(): string {
  return new URL(getEnv().SPOTIFY_REDIRECT_URI).origin;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");
  const cookieState = req.cookies.get(COOKIE.state)?.value;

  const home = (params: string) => new URL(`/?${params}`, appOrigin());

  if (authError) {
    return NextResponse.redirect(home(`auth_error=${encodeURIComponent(authError)}`));
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(home("auth_error=state_mismatch"));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const res = NextResponse.redirect(home("connected=1"));
    setSessionCookies(res, tokens);
    res.cookies.delete(COOKIE.state);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "token exchange failed";
    return NextResponse.redirect(home(`auth_error=${encodeURIComponent(msg)}`));
  }
}
