# Jetson Schedule + Dispatch — agent notes

Reading order for any AI agent (or human dev) joining this repo:

1. **`HANDOFF.md`** — current state, what's done, what's running, what's deferred.
2. **`/Users/work/.claude/plans/curious-toasting-sifakis.md`** — the 19-phase implementation plan with architectural decisions and HubSpot field-mapping tables. Most valuable single document.
3. **`design-source/schedule-dispatch/chats/chat{1,2,3,4}.md`** — four UX iteration sessions. Tells you WHY the UI looks the way it does.
4. **`src/types.ts`** — the schema. Then `src/App.tsx` to orient in the code.

For HubSpot work, also: `src/integrations/hubspot/schema-snapshot.json` + `src/integrations/hubspot/field-map-defaults.ts`.

## Solved-problem documentation

`docs/solutions/` — documented solutions to past problems organized by category, with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas. Currently includes onboarding conventions; populated by `/ce-compound` as new solutions land.

## Stack reminders

- Next.js 15 (App Router) + Drizzle ORM + Supabase Postgres (deferred — currently runs on localStorage in demo mode)
- NextAuth v5 (not Supabase Auth — chosen for AWS-portability)
- Hono REST API at `/api/v1/*` + OpenAPI 3.x doc at `/api/docs`
- Zustand store with optimistic + API write-through + rollback toast — the established mutation pattern
- Outbox table is the SNS bridge for the eventual Jetson AWS migration; don't simplify it away

## Demo + dev

- `pnpm dev` → http://localhost:3000 (live, hot-reloads main)
- Frozen demo: tag `demo-snapshot-N` + worktree at `/tmp/jetson-snapshot` serving on port 3001
- Demo-mode bypass: when `NEXTAUTH_SECRET` is unset, auth gate is skipped and the seeded data is the source of truth. Turn off via Settings → Integrations → Demo data card once Supabase is wired.
