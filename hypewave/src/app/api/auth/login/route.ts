import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl } from "@/server/spotify-auth";
import { COOKIE } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = randomBytes(16).toString("hex");
    const res = NextResponse.redirect(buildAuthorizeUrl(state));
    res.cookies.set(COOKIE.state, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "auth init failed" },
      { status: 500 }
    );
  }
}
