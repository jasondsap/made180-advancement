import { neon } from "@neondatabase/serverless";
import { requireEnv } from "@/lib/env";

/**
 * Neon HTTP client for app request-time queries, over the POOLED connection.
 *
 * `sql` is a tagged-template function:
 *
 *   const rows = await sql`SELECT * FROM orgs WHERE slug = ${slug}`;
 *
 * Values interpolated into the template are sent as bound parameters, never
 * string-concatenated — so this is parameterized/SQL-injection-safe by default.
 *
 * Tenancy note: this is the low-level driver. Feature code must NOT call `sql`
 * directly with ad-hoc queries — it goes through the orgId-scoped repository
 * layer (src/repositories/*) so every query carries an org_id filter. That
 * layer lands in step 3.
 */
type NeonClient = ReturnType<typeof neon>;

let cached: NeonClient | null = null;

export function getSql(): NeonClient {
  if (!cached) {
    cached = neon(requireEnv("DATABASE_URL"));
  }
  return cached;
}

/**
 * Lazily-initialized `sql` tagged-template client. A Proxy forwards both the
 * tagged-template call and any property/method access to the real Neon client,
 * resolving env on first use rather than at import/build time.
 */
export const sql: NeonClient = new Proxy((() => {}) as unknown as NeonClient, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop, receiver) {
    return Reflect.get(getSql() as object, prop, receiver);
  },
});
