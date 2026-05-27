import type { Crew, Customer, Job, Person, Project, TimeOff } from '../../types';
import { dateKey, TODAY } from '../../data/helpers';
import {
  getJobType,
  unscheduledJobs,
  unscheduledNeedsReviewJobs,
} from '../../data/selectors';
import { isDispatchReadyJobType } from '../../lib/dispatch-work';
import type { AttentionItem, AttentionSev } from './buildAttentionItems';

export type ImpactConfidence = 'high' | 'medium' | 'low';

export interface AttentionImpact {
  score: number;
  revenueAtRisk: number;
  urgencyPoints: number;
  operationalDrag: number;
  confidence: ImpactConfidence;
  reasons: string[];
  affectedJobIds: string[];
}

export type ImpactRankedAttentionItem = AttentionItem & {
  impact: AttentionImpact;
};

export interface AttentionImpactState {
  jobs: Job[];
  projects: Project[];
  customers: Customer[];
  people: Person[];
  crews: Crew[];
  timeOff: TimeOff[];
}

const SEV_POINTS: Record<AttentionSev, number> = {
  urgent: 30,
  warn: 18,
  info: 8,
};

const TYPE_FALLBACK_VALUE: Record<string, number> = {
  heatpump: 18000,
  retrofit: 16000,
  water: 7000,
  water_heater: 7000,
  electrical: 5000,
  ev: 2500,
  service: 750,
  warranty: 650,
  callback: 650,
  repair: 750,
  'repair-general-legacy': 750,
  'repair-customer-pay': 750,
  'repair-service-care': 750,
  additional: 1500,
  followup: 650,
  sub: 1000,
  estimate: 0,
  walkthrough: 0,
  inspection: 0,
  meeting: 0,
  training: 0,
  'jetson-board': 0,
  'electrical-permit': 0,
  'heating-or-mech-permit': 0,
};

function uniqueJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function personTouchesJob(personId: string, job: Job, crews: Crew[]): boolean {
  if (job.assignedTechIds?.includes(personId)) return true;
  if (job.slots.some((slot) => slot.assignedTo === personId)) return true;
  const crew = job.crewId ? crews.find((c) => c.id === job.crewId) : null;
  return !!crew?.members.includes(personId);
}

function jobsForAttentionItem(item: AttentionItem, state: AttentionImpactState): Job[] {
  if (item.id === 'queue-unsched') {
    return unscheduledJobs(state.jobs).filter((job) => job.type !== 'callback');
  }

  if (item.id === 'unscheduled-review') {
    return unscheduledNeedsReviewJobs(state.jobs);
  }

  if (item.personId) {
    const outDates = state.timeOff
      .filter((entry) => entry.personId === item.personId)
      .map((entry) => entry.date);
    return state.jobs.filter(
      (job) =>
        !!job.date &&
        outDates.includes(job.date) &&
        job.status !== 'complete' &&
        job.status !== 'cancelled' &&
        personTouchesJob(item.personId!, job, state.crews),
    );
  }

  if (item.jobId) {
    const job = state.jobs.find((candidate) => candidate.id === item.jobId);
    return job ? [job] : [];
  }

  return [];
}

function valueForJob(job: Job, projectsById: Map<string, Project>): { value: number; source: 'job' | 'project' | 'model' | 'none' } {
  if (job.price && job.price > 0) return { value: job.price, source: 'job' };
  const project = job.projectId ? projectsById.get(job.projectId) : undefined;
  if (project?.value && project.value > 0) return { value: project.value, source: 'project' };
  const fallback = TYPE_FALLBACK_VALUE[job.type] ?? (isDispatchReadyJobType(job.type) ? 1000 : 0);
  if (fallback > 0) return { value: fallback, source: 'model' };
  return { value: 0, source: 'none' };
}

function moneyPoints(value: number): number {
  if (value <= 0) return 0;
  return Math.min(50, Math.round(Math.log10(value + 1) * 10));
}

function impactForItem(item: AttentionItem, state: AttentionImpactState): AttentionImpact {
  const today = dateKey(TODAY);
  const projectsById = new Map(state.projects.map((project) => [project.id, project]));
  const affectedJobs = uniqueJobs(jobsForAttentionItem(item, state));
  let urgencyPoints = SEV_POINTS[item.sev] ?? 0;
  let operationalDrag = 0;
  let revenueAtRisk = 0;
  let modeledCount = 0;
  let directValueCount = 0;

  if (item.id === 'unscheduled-review') {
    const dataDrag = Math.min(10, Math.ceil(affectedJobs.length / 50));
    return {
      score: urgencyPoints + dataDrag,
      revenueAtRisk: 0,
      urgencyPoints,
      operationalDrag: dataDrag,
      confidence: 'medium',
      reasons: [
        affectedJobs.length + ' row' + (affectedJobs.length === 1 ? '' : 's') + ' held out of dispatch',
        'not counted as schedule-ready revenue',
        'review type/customer/address before scheduling',
      ],
      affectedJobIds: affectedJobs.slice(0, 50).map((job) => job.id),
    };
  }

  for (const job of affectedJobs) {
    const val = valueForJob(job, projectsById);
    revenueAtRisk += val.value;
    if (val.source === 'model') modeledCount += 1;
    if (val.source === 'job' || val.source === 'project') directValueCount += 1;

    if (job.type === 'callback' || job.status === 'callback') urgencyPoints += 12;
    if (job.date === today && job.slots.some((slot) => !slot.assignedTo && !slot.optional)) {
      urgencyPoints += 10;
    }
    if (job.status === 'unscheduled') urgencyPoints += 6;
    if (!job.customer) operationalDrag += 6;
    if (!job.address) operationalDrag += 6;
    if (!job.crewId && job.status !== 'unscheduled') operationalDrag += 4;
    if (!job.price && !job.projectId) operationalDrag += 3;
  }

  if (item.id === 'queue-unsched') urgencyPoints += 8;
  if (item.personId && affectedJobs.length > 0) urgencyPoints += 10;

  const score = urgencyPoints + operationalDrag + moneyPoints(revenueAtRisk);
  const confidence: ImpactConfidence =
    affectedJobs.length === 0
      ? 'low'
      : modeledCount === 0 && directValueCount === affectedJobs.length
      ? 'high'
      : directValueCount > 0
      ? 'medium'
      : 'low';

  const reasons: string[] = [
    affectedJobs.length + ' affected job' + (affectedJobs.length === 1 ? '' : 's'),
  ];
  // Dollar reasons removed — dispatch decisions don't surface deal $.
  if (affectedJobs.some((job) => job.status === 'unscheduled')) reasons.push('unscheduled capacity');
  if (affectedJobs.some((job) => !job.address || !job.customer)) reasons.push('data gaps slow dispatch');
  if (affectedJobs.length === 1) {
    const jt = getJobType(affectedJobs[0].type);
    if (jt) reasons.push(jt.label);
  }

  return {
    score,
    revenueAtRisk,
    urgencyPoints,
    operationalDrag,
    confidence,
    reasons,
    affectedJobIds: affectedJobs.map((job) => job.id),
  };
}

export function rankAttentionItemsByImpact(
  items: AttentionItem[],
  state: AttentionImpactState,
): ImpactRankedAttentionItem[] {
  const sevOrder: Record<AttentionSev, number> = { urgent: 0, warn: 1, info: 2 };
  return items
    .map((item) => ({ ...item, impact: impactForItem(item, state) }))
    .sort((a, b) => {
      if (b.impact.score !== a.impact.score) return b.impact.score - a.impact.score;
      if (b.impact.revenueAtRisk !== a.impact.revenueAtRisk) {
        return b.impact.revenueAtRisk - a.impact.revenueAtRisk;
      }
      return sevOrder[a.sev] - sevOrder[b.sev];
    });
}
