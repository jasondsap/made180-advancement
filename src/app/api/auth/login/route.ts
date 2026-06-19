import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizeUrl } from "@/lib/cognito";
import { env } from "@/lib/env";
import { STATE_COOKIE } from "@/lib/authConstants";

export const runtime = "nodejs";

/** Kick off the Cognito Hosted UI login (Authorization Code flow). */
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/app";
  // state = csrf token + where to return; verified in the callback.
  const csrf = randomUUID();
  const state = `${csrf}:${encodeURIComponent(returnTo)}`;

  const res = NextResponse.redirect(getAuthorizeUrl(state));
  res.cookies.set(STATE_COOKIE, csrf, {
    httpOnly: true,
    secure: env().APP_BASE_URL.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
