---
name: run-admin-app
description: Launch and drive the Almonry admin app (/app/*) locally, past the Cognito login gate, to confirm a change works in the real running app.
---

# Running the Almonry admin app

Use this to actually launch the app and drive it as a user would — not the test
suite. The admin area (`/app/*`) is gated by NextAuth + Cognito (`middleware.ts`),
so unauthenticated requests 307-redirect to the Hosted UI before any page runs.
You can't complete that OAuth flow headlessly, so use the **dev-login helper** to
mint a valid session cookie from the app's own `NEXTAUTH_SECRET`.

Public pages (`/give/[orgSlug]`, `/u/[token]`, `/embed/*`) are NOT gated — hit
those directly, no cookie needed.

## 1. Start the dev server

```bash
npm run dev > /tmp/almonry-dev.log 2>&1 &
# wait until it answers (compile takes ~10-15s cold):
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null)" != "000" ] && break
  sleep 1
done
tail -5 /tmp/almonry-dev.log   # expect "✓ Ready"
```

Port is 3000 (must match `APP_BASE_URL`). Env comes from `.env.local`.

## 2. Mint a session cookie (dev-login)

`scripts/dev-login.ts` looks up an existing super_admin's real `cognito_sub` in
the DB and signs a NextAuth JWT with it — so the session resolves with **zero DB
writes** (no reconcile path). It refuses to run unless the app points at
localhost.

```bash
TOKEN=$(npx tsx scripts/dev-login.ts)              # first super_admin (jason@made180.com)
# or a specific user:  TOKEN=$(npx tsx scripts/dev-login.ts someone@example.com)
CK="next-auth.session-token=$TOKEN"
```

The active org resolves from the `ap_org` cookie, else the user's first
membership, else (super_admin) the first org alphabetically — so a super_admin
lands on `nvre` without extra setup. To pin an org, also send
`ap_org=<orgId>` in the Cookie header.

## 3. Drive it — fetch the SSR HTML and inspect

These are server components, so the rendered HTML already contains the data —
`curl` + `grep` is enough to confirm a change; no browser/JS needed.

```bash
curl -s -H "Cookie: $CK" "http://localhost:3000/app/constituents" -o /tmp/page.html -w "HTTP %{http_code}\n"
# then grep /tmp/page.html for the specific markup/data your change produces.
```

HTTP 200 (not 307) confirms the cookie was accepted. A 307 to `/auth/signin`
means the token was rejected (stale secret, wrong var). Query params drive
filters/search directly, e.g. `?q=jason&role=major%20donor`.

Server actions (form POSTs) use encrypted action IDs and are awkward to drive by
hand — verify the form *renders* correctly and cover the action's logic with the
repo/unit layer instead.

## 4. Risky SQL

If the change adds a non-trivial query, verify it against the real DB with a
throwaway `scripts/_*.ts` (dotenv → `.env.local`, `neon(DATABASE_URL)`), assert,
then delete it — cheaper than round-tripping through the UI. (See CLAUDE.md
"Conventions".)

## 5. Tear down (Windows)

`pkill` does not reliably catch the node process on Windows. Kill by port:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

Also delete any temp `scripts/_*.ts` and remove test data you seeded.
