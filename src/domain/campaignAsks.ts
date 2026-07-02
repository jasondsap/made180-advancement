import { getAnthropic, ASSISTANT_MODEL } from "@/lib/anthropic";
import { getOrgById } from "@/repositories/orgs";
import { getCampaignById } from "@/repositories/campaigns";
import { campaignSummary } from "@/repositories/campaignStats";
import { CAMPAIGN_SEGMENTS, type CampaignSegmentKey } from "@/repositories/campaignSegments";
import { usd } from "@/lib/format";

/**
 * AI-drafted appeal copy for a campaign segment. The model writes with merge
 * tags and a literal {{appeal_link}} CTA token — the send action substitutes
 * the real tracking link once the appeal row exists (drafts never orphan
 * appeal rows). Forced tool call = structured subject/body, no text parsing.
 */
export interface AppealDraft {
  subject: string;
  bodyMd: string;
}

const DRAFT_TOOL = {
  name: "draft_appeal",
  description: "Return the drafted fundraising appeal email.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "Email subject line, under 65 characters." },
      body_md: {
        type: "string",
        description:
          "Email body in minimal markdown (**bold**, [link](url), blank lines between paragraphs).",
      },
    },
    required: ["subject", "body_md"],
  },
};

export async function draftAppealCopy(
  orgId: string,
  input: { campaignId: string; segmentKey: CampaignSegmentKey; askAmountCents?: number | null },
): Promise<AppealDraft> {
  const campaign = await getCampaignById(orgId, input.campaignId);
  if (!campaign) throw new Error("campaign not found");
  const [org, summary] = await Promise.all([
    getOrgById(orgId),
    campaignSummary(orgId, campaign.id),
  ]);
  const segment = CAMPAIGN_SEGMENTS[input.segmentKey];
  if (!segment) throw new Error("unknown segment");

  const signer = org?.receipt_signature_name || `The ${org?.legal_name ?? "team"}`;
  const goalLine = campaign.goal_cents
    ? `The campaign goal is ${usd(campaign.goal_cents)}; ${usd(summary.raisedCents)} has been raised so far from ${summary.donorCount} donor(s).`
    : `${usd(summary.raisedCents)} has been raised so far from ${summary.donorCount} donor(s).`;
  const askLine = input.askAmountCents ? `Suggest a gift of ${usd(input.askAmountCents)}.` : "";

  const anthropic = getAnthropic();
  const msg = await anthropic.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 700,
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_appeal" },
    messages: [
      {
        role: "user",
        content:
          `Draft a warm, sincere fundraising appeal email (about 180 words) for ${org?.legal_name ?? "a nonprofit"}. ` +
          `Campaign: "${campaign.name}". ${campaign.description ? `About the campaign: ${campaign.description} ` : ""}` +
          `${goalLine} ` +
          `The audience is ${segment.description}. Speak to that relationship directly. ${askLine} ` +
          `Requirements: greet the reader with the literal merge tag {{contact.first_name}} (do not substitute a name). ` +
          `Include exactly one call-to-action link written literally as [Give now]({{appeal_link}}) — keep the {{appeal_link}} token exactly as-is. ` +
          `Use minimal markdown only (**bold**, blank lines between paragraphs). ` +
          `Do not invent facts, statistics, program details, or deadlines beyond what is stated above. ` +
          `Sign it from ${signer}.`,
      },
    ],
  });

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("model returned no draft");
  const out = tool.input as { subject?: string; body_md?: string };
  if (!out.subject || !out.body_md) throw new Error("model draft incomplete");
  return { subject: out.subject.trim(), bodyMd: out.body_md.trim() };
}
