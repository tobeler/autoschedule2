// =============================================================
// Job-slot template resolver for Zuper-imported jobs.
//
// A Zuper job is a single time window (start..end) with one
// `type` slug (e.g. "heatpump", "walkthrough"). Different roles
// inside that window have different shapes — on a heat-pump
// install the lead + installer are there for the full 8 hours
// but the electrician is only on for 3, starting 4 hours in.
//
// JOB_TEMPLATES in src/data/seed.ts encodes the canonical
// shapes. This module maps our `jobs.type` slugs to the
// template key and produces ready-to-insert rows for the
// `job_slots` table.
// =============================================================

import { JOB_TEMPLATES } from '../../data/seed';
import type { jobSlots as jobSlotsTable } from '../../db/schema';

type JobSlotInsert = typeof jobSlotsTable.$inferInsert;

// jobs.type slug → JOB_TEMPLATES key. Slugs not in the map produce
// no slots (e.g. permits, board items, training — they don't have
// a crew-composition shape, just a single attendee).
const TYPE_TO_TEMPLATE: Record<string, keyof typeof JOB_TEMPLATES> = {
  heatpump: 'heatpump',
  walkthrough: 'walkthrough',
  callback: 'callback',
  water_heater: 'water',
  electrical: 'electrical',
  ev: 'electrical',
  // Follow-up visits + estimates + inspections are short single-tech
  // touches — the walkthrough template fits (1× FSM, 1.5h).
  followup: 'walkthrough',
  estimate: 'walkthrough',
  inspection: 'walkthrough',
  // Repairs of any flavor get the service shape (1× installer, 2h).
  'repair-general-legacy': 'service',
  'repair-service-care': 'service',
  'repair-customer-pay': 'service',
  additional: 'service',
  // Warranty repairs have their own shape (same hours, distinct in reports).
  'repair-install-warranty': 'warranty',
  // Meetings / training / permits get no slots — they're attendance,
  // not field work.
};

/**
 * Given a job id + type + start hour, produce the rows to insert into
 * the `job_slots` table. Returns an empty array when the type has no
 * matching template (permits, internal board items, training).
 *
 * `startHourBase` is the job's startHour (in fractional hours, e.g. 8 for
 * 8am). Each slot's `startOffsetHours` is relative to that base, so an
 * electrician with start=4 on an 8am install is scheduled to arrive at
 * 12pm. We don't add the offset here — that math lives in the renderer.
 */
export function buildJobSlotsForJob(
  jobId: string,
  type: string | null | undefined,
): JobSlotInsert[] {
  if (!type) return [];
  const templateKey = TYPE_TO_TEMPLATE[type];
  if (!templateKey) return [];
  const template = JOB_TEMPLATES[templateKey];
  if (!template || template.slots.length === 0) return [];
  return template.slots.map((slot, idx) => ({
    // Deterministic id so re-imports don't create duplicate slot rows.
    // (jobId, role, idx) is unique within a job.
    id: `${jobId}::slot-${idx}-${slot.role}`,
    jobId,
    role: slot.role,
    level: slot.level,
    hours: String(slot.hours),
    startOffsetHours: String(slot.start ?? 0),
    optional: Boolean(slot.optional),
    assignedTo: null,
    suggested: false,
    sortOrder: idx,
  }));
}
