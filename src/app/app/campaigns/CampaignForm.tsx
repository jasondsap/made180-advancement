import type { Campaign } from "@/repositories/campaigns";
import { CAMPAIGN_CATEGORIES } from "@/repositories/campaigns";
import { isoDay } from "@/lib/format";
import { CATEGORY_LABELS } from "./CampaignHeader";

/** Shared create/edit campaign form. Pass a campaign to edit; action handles submit. */
export function CampaignForm({
  campaign,
  action,
  submitLabel,
}: {
  campaign?: Campaign;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const dateVal = (d: string | Date | null | undefined) => isoDay(d) ?? "";
  return (
    <form action={action} style={{ display: "grid", gap: ".9rem", maxWidth: 560 }}>
      {campaign && <input type="hidden" name="id" value={campaign.id} />}

      <label style={lbl}>
        Name
        <input name="name" defaultValue={campaign?.name ?? ""} required style={inp} placeholder="e.g. 2026 Annual Fund" />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".9rem" }}>
        <label style={lbl}>
          Category
          <select name="category" defaultValue={campaign?.category ?? ""} style={inp}>
            <option value="">—</option>
            {CAMPAIGN_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label style={lbl}>
          Goal ($)
          <input name="goal" defaultValue={campaign?.goal_cents ? (campaign.goal_cents / 100).toString() : ""} style={inp} placeholder="25000" inputMode="decimal" />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".9rem" }}>
        <label style={lbl}>
          Starts
          <input type="date" name="startsOn" defaultValue={dateVal(campaign?.starts_on)} style={inp} />
        </label>
        <label style={lbl}>
          Ends
          <input type="date" name="endsOn" defaultValue={dateVal(campaign?.ends_on)} style={inp} />
        </label>
      </div>

      <label style={lbl}>
        Description
        <textarea name="description" defaultValue={campaign?.description ?? ""} rows={4} style={{ ...inp, resize: "vertical" }} placeholder="What this campaign funds and why it matters — also gives the AI drafting your voice." />
      </label>

      <fieldset style={{ border: "1px solid #e8eae8", borderRadius: 10, padding: "1rem", display: "grid", gap: ".9rem" }}>
        <legend style={{ fontSize: ".85rem", fontWeight: 600, padding: "0 .35rem" }}>Public page (optional)</legend>
        <label style={lbl}>
          Public slug
          <input name="publicSlug" defaultValue={campaign?.public_slug ?? ""} style={inp} placeholder="annual-fund-2026" />
          <span style={hint}>When set (and the campaign is active), donors can give at /give/&lt;org&gt;/c/&lt;slug&gt; with a live progress bar and donor wall.</span>
        </label>
        <label style={lbl}>
          Cover image URL
          <input name="coverImageUrl" defaultValue={campaign?.cover_image_url ?? ""} style={inp} placeholder="https://…/cover.jpg" />
        </label>
      </fieldset>

      {campaign && (
        <label style={{ fontSize: ".9rem", display: "flex", gap: ".45rem", alignItems: "center" }}>
          <input type="checkbox" name="active" defaultChecked={campaign.active} /> Active
        </label>
      )}

      <div>
        <button type="submit" style={btnPrimary}>{submitLabel}</button>
      </div>
    </form>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: ".3rem", fontSize: ".85rem", fontWeight: 600 };
const hint: React.CSSProperties = { fontSize: ".78rem", color: "#999", fontWeight: 400 };
const inp: React.CSSProperties = { padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: ".9rem", fontWeight: 400, fontFamily: "inherit" };
const btnPrimary: React.CSSProperties = { padding: ".5rem 1rem", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" };
