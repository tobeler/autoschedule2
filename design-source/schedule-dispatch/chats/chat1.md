# HVAC Field Service Platform

_Started 2026-05-21 22:47 UTC_

---

## User

I want to have a fully functioning field service management tool working for an HVAC contractor company, Jetson. In it it should have:
- auto routing logic
- time sheet management
- scheduling
- resource allocation
- resource availability
Do research on what Service Titan does and have that. I don't need the CRM functionality necessarily because our CRM currently is HubSpot so we'll need to connect to that eventually. At the end of the day I'm looking for something that I could schedule jobs, assign jobs to teams and people and resources, have those resources have certain skill levels so there's auto assignment and formation of crews based on business logic that we can define. For example on a heat pump installation job I know I need:
- one HVAC lead
- one HVAC installer
- maybe an apprentice
- definitely an electrician
Using that logic, from our pool of crews they should have their default crews but the crews should be flexible. It should also be able to account for truck and van resources too so each lead on a heat pump installation, for example, needs a truck.
I'd like for this view to be a calendar view but also sortable by job or by team or by truck so fully flexible and customizable views, as well as a Kanban board view and a Gantt chart view in the calendar view. It should also be a month view or a week view or just the day view. Can you help me solidify this plan?

## Assistant

_[tool: questions_v2]_

## User

Questions answered:
- primary_view: Calendar (day view) grouped by Truck/Crew
- user_role: All three — single power-user view
- scope: Full app — calendar, jobs, crews, trucks, timesheets, settings, crew-builder rules
- job_types: - Heat pump installation
- Electrical service upgrade
- Heat pump water heater installation
- Service calls: there are different subcategories of service calls, so there's warranty, customer pay, service care, and call back

There's also other job types like:
- walk-throughs, which are scheduled with FSMs
- just in general meetings and trainings
- one more of smart system retrofit
- crew_rules: For heat pump installations, ideally it's a crew of three to four. It must have an HVAC lead, an HVAC installer, and an electrician. The electrician's role is only about three hours, whereas the HVAC role is about eight hours. These roles, the role type, should be able to be customizable based on the job.
For example:
- Smart system retrofits would take two hours for just an electrician.
- Heat pump water heater install would be a plumber, an electrician, and an apprentice.
In general, this should be customizable, like resourcing in general. I think is a good way to think about it, and those roles should be customizable based on the job.
- skills_model: Role + skill level (Lead L1/L2/L3, etc)

## Assistant

_[tool: list_files]_

_[tool: read_file]_

Got it. I'll fill in sensible defaults for the rest (auto-assign both modes, routing does both proximity + day-order, timesheets auto-drafted + editable, 12 crews, light/airy ops aesthetic with green accents, HubSpot sync badges + an integrations page, and one cohesive build with a couple of Tweaks).

Let me explore the design system, then plan the build.

_[tool: list_files]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: update_todos]_

_[tool: copy_files]_

_[tool: copy_starter_component]_

I have what I need. Let me set up the file structure and start building.

_[tool: write_file]_

Now let me build. Starting with the app-level CSS and the shell.

_[tool: write_file]_

Now shared components and icons.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

Now the centerpiece — the dispatch view. I'll split it across files for size.Now the dispatch view itself.

_[tool: write_file]_

Now the secondary views: Jobs, Crews, Fleet, Timesheets, Settings.

_[tool: write_file]_

Now Timesheets + Settings (job templates, integrations).

_[tool: write_file]_

Now the root app and the HTML shell.

_[tool: write_file]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Built out the full **Schedule + Dispatch** app. Here's what's in there:

**Dispatch** (default landing) — Day calendar grouped by crew/truck/tech, with a left rail of unscheduled jobs you can drag onto crew rows. KPI strip at top (jobs today, crews active, hours scheduled, unfilled slots, drive time, revenue). Now-line, status accents on job blocks, ⚠️ flag on jobs with unfilled slots. Toggle Range (Day / Week / Month), Layout (Calendar / Kanban / Gantt), Group (Crew / Truck / Tech), Density (Cozy / Compact).

**Job detail drawer** — Overview, Crew (with role-by-role slot list, "Auto-fill" suggester, per-slot assign/swap dropdowns), Timeline (dispatched → en route → on site → complete), Customer (HubSpot-synced), Notes.

**Jobs** — sortable/filterable table with type chips, status filters, search, crew composition column.

**Crews** — KPI row, default-crew roster cards (lead badges, members with role + level + certs), full skills-matrix table.

**Trucks** — fleet table with utilization bars, today's jobs, in-shop/available status.

**Timesheets** — Week grid auto-derived from job assignments. Approve / OT flags / status (draft / pending / approved).

**Settings**
- **Job templates** — fully editable per-type slot lists (role, min level, hours, start offset, optional). All your rules baked in: HP install = lead L2 + installer L1 + apprentice (opt) + electrician 3h. Retrofit = electrician 2h. HPWH = plumber + apprentice + electrician 2h.
- **Business rules** — auto-assignment + auto-routing toggles (skill match, time-off honoring, 40h cap, same-lead-for-callbacks, service radius, route optimization).
- **Integrations** — HubSpot card (Connected, last-sync, field mapping diagram), Google Maps, QuickBooks Time, Twilio.
- **Roles & skills**, **Hours & holidays**, **Permissions** matrix.

**Tweaks** — density + drive-time overlay toggle + accent palette swap.

A few things I'd want to know next:
1. **Drag-and-drop fidelity** — right now it's job→crew-row drop (creates a scheduled job). Want crew-to-crew swap, job resize via drag, and route-order drag in calendar?
2. **Job creation flow** — the "+ New job" button is currently a placeholder. Want me to build the new-job wizard (customer lookup from HubSpot → type → template-driven crew + truck suggestion → time slot pick)?
3. **Mobile tech view** — the tech-side mobile app for clock in/out, job notes, photos. Big surface to design.

## User

Verifier agent check completed

## Assistant

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: done]_

Fixed — that single CSS rule change (`grid-template-columns: 0 1fr` → `1fr`) restores the full width for Kanban, Gantt, Week, and Month views.

## User

How can we improve this?

## Assistant

Honest critique of what's there today: the structure is solid (every major view, drawer, template editor exists), but the **headline interactions are still mostly static** and a few high-leverage screens are missing. Here's where I'd push next, grouped by goal:

### Make the dispatch board feel alive (highest impact)
1. **New-job wizard** — biggest dead button. Customer search (HubSpot-backed) → job type → template auto-populates slots → smart crew suggestion with reasoning → time-slot picker that shows real availability. This single flow stitches together CRM, templates, auto-assign, and routing.
2. **Drag everything, not just unscheduled jobs** — drag a job between crew rows to reassign, drag its right edge to resize duration, snap to 15-min increments with a live "ghost" + a red flash when it overlaps another job or violates a rule.
3. **Smart-schedule modal** — for any unscheduled job, get a ranked list of crews with *why*: "Holloway Crew · 0.4mi from prior stop · 4 free hours · lead is L3 (matches) · electrician available 1–4p." Click → schedules.

### Information UX (helps the dispatcher *see* the day)
4. **Map view** — toggle the calendar with a map showing today's jobs as numbered pins, drawn routes per crew, drag a pin to reschedule. The drawer already has a map stub; this promotes it to a first-class view.
5. **Capacity heatmap on Week/Month** — overlay each crew-day cell with a fill % so you can spot "Thursday is overbooked" and "Park Crew is idle Friday" at a glance.
6. **Conflicts & exception panel** — a small persistent "needs your attention" rail: 1 unfilled slot, 1 callback unscheduled, 1 tech out sick whose jobs need reassignment.

### Reach into the rest of the org
7. **Tech mobile view** — phone-framed companion screen showing today's stops, big "Clock in / Clock out" buttons, in-job photo + note capture. This is what drives auto-derived timesheets, so it closes a real loop.
8. **Reports tab** — crew utilization, first-time-fix rate, revenue per truck, drive-time saved by routing. Even one well-designed report communicates the platform's value to ops leadership.

### Brand & feel
9. **Morning brief / Dispatcher home** — short "today at a glance" hero panel with the Jetson-green energy, replacing the gray KPI strip. Surfaces unfilled slots, late starts, weather, and a single "Optimize all routes" button.
10. **Visual polish** — Jetson illustration accents in empty states, more deliberate use of green/lime, denser type hierarchy on the calendar so 12 crews × full day reads cleanly.

---

**My recommendation for the next iteration:** pick **#1 (new-job wizard) + #3 (smart-schedule modal) + #4 (map view)**. They share a data backbone (slots + suggestions + geo) and together they turn this from "looks like an FSM" into "feels like the dispatcher's command center."

Which direction sounds right? I can also propose tradeoffs in a different framing (e.g., "ship the mobile tech app first because it unblocks real timesheet data") if you'd prefer.

## User

Let's do everything in that list. Also, we need another view that's the mobile installer or mobile technician view. This is where installers and technicians get:
- their job details
- routes to jobs
- clock their travel time
- get job details
- take photos of the completed jobs
- fill out checklists of the completed jobs
I can provide any information you may need.

## Assistant

_[tool: update_todos]_

_[tool: copy_starter_component]_

Let's do it. Big batch — I'll work through it in stages and update you as each piece lands.

_[tool: read_file]_

_[tool: grep]_

_[tool: write_file]_

Now the mobile tech view + supporting CSS. This is a substantial piece.

_[tool: snip]_

_[tool: str_replace_edit]_

On the comment: yep, easy fix — I'll sort the rows alphabetically by person name in Tech-group mode. And I'll wire up the New Job button to the wizard.Now I'll build the New Job wizard, the Smart-schedule modal, and the Mobile Tech view in one file each, then wire it all in.

_[tool: write_file]_

_[tool: str_replace_edit]_

Adding drive-time pills between consecutive jobs on each row.

_[tool: str_replace_edit]_

Now the mobile tech view.

_[tool: write_file]_

Now wire it all up: add Tech tab + Reports tab + Brief panel + Map view + wizard modal triggers in app.jsx and view-dispatch.jsx.

_[tool: write_file]_

Now wire it into the dispatch view (brief + map toggle + exceptions rail + new job button) and the app shell (tabs + modal state).

_[tool: str_replace_edit]_

Now update app.jsx — add Tech and Reports tabs, hook up wizard.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Replacing the branch text with a real region picker (Colorado → North Denver / Denver / Colorado Springs, plus New York and Vancouver).Now build the RegionPicker component and wire it into the topbar.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Adding the map to the Overview tab, finishing the region-picker CSS, and wiring it into the topbar.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

## User

continue

## Assistant

_[tool: read_file]_

Continuing — let me first wire the new files into the HTML shell, then add the checklist system and remove price displays.

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now build the customizable checklist system. This is the biggest piece — supporting true/false, photos, multi-select, text, etc., editable per job type, and visible from the back office when a job is complete.

_[tool: write_file]_

_[tool: str_replace_edit]_

## User

Did you do everything from your suggestion list earlier?

## User

continue

## Assistant

_[tool: list_files]_

_[tool: grep]_

Let me audit what actually shipped before continuing.

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

Quick honest audit before I keep going:

**Done from the earlier list:**
- ✅ New-job wizard, smart-schedule modal, map view, mobile tech app, reports, morning brief, exceptions rail, drive-time pills, region picker, map in drawer overview, checklist data model

**Not done yet:**
- ❌ Customizable checklist system as a real, editable system (data exists; UI partial)
- ❌ Capacity heatmap on Week view
- ❌ Drag between rows + resize + conflict feedback
- ❌ **Remove price/$ everywhere** (your explicit ask)
- ❌ **Auto-suggest bookings overlay** (your latest ask — Google-Calendar style "suggest a time" showing availability across crews)

Let me knock these out. First, checking checklists.jsx state and removing prices.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

Good — `checklists.jsx` is complete (502 lines). What's left: add CSS for it, wire into drawer + settings + mobile, remove prices, build auto-suggest. Let me check a couple of things.

_[tool: str_replace_edit]_

Now I have the full picture. Let me knock everything out in batches.

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now I'll knock down everything else in parallel.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Done — pulling the mobile tech view out, fixing the duplicate brief, then building auto-suggest + capacity heatmap + Forms tab in Settings.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: write_file]_

_[tool: str_replace_edit]_

Now the auto-suggest bookings overlay (Google Calendar "Suggest a Time" style), capacity heatmap, and Forms section in Settings.Now add the Suggest-a-time button to dispatch toolbar + Forms section to Settings.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now capacity heatmap on the Week view, then verify everything works.

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Cleared the small things first; here's the full state:

**Done this round:**
- ✅ Removed mobile tech view (per your request)
- ✅ Region picker (Colorado / NY / Vancouver with sub-regions) replaces "Watertown Branch" — was already done last turn
- ✅ **Auto-suggest bookings overlay** — Google-Cal-style "Suggest a time" button on Dispatch toolbar. Opens a crews × days grid showing every fit highlighted in green, existing bookings as gray pills, unavailability (PTO, no contiguous window) with hatched stripes. Side panel ranks top 8 fits with reasoning chips.
- ✅ **Customizable checklist system** — full data model in `data.js`, FormBuilder UI in Settings → Completion forms (supports yes/no, photos, multi-select, single-select, number with min/max validation, text/longtext, signature, rating). Per-job-type templates with versioning. Required fields gate completion.
- ✅ **Back-office checklist viewer** — open any complete job (J-2580 or J-2581) → "Completion form" tab in the drawer shows the submitted form with section progress, per-field tick status, photos, signatures.
- ✅ **Capacity heatmap on Week view** — every crew × day cell shows a colored fill (green low → amber high → red striped over-capacity) plus % label
- ✅ **All price/$ removed** — across job blocks, drawer, jobs table, brief stats, reports

**Still on the deferred list (open for next round):**
- Drag improvements: between-row reassignment, edge-resize for duration, conflict feedback
- Wire the new completion form into the unscheduled rail / auto-trigger on tech "complete" — currently only viewable on the dispatcher side

What should I tackle next?

## User

Verifier agent check completed

## User

Did we do all this stuff in the list too?

## Assistant

Honest audit against that list:

| # | Item | Status |
|---|---|---|
| 1 | New-job wizard (HubSpot search → type → smart crew → time) | ✅ Done |
| 2 | Drag everything — between rows, resize, conflict feedback | ❌ **Not done** |
| 3 | Smart-schedule modal with ranked crews + reasoning | ✅ Done |
| 4 | Map view (toggle, pins, drawn routes, side panel) | ✅ Done (no drag-pin-to-reschedule yet) |
| 5 | Capacity heatmap on Week / Month | ⚠️ Week only — Month view doesn't have it |
| 6 | Conflicts & exceptions rail | ✅ Done |
| 7 | Tech mobile view | ❎ Built, then removed at your request |
| 8 | Reports tab | ✅ Done |
| 9 | Morning brief on dispatch home | ✅ Done |
| 10 | Visual polish — illustration accents in empty states, denser calendar type hierarchy | ⚠️ Partial — brief uses Jetson green well, but empty states are plain and the 14-crew calendar still gets tight at default density |

**The three real gaps:**
- **#2 drag improvements** is the biggest miss — between-row reassignment + edge-resize would make the calendar feel much more "alive"
- **#5 Month heatmap** — quick add
- **#10 polish** — illustration accents, denser type, more deliberate lime usage on dispatch surfaces

Want me to knock those out next, or is there something else higher priority?

## User

Let's add those.

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Building the drag system. I'll upgrade JobBlock with both between-row drag (already wired) plus pointer-based edge resize and visual conflict feedback, then add the Month heatmap and a couple of polish touches.Now update DayCalendar to highlight drop targets, show a live time preview, and pass the resize callback + sibling jobs to JobBlocks. Then add the Month-view heatmap and polish.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now Month-view heatmap + polish (empty state illustration + denser calendar typography).

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Shipped:

- **Drag improvements** — every job block now drags between rows (crew, truck, tech), with a green drop-target highlight and a live time-preview line that shows the snap-to-15-min time as you hover. Edge resize: hover any block, grab the right edge, drag to resize with a live tooltip showing new duration + end time. Conflicts: if a move/resize creates an overlap with another job in the same row, both blocks get a red outline + shake + "Conflict" badge.
- **Month heatmap** — every day cell in Month view now has the same capacity overlay as Week (green/amber/striped-red) with a % label.
- **Polish** — empty states swapped to a Jetson-illustration card (forest-green house silhouette with a heat pump unit + lime windows), tightened calendar row typography (subhead font, tighter tracking, transition on density change).

## User

Verifier agent check completed

## Assistant

Good — verifier confirmed everything works (drag handles, week heatmap, month heatmap, conflict badges). Ready for whatever's next.

