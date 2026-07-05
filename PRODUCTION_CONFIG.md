# Almonry — Production Configuration Guide (Phases 0–5)

Everything that must be configured **outside the codebase** for the features shipped in
Phases 0–5 (2026-07-04) to work in production. Migrations 0015–0022 are already applied ✅.

Each item is marked:
- 🆕 **New** — introduced by Phases 0–5
- ♻️ **Changed** — existed before, but behavior changed (usually fail-open → fail-closed)
- ⬜ pre-existing, listed for completeness where a new feature depends on it

> **The env-var invariant:** every env var the app reads must exist in BOTH
> `src/lib/env.ts` and the `next.config.mjs` `env:` block to reach the Amplify Lambda.
> All vars below are already mirrored in code — you only set values in
> **Amplify Console → App settings → Environment variables** (and `.env.local` for dev).

---

## 1. Environment variables

| Variable | Status | What breaks without it |
|---|---|---|
| `CRON_SECRET` | 🆕 **Required for scheduling** | Scheduled Tidings sends never fire; stuck sends aren't auto-resumed (manual "Resume" still works). Generate: `openssl rand -base64 32`. |
| `RESEND_WEBHOOK_SECRET` | ♻️ **Now mandatory in prod** | The Resend webhook **fails closed** (503) without it — no delivery/open/click/bounce tracking, no complaint/bounce suppression. Get it when creating the webhook in Resend (§4). |
| `TWILIO_AUTH_TOKEN` | ♻️ **Now mandatory in prod (if SMS on)** | Twilio webhooks **fail closed** (503) — no SMS delivery status, no STOP/START processing. |
| `APP_BASE_URL` | ⬜ | Now also used by: manage-billing links in receipts, dunning emails, the embed snippet, cron. Must be the real production domain. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ⬜ | Payments + webhook verification (unchanged). |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | ⬜ | App + migrations (unchanged). |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | ⬜ | Auth; also signs unsubscribe AND 🆕 manage-billing tokens. Rotating it invalidates links already sent in emails. |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `COGNITO_DOMAIN`/`COGNITO_ISSUER` | ⬜ | Sign-in; 🆕 the invite flow also uses `COGNITO_REGION` + `COGNITO_USER_POOL_ID` server-side. |
| `RESEND_API_KEY`, `RESEND_FROM_FALLBACK` | ⬜ | All email: receipts, Tidings, 🆕 dunning, 🆕 tribute eCards, 🆕 pledge reminders. |
| `TWILIO_ACCOUNT_SID` + `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` | ⬜ | SMS sending (with `ENGAGE_SMS_ENABLED`). |
| `ANTHROPIC_API_KEY` | ⬜ | Assistant + AI appeal drafts (now rate-limited per user, no config needed). |
| `TOKEN_ENC_KEY` | ⬜ | Canva token encryption (32-byte base64). |
| `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION` (+ optional key pair) | ⬜ | Canva exports. |
| `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_ENABLED` | ⬜ | Canva integration. |
| `ENGAGE_SMS_ENABLED`, `ENGAGE_MAILINGS_ENABLED`, `FUNDRAISER_EVENTS_ENABLED`, `FUNDRAISER_P2P_ENABLED`, `FUNDRAISER_AUCTION_ENABLED` | ♻️ | Still the **platform-wide** "is it provisioned" switch — but per-org entitlement now also applies (§6). A feature is live for a tenant only when the env flag is on AND the org's Features checkbox is checked. |

---

## 2. Stripe

### 2a. Webhook endpoint events 🆕
Dashboard → Developers → Webhooks → your endpoint (`{APP_BASE_URL}/api/stripe/webhook`).
The **complete** event list the app now handles — add the ones marked new:

| Event | Purpose |
|---|---|
| `checkout.session.completed` | One-time gifts + event tickets |
| `checkout.session.async_payment_succeeded` | 🆕 ACH/bank-debit gifts that settle later |
| `checkout.session.async_payment_failed` | 🆕 Failed delayed payments (ledger only) |
| `payment_intent.succeeded` | Fallback one-time path |
| `invoice.paid` | Recurring gifts (each installment) |
| `invoice.payment_failed` | 🆕 Dunning: plan → past_due + donor email with fix-my-card link |
| `customer.subscription.created` / `updated` / `deleted` | Recurring plan mirror |
| `charge.refunded` | Full + 🆕 partial refunds |
| `charge.dispute.created` | 🆕 Chargeback opened → gift excluded from totals |
| `charge.dispute.closed` | 🆕 Dispute resolved → gift restored (won) or refunded (lost) |

### 2b. Billing Portal 🆕 (required for donor self-service)
Dashboard → Settings → **Billing → Customer portal**:
- Turn the portal on and save the default configuration.
- Recommended: allow **update payment method** and **cancel subscription**
  (immediately or at period end — your policy); leave "switch plans" off.

This powers `/manage/[token]` — the "manage my monthly gift" link in every recurring
receipt and dunning email. Without it, those links show a friendly error.

### 2c. Payment methods 🆕 (optional but recommended)
Dashboard → Settings → **Payment methods** (on the platform account). The code is now
safe for all of these — enabling them is purely a dashboard toggle:
- **Apple Pay / Google Pay / Link** — appear automatically in Checkout once enabled.
- **ACH Direct Debit** — lower fees on large gifts; settles in days (handled by §2a events).
- **Cash App Pay** — popular with younger donors.

### 2d. Fee note ⬜
"Cover the fees" math is hardcoded at 2.2% + $0.30 (`src/domain/fees.ts`) — NVRE's
negotiated nonprofit rate. If a future org has a different rate, that's a code change
(known limitation, not config).

---

## 3. AWS — Cognito invite flow 🆕

The "Add member" action in the super_admin console now calls `AdminCreateUser`, which
sends the invitation email with a temporary password. Two pieces of setup:

**IAM permission** — attach to the Amplify SSR compute role (the same role that has S3
access for Canva media):

```json
{
  "Effect": "Allow",
  "Action": "cognito-idp:AdminCreateUser",
  "Resource": "arn:aws:cognito-idp:<COGNITO_REGION>:<ACCOUNT_ID>:userpool/<COGNITO_USER_POOL_ID>"
}
```

**Invitation email (optional polish)** — Cognito console → your pool → Message
templates → *Invitation message*. Default is functional; customize with the Almonry
name and sign-in URL. If Cognito is unreachable or the permission is missing, the
membership is still granted and the console shows a banner telling you to create the
login manually — nothing breaks silently.

Also confirmed by Phase 0: the pool should have **self-signup disabled** (admin-create
only). The account-takeover hole is closed in code regardless, but keep it off.

---

## 4. Resend (email)

1. **API key** → `RESEND_API_KEY` (pre-existing).
2. **Webhook** 🆕♻️ — Resend dashboard → Webhooks → add endpoint
   `{APP_BASE_URL}/api/tidings/webhook/resend` with events:
   `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
   Copy the signing secret → `RESEND_WEBHOOK_SECRET`. **This is now mandatory** — the
   endpoint rejects unsigned posts in production, and bounce/complaint suppression
   (Phase 3) only works through it.
3. **Open/click tracking** 🆕 — Resend dashboard → your domain → enable **open tracking**
   and **click tracking**. Without this Resend never emits `email.opened`/`email.clicked`,
   so those stats stay at zero (delivery/bounce still works).
4. **Per-org domains** are handled in-app (Tidings → Settings → Domains) — see §6.

---

## 5. Tidings cron 🆕 (scheduled sends + auto-resume)

Point any minute-level scheduler at the sweeper. It fires due scheduled emails/texts and
resumes sends interrupted mid-drain. Safe to run every minute; overlapping ticks cannot
double-send.

```
POST {APP_BASE_URL}/api/tidings/cron
Authorization: Bearer <CRON_SECRET>
```

**Option A — EventBridge Scheduler (recommended, all-AWS):**
Create a schedule, rate `rate(1 minute)` (or up to 5), target *API destination* with the
URL above and an `Authorization` header. API destinations want a "connection" — use
API-key auth with key name `Authorization`, value `Bearer <CRON_SECRET>`.

**Option B — any external cron (cron-job.org, GitHub Actions):**
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/tidings/cron
```

Without a scheduler: "Send later" and stuck-send auto-recovery don't run, but everything
else works (the admin "Resume sending" button covers interruptions manually).

Verify: the curl above returns `{"ok":true,...}`; without the header it returns 401;
with `CRON_SECRET` unset it returns 503.

---

## 6. Per-org configuration (in-app, per tenant)

Done in the UI — no env vars. For each org you onboard:

**Super_admin console** (`/app/admin/orgs/<org>`):
1. **Stripe Connect** — "Connect Stripe account" → complete hosted Express onboarding
   until *charges enabled ●*.
2. **Features** 🆕 — check/uncheck SMS, Mailings, Events, P2P, Auctions, Canva for this
   tenant. (Effective = env flag AND this checkbox.)
3. **Members** 🆕 — add by email; the Cognito invitation sends automatically (§3).
4. Legal name, EIN, receipt from-email, signatory, mailing address.

**Org admin** (`/app/settings` + `/app/tidings/settings`):
5. Logo + primary color (Settings). The 🆕 embed snippet is on this page too.
6. **Tidings → Domains**: register the org's sending domain, add the DNS records at
   their registrar, verify.
7. **Tidings → Senders**: create a sender on the verified domain, mark default.
8. **Tidings → Addresses**: the organization's postal address. ♻️ **Now enforced** —
   Phase 3's send preflight refuses to send marketing email without a sender AND a
   postal address (CAN-SPAM), with a clear error instead of a silent bad send.
9. Receipt from-email in Settings must be on a Resend-verified domain or receipts
   silently fall back to `RESEND_FROM_FALLBACK`.

**Migrating an org from LGL/Excel** 🆕: `/app/import` — constituents first, then gift
history. Map the source's Gift ID column to "External gift ID" so re-runs never
duplicate. Rows without email are created fresh each run — don't re-import those.

---

## 7. Post-configuration verification checklist

- [ ] `npm run migrate:status` — all 22 migrations `✓ applied` (done ✅)
- [ ] Test gift at `/give/nvre` (card `4242 4242 4242 4242`) → gift appears, receipt email arrives
- [ ] Test **monthly** gift → receipt contains a working "manage my monthly gift" link → Stripe Billing Portal opens
- [ ] Stripe dashboard → webhook endpoint shows the full event list (§2a), recent deliveries all `200`
- [ ] `/app/admin/orgs` shows **no** "webhook events failed" panel
- [ ] Add a test member by email → invitation email with temp password arrives → first sign-in works
- [ ] Tidings: send a test email to yourself → delivered/opened stats advance (proves Resend webhook + tracking)
- [ ] Schedule a Tidings email 2 minutes out → it sends (proves cron)
- [ ] Cron curl: `200` with Bearer secret, `401` without
- [ ] Import a 5-row test CSV, then re-import the same file → second run creates 0 duplicates
- [ ] `/embed/nvre` renders; iframe snippet from Settings works on an external page
- [ ] `npm test` — 21 passing

---

## 8. Known items intentionally NOT configurable yet

- Platform fee rate per org (hardcoded 2.2% + $0.30).
- Platform revenue (donor tips / platform fee) — business decision pending.
- Auction winner → payment settlement (offline by design, v1).
- SMS scheduled sends have no composer UI (the cron would honor them; email only for now).
- QuickBooks is CSV export, not a live sync; no public API/Zapier yet.
