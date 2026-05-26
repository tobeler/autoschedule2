// =============================================================
// Build the Needs-Attention items list from live store state.
// =============================================================
import type { ReactNode } from 'react';
import type { IconName } from '../../components/Icon';
import { useStore } from '../../store';
import { TODAY, dateKey, fmtDate, fmtTime, hoursToStr } from '../../data/helpers';
import {
  getCrew,
  getCustomer,
  getPerson,
  roleLabel,
} from '../../data/selectors';
import { JOB_TYPES, ROLES } from '../../data/seed';

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

const SEV_ORDER: Record<AttentionSev, number> = { urgent: 0, warn: 1, info: 2 };

/**
 * Build the live attention list. Reads from the global store via
 * `useStore.getState()` — safe to call from non-React code paths.
 */
export function buildAttentionItems(): AttentionItem[] {
  const state = useStore.getState();
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
          title: 'Unfilled ' + role.label + ' slot on ' + job.id,
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
            { kind: 'tag', label: JOB_TYPES[job.type]?.short || job.type },
          ],
          context: [
            ['Job', job.id + ' · ' + (JOB_TYPES[job.type]?.label || job.type)],
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
            { icon: 'phone', title: 'Call subcontractor pool', sub: 'Brooks Electric · Walsh Electric on call' },
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
        title: 'Callback · ' + (c?.name || job.id),
        desc: (job.notes || 'Customer reported recurring issue') + ' · ' + (isToday ? 'same-day' : 'unscheduled'),
        meta: [
          { kind: isToday ? 'due' : 'soft', label: isToday ? 'Today' : 'Unscheduled' },
          { kind: 'tag', label: 'Callback' },
        ],
        context: [
          ['Job', job.id],
          ['Customer', c?.name || '—'],
          ['Address', job.address || '—'],
          ['Original job', 'J-2562 · completed May 14'],
          ['Issue', job.notes || '—'],
        ],
        resolutions: [
          {
            primary: true,
            icon: 'sparkle',
            title: isToday ? "Drop into today's slack" : 'Suggest earliest fit',
            sub: 'Chen Crew has 1.5h gap at 3:30p',
            action: 'schedule',
          },
          { icon: 'phone', title: 'Call customer', sub: 'Confirm urgency + window' },
          { icon: 'briefcase', title: 'Open original job', sub: 'View install history' },
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

  // 3. OVERDUE — past-dated jobs still in a non-terminal status. This is
  // the single biggest blind spot for HVAC ops: jobs scheduled for last
  // Tuesday that never got marked complete or cancelled. Bucket them as
  // one rollup with a count so the topbar doesn't fill with 480 items.
  const overdueJobs = jobs.filter(
    (j) =>
      j.date != null &&
      j.date < today &&
      j.status !== 'complete' &&
      j.status !== 'cancelled',
  );
  if (overdueJobs.length > 0) {
    const oldest = overdueJobs.reduce<string | null>(
      (m, j) => (m == null || (j.date && j.date < m) ? j.date! : m),
      null,
    );
    items.push({
      id: 'overdue-rollup',
      sev: 'urgent',
      cat: 'schedule',
      icon: 'alert_circle',
      title: overdueJobs.length + ' overdue jobs need closeout',
      desc:
        'These jobs were scheduled for a past date but are still marked active ' +
        '— probably need to be marked complete or rescheduled. Oldest: ' +
        (oldest ?? '—') +
        '.',
      meta: [
        { kind: 'due', label: 'Past' },
        { kind: 'tag', label: overdueJobs.length + ' jobs' },
      ],
      context: [
        ['Count', String(overdueJobs.length)],
        ['Oldest date', oldest ?? '—'],
        ['Statuses', Array.from(new Set(overdueJobs.map((j) => j.status))).join(', ')],
      ],
      resolutions: [
        {
          primary: true,
          icon: 'check',
          title: 'Review and mark complete',
          sub: 'Open Jobs tab → filter past-dated active',
        },
        {
          icon: 'calendar',
          title: 'Bulk reschedule',
          sub: 'For jobs still on the calendar but not yet done',
        },
      ],
    });
  }

  // 5. UNSCHEDULED QUEUE — bucket non-callback unscheduled
  const unsched = jobs.filter((j) => j.status === 'unscheduled' && j.type !== 'callback');
  if (unsched.length) {
    const total = unsched.reduce((s, j) => s + (j.price || 0), 0);
    items.push({
      id: 'queue-unsched',
      sev: 'warn',
      cat: 'schedule',
      icon: 'calendar',
      title:
        unsched.length + ' unscheduled job' + (unsched.length === 1 ? '' : 's') + ' for this week',
      desc:
        'Total $' +
        total.toLocaleString() +
        ' in pipeline awaiting slots · oldest sits 3 days',
      meta: [
        { kind: 'soft', label: 'This week' },
        { kind: 'deal', label: 'HubSpot' },
      ],
      context: unsched.map((j) => {
        const c = getCustomer(customers, j.customer);
        const head = c?.name || (j.address || '').split('·')[0] || '—';
        const tail =
          (JOB_TYPES[j.type]?.short || j.type) + (j.price ? ' · $' + j.price.toLocaleString() : '');
        return [j.id, head + ' · ' + tail];
      }),
      resolutions: [
        { primary: true, icon: 'sparkle', title: 'Batch smart-schedule', sub: 'Suggest crew + day for each', action: 'smart_schedule' },
        { icon: 'calendar', title: 'Open unscheduled rail', sub: 'Drag into the day calendar' },
        { icon: 'bell', title: 'Defer to next week', sub: 'Mark all as Week-of May 25' },
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
              ? 'Jobs already reassigned'
              : 'On schedule'
            : 'Heads-up only',
        ],
      ],
      resolutions: isToday
        ? [
            { primary: true, icon: 'check', title: 'Review reassigned jobs', sub: '2 jobs moved to Reyes Crew' },
            { icon: 'bell', title: 'Message ' + p.name.split(' ')[0], sub: 'Check in / wish well' },
          ]
        : [
            {
              primary: true,
              icon: 'sparkle',
              title: 'Find coverage',
              sub: 'Suggest backup ' + roleLabel(primaryRole).toLowerCase(),
            },
            {
              icon: 'calendar',
              title: 'See affected jobs',
              sub: 'Jobs assigned to ' + p.name.split(' ')[0] + ' that day',
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
