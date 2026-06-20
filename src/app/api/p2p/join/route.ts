/**
 * POST /api/p2p/join — public self-serve "start fundraising" for a peer-to-peer
 * enabled fundraiser. Creates a p2p_member (and matches/creates a constituent),
 * returning the member's public page URL.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrgBySlug } from "@/repositories/orgs";
import { getPublishedFundraiser } from "@/repositories/fundraisers";
import { createMember, memberSlugExists } from "@/repositories/p2pMembers";
import { upsertConstituentByEmail } from "@/repositories/constituents";

export const runtime = "nodejs";

const BodySchema = z.object({
  orgSlug: z.string().trim().min(1),
  fundraiserSlug: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  goal: z.number().int().min(0).max(100_000_00).optional(),
  message: z.string().trim().max(2000).optional(),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid request" : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const org = await getOrgBySlug(body.orgSlug);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const fr = await getPublishedFundraiser(body.orgSlug, body.fundraiserSlug);
  if (!fr || !fr.features.includes("peer_to_peer")) {
    return NextResponse.json({ error: "This fundraiser isn't accepting fundraisers." }, { status: 404 });
  }

  const { constituent } = await upsertConstituentByEmail(org.id, {
    email: body.email,
    firstName: body.name.split(/\s+/)[0] ?? null,
    lastName: body.name.split(/\s+/).slice(1).join(" ") || null,
    source: "p2p",
  });

  // Unique slug within this fundraiser.
  const base = slugify(body.name) || "fundraiser";
  let slug = base;
  let n = 1;
  while (await memberSlugExists(fr.id, slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }

  const member = await createMember(org.id, fr.id, {
    name: body.name,
    slug,
    constituentId: constituent.id,
    goalCents: body.goal ?? null,
    message: body.message ?? null,
  });

  return NextResponse.json({ url: `/give/${org.slug}/${fr.slug}/p/${member.slug}`, slug: member.slug });
}
