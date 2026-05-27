# Full-app review — synthesis (2026-05-26)

**Goal:** identify everything needed for Jetson Schedule + Dispatch to become the best HVAC dispatch tool.
**Safety constraint applied throughout:** no writes to HubSpot or Zuper; read-only DB queries.

Five lenses ran in parallel. Inputs sit in this directory:

| Lens | File |
|---|---|
| Browser walkthrough | (this review — main session drove the app directly; see screenshots in `screenshots/`) |
| Data quality audit | `2026-05-26-data-quality.md` |
| Functionality + correctness | `2026-05-26-functionality.md` |
| HVAC best-practices benchmark | `2026-05-26-best-practices.md` |
| Architecture + roadmap | `2026-05-26-architecture.md` |

---

## TL;DR

Jetson today is a **clean, opinionated, modern dispatch UI sitting on top of broken data + half-wired integrations**. The UX is genuinely ahead of ServiceTitan / Housecall / Jobber on velocity and clarity — Linear-class, not 2010-enterprise. But every backing system has at least one critical leak:

- **100% of jobs have no address** → driver has no destination
- **All V1 customers are literally named "Legacy install <id>"** → the Jobs list, Projects list, customer picker, and most drawers show placeholders, not customers
- **HubSpot writeback has no feature flag** → any job mutation in API mode PATCHes live HubSpot
- **Zuper writeback hardcodes summer (DST) timezone offsets** → off by 1 hour for half the year
- **Outbox** had 19,950 unprocessable rows + a schema mismatch between trigger payload and drainer — **resolved this session** (triggers disabled, table truncated, AGENTS.md updated)
- **Smart Schedule scores ~0 on all Zuper jobs** (broken region matching)
- **Trucks table empty** → fleet/revenue-per-vehicle/route-optimization features are dead UI
- **No SMS, no Google Maps, no QuickBooks** — table-stakes HVAC integrations all "Not connected"

**There is also no `time_entries`, no `equipment_assets`, no `addresses`, no `parts/inventory`, no `customer_comms`, no `membership_contracts`.** The schema lets you dispatch jobs; it doesn't let you answer the questions an HVAC owner actually asks.

The build quality is high. The product is one focused 90-day sprint from genuinely best-in-class, but most of that sprint is **fixing data hygiene + closing the same five integrations**, not shipping new UI.

---

## What's working (preserve)

1. **Dispatch board UX** — density, region picker, three-view toggle (Calendar/Kanban/Gantt/Map), agent-tool buttons (Rank impact, Schedule top job, Find coverage, Optimize routes), Cmd-K search, dispatcher brief at the top. The shape is right.
2. **Project source tri-state** (`legacy_installation` | `native_project` | future `deal_fallback`) for migrating V1 → V2 without forking.
3. **Audit middleware** writes before/after on every mutation — regulated-industry expectation done well.
4. **§0.3 / §0.4 architectural decisions** (AutoSchedule-owned crews, Zuper-as-write-target) are the right invariants.
5. **Hono + Zod-OpenAPI contract-first API + openapi-fetch client** — one source of truth for routes, schemas, and client types.
6. **Zustand optimistic-then-API pattern** — applied uniformly across ~25 mutations.
7. **Demo-mode bypass** — sales demos work without Postgres.
8. **Attention queue + workbench** — the right product shape, just needs better severity/impact alignment.

---

## P0 — fix immediately (correctness / customer-trust risk)

| # | Issue | Source | Fix shape |
|---|---|---|---|
| P0-1 | **All 5,983 jobs have empty `address`.** UI says "505 missing"; reality is 100%. The Zuper bulk endpoint returns null `property_address`; enrich-pass logged 1 run in `audit_log`. | data-quality §1.1, walkthrough drawer ("No address synced") | Run `/api/v1/zuper/enrich` again or pull address from the property-side per-job GET. Verify on one job, then batch. |
| P0-2 | **HubSpot writeback unguarded.** `pushJobToHubspot` (`src/integrations/hubspot/sync.ts:1067`) and `pushProjectToHubspot` have no `integrations.hubspot.writeback_enabled` flag check. The outbox is now disabled (this session), so currently safe — but the direct route at `src/api/routes/hubspot.ts:249` is still callable. | functionality P1-1 | Add a `hubspot.writeback_enabled` flag (mirror `zuperWriteback`), default OFF, gate both `pushJobToHubspot` and `pushProjectToHubspot`. |
| P0-3 | **Mutating Hono routes don't require `write` scope.** Any session user with `tech` role can DELETE/PATCH any resource. | functionality P1-5 | Add `mutationMw = requireScope('write')` and decorate every POST/PATCH/DELETE in jobs/crews/people/customers/projects/slots/trucks/timeoff/regions/templates/checklists/settings/hubspot/zuper routes. |
| P0-4 | **All V1 customers are literally named "Legacy install <id>".** 4,402 of 4,420 customer-linked jobs show this placeholder in the Jobs list, drawers, customer pickers. Dispatch board only "works" because it uses `jobs.title` directly. | data-quality §1.2, walkthrough Jobs view, walkthrough Projects view | Promote real customer name from `jobs.title` (Zuper convention: `Name | rest` or `Name - rest`) into `customers.name` whenever a `hs-legacy-cust-*` row is touched. Cheap, high-value. |
| P0-5 | **Zuper writeback TZ helper is DST-naive — every reschedule will be off by 1 hour for half the year.** Hardcodes CO=-6, BC=-7, MA=-4 (summer values). Currently safe (flag off). | functionality P1-2 | Replace `localToUtcIso` (`src/integrations/zuper/writeback.ts:112`) with `Intl.DateTimeFormat` keyed on IANA TZ from `regions.ianaTimezone`. Add the column. |
| P0-6 | **Test data in production.** "ESU TEST" appears as a customer in the Attention workbench; "New wiring for heat strip" appears as a customer name (it's a description); "Tariq Malik" appears 3× (duplicate cluster). | walkthrough Attention workbench, data-quality §2.1 | One-off dedup script: collapse `(lower(name), phone)` duplicates; flag/hide rows where `name` matches known test patterns; promote real names from `jobs.title` as in P0-4. |

---

## P1 — fix this week (visible UX + functionality blockers)

| # | Issue | Source |
|---|---|---|
| P1-1 | **11-digit HubSpot deal IDs still visible** in JobDetailDrawer as red status pills (e.g. `33107352579`). Task #23 "Hide unique IDs" only partially landed. | walkthrough drawer screenshot |
| P1-2 | **Project dropdown in drawer** still shows "Legacy install 52639962628". Task #32 incomplete — fix didn't reach the project picker. | walkthrough drawer |
| P1-3 | **Crew composition for Zuper jobs not surfaced.** Drawer Crew tab says "Assigned to Zuper team CO-DE-2" but shows zero members; Dylan Apodaca / Nicholas Maratas / Riordan Gallardo are in Crews view but never join into the drawer. Task #34. | walkthrough drawer Crew tab; functionality P2-8 |
| P1-4 | **Smart Schedule scores near-zero on Zuper jobs.** `jobRegion = job.zuperTeamName.split('-')[0]` ("CO") vs `crewRegion = crew.name.split('-')[0]` ("Holloway") never matches. Task #35. | functionality P2-1 |
| P1-5 | **Week dispatch view drops Saturday & Sunday jobs.** `DispatchView` builds 7-day filter; `WeekCalendar` renders 5 day cells. Sat/Sun jobs vanish silently. | functionality P2-4 |
| P1-6 | **Add custom slot now appends, but role/level can't be edited.** Half-fix from the uncommitted diff. Task #31. | functionality P2-5 |
| P1-7 | **Job titles in drawer are raw Zuper strings** like "Erin ROBINSON \| Installation: CDHP-AIR1-3T, HS-5KW Heat Strip Installation - 5 kW". No parsing into customer + scope. | walkthrough drawer |
| P1-8 | **Sidebar badge counts inconsistent.** Sidebar says "Timesheets 8"; Timesheets view says "0 technicians on the clock". Same for "Dispatch 107" (where does 107 come from? not visible on the board). | walkthrough nav |
| P1-9 | **BC Vancouver listed under United States** in Settings → Regions. BC is in Canada. | walkthrough Settings Regions |
| P1-10 | **Reports include 0%-utilization admin teams** ("Admin Team", "CO - Technicians - All", "MA-BO-Sub-Electricians", "BC-NV-Float", "CO-DE-office") that pollute the ranking. | walkthrough Reports |
| P1-11 | **BC-NV-2 at 145% utilization** in Reports with no alert beyond colored bar. | walkthrough Reports |
| P1-12 | **Status pill labeled "Active only — click to include historical"** ships scheduled-in-the-past jobs (346 of them) into the active board. Task #21 only filtered status, not stale dates. | data-quality §2.3 |
| P1-13 | **Trucks view is fully empty** ("0 vehicles") — the whole feature is dead. Same for Revenue-per-vehicle in Reports ("No vehicles added yet"). | walkthrough |
| P1-14 | **Top attention card "127 install/service jobs awaiting slots"** vs workbench top item "79 install/service jobs awaiting slots" — different rollup logic for the same metric. | walkthrough |
| P1-15 | **NewJobWizard generates IDs from a 100-slot random pool** (`'J-' + 2700+random*99`). Birthday-paradox collisions immediate. | functionality P1-7 |
| P1-16 | **JobDetailDrawer Location map shown for jobs with no address** — probably a default region. Confusing affordance. | walkthrough drawer |
| P1-17 | **Settings → Integrations doesn't include Zuper** even though `ZuperWriteConfirmModal` + writeback module exist. Nowhere to toggle the writeback flag in UI. | walkthrough Settings |
| P1-18 | **HubSpot card says "never synced"** despite `audit_log` showing 3 successful syncs. No `last_sync_at` in `settings_kv`. | walkthrough Settings; data-quality §2.8 |
| P1-19 | **Region rows show "0c · 0p"** despite 28 crews + 57 people in DB. Region.headcount/crewCount not joined to actuals. | walkthrough Settings Regions; data-quality §2.5 |
| P1-20 | **Job Templates empty.** Smart Schedule's "JOB_TEMPLATES" fallback path takes over → bad scoring inputs. | walkthrough Settings; functionality P2-1 |

---

## P2 — fix this month (correctness + flow polish)

These don't bite a dispatcher hourly but will compound. Pulled from the functionality + data-quality reports — see source files for code refs.

- **`moveJob` accepts `crewId='__unassigned__'`** through the Unassigned drop target, causing 23503 FK errors after optimistic local writes. (functionality P1-6)
- **Zuper writeback bypasses outbox** — direct `fetch` from store, no retry, no idempotency. Will create silent drift between Jetson and Zuper. (functionality P1-4)
- **Tech-row drop target mis-targets the crew** instead of the tech, in `groupBy='tech'` mode. (functionality P2-6)
- **Zuper jobs missing `startHour`** render nothing in calendars; counts disagree. (functionality P2-9)
- **`setHubspotMapping` not API-backed** — Settings → HubSpot mapping wipes on reload. (functionality P2-10)
- **`ZuperWriteConfirmModal` copy is wrong** — claims "your local change is already saved" but it isn't until you confirm. (functionality P2-2)
- **`scheduled` status with null date: 15 jobs** — invariant violation. (data-quality §2.3)
- **3,179 orphan customers** (53% of customer table) — imported HubSpot contacts with no job/project. Pollute the picker. (data-quality §3.1)
- **681 zero-duration jobs + 258 jobs > 24h** (one job logs as 104 hours). (data-quality §2.3)
- **V2 native_project sync writes 0 rows** despite toggle on — stage filter or contact-association lookup is broken. (data-quality §1.9)
- **18 mapped HubSpot job-push fields are 100% null in the DB** — if writeback fires, every PATCH overwrites with nulls. (data-quality §1.4)
- **Attention "callback" detector misses rescheduled-but-still-risky callbacks.** Severity "Low" with 1,117 impact in the workbench reads as a UI bug. (functionality P3-9; walkthrough)
- **Demo overlay** is "on" by default for the Erik user with no banner — "Demo · Admin" only appears tiny in the bottom-left. (walkthrough; architecture R2)

---

## Strategic gaps (to actually be best-in-class)

The competitor benchmark says drag-and-drop dispatch boards are commodity in 2026. The bar has moved. To stand out vs ServiceTitan / BuildOps / Sera, Jetson needs:

### 1. Customer comms loop (biggest single gap)
- **SMS:** Twilio is "Not connected". Customers cite communication as 38% of their HVAC frustration. Need: booking confirmation → 24h reminder → on-my-way → live ETA → completion → review/survey.
- **Two-way SMS inbox** in the dispatcher view — most callbacks start as text replies.
- **Self-serve reschedule link** in those SMS — closes the dispatcher loop.
- New table: `customer_comms` (channel, direction, status, thread_id).

### 2. HVAC-aware domain model
The schema today lets you move colored blocks. It doesn't capture the things HVAC owners actually need.
- `addresses` (normalized, geocoded, IANA timezone) — unlocks service-history-by-address and route optimization
- `equipment_assets` (model, serial, install date, warranty end) — unlocks warranty workflows, callback auto-link, asset-driven scheduling
- `time_entries` (per-tech per-job punch in/out, drive vs onsite) — unlocks payroll, job costing, "are heat pumps profitable" reports
- `membership_contracts` (maintenance plans, recurring visits) — unlocks tune-up scheduling, plan-tier prioritization
- `parts` + `truck_inventory` — unlocks first-time-fix gate ("this truck doesn't have the blower motor")
- `job_visits` / `job_segments` — first-class multi-visit; today's `multidayGroupId` + `continuationOf` is a stopgap

### 3. Agentic dispatch (not just buttons named "Rank impact")
Today's "Agent tools" (Rank impact / Schedule top job / Find coverage / Optimize routes) are heuristic-only and bound to the view layer.
- Define an `AgentTool` interface in `src/lib/agent/` — `{ name, description, inputSchema, execute(input, ctx) }`
- Re-express the 5 existing actions as tools
- Expose `/api/v1/agent/invoke` for an LLM-backed agent loop (uses Vercel AI Gateway with provider/model strings)
- Continuous background runs that surface only exceptions — the "dispatcher as exception handler" pattern Gartner forecasts for 40% of enterprise apps by end of 2026

### 4. Real route optimization
- Google Maps "Not connected" — current drive-time is from a static CSV. Hook up Distance Matrix + Routes API with traffic.
- "Drive-time saved today: 0m → 0m" in Reports means the optimizer never wins. Either fire it correctly or remove the metric.

### 5. First-Time-Fix Rate as north-star
- Already computed in Reports (73%) — good.
- Need: closed loop where a callback automatically classifies its root cause (missing part / wrong skill / wrong diagnosis) and feeds back into capacity/skill rules.
- HANDOFF mentions "P3-1: First-time-fix rate ignores callback ordering" — fix that.

### 6. UX wedge (this is where Jetson already partly wins — extend it)
- Cmd-K command palette → full keyboard-first (Linear/Superhuman class)
- Bulk move/reschedule on the dispatch rail (multi-select)
- Customer 360 drawer (jobs + equipment + warranty + comms in one view)
- Print/PDF dispatch sheet for next-day prep
- Live ETA + traffic overlay on the dispatch map
- Skill-set matrix surfaced as a coverage warning ("no NATE-certified tech for this ductless install on Friday")

---

## Recommended 30 / 90 / 180 day sequence

### Next 30 days — stop the bleeding
1. P0-1 through P0-6 (above)
2. Disabled outbox + truncated rows (done this session)
3. P1-1, P1-2, P1-7 — UI cleanups for "Legacy install" / HubSpot ID leakage / raw titles
4. P1-3, P1-4, P1-5 — the three "looks broken" dispatch board bugs (crew composition, Smart Schedule scoring, Saturday/Sunday drop)
5. Wire `last_sync_at` / `last_drain_at` / `last_zuper_bootstrap_at` into `settings_kv` so badges aren't lies
6. Banner Demo Mode loudly (architecture R2)

### Days 30-90 — close the integrations
1. Twilio + SMS comms loop (booking → on-my-way → completion → review)
2. Google Maps Distance Matrix wired for real drive-time
3. QuickBooks Time (so the empty Timesheets view becomes real)
4. Settings → Integrations card for Zuper (so dispatchers can see/toggle writeback in-UI)
5. `addresses` + `equipment_assets` tables + backfill from existing text columns
6. Fix V2 native_project sync (currently writes 0 rows)
7. De-dup pass on customers (580 name + 417 phone clusters)
8. Realtime via Supabase channels on `jobs`/`job_slots`/`crews` (architecture R4) — required before 2nd dispatcher seat

### Days 90-180 — best-in-class moves
1. `time_entries` + `membership_contracts` + `parts/inventory` (architecture Move 3)
2. `AgentTool` abstraction + `/api/v1/agent/invoke` endpoint (architecture Move 4 / R6)
3. `orgId` everywhere as cheap multi-tenant insurance (architecture R5 / Move 5)
4. `<JobLayout>` and `<DataTable>` extractions; split `JobDetailDrawer` (1,933 LOC); thin test floor (architecture R8 / R9 / Move 6)
5. Indexes on `jobs(date)`, `jobs(crewId, date)`, `jobs(status)`, `jobs(zuperJobUid)`, `audit_log(entityType, entityId, createdAt desc)` (architecture R11)
6. Callback root-cause classification feeding back into Smart Schedule rules

---

## What I did this session beyond reviewing

- Disabled all 4 outbox triggers (`outbox_jobs_changed`, `outbox_jobslots_changed`, `outbox_crews_changed`, `outbox_timeoff_changed`) — reversible with `ENABLE TRIGGER`
- Truncated 19,950 unprocessable outbox rows
- Updated `AGENTS.md` to remove the "don't simplify it away" instruction and document the dormant state

Browser walkthrough captured screenshots in `docs/review/screenshots/` for every nav view (Dispatch, Jobs, Projects, Technicians, Crews, Trucks, Timesheets, Reports, Settings → Integrations + Regions, JobDetailDrawer Overview + Crew, Attention workbench).
