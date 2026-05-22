// =============================================================
// Capacity heatmap calculations.
// =============================================================
import type { Job } from '../types';

const STD_DAY_HOURS = 8;
const OT_DAY_HOURS = 10;

export type CapacityBucket = 'idle' | 'light' | 'normal' | 'busy' | 'overload';

export interface CapacityCell {
  hours: number;
  pct: number;
  bucket: CapacityBucket;
}

export function capacityForCrewDay(jobs: Job[], crewId: string, date: string): CapacityCell {
  const dayJobs = jobs.filter((j) => j.date === date && (j.crewId === crewId || (j.extraCrewIds || []).includes(crewId)));
  const hours = dayJobs.reduce((a, j) => a + j.durationHrs, 0);
  const pct = hours / STD_DAY_HOURS;
  let bucket: CapacityBucket = 'idle';
  if (hours === 0) bucket = 'idle';
  else if (pct < 0.4) bucket = 'light';
  else if (pct < 0.85) bucket = 'normal';
  else if (hours <= OT_DAY_HOURS) bucket = 'busy';
  else bucket = 'overload';
  return { hours, pct, bucket };
}
