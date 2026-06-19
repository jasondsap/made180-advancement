import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConstants";

/**
 * Edge guard for /app/*: if there's no session cookie, bounce to login. Full
 * cryptographic verification (and role checks) happen in the /app server layout
 * via getAppUser() — middleware only does the cheap presence gate so unrelated
 * Node-only auth code never enters the Edge bundle.
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasSession) {
    const url = new URL("/api/auth/login", req.url);
    url.searchParams.set("returnTo", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard the admin app, but never the auth routes or the error page.
  matcher: ["/app/:path*"],
};
