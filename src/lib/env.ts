/**
 * Centralized environment access (server-only).
 *
 * Two important properties for AWS Amplify SSR:
 *  1. `env()` NEVER throws for a missing var — every field is optional. This keeps
 *     `next build` from failing during page-data collection when secrets aren't
 *     present. Code enforces what it needs at runtime via `requireEnv(...)`.
 *  2. Each var is read as a LITERAL `process.env.KEY`, not via the whole
 *     `process.env` object. Next's `next.config` `env:` block does static
 *     replacement of `process.env.KEY` at build time, so literal access is what
 *     lets those values reach the Amplify SSR Lambda at runtime.
 *
 * The migration runner (scripts/migrate.ts) reads DATABASE_URL_UNPOOLED directly.
 */

// Literal reads so `next.config` env inlining works in the Amplify Lambda.
function readEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
    STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    COGNITO_REGION: process.env.COGNITO_REGION,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_DOMAIN: process.env.COGNITO_DOMAIN,
    COGNITO_ISSUER: process.env.COGNITO_ISSUER,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_FALLBACK: process.env.RESEND_FROM_FALLBACK,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
}

export type Env = ReturnType<typeof readEnv>;
export type EnvKey = keyof Env;

/** Returns all env vars (any may be undefined). Never throws — safe at build. */
export function env(): Env {
  return readEnv();
}

/**
 * Fetch a var that a feature actually needs, throwing a clear runtime error if
 * it's missing. Use at the point of use so a missing var fails the request, not
 * the build.
 */
export function requireEnv(key: EnvKey): string {
  const value = env()[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Environment variable ${key} is required for this feature but is not set. ` +
        `Set it in .env.local (dev) or the Amplify environment variables (prod).`,
    );
  }
  return value;
}
