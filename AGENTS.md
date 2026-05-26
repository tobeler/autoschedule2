# Jetson Schedule + Dispatch — agent notes

Reading order for any AI agent (or human dev) joining this repo:

1. **`HANDOFF.md` §0 (Session-end state 2026-05-26)** — single most important section. Tells you live row counts, env state, open tasks, the three architectural decisions (`§0.3 / §0.4 / §0.5`), and reading order. Skim §1–§6 only if §0 sends you there.
2. **`docs/plans/2026-05-26-001-feat-zuper-integration-plan.md`** — Zuper integration plan. Most of Phases A–B landed; Phase C (writeback) is designed but not built. The plan documents the architectural reasoning AND the rebate-dashboard writeback patterns.
3. **`/Users/work/.claude/plans/curious-toasting-sifakis.md`** — the 19-phase implementation plan with architectural decisions and HubSpot field-mapping tables. Pre-Supabase-go-live context.
4. **`design-source/schedule-dispatch/chats/chat{1,2,3,4}.md`** — four UX iteration sessions. Tells you WHY the UI looks the way it does.
5. **`src/types.ts`** — the schema. Then `src/App.tsx` to orient in the code.

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
