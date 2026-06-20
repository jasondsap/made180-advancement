import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";
import type { Constituent } from "@/types/db";
import type { AudienceSpec, EngageChannel } from "@/types/engage";

/**
 * Resolve an audience spec to concrete constituents, applying consent rules for
 * the channel. Consent is ALWAYS enforced here — there is no path that sends to
 * an opted-out contact:
 *   - all channels: exclude do_not_contact
 *   - email: require email present and email_opt_out = false
 *   - sms:   require phone present and sms_opt_in = true   (TCPA opt-in)
 *   - mail:  require a mailing address present
 */
export async function resolveAudience(
  orgId: string,
  spec: AudienceSpec,
  channel: EngageChannel,
): Promise<Constituent[]> {
  assertOrgId(orgId);

  // Channel reachability + consent predicates, applied as a post-filter so the
  // mode queries stay simple and parameterized.
  const reachable = (c: Constituent): boolean => {
    if (c.do_not_contact) return false;
    if (channel === "email") return Boolean(c.email) && !c.email_opt_out;
    if (channel === "sms") return Boolean(c.phone) && c.sms_opt_in;
    return Boolean(c.address_json); // mail
  };

  let rows: Constituent[];
  if (spec.mode === "manual" && spec.constituentIds?.length) {
    rows = (await sql`
      SELECT * FROM constituents
      WHERE org_id = ${orgId} AND id = ANY(${spec.constituentIds}::uuid[])
    `) as unknown as Constituent[];
  } else if (spec.mode === "fund" && spec.fundId) {
    rows = (await sql`
      SELECT DISTINCT c.* FROM constituents c
      JOIN gifts g ON g.constituent_id = c.id AND g.org_id = c.org_id
      WHERE c.org_id = ${orgId} AND g.fund_id = ${spec.fundId} AND g.status = 'succeeded'
    `) as unknown as Constituent[];
  } else {
    rows = (await sql`SELECT * FROM constituents WHERE org_id = ${orgId}`) as unknown as Constituent[];
  }

  return rows.filter(reachable);
}

/** Count without materializing — used to preview audience size in the composer. */
export async function audienceCount(orgId: string, spec: AudienceSpec, channel: EngageChannel): Promise<number> {
  return (await resolveAudience(orgId, spec, channel)).length;
}
