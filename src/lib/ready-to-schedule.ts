// =============================================================
// ready-to-schedule — port of rebate-dashboard's "To Be Scheduled"
// tab rules to autoschedule2's data model.
//
// The truth-of-record for "what needs to be scheduled" lives in
// rebate-dashboard (the project-coordinator tool). Until now this
// app used a looser predicate (isActionableUnscheduledJob in
// lib/dispatch-work.ts) that didn't agree with rebate-dashboard for
// rows with stale scheduledDate, follow-up/reschedule status, or
// sibling Zuper jobs already booked.
//
// Source predicates (read-only reference):
//   samuellegge/rebate-dashboard/public/pc-dashboard.js
//     rowIsScheduledOrLater(row), categorizeRow(inst), classifyJob(job)
//     isZuperNeedsReschedule(status), rowHasScheduledSibling(row)
//   samuellegge/rebate-dashboard/lib/ready-to-schedule.js (server port)
//
// The port is pure: no I/O, no React, no store. Two exported
// predicates over local typed entities — `isReadyToSchedule` for the
// boolean gate and `whyNotReady` for surfacing blocker reasons in
// the UI.
//
// 2026-05-27 — replaced the static `DISPATCHABLE_TYPES` Set with a
// `categorizeJob()` function modeled on rebate-dashboard's
// `categorizeRow()` + server `classifyJob()`. The big behavior change:
// jobs with `type === 'estimate'` are now EXCLUDED (sales estimates
// have their own surface in rebate-dashboard, not the dispatch queue).
// =============================================================

import type { Customer, Job, Project } from '../types';

// rebate-dashboard's COMPLETED_ZUPER_STATUSES + SCHEDULED_OR_LATER_STATUSES
// collapse into our own JobStatus enum (mapped by
// integrations/zuper/field-map-defaults.ts on import). Anything that means
// "Zuper already has a booking" lives here.
const SCHEDULED_OR_LATER_STATUSES = new Set<Job['status']>([
  'scheduled',
  'enroute',
  'onsite',
]);

const COMPLETED_STATUSES = new Set<Job['status']>([
  'complete',
  'cancelled',
]);

// rebate-dashboard's `isZuperNeedsReschedule` matches the "Follow-up /
// Reschedule" status_name (FOLLOW_UP_SAME_JOB). Our Zuper status mapper
// routes FOLLOW_UP and FOLLOW_UP_SAME_JOB to our `callback` enum. So in
// our model, a callback whose date is null = needs reschedule.
function isCallbackNeedsReschedule(job: Pick<Job, 'status' | 'date'>): boolean {
  return job.status === 'callback' && !job.date;
}

export function isJobCompleted(job: Pick<Job, 'status'>): boolean {
  return COMPLETED_STATUSES.has(job.status);
}

export function isJobScheduledOrLater(job: Pick<Job, 'status'>): boolean {
  return SCHEDULED_OR_LATER_STATUSES.has(job.status);
}

// ---- Category model (port of rebate-dashboard `categorizeRow`) ----

/**
 * Categories that SHOULD appear on the dispatch "to be scheduled" surface.
 * Mirrors rebate-dashboard's `categorizeRow()` buckets that flow into the
 * To Be Scheduled tab: installation work-phase rows (heat-pump / electrical
 * / EV / water heater), service+repair, sub-contractor work, follow-ups,
 * and walkthroughs.
 */
export type ReadyCategory =
  | 'installation'
  | 'service'
  | 'repair'
  | 'followup'
  | 'walkthrough'
  | 'sub';

/**
 * Categories that are tracked in our system but should NOT land on the
 * dispatch queue. Estimates have their own sales surface; inspections /
 * permits are bookkeeping; meeting+training are internal admin.
 */
export type ExcludedCategory =
  | 'estimate'
  | 'inspection'
  | 'permit'
  | 'admin'
  | 'other';

export type JobCategory = ReadyCategory | ExcludedCategory;

const SCHEDULABLE_CATEGORIES: ReadonlySet<ReadyCategory> = new Set<ReadyCategory>([
  'installation',
  'service',
  'repair',
  'followup',
  'walkthrough',
  'sub',
]);

/**
 * Map our `Job.type` slug → category bucket.
 *
 * Port of rebate-dashboard `categorizeRow()` (public/pc-dashboard.js:166) +
 * server `classifyJob()` (pc-dashboard.js:747). Our Job.type values come
 * out of `integrations/zuper/field-map-defaults.ts::mapZuperCategory()`, so
 * the mapping below mirrors how rebate-dashboard's `categorizeRow` would
 * bucket the same Zuper categories.
 *
 * Mapping rationale (see README at bottom of file):
 *   heatpump, water_heater, electrical, ev, retrofit → installation
 *   walkthrough → walkthrough
 *   callback, followup → followup
 *   repair-*, additional → repair (regex `/^repair/i` on the slug)
 *   sub → sub
 *   service, warranty → service
 *   estimate → estimate (EXCLUDED — sales surface)
 *   inspection → inspection (EXCLUDED — bookkeeping)
 *   *-permit, *-inspection (Zuper permit/inspection categories) → permit/inspection
 *   meeting, training, jetson-* internal categories → admin
 *   anything else → other
 */
export function categorizeJob(job: Pick<Job, 'type'>): JobCategory {
  const t = (job.type || '').toLowerCase();

  // Walkthrough — only real-work walkthroughs, not internal "walkthrough"
  // training meetings.
  if (t === 'walkthrough') return 'walkthrough';

  // Follow-up bucket (rebate-dashboard: jobType === 'followup' OR
  // category matches /follow.?up/). We map both `followup` and `callback`
  // here — our `callback` enum is how the Zuper FOLLOW_UP_SAME_JOB status
  // surfaces (see field-map-defaults.ts mapZuperStatus).
  if (t === 'callback' || t === 'followup' || /follow.?up/.test(t)) {
    return 'followup';
  }

  // Sub-contractor work — first-class dispatch bucket.
  if (t === 'sub') return 'sub';

  // Estimates — explicit exclusion. Rebate-dashboard doesn't surface
  // sales estimates in the "To Be Scheduled" tab; they have their own
  // sales-side flow.
  if (t === 'estimate') return 'estimate';

  // Inspections — Zuper "In Person Inspection" + the various permit
  // inspection types (gas-inspection, heating-or-mech-inspection, etc).
  if (t === 'inspection' || /inspection$/.test(t)) return 'inspection';

  // Permits — bookkeeping rows that don't reflect a field visit.
  if (/permit$/.test(t)) return 'permit';

  // Admin / internal — meetings, training, board items, internal-process rows.
  if (t === 'meeting' || t === 'training' || /^jetson-/.test(t)) {
    return 'admin';
  }

  // Repair — rebate-dashboard uses /^repair/i on the slug; we follow the
  // same regex shape so `repair-general-legacy`, `repair-service-care`,
  // `repair-customer-pay`, `repair-install-warranty`, and the bare `repair`
  // category all bucket together.
  if (/^repair/.test(t)) return 'repair';

  // Service — "Additional Work" (the Zuper category) is service-style
  // follow-on work that needs dispatch. Plus our `service` + `warranty`
  // enum values for legacy / care-plus jobs.
  if (t === 'additional' || t === 'service' || t === 'warranty') {
    return 'service';
  }

  // Installation work-phase buckets (rebate-dashboard splits this into
  // heat-pump / electrical / retrofit based on SKU/category — we already
  // store the granular slug as Job.type. For the To Be Scheduled gate
  // they all just need to flow into "installation").
  if (
    t === 'heatpump' ||
    t === 'water_heater' ||
    t === 'water' ||
    t === 'electrical' ||
    t === 'ev' ||
    t === 'retrofit'
  ) {
    return 'installation';
  }

  return 'other';
}

/**
 * Walk the sibling jobs that share the same `projectId` (rebate-dashboard
 * walks `zuperJobsByInstall[hsId]`). Return true if any non-walkthrough
 * sibling is already in a scheduled-or-later state — that signal cascades
 * to the parent install row so we don't double-list it as "to be scheduled."
 *
 * Walkthrough siblings are explicitly ignored: a completed walkthrough is
 * what moves the install into Ready-for-Install, not evidence the install
 * itself is booked.
 */
function hasScheduledSibling(
  job: Pick<Job, 'projectId' | 'type' | 'id'>,
  siblingJobs: Array<Pick<Job, 'projectId' | 'type' | 'status' | 'date' | 'id'>>,
): boolean {
  if (!job.projectId) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return siblingJobs.some((s) => {
    if (s.id === job.id) return false;
    if (s.projectId !== job.projectId) return false;
    if (s.type === 'walkthrough' || s.type === 'followup') return false;
    if (isJobScheduledOrLater(s)) return true;
    if (s.date) {
      // Parse the local date string conservatively
      const d = new Date(s.date + 'T12:00:00');
      if (!Number.isNaN(d.getTime()) && d.getTime() >= today.getTime()) return true;
    }
    return false;
  });
}

/**
 * `rowIsScheduledOrLater` port. Treats "callback needs reschedule" as NOT
 * scheduled (the original booking fell through; the stored date is stale).
 */
export function isAlreadyScheduledOrLater(
  job: Pick<Job, 'status' | 'date' | 'projectId' | 'type' | 'id'>,
  siblingJobs: Array<Pick<Job, 'projectId' | 'type' | 'status' | 'date' | 'id'>>,
): boolean {
  if (isCallbackNeedsReschedule(job)) return false;
  if (isJobScheduledOrLater(job)) return true;
  if (job.date) return true;
  return hasScheduledSibling(job, siblingJobs);
}

// HubSpot installation stages that rebate-dashboard treats as "queue this
// up for the to-be-scheduled tab." Our `projects` table doesn't store the
// HubSpot stage id directly — we map it to our six-value ProjectStatus on
// sync. The closest equivalents in our enum are listed below; if a job has
// no project, we fall back to the job's own type to decide queue-eligibility.
const ACTIVE_QUEUE_PROJECT_STATUSES = new Set<Project['status']>([
  'proposed',
  'sold',
  'in_progress',
]);

/**
 * @deprecated Use `categorizeJob(job)` + `SCHEDULABLE_CATEGORIES` instead.
 *
 * Retained as a thin shim because external scripts or tests may still import
 * it. The set is now derived from the category mapping: a Job.type is
 * "dispatchable" iff it buckets to a SCHEDULABLE category.
 *
 * NOTE: this is a static SLUG set — for new code prefer the dynamic
 * `categorizeJob()` so newly-added Zuper categories route correctly without
 * a code edit here.
 */
export const DISPATCHABLE_TYPES: ReadonlySet<string> = new Set([
  'heatpump',
  'water_heater',
  'water',
  'electrical',
  'ev',
  'retrofit',
  'repair-general-legacy',
  'repair-service-care',
  'repair-customer-pay',
  'repair-install-warranty',
  'additional',
  'callback',
  'followup',
  'walkthrough',
  'sub',
]);

export interface ReadyContext {
  job: Pick<Job, 'id' | 'status' | 'date' | 'type' | 'projectId' | 'customer'>;
  project?: Pick<Project, 'status'> | null;
  customer?: Pick<Customer, 'address'> | null;
  /**
   * All jobs that might share this project (caller passes the full jobs
   * list; we filter by projectId internally). Used for sibling-aware
   * scheduling-state inheritance.
   */
  siblingJobs: Array<Pick<Job, 'projectId' | 'type' | 'status' | 'date' | 'id'>>;
}

/**
 * Boolean gate: should this job appear in the "to be scheduled" surface?
 *
 * Port of the readyCount predicate in rebate-dashboard public/pc-dashboard.js:
 *   !isZuperCompleted && !rowIsScheduledOrLater &&
 *   (installation_stage IN active queue || rowType === 'zuper')
 *
 * The type-gate is now category-based: `categorizeJob(job)` must fall in
 * `SCHEDULABLE_CATEGORIES`. This excludes estimates (sales surface),
 * inspections / permits (bookkeeping), and admin rows.
 */
export function isReadyToSchedule(ctx: ReadyContext): boolean {
  const { job, project, siblingJobs } = ctx;

  // Cancelled/completed work never appears.
  if (isJobCompleted(job)) return false;

  // Already booked in Zuper (or carrying a future scheduled date)?
  if (isAlreadyScheduledOrLater(job, siblingJobs)) return false;

  // Category gate: only schedulable buckets (installations, service, repair,
  // followups, walkthroughs, sub work). Estimates / inspections / permits /
  // admin are tracked but not surfaced here.
  if (!SCHEDULABLE_CATEGORIES.has(categorizeJob(job) as ReadyCategory)) return false;

  // If we have a linked project, gate on its lifecycle status. Without a
  // project link (common for Zuper-only repair/callback jobs) we accept
  // anything that survived the prior gates.
  if (project && !ACTIVE_QUEUE_PROJECT_STATUSES.has(project.status)) return false;

  return true;
}

export interface ReadyReason {
  /** Stable code for analytics / sorting */
  code:
    | 'completed'
    | 'cancelled'
    | 'already-scheduled'
    | 'scheduled-sibling'
    | 'date-already-set'
    | 'project-closed'
    | 'project-on-hold'
    | 'non-dispatchable-category';
  /** Short label safe to render as a chip */
  label: string;
}

/**
 * Why a job didn't pass `isReadyToSchedule`. Returns an empty array when
 * the job IS ready. Suitable for the "Held — see why" surface in the
 * unscheduled rail / Jobs view.
 */
export function whyNotReady(ctx: ReadyContext): ReadyReason[] {
  const { job, project, siblingJobs } = ctx;
  const out: ReadyReason[] = [];

  if (job.status === 'complete') out.push({ code: 'completed', label: 'Complete' });
  if (job.status === 'cancelled') out.push({ code: 'cancelled', label: 'Cancelled' });

  // already-scheduled checks
  if (!isCallbackNeedsReschedule(job)) {
    if (isJobScheduledOrLater(job)) {
      out.push({ code: 'already-scheduled', label: 'Already booked in Zuper' });
    } else if (job.date) {
      out.push({ code: 'date-already-set', label: `Scheduled ${job.date}` });
    } else if (hasScheduledSibling(job, siblingJobs)) {
      out.push({ code: 'scheduled-sibling', label: 'Sibling job is booked' });
    }
  }

  const category = categorizeJob(job);
  if (!SCHEDULABLE_CATEGORIES.has(category as ReadyCategory)) {
    out.push({
      code: 'non-dispatchable-category',
      label: `Category: ${category}`,
    });
  }

  if (project) {
    if (project.status === 'complete' || project.status === 'cancelled') {
      out.push({ code: 'project-closed', label: `Project ${project.status}` });
    } else if (project.status === 'warranty') {
      out.push({ code: 'project-on-hold', label: 'Project in warranty' });
    }
  }

  return out;
}
