# Architecture Review — Jetson Schedule + Dispatch

Date: 2026-05-26
Reviewer: architecture-strategist
Scope: high-level structural review. Line-level bugs are out of scope.

---

## 1. System Map

Today the app is a thin write-orchestrator sitting between HubSpot (the deal/customer/project source of truth) and Zuper (currently still the live FSM, soon to be a passive write target). Postgres is the canonical store; Zustand mirrors a subset for the UI with optimistic write-through.

```
                +---------------------+                +-------------------+
HubSpot (CRM) ──│  HS webhook + cron  │──> sync.ts ──> │   Postgres        │
contacts/deals  +---------------------+                │   (Supabase)      │
projects/SAs                                           │                   │
                                                       │  customers        │
                                                       │  projects         │
                                                       │  regions          │
                                                       │  jobs             │
                                                       │  crews / people   │ <── one-shot
                                                       │  trucks / timeoff │     bootstrap
                                                       │  outbox (SNS-shim)│     from Zuper
                                                       │  audit_log        │     (read-only)
                                                       │  settings_kv      │
                                                       │  hubspot_mappings │
                                                       +─────────┬─────────+
                                                                 │
            Postgres triggers + API publishers ─> outbox table ──┤
                                                                 │
                                +────────────────────────────────┼─────────────────+
                                │                                │                 │
              Supabase DB-webhook                       Cron drainer (safety-net)  │
                                │                                │                 │
                                v                                v                 │
                       /api/internal/outbox-drain ──> drainOutboxRow ──> HubSpot   │
                                                                       (push back) │
                                                                                   │
                                                       (planned, flag OFF):        │
                                                       writeback.ts ──> Zuper PUTs ┘

                          UI (Next.js 15 App Router, Zustand store)
                                          │
        Hono /api/v1/* (Zod-OpenAPI)  <── client (openapi-fetch)
                NextAuth v5 session / API key bearer
                Audit middleware writes to audit_log on every mutation
```

Two integration topologies coexist:

- **HubSpot**: Pull is the primary path (cron + webhook → `syncFromHubspot`). Push back is outbox-driven (Postgres triggers fan `jobs`/`projects` updates into `outbox`, drained by a Supabase DB-webhook or the cron safety net).
- **Zuper**: Read is **one-shot** only (`/api/v1/zuper/bootstrap`). Write is the future state and goes through `integrations/zuper/writeback.ts` behind `integrations.zuper.writeback_enabled`. AGENTS.md §0.4 is explicit: Zuper becomes a write target, not a read source.

---

## 2. Strengths — What to Preserve

1. **Outbox as the system seam.** Triggers on `jobs`, `job_slots`, `crews`, `time_off` write to `outbox` automatically, and the API layer also `publish()`es per route. This is exactly the right shape for the eventual SNS bridge and the Zuper writeback path. AGENTS.md's "don't simplify it away" instruction is correct.
2. **Single API source of truth.** Hono + Zod-OpenAPI generates the OpenAPI doc, the client types (`openapi-fetch`), and the schemas in one pass. Adding a new route is a contract-first change, which is rare for a project this young.
3. **Clean optimistic-write pattern in Zustand.** Every mutator is a snapshot → optimistic set → `client.x.method()` → rollback-toast on catch. The pattern is uniformly applied across ~25 mutations; it should be the template for everything new.
4. **Explicit demo-mode bypass.** Auth + DB short-circuit when `NEXTAUTH_SECRET` is unset, with a built-in admin actor. Lets the laptop demo work without a Postgres at all. Don't lose this — it's a force-multiplier for sales demos.
5. **Audit middleware that captures before/after on every mutation.** `audit_log` is wired at the framework level, not per-route. This is the regulated-industry expectation done correctly.
6. **External system reference columns, not joins.** `jobs.zuperJobUid`, `jobs.zuperTeamName`, `projects.hubspotProjectId`, etc. are flat reference text columns. No FK fragility against systems you don't own.
7. **The §0.3 / §0.4 / §0.5 architectural decisions are sound** and well-documented. AutoSchedule-owned crews + Zuper-as-write-target is the right invariant; don't let it drift.
8. **Project source tri-state** (`legacy_installation` | `native_project` | `deal_fallback`) is the right way to track the V1→V2 migration without forking the schema.

---

## 3. Architecture Risks — Ranked

### R1. The outbox is single-consumer and lacks ordering, idempotency keys, and a dead-letter destination — CRITICAL when Zuper writeback ships

**What.** `outbox` is `(id, topic, payloadJson, createdAt, deliveredAt, attempts)`. `drainOutboxRow` is dispatcher-by-topic with a hardcoded `attempts < 10` cap and a no-op for unknown topics. There is no:

- Idempotency key per row (Zuper-side dedup is impossible).
- Per-`(entityType, entityId)` ordering guarantee. The drainer pulls 200 rows ordered by nothing in particular and processes them serially.
- Dead-letter table or alert path on `attempts >= 10`. Rows just stop being picked up.
- Backoff (no `nextAttemptAt` column). A failing row burns its 10 attempts in one drain pass.
- Distinct topics per side-effect. `jobs.updated` covers both HubSpot push and (eventually) Zuper push, so one consumer's failure starves the other.

**Why it matters.** The very next thing the team builds (Unit 7 / writeback) sends real PATCHes to Zuper. If two `jobs.updated` rows for the same `jobId` get reordered, you can write `crewId=A` to Zuper, then `crewId=B`, then process the older row last and end up with B in the local DB and A in Zuper. The current shape will create silent state drift between AutoSchedule and Zuper within weeks.

**Blast radius.** Dispatch correctness, HubSpot-side deal data, dispatcher trust. Drift is the #1 failure mode that kills FSM projects of this shape — when dispatchers stop trusting the board they revert to whiteboards and Zuper, and the project loses its reason to exist.

**Direction.** Promote outbox to a proper transactional outbox:

- Add `entityType`, `entityId`, `idempotencyKey`, `targetSystem`, `nextAttemptAt`, `lastError`.
- Replace topic-routing with `(targetSystem, action)` so HubSpot-push and Zuper-push are independent consumers with independent retry state.
- Worker leases per `(entityType, entityId)` to guarantee in-order delivery per entity.
- Exponential backoff with jitter, dead-letter at N attempts to an `outbox_dead` table + a Sentry alert.
- Trigger payloads currently snapshot the entire row via `to_jsonb(NEW)` — keep that (delta-replay is easier) but version the schema so downstream consumers don't break on column additions.

### R2. `apiMode` boolean is a fragile dual-runtime switch

**What.** `store.ts` has 25+ `if (get().apiMode) { client.x.method().catch(rollback) }` branches. Hydration decides `apiMode` by attempting the first list call and falling back to localStorage on any 401/network error. There is no:

- Distinction between "API unreachable" and "API said no" (a 401 mid-session silently switches the user back to localStorage with stale data).
- Re-hydration after recovery.
- Conflict resolution when two tabs both wrote optimistically.

**Why it matters.** The pattern looks like offline-first but isn't — it's "demo-or-real", chosen once at boot. Once HubSpot/Zuper writeback ships, a transient 401 will leave the dispatcher writing to localStorage while believing they're scheduling jobs at the company. This is the bug class that turns into "we shipped 3 jobs to the wrong tech because the dispatcher's laptop was on demo mode and nobody knew."

**Blast radius.** Data integrity, dispatcher trust, and "phantom job" tickets that take days to root-cause.

**Direction.**

- Surface `apiMode === false` as a hard visual banner ("Demo mode — changes are local") that requires explicit dismissal.
- Replace the boolean with a state machine: `connected | reconnecting | demo | error`. Don't let `connected → demo` happen silently.
- Use the existing outbox pattern client-side too — queue mutations locally and replay on reconnect, rather than swallowing them.
- Long term, move to a TanStack Query / SWR layer where the store is a cache, not a source of truth. Zustand stays for ephemeral UI state (selection, modals, toolbar). This also fixes R5 (multi-tab) and R4 (no realtime).

### R3. Domain model is incomplete for HVAC dispatch at scale

**What.** Today: `customers / projects / jobs / crews / people / regions / trucks / timeOff / outbox / audit_log / settings_kv`. Missing tables that an HVAC dispatcher will need within the first six months of real use:

- **`equipment_assets`** — installed equipment at a customer location (model #, serial, install date, warranty end). HVAC work is largely "service this unit you sold them 4 years ago"; without an asset record you can't auto-link callbacks, you can't sell maintenance plans, you can't push warranty events to HubSpot.
- **`membership_contracts`** / `service_plans` — Jetson sells maintenance plans. Without these you can't schedule recurring spring/fall tune-ups, can't surface "needs annual visit" attention items, can't sort jobs by plan tier.
- **`parts` / `inventory` / `truck_inventory`** — first-time fix rate is the most cited HVAC KPI. Without inventory awareness the dispatch board can't say "this truck doesn't have the blower motor; reassign or order".
- **`time_entries` / `labor_records`** — distinct from `time_off`. Punch in/out per tech per job is the basis for payroll, job costing, and the "are we actually making money on heat pumps" reports.
- **`dispatch_events`** — append-only "what happened on this job" log distinct from `audit_log` (which is API CRUD). When a dispatcher moves a job 4 times, you want the customer-facing reason history, not just "PATCH /jobs/J-100 ×4".
- **`customer_comms`** — SMS/email/call records. Jetson will want to text customers en-route ETAs; without a comms table that thread is gone.
- **`job_visit`** / **`job_segments`** — a "job" today is a single block. Real install jobs have a survey visit + install day(s) + a commissioning visit. The current `multidayGroupId` + `continuationOf` is a stopgap.
- **`addresses`** as a first-class entity. Right now `customer.address` and `job.address` are denormalized text. Service-history-by-address (most useful query in HVAC) is impossible.
- **`teams`** / **`shifts`** — distinct from `crews`. Crews are a daily composition; shifts are an HR construct. Conflating them blocks future hours/overtime rules.
- **`hubspot_jobs_mapping`** — `jobs.hubspotJobObjectId` is a single column. The 1:N mapping between AutoSchedule jobs and HubSpot Job custom objects (one per visit) needs a join.

**Why it matters.** Today's schema lets you dispatch jobs. It doesn't let you answer the questions an HVAC owner actually asks: "what's the first-time-fix rate on heat pumps in CO-DE last quarter, by tech?", "which 50 customers haven't had their tune-up?", "how much warranty work are we eating?". Without the entities, you can't compute those without round-tripping back to HubSpot/Zuper — which defeats the whole project.

**Blast radius.** Defines the product ceiling. Without these, this stays a glorified Gantt UI on top of HubSpot/Zuper, not the system of record Jetson keeps saying it wants.

**Direction.** Sequence the additions: `equipment_assets` + `addresses` first (they unblock service history), then `time_entries` (unblocks payroll/costing), then `parts/inventory`, then `membership_contracts`. Each is additive — no risk to the current schema.

### R4. Live realtime is missing; the UI is a single-user app

**What.** `outbox` exists but there's no Realtime channel (`useStoreRealtime.ts` is a hook stub). Two dispatchers viewing the same board don't see each other's changes; HubSpot webhook updates don't appear in the UI until refresh.

**Why it matters.** "Dispatch" implies multiple dispatchers and field comms. Today's UI breaks the basic property: "what I see on the board is the truth right now." Add a second dispatcher and you'll have two people scheduling the same tech.

**Blast radius.** Blocks the second dispatcher seat. Effectively caps the product at one user per region.

**Direction.** Supabase Realtime on the four core tables (`jobs`, `job_slots`, `crews`, `time_off`). Push deltas through `useStoreRealtime` into existing `applyJob` / `applyCrew` reducers. The store already has the apply-side hooks; only the subscription is missing.

### R5. Single-org assumption is baked everywhere — multi-tenancy is a rewrite

**What.** No `orgId` column on any table. No RLS policies. Auth resolves to a user, never an org. Settings are global (`settings_kv`). Field-map defaults are global. Crew ids are user-defined strings without scoping.

**Why it matters.** If Jetson ever wants to sell this to another HVAC operator, or even spin up a "Jetson East" entity for tax reasons, every table needs `orgId` plus RLS, and every API route needs a scoped query. That is a 3-month refactor, and the longer it waits the more downstream code assumes single-org.

**Blast radius.** Strategic. Not urgent if Jetson stays internal, critical if there's any chance of productization.

**Direction.** Add `orgId text not null default 'jetson'` to every business table NOW while the schema is still small. Stamp it on every insert. Don't enforce RLS yet; add it when the second org appears. The boring migration today saves a re-architecture later.

### R6. AI / "agent tools" surface is hard-coded, not pluggable

**What.** "Impact queue", "Rank impact", "Schedule top job", "Find coverage", "Optimize routes" exist as buttons in `DispatchBrief.tsx` calling site-specific functions (`rankAttentionItemsByImpact`, `openSmartSchedule`, etc.). The "AI" logic lives in `src/views/attention/rankAttentionImpact.ts` as a heuristic scorer (revenue × urgency × drag). There's no tool-calling boundary, no model abstraction, no schema for "agent tools".

**Why it matters.** The interesting product moat for an HVAC dispatcher is the AI layer — the agent that says "this callback is a $30k retention risk; reassign". The current implementation is heuristic-only and tightly bound to the view layer. When an LLM-backed agent gets added, it'll either grow as a parallel hard-coded module or it'll have to swallow + rewrite the existing scorer.

**Blast radius.** Caps the AI product surface. Limits the team's ability to A/B test scorers, mix heuristic + LLM signals, or expose tools to a multi-step agent loop.

**Direction.** Define an `AgentTool` interface in `src/lib/agent/` — `{ name, description, inputSchema (zod), execute(input, ctx) }` — and re-express the existing 5 actions as tools. Then `rankImpact`, `scheduleTopJob`, `findCoverage`, `optimizeRoutes` become callable from (a) the existing UI buttons and (b) a future `/api/v1/agent/invoke` endpoint that an LLM hits. The view becomes a tool consumer, not the owner. This also lets you expose them to MCP / Claude / OpenAI tool-calling later without a rewrite.

### R7. No rate limiting, no API quotas, no idempotency on mutating endpoints

**What.** Hono middleware stack is `errorHandler → authMiddleware → auditLogMiddleware → requestLogger`. There's no rate limit, no per-API-key budget, no `Idempotency-Key` header support, no body-size cap. The route handlers don't check `If-Match` / `If-Unmodified-Since`.

**Why it matters.** Two failure modes:

1. A misbehaving cron or webhook (or the future Zuper webhook receiver) can drive enough mutating traffic to thrash Postgres and burn the Vercel function budget.
2. The optimistic UI retries on transient failure — without idempotency, that retries can double-apply mutations to Zuper/HubSpot.

**Blast radius.** Direct cost (Vercel + Supabase + HubSpot rate-limit ceilings) and correctness for external system writes.

**Direction.** Add Upstash Redis (it's a one-line dep) for rate limit + idempotency. Wire `Idempotency-Key` support on all POST/PATCH routes that publish to outbox. The HANDOFF notes already flagged this; promote it from "deferred" to "before writeback ships".

### R8. View layer has growing god-components and duplicated table/list code

**What.** Component sizes (lines):
- `JobDetailDrawer.tsx` — 1933
- `TechniciansView.tsx` — 939
- `ProjectsView.tsx` — 739
- `JobsView.tsx` — 632
- `MonthCalendar.tsx` — 625
- `DayCalendar.tsx` — 613
- `IntegrationsPanel.tsx` — 665

The Dispatch board (`DispatchView.tsx`) routes `(range, layout)` via a switch to one of `DayCalendar`, `WeekCalendar`, `MonthCalendar`, `KanbanBoard`, `GanttChart`, `MapView`. Each child is independently implemented; there's no shared abstraction for "a list of jobs against a time axis grouped by crew."

**Why it matters.**

- Adding a new layout (e.g. "tech swimlane" or "by region") means another 500-line sibling.
- Bug fixes (e.g. drive-time pill behavior, drag handle, status pill) have to be repeated in 4–6 files. The git history already shows this pattern.
- `JobDetailDrawer` at 1933 LOC is testably one of the highest-defect files in the codebase by SLOC alone.

**Blast radius.** Velocity. Each new feature gets more expensive than the last.

**Direction.** Three concrete moves:

- Extract a `<JobLayout>` abstraction with `mode: 'day' | 'week' | 'month' | 'kanban' | 'gantt' | 'map'`, a unified `getLanes()`, `getCells()`, `renderJobBlock()` shape. Use it via composition.
- Split `JobDetailDrawer` into 6 tab components plus a slim shell. Each tab is the unit of test/review.
- Build a `<DataTable>` with sort/filter/quick-filter primitives and migrate `JobsView`, `ProjectsView`, `TechniciansView`, `FleetView` onto it. The "saved quick filter" code already in the store wants this.

### R9. No automated tests anywhere

**What.** No `*.test.ts`, no `*.spec.ts` in the tree. Playwright is in devDeps but there's no test runner config. Coverage is "Erik runs the dev server and clicks through it" + Playwright screenshot passes.

**Why it matters.** Every change is a potential regression in 16k lines of view code. The audit middleware, the outbox drainer, the state machine in `routes/jobs.ts` (`ALLOWED` transitions) are exactly the things you want pinned. The state machine in particular is silent if it accepts a transition it shouldn't — you'll never notice until a dispatcher does it.

**Blast radius.** Long-term velocity and confidence. Becomes a regression generator as the team grows.

**Direction.** Don't aim for 80% coverage day one. Land three thin test suites:

1. State-machine table tests for `ALLOWED` job transitions.
2. Contract tests for the OpenAPI doc (parse `/api/docs`, assert every route advertises 401/422/200 shapes).
3. Outbox + sync integration tests against a Supabase shadow branch. Run on PR.

### R10. Region / timezone handling is informal

**What.** `writeback.ts:localToUtcIso` infers UTC offset by team-name prefix (`CO-` → -6, `BC-` → -7, `MA-` → -4). Region selection is a 2-letter prefix in the URL. There's no proper `Region.timezone` column or DST handling.

**Why it matters.** DST flips silently break this. A 9am Mountain job on the second Sunday of March will be written to Zuper as 8am, then sync-back will look like it moved an hour. Multiplied by 1,147 jobs, the support load is real.

**Blast radius.** Sporadic timezone bugs that are hard to reproduce and easy to misdiagnose.

**Direction.** Add `regions.ianaTimezone` (e.g. "America/Denver"). Always convert via `Intl.DateTimeFormat` or `date-fns-tz` keyed on that. Kill the prefix→offset hardcode.

### R11. UI fetches everything; no pagination, no virtualization for the calendar

**What.** `client.jobs.list()` defaults to `limit: 200`, max 500. Store holds the full `jobs[]` in memory and rebuilds derived state on every change. Calendars (`DayCalendar`, `WeekCalendar`, `MonthCalendar`, `GanttChart`) render every relevant job; no virtualization.

**Why it matters.** Today: 1,147 jobs. The HANDOFF projects 50k–500k in 2 years. At 10k the initial hydration is fine but the dispatcher's drag operations will lag. At 50k, the API list is paginated-but-the-store-isn't, and you'll need a windowed query model anyway.

**Direction.** Scale path is described under §5 (Scale Risks); the short answer is "store keeps a window, not the world."

---

## 4. Domain-model gaps (consolidated)

These are missing now and increasingly painful as scale grows. Ordered by leverage:

| Entity | What it captures | Unlocks |
|---|---|---|
| `addresses` | Normalized service location, geocode, timezone | Service-history-by-address, route optimization, multi-property customers |
| `equipment_assets` | Installed unit (model, serial, install date, warranty, location) | Warranty workflows, callback auto-linking, asset-driven scheduling |
| `time_entries` | Per-tech per-job punch in/out, drive vs onsite | Payroll, job costing, profitability, OT compliance |
| `membership_contracts` | Maintenance plans, recurring visit cadence | Recurring schedule generation, "needs tune-up" attention items |
| `parts` / `inventory` / `truck_inventory` | Stock by truck and warehouse | First-time-fix rate, "wrong truck" warnings, reorder flags |
| `dispatch_events` | Append-only customer-facing job history | Customer comms, dispatcher decision history, regulated audit |
| `customer_comms` | SMS/email/call thread per customer | En-route texts, NPS post-job, marketing opt-in tracking |
| `job_segments` (or `visits`) | Multi-visit jobs as first-class | Survey → install → commissioning, distinct from `continuationOf` |
| `shifts` | HR shifts distinct from crews | Hours rules, OT, fair scheduling |
| `service_areas` (already partly there) | Promote `regions` → real timezone + dispatch hours | Correct DST handling, per-region SLAs |
| `orgs` | Multi-tenant boundary | Per-org settings, multi-entity Jetson, future productization |

---

## 5. Scale Risks — Where it breaks at 10x / 100x

Current: 1,147 active jobs, ~5,063 customers, ~2,804 projects, 9 regions.

**At 10x (≈10k active jobs):**
- Initial UI hydration becomes slow. The store loads everything; derived selectors (`unscheduledJobs`, `unscheduledNeedsReviewJobs`, `matchesRegion`) rebuild on every change. (R11)
- Audit log grows fast. With ~10/sec mutation peak and no partitioning, the `audit_log` table will hit hundreds of millions of rows. Queries on the existing index-less columns slow down. (No `idx_audit_entityType_entityId_createdAt` exists.)
- Outbox drain becomes the bottleneck. Single-threaded, no leases, 200-row batch — at 10k mutations/day it keeps up; at 100k/day it doesn't.
- `JobDetailDrawer` re-renders dominate. The drawer subscribes to many slices; with denser data it stutters on open/close.

**At 100x (≈100k active jobs):**
- The Zustand "everything in memory" assumption breaks. Need: server-driven pagination + virtualized lists + windowed calendars.
- HubSpot pull becomes a 30-minute job. Switching from full-pull to webhook-driven incremental delta is no longer optional.
- The Hono routes do `db.select().from(jobs)` for the dispatch list — no index on `(date, crewId, status)`, the only triple the dispatch board ever filters on. EXPLAIN ANALYZE will start lighting up.
- The "render all dots on the map" pattern doesn't survive past 5k visible jobs. Need clustering.
- The single-region picker UI is wrong: dispatchers will need region + sub-region + group filters and bookmarked board states.
- Multi-dispatcher conflicts become routine. Without realtime + optimistic locking, lost-write incidents are weekly.

**First things that will actually break in production:**

1. **No index on the dispatch hot path**. Add `(date)`, `(crewId, date)`, `(status)`, `(projectId)`, `(zuperJobUid)`. Drizzle schema currently declares zero indexes.
2. **Audit log unbounded growth**. Add monthly partitioning + a retention policy in `settings_kv`.
3. **Outbox unbounded growth**. Same. Plus a "delivered older than 30 days → archive" job.
4. **Single connection pool** (`postgres-js` with `prepare: false`). For Supabase pooler this is correct, but per-route `db.select()` calls don't share transactions; auditLog peek-before runs as a separate query. Won't break, just doubles round-trips.

---

## 6. Recommended 6-Month Structural Roadmap

Three moves are non-negotiable; three are high-leverage if capacity allows.

### Move 1 — Harden the outbox before Zuper writeback ships (4–6 weeks)

**Rationale.** R1 is the highest-blast-radius risk and the next planned PR (Unit 7) walks straight into it. Land idempotency keys, per-entity ordering, dead-letter, and exponential backoff before any production traffic hits Zuper PUTs.

**Effort.** 1 senior dev × 4 weeks. Schema additions are additive; existing topics keep working. Add a second consumer (`zuperWritebackHandler`) wired off `targetSystem='zuper'` so it stays separate from HubSpot push.

**Done when.** A failure in the HubSpot push doesn't stall Zuper writes; a duplicate-trigger doesn't double-write to Zuper; failed rows surface in an `outbox_dead` view and trigger a Sentry alert.

### Move 2 — Real-time + multi-dispatcher correctness (3–4 weeks)

**Rationale.** R4 + R2 + R5 are all symptoms of the same shape: "store-as-source-of-truth + single-user assumption." Move the store to a cache, wire Supabase Realtime on `jobs`/`job_slots`/`crews`/`time_off`, replace `apiMode` boolean with a state machine, surface "demo mode" loudly.

**Effort.** 1 senior frontend × 3 weeks. Hooks (`applyJob`, `applyCrew`) already exist; this is wiring + UX.

**Done when.** Two dispatcher tabs see each other's writes within 1s. A 401 mid-session shows a reconnect banner, not silent demo-mode. The Demo Mode badge is visible in the topbar when active.

### Move 3 — Schema additions for HVAC scale (6–8 weeks, can be sequenced)

**Rationale.** R3 + §4. Without `addresses`, `equipment_assets`, `time_entries` you can't ship the reports + AI features that make this a real product.

**Effort.** Sequence:

- Week 1–2: `addresses` (foreign-key from `customers`, `jobs`). Backfill from existing text columns.
- Week 3–4: `equipment_assets`. Pull from HubSpot Installations + Zuper job custom fields.
- Week 5–6: `time_entries`. Read-only pull from Zuper's timecard endpoints (existing pattern in `tobeler/jetson-kpi`).
- Week 7–8: `membership_contracts` skeleton. Synthesize from HubSpot deals tagged "Service Care".

Each is an independent PR.

**Done when.** A new "Customer 360" drawer can show "this customer, this address, this equipment, this service history" without round-tripping to HubSpot.

### Move 4 — Agent tools as a first-class abstraction (3 weeks, if capacity)

**Rationale.** R6. Define `AgentTool` interface, re-express the 5 existing actions as tools, expose `/api/v1/agent/invoke`. This pays off the moment any LLM-backed feature ships and is cheap insurance even if that's months away.

**Effort.** 1 dev × 3 weeks. Mostly refactoring + a small Hono route.

### Move 5 — Multi-tenant primitive: `orgId` on every business table (1–2 weeks, if before Move 3)

**Rationale.** R5. The cheapest thing to do is add `orgId text not null default 'jetson'` everywhere now, stamp it in every insert, and ignore it in queries until needed. Doing this after Move 3 is 3x more work because the new tables ship with the assumption too.

**Effort.** 1 dev × 1 week. Migration + API middleware that injects `orgId` from actor context.

### Move 6 — Componentization + testing floor (4 weeks, ongoing)

**Rationale.** R8 + R9. Extract `<JobLayout>`, split `JobDetailDrawer`, land a `<DataTable>`, add the three thin test suites. This is the velocity-protection move.

**Effort.** Distributed — 2 weeks focused refactor, then ongoing as features ship.

### Suggested sequencing

```
M1   M1   M1   M1
          M5
M2   M2   M2
                    M3a  M3a   M3b  M3b   M3c  M3c   M3d  M3d
                                                                M4   M4   M4
M6 (always-on, parallel)
```

Months 1–2: outbox hardening + the `orgId` cheap-insurance migration.
Month 2–3: realtime + dispatcher correctness.
Months 3–5: domain model expansion in 2-week increments.
Month 5–6: agent tools, by which point there's real signal to wire into them.
Throughout: extract god-components and land the three test suites incrementally.

---

## Appendix — Specific files to revisit

Absolute paths:

- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/api/db/outbox.ts` — promote to a real outbox library (see R1).
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/integrations/hubspot/sync.ts:1209` — `drainOutboxRow` is the single-consumer chokepoint.
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/db/migrations/0001_outbox_triggers.sql` — keep triggers, add `idempotencyKey` generation.
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/store.ts` — `apiMode` boolean → state machine (R2).
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/api/middleware/auth.ts:48` — `DEMO_BYPASS` should be a runtime banner trigger, not silent.
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/db/schema.ts` — add indexes on `jobs(date)`, `jobs(crewId, date)`, `jobs(status)`, `jobs(zuperJobUid)`, `audit_log(entityType, entityId, createdAt desc)`.
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/integrations/zuper/writeback.ts:112` — `localToUtcIso` hardcoded offsets, DST bug waiting to happen (R10).
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/modals/JobDetailDrawer.tsx` — 1933 LOC, split by tab.
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/views/dispatch/DispatchView.tsx:240` — `renderContent` switch is the pluggable-layout extraction point.
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/views/attention/rankAttentionImpact.ts` — extract as the first `AgentTool` (R6).
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/hooks/useStoreRealtime.ts` — Supabase Realtime hook is a stub; activate (R4).
- `/Users/erik/Sync/Projects/Personal/autoschedule2/src/api/app.ts:58` — middleware stack is the place to add rate-limit + idempotency (R7).
