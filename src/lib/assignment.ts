// =============================================================
// Auto-assignment / crew formation.
// =============================================================
import type { Crew, CrewRosterOverride, Job, JobSlot, Person, TimeOff } from '../types';
import { JOB_TEMPLATES } from '../data/seed';
import { estimateDriveTime } from './routing';
import {
  effectiveCrewMembers,
  personIsAvailableForSlot,
} from './crewEffective';

const LEVEL_ORDER = ['L1', 'L2', 'L3'] as const;

export interface AutoFillContext {
  crews?: Crew[];
  rosterOverrides?: CrewRosterOverride[];
  jobs?: Job[];
  timeOff?: TimeOff[];
}

/** Walk a job's slots and fill empty ones with effective crew members first, then anyone qualified. */
export function autoFillSlots(
  job: Job,
  crew: Crew | null | undefined,
  allPeople: Person[],
  context: AutoFillContext = {},
): JobSlot[] {
  const alreadyPicked = new Set(job.slots.map((slot) => slot.assignedTo).filter(Boolean) as string[]);
  return job.slots.map((slot) => {
    if (slot.assignedTo) return slot;
    const effectiveMembers =
      crew && job.date
        ? effectiveCrewMembers({
            crews: context.crews ?? (crew ? [crew] : []),
            people: allPeople,
            overrides: context.rosterOverrides ?? [],
            date: job.date,
            crewId: crew.id,
            window:
              job.startHour == null
                ? undefined
                : {
                    startHour: job.startHour + (slot.start || 0),
                    endHour: job.startHour + (slot.start || 0) + slot.hours,
                  },
          })
        : crew
          ? allPeople.filter((p) => crew.members.includes(p.id))
          : [];
    const crewIds = new Set(effectiveMembers.map((p) => p.id));
    const candidates = [
      ...effectiveMembers,
      ...allPeople.filter((p) => !crewIds.has(p.id)),
    ];
    const match = candidates.find(
      (p) =>
        !alreadyPicked.has(p.id) &&
        p.roles.includes(slot.role) &&
        (slot.role === 'apprentice' ||
          LEVEL_ORDER.indexOf(p.level) >= LEVEL_ORDER.indexOf((slot.level as typeof LEVEL_ORDER[number]) || 'L1')) &&
        personIsAvailableForSlot({
          person: p,
          slot,
          job,
          jobs: context.jobs ?? [],
          timeOff: context.timeOff,
        }),
    );
    if (!match) return slot;
    alreadyPicked.add(match.id);
    return { ...slot, assignedTo: match.id, suggested: true };
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
  rosterOverrides?: CrewRosterOverride[];
  crews?: Crew[];
}

function scoreCrew({ crew, job, allPeople, allJobs, timeOff, rosterOverrides = [], crews = [] }: ScoreInputs): CrewSuggestion {
  const tpl = JOB_TEMPLATES[job.type as string];
  const reasons: string[] = [];
  let score = 0;

  if (!tpl) return { crewId: crew.id, score, reasons: ['no template'] };

  // 1) Skill coverage
  const members = job.date
    ? effectiveCrewMembers({
        crews: crews.length ? crews : [crew],
        people: allPeople,
        overrides: rosterOverrides,
        date: job.date,
        crewId: crew.id,
        window:
          job.startHour == null
            ? undefined
            : { startHour: job.startHour, endHour: job.startHour + job.durationHrs },
      })
    : allPeople.filter((p) => crew.members.includes(p.id));
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
    const out = timeOff.filter((t) => t.date === job.date && members.some((m) => m.id === t.personId));
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

export function suggestCrewForJob(
  job: Job,
  crews: Crew[],
  allPeople: Person[],
  allJobs: Job[],
  timeOff: TimeOff[],
  rosterOverrides: CrewRosterOverride[] = [],
): CrewSuggestion[] {
  return crews
    .map((crew) =>
      scoreCrew({ crew, job, allPeople, allJobs, timeOff, rosterOverrides, crews }),
    )
    .sort((a, b) => b.score - a.score);
}
