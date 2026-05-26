// =============================================================
// GanttChart — horizontal bars across a 7-day axis (Mon..Sun).
//
// Rows by groupBy (crew | truck — tech rows collapse to default).
// Each job is a single bar positioned by (dayIndex × dayW) + (startHour/24 × dayW).
// Multi-day jobs span continuously when contiguous bars exist in the
// jobs array; we draw a faint continuation rail on every day the job
// touches via the multidayGroupId set.
// =============================================================
import { Fragment } from 'react';
import type { Crew, Job, Truck } from '../../types';
import { addDays, dateKey, TODAY } from '../../data/helpers';
import { getCrew, getCustomer, getJobType } from '../../data/selectors';
import { JobTypeTag } from '../../components/JobTypeTag';
import { useStore } from '../../store';

type GroupKind = 'crew' | 'truck' | 'tech';

interface GanttChartProps {
  startDate: Date;
  groupBy: GroupKind;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

interface GanttRow {
  id: string;
  name: string;
  color: string;
  meta: string;
  jobs: Job[];
}

const DAY_W = 140;
const DAYS = 7;

// Region accent palette mirrors DayCalendar / WeekCalendar.
const REGION_ACCENT: Record<string, string> = {
  CO: '#0EA5E9',
  MA: '#10B981',
  NY: '#8B5CF6',
  BC: '#F59E0B',
  CA: '#F97316',
};

export function GanttChart({
  startDate,
  groupBy,
  jobs,
  onJobClick,
}: GanttChartProps) {
  const allCrews = useStore((s) => s.crews);
  const allTrucks = useStore((s) => s.trucks);
  const allCustomers = useStore((s) => s.customers);

  const days = Array.from({ length: DAYS }).map((_, i) => addDays(startDate, i));
  const todayKey = dateKey(TODAY);

  let rows: GanttRow[];
  if (groupBy === 'truck') {
    rows = allTrucks
      .filter((t) => t.assignedCrew)
      .map<GanttRow>((t: Truck) => {
        const crew = getCrew(allCrews, t.assignedCrew);
        return {
          id: t.id,
          name: t.name,
          color: crew?.color || 'var(--mid-gray)',
          meta: crew?.name || '',
          jobs: jobs.filter((j) => j.truckId === t.id),
        };
      });
  } else {
    // Prepend virtual Zuper-team rows for scheduled jobs whose crewId isn't
    // a real dispatcher crew (same pattern as DayCalendar / WeekCalendar).
    const crewIds = new Set(allCrews.map((c) => c.id));
    const byTeam = new Map<string, Job[]>();
    const noTeam: Job[] = [];
    for (const j of jobs) {
      if (j.startHour == null || j.date == null) continue;
      if (j.crewId && crewIds.has(j.crewId)) continue;
      const t = j.zuperTeamName?.trim() || '';
      if (t) {
        if (!byTeam.has(t)) byTeam.set(t, []);
        byTeam.get(t)!.push(j);
      } else {
        noTeam.push(j);
      }
    }
    const teamRows: GanttRow[] = Array.from(byTeam.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([teamName, teamJobs]) => {
        const prefix = teamName.split('-')[0]?.toUpperCase() ?? '';
        return {
          id: 'zup-team-' + teamName,
          name: teamName,
          color: REGION_ACCENT[prefix] ?? 'var(--mid-gray)',
          meta: 'Zuper team',
          jobs: teamJobs,
        };
      });
    const noTeamRow: GanttRow[] =
      noTeam.length > 0
        ? [
            {
              id: 'zup-no-team',
              name: 'Unassigned (no team)',
              color: 'var(--mid-gray)',
              meta: 'No Zuper team',
              jobs: noTeam,
            },
          ]
        : [];
    const crewRows = allCrews.map<GanttRow>((c: Crew) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      meta: c.type,
      jobs: jobs.filter((j) => j.crewId === c.id),
    }));
    rows = [...teamRows, ...noTeamRow, ...crewRows];
  }

  return (
    <div className="calendar-wrap" style={{ overflowX: 'auto' }}>
      <div
        className="gantt"
        style={{
          ['--gantt-day' as string]: DAY_W + 'px',
          gridTemplateColumns: '240px repeat(' + DAYS + ', ' + DAY_W + 'px)',
        }}
      >
        {/* Header */}
        <div className="gantt-label gantt-header">
          <div className="eyebrow-sm">
            {groupBy === 'truck' ? 'Truck' : 'Crew'}
          </div>
        </div>
        {days.map((d) => {
          const isToday = dateKey(d) === todayKey;
          return (
            <div
              key={dateKey(d)}
              className={'gantt-day-header gantt-header' + (isToday ? ' today' : '')}
            >
              {d.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          );
        })}

        {/* Rows */}
        {rows.map((row) => (
          <Fragment key={row.id}>
            <div className="gantt-label">
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
                <div className="muted small">{row.meta}</div>
              </div>
            </div>
            <div
              className="gantt-track"
              style={{ gridColumn: '2 / -1', position: 'relative' }}
            >
              {row.jobs.map((j) => {
                const dayIdx = days.findIndex((d) => dateKey(d) === j.date);
                if (dayIdx === -1 || j.startHour == null) return null;
                const left = dayIdx * DAY_W + (j.startHour / 24) * DAY_W;
                const width = Math.max(28, (j.durationHrs / 24) * DAY_W);
                const jt = getJobType(j.type);
                const c = getCustomer(allCustomers, j.customer);
                const bgColor = jt
                  ? 'var(--' + jt.color + '-bg)'
                  : 'var(--bg-subtle)';
                // Phase 19 fix: short blocks (< 60px) drop the customer
                // name and only show the job-type tag. Full info on hover.
                const compact = width < 60;
                const customerLabel = c ? c.name : j.address?.split('·')[0] || 'Untitled';
                const title = `${jt?.label ?? j.type} · ${customerLabel} · ${j.durationHrs}h`;
                return (
                  <div
                    key={j.id}
                    className={'gantt-bar ' + (jt?.color || '')}
                    style={{
                      left: left + 'px',
                      width: width + 'px',
                      background: bgColor,
                    }}
                    title={title}
                    onClick={() => onJobClick(j)}
                  >
                    <JobTypeTag type={j.type} />
                    {!compact && (
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {customerLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Fragment>
        ))}

        {rows.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: 40,
              textAlign: 'center',
              color: 'var(--fg-muted)',
              fontSize: 13,
            }}
          >
            No rows to display.
          </div>
        )}
      </div>
    </div>
  );
}
