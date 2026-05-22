// =============================================================
// Overlap detection for jobs / slots within a row.
// =============================================================
import type { Job } from '../types';

export function jobOverlaps(a: Job, b: Job): boolean {
  if (a.id === b.id) return false;
  if (a.date !== b.date || a.startHour == null || b.startHour == null) return false;
  const aEnd = a.startHour + a.durationHrs;
  const bEnd = b.startHour + b.durationHrs;
  return a.startHour < bEnd && b.startHour < aEnd;
}

export function jobConflictsInRow(jobs: Job[], target: Job): Job[] {
  return jobs.filter((j) => j !== target && jobOverlaps(j, target));
}
