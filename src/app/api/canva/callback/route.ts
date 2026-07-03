import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { flags } from "@/lib/featureFlags";
import { encryptSecret } from "@/lib/crypto";
import { verifyOauthCookie, exchangeCode, getCanvaUser, OAUTH_COOKIE, CANVA_SCOPES } from "@/lib/canva";
import { upsertConnection } from "@/repositories/canvaConnections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canva OAuth redirect URI: verify state, exchange code, store encrypted tokens. */
export async function GET(req: NextRequest) {
  if (!flags().canva) return NextResponse.json({ error: "not found" }, { status: 404 });
  const base = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const settings = (q: string) => NextResponse.redirect(`${base}/app/settings?canva=${q}`, 302);

  const auth = await getAuthContext();
  if (!auth) return NextResponse.redirect(`${base}/auth/signin`, 302);

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return settings("denied");

  const code = params.get("code");
  const state = params.get("state");
  const cookie = verifyOauthCookie(req.cookies.get(OAUTH_COOKIE)?.value);
  if (!code || !state || !cookie || cookie.state !== state) {
    console.warn("[canva] callback state mismatch or missing code");
    return settings("error");
  }

  try {
    const tokens = await exchangeCode(code, cookie.verifier);
    const canvaUser = await getCanvaUser(tokens.access_token);
    await upsertConnection(auth.user.id, {
      canvaUserId: canvaUser.id,
      displayName: canvaUser.displayName,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: CANVA_SCOPES,
    });
  } catch (e) {
    console.error("[canva] token exchange failed", e);
    return settings("error");
  }

  const res = settings("connected");
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}
