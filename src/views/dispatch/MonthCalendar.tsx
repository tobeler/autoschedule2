// =============================================================
// MonthCalendar — full 6×7 month grid with capacity heatmap.
//
// In Tech-group mode, the layout flips to a per-person horizontal
// strip (one row per active person × N day-columns for the month),
// cells colored by daily load:
//   ≤2h → low, 2–5h → med, 5–8h → high, 8–10h → full, >10h → over.
// =============================================================
import { Fragment } from 'react';
import type { DragEvent } from 'react';
import type { Job, Person } from '../../types';
import { addDays, dateKey, fmtTime, TODAY } from '../../data/helpers';
import { JOB_TYPES, ROLES } from '../../data/seed';
import { getCrew, getCustomer, getPerson } from '../../data/selectors';
import { Avatar } from '../../components/Avatar';
import { useStore } from '../../store';

type GroupKind = 'crew' | 'truck' | 'tech';

interface MonthCalendarProps {
  monthDate: Date;
  jobs: Job[];
  groupBy: GroupKind;
  onJobClick: (job: Job) => void;
}

type HeatLevel = 'low' | 'med' | 'high' | 'full' | 'over';

function techCellLevel(personJobs: Job[]): HeatLevel | null {
  const hrs = personJobs.reduce((a, j) => a + (j.durationHrs || 0), 0);
  if (hrs === 0) return null;
  if (hrs <= 2) return 'low';
  if (hrs <= 5) return 'med';
  if (hrs <= 8) return 'high';
  if (hrs <= 10) return 'full';
  return 'over';
}

export function MonthCalendar({
  monthDate,
  jobs,
  groupBy,
  onJobClick,
}: MonthCalendarProps) {
  const allCrews = useStore((s) => s.crews);
  const allPeople = useStore((s) => s.people);
  const allCustomers = useStore((s) => s.customers);
  const allJobs = useStore((s) => s.jobs);
  const moveJob = useStore((s) => s.moveJob);
  const selectJob = useStore((s) => s.selectJob);
  const pushToast = useStore((s) => s.pushToast);
  const todayKey = dateKey(TODAY);

  // Drop handler shared by both the per-tech strip and the 6×7 grid.
  // `personId` is set in tech-strip mode (resolves crewId via defaultCrew).
  // In the 6×7 grid we can't resolve a crew from the cell alone, so we drop
  // with crewId=null and let dispatch pick one via the auto-opened drawer.
  function dropOnDay(
    e: DragEvent<HTMLDivElement>,
    dk: string,
    personId: string | null,
  ) {
    e.currentTarget.classList.remove('calendar-drop-target');
    const jobId = e.dataTransfer.getData('text/job-id');
    if (!jobId) return;
    let crewId: string | null = null;
    let truckId: string | null = null;
    if (personId) {
      const person = getPerson(allPeople, personId);
      const crew = getCrew(allCrews, person?.defaultCrew);
      crewId = crew?.id ?? null;
      truckId = crew?.truck ?? null;
    }
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
  function onDayDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('text/job-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('calendar-drop-target');
  }
  function onDayDragLeave(e: DragEvent<HTMLDivElement>) {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    e.currentTarget.classList.remove('calendar-drop-target');
  }

  // ===== Per-person horizontal strip (Tech mode) =====
  if (groupBy === 'tech') {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    );
    const dayCount = monthEnd.getDate();
    const monthDays = Array.from({ length: dayCount }).map((_, i) =>
      addDays(monthStart, i),
    );
    const monthKeys = monthDays.map(dateKey);
    const monthLabel = monthDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const techs: Person[] = allPeople
      .filter((p) =>
        jobs.some(
          (j) =>
            j.date != null &&
            monthKeys.includes(j.date) &&
            j.slots.some((s) => s.assignedTo === p.id),
        ),
      )
      .slice()
      .sort((a, b) =>
        a.name
          .split(' ')
          .slice(-1)[0]
          .localeCompare(b.name.split(' ').slice(-1)[0]),
      );

    return (
      <div className="calendar-wrap" style={{ padding: 16, overflowY: 'auto' }}>
        <div
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'auto',
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                '180px repeat(' + dayCount + ', minmax(22px, 1fr))',
              position: 'sticky',
              top: 0,
              zIndex: 4,
              background: 'var(--surface-card)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--fg-muted)',
                borderRight: '1px solid var(--border)',
              }}
            >
              Technician · {monthLabel}
            </div>
            {monthDays.map((d) => {
              const dk = dateKey(d);
              const isToday = dk === todayKey;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={dk}
                  style={{
                    padding: '6px 2px',
                    textAlign: 'center',
                    fontSize: 9,
                    fontWeight: 700,
                    color: isToday
                      ? 'var(--jetson-green)'
                      : isWeekend
                      ? 'var(--mid-gray)'
                      : 'var(--fg-muted)',
                    background: isWeekend ? 'var(--bg-subtle)' : 'transparent',
                    borderRight: '1px solid var(--border)',
                    lineHeight: 1.1,
                  }}
                >
                  <div
                    style={{
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      opacity: 0.7,
                      fontSize: 8,
                    }}
                  >
                    {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {techs.length === 0 && (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: 'var(--fg-muted)',
                fontSize: 13,
              }}
            >
              No technicians scheduled this month.
            </div>
          )}

          {/* Person rows */}
          {techs.map((p) => {
            const personMonthJobs = jobs.filter(
              (j) =>
                j.date != null &&
                monthKeys.includes(j.date) &&
                j.slots.some((s) => s.assignedTo === p.id),
            );
            const totalHrs = personMonthJobs.reduce(
              (a, j) => a + (j.durationHrs || 0),
              0,
            );
            const totalDays = new Set(
              personMonthJobs.map((j) => j.date),
            ).size;
            return (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '180px repeat(' + dayCount + ', minmax(22px, 1fr))',
                  borderBottom: '1px solid var(--border)',
                  minHeight: 44,
                }}
              >
                <div
                  style={{
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRight: '1px solid var(--border)',
                    background: 'var(--surface-card)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                  }}
                >
                  <div
                    style={{
                      width: 4,
                      alignSelf: 'stretch',
                      borderRadius: 2,
                      background:
                        getCrew(allCrews, p.defaultCrew)?.color ||
                        'var(--mid-gray)',
                    }}
                  />
                  <Avatar person={p} size="sm" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </div>
                    <div className="muted" style={{ fontSize: 10 }}>
                      {ROLES[p.roles[0]]?.short || p.roles[0]} · {totalDays}d ·{' '}
                      {totalHrs.toFixed(0)}h
                    </div>
                  </div>
                </div>
                {monthDays.map((d) => {
                  const dk = dateKey(d);
                  const dayJobs = personMonthJobs.filter((j) => j.date === dk);
                  const level = techCellLevel(dayJobs);
                  const isToday = dk === todayKey;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const tooltip = dayJobs.length
                    ? dayJobs
                        .map((j) =>
                          (j.startHour != null ? fmtTime(j.startHour) : '—') +
                          ' · ' +
                          (getCustomer(allCustomers, j.customer)?.name ||
                            JOB_TYPES[j.type]?.short ||
                            j.type),
                        )
                        .join('\n')
                    : '';
                  return (
                    <div
                      key={dk + p.id}
                      onClick={() =>
                        dayJobs.length === 1 && onJobClick(dayJobs[0])
                      }
                      onDragOver={onDayDragOver}
                      onDragLeave={onDayDragLeave}
                      onDrop={(e) => dropOnDay(e, dk, p.id)}
                      title={tooltip}
                      style={{
                        position: 'relative',
                        borderRight: '1px solid var(--border)',
                        background: isWeekend
                          ? 'var(--bg-subtle)'
                          : 'var(--surface-card)',
                        cursor: dayJobs.length ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 44,
                      }}
                    >
                      {level && (
                        <div
                          className="heat-overlay"
                          data-level={level}
                          style={{ borderRadius: 0 }}
                        />
                      )}
                      {dayJobs.length > 0 && (
                        <span
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            fontSize: 10,
                            fontWeight: 800,
                            color:
                              level === 'over'
                                ? '#781E1E'
                                : level === 'full' || level === 'high'
                                ? '#6F4400'
                                : '#0F1F0D',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {dayJobs.length > 1 ? dayJobs.length : '·'}
                        </span>
                      )}
                      {isToday && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            outline: '2px solid var(--jetson-green)',
                            outlineOffset: -2,
                            pointerEvents: 'none',
                            zIndex: 2,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div
          className="row"
          style={{
            marginTop: 12,
            gap: 16,
            fontSize: 11,
            color: 'var(--fg-muted)',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontSize: 10,
            }}
          >
            Load per day
          </span>
          {(
            [
              ['low', '≤ 2h'],
              ['med', '2–5h'],
              ['high', '5–8h'],
              ['full', '8–10h'],
              ['over', 'OT'],
            ] as Array<[HeatLevel, string]>
          ).map(([lvl, label]) => (
            <span key={lvl} className="row" style={{ gap: 4 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  display: 'inline-block',
                }}
              >
                <span
                  className="heat-overlay"
                  data-level={lvl}
                  style={{ borderRadius: 0 }}
                />
              </span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ===== 6×7 month grid (default) =====
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDay = first.getDay();
  const start = addDays(first, -startDay);
  const days = Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  const monthLabel = monthDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="calendar-wrap" style={{ padding: 16, overflowY: 'auto' }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div
          style={{
            fontFamily: 'var(--font-subhead)',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {monthLabel}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
          background: 'var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            style={{
              background: 'var(--surface-card)',
              padding: '8px 10px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--fg-muted)',
            }}
          >
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          const dk = dateKey(d);
          const inMonth = d.getMonth() === monthDate.getMonth();
          const isToday = dk === todayKey;
          const cellJobs = jobs.filter((j) => j.date === dk);
          // 10 install-eligible crews × 8h = 80h capacity per day
          const hoursBooked = cellJobs.reduce(
            (a, j) => a + (j.durationHrs || 0),
            0,
          );
          const pct = hoursBooked / 80;
          let heat: HeatLevel | null = null;
          if (cellJobs.length === 0) heat = null;
          else if (pct < 0.25) heat = 'low';
          else if (pct < 0.5) heat = 'med';
          else if (pct < 0.85) heat = 'high';
          else if (pct <= 1) heat = 'full';
          else heat = 'over';
          return (
            <div
              key={i}
              onDragOver={inMonth ? onDayDragOver : undefined}
              onDragLeave={inMonth ? onDayDragLeave : undefined}
              onDrop={inMonth ? (e) => dropOnDay(e, dk, null) : undefined}
              style={{
                background: inMonth
                  ? 'var(--surface-card)'
                  : 'var(--bg-subtle)',
                minHeight: 110,
                padding: 8,
                position: 'relative',
                opacity: inMonth ? 1 : 0.5,
              }}
            >
              {heat && inMonth && (
                <>
                  <div className="heat-overlay" data-level={heat} />
                  <div
                    className="heat-label"
                    style={{ top: 6, right: 6, bottom: 'auto' }}
                  >
                    {Math.round(pct * 100)}%
                  </div>
                </>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: isToday ? 'var(--jetson-green)' : 'transparent',
                    color: isToday ? 'var(--forest)' : 'inherit',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {d.getDate()}
                </span>
                {cellJobs.length > 0 && (
                  <span className="muted" style={{ fontSize: 10 }}>
                    {cellJobs.length}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {cellJobs.slice(0, 3).map((j) => {
                  const c = getCustomer(allCustomers, j.customer);
                  const jt = JOB_TYPES[j.type];
                  return (
                    <Fragment key={j.id}>
                      <div
                        className={'jt-tag ' + (jt?.color || '')}
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                        onClick={() => onJobClick(j)}
                      >
                        <span
                          className="mono"
                          style={{ opacity: 0.7, marginRight: 4 }}
                        >
                          {j.startHour != null ? fmtTime(j.startHour) : ''}
                        </span>
                        {c
                          ? c.name.split(' ')[0]
                          : j.address?.split('·')[0].trim() || '—'}
                      </div>
                    </Fragment>
                  );
                })}
                {cellJobs.length > 3 && (
                  <div
                    className="muted"
                    style={{ fontSize: 10, padding: '0 4px' }}
                  >
                    +{cellJobs.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
