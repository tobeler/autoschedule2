// =============================================================
// Build the Needs-Attention items list from live store state.
// =============================================================
import type { ReactNode } from 'react';
import type { IconName } from '../../components/Icon';
import { useStore } from '../../store';
import { TODAY, dateKey, fmtDate, fmtTime, hoursToStr } from '../../data/helpers';
import type { Crew, Customer, Job, Person, TimeOff } from '../../types';
import {
  getCrew,
  getCustomer,
  getJobType,
  getPerson,
  roleLabel,
  unscheduledJobs,
  unscheduledNeedsReviewJobs,
} from '../../data/selectors';
import { summarizeUnscheduledReviewReasons } from '../../lib/dispatch-work';
import { realCustomerName } from '../../lib/customer-display';
import { ROLES } from '../../data/seed';

export type AttentionSev = 'urgent' | 'warn' | 'info';
export type AttentionCategory = 'coverage' | 'schedule' | 'field' | 'heads_up';

export interface AttentionMeta {
  kind: 'due' | 'soft' | 'deal' | 'tag';
  label: string;
}

export interface AttentionResolution {
  primary?: boolean;
  icon: IconName;
  title: string;
  sub?: string;
  action?: string;
}

export interface AttentionItem {
  id: string;
  sev: AttentionSev;
  cat: AttentionCategory;
  icon: IconName;
  title: string;
  desc: ReactNode;
  meta: AttentionMeta[];
  context: [string, string][];
  resolutions: AttentionResolution[];
  jobId?: string;
  personId?: string;
}

export interface AttentionBuildState {
  jobs: Job[];
  customers: Customer[];
  people: Person[];
  crews: Crew[];
  timeOff: TimeOff[];
}

const SEV_ORDER: Record<AttentionSev, number> = { urgent: 0, warn: 1, info: 2 };

/**
 * Build the live attention list. Reads from the global store via
 * `useStore.getState()` — safe to call from non-React code paths.
 */
export function buildAttentionItems(input?: AttentionBuildState): AttentionItem[] {
  const state = input ?? useStore.getState();
  const { jobs, customers, people, crews, timeOff } = state;
  const items: AttentionItem[] = [];
  const today = dateKey(TODAY);

  // 1. UNFILLED SLOTS — scan today's jobs
  jobs
    .filter((j) => j.date === today)
    .forEach((job) => {
      const unfilled = job.slots.filter((s) => !s.assignedTo && !s.optional);
      unfilled.forEach((s) => {
        const c = getCustomer(customers, job.customer);
        const role = ROLES[s.role];
        if (!role) return;
        const slotStart = job.startHour != null ? fmtTime(job.startHour + s.start) : '—';
        items.push({
          id: 'unf-' + job.id + '-' + s.id,
          sev: 'urgent',
          cat: 'coverage',
          icon: 'user',
          title: 'Unfilled ' + role.label + ' slot · ' + (c?.name ?? job.title ?? 'Untitled'),
          desc:
            'Needs ' +
            role.label +
            ' on site by ' +
            slotStart +
            ' · ' +
            hoursToStr(s.hours) +
            ' · ' +
            (c?.name || (job.address || '').split('·')[0] || ''),
          meta: [
            { kind: 'due', label: 'By ' + slotStart },
            { kind: 'tag', label: getJobType(job.type)?.short || job.type },
          ],
          context: [
            ['Type', getJobType(job.type)?.label || job.type],
            ['Customer', c?.name || '—'],
            ['Address', job.address || '—'],
            ['Role needed', role.label + ' (' + s.level + ')'],
            ['Start time', slotStart + ' · ' + hoursToStr(s.hours)],
          ],
          resolutions: [
            {
              primary: true,
              icon: 'sparkle',
              title: 'Suggest an available ' + role.label,
              sub: 'Match level + region + travel window',
              action: 'assign',
            },
            { icon: 'user', title: 'Pick from roster', sub: 'Manually assign a person', action: 'pick' },
            { icon: 'briefcase', title: 'Review external coverage', sub: 'Subcontractor option only; no message sent' },
          ],
          jobId: job.id,
        });
      });
    });

  // 2. CALLBACKS — unscheduled or marked callback
  jobs
    .filter((j) => j.type === 'callback' && (j.status === 'unscheduled' || j.status === 'callback'))
    .forEach((job) => {
      const c = getCustomer(customers, job.customer);
      const isToday = job.date === today;
      items.push({
        id: 'cb-' + job.id,
        sev: 'urgent',
        cat: 'schedule',
        icon: 'refresh',
        title:
          'Callback · ' +
          (realCustomerName(c) ||
            job.title?.split(/\s[-|]\s/)[0]?.trim() ||
            'Unknown'),
        desc: (job.notes || 'Callback from Zuper; review job details') + ' · ' + (isToday ? 'same-day' : 'unscheduled'),
        meta: [
          { kind: isToday ? 'due' : 'soft', label: isToday ? 'Today' : 'Unscheduled' },
          { kind: 'tag', label: 'Callback' },
        ],
        context: [
          ['Customer', realCustomerName(c) || job.title?.split(/\s[-|]\s/)[0]?.trim() || '—'],
          ['Address', job.address || '—'],
          ['Type', getJobType(job.type)?.label || job.type],
          ['Issue', job.notes || '—'],
        ],
        resolutions: [
          {
            primary: true,
            icon: 'sparkle',
            title: isToday ? "Drop into today's slack" : 'Suggest earliest fit',
            sub: 'Rank by region, crew capacity, and route fit',
            action: 'schedule',
          },
          {
            icon: 'calendar',
            title: 'Find schedule window',
            sub: 'Pick a local slot before any customer outreach',
            action: 'pick_window',
          },
          {
            icon: 'briefcase',
            title: 'Open job details',
            sub: 'Review source identifiers and notes',
            action: 'open_details',
          },
        ],
        jobId: job.id,
      });
    });

  // Items 3, 3b, 4 (Commissioning, Spillover, Late ETA) used to be hard-
  // coded synthetic placeholders anchored to fictional jobs J-2611/2614/2630.
  // Removed for the HVAC review pass — they were demo content, not real
  // signals. The unfilled-slot scan (#1), callback scan (#2), unscheduled-
  // queue rollup (#5), people-out from timeOff (#7), and the per-job
  // computed bits below are all real-data driven.

  // Closeout/post-install cleanup is intentionally excluded from dispatch
  // attention. This board is for getting install and service jobs scheduled,
  // covered, and routed.

  // 5. UNSCHEDULED QUEUE — clean dispatch-ready work only. Zuper NEW rows
  // such as estimates, permits, and admin board items are intentionally
  // held out of this scheduling workflow.
  const unsched = unscheduledJobs(jobs).filter((j) => j.type !== 'callback');
  if (unsched.length) {
    const total = unsched.reduce((s, j) => s + (j.price || 0), 0);
    items.push({
      id: 'queue-unsched',
      sev: 'warn',
      cat: 'schedule',
      icon: 'calendar',
      title:
        unsched.length + ' install/service job' + (unsched.length === 1 ? '' : 's') + ' awaiting slots',
      desc:
        'Clean queue only: installs, service, repairs, and add-on field work awaiting slots. ' +
        'Callbacks are listed as individual urgent items. ' +
        'Known non-dispatch rows are held for data review.',
      meta: [{ kind: 'soft', label: 'Dispatch-ready non-callback' }],
      context: unsched.map((j) => {
        const c = getCustomer(customers, j.customer);
        // realCustomerName strips synthetic "Legacy install xxx" stand-ins;
        // we then fall through to the Zuper title (most begin "{First Last} - …").
        const name =
          realCustomerName(c) ||
          j.title?.split(/\s[-|]\s/)[0]?.trim() ||
          (j.address || '').split('·')[0]?.trim() ||
          'Unknown';
        const typeLabel = getJobType(j.type)?.label || j.type;
        return [name, typeLabel];
      }),
      resolutions: [
        { primary: true, icon: 'calendar', title: 'Open dispatch rail', sub: 'Schedule from the clean queue; callbacks stay separate', action: 'open_dispatch' },
        { icon: 'sparkle', title: 'Rank by revenue impact', sub: 'Use Impact sort to pick the highest-risk work first' },
        { icon: 'briefcase', title: 'Review source deals', sub: 'Open the jobs table with HubSpot deal ids', action: 'open_jobs' },
      ],
    });
  }

  const reviewUnscheduled = unscheduledNeedsReviewJobs(jobs);
  if (reviewUnscheduled.length) {
    const reasonCounts = summarizeUnscheduledReviewReasons(reviewUnscheduled);
    items.push({
      id: 'unscheduled-review',
      sev: 'info',
      cat: 'heads_up',
      icon: 'alert_circle',
      title:
        reviewUnscheduled.length +
        ' unscheduled row' +
        (reviewUnscheduled.length === 1 ? '' : 's') +
        ' held out of dispatch',
      desc:
        'These rows still have unscheduled status, but are not clean schedule-ready jobs. ' +
        'They stay out of the drag rail until type, customer, and address data are dispatchable.',
      meta: [
        { kind: 'soft', label: 'Data quality' },
        { kind: 'tag', label: 'Hidden from rail' },
      ],
      context: reasonCounts.slice(0, 8).map(([reason, count]) => [String(count), reason]),
      resolutions: [
        { primary: true, icon: 'briefcase', title: 'Open jobs table', sub: 'Filter Unscheduled and audit type/customer/address', action: 'open_jobs' },
        { icon: 'calendar', title: 'Return to dispatch rail', sub: 'Only dispatch-ready jobs appear there', action: 'open_dispatch' },
      ],
    });
  }

  // Item 6 (tight drive window) was a synthetic Brookline → Highland Pl
  // example. Removed — real drive-time scanning needs the property
  // address + Google Maps integration, which isn't wired yet.

  // 7. PEOPLE OUT — derive from timeOff
  timeOff.forEach((t) => {
    const p = getPerson(people, t.personId);
    if (!p) return;
    const isToday = t.date === today;
    const primaryRole = p.roles[0];
    const crew = getCrew(crews, p.defaultCrew);
    const datePretty = isToday
      ? 'today'
      : 'on ' +
        fmtDate(new Date(t.date + 'T12:00:00'), { weekday: 'short', month: 'short', day: 'numeric' });
    items.push({
      id: 'to-' + t.id,
      sev: isToday ? 'warn' : 'info',
      cat: 'coverage',
      icon: t.type === 'sick' ? 'alert_circle' : t.type === 'vacation' ? 'calendar' : 'sparkle',
      title: p.name + ' out ' + datePretty,
      desc: t.label + ' · ' + roleLabel(primaryRole) + ' on ' + (crew?.name || '—'),
      meta: [
        { kind: 'soft', label: isToday ? 'Today' : 'Upcoming' },
        { kind: 'tag', label: t.type === 'sick' ? 'Sick' : t.type === 'vacation' ? 'PTO' : 'Training' },
      ],
      context: [
        ['Person', p.name],
        ['Role', roleLabel(primaryRole) + ' · ' + p.level],
        ['Crew', crew?.name || '—'],
        [
          'Date',
          isToday
            ? 'Today'
            : fmtDate(new Date(t.date + 'T12:00:00'), {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              }),
        ],
        [
          'Status',
          isToday
            ? t.type === 'sick'
              ? 'Coverage review needed'
              : 'Check coverage before dispatch'
            : 'Heads-up only',
        ],
      ],
      resolutions: isToday
        ? [
            { primary: true, icon: 'sparkle', title: 'Find coverage', sub: 'Rank replacement techs and open gaps', action: 'open_dispatch' },
            { icon: 'calendar', title: 'See affected jobs', sub: 'Jobs assigned to ' + p.name.split(' ')[0] + ' today', action: 'open_jobs' },
          ]
        : [
            {
              primary: true,
              icon: 'sparkle',
              title: 'Find coverage',
              sub: 'Suggest backup ' + roleLabel(primaryRole).toLowerCase(),
              action: 'open_dispatch',
            },
            {
              icon: 'calendar',
              title: 'See affected jobs',
              sub: 'Jobs assigned to ' + p.name.split(' ')[0] + ' that day',
              action: 'open_jobs',
            },
          ],
      personId: p.id,
    });
  });

  // Items 8 (weather) and 9 (Margaret Chen customer note) were synthetic
  // placeholders. Real weather + per-customer notes need NWS + HubSpot
  // notes-API hookups respectively — out of scope for the read-only pass.

  items.sort((a, b) => {
    if (SEV_ORDER[a.sev] !== SEV_ORDER[b.sev]) return SEV_ORDER[a.sev] - SEV_ORDER[b.sev];
    return a.cat.localeCompare(b.cat);
  });
  return items;
}

export const SEV_LABEL: Record<AttentionSev, string> = {
  urgent: 'Urgent',
  warn: 'Today',
  info: 'FYI',
};

export const CATEGORY_META: Record<
  AttentionCategory,
  { label: string; icon: IconName; desc: string }
> = {
  coverage: { label: 'Coverage', icon: 'user', desc: 'Unfilled slots, people out' },
  schedule: { label: 'Schedule', icon: 'calendar', desc: 'Unscheduled jobs, callbacks' },
  field: { label: 'Field', icon: 'map_pin', desc: 'Late ETAs, missing photos' },
  heads_up: { label: 'Heads-up', icon: 'alert_circle', desc: 'Weather, customer notes' },
};
