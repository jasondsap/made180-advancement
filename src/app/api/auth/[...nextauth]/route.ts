import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { getAuthOptions } from "@/lib/auth-options";

export const runtime = "nodejs";

// Build options per request so env vars are only required at runtime, not build.
function handler(req: NextRequest, ctx: unknown): Promise<Response> {
  return (NextAuth(getAuthOptions()) as (r: NextRequest, c: unknown) => Promise<Response>)(req, ctx);
}

export { handler as GET, handler as POST };
