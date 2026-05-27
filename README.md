# Jetson Schedule + Dispatch

Field service management app for Jetson HVAC. Replaces Zuper as the FSM;
keeps HubSpot as the CRM (portal 21424670, Vancouver TZ).

## Stack

- **Next.js 15** (App Router) on Vercel — single Node runtime, no edge.
- **Drizzle ORM** against **Supabase Postgres** (`src/db/schema.ts` is the
  single source of truth).
- **NextAuth v5** with the Drizzle Postgres adapter; JWT session strategy +
  credentials provider out of the box.
- **Hono** REST API mounted at `/api/v1/*` (catchall route at
  `app/api/v1/[[...path]]/route.ts`). OpenAPI 3.x doc at
  `/api/v1/openapi.json`; Scalar UI at `/api/docs`.
- **Sentry** for errors (client + server + edge).
- **Zustand** for client state with optimistic write-through to the API
  (`src/store.ts`).
- **Supabase Realtime** for tab-to-tab fan-out (`src/lib/events.ts`).
- **Transactional outbox** (`outbox` table) consumed by
  `app/api/internal/outbox-drain/route.ts` for HubSpot push + future
  SNS bridge.

## Local development

```bash
pnpm install
cp .env.example .env.local            # then edit
pnpm dev                              # http://localhost:3010
```

Useful scripts:

| Script                 | Purpose                                              |
|------------------------|------------------------------------------------------|
| `pnpm dev`             | Next.js dev server                                   |
| `pnpm typecheck`       | `tsc --noEmit` — must pass clean                     |
| `pnpm build`           | Production build                                     |
| `pnpm gen:api`         | Regenerate `src/api/client/types.ts` from OpenAPI    |
| `pnpm exec drizzle-kit push`     | Apply schema changes to `DATABASE_URL`     |
| `pnpm exec drizzle-kit studio`   | Web UI for the connected DB                |

### Demo mode (no DB / no auth)

If `NEXTAUTH_SECRET` is unset and `DATABASE_URL` is missing, the app
runs in **demo mode**: middleware bypass + seed data from
`src/data/seed.ts` + a built-in `demo-admin` actor. Hits to `/api/v1/*`
land as the demo admin so every dispatcher screen still works locally.

The store's `useStoreHydration()` hook tries the API once; on 401 /
network failure it falls back to the seeded store. This is what
`/tmp/jetson-snapshot` uses for the laptop demo.

## Environment variables

| Variable                          | Required | Notes                                                             |
|-----------------------------------|----------|-------------------------------------------------------------------|
| `DATABASE_URL`                    | prod     | Supabase Postgres connection string (pooled).                     |
| `DIRECT_URL`                      | optional | Direct (non-pooled) URL for Drizzle migrations.                   |
| `NEXTAUTH_SECRET`                 | prod     | 32+ char random. Toggles "demo bypass" — set in prod.             |
| `NEXTAUTH_URL`                    | prod     | Public origin, e.g. `https://autoschedule2.vercel.app`.           |
| `HUBSPOT_TOKEN`                   | prod     | Private app token (server-only — never `NEXT_PUBLIC_*`).          |
| `HUBSPOT_WEBHOOK_SECRET`          | prod     | HMAC-SHA256 shared secret for `/api/webhooks/hubspot`.            |
| `NEXT_PUBLIC_SUPABASE_URL`        | prod     | Public realtime client (read-only).                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | prod     | Public realtime client (read-only).                               |
| `OUTBOX_DRAIN_SECRET`             | prod     | Shared secret on `/api/internal/outbox-drain`.                    |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | prod | Server + client DSN.                                          |
| `CRON_SECRET`                     | prod     | Vercel Cron header; gates `/api/cron/hubspot-sync`.               |
| `DEMO_MODE`                       | optional | Force demo bypass even when `NEXTAUTH_SECRET` is set.             |

## Database

- **Schema**: `src/db/schema.ts` — every table, enum, and `$inferSelect`
  type lives here.
- **Migrations**: `src/db/migrations/` (Drizzle).
- **Apply schema**: `pnpm exec drizzle-kit push` against the active
  `DATABASE_URL`. CI does NOT run this — apply manually after PR merge.
- **Seed**: there is no automatic seed step; the demo dataset lives in
  TypeScript at `src/data/seed.ts` and is only loaded in demo mode.
- **Realtime**: a Postgres trigger on `outbox` (`pg_notify` →
  Supabase Webhook) calls `/api/internal/outbox-drain`. Don't drop
  the trigger; it's the bridge between DB writes and HubSpot push.

## Deploys

- **Vercel** auto-deploys `main` on push.
- **Preview deploys** are off by default for branches without an open
  PR (preserves the free-tier minute budget).
- **Demo snapshot**: tag `demo-snapshot-N` and check out the worktree
  at `/tmp/jetson-snapshot` — the static, no-DB build the team uses
  for sales/onboarding screen-shares.
- **Production URL**: `https://autoschedule2.vercel.app` (until a real
  domain is purchased).

## Runbook

### How to add a dispatcher

1. As an admin, sign in.
2. Open Supabase Studio (or `pnpm drizzle-kit studio`).
3. Insert into `users`:
   ```sql
   INSERT INTO users (id, email, name, "hashedPassword", role)
   VALUES (gen_random_uuid(), 'dispatcher@jetson.com', 'New Dispatcher',
           crypt('temp-password', gen_salt('bf', 10)), 'dispatcher');
   ```
   (Use bcrypt rounds=10 — matches the credentials provider in
   `auth.ts`.)
4. Have them sign in at `/login` and rotate the password from the
   profile menu (forthcoming — for now reset via SQL).

### How to rotate the HubSpot token

1. In HubSpot, create a new Private App in **Settings → Integrations →
   Private Apps**. Required scopes: `crm.objects.contacts.{read,write}`,
   `crm.objects.deals.{read,write}`, `crm.objects.custom.{read,write}`,
   `crm.schemas.custom.read`.
2. Copy the new token.
3. In Vercel → Project → Settings → Environment Variables, **add** the
   new value under a temporary key (`HUBSPOT_TOKEN_NEXT`) on Production.
4. Redeploy. Hit `/settings/integrations` → "Sync now". Verify a green
   "Synced N contacts, N deals…" toast.
5. Promote: rename `HUBSPOT_TOKEN_NEXT` → `HUBSPOT_TOKEN`, delete the
   old `HUBSPOT_TOKEN`, redeploy.
6. In HubSpot, revoke the old Private App.

### How to mint / rotate an API key

1. As admin, go to `/settings/api-keys`.
2. Click **Generate key**, give it a name + scopes (`read`, `write`,
   `admin`).
3. The plaintext secret is shown **once** in the green banner — copy
   it into 1Password immediately.
4. To rotate: mint a new key with the same scopes, update the
   consuming client, then **Revoke** the old row. Revoked keys are
   kept for audit (and rejected on use).

### How to roll back a bad deploy

1. In Vercel → Deployments, find the last known good deployment
   (green check, manual test passed).
2. Click **⋯ → Promote to Production**.
3. If a DB migration shipped with the bad deploy, run the down
   migration manually (Drizzle does NOT auto-down).
4. Post-mortem: file an issue, link the Sentry release, attach the
   diff between good and bad.

### How to wipe + reseed (demo mode)

```bash
# In the snapshot worktree (no real DB)
rm -rf /tmp/jetson-snapshot/.next
cd /tmp/jetson-snapshot
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The seed data lives at `src/data/seed.ts`; editing it and rebuilding
is the entire reseed flow. There is no `pnpm db:reset` because demo
mode never touches Postgres.

### How to inspect the audit log

- UI: `/settings` → Activity (admin/manager only, forthcoming
  surface — for now hit the API directly).
- API: `GET /api/v1/audit-log?limit=50&from=2026-05-01`
  with an `admin`-scoped API key.
- DB: `SELECT * FROM audit_log ORDER BY "createdAt" DESC LIMIT 100`.

Every mutation (POST/PATCH/PUT/DELETE on `/v1/*`) writes a row with
actor, action, entityType, entityId, before-snapshot, after-snapshot,
and timestamp. See `src/api/middleware/auditLog.ts`.

### How to replay a HubSpot webhook locally

1. Capture the live payload from HubSpot's webhook log (Settings →
   Integrations → Private Apps → Webhooks).
2. Replay:
   ```bash
   curl -X POST http://localhost:3010/api/webhooks/hubspot \
     -H "Content-Type: application/json" \
     -H "X-HubSpot-Signature-v3: <hmac>" \
     -d '<json payload>'
   ```

## Surfaces

| URL                       | Purpose                                              |
|---------------------------|------------------------------------------------------|
| `/`                       | Dispatcher app (Dispatch tab by default)             |
| `/login`                  | Sign-in page                                         |
| `/settings/*`             | Templates, rules, integrations, roles, permissions   |
| `/settings/api-keys`      | Admin: mint + revoke API keys                        |
| `/api/v1/*`               | REST surface (Hono)                                  |
| `/api/v1/openapi.json`    | OpenAPI 3.x spec                                     |
| `/api/docs`               | Scalar API reference UI                              |
| `/api/v1/audit-log`       | Audit feed (admin/manager only)                      |
| `/api/v1/me`              | Resolved actor for the current session/key           |
| `/api/cron/hubspot-sync`  | Daily 8 AM HubSpot pull (Vercel Cron)                |
| `/api/webhooks/hubspot`   | HubSpot push receiver                                |
| `/api/internal/outbox-drain` | Supabase webhook → HubSpot push                   |

## Test plan (smoke)

1. `pnpm typecheck` — clean.
2. `pnpm build` — clean.
3. Visit `/` — dispatcher renders with seed data.
4. Sign in as admin → mint an API key → `curl` `/api/v1/jobs?date=YYYY-MM-DD`
   with the key → returns rows.
5. Drag a job to a different crew → audit row appears in `audit_log`.
6. Open the same tab in two browsers — drag in tab A, watch tab B
   update within ~500ms.
7. Hit `/settings/integrations` → "Sync now" → HubSpot pulls
   contacts/deals/projects without 503.

## Future migration to AWS

The MVP stack was chosen so graduating off Vercel + Supabase is pure
infra rewiring (see the long-term migration cheat sheet in
`/Users/work/.claude/plans/curious-toasting-sifakis.md`, section
"Long-term migration to Jetson's AWS stack").
