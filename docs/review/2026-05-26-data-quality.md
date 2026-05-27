# Data Quality Audit — Schedule + Dispatch

**Date:** 2026-05-26
**Auditor:** Claude (read-only audit run)
**Scope:** Postgres at Supabase `xqzvokokuflsbiensxbe`, accessed via `DATABASE_URL`
**Mode:** READ-ONLY. No mutations made. All queries `SELECT` only.

> **Heads-up:** row counts have grown since `HANDOFF.md §0` was last updated. Old counts: 1,147 jobs, 5,063 customers, 0 crews, 13,965 outbox. **Current counts (this audit):** 5,983 jobs, 5,999 customers, 28 crews, 19,950 outbox. Likely a re-bootstrap landed between the handoff snapshot and now. The handoff's claim that "outbox backlog task #13 is done" is **not true on the current DB** — see §6.

---

## 1. Headline data risks a dispatcher would feel

These are the 10 issues most likely to hurt a real dispatcher in production. Ordered by severity.

| # | Risk | Severity | Why dispatchers care |
|---|---|---|---|
| 1 | **100% of jobs have empty `address`** (5,983 / 5,983) | CRITICAL | Driver has no idea where to go. Title sometimes contains an address fragment but `jobs.address = ''` everywhere. The Zuper bootstrap reads `property.property_address` which the bulk endpoint returns null for; the enrich pass that fixes this was never run. |
| 2 | **Every `customers.name` from V1 path is literally `Legacy install 55975789495`** (2,804 rows) | CRITICAL | When a job is linked, the dispatcher sees "Legacy install 49970843538" instead of "Michelle Burghardt". The real name lives in `jobs.title` and is the only reason the dispatch board is human-readable. If anyone groups/filters by customer, the UX collapses. |
| 3 | **555 jobs are stranded in non-terminal status with a past date** (346 `scheduled` in the past, 91 `onsite` >1 day old, 7 `enroute` in the past, callbacks/etc.) | HIGH | Dispatcher's "today" view is polluted by yesterday's ghosts. They cannot trust the board because half the "in-flight" rows aren't really in flight. |
| 4 | **97.8% of mapped HubSpot Job push fields are 100% null** (`hubspotJobObjectId`, `price`, `driveTimeMin`, `notes`, `multidayGroupId`, `assignedTechIds`, `zuperJobUrl`, `truckId`, `vehicleMode`, `personalDriverId`, `continuationOf`) | HIGH | Of 18 mapped HubSpot Job push fields, virtually none have data to push. Writeback ships, will push nulls. |
| 5 | **Outbox is fully stuck — 0 of 19,950 rows delivered, no retries**, and the drainer is broken | HIGH | The trigger writes the full row JSONB at the top level (`payload.id`), but `drainOutboxRow()` (`src/integrations/hubspot/sync.ts:1218,1223`) reads `payload.jobId` / `payload.projectId`. Even if the cron were firing, every row would throw "payload missing jobId". |
| 6 | **3,179 / 5,999 customer rows are orphaned** (53%) — no jobs, no projects (all are HubSpot contacts pulled but never linked to anything) | HIGH | Customer search returns noise: 2,243 HubSpot contacts have no job and no project. They are pure imported leads — but the customer picker can't tell. |
| 7 | **531 unscheduled jobs only 23.5% have customer linkage** — 406 of them are not linked to anything | HIGH | A dispatcher trying to schedule the unscheduled queue cannot see who/where for most of it. They can read the job title and that's the entire context. |
| 8 | **142 `complete` jobs have no date** and **475 unscheduled jobs have `durationHrs = 0`** | MEDIUM | Reporting and forecasting both break. Calendar/Gantt views with zero-duration tiles render as invisible slivers. |
| 9 | **V2 (native HubSpot Project) sync writes 0 rows** — 100% of 2,804 projects are V1 `legacy_installation` | MEDIUM | Per HANDOFF §0.4, the V2 path "runs but writes 0 rows" — confirmed. Sync code at `sync.ts:520-526` skips projects with no associated contact. Either the search filter (`['planning','review','execution','on_hold']`) excludes everything, or the contact-association lookup fails for all. |
| 10 | **All 9 `regions` are pulled but never used** — `zuperServiceAreaCode` empty on every row, `headcount`/`crewCount` always 0, no `region_id` on jobs | MEDIUM | Region filtering on the dispatch board is decorative. A multi-region operation can't see "show me only CO" because no job has a region FK. |

---

## 2. By table

### 2.1 `customers` (5,999 rows)

| Field | % populated | Notes |
|---|---|---|
| `name` | 100% | But 2,804 are placeholders `Legacy install <id>` |
| `address` | 52.8% | 2,832 empty (47.2%) |
| `phone` | 47.7% | 3,140 empty |
| `hubspotId` | 37.7% | 2,259 rows |
| `zuperCustomerId` | 15.6% | 936 rows |

**By source / origin:**
- `hs-c-*` (real HubSpot contact): **2,259**
- `hs-legacy-cust-*` (V1 placeholder): **2,804** — name is `Legacy install <hsId>`
- `zup-cust-*` (Zuper only): **936**

**Duplicate clusters:**
- **580 distinct names** appear on 2+ customer rows (e.g. "Michael Hughes" × 4 across HS contacts and Zuper customers).
- **417 phone numbers** are shared across 2+ rows (e.g. `+16049925187` → 3 "Shawn White" rows; `+13039748410` → both Arthur Ortega and Josie Ortega).
- **0 duplicates** on `hubspotId` or `zuperCustomerId` themselves (so de-dup keys are clean within each source — fragmentation happens **across** sources).
- Same `(name, address)` appears on 2+ rows for at least 5 spot-checked cases (Ian Booth, Richard Lin, Jake Komet, Justin Berdahl, Sally Madsen).

**Orphans:**
- **3,179 customers** have neither a job nor a project. Of these, 2,243 came from HubSpot contact sync (`hs-c-*`).

**Sample bad row:**
```
hs-legacy-cust-55975789495 | Legacy install 55975789495 | "" | ""
hs-legacy-cust-49970843538 | Legacy install 49970843538 | "" | ""
```

### 2.2 `projects` (2,804 rows)

**Source distribution:** 100% `legacy_installation`. V2 path writes nothing.
**Status distribution:** 100% `complete`. (Status enum has 6 values; only one is used.)

| Field | % populated | Notes |
|---|---|---|
| `name` | 100% | All are `Legacy install <hsId>` |
| `description` | 100% | All are the literal string `Imported from legacy Installations object.` |
| `type` | 100% | All `Retrofit` (the default) |
| `source` | 100% | All `legacy_installation` |
| `customerId` | 100% | All point to `hs-legacy-cust-*` stubs |
| `targetCompletion` | 21.8% | The 21.8% that have it carry the *same* identical timestamp `2025-05-06T21:27:35.488Z` — a placeholder, not real data |
| `soldDate` | 0% | |
| `value` | 0% | |
| `hubspotDealId` | 0.04% | 1 row only (out of 2,804) |
| `hubspotProjectId` | 0% | |
| `designNotes` | 0% | |
| `primaryCrewId` | 0% | |

**Orphans:** 877 / 2,804 projects (31%) have no job linked.

**Verdict:** the projects table is a thin name-shell. Every meaningful field is empty. It serves only as a join target between the placeholder customer and the Zuper jobs.

### 2.3 `jobs` (5,983 rows)

**Status distribution:**
| Status | Count |
|---|---|
| complete | 4,504 |
| unscheduled | 531 |
| scheduled | 518 |
| cancelled | 260 |
| onsite | 97 |
| callback | 64 |
| enroute | 9 |

**Field coverage (5,983 rows total):**

| Field | % non-null/non-empty |
|---|---|
| `id` | 100.0 |
| `type` | 100.0 |
| `status` | 100.0 |
| `title` | 100.0 |
| `zuperJobUid` | 100.0 |
| `zuperSyncedAt` | 100.0 |
| `hubspotDealId` | 99.8 |
| `date` | 88.8 |
| `startHour` | 88.8 |
| `endDate` | 88.8 |
| `endHour` | 88.8 |
| `durationHrs > 0` | 88.6 |
| `zuperTeamName` | 88.9 |
| `customerId` | 73.9 |
| `projectId` | 73.6 |
| `crewId` | 10.3 |
| `address` | **0.0** |
| `notes` | **0.0** |
| `truckId` | **0.0** |
| `price` | **0.0** |
| `multidayGroupId` | **0.0** |
| `continuationOf` | **0.0** |
| `vehicleMode` | **0.0** |
| `personalDriverId` | **0.0** |
| `assignedTechIds` | **0.0** |
| `zuperJobUrl` | **0.0** |
| `hubspotJobObjectId` | **0.0** |
| `driveTimeMin > 0` | **0.0** |

**Schedule-status sanity checks:**
| Issue | Count |
|---|---|
| `unscheduled` with a date set | 60 |
| `scheduled` with no date | 15 |
| `unscheduled` with a `crewId` | 44 |
| `callback` with no date | 1 |
| `onsite` with no date | 4 |
| `enroute` with no date | 2 |
| `complete` with no date | 142 |
| `scheduled` whose date is in the past | 346 |
| `onsite` for >1 day | 91 |
| `enroute` in the past | 7 |
| `endDate < date` | 0 (clean) |

**Duration sanity:**
- 0 hours: **681**
- < 15 min: 2
- > 24 h: **258** (a Deirdre Bell install logs as 104 hours)
- max: 104h, avg: 4.62h

**Titles:**
- 7 titles > 200 chars (multi-line "BOM"-style installation manifests packed into one field, e.g. 215 chars)
- shortest: `Bagni` (5 chars), `Costas`, `Repair`, `Pollard`, `Gifford` — single-word titles that tell a dispatcher nothing
- 37 titles contain `*tentative*` marker (kept literally from Zuper)

**Linkage by team region:**
| Region prefix | Total | % with customer |
|---|---|---|
| CO-* | 2,440 | 81.2% |
| BC-* | 1,510 | 60.9% |
| MA-* | 1,003 | 97.4% |
| (no team) | 664 | 37.3% |
| NY-* | 122 | 95.9% |

BC-* and the "no team" bucket are the dropoffs — likely related to the V1/V2 / installation linkage failure rate in those regions.

**`zuperTeamName` → crew lookup:** all 618 jobs with a `crewId` resolve to an existing `crews` row. **0 orphaned `crewId`** values. Good.

But **5,319 jobs carry a `zuperTeamName`** and **only 618 have a `crewId`**. Most jobs reference a team in text-only form. This is the §0.3 design (text trace, not FK) but the dispatch UI surfaces show "unassigned" for 88% of jobs that *are* meaningfully tagged with a Zuper team.

### 2.4 `crews` (28 rows)

The HANDOFF said this would be 0 (Erik's call: dispatcher creates crews, doesn't inherit Zuper). It's now 28, all named after Zuper teams. Looks like a `bootstrap-crews.ts` was run after the handoff was written. Check whether that's intended.

- `zuperTeamId` is empty on every crew row — only `zuperTeamName` is set.
- `crew_members` has 57 rows (matches the 57 people imported).
- No `truckId` set on any crew (trucks table is empty too).
- `type` is `install` for 14 crews, `ad_hoc` for 13, `electrical` for 1.

### 2.5 `regions` (9 rows)

All 9 regions from HubSpot service-areas pulled. **All fields beyond `id`/`name`/`short`/`parentRegionId` are unpopulated:**
- `zuperServiceAreaCode`: 0 / 9 set
- `headcount`: 0 / 9 nonzero
- `crewCount`: 0 / 9 nonzero

There is no FK from `jobs` to `regions` in the schema (`information_schema.columns` confirms — no `region_id` or `area_id` column on jobs). Regions appear in the UI as filters but no row in `jobs` actually references one.

### 2.6 `outbox` (19,950 rows)

| Topic | Total | Pending | Delivered | Max attempts |
|---|---|---|---|---|
| jobs.updated | 19,843 | 19,843 | 0 | 0 |
| crews.updated | 107 | 107 | 0 | 0 |

- Oldest pending: **2026-05-26 18:42:55**
- Newest pending: **2026-05-27 02:47:25** (after midnight UTC the day of audit)
- **Nothing has ever been delivered. `attempts` is `0` on every row** — the drainer has never even *attempted* a row.

Two failure modes:
1. **The drainer cron is not registered / not invoked.** No `last_drain_at` in `settings_kv`. `vercel.json` cron exists but the dev box doesn't run it.
2. **Even if invoked, the drainer is broken.** `drainOutboxRow()` reads `payload.jobId` / `payload.projectId`. The trigger function `outbox_jobs()` inserts `to_jsonb(NEW)` — so the payload uses the row's column names (`id`, not `jobId`). Manually verified:
   ```
   SELECT "payloadJson"->>'jobId' AS job_id, "payloadJson"->>'id' AS id FROM outbox WHERE topic='jobs.updated' LIMIT 3;
   →  job_id is NULL for every row; id is the zup-... PK.
   ```

A third oddity: the outbox payload has stale crew IDs. **6,192 outbox rows reference `zup-team-<uuid>` crewIds** that no longer exist in the `crews` table (current ids are `crew-<region>-<n>`). If the drainer ever does fire, those payloads will not match anything.

### 2.7 `hubspot_mappings` (66 rows)

Breakdown by entity:
- contact: 16 (9 pull, 7 both)
- deal: 20 (1 push, 13 pull, 6 both)
- job: 18 (all push)
- service_area: 12 (all pull)

**All 18 mapped `job` push fields are unpopulated on the source row.** When writeback turns on, every push will be either a no-op or a null overwrite, depending on how the push code handles undefined values.

Notable mapping gotcha already documented in §0.5: `project_link` → `associated_deal` is a CRM association, not a property. Verified in `field-map-defaults.ts`.

### 2.8 `settings_kv` (3 rows)

```
integrations.zuper.writeback_enabled       | false  | 2026-05-26 18:12 UTC
integrations.hubspot.sync_v1_installations | true   | 2026-05-26 18:12 UTC
integrations.hubspot.sync_v2_projects      | true   | 2026-05-26 20:32 UTC
```

- V2 flag is **on**, V2 path produces 0 rows → flag is decorative; needs root-cause fix.
- No `last_sync_at`, no `last_drain_at`, no `last_zuper_bootstrap_at`. **There is no audit timestamp for any integration run** other than `audit_log` action rows (29 entries total).

### 2.9 `audit_log` (29 rows)

| Action | Count |
|---|---|
| POST /api/v1/diag/log-error | 8 |
| POST /api/v1/zuper/bootstrap | 3 |
| POST /api/v1/hubspot/sync | 3 |
| POST /api/v1/hubspot/ping | 3 |
| PUT /api/v1/settings/integrations | 2 |
| PATCH /api/v1/jobs/zup-... | 2 |
| POST /api/v1/zuper/sync | 2 |
| POST /api/v1/zuper/ping | 2 |
| POST /api/v1/zuper/bootstrap-technicians | 2 |
| POST /api/v1/zuper/enrich | 1 |
| POST /api/v1/zuper/bootstrap-crews | 1 |

So: the Zuper bootstrap ran 3 times (handoff says it should be one-shot), enrich ran only **once** (almost certainly why 100% of addresses are empty), and `bootstrap-crews` ran exactly once — explains the 28 crews despite the handoff saying 0.

### 2.10 Empty tables worth noting

- `trucks`: 0 rows — `truckId` on crews/jobs cannot be populated
- `time_off`: 0 rows
- `checklists`, `checklist_responses`: 0 rows
- `job_slots`: 0 rows (Crew Model v2 with `assignedTechIds` was supposed to supersede but is also empty)
- `job_extra_crews`: 0 rows

---

## 3. Cross-table issues

### 3.1 Orphans

| Direction | Count | Notes |
|---|---|---|
| `jobs.projectId` → no `projects` | 0 | Clean (FK + cascade work) |
| `jobs.customerId` → no `customers` | 0 | Clean |
| `jobs.crewId` → no `crews` | 0 | Clean |
| `customers` with no jobs AND no projects | 3,179 | Mostly imported HubSpot contacts |
| `projects` with no jobs | 877 | 31% of projects |
| `customers.hubspotId` set but no projects | 2,259 | **Every** real-contact customer is project-less |

### 3.2 Linkage gaps

- 1,563 jobs (26%) have no `customerId`
- 1,581 jobs (26%) have no `projectId`
- All jobs with a customer link **except 18** point to a `hs-legacy-cust-*` stub, not to a real HubSpot contact. The 2,259 real HubSpot contacts are essentially decoupled from the operational data.

**Why?** In `src/integrations/zuper/bootstrap.ts:138-159`, `projectAndCustomerFor` resolves customer in this order:
1. project.customerId (always the stub, because all projects are V1)
2. contact-by-hubspotId fallback (rarely hits — only 18 jobs)

The real HubSpot contacts never get joined because the Zuper job's HubSpot link is to the legacy *installation*, not to the contact.

### 3.3 V1 / V2 split

- V1 (`legacy_installation`): 2,804 projects (100%)
- V2 (`native_project`): 0 projects (despite toggle on)

Open task #18 in the HANDOFF wants a V1/V2 chip on the dispatch view. With 0 V2 rows, the chip would be useless until the V2 sync bug is fixed.

### 3.4 Customer name source vs displayed name

| Source | rows | name shown |
|---|---|---|
| `hs-legacy-cust-*` | 2,804 | `Legacy install <hsId>` |
| `hs-c-*` | 2,259 | Real name from HubSpot contact |
| `zup-cust-*` | 936 | Real name from Zuper customer |

But **4,402 of 4,420 jobs with a customer link** point to `hs-legacy-cust-*` (the placeholder-named). So the operational data overwhelmingly shows "Legacy install …" in any customer-aware UI. The real name lives in `jobs.title`, which is why the dispatch board "works" today — but any drawer that shows "Customer: …" is showing the wrong string.

### 3.5 Region linkage gap

`regions` has 9 rows; `jobs` has no `region_id` column. The only region-like signal on a job is `zuperTeamName`. So filtering jobs by region is impossible without a parse-and-join on the team-name prefix (`CO-DE-1` → `CO Denver`). This logic is not in the data layer; it must live in the view (likely `src/views/...`).

---

## 4. Field-level coverage tables

### 4.1 `jobs` field non-null/non-empty percentage

| Column | Non-null % | Notes |
|---|---|---|
| id | 100.0 | |
| type | 100.0 | 23 distinct values |
| status | 100.0 | 7 of 7 enum values used |
| title | 100.0 | |
| zuperJobUid | 100.0 | unique |
| zuperSyncedAt | 100.0 | |
| hubspotDealId | 99.8 | |
| date | 88.8 | TEXT column — `'YYYY-MM-DD'` per schema |
| startHour | 88.8 | |
| endDate | 88.8 | |
| endHour | 88.8 | |
| durationHrs > 0 | 88.6 | 681 rows are zero |
| zuperTeamName | 88.9 | reference text |
| customerId | 73.9 | |
| projectId | 73.6 | |
| crewId | 10.3 | by design (§0.3) |
| address | **0.0** | needs enrich pass |
| notes | **0.0** | |
| truckId | **0.0** | |
| price | **0.0** | |
| multidayGroupId / multidayIndex / multidayTotal / continuationOf | **0.0** | unused |
| vehicleMode / personalDriverId | **0.0** | unused |
| assignedTechIds | **0.0** | empty arrays/null |
| zuperJobUrl | **0.0** | could populate from `zuperJobUid` + base URL |
| hubspotJobObjectId | **0.0** | nothing pushed to HubSpot yet |
| driveTimeMin | **0.0** | |

### 4.2 `projects` field non-null/non-empty percentage

| Column | Non-null % | Notes |
|---|---|---|
| id | 100.0 | all `hs-i-<id>` |
| customerId | 100.0 | all `hs-legacy-cust-*` |
| name | 100.0 | all `Legacy install <id>` |
| type | 100.0 | all `Retrofit` (default) |
| status | 100.0 | all `complete` |
| description | 100.0 | all `Imported from legacy Installations object.` |
| source | 100.0 | all `legacy_installation` |
| targetCompletion | 21.8 | every populated value is the same placeholder timestamp |
| soldDate | 0.0 | |
| value | 0.0 | |
| hubspotDealId | 0.04 | 1 row only |
| hubspotProjectId | 0.0 | |
| designNotes | 0.0 | |
| primaryCrewId | 0.0 | |

---

## 5. Recommended fixes (prioritized)

| # | Fix | Effort | Owner | Notes |
|---|---|---|---|---|
| 1 | **Run Zuper `/api/v1/zuper/enrich` to back-fill addresses** on the 5,983 jobs | S | `src/integrations/zuper/enrich.ts` | Enrich logged a single run in audit_log; either it failed silently or addresses come from the property-side endpoint and need a per-job GET. Verify with one test job, then batch. |
| 2 | **Repair the outbox drainer** so the trigger payload shape matches the consumer | S | `src/integrations/hubspot/sync.ts:1216-1225` | Either: (a) change drainer to read `payload.id` and topic to decide whether to push job vs project; or (b) change trigger to `INSERT … VALUES ('jobs.updated', jsonb_build_object('jobId', NEW.id))`. (a) is safer because it preserves the full payload for future debugging. |
| 3 | **Decide on the outbox backlog.** 19,950 rows of obsolete pre-bootstrap state will all fire if drainer turns on. | S | DB / Erik | Two safe options: (i) `UPDATE outbox SET "deliveredAt"=now() WHERE "createdAt" < <cutoff>` to mark old rows shipped (no-op since writeback is off); (ii) truncate the table since writeback hasn't started. Both are write operations — do not run until decided. |
| 4 | **Fix customer naming on V1 path** so dispatcher sees a real name | M | `src/integrations/hubspot/sync.ts:854-986` | Either (a) resolve the legacy installation's `related_project_id` → contact-id → real name; or (b) when ingesting a Zuper job, **promote** the real customer name from the job into `customers.name` for any `hs-legacy-cust-*` row. Option (b) is cheap and gives immediate dispatcher value. |
| 5 | **Fix V2 native_project sync** (currently writes 0 rows) | M | `src/integrations/hubspot/sync.ts:518-567` + `client.ts:265-278` | Two suspects: stage filter (`['planning','review','execution','on_hold']` may not match the portal's actual stage labels), and the "skip projects with no contact association" early-out at line 521-526. Add per-stage counts and a `result.notes` entry showing how many were skipped for which reason. |
| 6 | **Reconcile stale states.** Auto-close jobs in `scheduled`/`onsite`/`enroute` with `date < CURRENT_DATE - 7` to `complete` or `cancelled` based on Zuper truth. | S | `src/integrations/zuper/enrich.ts` or new pass | 555 stranded rows. Either auto-reconcile from Zuper status or surface them in a "needs review" bucket. |
| 7 | **Validate duration on write.** 681 jobs with `durationHrs = 0`, 258 with > 24h, 2 with < 15min. Add a sensible-range warn at write time. | S | `src/integrations/zuper/bootstrap.ts:84-90` (`durationHoursBetween`) and store layer | 104-hour jobs are almost certainly bad timestamps from Zuper (start/end across a multiday with no day boundary). |
| 8 | **De-duplicate customers across HubSpot/Zuper sources.** | L | New `src/integrations/dedup/` module | 580 names + 417 phones overlap across sources. A merge pass keyed on (lower(name), phone) or (hubspotId, zuperCustomerId) would collapse fragments. Risk: false merges; pair with a manual review queue. |
| 9 | **Populate `regions.zuperServiceAreaCode`** so the team-name → region join becomes a real FK | S | `src/integrations/hubspot/sync.ts:469-489` | Pull `service_area_code` from HubSpot service area and store it. Then derive `jobs.regionId` at ingest from the team-name prefix lookup. |
| 10 | **Drop or hide the unused `jobs` columns** (`multidayGroupId/Index/Total`, `continuationOf`, `vehicleMode`, `personalDriverId`, `assignedTechIds`) until they have a write path | S | schema migration | These leak into the API surface and confuse downstream consumers. At minimum, suppress them in the OpenAPI doc. |
| 11 | **Stamp `last_sync_at` / `last_drain_at` / `last_bootstrap_at` into `settings_kv`** at the end of each run | S | each integration route | Currently the only signal is `audit_log` action rows — readable but not joinable. |
| 12 | **Populate `zuperJobUrl` from `zuperJobUid`** at ingest | S | `src/integrations/zuper/bootstrap.ts` | URL pattern is known and stable; saves the dispatcher a manual lookup. |
| 13 | **Surface "real customer name" on the job drawer** without changing the data, by reading from `jobs.title` parsing | S | `src/modals/JobDetailDrawer.tsx` (already open in worktree) | Quick band-aid until fix #4 lands. The title prefix before `|` or `-` is the customer name in the Zuper convention. |
| 14 | **Decide whether to keep the 28 auto-created crews** (the HANDOFF said this should be 0 by Erik's call) | S | Erik | Either delete and return to 0, or accept and document. Mixed state is the worst case. |
| 15 | **Garbage-collect orphan HubSpot contacts** (2,243 contacts with no project or job) — at minimum tag them as "lead-only" so the picker can filter | S | `src/integrations/hubspot/sync.ts` | Add a `customers.role` enum (`active`, `lead_only`) or use a `tags` jsonb. |

---

## 6. Reproducible queries

All queries below are pure `SELECT` and can be re-run as is. Connection: `psql "$DATABASE_URL"` (loaded from `.env.local`).

```sql
-- §1.1, §1.2: address + customer-name placeholder coverage
SELECT
  COUNT(*) FILTER (WHERE address IS NULL OR address = '') AS empty_addr,
  COUNT(*) AS total_jobs
FROM jobs;
SELECT COUNT(*) FROM customers WHERE name LIKE 'Legacy install %';

-- §1.3: stale non-terminal jobs
SELECT
  COUNT(*) FILTER (WHERE date::date < CURRENT_DATE AND status NOT IN ('complete','cancelled')) AS past_not_terminal,
  COUNT(*) FILTER (WHERE status = 'scheduled' AND date::date < CURRENT_DATE) AS sched_past,
  COUNT(*) FILTER (WHERE status = 'onsite' AND date::date < CURRENT_DATE - 1) AS onsite_yesterday_plus,
  COUNT(*) FILTER (WHERE status = 'enroute' AND date::date < CURRENT_DATE) AS enroute_past
FROM jobs;

-- §1.5: outbox is stuck
SELECT topic, COUNT(*), COUNT(*) FILTER (WHERE "deliveredAt" IS NULL) AS pending, MAX(attempts)
FROM outbox GROUP BY topic;

-- Proof the drainer payload shape is wrong:
SELECT "payloadJson"->>'jobId' AS jobid, "payloadJson"->>'id' AS id
FROM outbox WHERE topic='jobs.updated' LIMIT 3;

-- §1.6: customer orphans
SELECT COUNT(*) FROM customers c
LEFT JOIN jobs j ON j."customerId"=c.id
LEFT JOIN projects p ON p."customerId"=c.id
WHERE j.id IS NULL AND p.id IS NULL;

-- §2.3: jobs field coverage
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE address IS NOT NULL AND address <> '') / COUNT(*), 1) AS pct_addr,
  ROUND(100.0 * COUNT(*) FILTER (WHERE "customerId" IS NOT NULL) / COUNT(*), 1) AS pct_cust,
  ROUND(100.0 * COUNT(*) FILTER (WHERE "projectId" IS NOT NULL) / COUNT(*), 1) AS pct_proj,
  ROUND(100.0 * COUNT(*) FILTER (WHERE "crewId" IS NOT NULL) / COUNT(*), 1) AS pct_crew
FROM jobs;

-- §3.1: linkage gaps
SELECT
  COUNT(*) FILTER (WHERE c.id LIKE 'hs-legacy-cust-%') AS legacy_placeholder,
  COUNT(*) FILTER (WHERE c.id LIKE 'hs-c-%') AS hubspot_contact,
  COUNT(*) FILTER (WHERE c.id LIKE 'zup-cust-%') AS zuper_only
FROM jobs j JOIN customers c ON c.id = j."customerId";

-- Duplicate customers by phone
SELECT phone, COUNT(*), string_agg(DISTINCT name, ' | ') AS names
FROM customers WHERE phone <> '' GROUP BY phone HAVING COUNT(*) > 1 LIMIT 10;

-- Outbox payload contains stale crew ids
SELECT
  COUNT(*) FILTER (WHERE "payloadJson"->>'crewId' LIKE 'zup-team-%') AS old_zup_team_ids,
  COUNT(*) FILTER (WHERE "payloadJson"->>'crewId' LIKE 'crew-%') AS new_crew_ids
FROM outbox WHERE topic='jobs.updated';
```

Code locations of interest:
- `src/db/schema.ts` — full schema
- `src/integrations/hubspot/sync.ts:1209-1262` — broken outbox drainer
- `src/integrations/hubspot/sync.ts:518-567` — V2 native project path (0 writes)
- `src/integrations/hubspot/sync.ts:604-708` — V1 legacy installation path (writes the placeholder customer + project)
- `src/integrations/zuper/bootstrap.ts:84-96` — `joinAddress` / `durationHoursBetween` (the address source that returns null and the duration calc that yields 104h)
- `src/integrations/zuper/bootstrap.ts:138-159` — `projectAndCustomerFor` (the linkage resolver that prefers the V1 placeholder over the real HubSpot contact)
- `src/integrations/zuper/enrich.ts` — the enrich pass that was supposed to populate addresses but ran only once (per `audit_log`)

---

## 7. Tier rollup

**Truly safe to demo today:** the dispatch board, because `jobs.title` carries the real customer name verbatim.

**Looks fine but breaks under load:** anything that surfaces `customers.name` (drawers, customer picker, search) — every V1-linked job will show "Legacy install …".

**Will break the moment writeback turns on:** the outbox drainer (wrong payload shape), the 6,192 stale `zup-team-*` references in pending payloads, the HubSpot job push (all 18 source fields are null), and the V2 native project sync.

**Quietly missing:** addresses (100% empty), regions (decorative), trucks/time-off/checklists (empty tables in a UI that pretends they exist).
