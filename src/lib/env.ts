import { z } from "zod";

/**
 * Centralized, validated environment access (server-only).
 *
 * Validation is lazy (parsed on first `env()` call, cached) so `next build`
 * doesn't fail when secrets are absent in CI.
 *
 * Two tiers:
 *  - REQUIRED: the platform can't run a request without these.
 *  - OPTIONAL: belong to a specific feature (Connect onboarding, Cognito admin,
 *    Resend receipts, Anthropic assistant). They're validated at their point of
 *    use via `requireEnv(...)`, so an unconfigured future feature never breaks
 *    an unrelated working route.
 *
 * The migration runner (scripts/migrate.ts) deliberately does NOT import this —
 * it reads DATABASE_URL_UNPOOLED directly so it can run with a minimal env.
 */
const EnvSchema = z.object({
  // --- REQUIRED ---
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon pooled)"),
  DATABASE_URL_UNPOOLED: z
    .string()
    .min(1, "DATABASE_URL_UNPOOLED is required (Neon direct, for migrations)"),
  STRIPE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url(),

  // --- OPTIONAL (validated at point of use via requireEnv) ---
  // Connect Express onboarding (account links):
  STRIPE_CONNECT_CLIENT_ID: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  // Cognito admin auth (step 8):
  COGNITO_REGION: z.string().optional(),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_CLIENT_SECRET: z.string().optional(),
  COGNITO_DOMAIN: z.string().optional(),
  // Receipts (step 6):
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_FALLBACK: z.string().optional(),
  // AI assistant (phase 2):
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n` +
        `See .env.local.example for the full list.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Fetch a feature-specific env var, throwing a clear error if it isn't set.
 * Use at the point a feature actually needs its variable.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Environment variable ${String(key)} is required for this feature but is not set. ` +
        `Add it to .env.local (see .env.local.example).`,
    );
  }
  return value as NonNullable<Env[K]>;
}
