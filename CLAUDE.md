# MADe180 Advancement Platform

Multi-tenant nonprofit donor CRM + donation processing. First tenant: **New Vision
Renewable Energy (NVRE)**, EIN 45-4696610. Source of truth for requirements:
`ADVANCEMENT_BUILD_SPEC.md` (build spec) and `Docs/Scope.pdf` (original scope).

## Stack
Next.js 15 (App Router) · TypeScript · Neon Postgres (raw SQL migrations, no ORM) ·
Stripe **Connect (Express, destination charges)** · AWS Cognito (Hosted UI) ·
Resend (receipt email) · jsPDF (receipts) · Recharts (dashboard) · Anthropic SDK
(assistant). Deploys to AWS Amplify (SSR).

## Core invariants (do not violate)
- **Multi-tenant from row zero.** Every table has `org_id`; every repository
  function takes `orgId` first and scopes every query. The single guard is
  `src/lib/tenancy.ts` (`assertOrgId`). Org id comes from the Cognito session
  (admin) or the URL slug (`/give/[orgSlug]`) — never client input.
  - Documented exceptions (keyed by globally-unique values, not org-first):
    `repositories/orgs.ts` (slug/id resolvers), `webhookEvents.ts` (stripe_event_id),
    `users.ts` (cognito_sub), `gifts.markRefundedByPaymentIntent`.
- **PCI = SAQ-A.** Card entry is Stripe-hosted only. We store Stripe IDs + last4.
- **Idempotent webhooks.** `webhook_events.stripe_event_id` claimed first; gifts are
  also unique on `stripe_payment_intent_id` and (partial) `stripe_invoice_id`.
- **Stripe destination charges:** `on_behalf_of` + `transfer_data.destination` =
  org's `stripe_account_id`. No platform application fee.
- Pledges ≠ payments. Soft credits never double-count. Constituents dedupe on
  `(org_id, lower(email))` (partial unique index `constituents_org_email_uniq`).

## Layout
- `migrations/` — numbered SQL (0001 init, 0002 NVRE seed, 0003 users/memberships/
  receipt_counters/fixes, 0004 super_admin seed, 0005 gift benefit/quid-pro-quo).
  Runner: `scripts/migrate.ts` (uses `DATABASE_URL_UNPOOLED`).
- `src/lib/` — `env.ts` (all-optional, literal reads + `requireEnv`; build-safe),
  `db.ts` (Neon pooled `sql`), `tenancy.ts`, `stripe.ts`, `auth.ts`,
  `auth-options.ts` (NextAuth + Cognito, lazy `getAuthOptions()`), `email.ts`,
  `anthropic.ts`, `format.ts`, `authConstants.ts`.
- `src/repositories/` — orgs, constituents, gifts, funds, campaigns, appeals,
  pledges, recurringPlans, webhookEvents, users, attributes, relationships,
  analytics, reports. All `orgId`-scoped.
- `src/domain/` — fees, receiptPdf, receipts, yearEndPdf, quickbooksCsv, assistant.
- `src/app/give/[orgSlug]/` — public donation page (one-time + monthly).
- `src/app/api/` — checkout, stripe/webhook, auth/[...nextauth] (NextAuth),
  auth/cognito-logout (federated logout), assistant/{query,thank-you},
  export/quickbooks, year-end/[constituentId].
- `src/app/auth/signin` — branded sign-in page (calls `signIn('cognito')`).
- `src/app/app/` — admin (force-dynamic): dashboard, gifts, constituents,
  pledges, reports, funds, campaigns, assistant, settings.
- `middleware.ts` — NextAuth `withAuth` gate on `/app/*` → redirects to /auth/signin.

## Auth
NextAuth.js v4 + AWS Cognito provider (Authorization Code + PKCE, JWT session),
matching the DDOR pattern. Callback path is the NextAuth standard
`/api/auth/callback/cognito`. The `signIn` callback (and `getAppUser` defensively)
reconciles the Cognito identity to the `users` table — the seeded super_admin is
matched by email on first login. `getAuthContext()` is the single integration
point returning `{ user, orgId, role }`; everything downstream uses it.
Env: COGNITO_* + NEXTAUTH_URL + NEXTAUTH_SECRET (+ optional COGNITO_ISSUER).

## Roles
`super_admin` (platform-wide, `users.is_super_admin`), `org_admin`, `org_staff`
(via `memberships`). `canManage` = admin+. Settings/CRUD/refunds = admin only;
gift & constituent entry = any role. Seeded super_admin: jason@made180.com.

## Dev
- `npm run dev` (defaults to port 3000 — match `APP_BASE_URL`).
- `npm run migrate` / `npm run migrate:status`
- `npm run typecheck` · `npm run build`
- Local Stripe: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  (use the printed `whsec_` as `STRIPE_WEBHOOK_SECRET`); test with a real donation
  via `/give/nvre` (card 4242 4242 4242 4242). Raw `stripe trigger` events lack our
  metadata and are intentionally skipped.

## Status (Phase 1 complete)
Steps 1–12 built & verified: scaffold, schema+seed, data layer, public donation
(destination charges), idempotent webhook, receipts (per-gift + quid-pro-quo +
year-end), recurring, admin (dashboard/gifts/constituents+merge/funds/campaigns/
settings), LYBUNT/SYBUNT + pledge analytics, QuickBooks CSV export, Dori AI
assistant (safe NL→intent queries + thank-you drafting).

## Outstanding config (not code)
- Cognito app client callback `=/api/auth/callback`, sign-out `=/`, a user for
  jason@made180.com. Update both for the deployed domain.
- `RESEND_API_KEY` valid + verified sender (NVRE `receipt_from_email`).
- `ANTHROPIC_API_KEY` valid (assistant + thank-you).
- NVRE mailing address (Settings) for receipt letterhead.
- NVRE `stripe_account_id` currently a test Express account.

## Conventions
- Money is always integer cents. Receipts numbered `NVRE-2026-000001` via
  `receipt_counters` (atomic, gaps OK). Receipt issuance is best-effort in the
  webhook (gift saved even if email fails; admin "resend" recovers).
- Migrations are immutable (the runner checksums applied files) — add a new one,
  never edit an applied one.
- Verify risky SQL with a temp `scripts/_*.ts` (dotenv + pg), assert, then delete.

## Deploy: AWS Amplify
See `amplify.yml`. Checklist in this repo's deploy notes / chat history; key points:
push to Git, connect in Amplify (Next.js SSR auto-detected), set ALL env vars,
run migrations against Neon, then point the Stripe webhook + Cognito callbacks +
`APP_BASE_URL` at the Amplify domain.
