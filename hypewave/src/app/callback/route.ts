import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/server/spotify-auth";
import { setSessionCookies, COOKIE } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");
  const cookieState = req.cookies.get(COOKIE.state)?.value;

  const home = (params: string) => new URL(`/?${params}`, req.url);

  if (authError) return NextResponse.redirect(home(`auth_error=${encodeURIComponent(authError)}`));
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
