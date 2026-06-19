# MADe180 Advancement Platform

Multi-tenant nonprofit donor CRM and donation processing. A focused alternative to
the expensive parts of Blackbaud/Raiser's Edge — constituent CRM, gift processing,
funds/campaigns, reporting, and tax receipts — without the enterprise sprawl or a
general ledger.

First tenant: **New Vision Renewable Energy (NVRE)**.

## Features

- **Public donation page** (`/give/[orgSlug]`) — one-time & monthly, fund picker,
  amount presets, tribute, employer matching, cover-the-fees. Stripe-hosted
  checkout (PCI SAQ-A — no card data touches the server).
- **Stripe Connect** destination charges — funds settle to each nonprofit's
  connected account; receipts/descriptors show the nonprofit.
- **Idempotent webhook** — auto-logs gifts, dedupes constituents on
  `(org_id, lower(email))`, handles one-time, recurring, and refunds.
- **Tax receipts** — jsPDF + email, sequential numbering, quid-pro-quo deductible
  handling, and year-end consolidated statements.
- **Admin app** (`/app`, Cognito-protected) — dashboard (Recharts), gifts (filter/
  detail/manual entry/refund/resend), constituents (history, LTV, roles,
  relationships, merge), pledges, funds/campaigns/appeals, settings.
- **Reporting** — LYBUNT/SYBUNT lapse lists, pledge projected-vs-received,
  QuickBooks CSV export.
- **AI assistant** — natural-language questions answered via safe, org-scoped
  queries (no raw SQL), plus thank-you note drafting.

## Stack

Next.js 15 (App Router) · TypeScript · Neon Postgres (raw SQL migrations) ·
Stripe Connect · AWS Cognito · Resend · jsPDF · Recharts · Anthropic · AWS Amplify.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in your values
npm run migrate                    # apply SQL migrations to Neon
npm run dev                        # http://localhost:3000
```

Local Stripe testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# use the printed whsec_ as STRIPE_WEBHOOK_SECRET, then donate via /give/nvre
# (test card 4242 4242 4242 4242)
```

## Multi-tenancy & security

Every table carries `org_id`; every data-access function takes `orgId` first and
scopes every query (single guard in `src/lib/tenancy.ts`). Org identity is derived
from the Cognito session (admin) or the URL slug (public) — never client input.
Card entry is Stripe-hosted (SAQ-A); we store only Stripe IDs and last-four.

## Deployment

Deploys to AWS Amplify (Next.js SSR) via the included `amplify.yml`. See
`CLAUDE.md` for architecture, conventions, and the full deploy checklist.

---

Built with [Claude Code](https://claude.com/claude-code).
