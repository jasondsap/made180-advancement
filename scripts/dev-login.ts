/**
 * dev-login — mint a valid NextAuth session cookie for driving the Cognito-gated
 * admin app (/app/*) locally WITHOUT the interactive Hosted UI OAuth flow.
 *
 * How it works: the app uses a JWT session signed with NEXTAUTH_SECRET (see
 * src/lib/auth-options.ts). The session callback sets session.user.id = token.sub,
 * and getAppUser() resolves the user by cognito_sub. So a token carrying an
 * existing super_admin's real cognito_sub + email decodes to a full session with
 * ZERO database writes (no reconcile path is taken).
 *
 * Usage:
 *   TOKEN=$(npx tsx scripts/dev-login.ts)                # first super_admin
 *   TOKEN=$(npx tsx scripts/dev-login.ts you@example.com) # a specific user
 *   curl -s -H "Cookie: next-auth.session-token=$TOKEN" http://localhost:3000/app/constituents
 *
 * SAFETY: refuses to run unless the app is pointed at localhost — this is a dev
 * convenience, never a production credential. It only prints a token; it needs
 * both NEXTAUTH_SECRET and a running local dev server to mean anything.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { encode } from "next-auth/jwt";

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET missing from .env.local");

  const localHint = `${process.env.NEXTAUTH_URL ?? ""} ${process.env.APP_BASE_URL ?? ""}`;
  if (localHint.trim() && !/localhost|127\.0\.0\.1/.test(localHint)) {
    throw new Error(
      `Refusing to mint a session: NEXTAUTH_URL/APP_BASE_URL is not localhost (${localHint.trim()}). ` +
        "dev-login is a local-only tool.",
    );
  }

  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!dbUrl) throw new Error("DATABASE_URL(_UNPOOLED) missing from .env.local");
  const sql = neon(dbUrl);

  const email = process.argv[2];
  const rows = (email
    ? await sql`SELECT email, cognito_sub, name FROM users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1`
    : await sql`SELECT email, cognito_sub, name FROM users WHERE is_super_admin = true ORDER BY created_at LIMIT 1`) as Array<{
    email: string;
    cognito_sub: string;
    name: string | null;
  }>;
  const user = rows[0];
  if (!user) throw new Error(email ? `No user with email ${email}` : "No super_admin user found");

  const token = await encode({
    token: { name: user.name ?? "Dev", email: user.email, sub: user.cognito_sub },
    secret,
    maxAge: 8 * 60 * 60,
  });
  // stdout = the token only (so it captures cleanly into a shell var); notes to stderr.
  process.stderr.write(`[dev-login] session for ${user.email}\n`);
  process.stdout.write(token);
}

main().catch((e) => {
  process.stderr.write(`dev-login FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
