// =============================================================
// WeekCalendar — Mon–Fri grid × rows (crew / truck / tech).
//
// Weekday-only (the prototype intentionally skips weekends).
// Each crew-day cell:
//   - capacity heatmap overlay via lib/capacity.ts (counts primary + loan hours)
//   - inline job cards (compact JobBlock-flavored, no resize)
//   - loan blocks on crew rows when one of the crew's techs is staffed
//     into another crew's job
// =============================================================
import { Fragment } from 'react';
import type { DragEvent } from 'react';
import type { Crew, Job, JobSlot, Person, Truck } from '../../types';
import { Icon } from '../../components/Icon';
import { ROLES } from '../../data/seed';
import {
  addDays,
  dateKey,
  fmtTime,
  hoursToStr,
  TODAY,
} from '../../data/helpers';
import { getCrew, getCustomer, getJobType, getPerson } from '../../data/selectors';
import { useStore } from '../../store';

type GroupKind = 'crew' | 'truck' | 'tech';

interface WeekCalendarProps {
  startDate: Date;
  groupBy: GroupKind;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

type RowKind = 'crew' | 'truck' | 'tech' | 'zuper-team';
interface WeekRow {
  id: string;
  name: string;
  color: string;
  meta: string;
  kind: RowKind;
  /** For zuper-team rows: the Zuper team_name used to filter jobs. */
  zuperTeamName?: string;
}

// Region accent palette for Zuper team rows. Same colors as DayCalendar.
const REGION_ACCENT: Record<string, string> = {
  CO: '#0EA5E9',
  MA: '#10B981',
  NY: '#8B5CF6',
  BC: '#F59E0B',
  CA: '#F97316',
};

interface LoanBlock {
  job: Job;
  slot: JobSlot;
  person: Person;
}

type HeatLevel = 'low' | 'med' | 'high' | 'full' | 'over';

function bucketForHours(hours: number, dailyCap: number): HeatLevel | null {
  if (hours === 0) return null;
  const pct = hours / dailyCap;
  if (pct < 0.25) return 'low';
  if (pct < 0.5) return 'med';
  if (pct < 0.85) return 'high';
  if (pct <= 1) return 'full';
  return 'over';
}

export function WeekCalendar({
  startDate,
  groupBy,
  jobs,
  onJobClick,
}: WeekCalendarProps) {
  const allCrews = useStore((s) => s.crews);
  const allTrucks = useStore((s) => s.trucks);
  const allPeople = useStore((s) => s.people);
  const allCustomers = useStore((s) => s.customers);
  const allJobs = useStore((s) => s.jobs);
  const moveJob = useStore((s) => s.moveJob);
  const selectJob = useStore((s) => s.selectJob);
  const pushToast = useStore((s) => s.pushToast);

  const days = Array.from({ length: 5 }).map((_, i) => addDays(startDate, i));
  const weekKeys = days.map(dateKey);
  const todayKey = dateKey(TODAY);

  // Resolve a (crewId, truckId) target for a row given the active groupBy.
  // crew rows → row id is the crew id (truckId comes from the crew's default).
  // truck rows → row id is the truck id (crewId comes from the truck's assignment).
  // tech rows → row id is the person id (crewId from defaultCrew, truck from that crew).
  // zuper-team rows → no dispatcher crew exists; drop with null so the drawer
  //   opens for review (same convention as MonthCalendar 6×7 grid).
  function rowAssignment(row: WeekRow): { crewId: string | null; truckId: string | null } {
    if (row.kind === 'crew') {
      const crew = getCrew(allCrews, row.id);
      return { crewId: row.id, truckId: crew?.truck ?? null };
    }
    if (row.kind === 'truck') {
      const truck = allTrucks.find((t) => t.id === row.id);
      return { crewId: truck?.assignedCrew ?? null, truckId: row.id };
    }
    if (row.kind === 'zuper-team') {
      return { crewId: null, truckId: null };
    }
    // tech
    const person = getPerson(allPeople, row.id);
    const crew = getCrew(allCrews, person?.defaultCrew);
    return { crewId: crew?.id ?? null, truckId: crew?.truck ?? null };
  }

  function handleCellDrop(
    e: DragEvent<HTMLDivElement>,
    row: WeekRow,
    dk: string,
  ) {
    const jobId = e.dataTransfer.getData('text/job-id');
    if (!jobId) return;
    const { crewId, truckId } = rowAssignment(row);
    const prevJob = allJobs.find((j) => j.id === jobId);
    const wasUnscheduled = prevJob?.status === 'unscheduled';
    const previouslyFilledCount =
      prevJob?.slots.filter((s) => s.assignedTo).length ?? 0;
    moveJob(jobId, { date: dk, startHour: 8, crewId, truckId });
    if (wasUnscheduled) {
      const updated = useStore.getState().jobs.find((j) => j.id === jobId);
      const newlyFilledCount =
        (updated?.slots.filter((s) => s.assignedTo).length ?? 0) -
        previouslyFilledCount;
      selectJob(jobId, { initialTab: 'crew' });
      if (newlyFilledCount > 0) {
        pushToast(
          `Scheduled ${jobId} · auto-filled ${newlyFilledCount} slot${newlyFilledCount === 1 ? '' : 's'} — review crew.`,
        );
      } else {
        pushToast(`Scheduled ${jobId} — review crew.`);
      }
    } else {
      pushToast('Scheduled ' + jobId);
    }
  }

  let rows: WeekRow[];
  if (groupBy === 'truck') {
    rows = allTrucks
      .filter((t) => t.assignedCrew)
      .map<WeekRow>((t: Truck) => {
        const crew = getCrew(allCrews, t.assignedCrew);
        return {
          id: t.id,
          name: t.name,
          color: crew?.color || 'var(--mid-gray)',
          meta: crew?.name || '',
          kind: 'truck',
        };
      });
  } else if (groupBy === 'tech') {
    rows = allPeople
      .filter((p) =>
        jobs.some(
          (j) =>
            j.date != null &&
            weekKeys.includes(j.date) &&
            j.slots.some((s) => s.assignedTo === p.id),
        ),
      )
      .slice()
      .sort((a, b) =>
        a.name
          .split(' ')
          .slice(-1)[0]
          .localeCompare(b.name.split(' ').slice(-1)[0]),
      )
      .map<WeekRow>((p: Person) => ({
        id: p.id,
        name: p.name,
        color: getCrew(allCrews, p.defaultCrew)?.color || 'var(--mid-gray)',
        meta: (ROLES[p.roles[0]]?.label || p.roles[0]) + ' · ' + p.level,
        kind: 'tech',
      }));
  } else {
    // crew mode: prepend virtual Zuper-team rows for any scheduled jobs in
    // the week whose crewId isn't in the dispatcher's allCrews list. This
    // matches DayCalendar.tsx so all 1,127 Zuper-sourced jobs stay visible.
    const crewIds = new Set(allCrews.map((c) => c.id));
    const teamSet = new Set<string>();
    for (const j of jobs) {
      if (j.date == null || !weekKeys.includes(j.date)) continue;
      if (j.startHour == null) continue;
      if (j.crewId && crewIds.has(j.crewId)) continue;
      const t = j.zuperTeamName?.trim();
      if (t) teamSet.add(t);
    }
    const teamRows: WeekRow[] = Array.from(teamSet)
      .sort((a, b) => a.localeCompare(b))
      .map((teamName) => {
        const prefix = teamName.split('-')[0]?.toUpperCase() ?? '';
        return {
          id: 'zup-team-' + teamName,
          name: teamName,
          color: REGION_ACCENT[prefix] ?? 'var(--mid-gray)',
          meta: 'Zuper team',
          kind: 'zuper-team',
          zuperTeamName: teamName,
        };
      });
    // Any jobs in the week with neither a dispatcher crew nor a Zuper team
    // get one tail row so they remain visible.
    const hasNoTeamUnassigned = jobs.some(
      (j) =>
        j.date != null &&
        weekKeys.includes(j.date) &&
        j.startHour != null &&
        (!j.crewId || !crewIds.has(j.crewId)) &&
        !(j.zuperTeamName?.trim()),
    );
    const noTeamRow: WeekRow[] = hasNoTeamUnassigned
      ? [
          {
            id: 'zup-no-team',
            name: 'Unassigned (no team)',
            color: 'var(--mid-gray)',
            meta: 'No Zuper team',
            kind: 'zuper-team',
            zuperTeamName: '',
          },
        ]
      : [];
    const crewRows = allCrews.map<WeekRow>((c: Crew) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      meta: c.type,
      kind: 'crew',
    }));
    rows = [...teamRows, ...noTeamRow, ...crewRows];
  }

  return (
    <div className="calendar-wrap" style={{ padding: 12, overflow: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px repeat(5, 1fr)',
          gap: 1,
          background: 'var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'var(--surface-card)',
            padding: '10px 14px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--fg-muted)',
          }}
        >
          {groupBy === 'truck' ? 'Truck' : groupBy === 'tech' ? 'Technician' : 'Crew'}
        </div>
        {days.map((d) => {
          const isToday = dateKey(d) === todayKey;
          return (
            <div
              key={dateKey(d)}
              style={{ background: 'var(--surface-card)', padding: '10px 12px' }}
            >
              <div
                className="eyebrow-sm"
                style={{
                  color: isToday ? 'var(--jetson-green)' : 'var(--fg-muted)',
                }}
              >
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div
                className="h4"
                style={{
                  fontFamily: 'var(--font-subhead)',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                {d.getDate()} {d.toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </div>
          );
        })}

        {rows.map((row) => (
          <Fragment key={row.id}>
            <div
              style={{
                background: 'var(--surface-card)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRight: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 28,
                  borderRadius: 2,
                  background: row.color,
                }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{row.name}</div>
                <div className="muted small" style={{ fontSize: 10 }}>
                  {row.meta}
                </div>
              </div>
            </div>
            {days.map((d) => {
              const dk = dateKey(d);
              const primaryJobs = jobs.filter((j) => {
                if (j.date !== dk) return false;
                if (row.kind === 'truck') return j.truckId === row.id;
                if (row.kind === 'tech')
                  return j.slots.some((s) => s.assignedTo === row.id);
                if (row.kind === 'zuper-team') {
                  // Only count jobs whose crew isn't a real dispatcher crew —
                  // otherwise we'd double-count when both a crewId and team
                  // exist. Match by exact team name (empty string = no-team row).
                  const isUnassigned = !j.crewId || !allCrews.some((c) => c.id === j.crewId);
                  if (!isUnassigned) return false;
                  const t = j.zuperTeamName?.trim() || '';
                  return t === (row.zuperTeamName ?? '');
                }
                return j.crewId === row.id;
              });
              const loanBlocks: LoanBlock[] =
                row.kind === 'crew'
                  ? jobs.flatMap((j) => {
                      if (j.date !== dk) return [];
                      if (j.crewId === row.id) return [];
                      const out: LoanBlock[] = [];
                      j.slots.forEach((s) => {
                        if (!s.assignedTo) return;
                        const person = getPerson(allPeople, s.assignedTo);
                        if (!person) return;
                        if (person.defaultCrew !== row.id) return;
                        out.push({ job: j, slot: s, person });
                      });
                      return out;
                    })
                  : [];

              const primaryHours = primaryJobs.reduce(
                (a, j) => a + (j.durationHrs || 0),
                0,
              );
              const loanHours = loanBlocks.reduce((a, b) => a + b.slot.hours, 0);
              const hoursBooked = primaryHours + loanHours;
              const level = bucketForHours(hoursBooked, 8);
              const pct = hoursBooked / 8;

              return (
                <div
                  key={dk + row.id}
                  className="week-day-cell"
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('text/job-id')) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    e.currentTarget.classList.add('calendar-drop-target');
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    e.currentTarget.classList.remove('calendar-drop-target');
                  }}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove('calendar-drop-target');
                    handleCellDrop(e, row, dk);
                  }}
                  style={{
                    background: 'var(--surface-card)',
                    padding: 6,
                    minHeight: 96,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    position: 'relative',
                  }}
                >
                  {level && (
                    <>
                      <div className="heat-overlay" data-level={level} />
                      <div className="heat-label">{Math.round(pct * 100)}%</div>
                    </>
                  )}
                  {primaryJobs.map((j) => {
                    const c = getCustomer(allCustomers, j.customer);
                    const jt = getJobType(j.type);
                    return (
                      <div
                        key={j.id}
                        className={'job-block ' + (jt?.color || '')}
                        style={{
                          position: 'relative',
                          zIndex: 1,
                          height: 'auto',
                          minHeight: 0,
                          padding: '5px 8px',
                        }}
                        onClick={() => onJobClick(j)}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            opacity: 0.8,
                          }}
                        >
                          {j.startHour != null
                            ? fmtTime(j.startHour) + ' · ' + hoursToStr(j.durationHrs)
                            : hoursToStr(j.durationHrs)}
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 12,
                            lineHeight: 1.1,
                          }}
                        >
                          {c
                            ? c.name
                            : j.address?.split('·')[0].trim() || 'Untitled'}
                        </div>
                      </div>
                    );
                  })}
                  {loanBlocks.map(({ job: j, slot: s, person }, i) => {
                    const homeCrew = getCrew(allCrews, j.crewId);
                    const startH = (j.startHour || 0) + (s.start || 0);
                    return (
                      <div
                        key={'loan-' + j.id + '-' + i}
                        className="job-loan-block"
                        title={
                          person.name +
                          ' loaned to ' +
                          (homeCrew?.name || 'another crew') +
                          ' for ' +
                          j.id
                        }
                        onClick={() => onJobClick(j)}
                      >
                        <div
                          className="job-loan-stripe"
                          style={{
                            background: homeCrew?.color || 'var(--mid-gray)',
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="job-loan-head">
                            <Icon name="refresh" size={9} /> LOAN ·{' '}
                            {ROLES[s.role]?.short || s.role}
                          </div>
                          <div className="job-loan-time">
                            {fmtTime(startH)}–{fmtTime(startH + s.hours)} ·{' '}
                            {hoursToStr(s.hours)}
                          </div>
                          <div className="job-loan-host">
                            @ {homeCrew?.name || '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {primaryJobs.length === 0 && loanBlocks.length === 0 && (
                    <div
                      style={{
                        height: '100%',
                        minHeight: 60,
                        border: '1px dashed var(--border)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--mid-gray)',
                        fontSize: 10,
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
