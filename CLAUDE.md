# Almonry — Advancement Platform

**Almonry** is the multi-tenant nonprofit donor CRM + giving + stewardship
platform (a product of MADe180 Digital Solutions). "Almonry" is the platform
identity (sign-in, admin shell); each tenant **org** carries its own brand on its
public giving pages and receipts. First tenant: **New Vision Renewable Energy
(NVRE)**, EIN 45-4696610 — now just the first org row, not the product. Source of
truth for original requirements: `ADVANCEMENT_BUILD_SPEC.md`. Module specs:
`Docs/code/engage-spec.md`, `Docs/code/campaigns-spec.md`,
`Docs/code/engage-fundraisers-plan.md`.

## Stack
Next.js 15 (App Router) · TypeScript · Neon Postgres (raw SQL migrations, no ORM) ·
Stripe **Connect (Express, destination charges)** · AWS Cognito (Hosted UI) ·
Resend (email) · Twilio (SMS) · jsPDF (receipts + letters) · Recharts (dashboard) ·
Anthropic SDK (assistant). Deploys to AWS Amplify (SSR).

## Core invariants (do not violate)
- **Multi-tenant from row zero.** Every table has `org_id`; every repository
  function takes `orgId` first and scopes every query. The single guard is
  `src/lib/tenancy.ts` (`assertOrgId`). Org id comes from the Cognito session
  (admin, via the active-org cookie) or the URL slug (`/give/[orgSlug]`) — never
  client input.
  - Documented exceptions (keyed by globally-unique values, not org-first):
    `orgs.ts` (slug/id resolvers, `listAllOrgs`/`listOrgsByIds` — super_admin only),
    `webhookEvents.ts` (stripe_event_id), `users.ts` (cognito_sub),
    `gifts.markRefundedByPaymentIntent`, `constituents.setSmsOptInByPhone`
    (inbound STOP), `engage/recipients.advanceStatusByProviderId` /
    `getByProviderId` (provider message id), the public fundraiser/member/auction
    slug+id resolvers (`fundraisers.getPublishedFundraiser`,
    `p2pMembers.getMemberBySlug`, `ticketTypes.listPublicTicketTypes`,
    `auctions.getItemPublic`/`highBid`/`listPublicItems`), and
    `canvaConnections.ts` (per-user OAuth tokens, keyed by `user_id` — a Canva
    login belongs to a person; access control is via the session user + the
    org-scoped `canvaMedia` repo).
- **PCI = SAQ-A.** Card entry is Stripe-hosted only. We store Stripe IDs + last4.
- **Idempotent webhooks.** `webhook_events.stripe_event_id` claimed first; gifts
  unique on `stripe_payment_intent_id` and (partial) `stripe_invoice_id`;
  registrants unique on `(stripe_checkout_session_id, ticket_type_id)`.
- **Stripe destination charges:** `on_behalf_of` + `transfer_data.destination` =
  org's `stripe_account_id`. No platform application fee. Donations, event tickets
  (`/api/events/checkout`), and P2P gifts all use this model.
- Pledges ≠ payments. Soft credits never double-count. Constituents dedupe on
  `(org_id, lower(email))`.
- **Consent is enforced at audience resolution, never bypassed.** Email excludes
  `email_opt_out`; SMS requires `sms_opt_in` (TCPA); `do_not_contact` excludes
  from everything. CAN-SPAM: every email has the org postal address + a working
  one-click unsubscribe (`/u/[token]`, signed with `NEXTAUTH_SECRET`).

## Layout
- `migrations/` — numbered SQL: 0001 init · 0002 NVRE seed · 0003 users/
  memberships/receipt_counters · 0004 super_admin seed · 0005 gift benefit ·
  0006 org branding (logo_url, primary_color) · 0007 engage (domains/senders/
  addresses/merge_fields/messages/recipients + constituent consent cols) ·
  0008 fundraisers (+ gifts.fundraiser_id) · 0009 events (ticket_types,
  registrants) · 0010 p2p+auction (p2p_members + gifts.p2p_member_id,
  auction_items, auction_bids) · 0011 engage_segments · 0012 interactions+tasks ·
  0013 campaigns (campaign description/category/cover/public_slug, appeal
  ask_amount/sent_on, gifts.is_anonymous, engage_messages.appeal_id, attribution
  indexes) · 0014 canva (canva_connections per-user OAuth tokens +
  canva_media org-scoped exports) · 0015–0022 (Phases 0–5: rate limits,
  integrity constraints, stripe customer, gift external ref, org features,
  p2p teams, registrant check-in, CRM depth) · 0023 tasks.type + tasks.due_time.
  Runner: `scripts/migrate.ts`
  (`DATABASE_URL_UNPOOLED`; checksums applied files).
- `src/lib/` — `env.ts` (all-optional literal reads + `requireEnv`; build-safe —
  new vars MUST also be mirrored in `next.config.mjs` `env:` block to reach the
  Amplify Lambda), `db.ts`, `tenancy.ts`, `stripe.ts`, `auth.ts`, `auth-options.ts`,
  `email.ts` (`sendReceiptEmail`/`sendEngageEmail`/`getResendClient`), `twilio.ts`
  (REST send + signature validation), `engageTokens.ts` (signed unsubscribe),
  `crypto.ts` (AES-256-GCM encrypt/decrypt for tokens at rest, `TOKEN_ENC_KEY`),
  `s3.ts` (`putPublicImage` → media bucket), `canva.ts` (Canva Connect OAuth/PKCE,
  CAS token refresh, export polling, correlation-JWT verify),
  `brand.ts` (Almonry tokens + chart palette), `featureFlags.ts`, `anthropic.ts`,
  `format.ts`, `authConstants.ts`.
- `src/repositories/` — orgs, constituents, gifts, funds, campaigns, appeals,
  pledges, recurringPlans, webhookEvents, users, attributes, relationships,
  analytics, reports, **fundraisers, ticketTypes, registrants, p2pMembers,
  auctions**, **campaignStats** (summary/sources/cumulative/appeal-perf/top
  donors/donor wall), **campaignSegments** (campaign-relative LYBUNT/SYBUNT/
  first-time/lapsed/recurring resolvers), **canvaConnections** (per-user OAuth,
  documented exception), **canvaMedia** (org-scoped Canva exports), and
  **engage/** (domains, senders, addresses, mergeFields, messages, recipients,
  audience, segments). All `orgId`-scoped (+ documented exceptions).
- `src/domain/` — fees, receiptPdf, receipts, yearEndPdf, quickbooksCsv,
  assistant, **campaignAsks** (AI appeal drafting), **campaignReportPdf**
  (board report), and **engage/** (render, send, sendSms, mailingPdf).
- `src/components/` — `ArchMark` (logo), `OrgSwitcher`, `SignOutButton`,
  `ui/` (DataTable, EmptyState, Badge, SubTabs), `interactions/` (InteractionsTabs, SettingsNav),
  `canva/` (`CanvaImageField` drop-in image field, `CanvaPicker` modal,
  `CanvaInsertImageButton` for the email composer).
- `src/app/give/[orgSlug]/` — default donation page; `[fundraiserSlug]/` themed
  fundraiser/event page; `[fundraiserSlug]/p/[memberSlug]/` peer-to-peer page;
  `c/[campaignSlug]/` public campaign page (thermometer + donor wall; exists only
  when `campaigns.public_slug` set AND active; the static `c` segment shadows a
  fundraiser slugged literally "c").
- `src/app/u/[token]/` — public unsubscribe.
- `src/app/api/` — checkout, events/checkout, stripe/webhook, auth/[...nextauth],
  auth/cognito-logout, assistant/{query,thank-you,appeal-draft}, export/quickbooks,
  year-end/[constituentId], fundraisers/export, p2p/join, auction/bid,
  campaigns/segment-preview, campaigns/[id]/report (board PDF),
  canva/{connect,callback,designs,export,edit,return} (Canva Connect OAuth +
  design export→S3 + edit round-trip),
  tidings/webhook/{resend,twilio,twilio/inbound}, tidings/mailings/[id]/pdf,
  tidings/cron (the `tidings` API prefix is intentional — see Interactions below).
- `src/app/app/` — admin (force-dynamic): dashboard, gifts, constituents, pledges,
  reports, funds, **campaigns** (card list + /new + [id] detail with
  Overview/Appeals/Asks/Gifts/Report tabs + [id]/edit), **fundraisers**
  (+ [id]/edit, /registrants, /members, /new wizard), **interactions**
  (email/texts/mailings/settings — donor messaging), assistant, settings,
  **admin/orgs** (super_admin console).
- `middleware.ts` — NextAuth `withAuth` gate on `/app/*`.

## Auth, roles & org switching
NextAuth v4 + AWS Cognito (Auth Code + PKCE, JWT). `signIn` callback reconciles
the Cognito identity to `users` (seeded/pre-provisioned rows matched by email —
`cognito_sub = 'seed-pending:<email>'` until first login). `getAuthContext()`
returns `{ user, orgId, role }`. Active org resolves from the `ap_org` cookie
(set by `setActiveOrgAction`, validated against `canAccessOrg`), else first
membership, else (super_admin) the first org alphabetically. `requireSuperAdmin()`
gates the platform console. Roles: `super_admin` (cross-org, `users.is_super_admin`),
`org_admin`, `org_staff` (via `memberships`). `canManage` = admin+; Engage sends,
Fundraiser/org CRUD, settings, refunds = admin only. Header **OrgSwitcher** shows
when a user can access >1 org. Seeded super_admin: jason@made180.com.

## Branding (platform vs tenant)
- **Platform = Almonry**: CSS variables in `src/app/globals.css` (`--parchment`,
  `--oxblood`, `--brass`, `--forest`, …) with semantic `--brand`/`--accent`;
  fonts Fraunces/Newsreader/Inter (`next/font`); `ArchMark` logo + `app/icon.svg`.
  JS constants/chart palette in `src/lib/brand.ts`.
- **Per-tenant**: `orgs.logo_url` + `orgs.primary_color` (edited in Settings).
  Public giving pages override `--brand` with the org color (cascades into the
  shared DonationForm); receipt + year-end PDFs theme the header. A fundraiser's
  `theme_json.accent` overrides further on its own page.

## Interactions (donor messaging) — feature-flagged channels
> **Three namespaces, deliberately.** The module was called *Tidings*, and before
> that *Engage*; each rename stopped where the cost outweighed the benefit.
> - **User-facing + admin routes = Interactions.** `/app/interactions/*`,
>   `src/components/interactions/`, every label and heading.
> - **Webhook/API routes keep `tidings`** — `/api/tidings/webhook/{resend,twilio,
>   twilio/inbound}`, `/api/tidings/cron`, `/api/tidings/mailings/[id]/pdf`. These
>   URLs are registered in the Resend dashboard, the Twilio console, and the cron
>   scheduler; renaming them silently breaks delivery tracking and scheduled sends
>   until every external config is updated. Leave them alone.
> - **Data layer keeps `engage`** — `repositories/engage/`, `domain/engage/`,
>   `types/engage.ts`, `engageTokens.ts`, the `engage_*` tables, the `ENGAGE_*`
>   flags. (Renaming = a DB migration + env churn for no user benefit.)
>
> **Do not confuse with the `interactions` table.** That's the per-constituent
> CRM touchpoint log (migration 0012, `repositories/interactions.ts`), labelled
> **Activity** in the UI. Sends from this module auto-log into it via
> `bulkLogInteractions` — so "an Interactions email creates an Activity row."

One message model (`engage_messages.channel ∈ email|sms|mail`) + per-recipient
fan-out (`engage_recipients`) for tracking/idempotency. Audience = consent-filtered
constituents (`audience` repo: all / by fund / manual).
- **Email** (always on): Resend send; HTML built per-recipient (merge tags +
  branded header + CAN-SPAM footer + unsubscribe); delivery tracked via the
  Svix-verified Resend webhook. Settings: domains (Resend register/verify),
  senders (gated on a verified domain), addresses, merge fields, branding.
- **SMS** (`ENGAGE_SMS_ENABLED`): Twilio REST send (Messaging Service or number);
  status callback + inbound STOP/START webhooks; auto "Reply STOP" footer.
- **Mailings** (`ENGAGE_MAILINGS_ENABLED`): merged letter PDF (`mailingPdf`),
  one page per recipient; downloaded from `/api/engage/mailings/[id]/pdf`.

## Fundraisers (publishable giving) — distinct from CRM `campaigns`
A **Fundraiser** is a public page that collects gifts and *designates* them to a
fund (+ optional campaign for reporting). Do not conflate with the `campaigns`
table (goals/attribution) — they complement. raised/supporter totals are DERIVED
from `gifts.fundraiser_id` (no counters). Types: `donation_form`,
`fundraising_page`, `event`. Optional features (in `fundraisers.features`):
`peer_to_peer`, `auction`. Created via the 3-step wizard; edited at
`/app/fundraisers/[id]/edit`.
- **Events** (`FUNDRAISER_EVENTS_ENABLED`): `ticket_types` + `registrants`;
  `/api/events/checkout` (destination charge); webhook (metadata `kind=event`)
  creates registrants + a fundraiser-attributed gift (no auto-receipt — tickets
  carry FMV). Capacity is a soft check at purchase.
- **Peer-to-peer** (`FUNDRAISER_P2P_ENABLED`): self-serve `/api/p2p/join` creates
  a member page; gifts thread `p2p_member_id` (checkout + webhook) and credit both
  member and fundraiser.
- **Auction** (`FUNDRAISER_AUCTION_ENABLED`): `auction_items` + `auction_bids`;
  `/api/auction/bid` validates the bid beats the high by the min increment. Bid
  settlement is offline (v1).

## Dev
- `npm run dev` (port 3000 — match `APP_BASE_URL`).
- `npm run migrate` / `npm run migrate:status` · `npm run typecheck` · `npm run build`.
- Local Stripe: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
  Test giving via `/give/nvre` (card 4242 4242 4242 4242). Raw `stripe trigger`
  events lack our metadata and are intentionally skipped.

## Conventions
- Money is always integer cents. Receipts numbered per org slug
  (`NVRE-2026-000001`) via `receipt_counters` (atomic, gaps OK). Receipt issuance
  is best-effort in the webhook (gift saved even if email fails; admin "resend").
- Migrations are immutable (the runner checksums applied files) — add a new one,
  never edit an applied one. **`.gitattributes` pins `*.sql` to LF** so autocrlf
  can't flip an applied file's bytes and trip the checksum integrity check.
- Feature flags (`src/lib/featureFlags.ts`) read env (`"1"`/`"true"`), off by
  default — un-provisioned channels/types stay behind upsell/"coming soon" UI.
- Verify risky SQL with a temp `scripts/_*.ts` (dotenv + pg), assert, then delete.

## Outstanding config (not code)
> **Full checklist: `PRODUCTION_CONFIG.md`** (repo root) — the complete Phases 0–5
> production configuration guide (env vars incl. `CRON_SECRET`, Stripe webhook
> event list + Billing Portal + payment methods, Cognito `AdminCreateUser` IAM,
> Resend webhook/tracking, the Interactions cron, per-org onboarding, verification).
> The list below predates Phases 0–5; the doc supersedes it where they differ.
- Cognito callback `/api/auth/callback/cognito`, sign-out `/`, users for admins.
- `RESEND_API_KEY` + verified sender; `RESEND_WEBHOOK_SECRET` + webhook →
  `/api/tidings/webhook/resend`.
- Twilio (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/MESSAGING_SERVICE_SID` or `FROM_NUMBER`)
  + status webhook `/api/tidings/webhook/twilio` + inbound
  `/api/tidings/webhook/twilio/inbound`; set `ENGAGE_SMS_ENABLED`.
- `ANTHROPIC_API_KEY` (assistant). `APP_BASE_URL` (checkout/return + webhook URLs).
- Feature flags as desired: `ENGAGE_MAILINGS_ENABLED`, `FUNDRAISER_EVENTS_ENABLED`,
  `FUNDRAISER_P2P_ENABLED`, `FUNDRAISER_AUCTION_ENABLED`, `CANVA_ENABLED`.
- **Canva** (set `CANVA_ENABLED=1`): Developer Portal integration —
  `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET`, scopes
  `design:meta:read design:content:read profile:read`, OAuth redirect URL
  `{APP_BASE_URL}/api/canva/callback`, return-navigation URL
  `{APP_BASE_URL}/api/canva/return` (dev: `http://127.0.0.1:3000` if `localhost`
  rejected). Private integration works for the owning Canva team immediately;
  public availability across orgs needs Canva review.
- **Media storage** (Canva exports): S3 bucket + `MEDIA_S3_BUCKET`/`MEDIA_S3_REGION`
  (+ optional `MEDIA_S3_ACCESS_KEY_ID`/`SECRET`, else default credential chain);
  bucket policy allows public `s3:GetObject` on `canva/*`, app role has
  `s3:PutObject`. `TOKEN_ENC_KEY` = 32-byte base64 (AES-GCM token encryption).
  **All new env vars must also be added to the `next.config.mjs` `env:` block** to
  reach the Amplify Lambda.
- Per org: complete Stripe Connect onboarding (super_admin console → org → Connect),
  set EIN, receipt sender/signatory, mailing address, logo + color.

## Status
Shipped: Almonry rebrand; super_admin org console + Stripe Connect onboarding +
membership management + org switcher; per-tenant branding; Interactions (donor
messaging: email, SMS, mailings); Fundraisers (donation forms/pages, events,
peer-to-peer, auction); Campaigns module (detail dashboard w/ thermometer +
source breakdown + cumulative chart, appeal performance + CRUD, segmented Asks
with AI-drafted appeals sent via Interactions + tracked back via
engage_messages.appeal_id, board-ready PDF report w/ YoY, public campaign pages
w/ donor wall, anonymous giving end-to-end, campaign/appeal attribution on
manual gift entry); Canva Connect integration (feature-flagged per-user OAuth;
"Design with Canva" picker + "Edit in Canva" round-trip on campaign covers, org
logo, fundraiser heroes, and Interactions email graphics; exports copied to a public
S3 media bucket at a stable key so edits overwrite in place).
Phase-1 CRM (dashboard/gifts/constituents+merge/funds/campaigns/pledges/reports/
QuickBooks export/Dori assistant/receipts) intact. 23 migrations applied.

**Tasks** carry an activity `type` (call/email/letter/visit/meeting/thank_you/
proposal/research/other — the list lives in `TASK_TYPES`, stored as free text so
adding one needs no migration), a due `date` + optional `due_time`, and an
optional constituent link chosen with `ConstituentPicker` (typeahead over
`/api/constituents/search`, session-gated + org-scoped). `/app/tasks` searches
title/notes/constituent name and sorts by due/type/constituent/recent, all via
URL params so a filtered view is linkable.
- `due_time` is `time` (wall clock), **not** folded into a timestamptz: there's
  no per-org timezone in the schema and the app runs UTC, so "9:00 AM" would
  render as the prior evening. Date + local time is what the user means.

## Deploy: AWS Amplify
See `amplify.yml`: push to Git, connect in Amplify (Next.js SSR auto-detected),
set ALL env vars, run migrations against Neon, then point Stripe webhook + Cognito
callbacks + `APP_BASE_URL` (+ Resend/Twilio webhooks) at the Amplify domain.
