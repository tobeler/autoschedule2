// =============================================================
// Effective crew composition.
//
// Default crews are stable workgroups. CrewRosterOverride rows describe
// date-scoped temporary moves. Job slots remain the final source of who
// actually worked a job.
// =============================================================
import type { Crew, CrewRosterOverride, Job, JobSlot, Person, TimeOff } from '../types';

export interface TimeWindow {
  startHour?: number | null;
  endHour?: number | null;
}

export interface PersonJobConflict {
  job: Job;
  slot: JobSlot;
  startHour: number;
  endHour: number;
}

export interface LoanEntry {
  job: Job;
  slot: JobSlot;
  person: Person;
  effectiveCrewId: string | null;
}

const LEVEL_ORDER = ['L1', 'L2', 'L3'] as const;
const LEAD_ROLES = ['hvac_lead', 'electrician', 'plumber', 'fsm', 'service_tech'];

export function timeWindowsOverlap(
  a: TimeWindow | undefined,
  b: TimeWindow | undefined,
): boolean {
  const aStart = a?.startHour ?? null;
  const aEnd = a?.endHour ?? null;
  const bStart = b?.startHour ?? null;
  const bEnd = b?.endHour ?? null;
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return true;
  if (aStart === aEnd) return aStart >= bStart && aStart < bEnd;
  if (bStart === bEnd) return bStart >= aStart && bStart < aEnd;
  return aStart < bEnd && bStart < aEnd;
}

export function overrideApplies(
  override: CrewRosterOverride,
  date: string,
  window?: TimeWindow,
): boolean {
  if (override.date !== date) return false;
  return timeWindowsOverlap(
    { startHour: override.startHour, endHour: override.endHour },
    window,
  );
}

export function effectiveCrewForPerson(
  people: Person[],
  overrides: CrewRosterOverride[],
  date: string,
  personId: string,
  time?: number | TimeWindow | null,
): string | null {
  const person = people.find((p) => p.id === personId);
  const window =
    typeof time === 'number'
      ? { startHour: time, endHour: time }
      : time ?? undefined;
  const active = overrides
    .filter((r) => r.personId === personId && overrideApplies(r, date, window))
    .sort((a, b) => (a.startHour ?? -1) - (b.startHour ?? -1));
  return active.at(-1)?.targetCrewId ?? person?.defaultCrew ?? null;
}

export function effectiveCrewMemberIds(args: {
  crews: Crew[];
  people: Person[];
  overrides: CrewRosterOverride[];
  date: string;
  crewId: string;
  window?: TimeWindow;
}): string[] {
  const { crews, people, overrides, date, crewId, window } = args;
  const crew = crews.find((c) => c.id === crewId);
  const members = new Set<string>(crew?.members ?? []);
  const active = overrides.filter((r) => overrideApplies(r, date, window));

  for (const r of active) {
    const person = people.find((p) => p.id === r.personId);
    const sourceCrewId = r.sourceCrewId ?? person?.defaultCrew ?? null;
    if (sourceCrewId === crewId && r.targetCrewId !== crewId) {
      members.delete(r.personId);
    }
  }

  for (const r of active) {
    if (r.targetCrewId === crewId) members.add(r.personId);
  }

  return Array.from(members);
}

export function effectiveCrewMembers(args: {
  crews: Crew[];
  people: Person[];
  overrides: CrewRosterOverride[];
  date: string;
  crewId: string;
  window?: TimeWindow;
}): Person[] {
  const ids = effectiveCrewMemberIds(args);
  return ids
    .map((id) => args.people.find((p) => p.id === id))
    .filter((p): p is Person => !!p);
}

export function personJobConflicts(args: {
  jobs: Job[];
  personId: string;
  date: string;
  startHour: number;
  endHour: number;
  excludeJobId?: string;
}): PersonJobConflict[] {
  const { jobs, personId, date, startHour, endHour, excludeJobId } = args;
  return jobs.flatMap((job) => {
    if (job.id === excludeJobId || job.date !== date || job.startHour == null) return [];
    return job.slots.flatMap((slot) => {
      if (slot.assignedTo !== personId) return [];
      const slotStart = job.startHour! + (slot.start || 0);
      const slotEnd = slotStart + slot.hours;
      const overlaps = timeWindowsOverlap(
        { startHour, endHour },
        { startHour: slotStart, endHour: slotEnd },
      );
      return overlaps ? [{ job, slot, startHour: slotStart, endHour: slotEnd }] : [];
    });
  });
}

export function personIsAvailableForSlot(args: {
  person: Person;
  slot: JobSlot;
  job: Job;
  jobs: Job[];
  timeOff?: TimeOff[];
}): boolean {
  const { person, slot, job, jobs, timeOff = [] } = args;
  if (!person.roles.includes(slot.role)) return false;
  if (
    slot.role !== 'apprentice' &&
    LEVEL_ORDER.indexOf(person.level) < LEVEL_ORDER.indexOf(slot.level)
  ) {
    return false;
  }
  if (!job.date || job.startHour == null) return true;
  if (timeOff.some((t) => t.personId === person.id && t.date === job.date)) return false;
  const startHour = job.startHour + (slot.start || 0);
  const endHour = startHour + slot.hours;
  return (
    personJobConflicts({
      jobs,
      personId: person.id,
      date: job.date,
      startHour,
      endHour,
      excludeJobId: job.id,
    }).length === 0
  );
}

export function leadPersonForJob(job: Job): string | null {
  return (
    job.slots.find((s) => s.assignedTo && LEAD_ROLES.includes(s.role))?.assignedTo ?? null
  );
}

export function loanEntriesForCrewDay(args: {
  crewId: string;
  date: string;
  jobs: Job[];
  people: Person[];
  overrides: CrewRosterOverride[];
}): LoanEntry[] {
  const { crewId, date, jobs, people, overrides } = args;
  return jobs.flatMap((job) => {
    if (job.date !== date || job.crewId === crewId || job.startHour == null) return [];
    return job.slots.flatMap((slot) => {
      if (!slot.assignedTo) return [];
      const person = people.find((p) => p.id === slot.assignedTo);
      if (!person) return [];
      const slotStart = job.startHour! + (slot.start || 0);
      const effectiveCrewId = effectiveCrewForPerson(
        people,
        overrides,
        date,
        person.id,
        slotStart,
      );
      return effectiveCrewId === crewId
        ? [{ job, slot, person, effectiveCrewId }]
        : [];
    });
  });
}
