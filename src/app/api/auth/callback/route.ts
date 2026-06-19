import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, verifyIdToken } from "@/lib/cognito";
import { env } from "@/lib/env";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/authConstants";

export const runtime = "nodejs";

/** OAuth callback: verify state, exchange code, set the session cookie. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");
  const base = env().APP_BASE_URL.replace(/\/$/, "");

  if (error) {
    return NextResponse.redirect(`${base}/auth-error?reason=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/auth-error?reason=missing_code`);
  }

  // CSRF: the state's csrf half must match the cookie we set at login.
  const [csrf, returnToRaw] = state.split(":");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!csrf || !expected || csrf !== expected) {
    return NextResponse.redirect(`${base}/auth-error?reason=bad_state`);
  }
  const returnTo = safeReturn(returnToRaw ? decodeURIComponent(returnToRaw) : "/app");

  let idToken: string;
  try {
    const tokens = await exchangeCodeForTokens(code);
    idToken = tokens.id_token;
    await verifyIdToken(idToken); // fail fast if the token is bad
  } catch (e) {
    console.error("[auth] callback failed", e);
    return NextResponse.redirect(`${base}/auth-error?reason=token_exchange`);
  }

  const res = NextResponse.redirect(`${base}${returnTo}`);
  res.cookies.set(SESSION_COOKIE, idToken, {
    httpOnly: true,
    secure: base.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 3600, // ~ id token lifetime; re-auth on expiry
  });
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** Only allow internal relative paths as the post-login destination. */
function safeReturn(p: string): string {
  return p.startsWith("/") && !p.startsWith("//") ? p : "/app";
}
