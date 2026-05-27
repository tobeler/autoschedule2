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

## Working style

- **Default to dispatching subagents for bounded work.** Erik prefers parallel execution. For any task that can be specified with a clear input/output contract and doesn't depend on the current conversation's working state, spawn a subagent rather than doing it serially. Examples that should ALWAYS be delegated:
  - Bootstrap / import flows from external systems (Zuper, HubSpot, etc.)
  - Codebase exploration / archaeology spanning more than 3 files
  - External docs lookups
  - Refactors confined to a known set of files
  - Schema migrations + their accompanying code updates
- Brief the subagent fully: API endpoints, env var names, mapping rules, edge cases to handle, files to touch, what NOT to touch, and the verification step they should run. Pull patterns from existing files when relevant (e.g. mirror `src/integrations/zuper/bootstrap-technicians.ts` shape).
- Run multiple subagents in parallel when they don't overlap on the same files. They report back when done.
- **Read-only mode is currently in effect** for both HubSpot and Zuper. Subagents must not call write endpoints (PATCH/POST/DELETE) on either system. Local DB writes are fine.

## Stack reminders

- Next.js 15 (App Router) + Drizzle ORM + Supabase Postgres (deferred — currently runs on localStorage in demo mode)
- NextAuth v5 (not Supabase Auth — chosen for AWS-portability)
- Hono REST API at `/api/v1/*` + OpenAPI 3.x doc at `/api/docs`
- Zustand store with optimistic + API write-through + rollback toast — the established mutation pattern
- Outbox table is **dormant** (2026-05-26): triggers disabled, table truncated. The original SNS-bridge rationale was forward-looking for an AWS migration that isn't on the near roadmap. Integrations now call HubSpot/Zuper directly from API mutation handlers with try/catch + toast on failure. If you re-enable the outbox later, fix the schema mismatch first (DB trigger writes `payload.id`; drainer reads `payload.jobId`).

## Demo + dev

- `pnpm dev` → http://localhost:3010 (live, hot-reloads main)
- Frozen demo: tag `demo-snapshot-N` + worktree at `/tmp/jetson-snapshot` serving on port 3001
- Demo-mode bypass: when `NEXTAUTH_SECRET` is unset, auth gate is skipped and the seeded data is the source of truth. Turn off via Settings → Integrations → Demo data card once Supabase is wired.
