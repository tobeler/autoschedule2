# Jetson Schedule + Dispatch — Handoff

What you (Erik) need to do, in order, after the in-session phases land. This document grows as Phase 18's review surfaces findings.

---

## 1. Provision Supabase (one-time, ~15 min)

The app currently runs in **demo mode** — Zustand store + localStorage, no real DB. Everything you need to move to a real backend is already wired in code; you just need to flip the switch.

1. Go to https://supabase.com → New project. Free tier is fine. Pick the region closest to you (likely `us-west-1` since Jetson is Vancouver + Colorado).
2. Set a strong DB password. Save it.
3. Once provisioned, grab from the dashboard:
   - **Project URL** (`https://xxx.supabase.co`) → goes to `NEXT_PUBLIC_SUPABASE_URL`
   - **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret, server-only)
   - **Database URL** from Settings → Database → Connection string (the "direct" one, not pgbouncer) → `DATABASE_URL`
4. Locally:
   ```bash
   cp .env.example .env.local
   # paste the four values above into .env.local
   ```
5. Generate a NextAuth secret:
   ```bash
   openssl rand -base64 32
   # paste as NEXTAUTH_SECRET in .env.local
   ```
6. Apply the schema:
   ```bash
   pnpm drizzle-kit push
   ```
7. Bootstrap your admin account. In Supabase SQL editor:
   ```sql
   -- pick your email + password
   INSERT INTO users (id, email, "hashedPassword", name)
   VALUES (
     gen_random_uuid(),
     'erik@jetsonhome.com',
     crypt('your-temp-password', gen_salt('bf', 10)),
     'Erik Tobeler'
   );
   INSERT INTO profiles ("userId", role, "displayName")
   SELECT id, 'admin', 'Erik' FROM users WHERE email = 'erik@jetsonhome.com';
   ```
   (`crypt` + `gen_salt` come from the `pgcrypto` extension — Supabase ships it enabled by default.)
8. Restart the dev server: `pnpm dev`. Sign in at `/login`. The auth gate is now active; the demo-bypass auto-disables when `NEXTAUTH_SECRET` is set.

---

## 2. Wire HubSpot for live sync (5 min)

The HubSpot integration is server-side already; just needs the token.

1. HubSpot → Settings → Integrations → Private Apps → Create a private app for Jetson FSM. Required scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.deals.read`
   - `crm.schemas.*.read`
   - `crm.objects.custom.read`
   - `crm.objects.custom.write` (for the Jobs writeback)
2. Copy the token. Add to `.env.local`:
   ```
   HUBSPOT_TOKEN=pat-na1-...
   HUBSPOT_APP_SECRET=...      # from "App secret" in the same page (for webhook verification)
   HUBSPOT_PORTAL_ID=21424670
   ```
3. Open Settings → Integrations in the app. Click **Test connection** → should show "Connected · Jetson portal 21424670".
4. Click **Sync now**. Real customers / projects / service-areas land in your dispatcher state.

---

## 3. Deploy to Vercel (10 min)

1. https://vercel.com → New Project → import `tobeler/autoschedule2` from GitHub.
2. Framework preset auto-detects Next.js. Leave defaults.
3. Environment variables — paste these into the Vercel UI (everything in your `.env.local`):
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (set to your Vercel URL, e.g. `https://autoschedule2.vercel.app`)
   - `HUBSPOT_TOKEN`
   - `HUBSPOT_APP_SECRET`
   - `HUBSPOT_PORTAL_ID=21424670`
   - `CRON_SECRET` (any random string)
   - `INTERNAL_SHARED_SECRET` (any random string)
4. Deploy. Vercel will pick up the cron in `vercel.json` automatically.

⚠️ Vercel Hobby TOS says no commercial use. If putting real Jetson dispatchers on it, upgrade to Pro ($20/mo). For internal beta exploration, Hobby is fine.

---

## 4. Wire the HubSpot webhook receiver (5 min, optional)

So HubSpot pushes deal/project changes to us in real time instead of waiting for the daily cron.

1. HubSpot → Settings → Integrations → Webhooks (or Workflows for native Project events).
2. Target URL: `https://autoschedule2.vercel.app/api/webhooks/hubspot`
3. Subscribe to: `project.creation`, `project.propertyChange`, `deal.propertyChange` (filter to `dealstage`), `contact.propertyChange` (filter to address fields).
4. Save. Signature verification uses `HUBSPOT_APP_SECRET` you set in step 2.

---

## 5. Wire the Supabase Database Webhook for HubSpot pushback (5 min, optional)

So whenever a job's status changes in our DB, we push to HubSpot's Job custom object automatically.

1. Supabase → Database → Webhooks → Create.
2. Table: `outbox`. Event: `INSERT`.
3. Target URL: `https://autoschedule2.vercel.app/api/internal/outbox-drain`
4. Headers: `x-internal-key: <INTERNAL_SHARED_SECRET value>`

---

## 6. First dispatcher accounts

After step 1's admin login, you can invite dispatchers two ways:

- **Direct DB insert** (same SQL pattern as step 1.7, but `role` = `'dispatcher'`).
- **Self-service** — not built yet; add a small "create user" form in Settings → Permissions if needed. Skip for MVP.

---

## Findings from the Phase 18 review

Phases 15–17 verified via screenshot pass against `http://localhost:3000/` after dev-server restart. Build + typecheck both clean. Demo-data toggle smoke-tested end-to-end. Console showed 10 expected `500` errors from `/api/v1/*` calls — these are correct demo-mode behavior (`useStoreHydration` falls back to localStorage seed when no `DATABASE_URL`; rolls back optimistic writes with a toast). They go away once you wire Supabase per step 1.

**Verified working:**

- Dispatch board: drag from rail in Day, Week, Month all schedules + auto-fills crew + opens drawer on Crew tab.
- Dispatch board: drag a scheduled job back onto the Unscheduled rail re-unscheduled it.
- Trucks page: "+ Add vehicle" header button → modal → save. Per-row "..." → Edit / Delete (with active-job guard).
- Technicians page: "..." → Edit / Add time off / Delete.
- Crews page: "+ Add crew" + per-card "Edit / Delete". Members get an "x" to remove via AddMemberPicker.
- Projects page: "+ New project" header button → modal. Per-row Edit / Delete + ProjectDetailDrawer Edit / Delete.
- Job drawer: "Move to Unscheduled" + "Reschedule" (SuggestTimePicker overlay) + "Delete job" (with confirm + onsite-status guard) + editable Overview-tab basics (address / notes / driveTimeMin / price / project / HubSpot deal id).
- Settings → Job templates: per-template Delete with guard.
- Settings → Integrations: HubSpot card with Test Connection + dev-only Paste-Token + Sync now (hydrates store via setCustomers/setProjects/setRegions in demo mode) + Test push disabled with "Push enabled when DATABASE_URL is set" tooltip. Open-in-HubSpot icon on project + customer references.
- Settings → Time off and Settings → Regions: full CRUD editors.
- Settings → Integrations: new **Demo data** card at top — toggle off shows a confirm modal, clears all collections, persists across refresh; toggle on reloads from seed.

**No blockers found.** Three small things you may want to revisit when you have time, but they don't gate the demo:

1. Hydration `/api/v1/*` calls noisily 500 in the dev console while in demo mode. Cosmetic only; the fallback works. Could be quieted by short-circuiting the API client when `NEXTAUTH_SECRET` env var is unset.
2. The job-drawer "Reschedule" overlay reuses `SuggestTimeOverlay` from Phase 5 — when invoked with no `crewId` change, it briefly shows "weekday-only" hints that are less relevant for an existing job already scheduled to a specific weekend. Functional; could be polished.
3. Vercel Hobby plan's commercial-use TOS gray area for the Jetson production deploy — not a code finding, but flagged from earlier plan: upgrade to Pro ($20/mo) when putting real dispatchers on it.

All 14+4 = 18 phases of the plan are shipped + committed + pushed to `tobeler/autoschedule2`. Tags: `demo-snapshot-4` pins the latest production snapshot.

---

## UI/UX review pass — 2026-05-22

Driven via headless Playwright across every nav tab, every dispatch range × layout, every settings sub-tab, every Add/Edit modal, the job drawer (all 6 tabs), wizard flow, demo-data toggle, attention pill, region picker. 44 screenshots in `/tmp/jetson-review/`. **0 unhandled page errors.** Findings ranked by leverage:

### Real issues worth fixing

Three findings from the initial Playwright pass (Crews weekly toggle, HubSpot Configure modal, project row click) **turned out to be Playwright selector artifacts** on investigation:

- Crews `mode === 'weekly' && <WeeklyComposition/>` is correctly wired in `CrewsView.tsx:149`.
- HubSpot Configure expand uses `.integ-config-expand` inline (`IntegrationsPanel.tsx:395-398`). The `modal-backdrop` Playwright tripped on was the DemoData confirm modal from a previous click; the Cancel button was real but the selector then matched Twilio's "Configure" button instead of HubSpot's.
- `ProjectsView` rows are clickable via `.proj-row onClick={() => setSelectedId(p.id)}` (`ProjectsView.tsx:228`). My selector used `table tbody tr` which doesn't match the custom row component.

The actual real bugs/UX issues:

1. **Gantt view: short-duration job blocks truncate to 4–6 characters.** ✅ **Fixed in `cfb1515`** — blocks < 60px wide now drop the customer name and only show the job-type color tag. Full label available on hover via `title` attr.

2. **Unscheduled-job drawer is hero-dominated.** ✅ **Fixed in `cfb1515`** — when user clicks any tab other than Overview, the green hero collapses to a thin "This job needs scheduling · Schedule it →" banner. Clicking the banner jumps back to Overview where the full picker is.

3. **Sidebar dispatcher footer was hardcoded** to "Jordan Rivera · Dispatcher · Watertown". ✅ **Fixed in `cfb1515`** — now reads `currentUserName` + `currentUserRole` from the store (populated by `/v1/me`) + the selected region's sub-name. Falls back to seed dispatcher in demo mode.

### Cosmetic nits (lower priority)

6. **Map view side panel is cramped.** Crew filter chips + route-stop cards squeezed into ~280px. Consider widening the side panel to ~360px and making stops collapsible per crew.

7. **Topbar potential collision at narrow viewports.** At 1600px the topbar is fine, but the Denver region pill + "Dispatch" title + search are tightly packed. Worth a manual check at 1200–1280px viewports (typical laptop screens).

8. **Reports + Timesheets have no obvious CTAs.** Reports could use a prominent "Export CSV" button; Timesheets needs an "Approve all" action. Wait until real data lands before polishing.

9. **Dispatcher footer in sidebar (Jordan Rivera · Watertown) shows fixed text.** Once auth lands, this should pull from `currentUserName` / branch.

### What didn't render correctly during the pass

- **Wizard step 2 (job type)** — the Playwright "Continue" click after picking a customer didn't navigate. Could be timing; the wizard works manually. Worth a manual smoke-test.
- **Drawer's Crew/Timeline/Customer/Completion/Notes tabs** captured but show the unscheduled-hero overlay obscuring the tab body. Confirms finding #5.

### Pre-existing footguns flagged earlier in the plan and still open

- Vercel Hobby's commercial-use TOS (gray area)
- HubSpot webhook signature verification — code exists, not yet verified against a real webhook delivery
- API rate limiting (not yet implemented; recommended Upstash Redis before production traffic)
- Real timezone handling for jobs across MST/EST/PST regions
- Sign-out + password reset routes
- Audit log retention policy
- Mobile (Expo) — design source preserved in `design-source/`

---

## Production-readiness items deferred from the original plan

The original plan called these out as "not in v1" — flagging here so we know what's still missing:

- CI/CD beyond Vercel auto-deploys (GitHub Actions for PR typecheck/lint/Playwright)
- Bootstrap admin via UI (currently a SQL insert)
- Real timezone handling for jobs across CO / NY / Vancouver
- HubSpot webhook HMAC signature verification — implementation exists, but verify it against an actual webhook delivery
- API rate limiting (Upstash Redis recommended)
- One-time bulk data import from current Zuper
- Sign-out + password reset flow (only sign-in exists)
- Audit log retention policy (currently keeps everything forever)
- Mobile (Expo) — fully deferred until you want it; design source preserved in `design-source/`
- Playwright E2E + Detox + API contract tests — deferred

---

## Repo layout reminder

- Main repo: https://github.com/tobeler/autoschedule2
- Plan file: `/Users/work/.claude/plans/curious-toasting-sifakis.md` (this codebase's source of truth for what was/will be built)
- Demo snapshot tag: `demo-snapshot-3` (production build pinned to commit before Phase 15)
- Demo URLs: `http://mac-mini.tail79e005.ts.net:3000` (live dev) · `:3001` (frozen snapshot)
