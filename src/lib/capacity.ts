// =============================================================
// Capacity heatmap calculations.
// =============================================================
import type { Crew, CrewRosterOverride, Job, Person } from '../types';
import { effectiveCrewMemberIds, personJobConflicts } from './crewEffective';

const STD_DAY_HOURS = 8;
const OT_DAY_HOURS = 10;

export type CapacityBucket = 'idle' | 'light' | 'normal' | 'busy' | 'overload';

export interface CapacityCell {
  hours: number;
  pct: number;
  bucket: CapacityBucket;
}

export function capacityForCrewDay(
  jobs: Job[],
  crewId: string,
  date: string,
  options: {
    crews?: Crew[];
    people?: Person[];
    rosterOverrides?: CrewRosterOverride[];
  } = {},
): CapacityCell {
  const primaryJobs = jobs.filter((j) => j.date === date && j.crewId === crewId);
  let hours = primaryJobs.reduce((a, j) => a + j.durationHrs, 0);
  if (options.crews && options.people) {
    const memberIds = effectiveCrewMemberIds({
      crews: options.crews,
      people: options.people,
      overrides: options.rosterOverrides ?? [],
      date,
      crewId,
    });
    const loanHours = memberIds.reduce((total, personId) => {
      const conflicts = personJobConflicts({
        jobs,
        personId,
        date,
        startHour: 0,
        endHour: 24,
      }).filter((c) => c.job.crewId !== crewId);
      return total + conflicts.reduce((sum, c) => sum + (c.endHour - c.startHour), 0);
    }, 0);
    hours += loanHours;
  }
  const pct = hours / STD_DAY_HOURS;
  let bucket: CapacityBucket = 'idle';
  if (hours === 0) bucket = 'idle';
  else if (pct < 0.4) bucket = 'light';
  else if (pct < 0.85) bucket = 'normal';
  else if (hours <= OT_DAY_HOURS) bucket = 'busy';
  else bucket = 'overload';
  return { hours, pct, bucket };
}
