import { NextResponse } from "next/server";
import { getLogoutUrl } from "@/lib/cognito";
import { SESSION_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/authConstants";

export const runtime = "nodejs";

/** Clear our session and bounce through the Cognito Hosted UI logout. */
export async function GET() {
  const res = NextResponse.redirect(getLogoutUrl());
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(ACTIVE_ORG_COOKIE);
  return res;
}
