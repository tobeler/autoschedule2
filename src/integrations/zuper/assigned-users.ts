// =============================================================
// Match Zuper job assigned_users → our job_slots.
//
// A Zuper job has `assigned_to[]` — each entry is one user with a
// `designation` (e.g. "Team Lead", "Electrician-Sub", "Apprentice").
// Our local `job_slots` rows for the same job carry a `role` enum
// (`hvac_lead`, `electrician`, etc.) — see `data/seed.ts` JOB_TEMPLATES.
//
// Mapping pipeline:
//   1. Resolve a personId for each Zuper user via the deterministic
//      `zup-user-<user_uid>` convention used by bootstrap-technicians.
//   2. Resolve a role for that user. Prefer the role we already stored
//      in `person_roles` (the source of truth — `bootstrap-technicians`
//      already mapped Zuper's `designation` → RoleKey). Fall back to
//      `mapDesignation(designation)` for users not in our `people` table
//      (back-office / dispatch / non-field people that the technician
//      sync filtered out — they shouldn't bind to a slot anyway).
//   3. Walk slots in `sortOrder` ascending; for each user, find the first
//      compatible unfilled slot. "Compatible" = role match. Levels are
//      ignored (templates encode minimum level; Zuper data doesn't carry
//      level reliably enough to gate on).
//
// Output: a list of `{ slotId, personId }` updates and a list of
// `unmatched` Zuper users with the reason — both are exposed so the
// caller can log + report coverage.
//
// READ-ONLY against Zuper: this module receives an already-fetched
// ZuperJob and produces in-memory mappings. No external IO.
// =============================================================

import type { ZuperJob, ZuperUser } from './types';
import { mapDesignation } from './bootstrap-technicians';

export interface SlotLite {
  id: string;
  role: string;
  sortOrder: number;
}

export interface PersonLite {
  id: string;
  role: string;
}

export interface SlotAssignment {
  slotId: string;
  personId: string;
}

export interface UnmatchedUser {
  userUid: string;
  name: string;
  designation: string | null;
  reason: 'no_local_person' | 'no_matching_slot';
}

export interface MatchResult {
  assignments: SlotAssignment[];
  unmatched: UnmatchedUser[];
}

/**
 * Returns the deterministic local people.id for a Zuper user_uid.
 * Convention set by `bootstrapTechniciansFromZuper`. Keep them in sync.
 */
export function personIdForZuperUser(userUid: string): string {
  return 'zup-user-' + userUid;
}

/**
 * Walks a Zuper job's assigned_to[] and matches each user to an
 * available slot of compatible role.
 *
 * @param zJob       Zuper job with the `assigned_to[]` shape.
 * @param slots      Slots for the corresponding local job. Order matters:
 *                   slots will be considered in `sortOrder` ascending.
 * @param peopleById Map of our local people, keyed by their id.
 *                   Used to resolve a known role per person; users not
 *                   in this map are still considered (we fall back to
 *                   their Zuper designation) but flagged.
 */
export function matchAssignedUsersToSlots(
  zJob: ZuperJob,
  slots: SlotLite[],
  peopleById: Map<string, PersonLite>,
): MatchResult {
  const assignments: SlotAssignment[] = [];
  const unmatched: UnmatchedUser[] = [];
  const sortedSlots = [...slots].sort((a, b) => a.sortOrder - b.sortOrder);
  const usedSlotIds = new Set<string>();
  const usedPersonIds = new Set<string>();

  const assignees = zJob.assigned_to ?? [];

  for (const entry of assignees) {
    const user = (entry as { user: ZuperUser }).user;
    if (!user || !user.user_uid) continue;
    if (user.is_active === false || user.is_deleted === true) continue;

    const personId = personIdForZuperUser(user.user_uid);

    // De-dup: Zuper occasionally lists the same user twice on a job
    // (e.g. two team memberships). Only bind once.
    if (usedPersonIds.has(personId)) continue;

    const localPerson = peopleById.get(personId);
    const role = localPerson?.role ?? mapDesignation(user.designation).role;
    const userLabel = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.user_uid;

    if (!localPerson) {
      // We still know their role from designation, but they aren't in the
      // field-crew people table → can't bind (FK would fail). Flag and move on.
      unmatched.push({
        userUid: user.user_uid,
        name: userLabel,
        designation: user.designation ?? null,
        reason: 'no_local_person',
      });
      continue;
    }

    // Find the first unfilled slot whose role matches.
    const slot = sortedSlots.find(
      (s) => !usedSlotIds.has(s.id) && s.role === role,
    );
    if (!slot) {
      unmatched.push({
        userUid: user.user_uid,
        name: userLabel,
        designation: user.designation ?? null,
        reason: 'no_matching_slot',
      });
      continue;
    }

    assignments.push({ slotId: slot.id, personId });
    usedSlotIds.add(slot.id);
    usedPersonIds.add(personId);
  }

  return { assignments, unmatched };
}
