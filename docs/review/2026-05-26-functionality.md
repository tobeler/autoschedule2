# Functionality review — 2026-05-26

Read-only correctness pass. Tracing only — no edits, no DB writes, no Zuper/HubSpot writes attempted. File:line references are to the working tree at HEAD (with current uncommitted diff on `JobDetailDrawer.tsx` considered).

---

## P1 — must fix (correctness / data-loss / writes-to-prod risk)

### P1-1. HubSpot writeback is NOT gated by a feature flag — outbox drains directly to live portal
**File:** `src/integrations/hubspot/sync.ts:1067` (`pushJobToHubspot`), `:1155` (`pushProjectToHubspot`), `:1210` (`drainOutboxRow`).
**What's wrong:** Every mutating jobs/projects route calls `publish({ topic: 'jobs.updated', ... })` (jobs.ts:285, 334, 369, 460; slots.ts:77; projects.ts:151; DB trigger in `0001_outbox_triggers.sql`). The drainer's only gate is `isHubspotConfigured()` (checks `HUBSPOT_TOKEN`). Per HANDOFF §0, `HUBSPOT_TOKEN` IS set in prod. There is no `integrations.hubspot.writeback_enabled` flag check anywhere in the push path.
**Repro:**
1. App in API mode, any user updates any job (drag, change status, edit slot).
2. Hono insert → DB trigger fires → outbox row → Supabase webhook → drainer → `createOrUpdateJob` → live HubSpot PATCH on `2-62483808` Jobs object.
**Suggested fix (sketch):** Add `getBooleanFlag('integrations.hubspot.writeback_enabled', false)` check at the top of `pushJobToHubspot` and `pushProjectToHubspot`, returning `{ ok: true, applied: false, ... }` when off. Mirror the Zuper pattern in `writeback.ts:writebackEnabled`. Default flag OFF until you're ready.

### P1-2. Zuper writeback timezone offsets are DST-naive — every reschedule is off by one hour for half the year
**File:** `src/integrations/zuper/writeback.ts:112` (`localToUtcIso`).
**What's wrong:** Hardcoded offsets: `CO-` → `-6`, `BC-`/`CA-` → `-7`, `MA-`/`NY-` → `-4`. These are summer (DST) values. In winter:
- CO is `America/Denver` MST = UTC-7 (code uses -6 → 1 hour early)
- BC is `America/Vancouver` PST = UTC-8 (code uses -7 → 1 hour early)
- MA is `America/New_York` EST = UTC-5 (code uses -4 → 1 hour early)
The function also ignores Arizona (no-DST) and mis-classifies CA-prefix as Pacific even though Zuper uses CA for California which spans the same Pacific zone as BC — accidentally correct for CA, wrong for BC in winter.
**Repro:** Run `previewReschedule({ zuperJobUid:'x', date:'2026-01-15', startHour:8, durationHrs:4, teamName:'CO-DE-1' })`. Expected `scheduled_start_time` = `2026-01-15T15:00:00Z` (8am MST). Actual = `2026-01-15T14:00:00Z` (8am MDT).
**Suggested fix:** Use `Intl.DateTimeFormat('en-US', { timeZone, hour12:false, ... })` with `timeZone: 'America/Denver'` (CO), `'America/Vancouver'` (BC), `'America/Los_Angeles'` (CA), `'America/New_York'` (MA/NY). Or use `date-fns-tz` `zonedTimeToUtc`. Map prefix → IANA zone, then let the runtime resolve DST.

### P1-3. Zuper writeback endpoint accepts read-scope auth
**File:** `src/api/routes/zuper.ts:298` (`writebackRescheduleRoute` handler).
**What's wrong:** The route is registered without `middleware: requireScope('write')`. The global `authMiddleware` resolves an actor (session OR API key) but doesn't enforce scope. A read-only API key (`scopes: ['read']`) can POST `/api/v1/zuper/writeback/reschedule`. With the flag eventually flipped on, that means an API key intended for read-only dashboards can push schedule changes to Zuper.
**Repro:** `curl -X POST -H "Authorization: Bearer <read-only-key>" -d '{...}' /api/v1/zuper/writeback/reschedule` returns 200 instead of 403.
**Suggested fix:** Add `requireScope('write')` (or `requireRole('admin','manager','dispatcher')`) to the route definition. Pair with P1-1: also gate the HubSpot push endpoints if/when they're exposed.

### P1-4. Zuper writeback bypasses the outbox — no retry, no idempotency
**File:** `src/store.ts:851-874` (the inline `fetch('/api/v1/zuper/writeback/reschedule')` call inside `moveJob.onConfirm`).
**What's wrong:** Per HANDOFF §0 open work #3, the design says "Wire into existing outbox drainer at `src/integrations/hubspot/sync.ts:1128`". The current implementation skips the outbox and calls the writeback fetch directly from the browser store. Result:
- A 5xx or network drop from Zuper just shows a toast; the local DB row is already persisted (`persistLocal()` ran in parallel) but Zuper is now out of sync with no retry.
- A user closing the tab mid-flight loses the writeback.
- The drainer (`drainOutboxRow`) has no `zuper.*` topic so a queued retry path is impossible.
**Suggested fix:** Replace the `fetch('/api/v1/zuper/writeback/reschedule')` POST with a `publish({ topic: 'zuper.job_rescheduled', payload: {...} })` server-side from the `PATCH /v1/jobs/:id` handler. Extend `drainOutboxRow` switch with `case 'zuper.job_rescheduled':` → call `rescheduleJob(payload)`. Keep the confirmation modal UX exactly as is; only the transport changes.

### P1-5. Mutating Hono routes do not require `write` scope
**File:** `src/api/routes/jobs.ts` (createRouteDef, updateRouteDef, deleteRouteDef, transitionRoute, autoFillRoute), `crews.ts`, `people.ts`, `customers.ts`, `projects.ts`, `slots.ts`, `trucks.ts`, `timeoff.ts`, `regions.ts`, `templates.ts`, `checklists.ts`, `settings.ts`, `hubspot.ts`, `zuper.ts`.
**What's wrong:** Only `apiKeys.ts:36` (admin/manager) and `audit.ts:23` use `requireRole`/`requireScope`. The middleware exists (`auth.ts:147-159`) but is not applied. Any session user with role=`tech` (scopes=`['read']`) can POST/PATCH/DELETE on these resources.
**Repro:** Session login as a `tech` user. `curl --cookie ... -X DELETE /api/v1/jobs/J-1234` → 200, job soft-deleted.
**Suggested fix:** Add a thin `mutationMw = requireScope('write')` and decorate every POST/PATCH/DELETE route's `createRoute({ ..., middleware: mutationMw })`. Cron + webhook entries already bypass via shared secret.

### P1-6. `moveJob` lets an invalid `crewId` propagate from the Unassigned bucket drop target
**File:** `src/views/dispatch/DayCalendar.tsx:153` (`noTeamRow.id = 'crew-__unassigned__'`) → `DayCalendar.tsx:324` (`rowDropMeta`).
**What's wrong:** When a dispatcher drops a job onto the "Unassigned" lane (the bucket of scheduled-but-uncrewed jobs), `rowDropMeta` does `allCrews.find((c) => c.id === '__unassigned__')` → returns undefined, but the function still returns `{ crewId: '__unassigned__', truckId: null }`. `moveJob` then writes `crewId: '__unassigned__'` into Zustand and DB. The job becomes orphaned (no FK match) and will probably 23503 on the Supabase write — but the optimistic local state already changed, so the rollback toast hits.
**Repro:** With at least one job in the Unassigned row, drag a different unassigned job onto the same row at a new hour. Inspect job state: `crewId` becomes the literal string `__unassigned__`.
**Suggested fix:** In `rowDropMeta`, when the slice yields `__unassigned__`, return `{ crewId: null, truckId: null }`. Also short-circuit drop-onto-self in `handleDrop` if `meta.crewId === prevJob?.crewId && hour === prevJob.startHour`.

### P1-7. `NewJobWizard` generates IDs from a 100-slot random pool
**File:** `src/modals/NewJobWizard/NewJobWizard.tsx:111`.
**What's wrong:** `id: 'J-' + (2700 + Math.floor(Math.random() * 99))` produces IDs in `J-2700..J-2798`. With 1,147 active Zuper jobs already in the DB (HANDOFF §0) and any prior wizard creations, primary-key collisions are very likely; Drizzle/PG will throw a 23505 unique-violation but the optimistic Zustand insert has already happened, leaving the rollback toast as the only signal. Also, `hubspotDealId: 'DEAL-' + (44300 + Math.floor(Math.random() * 99))` fabricates a fake HubSpot deal id that, if any path uses it for writeback, will refer to a nonexistent deal.
**Repro:** Create two jobs back-to-back in the wizard; with ~99 possibilities birthday-paradox starts colliding immediately.
**Suggested fix:** Use `crypto.randomUUID()` (or a server-side ID assigned by the POST handler). Drop the synthetic `hubspotDealId` entirely; leave it null and let the writeback path create the deal-association via the Associations API per HANDOFF §0.5.

---

## P2 — should fix (UX-impacting bugs, broken flows)

### P2-1. Smart Schedule scoring returns near-zero on Zuper jobs because region matching compares full crew name to 2-letter prefix
**File:** `src/lib/assignment.ts:74-84`.
**What's wrong:** Region match does `jobRegion = job.zuperTeamName.split('-')[0]` (yields "CO") and `crewRegion = crew.name.split('-')[0]` (yields the full crew name "Holloway Crew" because seed crews aren't dash-delimited). The `if (jobRegion === crewRegion)` branch never fires. Then the cross-region penalty branch DOES fire (`'CO' !== 'Holloway Crew'`), subtracting 20 points and adding a misleading "Cross-region (CO → Holloway Crew)" reason. Combined with the no-JOB_TEMPLATES Zuper-type path (line 50) adding only +40 if `members.length > 0`, plus the callback continuity path requiring `crew.id` linkage that doesn't exist for Zuper jobs, the practical score collapses to a small constant. Task #35 symptom matches.
**Repro:** Open Smart Schedule on any Zuper job. Top suggestion has score 20-40, "Cross-region (CO → Holloway Crew)" chip on every row, identical reasons across crews.
**Suggested fix:** Resolve crew region via `crew.zuperTeamName` (the materialized team name from `bootstrap-crews`) or via a `crew.regionPrefix` lookup, not by string-splitting `crew.name`. Fall back to comparing against `crew.regionId` if present. Same logic should skip the cross-region penalty when neither side has a resolvable prefix.

### P2-2. ZuperWriteConfirmModal copy contradicts the actual cancel behavior
**File:** `src/modals/ZuperWriteConfirmModal.tsx:122-125`, in conjunction with `src/store.ts:819-821, 880`.
**What's wrong:** The modal says: "Your local change is already saved. **Push to Zuper** sends it upstream… **Undo** reverts the local change." But for Zuper-sourced jobs the local DB row is NOT yet saved — `persistLocal()` is only called inside `onConfirm` (line 849). The Zustand store IS optimistically updated, but on cancel `set({ jobs: prev })` reverts it AND no DB write ever happened. So "already saved" is misleading. Worse, if a dispatcher pushes a change, then realizes it was wrong, then clicks Undo on the next change — the first change is still persisted to the DB while the modal copy implies "Undo reverts the local change".
**Suggested fix:** Update modal copy to: "Your dispatcher view shows the change. Push to Zuper persists it locally AND in Zuper. Undo discards it." Or, separately persist on optimistic flow and use a soft-deletion / pending-commit table for Zuper jobs so the copy stays accurate.

### P2-3. `moveJob` rollback after Zuper-writeback fetch fails leaves DB in sync but Zuper not
**File:** `src/store.ts:845-875`.
**What's wrong:** `onConfirm` fires `void persistLocal()` (writes to our DB) and in parallel issues the Zuper fetch. If the fetch resolves with `{ok:false}`, the user sees toast "Zuper writeback failed: …" but the DB row already has the new schedule. No rollback. Now Jetson's view of the schedule and Zuper's diverge. Combined with no outbox retry (P1-4), this is permanent drift.
**Suggested fix:** Either (a) await the Zuper response before `persistLocal()` and roll back local-only on failure, or (b) implement the outbox approach so DB + Zuper push are tied by the same row id and retry until success.

### P2-4. Week dispatch view drops Saturday and Sunday from rendering
**File:** `src/views/dispatch/DispatchView.tsx:84-89` vs. `src/views/dispatch/WeekCalendar.tsx:89`.
**What's wrong:** `DispatchView` filters jobs for the week range using `start = addDays(date, -date.getDay())` (Sunday) and 7 keys (Sun-Sat). It passes those jobs and `startOfWeek(date)` (Monday) to `WeekCalendar`, which builds only 5 day cells (Mon-Fri). Result: a Saturday job IS in `visibleJobs` (counted in chips/badges) but has no day column to render in, so it's silently dropped.
**Repro:** Schedule a job for Saturday. Switch dispatch view to Week. Job is not visible. Switch to Day on Saturday — there it is.
**Suggested fix:** Either make WeekCalendar 7 days, or align the DispatchView week filter to Mon-Fri (5 days) so the data and the view agree.

### P2-5. "Add custom slot" button works but role/level are not editable
**File:** `src/modals/JobDetailDrawer.tsx:1243-1263` (current uncommitted diff), `:1291` (`SlotRow`).
**What's wrong:** The button now appends a slot, but the only editor is the `SlotRow` select for `assignedTo` (a person picker). The new slot's `role: 'hvac_installer'` and `level: 'L1'` are hardcoded and there's no UI to change them. Dispatchers can add a slot but can't make it the role they actually need. Task #31 is half-done.
**Suggested fix:** Make `SlotRow` editable for `role` and `level` (drop-downs sourced from `ROLES` and `LEVEL_ORDER`) when `isEditing` is true. Or open a small inline editor pinned to newly-created slots.

### P2-6. Job-detail "tech row" drop target loses the assignment intent
**File:** `src/views/dispatch/DayCalendar.tsx:336-342`.
**What's wrong:** When `groupBy === 'tech'`, dropping a job onto a tech's row resolves to that tech's *defaultCrew*, not to that tech specifically. Dispatchers will reasonably expect "drop on Marcus's row → Marcus is on this job". Instead, the job gets assigned to Holloway Crew and Marcus may not even be on it. The UI affordance lies.
**Suggested fix:** In tech mode, after `moveJob`, also patch the slot list to assign the dropped tech to the first matching-role slot (or surface a small prompt: "Add Marcus to job? Open Crew tab to confirm").

### P2-7. Unscheduled jobs with a source-supplied date silently disappear from BOTH the calendar AND the unscheduled rail
**File:** `src/lib/dispatch-work.ts:89`.
**What's wrong:** `unscheduledReviewReason` returns `'Has schedule date/time from source'` when `status==='unscheduled' && job.date != null`. That pushes the job into the "needs review" rollup bucket. But neither the day/week/month calendar (filters by status) nor the unscheduled rail (filters by `isActionableUnscheduledJob`) renders it. The only place a dispatcher sees this row is the rolled-up "X unscheduled rows held out of dispatch" attention card.
**Suggested fix:** Render these in the rail with a "Confirm date" pill that fast-paths to dispatching at the source-supplied date, instead of hiding them entirely.

### P2-8. Crew composition for Zuper-scheduled jobs has no rendering path (task #34)
**File:** `src/views/dispatch/DayCalendar.tsx:140-186` plus `src/views/dispatch/JobBlock.tsx`.
**What's wrong:** Per §0.3, Zuper-scheduled jobs come with `zuperTeamName` ("CO-DE-2") but `crewId = NULL`. They land in the "Unassigned" virtual lane (line 150). They have no slots populated and no way to surface "the Zuper team that's on this in Zuper" beyond the small "Zuper team CO-DE-2" label inside the drawer's Timeline tab (`JobDetailDrawer.tsx:1411`). The JobBlock itself shows no avatars, no team name. Dispatchers can't see who Zuper has assigned without opening the drawer.
**Suggested fix:** In the unassigned lane's row label, show the most common `zuperTeamName` among the jobs. In `JobBlock`, when `crewId==null && zuperTeamName`, render a small grey chip "team CO-DE-2" so the dispatcher knows it's coming over from Zuper with that crew.

### P2-9. Scheduled jobs from Zuper missing `startHour` silently never render in calendars
**File:** `src/views/dispatch/DayCalendar.tsx:142-149`, `JobBlock.tsx`.
**What's wrong:** Several places (lane packing line 73, `prior.startHour` line 117 in assignment.ts) explicitly filter on `j.startHour != null`. If a Zuper job comes through with a `date` but no `startHour` (bootstrap sets it from `scheduled_start_time` which may be null for some statuses), the job appears in the visibleJobs day filter (`j.date === dateKey(date)`) but the calendar lane skips it. Result: counts show jobs for today, but the grid renders nothing.
**Suggested fix:** Either default missing `startHour` to a known sentinel (e.g. 8) at bootstrap time, or render a "Date-only, time TBD" pile per row. Don't let it be invisible.

### P2-10. `setHubspotMapping` and several checklist mutators don't write through to API
**File:** `src/store.ts:902-906`.
**What's wrong:** Comment says "Phase 13 will route through client.hubspot.putMapping". Today the mutation is local-only — changes in the Settings → HubSpot mapping UI don't persist. Reload wipes them. P3-ish but easy to bump if Settings ships before Phase 13.

### P2-11. `applySavedQuickFilter` is lossy on multi-type filters
**File:** `src/store.ts:338-363`, `src/views/jobs/JobsView.tsx:154`.
**What's wrong:** `SavedQuickFilter.types` is `string[]`, but `JobsView.setTypeFilter` only stores a single type. On apply, only `pendingJobsFilter.types[0]` is read. Save side also only stores `[typeFilter]`. If the model ever supports multiple, the consumer needs to change. Today, technically consistent but silently truncating.

---

## P3 — nits and improvements

### P3-1. First-time-fix rate ignores callback ordering
**File:** `src/views/reports/ReportsView.tsx:81-85`. Marks a completed install as "with callback" if the customer has ANY callback ever, including pre-install ones. Should compare `callback.date > installJob.date`.

### P3-2. `pushJobToHubspot` reads `NEXTAUTH_URL` for the public job link but falls back to a hardcoded `autoschedule2.vercel.app`
**File:** `src/integrations/hubspot/sync.ts:1112`. If self-hosted on a different domain, the job-link URL in HubSpot points to the wrong place. Prefer reading `INTEGRATION_BASE_URL` env var with a hard error if neither is set.

### P3-3. Reports utilization assumes 5-day, 8h-capacity weeks
**File:** `src/views/reports/ReportsView.tsx:13, 22-26, 43`. Service crews on weekend on-call won't show utilization for Sat/Sun work (also tied to P2-4).

### P3-4. `moveJob` toast for failed writes says "Move failed — restored" but for Zuper jobs there's no DB write to restore at this point
**File:** `src/store.ts:815`. The catch handler runs `persistLocal()` failure, not the optimistic move; the rollback only flips local state, which is correct, but the message implies the server-side state was restored — it wasn't (DB row is unchanged because persist never succeeded).

### P3-5. Outbox drain marks unknown topics as delivered without acknowledging
**File:** `src/integrations/hubspot/sync.ts:1227-1229`. Silently consumes unknown topics. Future Zuper topics added without updating the drainer will be eaten and never retried. Add a `console.warn` and don't bump `deliveredAt` until the topic is recognized.

### P3-6. `addSavedQuickFilter` uses upsert semantics (filter same id), but the id is randomized at save time
**File:** `src/store.ts:334-335`. Means the filter list is append-only via the UI. No "edit existing" path. Possibly intentional — confirm with Erik.

### P3-7. Demo-mode persist of `pendingZuperWrite` could store function references
**File:** `src/store.ts:1010-1027` (the persist `partialize`). The `pendingZuperWrite` shape includes `onConfirm`/`onCancel` (functions). If accidentally added to the persist allowlist, JSON.stringify drops them silently and reload could resurrect a `{ summary, action }` half-object with no handlers. Currently excluded but worth a comment.

### P3-8. `outbox-drain` HTTP route returns 200 on persistent failure
**File:** `app/api/internal/outbox-drain/route.ts:78-81`. Intentional (so Supabase doesn't retry forever) but the comment notes the `attempts` counter is the source of truth; nothing alarms when it crosses some threshold (e.g. attempts >= 5). Add Sentry breadcrumb / alert.

### P3-9. Attention "callback" detector matches `(status === 'unscheduled' || status === 'callback')` AND `type === 'callback'`
**File:** `src/views/attention/buildAttentionItems.ts:126`. A callback that has been re-scheduled (status='scheduled') is no longer in this list — but a re-callback before completion is exactly the high-risk case. Consider adding `status === 'scheduled' && date === today` for callbacks too.

### P3-10. Status-transition state machine allows backward jumps but doesn't capture them in audit
**File:** `src/api/routes/jobs.ts:49-58`. `complete → callback`, `cancelled → unscheduled` are both legal; useful for revive flows but should always emit an audit row regardless of role (currently audit middleware is global so this is probably fine, but worth verifying for the "complete → callback" path which has real billing implications).

---

## What's missing to be the best HVAC dispatch tool?

Functional gaps surfaced while tracing the code:

1. **SLA timers on callbacks.** `buildAttentionItems` treats every callback the same. Real dispatch needs "Customer Bob called 47 min ago, SLA breach in 13 min" with countdown. Source: callback creation timestamp + per-customer or per-warranty SLA target. Nothing in the schema tracks this today.
2. **SMS / Slack dispatch notifications.** No notification surface for technicians. When dispatcher schedules J-1234 to Marcus, Marcus only finds out by looking at the Zuper mobile app. A `notifications` table + Twilio-or-equivalent client would unlock instant push of assignment + ETA shifts.
3. **Parts / inventory gate before scheduling.** `JOB_TEMPLATES` defines slot roles but no required-parts list. Heat-pump installs can't run if the unit isn't on the truck. Wire a `jobs.requiresParts[]` + crew/truck `currentInventory` so Smart Schedule won't surface a crew that doesn't have the SKU.
4. **Skill-aware route optimizer.** `routing.ts:optimizeRouteForCrew` exists but doesn't factor required skill of each stop. A 3-stop tour with a journeyman-only job in slot 2 shouldn't be served by an apprentice-only crew even if the route geometry wins.
5. **Customer self-scheduling / dispatcher accept-or-reject queue.** No inbound channel for HubSpot → "request a slot" flow. Today a dispatcher manually creates jobs from deals. A small "incoming requests" lane parallel to Unscheduled would compress the loop.
6. **Travel-time / driving conditions overlay.** `estimateDriveTime` returns a static estimate from a CSV; real dispatch needs Google Maps Distance Matrix with traffic. Today the "min from prior stop" score is fiction.
7. **Crew skill-set / certification matrix surfacing.** `Person.certs` exists ("NATE", "EPA 608", "Master Plumber") but nothing in Smart Schedule reads it. A coverage warning ("this crew has no NATE-certified tech for ductless install") would beat the current "All required roles covered" boolean.
8. **Conflict warnings on overlap and time-off.** Drop a job at 9am onto a crew that already has 9am — no warning, second job stacks in a sub-lane. Drop onto a crew where the lead has time-off today — no warning. Both checks exist in `scoreCrew` as score modifiers; should surface as inline confirms.
9. **Bulk move / reschedule.** Dispatchers will often want to shift "everything on Friday Brent's crew to Monday." No multi-select on the rail or grid today.
10. **Print / share dispatch sheet for next-day prep.** Standard ops workflow at 4pm: print tomorrow. No print route or PDF export found.
11. **Customer history glance.** Opening a job shows the current customer but no "previous installs / last 3 jobs / warranty status". `continuationChain` and `multidaySiblings` exist but customer-level rollup doesn't.
12. **Revenue-per-job hidden behind a recent decision.** The HANDOFF mentions revenue display was hidden. Reports still uses `j.price`. For commercial-readiness, this needs to be a per-role permission, not a blanket hide.
13. **Audit trail for the dispatch board itself.** API mutations go through audit middleware, but optimistic local mutations that fail and roll back leave no trace. A "moves history" panel ("Marcus reassigned J-1234 at 9:47am") is dispatcher-friendly.
14. **Idle / over-utilized crew alerts.** Reports compute weekly utilization but there's no live signal — a crew with two 1-hour service tickets at 8am and 4pm is "100% scheduled" in the grid but has 7 idle hours. Surface gaps as drop-targets.
15. **Parts-and-permit-blocked status.** State machine treats "scheduled → enroute" as healthy, but a job waiting on a permit has no representation. Add a `blocked` status with a reason enum.
