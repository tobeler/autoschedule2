// =============================================================
// One-shot Zuper → AutoSchedule technician (people) bootstrap.
//
// FIELD CREW ONLY. Pulls Zuper teams whose names look like a
// regional install/float/sub team (`BC-`, `CO-`, `MA-`, `NY-`)
// and excludes office / admin / dispatch teams. The dispatcher
// only schedules field crew, so the previous "everyone in Zuper"
// import (148 people) was too broad — we want ~30-50.
//
// Source-of-truth: `listTeams()` returns each team with an
// inline `users[]` array, so we DON'T need a per-team fetch.
//
// Mapping decisions (locked with Erik on 2026-05-26):
//  - id          = 'zup-user-' + user_uid (deterministic).
//  - name        = first_name + ' ' + last_name, trimmed.
//  - initials    = first letter of first + first letter of last
//                  (uppercase), with a 2-char fallback when
//                  either part is empty.
//  - level + role = derived from the Zuper `designation` field
//                   via DESIGNATION_TO_ROLE below. The mapper
//                   defaults unknown designations to
//                   role=hvac_installer / level=L2 — Erik will
//                   edit any wrong rows in-app.
//  - zuperPrimaryTeam = the first matching team the user appears
//                       in (teams iterated in the order Zuper
//                       returns them — install teams generally
//                       come before float/sub).
//  - defaultCrewId = NULL.
//  - certs       = NULL.
//
// Transaction wipes `people` (and `person_roles` via cascade,
// plus an explicit DELETE for clarity) before re-inserting so
// the table reflects the current Zuper team membership exactly.
// =============================================================

import { db } from '@/lib/db';
import { people, personRoles } from '@/db/schema';

import { isZuperConfigured, listTeams, ZuperConfigError } from './client';
import type { ZuperTeam, ZuperUser } from './types';

type RoleKey =
  | 'hvac_lead'
  | 'hvac_installer'
  | 'apprentice'
  | 'electrician'
  | 'plumber'
  | 'fsm';

type Level = 'L1' | 'L2' | 'L3';

export interface BootstrapTechniciansResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  /** Total team rows pulled from Zuper. */
  pulledTeams: number;
  /** Total user rows seen across kept teams (pre-dedup). */
  pulled: number;
  /** Unique users after filtering + dedup — what we actually write. */
  activeKept: number;
  /** Number of `people` rows we INSERTed. */
  upserted: number;
  /** Role distribution across the inserted rows. */
  byRole: Record<RoleKey, number>;
  /** Names of the Zuper teams we kept (for the response panel). */
  keptTeams: string[];
  errors: string[];
}

/** Teams whose names start with one of these regional prefixes are field crew. */
const INCLUDE_REGEX = /^(BC|CO|MA|NY)-/i;
/**
 * Even when the name starts with a region prefix, any of these tokens
 * disqualifies it: office staff, admins, and dispatch teams are NOT in
 * the dispatcher's pool. (Dispatch teams happen to start with "Dispatch "
 * today, so the include regex skips them already — keeping the token
 * here for future-proofing if Zuper renames them.)
 */
const EXCLUDE_REGEX = /(office|admin|dispatch)/i;

function shouldIncludeTeam(name: string): boolean {
  return INCLUDE_REGEX.test(name) && !EXCLUDE_REGEX.test(name);
}

/**
 * Designation → role + skill-level mapping. Keys are the canonical Zuper
 * `designation` strings; lookup is case-insensitive (see `mapDesignation`).
 *
 * Anything missing falls through to the default `hvac_installer` / `L2`.
 * Erik reviews + corrects in-app, so being conservative here is fine.
 */
const DESIGNATION_TO_ROLE: Record<string, { role: RoleKey; level: Level }> = {
  // HVAC ladder
  'hvac team lead': { role: 'hvac_lead', level: 'L3' },
  'team lead': { role: 'hvac_lead', level: 'L3' },
  'lead installer': { role: 'hvac_lead', level: 'L3' },
  'hvac lead': { role: 'hvac_lead', level: 'L3' },
  'hvac installer': { role: 'hvac_installer', level: 'L2' },
  installer: { role: 'hvac_installer', level: 'L2' },
  'heat pump service tech': { role: 'hvac_installer', level: 'L2' },
  'hvac subcontractor': { role: 'hvac_installer', level: 'L2' },
  subcontractor: { role: 'hvac_installer', level: 'L2' },
  'hvac apprentice': { role: 'apprentice', level: 'L1' },
  apprentice: { role: 'apprentice', level: 'L1' },

  // Electrical ladder
  electrician: { role: 'electrician', level: 'L2' },
  'electrician-sub': { role: 'electrician', level: 'L2' },
  'electrical specialist': { role: 'electrician', level: 'L2' },
  'master electrician': { role: 'electrician', level: 'L3' },

  // Plumbing
  plumber: { role: 'plumber', level: 'L2' },

  // Field-sales / management
  'field service manager': { role: 'fsm', level: 'L2' },
  'field sales manager': { role: 'fsm', level: 'L2' },
  fsm: { role: 'fsm', level: 'L2' },
  // General Manager → treated as FSM/L3 so they land in the dispatcher pool
  // with manager-level skill; flagged in the report so Erik can re-classify.
  'general manager': { role: 'fsm', level: 'L3' },
};

export function mapDesignation(d: string | undefined | null): {
  role: RoleKey;
  level: Level;
} {
  const key = (d ?? '').trim().toLowerCase();
  if (key && DESIGNATION_TO_ROLE[key]) return DESIGNATION_TO_ROLE[key];
  return { role: 'hvac_installer', level: 'L2' };
}

function buildInitials(firstName: string, lastName: string, fullName: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  const compact = fullName.replace(/\s+/g, '');
  return (compact + 'XX').slice(0, 2).toUpperCase();
}

/**
 * Walk every kept team's `users[]`, dedup by `user_uid`, and remember the
 * FIRST team each user is seen in as their primary team. We don't pick
 * "lowest numeric suffix" — Zuper returns install teams (CO-DE-1, CO-DE-2)
 * before float/sub in the same payload, which produces the intuitive answer
 * without any sorting cost.
 */
function collectKeptUsers(teams: ZuperTeam[]): {
  users: Map<string, { user: ZuperUser; primaryTeam: string }>;
  keptTeamNames: string[];
  rawCount: number;
} {
  const users = new Map<string, { user: ZuperUser; primaryTeam: string }>();
  const keptTeamNames: string[] = [];
  let rawCount = 0;

  for (const team of teams) {
    if (!shouldIncludeTeam(team.team_name)) continue;
    keptTeamNames.push(team.team_name);
    const members = team.team_members ?? (team as unknown as { users?: { user_uid: string }[] }).users ?? [];
    for (const m of members) {
      // /team returns `users: [{ user_uid, ... }]` — flat user shape.
      // /team/{uid} occasionally wraps as `{ user: {...} }`; handle both.
      const u = ((m as unknown) as { user?: ZuperUser; user_uid?: string }).user
        ?? ((m as unknown) as ZuperUser);
      if (!u || !u.user_uid) continue;
      rawCount += 1;
      if (u.is_deleted === true) continue;
      if (u.is_active === false) continue;
      if (!users.has(u.user_uid)) {
        users.set(u.user_uid, { user: u, primaryTeam: team.team_name });
      }
    }
  }
  return { users, keptTeamNames, rawCount };
}

export async function bootstrapTechniciansFromZuper(): Promise<BootstrapTechniciansResult> {
  const result: BootstrapTechniciansResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    pulledTeams: 0,
    pulled: 0,
    activeKept: 0,
    upserted: 0,
    byRole: {
      hvac_lead: 0,
      hvac_installer: 0,
      apprentice: 0,
      electrician: 0,
      plumber: 0,
      fsm: 0,
    },
    keptTeams: [],
    errors: [],
  };

  if (!isZuperConfigured()) {
    result.errors.push('ZUPER_API_KEY not configured');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  let teams: ZuperTeam[];
  try {
    teams = await listTeams();
    result.pulledTeams = teams.length;
  } catch (err) {
    result.errors.push(
      err instanceof ZuperConfigError
        ? err.message
        : 'Zuper fetch: ' + (err as Error).message,
    );
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const { users, keptTeamNames, rawCount } = collectKeptUsers(teams);
  result.keptTeams = keptTeamNames;
  result.pulled = rawCount;
  result.activeKept = users.size;

  try {
    await db.transaction(async (tx) => {
      // Wipe the table so it mirrors Zuper exactly. person_roles cascades on
      // the people FK, but DELETE it explicitly first so the intent is obvious
      // in audit logs and future readers don't have to remember the cascade.
      await tx.delete(personRoles);
      await tx.delete(people);

      for (const [, { user, primaryTeam }] of users) {
        const first = (user.first_name ?? '').trim();
        const last = (user.last_name ?? '').trim();
        const name = `${first} ${last}`.trim();
        if (!name) {
          result.errors.push(`User ${user.user_uid}: empty name, skipped`);
          continue;
        }
        const initials = buildInitials(first, last, name);
        const id = 'zup-user-' + user.user_uid;
        const { role, level } = mapDesignation(user.designation);

        try {
          await tx.insert(people).values({
            id,
            name,
            initials,
            level,
            defaultCrewId: null,
            certs: null,
            zuperPrimaryTeam: primaryTeam,
          });
          await tx.insert(personRoles).values({ personId: id, role });
          result.upserted += 1;
          result.byRole[role] += 1;
        } catch (err) {
          result.errors.push(`User ${user.user_uid}: ${(err as Error).message}`);
        }
      }
    });
    result.ok = result.errors.length === 0;
  } catch (err) {
    result.errors.push('Write phase: ' + (err as Error).message);
  }

  result.finishedAt = new Date().toISOString();
  return result;
}
