import { getAnthropic, ASSISTANT_MODEL } from "@/lib/anthropic";
import {
  periodTotals, raisedByFund, topDonors, recurringActiveCount,
} from "@/repositories/analytics";
import { lybunt, sybunt } from "@/repositories/reports";
import { findConstituentByEmail } from "@/repositories/constituents";
import { constituentLtv, listGiftsForConstituent, getGiftById } from "@/repositories/gifts";
import { getConstituentById } from "@/repositories/constituents";
import { getOrgById } from "@/repositories/orgs";
import { getFundById } from "@/repositories/funds";
import { usd } from "@/lib/format";

/**
 * Dori-style assistant. SAFETY: the model never writes SQL. It selects one of a
 * fixed set of intents (via a forced tool call); we run the matching org-scoped,
 * parameterized repository function. No free-form query can reach the DB, and
 * every query is bound to the caller's org.
 */
export interface QueryResult {
  answer: string;
  table?: { columns: string[]; rows: string[][] };
}

type Period = "this_month" | "ytd" | "last_12" | "all";

function sinceFor(p: Period): Date | null {
  const now = new Date();
  if (p === "this_month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (p === "ytd") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  if (p === "last_12") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return null;
}

const QUERY_TOOL = {
  name: "query_data",
  description: "Answer the user's question about donations by selecting one intent and its parameters.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        enum: ["total_raised", "top_donors", "gifts_by_fund", "recurring_donors", "lybunt", "sybunt", "find_donor", "unknown"],
        description: "Which canned query best answers the question.",
      },
      period: { type: "string", enum: ["this_month", "ytd", "last_12", "all"], description: "Time window when relevant." },
      year: { type: "number", description: "Calendar year for lybunt/sybunt." },
      limit: { type: "number", description: "Row limit for top_donors (default 10)." },
      email: { type: "string", description: "Donor email for find_donor." },
    },
    required: ["intent"],
  },
};

export async function runAssistantQuery(orgId: string, question: string): Promise<QueryResult> {
  const anthropic = getAnthropic();
  const msg = await anthropic.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 300,
    tools: [QUERY_TOOL],
    tool_choice: { type: "tool", name: "query_data" },
    messages: [
      {
        role: "user",
        content:
          `You route nonprofit donation questions to a canned query. Today is ${new Date().toISOString().slice(0, 10)}. ` +
          `Question: ${question}`,
      },
    ],
  });

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    return { answer: "Sorry, I couldn't interpret that question. Try rephrasing." };
  }
  const p = tool.input as { intent: string; period?: Period; year?: number; limit?: number; email?: string };
  const year = p.year ?? new Date().getUTCFullYear();
  const period: Period = p.period ?? "ytd";

  switch (p.intent) {
    case "total_raised": {
      const t = await periodTotals(orgId, sinceFor(period));
      return { answer: `Total raised (${periodLabel(period)}): ${usd(t.totalCents)} across ${t.giftCount} gift(s).` };
    }
    case "top_donors": {
      const rows = await topDonors(orgId, p.limit ?? 10);
      return {
        answer: `Top ${rows.length} donor(s) by lifetime giving:`,
        table: { columns: ["Donor", "Email", "Lifetime", "Gifts"], rows: rows.map((r) => [r.name, r.email ?? "—", usd(r.totalCents), String(r.giftCount)]) },
      };
    }
    case "gifts_by_fund": {
      const rows = await raisedByFund(orgId, sinceFor(period));
      return {
        answer: `Raised by fund (${periodLabel(period)}):`,
        table: { columns: ["Fund", "Raised", "Gifts"], rows: rows.map((r) => [r.name, usd(r.totalCents), String(r.count)]) },
      };
    }
    case "recurring_donors": {
      const c = await recurringActiveCount(orgId);
      return { answer: `There are ${c} active recurring (monthly) donor plan(s).` };
    }
    case "lybunt": {
      const rows = await lybunt(orgId, year);
      return {
        answer: `${rows.length} LYBUNT donor(s) — gave in ${year - 1} but not yet in ${year}:`,
        table: { columns: ["Donor", "Email", `${year - 1} total`], rows: rows.slice(0, 50).map((r) => [name(r), r.email ?? "—", usd(r.prior_cents)]) },
      };
    }
    case "sybunt": {
      const rows = await sybunt(orgId, year);
      return {
        answer: `${rows.length} SYBUNT donor(s) — gave before ${year} but not yet in ${year}:`,
        table: { columns: ["Donor", "Email", "Prior total"], rows: rows.slice(0, 50).map((r) => [name(r), r.email ?? "—", usd(r.prior_cents)]) },
      };
    }
    case "find_donor": {
      if (!p.email) return { answer: "Please include the donor's email." };
      const con = await findConstituentByEmail(orgId, p.email);
      if (!con) return { answer: `No constituent found with email ${p.email}.` };
      const ltv = await constituentLtv(orgId, con.id);
      return { answer: `${name(con)} (${con.email}) — lifetime ${usd(ltv.totalCents)} across ${ltv.giftCount} gift(s); last gift ${ltv.lastGiftAt ? ltv.lastGiftAt.toISOString().slice(0, 10) : "—"}.` };
    }
    default:
      return { answer: "I can answer questions about totals raised, top donors, by-fund breakdowns, recurring donors, LYBUNT/SYBUNT lapse lists, or a specific donor by email." };
  }
}

function periodLabel(p: Period): string {
  return p === "this_month" ? "this month" : p === "ytd" ? "year to date" : p === "last_12" ? "last 12 months" : "all time";
}
function name(r: { first_name?: string | null; last_name?: string | null; org_name?: string | null; email?: string | null }): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || r.org_name || r.email || "Unknown";
}

/** Draft a warm, specific thank-you note for a gift. */
export async function draftThankYou(orgId: string, giftId: string): Promise<string> {
  const gift = await getGiftById(orgId, giftId);
  if (!gift) throw new Error("gift not found");
  const [org, con, fund] = await Promise.all([
    getOrgById(orgId),
    getConstituentById(orgId, gift.constituent_id),
    gift.fund_id ? getFundById(orgId, gift.fund_id) : Promise.resolve(undefined),
  ]);
  const donorFirst = con?.first_name || con?.org_name || "Friend";
  const signer = org?.receipt_signature_name || `The ${org?.legal_name ?? "team"}`;
  const tribute = gift.tribute_type ? ` The gift was made ${gift.tribute_type === "in_memory" ? "in memory" : "in honor"} of ${gift.tribute_name}.` : "";

  const anthropic = getAnthropic();
  const msg = await anthropic.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content:
          `Write a warm, sincere, specific thank-you note (about 110 words, no placeholders) from ${signer} at ` +
          `${org?.legal_name} to ${donorFirst} for their ${usd(gift.amount_cents)} ${gift.gift_type === "recurring" ? "monthly " : ""}gift` +
          `${fund ? ` to the ${fund.name} fund` : ""}.${tribute} Do not invent facts or amounts. Sign it from ${signer}.`,
      },
    ],
  });
  const text = msg.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text.trim() : "Could not generate a draft.";
}
