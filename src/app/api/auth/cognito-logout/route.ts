import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Federated logout: after NextAuth clears its own session cookie (via signOut),
 * bounce through the Cognito Hosted UI /logout so the IdP session is cleared too,
 * then land back on our sign-in page.
 */
export async function GET(req: NextRequest) {
  const base = (env().APP_BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
  const signin = `${base}/auth/signin`;
  const domain = (env().COGNITO_DOMAIN || "").replace(/\/$/, "");
  const clientId = env().COGNITO_CLIENT_ID;
  if (!domain || !clientId) return NextResponse.redirect(signin);

  const logoutUrl =
    `${domain}/logout?client_id=${encodeURIComponent(clientId)}` +
    `&logout_uri=${encodeURIComponent(signin)}`;
  return NextResponse.redirect(logoutUrl);
}
