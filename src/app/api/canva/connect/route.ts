import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthContext } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { flags } from "@/lib/featureFlags";
import { makePkce, packOauthCookie, buildAuthorizeUrl, OAUTH_COOKIE } from "@/lib/canva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start the Canva OAuth flow: PKCE + state in a signed cookie, redirect out. */
export async function GET() {
  if (!flags().canva) return NextResponse.json({ error: "not found" }, { status: 404 });
  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const auth = await getAuthContext();
  if (!auth) return NextResponse.redirect(`${base}/auth/signin`, 302);

  const { verifier, challenge } = makePkce();
  const state = randomBytes(16).toString("base64url");

  const res = NextResponse.redirect(buildAuthorizeUrl({ state, codeChallenge: challenge }), 302);
  res.cookies.set(OAUTH_COOKIE, packOauthCookie(state, verifier), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/canva",
  });
  return res;
}
