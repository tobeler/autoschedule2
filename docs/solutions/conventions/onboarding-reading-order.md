---
title: "Onboarding reading order for AI agents joining the Jetson FSM codebase"
date: 2026-05-22
problem_type: convention
module: documentation
tags:
  - onboarding
  - agents
  - documentation
  - workflow
  - handoff
category: conventions
applies_when: "A new AI agent (or human dev) is dropped into the Jetson Schedule + Dispatch repo and needs to ramp up fast without trial-and-error."
---

# Onboarding reading order

## Context

This codebase has unusual provenance. It started as a Claude Design handoff bundle (~16k LOC of React+Babel prototype, four chat-transcript iteration sessions, full CSS design system), got ported to Next.js + Drizzle + Hono in 19 phases over a single multi-day session, and is intentionally portable to Jetson's AWS production stack (RDS, Cognito/NextAuth, ECS, CloudFront, Sentry, SNS/SQS) once the MVP validates. None of that history is obvious from the file tree.

A fresh agent that just opens `src/App.tsx` and starts editing will:
- not know which architectural choices are load-bearing (Drizzle ORM, NextAuth, Hono, outbox table) vs which are accidents
- not know that `design-source/` is the canonical reference for UX intent — not the implemented code
- miss that real Jetson HubSpot fields are baked into `src/integrations/hubspot/field-map-defaults.ts` and shouldn't be regenerated from scratch
- waste tokens re-deriving what the plan file already records

This convention defines the reading order that gets an agent productive in ~30–45 minutes.

## Guidance

Read in tiers. Don't skip tiers. Each tier explains the WHY of the next.

### Tier 1 — what state are we in? (15 min)

1. **`HANDOFF.md`** — operator-facing punch list. What's done, what's running, what the user needs to do next (Supabase provisioning, HubSpot token, Vercel deploy). Single source of truth for "current state."
2. **`README.md`** — stack, env vars, dev commands, deploy steps, runbook.
3. **`/Users/work/.claude/plans/curious-toasting-sifakis.md`** — the 19-phase implementation plan. **Most valuable single document.** Records every architectural decision and why; concrete HubSpot field-mapping tables; what was deferred and why. If you're going to skim anything, skim this.

### Tier 2 — understand the domain (20 min)

4. **`design-source/schedule-dispatch/README.md`** — the original Claude Design handoff brief.
5. **`design-source/schedule-dispatch/chats/chat{1,2,3,4}.md`** — four iteration sessions where the user refined the UX. Tells you WHY drag fidelity / loan blocks / multi-day jobs / projects layer / vehicle modes / HubSpot field mapper look the way they do. Don't reinvent — extend.
6. **`src/types.ts`** — the schema. Every entity in the domain in <300 lines.
7. **`src/data/seed.ts`** — what realistic Jetson data looks like (real trucks, real crews, real customer addresses).

### Tier 3 — orient in the code (10 min)

8. **`src/App.tsx`** — the shell. Trace nav → views → modals from here.
9. **`src/store.ts`** — Zustand store. Every mutation lives here; views call these actions; optimistic + API write-through + rollback toast is the established pattern.
10. **`src/db/schema.ts`** — Drizzle source-of-truth for Postgres. Mirrors `types.ts` but with FK relationships + the **outbox** table (the SNS bridge for the eventual AWS migration).
11. **`src/api/app.ts`** + **`src/api/routes/`** — Hono REST API at `/api/v1/*`. The OpenAPI doc viewer at `/api/docs` is the best surface for browsing endpoints.

### Tier 4 — only if touching HubSpot

12. **`src/integrations/hubspot/schema-snapshot.json`** — frozen Jetson portal schema (portal 21424670). Don't re-derive.
13. **`src/integrations/hubspot/field-map-defaults.ts`** — typed field mappings grounded in the real portal's properties.
14. **`/tmp/hubspot_research/*.json`** — raw schema dumps if you need to verify a field shape.

### Tier 5 — bookmark

15. **`.claude/projects/-Users-work-Documents-AutoSchedule/memory/MEMORY.md`** — Claude Code memory with project context (auto-loaded in Claude Code, manually reference elsewhere).
16. **`docs/solutions/`** — solved-problem documentation as it accumulates. Search before re-debugging.

## Why this matters

Three reasons the order isn't arbitrary:

1. **HANDOFF + plan first** — without them, you'll burn ~30 min reverse-engineering what was already decided. The plan records intentional trade-offs (Drizzle ORM over `supabase-js` for AWS portability, NextAuth over Supabase Auth for the same reason, outbox table for the SNS bridge, demo-mode bypass when `NEXTAUTH_SECRET` is unset). Without that context, an agent might "simplify" load-bearing choices and break the production migration path.

2. **`design-source/chats/` before code** — the visible UI is dense with deliberate UX decisions (loan blocks for cross-crew assignments, multi-day job badges, project-pipeline-stage sync, "Open in HubSpot" affordances). The chat transcripts record what was tried and discarded. Reading code without context invites re-litigation of decisions the user has already made.

3. **`types.ts` before any view** — the domain has 20+ entities with non-obvious relationships (Job has `crewId` AND `extraCrewIds`; Person has `roles[]` AND `level`; Project has both `hubspotDealId` and `hubspotProjectId`; Crew can be the primary on a Job while individual members can be on loan from other Crews). Touching a view before knowing the schema produces type errors that the build catches but waste a turn.

## When to apply

Every fresh agent session that's going to touch this codebase non-trivially. Skip the orientation only if:
- You're applying a one-line fix specified verbatim by the user
- You're already in the middle of a session that did this onboarding
- The user explicitly says "skip the plan, just do X"

For a session-to-session handoff (one agent finishing, another starting), the leaving agent should leave a one-paragraph status summary on top of the existing HANDOFF.md so the next agent doesn't have to re-derive in-flight state.

## Examples

**Good orientation prompt to give the next agent:**

> Read `HANDOFF.md` first for current state, then `/Users/work/.claude/plans/curious-toasting-sifakis.md` for the architectural plan. The `design-source/schedule-dispatch/chats/chat{1,2,3,4}.md` files have UX intent. After that, `src/types.ts` and `src/App.tsx` orient you in the code. Demo runs on `pnpm dev` (port 3000); frozen production snapshot at `pnpm exec next start -p 3001` from the worktree at `/tmp/jetson-snapshot`. The `docs/solutions/` directory has solved-problem documentation — search there before debugging something that smells like a known issue.

**Bad orientation prompt:**

> Look at the repo and figure out what needs to be done.

(Wastes ~30 min on context-deriving that the plan file already records.)

**Bad agent first move:**

> Open `src/App.tsx` and start editing.

(Loses the WHY behind every architectural choice; risks "simplifying" decisions like the outbox table or the NextAuth-instead-of-Supabase-Auth choice that exist for forward-portability to Jetson's AWS stack.)
