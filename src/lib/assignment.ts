// =============================================================
// Auto-assignment / crew formation.
// =============================================================
import type { Crew, Job, JobSlot, Person, TimeOff } from '../types';
import { JOB_TEMPLATES } from '../data/seed';
import { estimateDriveTime } from './routing';

const LEVEL_ORDER = ['L1', 'L2', 'L3'] as const;

/** Walk a job's slots and fill empty ones with crew members first, then anyone qualified. */
export function autoFillSlots(job: Job, crew: Crew | null | undefined, allPeople: Person[]): JobSlot[] {
  return job.slots.map((slot) => {
    if (slot.assignedTo) return slot;
    const crewMembers = crew ? allPeople.filter((p) => crew.members.includes(p.id)) : [];
    const candidates = [...crewMembers, ...allPeople.filter((p) => !crewMembers.includes(p))];
    const match = candidates.find(
      (p) =>
        p.roles.includes(slot.role) &&
        (slot.role === 'apprentice' ||
          LEVEL_ORDER.indexOf(p.level) >= LEVEL_ORDER.indexOf((slot.level as typeof LEVEL_ORDER[number]) || 'L1')),
    );
    return match ? { ...slot, assignedTo: match.id, suggested: true } : slot;
  });
}

export interface CrewSuggestion {
  crewId: string;
  score: number;
  reasons: string[];
}

interface ScoreInputs {
  crew: Crew;
  job: Job;
  allPeople: Person[];
  allJobs: Job[];
  timeOff: TimeOff[];
}

function scoreCrew({ crew, job, allPeople, allJobs, timeOff }: ScoreInputs): CrewSuggestion {
  const tpl = JOB_TEMPLATES[job.type as string];
  const reasons: string[] = [];
  let score = 0;

  // 1) Skill coverage. Zuper-sourced job types often have no JOB_TEMPLATES
  // entry — fall back to a flat "crew is staffed" credit so the ranking
  // doesn't collapse to all-zeros. Region + continuity + availability still
  // differentiate crews below.
  const members = allPeople.filter((p) => crew.members.includes(p.id));
  if (!tpl) {
    if (members.length > 0) {
      score += 40;
      reasons.push(`${members.length} member${members.length === 1 ? '' : 's'} on this crew`);
    } else {
      reasons.push('Crew has no members yet');
    }
  } else {
    const requiredSlots = tpl.slots.filter((s) => !s.optional);
    const covered = requiredSlots.filter((slot) =>
      members.some(
        (m) =>
          m.roles.includes(slot.role) &&
          (slot.role === 'apprentice' ||
            LEVEL_ORDER.indexOf(m.level) >= LEVEL_ORDER.indexOf((slot.level as typeof LEVEL_ORDER[number]) || 'L1')),
      ),
    ).length;
    const coverage = requiredSlots.length ? covered / requiredSlots.length : 1;
    score += coverage * 60;
    if (coverage === 1) reasons.push('All required roles covered');
    else if (coverage > 0) reasons.push(`Partial coverage (${covered}/${requiredSlots.length})`);
  }

  // 1b) Region match — strong signal for Zuper crews like "CO-DE-1".
  if (job.zuperTeamName && crew.name) {
    const jobRegion = job.zuperTeamName.split('-')[0];
    const crewRegion = crew.name.split('-')[0];
    if (jobRegion && jobRegion === crewRegion) {
      score += 25;
      reasons.push(`Same region (${jobRegion})`);
    } else if (jobRegion && crewRegion && jobRegion !== crewRegion) {
      score -= 20;
      reasons.push(`Cross-region (${jobRegion} → ${crewRegion})`);
    }
  }

  // 2) Continuity for callbacks
  if (job.type === 'callback' && job.customer) {
    const priorJob = allJobs
      .filter((j) => j.customer === job.customer && j.status === 'complete' && j.crewId === crew.id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (priorJob) {
      score += 15;
      reasons.push('Original install crew (continuity)');
    }
  }

  // 3) Availability today (no time-off, no overload)
  if (job.date) {
    const dayLoad = allJobs
      .filter((j) => j.date === job.date && j.crewId === crew.id)
      .reduce((a, j) => a + j.durationHrs, 0);
    const out = timeOff.filter((t) => t.date === job.date && crew.members.includes(t.personId));
    if (dayLoad < 8) {
      score += 10;
      reasons.push(`${Math.max(0, 8 - dayLoad).toFixed(1)}h available`);
    }
    if (out.length === 0) {
      score += 5;
    } else {
      score -= 10;
      reasons.push(`${out.length} on leave today`);
    }
  }

  // 4) Proximity to prior stop (if any)
  if (job.date && job.address) {
    const prior = allJobs
      .filter((j) => j.date === job.date && j.crewId === crew.id && j.startHour != null)
      .sort((a, b) => (a.startHour || 0) - (b.startHour || 0))
      .pop();
    if (prior) {
      const est = estimateDriveTime(prior.address, job.address);
      score -= est.minutes / 4;
      reasons.push(`${est.minutes}min from ${prior.id}`);
    }
  }

  return { crewId: crew.id, score: Math.round(score), reasons };
}

export function suggestCrewForJob(job: Job, crews: Crew[], allPeople: Person[], allJobs: Job[], timeOff: TimeOff[]): CrewSuggestion[] {
  return crews
    .map((crew) => scoreCrew({ crew, job, allPeople, allJobs, timeOff }))
    .sort((a, b) => b.score - a.score);
}
