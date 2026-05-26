// =============================================================
// One-time Zuper → AutoSchedule technician (people) bootstrap.
//
// Pulls every active, non-deleted user from Zuper's /user/all
// endpoint and upserts them into our `people` table so the
// dispatcher has a starting roster.
//
// This is NOT a recurring sync — same pattern as
// `./bootstrap.ts` for jobs. POSTed once from the integrations
// page after a fresh DB. Idempotent: re-running updates name
// + initials without churning ids.
//
// Mapping decisions (locked with Erik on 2026-05-26):
//  - id          = 'zup-user-' + user_uid (deterministic).
//  - name        = first_name + ' ' + last_name, trimmed.
//  - initials    = first letter of first + first letter of last
//                  (uppercase). Falls back to first 2 chars of
//                  the name when either part is empty.
//  - level       = 'L2' as a sensible default. We deliberately
//                  do NOT infer skill level from Zuper's
//                  `designation` field — that's role taxonomy,
//                  not skill level. The dispatcher edits later.
//  - defaultCrewId = NULL. Teams pulled previously did not
//                    auto-create crews; matching principle here.
//  - certs       = NULL. Filled by the dispatcher.
//
// Role taxonomy (person_roles) is intentionally left untouched —
// the join table stays empty for this pass. We'll wire roles in
// a later iteration once the role-mapping rubric is settled.
// =============================================================

import { db } from '@/lib/db';
import { people } from '@/db/schema';

import { isZuperConfigured, listUsers, ZuperConfigError } from './client';
import type { ZuperUser } from './types';

export interface BootstrapTechniciansResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  activeKept: number;
  upserted: number;
  errors: string[];
}

function buildInitials(firstName: string, lastName: string, fullName: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  // Fallback: first 2 chars of the joined name, uppercased. Pad with 'X'
  // if the name itself is shorter than 2 chars (would only happen on
  // malformed Zuper data, but `initials` is NOT NULL in our schema).
  const compact = fullName.replace(/\s+/g, '');
  const fallback = (compact + 'XX').slice(0, 2).toUpperCase();
  return fallback;
}

export async function bootstrapTechniciansFromZuper(): Promise<BootstrapTechniciansResult> {
  const result: BootstrapTechniciansResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    pulled: 0,
    activeKept: 0,
    upserted: 0,
    errors: [],
  };

  if (!isZuperConfigured()) {
    result.errors.push('ZUPER_API_KEY not configured');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  let zUsers: ZuperUser[];
  try {
    zUsers = await listUsers();
    result.pulled = zUsers.length;
  } catch (err) {
    result.errors.push(
      err instanceof ZuperConfigError
        ? err.message
        : 'Zuper fetch: ' + (err as Error).message,
    );
    result.finishedAt = new Date().toISOString();
    return result;
  }

  // Keep only active, non-deleted users. Older fields default to true/false
  // when missing so we don't drop tenants whose API responses lack the flag.
  const activeUsers = zUsers.filter((u) => {
    const active = u.is_active !== false;
    const deleted = u.is_deleted === true;
    return active && !deleted;
  });
  result.activeKept = activeUsers.length;

  try {
    await db.transaction(async (tx) => {
      for (const u of activeUsers) {
        const first = (u.first_name ?? '').trim();
        const last = (u.last_name ?? '').trim();
        const name = `${first} ${last}`.trim();
        if (!name) {
          result.errors.push(`User ${u.user_uid}: empty name, skipped`);
          continue;
        }
        const initials = buildInitials(first, last, name);
        const id = 'zup-user-' + u.user_uid;

        try {
          await tx
            .insert(people)
            .values({
              id,
              name,
              initials,
              level: 'L2',
              defaultCrewId: null,
              certs: null,
            })
            .onConflictDoUpdate({
              target: people.id,
              set: {
                name,
                initials,
                updatedAt: new Date(),
              },
            });
          result.upserted += 1;
        } catch (err) {
          result.errors.push(`User ${u.user_uid}: ${(err as Error).message}`);
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
