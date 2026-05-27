import type { Job, JobTypeDef } from '../types';

const DISPATCH_READY_TYPES = new Set([
  'heatpump',
  'retrofit',
  'water',
  'water_heater',
  'electrical',
  'ev',
  'service',
  'warranty',
  'callback',
  'repair',
  'repair-general-legacy',
  'repair-customer-pay',
  'repair-service-care',
  'additional',
  'followup',
  'sub',
]);

const NON_DISPATCH_TYPES = new Set([
  'estimate',
  'walkthrough',
  'inspection',
  'meeting',
  'training',
  'jetson-board',
  'electrical-permit',
  'heating-or-mech-permit',
  'heating-or-mech-inspection',
  'gas-permit',
  'gas-inspection',
  'jetson-filed-rebate',
  'permit',
  'other',
]);

const SUPPLEMENTAL_JOB_TYPES: Record<string, JobTypeDef> = {
  water_heater: { label: 'HP water heater install', color: 'jt-water', short: 'HPWH' },
  ev: { label: 'EV charger / electrical', color: 'jt-electrical', short: 'EV' },
  repair: { label: 'Service repair', color: 'jt-service', short: 'Repair' },
  'repair-general-legacy': { label: 'Service repair', color: 'jt-service', short: 'Repair' },
  'repair-customer-pay': { label: 'Customer-pay repair', color: 'jt-service', short: 'Repair' },
  'repair-service-care': { label: 'Service Care repair', color: 'jt-service', short: 'Service' },
  additional: { label: 'Additional field work', color: 'jt-retrofit', short: 'Add-on' },
  followup: { label: 'Follow-up visit', color: 'jt-callback', short: 'Follow-up' },
  sub: { label: 'Subcontractor work', color: 'jt-meeting', short: 'Sub' },
  estimate: { label: 'Estimate / new deal', color: 'jt-meeting', short: 'Estimate' },
  inspection: { label: 'Inspection', color: 'jt-walkthrough', short: 'Inspect' },
  'jetson-board': { label: 'Internal board item', color: 'jt-meeting', short: 'Board' },
  'electrical-permit': { label: 'Electrical permit', color: 'jt-meeting', short: 'Permit' },
  'heating-or-mech-permit': { label: 'Heating/mechanical permit', color: 'jt-meeting', short: 'Permit' },
  'heating-or-mech-inspection': { label: 'Heating/mechanical inspection', color: 'jt-walkthrough', short: 'Inspect' },
  'gas-permit': { label: 'Gas permit', color: 'jt-meeting', short: 'Permit' },
  'gas-inspection': { label: 'Gas inspection', color: 'jt-walkthrough', short: 'Inspect' },
  'jetson-filed-rebate': { label: 'Rebate/admin item', color: 'jt-meeting', short: 'Admin' },
  training: { label: 'Training/admin item', color: 'jt-meeting', short: 'Training' },
};

function normalizedType(type: string | null | undefined): string {
  return (type ?? '').trim().toLowerCase();
}

export function getSupplementalJobType(type: string): JobTypeDef | undefined {
  return SUPPLEMENTAL_JOB_TYPES[normalizedType(type)];
}

export function isDispatchReadyJobType(type: string | null | undefined): boolean {
  const t = normalizedType(type);
  if (!t) return false;
  if (NON_DISPATCH_TYPES.has(t) || t.includes('permit')) return false;
  if (DISPATCH_READY_TYPES.has(t)) return true;
  return t.startsWith('repair-') || (t.includes('install') && !t.includes('estimate'));
}

export function unscheduledReviewReason(job: Job): string | null {
  if (job.status !== 'unscheduled') return null;

  const type = normalizedType(job.type);
  const title = (job.title ?? '').toLowerCase();
  if (!type || type === 'other') return 'Missing job type';
  if (type === 'estimate' || title.includes('new deal')) return 'Estimate/new deal, not dispatch work';
  if (type.includes('permit')) return 'Permit/admin row';
  if (type === 'jetson-board' || type === 'meeting' || type === 'training') return 'Internal/admin row';
  if (type === 'walkthrough' || type === 'inspection' || type.includes('inspection')) return 'Sales/inspection row';
  if (NON_DISPATCH_TYPES.has(type)) return 'Non-dispatch category';
  if (!isDispatchReadyJobType(type)) return 'Unknown job type';
  if (job.date || job.startHour != null || job.endHour != null) return 'Has schedule date/time from source';
  // Missing-address is no longer a hard gate — Zuper bootstrap rows ship
  // without addresses (enrich runs separately) and dispatchers are happy to
  // schedule by customer name + region. The job-detail drawer shows an
  // "Address not synced" badge so the gap is still visible per-row.
  if (!job.customer && !job.title && !job.hubspotDealId) return 'Missing customer/deal';
  return null;
}

export function isActionableUnscheduledJob(job: Job): boolean {
  return job.status === 'unscheduled' && unscheduledReviewReason(job) == null;
}

export function isUnscheduledNeedsReviewJob(job: Job): boolean {
  return job.status === 'unscheduled' && unscheduledReviewReason(job) != null;
}

export function summarizeUnscheduledReviewReasons(jobs: Job[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const reason = unscheduledReviewReason(job);
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
