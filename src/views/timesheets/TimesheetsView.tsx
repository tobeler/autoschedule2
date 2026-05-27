// =============================================================
// Timesheets — week grid auto-derived from job slot assignments.
// Columns are weekdays, rows are people. Cells show hours worked,
// with OT (>10h/day or >40h/week) flagged amber. Per-row status
// (draft / pending / approved) with an Approve button per row.
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
  startOfWeek,
} from '../../data/helpers';
import { getCrew, roleLabel } from '../../data/selectors';
import type { Person } from '../../types';

type SheetStatus = 'draft' | 'pending' | 'approved';

const DAY_OT_THRESHOLD = 10;
const WEEK_OT_THRESHOLD = 40;

export function TimesheetsView() {
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const jobs = useStore((s) => s.jobs);
  const pushToast = useStore((s) => s.pushToast);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(TODAY));
  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Compute hours per person per day from slot assignments
  const hoursMatrix = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    people.forEach((p) => {
      map[p.id] = {};
    });
    weekDays.forEach((d) => {
      const dk = dateKey(d);
      jobs
        .filter((j) => j.date === dk)
        .forEach((j) => {
          j.slots.forEach((s) => {
            if (!s.assignedTo) return;
            if (!map[s.assignedTo]) map[s.assignedTo] = {};
            map[s.assignedTo][dk] = (map[s.assignedTo][dk] || 0) + s.hours;
          });
        });
    });
    return map;
  }, [people, jobs, weekDays]);

  // Per-person weekly totals
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    Object.entries(hoursMatrix).forEach(([pid, days]) => {
      out[pid] = Object.values(days).reduce((s, h) => s + h, 0);
    });
    return out;
  }, [hoursMatrix]);

  // Track row status (in-memory only — store has no timesheet store yet)
  const [statuses, setStatuses] = useState<Record<string, SheetStatus>>(() => {
    const seed: Record<string, SheetStatus> = {};
    people.forEach((p, i) => {
      seed[p.id] = i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'draft' : 'approved';
    });
    return seed;
  });

  function approve(personId: string) {
    setStatuses((s) => ({ ...s, [personId]: 'approved' }));
    pushToast('Timesheet approved');
  }

  // Only show rows for people with some logged hours this week,
  // but always include those with a draft to remind dispatch.
  const visiblePeople = people.filter((p) => (totals[p.id] || 0) > 0);

  const totalHours = Object.values(totals).reduce((s, v) => s + v, 0);
  // Scope KPI counts to people that actually appear in the grid this week.
  // Without this, the seeded 57-person status map produced phantom "19 Pending
  // review" counters while the grid showed "No logged hours" — directly
  // contradictory copy.
  const pendingCount = visiblePeople.filter((p) => statuses[p.id] === 'pending').length;
  const approvedCount = visiblePeople.filter((p) => statuses[p.id] === 'approved').length;
  const otWeekCount = visiblePeople.filter((p) => (totals[p.id] || 0) > WEEK_OT_THRESHOLD)
    .length;

  function shiftWeek(direction: -1 | 1) {
    setWeekStart((w) => addDays(w, 7 * direction));
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Timesheets"
        subtitle={
          'Week of ' +
          fmtDate(weekStart, { month: 'short', day: 'numeric' }) +
          ' · auto-derived from job assignments'
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
        <button
          className="btn btn-primary btn-sm"
          disabled={pendingCount === 0}
          onClick={() => {
            setStatuses((s) => {
              const next = { ...s };
              visiblePeople.forEach((p) => {
                if (next[p.id] === 'pending') next[p.id] = 'approved';
              });
              return next;
            });
            pushToast(`Approved ${pendingCount} timesheet${pendingCount === 1 ? '' : 's'}`);
          }}
        >
          <Icon name="check" size={14} /> Approve all pending
        </button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Total hours</div>
            <div className="kpi-value">{totalHours.toFixed(0)}h</div>
            <div className="kpi-meta">{visiblePeople.length} technicians on the clock</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Pending review</div>
            <div className="kpi-value">{pendingCount}</div>
            <div className="kpi-meta">Need a dispatcher sign-off</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Approved</div>
            <div className="kpi-value">{approvedCount}</div>
            <div className="kpi-meta up">Ready to push to payroll</div>
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
                {weekDays.map((d) => (
                  <th key={dateKey(d)} className="ts-day">
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
                ))}
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePeople.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 36 }}>
                    <Icon name="timer" size={26} stroke="var(--mid-gray)" />
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: 'var(--font-subhead)',
                        fontWeight: 700,
                      }}
                    >
                      No logged hours this week
                    </div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      As soon as a job has a person assigned, their hours appear here.
                    </div>
                  </td>
                </tr>
              )}
              {visiblePeople.map((p) => (
                <TimesheetRow
                  key={p.id}
                  person={p}
                  weekDays={weekDays}
                  days={hoursMatrix[p.id] || {}}
                  total={totals[p.id] || 0}
                  status={statuses[p.id] || 'draft'}
                  crewName={getCrew(crews, p.defaultCrew)?.name || '—'}
                  onApprove={() => approve(p.id)}
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
  days: Record<string, number>;
  total: number;
  status: SheetStatus;
  crewName: string;
  onApprove: () => void;
}

function TimesheetRow({
  person,
  weekDays,
  days,
  total,
  status,
  crewName,
  onApprove,
}: RowProps) {
  const weekOver = total > WEEK_OT_THRESHOLD;
  return (
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
        const h = days[dk] || 0;
        const over = h > DAY_OT_THRESHOLD;
        return (
          <td
            key={dk}
            className={'ts-day' + (h === 0 ? ' empty' : '') + (over ? ' over' : '')}
            title={over ? h + 'h · over daily OT threshold' : undefined}
          >
            {h === 0 ? '—' : h.toFixed(h % 1 === 0 ? 0 : 1)}
          </td>
        );
      })}
      <td
        className={'ts-day' + (weekOver ? ' over' : '')}
        style={{ textAlign: 'right', fontWeight: 700 }}
      >
        {total.toFixed(total % 1 === 0 ? 0 : 1)}h
      </td>
      <td>
        <span className={'ts-status ' + status}>
          {status === 'draft'
            ? 'Draft'
            : status === 'pending'
              ? 'Pending'
              : 'Approved'}
        </span>
      </td>
      <td>
        {status !== 'approved' ? (
          <button className="btn btn-primary btn-sm" onClick={onApprove}>
            <Icon name="check" size={12} /> Approve
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm muted" disabled>
            <Icon name="check" size={12} /> Approved
          </button>
        )}
      </td>
    </tr>
  );
}
