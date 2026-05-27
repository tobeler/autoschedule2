// =============================================================
// Timesheets — week grid showing REAL clocked-in/out hours.
//
// Data source: `time_entries` rows (synced from Zuper, or synthetic
// for demo mode). Two granularities surface in the UI:
//   - **Daily total** per person = min(clockIn) → max(clockOut)
//     across that person's entries for the day. Captures the
//     bookended shift, ignoring lunch gaps.
//   - **Per-job breakdown** (expanded row): each time_entry tied
//     to a job, with clock-in / clock-out and hours.
//
// Approval workflow is intentionally gone — no statuses, no
// Approve buttons, no "pending review" KPI. These never persisted.
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import {
  TODAY,
  addDays,
  dateKey,
  fmtDate,
  fmtTime,
  startOfWeek,
} from '../../data/helpers';
import { getCrew, roleLabel } from '../../data/selectors';
import type { Job, Person, TimeEntry } from '../../types';

const DAY_OT_THRESHOLD = 10;
const WEEK_OT_THRESHOLD = 40;

interface DayBreakdown {
  /** Hours from first clock-in to last clock-out (bookended shift). */
  totalHours: number;
  /** Per-job entries the dispatcher can drill into. */
  byJob: Array<{
    jobId: string | null;
    jobTitle: string;
    entries: TimeEntry[];
    hours: number;
  }>;
  /** Person had clock data this day (so we can distinguish 0h from "no data"). */
  hasData: boolean;
}

/** Build {personId → {dateKey → DayBreakdown}} for the requested week. */
function bucketEntries(
  entries: TimeEntry[],
  jobs: Job[],
  weekKeys: Set<string>,
): Record<string, Record<string, DayBreakdown>> {
  const jobLookup = new Map(jobs.map((j) => [j.id, j]));
  const result: Record<string, Record<string, DayBreakdown>> = {};

  // Group entries by person → dateKey → jobId.
  const personDayJob: Record<
    string,
    Record<string, Record<string, TimeEntry[]>>
  > = {};

  for (const e of entries) {
    const clockInDate = new Date(e.clockIn);
    // Bucket by local-day of the clock-in. Mirrors how dispatchers think
    // about shifts ("what did Bob work on Tuesday?").
    const dk = dateKey(clockInDate);
    if (!weekKeys.has(dk)) continue;
    if (!personDayJob[e.personId]) personDayJob[e.personId] = {};
    if (!personDayJob[e.personId][dk]) personDayJob[e.personId][dk] = {};
    const jobKey = e.jobId ?? '__shift__';
    if (!personDayJob[e.personId][dk][jobKey])
      personDayJob[e.personId][dk][jobKey] = [];
    personDayJob[e.personId][dk][jobKey].push(e);
  }

  for (const [personId, byDay] of Object.entries(personDayJob)) {
    result[personId] = {};
    for (const [dk, byJob] of Object.entries(byDay)) {
      const allEntries: TimeEntry[] = Object.values(byJob).flat();
      // Daily-total = bookended span. We use min(in) → max(out) so a
      // person who clocked 8a-noon and 1p-5p shows 9h, not 8h. This
      // matches HVAC payroll convention (the unpaid lunch isn't deducted
      // by the dispatch view — payroll runs that math elsewhere).
      let minIn = Infinity;
      let maxOut = -Infinity;
      let stillOnClock = false;
      for (const e of allEntries) {
        const inMs = new Date(e.clockIn).getTime();
        if (inMs < minIn) minIn = inMs;
        if (!e.clockOut) {
          stillOnClock = true;
          continue;
        }
        const outMs = new Date(e.clockOut).getTime();
        if (outMs > maxOut) maxOut = outMs;
      }
      let totalHours = 0;
      if (Number.isFinite(minIn) && Number.isFinite(maxOut) && maxOut > minIn) {
        totalHours = (maxOut - minIn) / 3_600_000;
      } else if (stillOnClock && Number.isFinite(minIn)) {
        // Still on the clock — show running hours from min clock-in to now.
        totalHours = (Date.now() - minIn) / 3_600_000;
      }

      const byJobSorted = Object.entries(byJob)
        .map(([jobKey, jobEntries]) => {
          jobEntries.sort(
            (a, b) =>
              new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime(),
          );
          let hours = 0;
          for (const e of jobEntries) {
            if (!e.clockOut) continue;
            hours +=
              (new Date(e.clockOut).getTime() -
                new Date(e.clockIn).getTime()) /
              3_600_000;
          }
          const job = jobKey === '__shift__' ? null : jobLookup.get(jobKey);
          const jobTitle =
            jobKey === '__shift__'
              ? 'Shift (unattributed)'
              : job?.title ||
                (job ? `${job.type} · ${job.id}` : `Job ${jobKey}`);
          return {
            jobId: jobKey === '__shift__' ? null : jobKey,
            jobTitle,
            entries: jobEntries,
            hours,
          };
        })
        .sort((a, b) => {
          const ai = new Date(a.entries[0].clockIn).getTime();
          const bi = new Date(b.entries[0].clockIn).getTime();
          return ai - bi;
        });

      result[personId][dk] = {
        totalHours,
        byJob: byJobSorted,
        hasData: allEntries.length > 0,
      };
    }
  }

  return result;
}

export function TimesheetsView() {
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const jobs = useStore((s) => s.jobs);
  const timeEntries = useStore((s) => s.timeEntries);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(TODAY));
  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekKeys = useMemo(
    () => new Set(weekDays.map(dateKey)),
    [weekDays],
  );

  // Which rows are expanded (per-person breakdown visible).
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(
    () => new Set(),
  );
  // Selected day for expansion. Defaults to the first weekday with data; the
  // user can click a day header to refocus.
  const [focusedDay, setFocusedDay] = useState<string>(() =>
    dateKey(weekDays[0]),
  );

  const breakdown = useMemo(
    () => bucketEntries(timeEntries, jobs, weekKeys),
    [timeEntries, jobs, weekKeys],
  );

  // Per-person weekly totals (sum of daily totals).
  const weeklyTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [pid, days] of Object.entries(breakdown)) {
      let sum = 0;
      for (const d of Object.values(days)) sum += d.totalHours;
      out[pid] = sum;
    }
    return out;
  }, [breakdown]);

  // Only show rows with any clock data this week.
  const visiblePeople = people
    .filter((p) => (weeklyTotals[p.id] || 0) > 0)
    .sort((a, b) => (weeklyTotals[b.id] || 0) - (weeklyTotals[a.id] || 0));

  const totalHours = Object.values(weeklyTotals).reduce((s, v) => s + v, 0);
  const otWeekCount = visiblePeople.filter(
    (p) => (weeklyTotals[p.id] || 0) > WEEK_OT_THRESHOLD,
  ).length;
  const otDayCount = visiblePeople.reduce((acc, p) => {
    const days = breakdown[p.id] ?? {};
    for (const d of Object.values(days)) {
      if (d.totalHours > DAY_OT_THRESHOLD) acc += 1;
    }
    return acc;
  }, 0);

  function shiftWeek(direction: -1 | 1) {
    setWeekStart((w) => addDays(w, 7 * direction));
  }

  function toggleExpanded(personId: string) {
    setExpandedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function expandAll(forDay: string) {
    setFocusedDay(forDay);
    setExpandedPeople(new Set(visiblePeople.map((p) => p.id)));
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Timesheets"
        subtitle={
          'Week of ' +
          fmtDate(weekStart, { month: 'short', day: 'numeric' }) +
          ' · clock-in / clock-out from Zuper'
        }
      >
        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => shiftWeek(-1)}
            title="Previous week"
          >
            <Icon name="chevron_left" size={14} />
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setWeekStart(startOfWeek(TODAY))}
          >
            This week
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => shiftWeek(1)}
            title="Next week"
          >
            <Icon name="chevron_right" size={14} />
          </button>
        </div>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Total hours</div>
            <div className="kpi-value">{totalHours.toFixed(0)}h</div>
            <div className="kpi-meta">
              {visiblePeople.length} technician
              {visiblePeople.length === 1 ? '' : 's'} on the clock
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Over 10h in a day</div>
            <div className="kpi-value">{otDayCount}</div>
            <div className="kpi-meta">Daily OT spikes this week</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Over 40h this week</div>
            <div className="kpi-value">{otWeekCount}</div>
            <div className="kpi-meta">Flagged amber on the grid</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ts-grid">
            <thead>
              <tr>
                <th>Technician</th>
                {weekDays.map((d) => {
                  const dk = dateKey(d);
                  const isFocused = dk === focusedDay;
                  return (
                    <th
                      key={dk}
                      className="ts-day"
                      onClick={() => expandAll(dk)}
                      style={{
                        cursor: 'pointer',
                        background: isFocused
                          ? 'var(--accent-soft, rgba(0,0,0,0.04))'
                          : undefined,
                      }}
                      title="Click to expand all rows for this day"
                    >
                      <div style={{ fontSize: 11, fontWeight: 800 }}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div
                        className="muted"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          marginTop: 2,
                        }}
                      >
                        {d.getMonth() + 1}/{d.getDate()}
                      </div>
                    </th>
                  );
                })}
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {visiblePeople.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 36 }}>
                    <Icon name="timer" size={26} stroke="var(--mid-gray)" />
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: 'var(--font-subhead)',
                        fontWeight: 700,
                      }}
                    >
                      No clocked hours this week
                    </div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      As soon as a technician clocks in, their hours appear
                      here.
                    </div>
                  </td>
                </tr>
              )}
              {visiblePeople.map((p) => (
                <TimesheetRow
                  key={p.id}
                  person={p}
                  weekDays={weekDays}
                  days={breakdown[p.id] ?? {}}
                  total={weeklyTotals[p.id] || 0}
                  crewName={getCrew(crews, p.defaultCrew)?.name || '—'}
                  expanded={expandedPeople.has(p.id)}
                  focusedDay={focusedDay}
                  onToggle={() => toggleExpanded(p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

interface RowProps {
  person: Person;
  weekDays: Date[];
  days: Record<string, DayBreakdown>;
  total: number;
  crewName: string;
  expanded: boolean;
  focusedDay: string;
  onToggle: () => void;
}

function TimesheetRow({
  person,
  weekDays,
  days,
  total,
  crewName,
  expanded,
  focusedDay,
  onToggle,
}: RowProps) {
  const weekOver = total > WEEK_OT_THRESHOLD;
  const focusedBreakdown = days[focusedDay];
  return (
    <>
      <tr>
        <td>
          <div className="row" style={{ gap: 10 }}>
            <Avatar person={person} />
            <div>
              <div style={{ fontWeight: 600 }}>{person.name}</div>
              <div className="muted small">
                {roleLabel(person.roles[0])} · {crewName}
              </div>
            </div>
          </div>
        </td>
        {weekDays.map((d) => {
          const dk = dateKey(d);
          const bd = days[dk];
          const h = bd?.totalHours ?? 0;
          const hasData = bd?.hasData ?? false;
          const over = h > DAY_OT_THRESHOLD;
          return (
            <td
              key={dk}
              className={
                'ts-day' +
                (!hasData ? ' empty' : '') +
                (over ? ' over' : '')
              }
              title={
                over
                  ? h.toFixed(1) + 'h · over daily OT threshold'
                  : hasData
                    ? h.toFixed(1) + 'h clocked'
                    : 'No clock data'
              }
            >
              {hasData ? h.toFixed(h % 1 === 0 ? 0 : 1) : '—'}
            </td>
          );
        })}
        <td
          className={'ts-day' + (weekOver ? ' over' : '')}
          style={{ textAlign: 'right', fontWeight: 700 }}
        >
          {total.toFixed(total % 1 === 0 ? 0 : 1)}h
        </td>
        <td style={{ textAlign: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onToggle}
            title={expanded ? 'Hide per-job breakdown' : 'Show per-job breakdown'}
            aria-expanded={expanded}
            style={{ padding: '4px 6px' }}
          >
            <Icon
              name={expanded ? 'chevron_up' : 'chevron_down'}
              size={14}
            />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={weekDays.length + 3} style={{ padding: 0 }}>
            <div
              style={{
                background: 'var(--surface-2, rgba(0,0,0,0.02))',
                padding: '12px 18px 14px 56px',
                borderTop: '1px solid var(--border, rgba(0,0,0,0.06))',
              }}
            >
              <div
                className="muted small"
                style={{ marginBottom: 6, fontWeight: 700 }}
              >
                {focusedBreakdown
                  ? `${fmtDate(new Date(focusedDay + 'T00:00:00'), {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })} · ${focusedBreakdown.byJob.length} job${
                      focusedBreakdown.byJob.length === 1 ? '' : 's'
                    }`
                  : `No clock data on ${fmtDate(
                      new Date(focusedDay + 'T00:00:00'),
                      { weekday: 'long', month: 'short', day: 'numeric' },
                    )}`}
              </div>
              {focusedBreakdown && focusedBreakdown.byJob.length > 0 ? (
                <table
                  className="ts-grid"
                  style={{ width: '100%', tableLayout: 'fixed' }}
                >
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th style={{ width: 110 }}>Clock-in</th>
                      <th style={{ width: 110 }}>Clock-out</th>
                      <th style={{ width: 80, textAlign: 'right' }}>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {focusedBreakdown.byJob.map((job, idx) => {
                      const first = job.entries[0];
                      const last = job.entries[job.entries.length - 1];
                      return (
                        <tr key={(job.jobId ?? '__shift__') + idx}>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <div style={{ fontWeight: 600 }}>{job.jobTitle}</div>
                            {job.jobId && (
                              <div className="muted small">{job.jobId}</div>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {fmtClockTime(first.clockIn)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {last.clockOut
                              ? fmtClockTime(last.clockOut)
                              : 'On clock'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {job.hours.toFixed(job.hours % 1 === 0 ? 0 : 2)}h
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function fmtClockTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() + d.getMinutes() / 60;
  return fmtTime(h);
}
