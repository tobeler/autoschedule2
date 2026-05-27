---
title: "feat: Zuper FSM Integration (bidirectional, writeback deferred)"
type: feat
status: active
date: 2026-05-26
origin: null  # no upstream brainstorm — entered planning directly with verified context
---

# Zuper FSM Integration

## Overview

Add a Zuper read-pipeline alongside the existing HubSpot pull, mirroring the `src/integrations/hubspot/` layout. Zuper is the FSM source of truth for **jobs, schedules, crew assignments, and field execution**; HubSpot is the source of truth for **deals, contacts, and pipeline stages**. Without Zuper, the dispatch board sits empty even after a clean HubSpot sync.

Writeback (AutoSchedule → Zuper when a dispatcher schedules/reschedules/assigns) is **designed but not implemented** in this plan. The outbox already publishes the required topics; Unit 7 reserves the hookpoint and feature flag so the future writeback PR can land cleanly without touching the read path.

**Currently read-only against both HubSpot and Zuper** per active session goal. Writes to either system are out of scope for this plan's implementation.

## Problem Frame

- ~5,000 jobs live in Zuper, ~125/week active. None are in HubSpot or AutoSchedule.
- Field techs already dispatch and track work in Zuper today. We can't replace that overnight — eventual direction is *parallel writes* (AutoSchedule and Zuper stay in sync), not *cutover*.
- Zuper jobs already carry `Hubspot Deal ID` / `Hubspot Installation ID` / `Hubspot Contact ID` custom fields, so the join key to HubSpot-sourced projects already exists.
- Zuper jobs also exist with **no HubSpot deal** (e.g., warranty visits, repairs, internal trainings). The plan must accommodate Zuper-only jobs — they're first-class.
- HubSpot mapping has been verified live: all 19 deal fields + 16 contact fields present in portal 21424670, 2,193 closed-won deals indexable.
- The dispatch board renders `jobs.crewId` against the seeded crews (`c1`–`c10`). Zuper teams (`CO-DE-1`, `BC-NV-2`, etc.) don't match those ids, so crew dedup/upsert is load-bearing.

## Requirements Trace

- **R1.** Pull all currently-relevant Zuper jobs into `jobs`, with stable join keys (`zuperJobUid`) and dedup against HubSpot-sourced projects.
- **R2.** Map Zuper job_status history (NEW/SCHEDULED/DISPATCHED/ON_MY_WAY/STARTED/COMPLETED/etc.) onto AutoSchedule's `jobStatusEnum`.
- **R3.** Surface Zuper-only jobs (no HubSpot deal) in the dispatch board, not just HubSpot-linked ones.
- **R4.** Region inference: team prefix → Service Area Code → property address (matches `src/lib/api/zuper.ts:215` in jetson-kpi).
- **R5.** Idempotent re-sync: running `/api/v1/zuper/sync` twice produces no duplicate rows and no spurious updates.
- **R6.** Demo mode parity: when `ZUPER_API_KEY` is unset, the dispatch board still renders sample Zuper-shaped jobs so the laptop demo works (mirrors HubSpot's `pullHubspotForDemo`).
- **R7.** Outbox emits Zuper-shaped events on every `jobs` mutation — so Unit 7's hookpoint can land later with zero schema or route changes.
- **R8.** No HubSpot or Zuper writes in this PR. The writeback path is designed and gated behind `integrations.zuper.writeback_enabled = false`.
- **R9.** Cron-friendly: full sync completes inside Vercel's 300s function ceiling and emits a `{ created, updated, skipped, errors }` summary.

## Scope Boundaries

**In scope:**
- Read-pipeline (`/api/v1/zuper/sync`, `/api/v1/zuper/ping`)
- Schema additions for Zuper identity columns
- Region/crew dedup logic
- Demo-mode parity
- Hookpoint and feature flag for future writeback
- Fix the demo-mode drag bug at `src/store.ts` (its root cause is small enough that fixing it inside this plan is faster than a separate fix PR — and Phase 6 of this plan needs the dispatch board to actually move jobs in demo mode to be testable)

**Out of scope:**
- Actual Zuper writeback (`PATCH /jobs/{uid}`, status transitions, assignment writes) — designed in Unit 7 but not built
- HubSpot Jobs custom-object push (`pushJobToHubspot` already exists)
- Timecard / labor-hours sync (lives in jetson-kpi, not the dispatcher concern)
- Mobile (Expo) app
- Inbound Zuper webhooks beyond the route stub
- Bulk historical job import beyond a 6-month rolling window — older Zuper jobs stay in Zuper

## Context & Research

### Relevant Code and Patterns (from autoschedule2 audit)

| Mirror this | When building |
|---|---|
| `src/integrations/hubspot/client.ts` | `src/integrations/zuper/client.ts` |
| `src/integrations/hubspot/sync.ts` (parsers + `syncFromHubspot` + `pullHubspotForDemo`) | `src/integrations/zuper/sync.ts` |
| `src/integrations/hubspot/field-map-defaults.ts` (typed mappings + `STATUS_ENUM_MAP`) | `src/integrations/zuper/field-map-defaults.ts` |
| `src/integrations/hubspot/urls.ts` | `src/integrations/zuper/urls.ts` |
| `src/integrations/hubspot/schema-snapshot.json` | `src/integrations/zuper/schema-snapshot.json` (frozen sample for build-time reference) |
| `src/api/routes/hubspot.ts` (Hono `createRoute` + `app.openapi`) | `src/api/routes/zuper.ts` |
| `src/api/schemas/hubspot.ts` (Zod request/response) | `src/api/schemas/zuper.ts` |
| `src/api/routes/jobs.ts:330` (`publish({ topic: 'jobs.updated', payload: { id } })`) | Already emits — no change needed for read-pipeline |
| `db.transaction(tx => upserts via onConflictDoUpdate)` | Same shape for Zuper upserts |
| `pullHubspotForDemo()` at `src/integrations/hubspot/sync.ts:646` | `pullZuperForDemo()` |
| Hono mount at `app/api/v1/[[...path]]/route.ts` | No change — `registerZuperRoutes(app)` added to `src/api/app.ts` |

**Critical files to read before touching anything:**
- `src/db/schema.ts` — every column addition lands here
- `src/db/migrations/0001_outbox_triggers.sql` — already publishes `jobs.updated`/`crews.updated`/`timeoff.updated`/`slots.updated`; we add no new triggers
- `src/api/db/outbox.ts` — `publish({topic, payload})` helper used from routes
- `src/store.ts:653` (`moveJob`) — demo-mode bug location (see Unit 6)

### Relevant Code from `tobeler/jetson-kpi` (port targets)

Roughly **550 lines of `src/lib/api/zuper.ts` are direct-port candidates**, stripped of KPI-specific functions:

| Symbol | Lines | Reuse plan |
|---|---|---|
| `zuperGet<T>()` | 29–54 | Direct port to `src/integrations/zuper/client.ts` |
| `fetchAllPages<T>()` | 182–204 | Direct port (`?page=1&count=1000` loop, stop when `data.length < count`) |
| `inferRegion()` | 215–232 | Direct port (`REGION_PREFIXES = ["MA","CO","NY","BC"]`) |
| `normalizeCustomFieldLabel()` + `getCustomFieldValue()` | 141–147 | Direct port |
| `getHubspotDealId()` / `getHubspotInstallationId()` | (helpers) | Direct port; add `getHubspotContactId()` and `getServiceAreaCode()` |
| `currentStatus()` | 208–210 | Direct port (`job.job_status[last].status_type`) |
| `getTeamRosters()` | 408–431 | Port with 5-min cache → drop into our Drizzle `crews` upsert |
| `INSTALL_CATEGORIES` / `REPAIR_CATEGORIES` sets | 765–781 | Keep verbatim |
| 429/529 retry (`attempt * 1500ms` × 3) | inside `zuperGet` | Direct port |
| Webhook event list (`/scripts/register-zuper-webhooks.ts`) | 36–42 | Reference for Phase 6 stub: `job.created`, `job.updated`, `job.status_updated`, `job.assignment_updated` |

**KPI-only code to leave behind:** weekly/capacity/OT calculations, timesheets fetcher, all metric aggregations.

### Institutional Learnings (from `docs/solutions/` + Jetson memory)

- **Both systems own different fields.** HubSpot: deal/stage/customer. Zuper: scheduling/labor/completion. Don't pick a single "winner" per row — pick per field. (`project_hubspot_installations.md`)
- **Zuper query params are advisory.** `/jobs` ignores date params; `/timesheets` ignores `job_uid`. Always client-filter after fetch. (`discovery_zuper_timelog_api.md`)
- **No mock data in live mode, ever.** Empty state > fake numbers. Demo mode must be obviously demo. (`feedback_no_mock_data.md`)
- **The outbox is load-bearing for the future AWS migration.** Writeback must funnel through `outbox`, never direct API calls from routes. (`onboarding-reading-order.md`)
- **Erik dislikes premature reconciliation complexity.** Prefer per-field conflict rules in code over per-row "last winner" columns.

### External References

- Zuper API docs (private, not yet linked) — base URL `https://us-east-1.zuperpro.com/api`, auth `x-api-key`, response envelope `{ type, data: T[], total_records? }`
- HubSpot API v3 (already wired in `src/integrations/hubspot/client.ts`)

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| Mirror HubSpot integration's 5-file layout under `src/integrations/zuper/` | Already-proven structure; reviewer familiarity; same conventions for `isConfigured()`/`ConfigError`/`ApiError`/`pagedSearch` |
| Use `zuperJobUid` (Zuper's `job_uid`) as the dedup key on `jobs`, not `hubspotDealId` | Many Zuper jobs lack a HubSpot deal (warranty, repairs). `job_uid` is universal and stable |
| Add `zuperJobUid` / `zuperJobUrl` to `jobs`; `zuperCustomerId` to `customers`; `zuperTeamId` to `crews`; **no new tables** | Per learnings: avoid per-table `lastSyncedFromZuperAt` sprawl. The outbox already records mutation timing |
| Status enum: add `'cancelled'` to `jobStatusEnum` for terminal Zuper failures (CANCELED/FAILED/CANNOT_COMPLETE) | Today's 6-value enum has no terminal-failure state. `'callback'` semantically means "needs revisit," not "this job is dead" |
| Region inference: team prefix → Service Area Code → property address (verbatim from jetson-kpi) | Already battle-tested against real Jetson data. Same priority order across all sister repos |
| Sync rolling window: 6 months back, all future | ~125 jobs/week × 26 weeks = ~3,250 jobs per pull. Fits inside the 5,000-record /jobs response and well under the 300s function ceiling |
| Cron cadence: every 15 min via `vercel.json` | Same TTL as jetson-kpi's `completedInstallCache`; lower than typical Zuper update lag |
| Field tech in Zuper still owns "the truth" for in-flight jobs | If a tech marks ON_MY_WAY in Zuper, our sync overwrites our local copy. AutoSchedule's edits during the sync window go to outbox → future writeback. No silent conflict resolution |
| Per-field conflict rule (not per-row): Zuper wins for `scheduled_start_time`, `crewId`, `status` (when terminal). AutoSchedule wins for `notes`, `address` (when manually edited via UI), `slots` | Matches institutional learning: per-field over per-row |
| Demo mode: seed with 6–8 Zuper-style sample jobs spanning multiple regions/crews/statuses | Fixes the "empty board" laptop demo problem; lets us test drag-to-move (which is currently broken — see Unit 6) |
| Writeback hookpoint = extending `drainOutboxRow` to route `jobs.updated` → `pushJobToZuper(id)` behind a `settings_kv` feature flag | Single fan-out seam, matches HubSpot's existing pattern, can flip on/off without redeploy |

## Open Questions

### Resolved During Planning

- **Q: How do we dedup Zuper jobs against HubSpot-sourced rows?** A: Match on `customFields.Hubspot Deal ID` → `projects.hubspotDealId` first; if no match, create a standalone job with `projectId=null` and just `customerId` derived from `customFields.Hubspot Contact ID` (if present) or address-only.
- **Q: Status enum gap?** A: Add `'cancelled'` (one new value). `'callback'` keeps its current meaning (needs revisit).
- **Q: Cron frequency?** A: 15 min. Tunable later.
- **Q: Are we writing to Zuper now?** A: No. Hookpoint only.
- **Q: Sync rolling window?** A: 6 months back, all future. Older jobs stay in Zuper.

### Deferred to Implementation

- **Exact Zuper job → app job_type mapping** for our `jobs.type` field (e.g., "Heat Pump Installation" → "heatpump"). The category list in `INSTALL_CATEGORIES` is a starting point; final mapping will surface real edge cases (warranty / smart-system retrofit / EV charger ambiguities) only once we see live data. Plan: start with a permissive `slugify(category_name)` and a typed override table in `field-map-defaults.ts`.
- **What `assigned_to` users from Zuper map to in our `people` table.** Likely needs a separate `zuperUserId` upsert pass — but we don't have a `people` seed strategy yet for live tenants. Plan: import people lazily on first job that references them, name-match against existing.
- **How to handle multi-day Zuper jobs.** Zuper's `scheduled_start_time` / `scheduled_end_time` can span days. Our schema has `multidayGroupId` machinery — but the splitting rules differ from Zuper's continuous-time model. Implementation will discover the right split. Skip for the read-pipeline if `daysSpanned > 1` is rare; surface a warning.
- **Zuper webhook reception** (real-time vs. cron-only). Webhook route is scaffolded in Phase 6 but not validated against live Zuper webhook delivery in this PR.
- **Rate-limit budget.** jetson-kpi assumes 3-attempt retry is enough. If autoschedule2 + jetson-kpi both run against the same Zuper account, cron alignment may matter. Defer until we hit the limit.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Data Flow — Before / After

```
BEFORE (current state):

  HubSpot ──pull──▶ AutoSchedule (customers, projects, regions)
                       │
                       └─ jobs table: empty (HubSpot has no jobs)

  Zuper: 5,000 jobs invisible to AutoSchedule


AFTER (this plan, read-only):

  HubSpot ──pull──▶ AutoSchedule ◀──pull── Zuper
                    customers ◀──── join ─── custom_fields["Hubspot Contact ID"]
                    projects  ◀──── join ─── custom_fields["Hubspot Deal ID"]
                    regions   ◀──── upsert ── team prefix / Service Area Code
                    crews     ◀──── upsert ── team name (CO-DE-1)
                    jobs      ◀──── upsert ── job_uid (dedup key)
                       │
                       └─ outbox.publish('jobs.updated') ◀── DB triggers (already wired)
                                    │
                                    └─ drainOutboxRow() → [feature-flagged Zuper push] (Unit 7, NOT implemented)

EVENTUAL (writeback enabled, future PR):

  HubSpot ◀─push── AutoSchedule ──push──▶ Zuper
                      │                    PATCH /jobs/{uid} { scheduled_start_time, assigned_to_team, status }
                      └─ outbox → pushJobToZuper() / pushJobToHubspot()
```

### Per-Field Source-of-Truth Matrix

| Field | Source on PULL | Conflict policy (when writeback lands) |
|---|---|---|
| `jobs.zuperJobUid` | Zuper (immutable join key) | n/a |
| `jobs.customerId` | HubSpot Contact (via `custom_fields["Hubspot Contact ID"]` → existing customer); fallback Zuper property |
| `jobs.projectId` | HubSpot Deal (via `custom_fields["Hubspot Deal ID"]` → existing project); null if no match |
| `jobs.date` / `startHour` / `endHour` | Zuper `scheduled_start_time` / `scheduled_end_time` | Zuper wins; AutoSchedule edits queue to outbox |
| `jobs.status` | Zuper job_status history (latest) | Zuper wins for terminal statuses; AutoSchedule wins for `enroute`/`onsite` lifecycle edits |
| `jobs.crewId` | Zuper `assigned_to_team[0]` → matched `crews.zuperTeamId` | Zuper wins on pull; AutoSchedule wins on user drag |
| `jobs.address` | Zuper `property.property_address` | AutoSchedule preserves manual edits (compare timestamps) |
| `jobs.notes` | Zuper `job_notes` (if exposed) | AutoSchedule preserves manual edits |
| `jobs.hubspotDealId` | HubSpot Contact → join | HubSpot wins |
| `jobs.type` | Slugified Zuper `job_category.category_name` | Zuper wins (read-mostly field) |

## Implementation Units

- [ ] **Unit 1: Schema additions + migration**

**Goal:** Add Zuper identity columns to `jobs`, `customers`, `crews`, `regions`, plus the `'cancelled'` value on `jobStatusEnum`. Also add a `settings_kv` row for the writeback feature flag.

**Requirements:** R1, R2, R7, R8

**Dependencies:** None.

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0002_zuper_columns.sql`
- Modify: `src/db/migrations/meta/_journal.json` (drizzle-kit generate handles this)
- Test: `src/integrations/zuper/__tests__/schema.test.ts`

**Approach:**
- Add columns: `jobs.zuperJobUid` (text, unique), `jobs.zuperJobUrl` (text), `jobs.zuperSyncedAt` (timestamptz), `customers.zuperCustomerId` (text), `crews.zuperTeamId` (text, unique), `crews.zuperTeamName` (text — preserves the human-readable "CO-DE-1" for UI), `regions.zuperServiceAreaCode` (text — e.g., "CO-DE"; matches existing `regions.short` semantically but unambiguous).
- Extend `jobStatusEnum` with `'cancelled'`. Update `src/types.ts` `JobStatus` union accordingly.
- Add a unique index on `jobs.zuperJobUid` (filtered: WHERE NOT NULL) so HubSpot-only jobs without a Zuper UID don't collide.
- Seed `settings_kv` with `{ key: 'integrations.zuper.writeback_enabled', value: false }`.
- Apply migration via Supabase MCP `apply_migration` (don't run drizzle-kit push — same workflow we used for Phase 1 setup).

**Patterns to follow:**
- Existing `jobs.hubspotJobObjectId` (sibling identity column)
- Existing `crews.color` / `crews.type` (column shape)
- `settings_kv` table — already exists in `0000_init.sql`

**Test scenarios:**
- Happy path: insert a row with zuperJobUid="ABC" — fetches back identically
- Edge case: insert two rows both with `zuperJobUid=null` — both succeed (filtered unique)
- Edge case: insert two rows with same non-null zuperJobUid — second fails with unique violation
- Happy path: `status = 'cancelled'` accepted; previously-valid values still accepted
- Happy path: `settings_kv` row for the writeback flag retrievable by key

**Verification:**
- `pnpm typecheck` clean (no enum-narrowing regressions in views that switch on `JobStatus`)
- `pnpm drizzle-kit generate` produces an empty diff (schema and migration in sync)
- Supabase MCP `list_tables` confirms new columns present


- [ ] **Unit 2: Zuper API client**

**Goal:** Port the read-side of jetson-kpi's `src/lib/api/zuper.ts` into `src/integrations/zuper/client.ts`, stripped of KPI-specific code, mirroring the HubSpot client's `isConfigured()` / `ConfigError` / `ApiError` shape.

**Requirements:** R5, R6

**Dependencies:** None (env vars only).

**Files:**
- Create: `src/integrations/zuper/client.ts`
- Create: `src/integrations/zuper/types.ts` (ZuperJob, ZuperTeam, ZuperUser, ZuperCustomField shapes)
- Test: `src/integrations/zuper/__tests__/client.test.ts`

**Approach:**
- Port `zuperGet<T>()`, `fetchAllPages<T>()`, retry on 429/529 with `attempt * 1500ms` backoff (3 attempts), and the `getCustomFieldValue()` / `normalizeCustomFieldLabel()` helpers verbatim.
- Add `isZuperConfigured()` returning true iff `process.env.ZUPER_API_KEY` is set.
- Throw `ZuperConfigError` when unconfigured, `ZuperApiError` for upstream failures. Both extend `Error`. Mirror `src/integrations/hubspot/client.ts:HubspotConfigError` / `HubspotApiError`.
- Expose: `pingAccount()` (GET `/account/details` or equivalent — confirm path during impl), `listJobs(opts: { since?: Date; until?: Date; statuses?: ZuperStatus[] })`, `getJob(uid)`, `listTeams()`.
- `listJobs` always client-filters after fetch (Zuper ignores date params).
- `pagedSearch` cap: 10 pages × 1000 = 10,000 jobs ceiling (we expect ~3,250).

**Patterns to follow:**
- `src/integrations/hubspot/client.ts` — error class shape, configured-gate, paged-search cap pattern
- jetson-kpi `src/lib/api/zuper.ts:29–54` — request shape

**Test scenarios:**
- Happy path: `pingAccount()` with valid `ZUPER_API_KEY` returns `{ ok: true }`
- Error path: `ZUPER_API_KEY` unset → `isZuperConfigured()` returns false; `pingAccount()` throws `ZuperConfigError`
- Error path: API returns 429 once, 200 on retry — request succeeds after backoff
- Error path: API returns 429 three times — throws `ZuperApiError` with "rate limited after retries"
- Edge case: `listJobs({ since: today })` returns ALL jobs from upstream (date param ignored), then client-filters down — final array only contains jobs with `scheduled_start_time >= today`
- Edge case: pagination — mock 3 pages of 1000 + 1 page of 50 → returns 3050 total, loop exits at page 4

**Verification:**
- All client tests pass against a mocked fetch
- `pingAccount()` against the real Zuper API returns 200 when ZUPER_API_KEY is set in local env


- [ ] **Unit 3: Zuper sync orchestrator (read pipeline)**

**Goal:** Implement `syncFromZuper()` and `pullZuperForDemo()` in `src/integrations/zuper/sync.ts`, following the HubSpot sync's transaction + upsert + parse pattern.

**Requirements:** R1, R3, R4, R5, R6, R9

**Dependencies:** Unit 1 (columns), Unit 2 (client).

**Files:**
- Create: `src/integrations/zuper/sync.ts`
- Create: `src/integrations/zuper/field-map-defaults.ts` (status enum map, category → job_type map, region prefix set)
- Test: `src/integrations/zuper/__tests__/sync.test.ts`

**Approach:**
- Pure parsers first (no DB): `parseZuperJobToApp(zuperJob, ctx)` returns `{ job: Job, crewUpsert?, regionUpsert? }`. `ctx` carries pre-fetched HubSpot deal/contact id lookups so the parser stays sync.
- `syncFromZuper(opts: { window?: { since: Date; until: Date } })`:
  1. Pre-fetch lookup maps in one query each: `Map<hubspotDealId, projectId>`, `Map<hubspotContactId, customerId>`, `Map<zuperTeamId, crewId>`.
  2. `listJobs()` from Zuper with 6-month window (client-filtered).
  3. For each job: build region (inferRegion), upsert region row, upsert crew row (keyed on `zuperTeamId`), parse the job, upsert `jobs` row (keyed on `zuperJobUid`).
  4. All inside a single `db.transaction(tx => ...)`.
  5. Return `{ pulled, created, updated, skipped, errors: [{ jobUid, message }] }`.
- `pullZuperForDemo()`: same parser logic, but returns the array of parsed jobs without DB writes (mirrors `pullHubspotForDemo`).
- Status mapping (in `field-map-defaults.ts`):
  - `NEW` → `unscheduled`
  - `SCHEDULED` → `scheduled`
  - `DISPATCHED` → `scheduled`
  - `ON_MY_WAY` → `enroute`
  - `STARTED` → `onsite`
  - `ON_HOLD` → `scheduled` (with a note flag; surfaced in UI later)
  - `FOLLOW_UP` / `FOLLOW_UP_SAME_JOB` → `callback`
  - `COMPLETED` / `CLOSED` → `complete`
  - `CANCELED` / `CANNOT_COMPLETE` / `FAILED` → `cancelled` (new enum value from Unit 1)
- Idempotency: every upsert uses `onConflictDoUpdate({ target: zuperJobUid, set: {...mutableFields, updatedAt: new Date() } })`. Re-running with no upstream changes produces zero `updated` rows.
- Address: copy from `property.property_address` (string concat city/state/zip if structured).

**Patterns to follow:**
- `src/integrations/hubspot/sync.ts:291` (`syncFromHubspot`) — single-transaction shape
- `src/integrations/hubspot/sync.ts:646` (`pullHubspotForDemo`) — DB-free parser mirror
- jetson-kpi `inferRegion()` for region resolution
- jetson-kpi `INSTALL_CATEGORIES` / `REPAIR_CATEGORIES` for `jobs.type` derivation seed

**Test scenarios:**
- Happy path: 1 Zuper job with valid `Hubspot Deal ID` matching an existing project → creates `jobs` row with correct `projectId`, `customerId`, `crewId`, `date`, `startHour`, `status`
- Happy path: 1 Zuper job with NO `Hubspot Deal ID` → creates `jobs` row with `projectId=null`, customer still resolved via address
- Happy path: status=COMPLETED, terminal → maps to `complete`
- Happy path: status=ON_MY_WAY → maps to `enroute`
- Edge case: same job pulled twice → second pull updates nothing (no diff)
- Edge case: same job pulled again with new `scheduled_start_time` → `updated += 1`, row reflects new value
- Edge case: Zuper team "CO-DE-1" doesn't exist in `crews` → first job creates the crew, second job reuses it (crewId stable)
- Edge case: Zuper job with `daysSpanned > 1` → log a warning, skip multi-day splitting (deferred), but still create one row covering the start day
- Error path: Zuper API down → throws, no partial writes (transaction rolls back)
- Error path: One job in the batch has malformed data → that job's error appended to `errors[]`, batch continues
- Integration: `outbox` table has a `jobs.updated` (or `jobs.created`) row after a successful sync (because the DB trigger fired)

**Verification:**
- `syncFromZuper()` against a mocked Zuper returning 10 fixture jobs results in: 10 rows in `jobs`, ≥4 rows in `crews` (one per distinct team), ≥1 row in `regions`, 10 rows in `outbox`
- Re-running syncFromZuper() with unchanged upstream returns `{ created: 0, updated: 0 }`


- [ ] **Unit 4: Hono API routes (`/api/v1/zuper/ping`, `/api/v1/zuper/sync`)**

**Goal:** Expose the Zuper read-pipeline as authenticated REST endpoints, mirroring the HubSpot routes.

**Requirements:** R5, R6, R8, R9

**Dependencies:** Units 2 and 3.

**Files:**
- Create: `src/api/routes/zuper.ts`
- Create: `src/api/schemas/zuper.ts` (Zod request/response schemas)
- Modify: `src/api/app.ts` (one line: `registerZuperRoutes(app)`)
- Test: `src/api/routes/__tests__/zuper.test.ts`

**Approach:**
- Two routes only (no writeback routes in this PR):
  - `POST /api/v1/zuper/ping` → returns `{ ok, baseUrl, configured: bool }`. 503 if unconfigured.
  - `POST /api/v1/zuper/sync` → invokes `syncFromZuper()` or `pullZuperForDemo()` based on `process.env.DATABASE_URL`. Returns the SyncResult.
- Same `translateZuperError(err)` helper that converts `ZuperConfigError` → 503, `ZuperApiError` → 502, others → 500. Mirrors `translateHubspotError` at `src/api/routes/hubspot.ts:133`.
- Auth: session-required (matches `/api/v1/hubspot/*`). Admin-role gate via existing middleware.
- Audit log: emit `audit_log` entry `{ action: 'zuper.sync', actorUserId, after: { pulled, created, updated } }`.

**Patterns to follow:**
- `src/api/routes/hubspot.ts` (whole file shape, especially the `createRoute(...)` blocks and `app.openapi(route, handler)` registration)
- `src/api/app.ts` ordering: auth → audit → logger → registerXxxRoutes

**Test scenarios:**
- Happy path: authenticated POST /api/v1/zuper/ping with `ZUPER_API_KEY` set → 200, `{ ok: true, configured: true }`
- Error path: unauthenticated → 401
- Error path: authenticated as `dispatcher` (not admin) — depends on existing policy; verify behavior matches `/api/v1/hubspot/sync` exactly
- Error path: `ZUPER_API_KEY` unset → 503 with RFC 7807 problem detail
- Error path: Zuper returns 503 → our endpoint returns 502 with `detail` quoting upstream status
- Happy path: POST /api/v1/zuper/sync in demo mode (`DATABASE_URL` unset) → returns demo payload, no DB writes
- Integration: audit_log row created on successful sync; `actorUserId` matches session

**Verification:**
- `curl -X POST /api/v1/zuper/ping` with a cookie returns 200
- OpenAPI doc at `/api/docs` shows the two new routes
- `pnpm typecheck` clean


- [ ] **Unit 5: Demo-mode Zuper seed + parity**

**Goal:** Ensure the dispatch board still renders Zuper-shaped jobs when neither `DATABASE_URL` nor `ZUPER_API_KEY` is set. Update `src/data/seed.ts` with 6–8 sample jobs spanning multiple regions, crews, and statuses.

**Requirements:** R6

**Dependencies:** Unit 1 (so seed can carry `zuperJobUid` shape).

**Files:**
- Modify: `src/data/seed.ts`
- Modify: `src/store.ts` (apiMode-aware Zuper sync action wires to `pullZuperForDemo`)
- Test: `src/data/__tests__/seed.test.ts`

**Approach:**
- Add 6–8 jobs to `SEED.jobs[]`, each with `zuperJobUid: 'demo-zup-…'` and a mix of statuses (`scheduled`, `enroute`, `onsite`, `unscheduled`, one `cancelled`).
- Ensure crews `c1`/`c2`/etc. get a non-null `zuperTeamId` so demo dedup logic exercises the matching path.
- Add `Settings → Integrations → Zuper card` UI affordance with a "Sync now" button that calls `pullZuperForDemo()` in demo mode (mirrors HubSpot's existing Settings card behavior).

**Patterns to follow:**
- `src/data/seed.ts:131` (CREWS) and `:194` (REGIONS) — existing seed shape
- `src/views/settings/IntegrationsPanel.tsx` — HubSpot card; clone for Zuper

**Test scenarios:**
- Happy path: with no env vars, dispatch board renders ≥6 jobs on `TODAY`
- Happy path: drag-to-move on a seeded job updates store state (sanity check Unit 6's fix is exercised)
- Edge case: clicking "Sync now (demo)" in Settings reloads from seed + Zuper fixtures

**Verification:**
- `pnpm dev` with empty env → http://localhost:3010 shows populated board after first login
- Playwright snapshot of dispatch board shows ≥6 job cards


- [ ] **Unit 6: Fix demo-mode drag bug at `src/store.ts:653`**

**Goal:** Make drag-to-move work in demo mode. Today the optimistic update is computed correctly but the surrounding `apiMode` check and `.catch` revert mishandle the demo branch.

**Requirements:** R6 (testability), plus a known bug Erik flagged in-session

**Dependencies:** None (independent fix).

**Files:**
- Modify: `src/store.ts` (`moveJob`, likely lines 653–703)
- Test: `src/store/__tests__/moveJob.test.ts`

**Approach:**
- Debug starting point per the audit: `set({ jobs: prev })` in the `.catch` may fire even when `apiMode` was false at call-time. Verify which branch the demo path takes.
- Fix: gate the `client.jobs.update(...)` call AND its catch handler on the **same** `apiMode` value snapshotted before the call. In demo mode, persist via the Zustand `persist` middleware and skip the API write entirely.
- Same fix may be needed for sibling actions (`createJob`, `deleteJob`, `assignCrew`).

**Patterns to follow:**
- Existing `apiMode` checks elsewhere in `src/store.ts`

**Test scenarios:**
- Happy path: `apiMode=false`, call `moveJob('j1', { date: '2026-05-27', startHour: 9, crewId: 'c1' })` → state contains the moved job; no API call
- Edge case: `apiMode=true`, simulated 500 → state reverts; toast emitted
- Edge case: `apiMode=false`, simulated revert path → does NOT revert (no API was called)
- Integration: refresh page in demo mode (persist middleware restores) → moved job position survives

**Verification:**
- Playwright: drag a job from one crew lane to another in demo mode; refresh; job is still in the new position
- Unit tests pass


- [ ] **Unit 7: Writeback hookpoint + feature flag (DESIGNED, NOT IMPLEMENTED)**

**Goal:** Reserve the seam for future Zuper writeback without implementing any write calls. Land the feature flag, the outbox dispatcher entry, and a stub function that returns "writeback disabled".

**Requirements:** R7, R8

**Dependencies:** Unit 1 (settings_kv row).

**Files:**
- Modify: `src/integrations/hubspot/sync.ts` (extend `drainOutboxRow` topic router)
- Create: `src/integrations/zuper/writeback.ts` (stub functions only)
- Modify: `src/views/settings/IntegrationsPanel.tsx` (read-only "Writeback: disabled" indicator on the Zuper card)
- Test: `src/integrations/zuper/__tests__/writeback.test.ts`

**Approach:**
- In `drainOutboxRow(rowId)`: after the existing `pushJobToHubspot(id)` branch, add `if (zuperWritebackEnabled) await pushJobToZuper(id);` reading the flag from `settings_kv`. Default: false, so the existing behavior is unchanged.
- `pushJobToZuper(jobId)` in `src/integrations/zuper/writeback.ts`: signature defined, body returns `{ ok: false, skipped: true, reason: 'zuper-writeback-disabled' }` until the future PR. **No `PATCH /jobs/{uid}` calls in this PR.**
- Document the *intended* request shape in the function's docstring so the future implementer has the contract (verified against `tobeler/rebate-dashboard`):
  - **Schedule writes**: `PUT /api/jobs/schedule` body `{ job_uid, from_date, to_date }` (flat, ISO date strings — NOT a PATCH on the job object)
  - **Assignment writes**: `POST /api/jobs/assign` body `{ users: [{ user_uid, team_uid }], job_uid, assignment_type: 'ASSIGN' }` — requires `team_uid` lookup before send if not cached
  - **Status transitions**: not observed in rebate-dashboard; needs separate discovery in the writeback PR (likely a separate endpoint, not a job PATCH)
  - **Job creation**: rebate-dashboard delegates to an n8n webhook rather than calling Zuper directly. For autoschedule2 we likely call Zuper directly since we own the outbox.
  - **Idempotency**: schedule/assign are NOT lookup-first in rebate-dashboard. We will lookup-first using `zuperJobUid` (we already store it from the read pipeline) before sending updates to avoid creating duplicates if a job_uid drift occurs.
  - **Error handling**: rebate-dashboard does no retries on 5xx/4xx, surfaces immediately. autoschedule2 will retry via outbox (transient errors → re-enqueue with backoff; 4xx → mark delivered with error). Pattern divergence is intentional — rebate-dashboard is request-scoped (user is waiting), autoschedule2 writeback is background-scoped (eventual consistency is fine).
  - **HubSpot writes** (for parallel `pushJobToHubspot` improvement): rebate-dashboard uses `withRetry(fn, maxRetries=3)` with `5000ms * 1.5^attempt + ±1000ms jitter`, but only retries 429. Adopt this pattern for our outbox-driven writes; 5xx also gets retried since outbox is durable.
- Surface the feature flag in `Settings → Integrations → Zuper`: read-only badge "Writeback: disabled" + tooltip "Enable in a future release."

**Patterns to follow:**
- `src/integrations/hubspot/sync.ts:1128` (`drainOutboxRow`) — topic-router shape
- `src/integrations/hubspot/sync.ts:985` (`pushJobToHubspot`) — eventual writeback function signature

**Test scenarios:**
- Happy path: `drainOutboxRow(jobUpdatedRowId)` with flag=false → HubSpot push runs, Zuper stub returns `skipped: true`, no Zuper API call attempted
- Happy path: flag=true (manually toggled in test) → calls `pushJobToZuper()` which still returns `skipped: true` (because writeback impl is deferred), but the *invocation path* is exercised
- Edge case: stub function never makes a network request (mock fetch, assert no calls)

**Verification:**
- `settings_kv['integrations.zuper.writeback_enabled'] === false` in fresh DB
- Outbox drain emits a log line "Zuper writeback skipped (flag off)" but no external request
- Settings UI shows the disabled state clearly


- [ ] **Unit 8: Cron + webhook stub + deploy plumbing**

**Goal:** Schedule the Zuper sync to run every 15 min via Vercel cron, and scaffold the inbound webhook route for future real-time sync.

**Requirements:** R9

**Dependencies:** Unit 4 (sync route).

**Files:**
- Modify: `vercel.json` (add cron entry)
- Create: `app/api/cron/zuper-sync/route.ts` (cron-only entry that invokes `syncFromZuper()`)
- Create: `app/api/webhooks/zuper/route.ts` (stub: validates signature, enqueues to outbox, returns 200)
- Modify: `.env.example` (add `ZUPER_BASE_URL`, `ZUPER_API_KEY`, `ZUPER_WEBHOOK_SECRET`)
- Test: `src/integrations/zuper/__tests__/cron.test.ts`

**Approach:**
- Cron entry: `{ path: '/api/cron/zuper-sync', schedule: '*/15 * * * *' }`.
- Cron handler: validate `Authorization: Bearer ${CRON_SECRET}` header (matches existing cron pattern); invoke `syncFromZuper()`; return summary.
- Webhook stub: HMAC-verify with `ZUPER_WEBHOOK_SECRET`; publish to `outbox` with topic `zuper.webhook.received` carrying the raw payload; return 200. The actual fan-out (sync just this one job) lands in the writeback PR.
- Update HANDOFF.md with the new env vars Erik needs to set.

**Patterns to follow:**
- Existing `vercel.json` HubSpot cron entry
- Existing `app/api/webhooks/hubspot/route.ts` for signature verification

**Test scenarios:**
- Happy path: cron handler with valid bearer token → invokes sync, returns 200 with summary
- Error path: cron handler with bad bearer → 401
- Edge case: webhook with valid signature → enqueues outbox row, returns 200
- Error path: webhook with bad signature → 401, no outbox enqueue
- Edge case: webhook payload missing `event` field → 400

**Verification:**
- `vercel.json` parses; cron entry visible in Vercel dashboard after deploy
- Manual curl to `/api/cron/zuper-sync` with cron secret returns 200
- HANDOFF.md updated; `.env.example` has the three new vars

## System-Wide Impact

- **Interaction graph:** The `outbox` table is now consumed by *two* drainers — HubSpot's existing branch and Zuper's stub. The trigger fires once per mutation regardless of how many subscribers. `src/api/routes/jobs.ts` emits `jobs.updated` via `outbox.publish()`; that single call fans out to both downstream systems in the future.
- **Error propagation:** Sync errors return RFC 7807 from `/api/v1/zuper/sync`. Per-job errors inside a successful sync are returned in `errors[]` (partial success). Cron handler treats non-zero `errors.length` as a warning, not a failure (logs but returns 200 so Vercel doesn't mark the cron failed).
- **State lifecycle risks:** Re-syncing an in-progress job (`enroute`/`onsite`) could overwrite a status the dispatcher set locally. Mitigation: per-field policy in the Key Decisions table — AutoSchedule wins for `enroute`/`onsite` lifecycle states. The sync diff comparison must respect this.
- **API surface parity:** `/api/v1/zuper/ping` and `/sync` match the shape of `/api/v1/hubspot/ping` and `/sync`. The Settings → Integrations panel gains a Zuper card mirroring the HubSpot card.
- **Integration coverage:** The single transactional upsert in `syncFromZuper` writes to four tables (`jobs`, `crews`, `regions`, `customers` potentially). Test coverage must include the "team didn't exist yet" path — crew creation happens *inside* the same transaction as the job upsert, so a failed crew insert rolls back the job.
- **Unchanged invariants:** The HubSpot read-pipeline is untouched. The outbox trigger SQL is untouched. The `jobs` table primary key is untouched (we add a column, not change the PK). The `pushJobToHubspot` writeback continues to work because Unit 7 *extends* the topic router, doesn't replace it.

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Zuper team naming drift (`CO-DE-1` → `CO-DE-1-Install`) breaks crew dedup | Medium | Medium | Match on `zuperTeamId` (immutable UID), not `zuperTeamName`. Name is for display only. |
| Sync exceeds 300s function ceiling on first full pull | Low | High | Cap rolling window at 6 months. Implement resume token if needed (out of scope; flagged for next PR). |
| Multi-day Zuper jobs misrepresented as single-day | Medium | Low | Log warning; defer splitting; flag in UI when `daysSpanned > 1`. |
| Re-pull overwrites in-flight dispatcher edit | Medium | High | Per-field source-of-truth matrix (decisions table). Test scenario in Unit 3 specifically asserts this. |
| Zuper API outage during cron run | High | Low | Existing 3-retry backoff. Cron returns 200 on partial failure; alerts only on prolonged failure (separate observability concern). |
| `'cancelled'` enum addition breaks existing switch statements in views | Low | Medium | TypeScript catches at compile time. `pnpm typecheck` gate in Unit 1's verification. |
| Future writeback floods Zuper API during burst dispatch edits | Medium | Medium | Designed in Unit 7: outbox dispatcher with rate limit and backoff. **Not implemented now**, but the seam is ready. |
| Two Zuper integrations (autoschedule2 + jetson-kpi) running against same account hit rate limits | Low | Medium | Stagger crons (jetson-kpi: top of hour; autoschedule2: :15/:30/:45). Defer; revisit if observed. |
| Demo-mode bug fix in Unit 6 has wider scope than expected | Medium | Low | If `moveJob` fix reveals sibling bugs in `createJob`/`deleteJob`, scope creep limited to those — same-pattern fixes |

## Documentation / Operational Notes

- **HANDOFF.md updates** (Unit 8): add a new section §3 (or fold into §2) covering Zuper setup:
  1. Get Zuper API key from Settings → Integrations → API Keys
  2. Add to Vercel env vars: `ZUPER_BASE_URL`, `ZUPER_API_KEY`, `ZUPER_WEBHOOK_SECRET`
  3. First sync: trigger via Settings → Integrations → Zuper → Sync now
- **`.env.example`**: add the three Zuper vars
- **`docs/solutions/conventions/`**: add `zuper-integration.md` documenting the per-field source-of-truth matrix and the writeback hookpoint
- **Observability**: log every sync's summary (`pulled, created, updated, errors`) at INFO. Sentry breadcrumbs for individual job errors.
- **Rollout posture**: deploy with `integrations.zuper.writeback_enabled = false`. The cron starts pulling immediately. No user-facing change beyond a populated dispatch board.

## Phased Delivery

### Phase A — Read pipeline (Units 1–4)
**Lands first.** Schema, client, sync, route. Dispatch board starts showing real jobs after first cron run. No writes anywhere.

### Phase B — Demo parity + dispatch bug (Units 5–6)
**Independently shippable.** Demo mode gets Zuper-shaped seed data; drag-to-move works in demo. Fixes Erik's reported bug.

### Phase C — Hookpoint + plumbing (Units 7–8)
**Lands last.** Outbox router extension (no behavior change), webhook stub, cron, env vars in `.env.example`/HANDOFF. Sets up the surface area for the future writeback PR without enabling any writes.

### Future PR (NOT THIS PLAN)
Enable Zuper writeback: implement `pushJobToZuper`, flip the feature flag, wire status transitions and assignment writes. Will reference patterns mined from `tobeler/rebate-dashboard` (see Unit 7 docstring).

## Sources & References

- **Repos referenced (read-only):**
  - `tobeler/jetson-kpi` — `src/lib/api/zuper.ts` (port target, 550 lines, read-only patterns)
  - `tobeler/rebate-dashboard` — `hubspot.js:81` (`withRetry` for 429), `server.js:2120–2150` (Zuper `PUT /api/jobs/schedule`, `POST /api/jobs/assign`). Patterns will land in the future writeback PR, not this one.
- **autoschedule2 files:**
  - `src/integrations/hubspot/{client,sync,field-map-defaults,urls,schema-snapshot}.ts` — pattern mirror
  - `src/api/routes/hubspot.ts` — route shape mirror
  - `src/db/schema.ts` — column additions land here
  - `src/db/migrations/0001_outbox_triggers.sql` — already publishes required events
  - `src/store.ts:653` — moveJob demo bug
  - `src/data/seed.ts:131,194` — seed crews/regions
- **Skills used:**
  - `zuper-field-guide` — domain knowledge (statuses, categories, team naming, region inference order)
  - `hubspot-field-guide` — Zuper↔HubSpot linkage table
- **Verified live (this session):**
  - HubSpot portal 21424670 — all 19 deal fields + 16 contact fields confirmed, 2,193 closed-won deals
  - Supabase project `xqzvokokuflsbiensxbe` (AutoSchedule, us-west-2) — schema applied, admin user inserted
