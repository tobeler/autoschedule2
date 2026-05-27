// =============================================================
// Pure selector / query helpers.
// These take seed/store data as args — no global state lookups.
// =============================================================
import type {
  Crew,
  Customer,
  Job,
  JobSlot,
  Person,
  Project,
  Truck,
  JobTypeDef,
  ChecklistItem,
  ChecklistResponseValue,
  ChecklistResponses,
  ChecklistSection,
  JobStatus,
} from '../types';
import { JOB_TYPES, ROLES, JOB_TEMPLATES } from './seed';
import {
  getSupplementalJobType,
  isActionableUnscheduledJob,
  isUnscheduledNeedsReviewJob,
} from '../lib/dispatch-work';

// ---- Entity lookups (use these everywhere) ----------------------------------
export const getPerson = (people: Person[], id: string | null | undefined) =>
  id ? people.find((p) => p.id === id) : undefined;
export const getCrew = (crews: Crew[], id: string | null | undefined) =>
  id ? crews.find((c) => c.id === id) : undefined;
export const getTruck = (trucks: Truck[], id: string | null | undefined) =>
  id ? trucks.find((t) => t.id === id) : undefined;
export const getCustomer = (customers: Customer[], id: string | null | undefined) =>
  id ? customers.find((c) => c.id === id) : undefined;
export const getProject = (projects: Project[], id: string | null | undefined) =>
  id ? projects.find((p) => p.id === id) : undefined;
export const getJobType = (t: string): JobTypeDef | undefined => JOB_TYPES[t] ?? getSupplementalJobType(t);

// ---- Job queries ------------------------------------------------------------
export const jobsOn = (jobs: Job[], date: string) => jobs.filter((j) => j.date === date);
export const unscheduledJobs = (jobs: Job[]) => jobs.filter(isActionableUnscheduledJob);
export const unscheduledNeedsReviewJobs = (jobs: Job[]) => jobs.filter(isUnscheduledNeedsReviewJob);
export const jobsForCrew = (jobs: Job[], crewId: string, date: string) =>
  jobs.filter(
    (j) => j.date === date && (j.crewId === crewId || (j.extraCrewIds || []).includes(crewId)),
  );

export function statusLabel(s: JobStatus): string {
  return ({
    unscheduled: 'Unscheduled',
    scheduled: 'Scheduled',
    enroute: 'En route',
    onsite: 'On site',
    complete: 'Complete',
    callback: 'Callback',
    cancelled: 'Cancelled',
  } as const)[s];
}

export function projectStatusLabel(s: Project['status']): string {
  return (
    {
      proposed: 'Proposed',
      sold: 'Sold',
      in_progress: 'In progress',
      complete: 'Complete',
      warranty: 'Warranty',
      cancelled: 'Cancelled',
    } as const
  )[s];
}

// ---- Multi-day helpers ------------------------------------------------------
export function multidaySiblings(jobs: Job[], job: Job | undefined | null): Job[] {
  if (!job?.multidayGroupId) return [];
  return jobs
    .filter((j) => j.multidayGroupId === job.multidayGroupId)
    .sort((a, b) => (a.multidayIndex || 0) - (b.multidayIndex || 0));
}

export function continuationChain(jobs: Job[], job: Job): Job[] {
  let head = job;
  while (head.continuationOf) {
    const parent = jobs.find((j) => j.id === head.continuationOf);
    if (!parent) break;
    head = parent;
  }
  const chain: Job[] = [head];
  let cur = head;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = jobs.find((j) => j.continuationOf === cur.id);
    if (!next) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

// ---- Project helpers --------------------------------------------------------
export const projectsForCustomer = (projects: Project[], customerId: string) =>
  projects.filter((p) => p.customer === customerId);
export const jobsForProject = (jobs: Job[], projectId: string) =>
  jobs.filter((j) => j.projectId === projectId);

// ---- Auto-assignment --------------------------------------------------------
/** Fill unfilled slots with a candidate matching role + minimum level. */
export function suggestAssignments(job: Job, people: Person[]): JobSlot[] {
  const tpl = JOB_TEMPLATES[job.type as string];
  if (!tpl) return job.slots;
  const order = ['L1', 'L2', 'L3'] as const;
  return job.slots.map((slot) => {
    if (slot.assignedTo) return slot;
    const candidate = people.find(
      (p) =>
        p.roles.includes(slot.role) &&
        (slot.role === 'apprentice' ||
          order.indexOf(p.level) >= order.indexOf((slot.level as typeof order[number]) || 'L1')),
    );
    return candidate ? { ...slot, assignedTo: candidate.id, suggested: true } : slot;
  });
}

// ---- Checklist progress -----------------------------------------------------
export function isItemAnswered(item: ChecklistItem, response: ChecklistResponseValue | undefined): boolean {
  if (response === undefined || response === null) return false;
  switch (item.type) {
    case 'checkbox':
      return response === true;
    case 'photo': {
      const n = typeof response === 'number' ? response : Array.isArray(response) ? response.length : 0;
      return n >= ((item as { minPhotos?: number }).minPhotos || 1);
    }
    case 'multi':
      return Array.isArray(response) && response.length > 0;
    case 'single':
      return typeof response === 'string' && response.length > 0;
    case 'number':
      return typeof response === 'number';
    case 'text':
    case 'longtext':
      return typeof response === 'string' && response.trim().length > 0;
    case 'signature':
      return !!(response && typeof response === 'object' && 'name' in (response as { name?: string }));
    case 'rating':
      return typeof response === 'number';
    default:
      return false;
  }
}

export interface ChecklistProgress {
  totalItems: number;
  totalDone: number;
  requiredItems: number;
  requiredDone: number;
  complete: boolean;
}

export function checklistProgress(
  sections: ChecklistSection[],
  responses: ChecklistResponses | undefined,
): ChecklistProgress {
  const allItems = sections.flatMap((s) => s.items);
  const required = allItems.filter((i) => i.required);
  const requiredDone = required.filter((i) => isItemAnswered(i, responses?.[i.id])).length;
  const totalDone = allItems.filter((i) => isItemAnswered(i, responses?.[i.id])).length;
  return {
    totalItems: allItems.length,
    totalDone,
    requiredItems: required.length,
    requiredDone,
    complete: requiredDone === required.length,
  };
}

// ---- Role helpers ------------------------------------------------------------
export function roleLabel(role: string): string {
  return ROLES[role as keyof typeof ROLES]?.label ?? role;
}
export function roleShort(role: string): string {
  return ROLES[role as keyof typeof ROLES]?.short ?? role;
}

// ---- Slot computed times ----------------------------------------------------
export function slotTimeRange(job: Job, slot: JobSlot): { start: number; end: number } | null {
  if (job.startHour == null) return null;
  const start = job.startHour + slot.start;
  return { start, end: start + slot.hours };
}

// ---- Job effective end ------------------------------------------------------
export function jobEndHour(job: Job): number | null {
  if (job.startHour == null) return null;
  return job.startHour + job.durationHrs;
}
