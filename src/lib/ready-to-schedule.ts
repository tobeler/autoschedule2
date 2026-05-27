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
//     rowIsScheduledOrLater(row)
//     isZuperNeedsReschedule(status)
//     rowHasScheduledSibling(row)
//     isZuperCompleted / isZuperScheduledOrLater
//
// The port is pure: no I/O, no React, no store. Two exported
// predicates over local typed entities — `isReadyToSchedule` for the
// boolean gate and `whyNotReady` for surfacing blocker reasons in
// the UI.
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

// Job types that *can* land on the dispatch queue. Mirrors the categories
// rebate-dashboard surfaces; excludes admin/internal types (meeting,
// training, board items) and the various permit/inspection bookkeeping
// types that aren't a real field visit.
const DISPATCHABLE_TYPES = new Set<string>([
  'heatpump',
  'water_heater',
  'electrical',
  'ev',
  'repair-general-legacy',
  'repair-service-care',
  'repair-customer-pay',
  'repair-install-warranty',
  'additional',
  'callback',
  'followup',
  'walkthrough',
  'estimate',
  'inspection',
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
 */
export function isReadyToSchedule(ctx: ReadyContext): boolean {
  const { job, project, siblingJobs } = ctx;

  // Cancelled/completed work never appears.
  if (isJobCompleted(job)) return false;

  // Already booked in Zuper (or carrying a future scheduled date)?
  if (isAlreadyScheduledOrLater(job, siblingJobs)) return false;

  // Type gate: only dispatchable categories. Permits / training / board
  // items are tracked but not surfaced here.
  if (!DISPATCHABLE_TYPES.has(job.type)) return false;

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
    | 'non-dispatchable-type';
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

  if (!DISPATCHABLE_TYPES.has(job.type)) {
    out.push({ code: 'non-dispatchable-type', label: `Type: ${job.type}` });
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
