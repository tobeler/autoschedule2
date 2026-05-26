// =============================================================
// Zuper field-mapping defaults.
//
// Pure data — no DB or network. Used by sync.ts to map between
// Zuper's vocabulary and AutoSchedule's typed enums.
// =============================================================

import type { JobStatus } from '../../types';

/**
 * Zuper job_status.status_type → AutoSchedule's jobStatusEnum.
 * Source: jetson-kpi field guide + production data. The eight Zuper statuses
 * here cover ~99% of jobs; unknowns map to 'scheduled' as a safe default.
 */
export const ZUPER_STATUS_TO_APP: Record<string, JobStatus> = {
  NEW: 'unscheduled',
  SCHEDULED: 'scheduled',
  DISPATCHED: 'scheduled',
  ON_MY_WAY: 'enroute',
  STARTED: 'onsite',
  ON_HOLD: 'scheduled',
  FOLLOW_UP: 'callback',
  FOLLOW_UP_SAME_JOB: 'callback',
  COMPLETED: 'complete',
  CLOSED: 'complete',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
  CANNOT_COMPLETE: 'cancelled',
  FAILED: 'cancelled',
};

export function mapZuperStatus(zuperStatusType: string | undefined | null): JobStatus {
  if (!zuperStatusType) return 'unscheduled';
  return ZUPER_STATUS_TO_APP[zuperStatusType.toUpperCase()] ?? 'scheduled';
}

/**
 * Zuper job_category.category_name → AutoSchedule's jobs.type slug.
 * Slugify by lowercasing and replacing non-alphanumeric with '-'.
 * Domain overrides below force categories into our short stable slugs;
 * everything else falls through to the slug.
 */
const CATEGORY_OVERRIDES: Record<string, string> = {
  'heat pump installation': 'heatpump',
  'smart system retrofit': 'heatpump',
  'hphwt install': 'water_heater',
  'hot water heat pump': 'water_heater',
  'ev charger': 'ev',
  'electrical service upgrade': 'electrical',
  'electric service upgrade': 'electrical',
  'heat strip installation': 'electrical',
  'repair service': 'repair',
  'repair - callback': 'callback',
  walkthrough: 'walkthrough',
  'follow up visit': 'followup',
  'in person inspection': 'inspection',
  meeting: 'meeting',
  training: 'training',
  'additional work': 'additional',
  'subcontractor work': 'sub',
};

export function mapZuperCategory(categoryName: string | null | undefined): string {
  if (!categoryName) return 'other';
  const key = categoryName.trim().toLowerCase();
  if (CATEGORY_OVERRIDES[key]) return CATEGORY_OVERRIDES[key];
  return key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'other';
}

/**
 * Categories that count as "install" work (mirrors jetson-kpi).
 * Currently advisory — surfaced in metrics, not used as a sync gate.
 */
export const INSTALL_CATEGORIES = new Set([
  'heat pump installation',
  'smart system retrofit',
  'hphwt install',
  'hot water heat pump',
  'ev charger',
  'electrical service upgrade',
  'electric service upgrade',
  'heat strip installation',
  'additional work',
  'subcontractor work',
]);

/** Statuses that mean "no longer active — don't reopen in dispatcher". */
export const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'CLOSED',
  'CANCELED',
  'CANCELLED',
  'CANNOT_COMPLETE',
  'FAILED',
]);

/**
 * Active dispatch statuses (jobs the dispatcher cares about today). Anything
 * not in this set + not terminal is treated as backlog.
 */
export const ACTIVE_STATUSES = new Set([
  'NEW',
  'SCHEDULED',
  'DISPATCHED',
  'ON_MY_WAY',
  'STARTED',
  'ON_HOLD',
]);
