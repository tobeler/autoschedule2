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

  // 3. MISSING COMMISSIONING (synthetic, anchored to J-2614)
  items.push({
    id: 'mc-J-2614',
    sev: 'urgent',
    cat: 'field',
    icon: 'info',
    title: 'Commissioning photos overdue on J-2614',
    desc:
      "Tyree's heat pump install at Margaret Chen is past the 4-hour mark · no commissioning photos uploaded yet",
    meta: [
      { kind: 'due', label: 'On site 4h+' },
      { kind: 'tag', label: 'HP Install' },
    ],
    context: [
      ['Job', 'J-2614 · Heat pump install'],
      ['Crew', 'Holloway Crew · Tyree Booker (lead)'],
      ['Customer', 'Margaret Chen · Newton'],
      ['Status', 'On site since 8:00a'],
      ['Photos', 'Before (4) · During (6) · After (0)'],
    ],
    resolutions: [
      { primary: true, icon: 'phone', title: 'Ping Tyree on his phone', sub: 'Send "submit commissioning photos" prompt' },
      { icon: 'bell', title: 'Add note to job', sub: 'Visible in the mobile tech app' },
      { icon: 'check', title: 'Mark not required', sub: 'Customer agreed to skip docs' },
    ],
    jobId: 'J-2614',
  });

  // 3b. SPILLOVER REQUEST (synthetic)
  items.push({
    id: 'spill-J-2611',
    sev: 'urgent',
    cat: 'schedule',
    icon: 'refresh',
    title: 'Spillover: Bennett Crew needs to continue tomorrow',
    desc:
      "Bennett flagged J-2611 at Rachel Sondheim's at 3:42p · electrical pull running long, won't finish today · needs continuation slot",
    meta: [
      { kind: 'due', label: 'Confirm by 5p' },
      { kind: 'tag', label: 'Continuation' },
    ],
    context: [
      ['Job', 'J-2611 · Heat pump install'],
      ['Crew', 'Bennett Crew · Aaliyah Bennett (lead)'],
      ['Customer', 'Rachel Sondheim · Cambridge'],
      ['Status', 'On site · ~6h remaining of 8h scope'],
      ['Reason', 'Electrical pull running 2.5h longer than expected'],
      ['Crew availability tomorrow', 'Free 8a–12p · Highland Pl walk-through 2p'],
    ],
    resolutions: [
      {
        primary: true,
        icon: 'sparkle',
        title: 'Create continuation · tomorrow 8a–12p',
        sub: 'Same crew · auto-links as J-2611 cont.',
        action: 'create_continuation',
      },
      { icon: 'calendar', title: 'Pick a different slot', sub: 'Open Suggest-a-Time with Bennett constraints' },
      { icon: 'user', title: 'Hand off to Reyes Crew', sub: 'They have 9a–12p free tomorrow' },
      { icon: 'bell', title: 'Ask Bennett for ETA estimate', sub: 'Maybe they can still finish today' },
    ],
    jobId: 'J-2611',
  });

  // 4. LATE ETA (synthetic — Park Crew behind)
  items.push({
    id: 'late-park',
    sev: 'warn',
    cat: 'field',
    icon: 'clock',
    title: 'Park Crew running 25 min behind',
    desc:
      'Annual tune-up at Garrett & Sasha M. set for 10:00a · ETA now 10:25a from prior stop',
    meta: [
      { kind: 'soft', label: 'ETA 10:25a' },
      { kind: 'tag', label: 'Service' },
    ],
    context: [
      ['Job', 'J-2630 · Care Plus tune-up'],
      ['Crew', 'Park Crew · Noor Khan'],
      ['Customer', 'Garrett & Sasha M. · Arlington'],
      ['Window', '10:00a – 12:00p'],
      ['Projected', '10:25a · 25 min late'],
    ],
    resolutions: [
      { primary: true, icon: 'bell', title: 'Send "running late" SMS', sub: 'Templated · arrival in ~25 min' },
      { icon: 'refresh', title: 'Reassign to nearer crew', sub: 'Reyes Crew is 8 min from the address' },
      { icon: 'calendar', title: 'Reschedule for afternoon', sub: "Move to Park's 13:00 slot" },
    ],
    jobId: 'J-2630',
  });

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

  // 6. TIGHT DRIVE WINDOW (synthetic)
  items.push({
    id: 'drive-J-2641',
    sev: 'warn',
    cat: 'field',
    icon: 'truck',
    title: 'Tight drive window into J-2641',
    desc:
      'Reyes Crew ends Brookline install at 4:30p · sales walk-through at Highland Pl starts 4:30p · only 18 min of buffer',
    meta: [
      { kind: 'soft', label: '18 min buffer' },
      { kind: 'tag', label: 'Conflict' },
    ],
    context: [
      ['Stop 1', 'J-2615 · Brookline · ends 4:30p'],
      ['Stop 2', 'J-2641 · Highland Pl · starts 4:30p'],
      ['Drive', '18 min via I-90 E'],
      ['Risk', 'Customer waiting, no slack'],
    ],
    resolutions: [
      { primary: true, icon: 'refresh', title: 'Push J-2641 to 5:00p', sub: 'Notify customer · 30 min buffer' },
      { icon: 'user', title: 'Reassign walk-through to Theo', sub: "He's free at 4:30p in Cambridge" },
    ],
    jobId: 'J-2641',
  });

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

  // 8. WEATHER (info)
  items.push({
    id: 'wx-fri',
    sev: 'info',
    cat: 'heads_up',
    icon: 'sparkle',
    title: 'Rain forecast Friday afternoon',
    desc:
      '3 outdoor unit installs scheduled · 60% chance of heavy rain after 2p · plan for tarps + delays',
    meta: [
      { kind: 'soft', label: 'Fri May 22' },
      { kind: 'tag', label: '3 jobs' },
    ],
    context: [
      ['Forecast', 'Heavy rain, 60% PM · NWS'],
      ['Affected jobs', 'J-2664 · J-2670 · J-2673'],
      ['Crews', 'Bennett · Holloway · Sales'],
    ],
    resolutions: [
      { primary: true, icon: 'calendar', title: 'Move outdoor work to AM', sub: 'Reorder Friday stops · indoor jobs last' },
      { icon: 'bell', title: 'Notify affected customers', sub: 'Templated weather alert' },
    ],
  });

  // 9. CUSTOMER NOTE (info)
  items.push({
    id: 'note-margaret',
    sev: 'info',
    cat: 'heads_up',
    icon: 'bell',
    title: 'Customer note · Margaret Chen',
    desc:
      '"Small dog, friendly but skittish — please call before entering side gate." · captured at booking',
    meta: [
      { kind: 'soft', label: 'J-2614' },
      { kind: 'tag', label: 'Note' },
    ],
    context: [
      ['Customer', 'Margaret Chen'],
      ['Job', 'J-2614 · Heat pump install'],
      ['Captured', 'May 18 · booking call'],
      ['Visible to tech?', 'Yes — also in mobile app'],
    ],
    resolutions: [
      { primary: true, icon: 'check', title: 'Acknowledge', sub: 'Mark as seen' },
      { icon: 'bell', title: 'Add to job notes', sub: 'Forward to Tyree' },
    ],
    jobId: 'J-2614',
  });

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
