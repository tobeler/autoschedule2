// =============================================================
// SuggestTimePicker — Google-Calendar style availability grid.
// - Weekday-only (Mon–Fri) window; chevrons advance by full weeks.
// - For each crew × day, compute earliest valid fit (single- or
//   multi-day) respecting business hours, lead-PTO, primary bookings,
//   AND loan-out commitments (member assigned to another crew's job).
// - Side panel ranks the top fits.
// - Mode toggle: "Best fits" (grid) vs "Pick exact time" (manual entry
//   with explicit conflict listing — for phone-call scheduling).
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';

import {
  getCrew,
  getCustomer,
  getJobType,
  getPerson,
  getTruck,
  roleShort,
} from '../data/selectors';
import { ROLES } from '../data/seed';
import { addDays, dateKey, fmtTime, TODAY } from '../data/helpers';
import {
  effectiveCrewForPerson,
  effectiveCrewMembers,
} from '../lib/crewEffective';
import { useStore } from '../store';
import type {
  Crew,
  Job,
  JobSlot,
  Person,
  TimeOff,
} from '../types';

import { WizardStyles } from './NewJobWizard/wizardStyles';

// =============================================================
// Picker-facing job: only what the picker actually reads.
// =============================================================
export interface PickerJob {
  type: string;
  slots: JobSlot[];
  customer?: string | null;
  address?: string;
  /** Override duration; if absent derived from slots. */
  durationHrs?: number;
}

export interface PickedSlot {
  crewId: string;
  dateKey: string;
  startHour: number;
  endHour: number;
  endDateKey: string;
  daysSpanned: number;
  allowConflicts?: boolean;
}

interface PickerProps {
  job: PickerJob;
  defaultDate?: Date;
  value: PickedSlot | null;
  onChange: (slot: PickedSlot) => void;
  height?: number;
}

interface BusinessHours {
  start: number;
  end: number;
}

interface PerDay {
  day: Date;
  dk: string;
  /** Combined "occupied" intervals: primary jobs + loan commitments */
  blocks: Array<{ startHour: number; durationHrs: number; isLoan?: boolean }>;
  leadOff: boolean;
}

interface DayFit {
  crewId: string;
  dateKey: string;
  day: Date;
  fit: {
    startHour: number;
    endHour: number;
    daysSpanned: number;
    endDateKey: string;
    endDay: Date;
    hoursBooked: number;
  } | null;
  reason: string | null;
}

interface RankedFit extends DayFit {
  score: number;
  reasons: Array<{ tone: 'good' | 'warn' | 'bad'; icon: 'check' | 'clock' | 'sparkle' | 'map_pin' | 'info'; text: string }>;
}

// =============================================================
// Helper — derive the loan blocks a crew sees because one of its
// members is staffed on someone else's job that day.
// =============================================================
function loanBlocksFor(
  crew: Crew,
  dk: string,
  jobs: Job[],
  people: Person[],
  overrides: import('../types').CrewRosterOverride[],
): Array<{ startHour: number; durationHrs: number; isLoan: true }> {
  const out: Array<{ startHour: number; durationHrs: number; isLoan: true }> = [];
  jobs.forEach((j) => {
    if (j.date !== dk) return;
    if (j.crewId === crew.id) return;
    if (j.startHour == null) return;
    j.slots.forEach((s) => {
      if (!s.assignedTo) return;
      const p = getPerson(people, s.assignedTo);
      if (!p) return;
      const slotStart = (j.startHour ?? 0) + (s.start || 0);
      if (effectiveCrewForPerson(people, overrides, dk, p.id, slotStart) !== crew.id) return;
      out.push({
        startHour: slotStart,
        durationHrs: s.hours,
        isLoan: true,
      });
    });
  });
  return out;
}

// =============================================================
// PICKER
// =============================================================
export function SuggestTimePicker({ job, defaultDate, value, onChange, height = 460 }: PickerProps) {
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const customers = useStore((s) => s.customers);
  const jobs = useStore((s) => s.jobs);
  const timeOff = useStore((s) => s.timeOff);
  const templates = useStore((s) => s.templates);
  const rosterOverrides = useStore((s) => s.crewRosterOverrides);

  // Snap window start to a Monday on/after defaultDate (skip weekends).
  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = defaultDate ? new Date(defaultDate) : addDays(TODAY, 1);
    const wd = d.getDay(); // 0=Sun..6=Sat
    const offset = wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd;
    return addDays(d, offset);
  });
  const [includeCrews, setIncludeCrews] = useState<string[] | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours>({ start: 7, end: 17 });
  const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null);
  const [mode, setMode] = useState<'suggested' | 'exact'>('suggested');

  // EXACT mode local state
  const [exactDate, setExactDate] = useState<string>(() =>
    dateKey(defaultDate ?? addDays(TODAY, 1)),
  );
  const [exactTime, setExactTime] = useState<number>(14);
  const [exactCrewId, setExactCrewId] = useState<string | null>(null);
  const [exactAllowConflict, setExactAllowConflict] = useState(false);

  const dayCount = 5; // Mon–Fri
  const days = useMemo(
    () => Array.from({ length: dayCount }).map((_, i) => addDays(windowStart, i)),
    [windowStart],
  );
  const workdayLen = businessHours.end - businessHours.start;

  // Required roles drive eligible crews + the "duration" calc.
  const requiredRoles = useMemo(() => {
    const src = job.slots.length ? job.slots : (templates[job.type]?.slots ?? []);
    return src.filter((s) => !s.optional).map((s) => ({ role: s.role, level: s.level || 'L1' }));
  }, [job.slots, job.type, templates]);

  const eligibleCrews = useMemo(() => {
    return crews.filter((crew) => {
      const leadReq = requiredRoles[0];
      if (!leadReq) return true;
      return crew.members
        .map((id) => getPerson(people, id))
        .some((p) => !!p && p.roles.includes(leadReq.role));
    });
  }, [crews, people, requiredRoles]);

  const visibleCrews = includeCrews
    ? eligibleCrews.filter((c) => includeCrews.includes(c.id))
    : eligibleCrews;

  const duration = useMemo(() => {
    if (job.durationHrs) return job.durationHrs;
    const tplSlots = templates[job.type]?.slots ?? [];
    return Math.max(...tplSlots.map((s) => (s.start || 0) + s.hours), 2);
  }, [job.durationHrs, job.type, templates]);

  // Fits per crew × day.
  const fits = useMemo<DayFit[]>(() => {
    const out: DayFit[] = [];
    visibleCrews.forEach((crew) => {
      const perDay: PerDay[] = days.map((d) => {
        const dk = dateKey(d);
        const primary = jobs
          .filter((j) => j.date === dk && j.crewId === crew.id && j.startHour != null)
          .map((j) => ({
            startHour: j.startHour as number,
            durationHrs: j.durationHrs,
          }));
        const loans = loanBlocksFor(crew, dk, jobs, people, rosterOverrides);
        const blocks = [...primary, ...loans].sort((a, b) => a.startHour - b.startHour);
        const effectiveMembers = effectiveCrewMembers({
          crews,
          people,
          overrides: rosterOverrides,
          date: dk,
          crewId: crew.id,
        });
        const leadOff = effectiveMembers.some(
          (m) =>
            ['hvac_lead', 'electrician', 'plumber', 'fsm', 'service_tech'].includes(m.roles[0]) &&
            timeOff.some((t) => t.date === dk && t.personId === m.id),
        );
        return { day: d, dk, blocks, leadOff };
      });

      perDay.forEach((entry, dayIdx) => {
        const { day: d, dk, blocks, leadOff } = entry;
        if (leadOff) {
          out.push({ crewId: crew.id, dateKey: dk, day: d, fit: null, reason: 'Lead on PTO/sick' });
          return;
        }

        // earliest contiguous candidate that satisfies single-day or starts the day fully
        let candidate = businessHours.start;
        for (const b of blocks) {
          if (b.startHour - candidate >= Math.min(duration, workdayLen)) break;
          candidate = Math.max(candidate, b.startHour + b.durationHrs + 0.25);
        }

        if (duration <= workdayLen) {
          const fitsBefore = candidate + duration <= businessHours.end;
          out.push({
            crewId: crew.id,
            dateKey: dk,
            day: d,
            fit: fitsBefore
              ? {
                  startHour: candidate,
                  endHour: candidate + duration,
                  daysSpanned: 1,
                  endDateKey: dk,
                  endDay: d,
                  hoursBooked: blocks.reduce((a, b) => a + b.durationHrs, 0),
                }
              : null,
            reason: fitsBefore ? null : 'No contiguous ' + duration + 'h slot today',
          });
        } else {
          // Multi-day fit: start day must be empty (no jobs, no loans, lead in).
          if (blocks.length > 0) {
            out.push({
              crewId: crew.id,
              dateKey: dk,
              day: d,
              fit: null,
              reason: 'Needs full day · already booked',
            });
            return;
          }
          let remaining = duration;
          let endIdx = dayIdx;
          let endHour = businessHours.start;
          let blocked = false;
          for (let i = dayIdx; i < perDay.length; i++) {
            const e = perDay[i];
            if (i !== dayIdx && (e.leadOff || e.blocks.length > 0)) {
              blocked = true;
              break;
            }
            if (remaining >= workdayLen) {
              remaining -= workdayLen;
              endIdx = i;
              endHour = businessHours.end;
              if (remaining === 0) break;
            } else {
              endIdx = i;
              endHour = businessHours.start + remaining;
              remaining = 0;
              break;
            }
          }
          if (blocked || remaining > 0) {
            out.push({
              crewId: crew.id,
              dateKey: dk,
              day: d,
              fit: null,
              reason: blocked ? 'Conflict mid-span' : 'Spans past window',
            });
          } else {
            out.push({
              crewId: crew.id,
              dateKey: dk,
              day: d,
              fit: {
                startHour: businessHours.start,
                endHour,
                daysSpanned: endIdx - dayIdx + 1,
                endDateKey: perDay[endIdx].dk,
                endDay: perDay[endIdx].day,
                hoursBooked: 0,
              },
              reason: null,
            });
          }
        }
      });
    });
    return out;
  }, [visibleCrews, days, duration, businessHours.start, businessHours.end, workdayLen, jobs, people, timeOff, crews, rosterOverrides]);

  const ranked = useMemo<RankedFit[]>(() => {
    return fits
      .filter((f): f is DayFit & { fit: NonNullable<DayFit['fit']> } => !!f.fit)
      .map((f) => {
        const crew = getCrew(crews, f.crewId);
        const dayJobs = jobs.filter((j) => j.date === f.dateKey && j.crewId === crew?.id);
        const hoursBooked = dayJobs.reduce((a, j) => a + j.durationHrs, 0);
        const isToday = f.dateKey === dateKey(TODAY);
        const score =
          100 -
          hoursBooked * 3 -
          (f.fit.startHour - 8) * 0.5 +
          (isToday ? -10 : 0) +
          (crew?.color === '#3CD567' ? 5 : 0);
        const reasons: RankedFit['reasons'] = [];
        if (hoursBooked === 0) reasons.push({ tone: 'good', icon: 'check', text: 'Free all day' });
        else
          reasons.push({
            tone: hoursBooked < 4 ? 'good' : 'warn',
            icon: 'clock',
            text: hoursBooked + 'h booked',
          });
        if (f.fit.startHour < 9) reasons.push({ tone: 'good', icon: 'sparkle', text: 'Early start' });
        if (crew?.type === 'install' && job.type === 'heatpump')
          reasons.push({ tone: 'good', icon: 'check', text: 'Specialty crew' });
        return { ...f, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [fits, crews, jobs, job.type]);

  function getFit(crewId: string, dk: string) {
    return fits.find((f) => f.crewId === crewId && f.dateKey === dk);
  }

  const selectedKey = value ? value.crewId + '-' + value.dateKey : null;

  function selectFit(f: DayFit | undefined) {
    if (!f?.fit) return;
    onChange({
      crewId: f.crewId,
      dateKey: f.dateKey,
      startHour: f.fit.startHour,
      endHour: f.fit.endHour,
      endDateKey: f.fit.endDateKey,
      daysSpanned: f.fit.daysSpanned,
    });
  }

  // CSS variable for the grid template — typed as React.CSSProperties + index hack
  const gridStyle = { ['--day-count' as string]: dayCount } as React.CSSProperties;

  return (
    <>
      <WizardStyles />
      <div className="suggest-picker" style={{ height }}>
        {/* MODE TOGGLE */}
        <div className="suggest-mode-bar">
          <div className="seg">
            <button
              type="button"
              className={mode === 'suggested' ? 'active' : ''}
              onClick={() => setMode('suggested')}
            >
              <Icon name="sparkle" size={11} /> Suggested times
            </button>
            <button
              type="button"
              className={mode === 'exact' ? 'active' : ''}
              onClick={() => setMode('exact')}
            >
              <Icon name="clock" size={11} /> Pick exact time
            </button>
          </div>
          <span className="muted small" style={{ marginLeft: 8 }}>
            {mode === 'exact'
              ? 'Type a date and time — we’ll flag conflicts but let you schedule anyway.'
              : 'Best-fit slots based on crew load and skills.'}
          </span>
        </div>

        {mode === 'exact' ? (
          <ExactTimePanel
            duration={duration}
            eligibleCrews={eligibleCrews}
            date={exactDate}
            time={exactTime}
            crewId={exactCrewId}
            allowConflict={exactAllowConflict}
            onDateChange={setExactDate}
            onTimeChange={setExactTime}
            onCrewChange={setExactCrewId}
            onAllowConflictChange={setExactAllowConflict}
            onCommit={onChange}
          />
        ) : (
          <>
            {/* CONTROLS */}
            <div className="suggest-controls">
              <div className="row" style={{ gap: 6 }}>
                <IconButton
                  icon="chevron_left"
                  label="Previous week"
                  onClick={() => setWindowStart(addDays(windowStart, -7))}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-subhead)',
                    fontWeight: 700,
                    fontSize: 13,
                    minWidth: 180,
                    textAlign: 'center',
                  }}
                >
                  {windowStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {addDays(
                    windowStart,
                    dayCount - 1,
                  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <IconButton
                  icon="chevron_right"
                  label="Next week"
                  onClick={() => setWindowStart(addDays(windowStart, 7))}
                />
              </div>

              <div className="row" style={{ marginLeft: 8 }}>
                <span className="control-label">Crews</span>
                <div className="seg">
                  <button
                    type="button"
                    className={includeCrews === null ? 'active' : ''}
                    onClick={() => setIncludeCrews(null)}
                  >
                    All ({eligibleCrews.length})
                  </button>
                  <button
                    type="button"
                    className={includeCrews?.length === 3 ? 'active' : ''}
                    onClick={() =>
                      setIncludeCrews(eligibleCrews.slice(0, 3).map((c) => c.id))
                    }
                  >
                    Top 3
                  </button>
                </div>
              </div>

              <div className="row">
                <span className="control-label">Window</span>
                <select
                  className="select"
                  value={businessHours.start + '-' + businessHours.end}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const [a, b] = e.target.value.split('-').map(Number);
                    setBusinessHours({ start: a, end: b });
                  }}
                >
                  <option value="7-17">7a – 5p (standard)</option>
                  <option value="6-19">6a – 7p (extended)</option>
                  <option value="8-12">Mornings only</option>
                  <option value="12-17">Afternoons only</option>
                </select>
              </div>

              <div className="topbar-spacer"></div>

              <div className="muted small" style={{ whiteSpace: 'nowrap' }}>
                <Icon name="info" size={11} /> {ranked.length} fit{ranked.length === 1 ? '' : 's'}
                {requiredRoles[0] && <> · {roleShort(requiredRoles[0].role)}</>}
              </div>
            </div>

            <div className="suggest-body">
              {/* SIDEBAR */}
              <div className="suggest-sidebar">
                <div className="suggest-sidebar-header">
                  <div className="rail-title" style={{ fontSize: 13 }}>
                    Best fits
                  </div>
                  <div className="muted small">By crew load, time-of-day, specialty</div>
                </div>
                <div className="suggest-sidebar-list">
                  {ranked.map((r, i) => {
                    const crew = getCrew(crews, r.crewId);
                    const key = r.crewId + '-' + r.dateKey;
                    if (!r.fit) return null;
                    return (
                      <div
                        key={key}
                        className={
                          'suggest-slot' +
                          (i === 0 ? ' best' : '') +
                          (selectedKey === key ? ' selected' : '')
                        }
                        onClick={() => selectFit(r)}
                      >
                        <div className="suggest-slot-rank">#{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="suggest-slot-when">
                            {r.fit.daysSpanned > 1 ? (
                              <>
                                {r.day.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}{' '}
                                {fmtTime(r.fit.startHour)}{' '}
                                <span className="suggest-slot-endhour">
                                  → {r.fit.endDay.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    day: 'numeric',
                                  })}{' '}
                                  {fmtTime(r.fit.endHour)}
                                </span>
                              </>
                            ) : (
                              <>
                                {r.day.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                {' · '}
                                {fmtTime(r.fit.startHour)}
                                <span className="suggest-slot-endhour">
                                  –{fmtTime(r.fit.endHour)}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="suggest-slot-crew">
                            {crew?.name}
                            {r.fit.daysSpanned > 1 && (
                              <span className="suggest-slot-spandays">
                                {' · spans ' + r.fit.daysSpanned + ' days'}
                              </span>
                            )}
                          </div>
                          <div className="suggestion-reasons" style={{ marginTop: 4 }}>
                            {r.reasons.slice(0, 2).map((rs, j) => (
                              <span key={j} className={'reason-chip ' + rs.tone}>
                                <Icon name={rs.icon} size={10} /> {rs.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ranked.length === 0 && (
                    <div className="empty" style={{ padding: 24 }}>
                      <div className="empty-icon">
                        <Icon name="info" size={20} stroke="var(--fg-muted)" />
                      </div>
                      <div className="h4" style={{ fontSize: 13 }}>
                        No fits in this window
                      </div>
                      <div className="muted small">Try a longer window or different crews</div>
                    </div>
                  )}
                </div>
              </div>

              {/* GRID */}
              <div className="suggest-grid">
                <div className="suggest-grid-inner" style={gridStyle}>
                  <div className="suggest-day-header" style={{ borderLeft: 0 }}>
                    <span className="eyebrow-sm">Crew</span>
                  </div>
                  {days.map((d) => {
                    const isToday = dateKey(d) === dateKey(TODAY);
                    return (
                      <div
                        key={dateKey(d)}
                        className={'suggest-day-header' + (isToday ? ' today' : '')}
                      >
                        <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{d.getDate()}</div>
                        <div className="muted small" style={{ fontSize: 10, fontWeight: 500 }}>
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </div>
                    );
                  })}

                  {visibleCrews.map((crew) => {
                    const lead = getPerson(people, crew.lead);
                    const truck = getTruck(trucks, crew.truck);
                    const isExpanded = expandedCrewId === crew.id;
                    const members = effectiveCrewMembers({
                      crews,
                      people,
                      overrides: rosterOverrides,
                      date: dateKey(days[0]),
                      crewId: crew.id,
                    });

                    const selFit =
                      value && value.crewId === crew.id
                        ? fits.find(
                            (f) => f.crewId === crew.id && f.dateKey === value.dateKey,
                          )?.fit
                        : null;
                    const inSelectedSpan = (dk: string) =>
                      !!selFit &&
                      selFit.daysSpanned > 1 &&
                      dk > value!.dateKey &&
                      dk <= selFit.endDateKey;

                    return (
                      <CrewRow
                        key={crew.id}
                        crew={crew}
                        lead={lead}
                        truck={truck}
                        days={days}
                        members={members}
                        timeOff={timeOff}
                        isExpanded={isExpanded}
                        dayCount={dayCount}
                        getFit={getFit}
                        ranked={ranked}
                        selectedKey={selectedKey}
                        selectFit={selectFit}
                        existingJobsByDate={(dk) =>
                          jobs
                            .filter((j) => j.date === dk && j.crewId === crew.id && j.startHour != null)
                            .sort(
                              (a, b) => (a.startHour as number) - (b.startHour as number),
                            )
                        }
                        getJobTypeShort={(t) => getJobType(t)?.short ?? t}
                        getCustomerName={(id) => getCustomer(customers, id)?.name ?? ''}
                        toggleExpand={() => setExpandedCrewId(isExpanded ? null : crew.id)}
                        selFit={selFit}
                        inSelectedSpan={inSelectedSpan}
                        spanEndDateKey={selFit?.endDateKey ?? ''}
                        spanEndHour={selFit?.endHour ?? 0}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// =============================================================
// One crew row in the grid + an expanded member panel.
// =============================================================
interface CrewRowProps {
  crew: Crew;
  lead: Person | undefined;
  truck: ReturnType<typeof getTruck>;
  days: Date[];
  members: Person[];
  timeOff: TimeOff[];
  isExpanded: boolean;
  dayCount: number;
  getFit: (crewId: string, dk: string) => DayFit | undefined;
  ranked: RankedFit[];
  selectedKey: string | null;
  selectFit: (f: DayFit | undefined) => void;
  existingJobsByDate: (dk: string) => Job[];
  getJobTypeShort: (t: string) => string;
  getCustomerName: (id: string | null) => string;
  toggleExpand: () => void;
  selFit: DayFit['fit'] | null | undefined;
  inSelectedSpan: (dk: string) => boolean;
  spanEndDateKey: string;
  spanEndHour: number;
}

function CrewRow({
  crew,
  lead,
  truck,
  days,
  members,
  timeOff,
  isExpanded,
  dayCount,
  getFit,
  ranked,
  selectedKey,
  selectFit,
  existingJobsByDate,
  getJobTypeShort,
  getCustomerName,
  toggleExpand,
  selFit,
  inSelectedSpan,
  spanEndDateKey,
  spanEndHour,
}: CrewRowProps) {
  return (
    <>
      <div className="suggest-crew-row-label">
        <div
          style={{
            width: 4,
            alignSelf: 'stretch',
            borderRadius: 2,
            background: crew.color,
          }}
        ></div>
        <button
          type="button"
          className="suggest-crew-toggle"
          onClick={toggleExpand}
          aria-expanded={isExpanded}
          title={isExpanded ? 'Hide members' : 'Show members'}
        >
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{crew.name}</div>
            <div className="muted small" style={{ fontSize: 10 }}>
              {lead?.name} · {truck?.name ?? 'no truck'}
            </div>
          </div>
          <Icon
            name={isExpanded ? 'chevron_down' : 'chevron_right'}
            size={12}
            stroke="var(--fg-muted)"
          />
        </button>
      </div>

      {days.map((d) => {
        const dk = dateKey(d);
        const f = getFit(crew.id, dk);
        const existing = existingJobsByDate(dk);
        const rankIdx = ranked.findIndex((r) => r.crewId === crew.id && r.dateKey === dk);
        const isBest = rankIdx === 0;
        const isSelected = selectedKey === crew.id + '-' + dk;
        const inSpan = inSelectedSpan(dk);
        const isSpanEnd = inSpan && dk === spanEndDateKey;
        const isMultiDayStart = !!f?.fit && f.fit.daysSpanned > 1;

        const classes = ['suggest-cell'];
        if (inSpan) classes.push('cell-in-span');
        if (!f?.fit && !inSpan) classes.push('unavailable');
        else if (isBest) classes.push('has-fit', 'fit-best');
        else if (f?.fit) classes.push('has-fit');
        if (isSelected) classes.push('fit-best');
        if (isMultiDayStart) classes.push('multi-start');

        return (
          <div
            key={dk + crew.id}
            className={classes.join(' ')}
            onClick={() => f?.fit && selectFit(f)}
          >
            {existing.map((j, idx) => {
              const sh = j.startHour as number;
              return (
                <div
                  key={idx}
                  className="suggest-cell-existing"
                  title={
                    getCustomerName(j.customer) + ' · ' + fmtTime(sh) + '–' + fmtTime(sh + j.durationHrs)
                  }
                >
                  <span className="suggest-cell-existing-time">
                    {fmtTime(sh)}–{fmtTime(sh + j.durationHrs)}
                  </span>
                  <span className="suggest-cell-existing-label">
                    {getJobTypeShort(j.type)}
                  </span>
                </div>
              );
            })}
            {f?.fit && f.fit.daysSpanned === 1 && (
              <div className="suggest-cell-fit-time">
                <Icon name="sparkle" size={9} /> {fmtTime(f.fit.startHour)}
                <span className="suggest-cell-fit-end">–{fmtTime(f.fit.endHour)}</span>
              </div>
            )}
            {f?.fit && f.fit.daysSpanned > 1 && (
              <div className="suggest-cell-fit-time multiday">
                <Icon name="sparkle" size={9} /> {fmtTime(f.fit.startHour)}
                <span className="suggest-cell-fit-end">
                  {' '}→ {f.fit.endDay.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                  {fmtTime(f.fit.endHour)}
                </span>
              </div>
            )}
            {inSpan && !f?.fit && (
              <div className="suggest-cell-span">
                <span className="suggest-cell-span-bar"></span>
                <span className="suggest-cell-span-label">
                  {isSpanEnd ? 'ends ' + fmtTime(spanEndHour) : 'continues'}
                </span>
              </div>
            )}
            {!f?.fit && !inSpan && (
              <div className="suggest-cell-fits">{f?.reason || '—'}</div>
            )}
          </div>
        );
      })}

      {isExpanded && (
        <div
          className="suggest-crew-expanded"
          style={{ gridColumn: '1 / span ' + (dayCount + 1) }}
        >
          <div className="suggest-crew-expanded-inner">
            {members.map((m) => {
              const memberPto = days.filter((d) =>
                timeOff.some((t) => t.date === dateKey(d) && t.personId === m.id),
              );
              return (
                <div key={m.id} className="suggest-crew-member">
                  <Avatar person={m} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {m.name}
                      {m.id === crew.lead && (
                        <span className="suggest-crew-member-lead">LEAD</span>
                      )}
                    </div>
                    <div className="muted small" style={{ fontSize: 10 }}>
                      {m.roles.map((r) => ROLES[r]?.short ?? r).join(' · ')} · {m.level}
                    </div>
                  </div>
                  {memberPto.length > 0 && (
                    <span
                      className="suggest-crew-member-pto"
                      title={
                        'Off: ' +
                        memberPto
                          .map((d) =>
                            d.toLocaleDateString('en-US', { weekday: 'short' }),
                          )
                          .join(', ')
                      }
                    >
                      <Icon name="info" size={9} /> off{' '}
                      {memberPto
                        .map((d) =>
                          d.toLocaleDateString('en-US', { weekday: 'short' }),
                        )
                        .join(', ')}
                    </span>
                  )}
                </div>
              );
            })}
            {truck ? (
              <div className="suggest-crew-member">
                <div className="suggest-crew-truck-icon">
                  <Icon name="truck" size={12} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{truck.name}</div>
                  <div className="muted small" style={{ fontSize: 10 }}>
                    {truck.capacity} · {truck.plate}
                  </div>
                </div>
              </div>
            ) : (
              <div className="suggest-crew-member">
                <div className="suggest-crew-truck-icon">
                  <Icon name="truck" size={12} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontWeight: 600, fontSize: 12, color: 'var(--fg-muted)' }}
                  >
                    No assigned truck
                  </div>
                  <div className="muted small" style={{ fontSize: 10 }}>
                    Driver brings own vehicle
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================
// ExactTimePanel — manual date / time / crew with explicit
// conflict listing (including loan commitments).
// =============================================================
interface ExactPanelProps {
  duration: number;
  eligibleCrews: Crew[];
  date: string;
  time: number;
  crewId: string | null;
  allowConflict: boolean;
  onDateChange: (d: string) => void;
  onTimeChange: (h: number) => void;
  onCrewChange: (id: string | null) => void;
  onAllowConflictChange: (b: boolean) => void;
  onCommit: (slot: PickedSlot) => void;
}

interface ConflictRow {
  startHour: number;
  durationHrs: number;
  /** When set, the row originated from another crew's job */
  isLoan: boolean;
  jobType: string;
  customerName: string | null;
  loanPersonName: string | null;
}

function ExactTimePanel({
  duration,
  eligibleCrews,
  date,
  time,
  crewId,
  allowConflict,
  onDateChange,
  onTimeChange,
  onCrewChange,
  onAllowConflictChange,
  onCommit,
}: ExactPanelProps) {
  const jobs = useStore((s) => s.jobs);
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const customers = useStore((s) => s.customers);
  const timeOff = useStore((s) => s.timeOff);
  const rosterOverrides = useStore((s) => s.crewRosterOverrides);
  const endHour = time + duration;

  const crewStatus = useMemo(() => {
    return eligibleCrews.map((crew) => {
      const primaryJobs = jobs.filter(
        (j) => j.date === date && j.crewId === crew.id && j.startHour != null,
      );
      const loanRows: ConflictRow[] = jobs
        .filter((j) => j.date === date && j.crewId !== crew.id && j.startHour != null)
        .flatMap((j) =>
          j.slots
            .filter((s) => {
              if (!s.assignedTo) return false;
              const slotStart = (j.startHour as number) + (s.start || 0);
              return (
                effectiveCrewForPerson(people, rosterOverrides, date, s.assignedTo, slotStart) ===
                crew.id
              );
            })
            .map<ConflictRow>((s) => ({
              startHour: (j.startHour as number) + (s.start || 0),
              durationHrs: s.hours,
              isLoan: true,
              jobType: j.type,
              customerName: getCustomer(customers, j.customer)?.name ?? null,
              loanPersonName: getPerson(people, s.assignedTo)?.name ?? null,
            })),
        );
      const primaryRows: ConflictRow[] = primaryJobs.map((j) => ({
        startHour: j.startHour as number,
        durationHrs: j.durationHrs,
        isLoan: false,
        jobType: j.type,
        customerName: getCustomer(customers, j.customer)?.name ?? null,
        loanPersonName: null,
      }));
      const allRows: ConflictRow[] = [...primaryRows, ...loanRows];
      const effectiveMembers = effectiveCrewMembers({
        crews: eligibleCrews,
        people,
        overrides: rosterOverrides,
        date,
        crewId: crew.id,
      });
      const leadOff = effectiveMembers.some(
        (m) =>
          ['hvac_lead', 'electrician', 'plumber', 'fsm', 'service_tech'].includes(m.roles[0]) &&
          timeOff.some((t) => t.date === date && t.personId === m.id),
      );
      const conflicts = allRows.filter((r) => {
        const rEnd = r.startHour + r.durationHrs;
        return time < rEnd && endHour > r.startHour;
      });
      return { crew, conflicts, leadOff };
    });
  }, [eligibleCrews, date, time, endHour, jobs, people, customers, timeOff, rosterOverrides]);

  const selected = crewStatus.find((s) => s.crew.id === crewId);
  const selectedConflicts = selected?.conflicts ?? [];
  const selectedLeadOff = !!selected?.leadOff;
  const hasIssue = selectedConflicts.length > 0 || selectedLeadOff;
  const canSchedule = !!crewId && (!hasIssue || allowConflict);

  function commit() {
    if (!canSchedule || !crewId) return;
    onCommit({
      crewId,
      dateKey: date,
      startHour: time,
      endHour,
      endDateKey: date,
      daysSpanned: 1,
      allowConflicts: hasIssue && allowConflict,
    });
  }

  const dObj = new Date(date + 'T12:00:00');
  const dayLabel = dObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Time options — 15-min steps from 6:00 to 19:45
  const timeOptions: number[] = [];
  for (let h = 6; h < 20; h++) {
    [0, 0.25, 0.5, 0.75].forEach((f) => timeOptions.push(h + f));
  }

  return (
    <div className="exact-time-panel">
      <div className="exact-time-fields">
        <div className="field">
          <label className="label">Date</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onDateChange(e.target.value)}
          />
          <div className="muted small" style={{ marginTop: 4 }}>
            {dayLabel}
          </div>
        </div>
        <div className="field">
          <label className="label">Start time</label>
          <select
            className="select"
            value={time}
            onChange={(e) => onTimeChange(parseFloat(e.target.value))}
          >
            {timeOptions.map((h) => (
              <option key={h} value={h}>
                {fmtTime(h)}
              </option>
            ))}
          </select>
          <div className="muted small" style={{ marginTop: 4 }}>
            Ends <strong style={{ color: 'var(--fg)' }}>{fmtTime(endHour)}</strong> · {duration}h
          </div>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="label">Crew</label>
          <select
            className="select"
            value={crewId ?? ''}
            onChange={(e) => onCrewChange(e.target.value || null)}
          >
            <option value="">— Pick a crew —</option>
            {crewStatus.map((s) => (
              <option key={s.crew.id} value={s.crew.id}>
                {s.crew.name}
                {s.conflicts.length > 0
                  ? ' · ' + s.conflicts.length + ' conflict' + (s.conflicts.length === 1 ? '' : 's')
                  : s.leadOff
                    ? ' · lead off'
                    : ' · free'}
              </option>
            ))}
          </select>
          {selected && (
            <div className="muted small" style={{ marginTop: 4 }}>
              {effectiveCrewMembers({
                crews: eligibleCrews,
                people,
                overrides: rosterOverrides,
                date,
                crewId: selected.crew.id,
              }).length} member
              {effectiveCrewMembers({
                crews: eligibleCrews,
                people,
                overrides: rosterOverrides,
                date,
                crewId: selected.crew.id,
              }).length === 1 ? '' : 's'} ·{' '}
              {getTruck(trucks, selected.crew.truck)?.name ?? 'No truck'}
            </div>
          )}
        </div>
      </div>

      <div className="exact-time-status">
        {!crewId && (
          <div className="exact-time-empty">
            <Icon name="info" size={14} stroke="var(--fg-muted)" />
            <span>
              Pick a crew to see what's already on their calendar at {fmtTime(time)} on {dayLabel}.
            </span>
          </div>
        )}
        {crewId && !hasIssue && selected && (
          <div className="exact-time-ok">
            <Icon name="check" size={14} stroke="var(--jetson-green)" strokeWidth={2.5} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {selected.crew.name} is free
              </div>
              <div className="muted small">No conflicts at this time. Ready to schedule.</div>
            </div>
          </div>
        )}
        {crewId && hasIssue && selected && (
          <div className="exact-time-conflict">
            <div className="exact-time-conflict-head">
              <Icon name="alert_circle" size={14} stroke="#C53030" strokeWidth={2.5} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {selected.crew.name} has{' '}
                  {selectedConflicts.length + (selectedLeadOff ? 1 : 0)} issue
                  {selectedConflicts.length + (selectedLeadOff ? 1 : 0) === 1 ? '' : 's'}
                </div>
                <div className="muted small">
                  Review what's already booked before forcing the slot.
                </div>
              </div>
            </div>
            <div className="exact-time-conflict-list">
              {selectedLeadOff && (
                <div className="exact-time-conflict-item">
                  <span className="exact-time-conflict-time">PTO</span>
                  <span>
                    {getPerson(people, selected.crew.lead)?.name} (lead) is off this day
                  </span>
                </div>
              )}
              {selectedConflicts.map((c, i) => (
                <div key={i} className="exact-time-conflict-item">
                  <span className="exact-time-conflict-time">
                    {fmtTime(c.startHour)}–{fmtTime(c.startHour + c.durationHrs)}
                  </span>
                  <span>
                    {c.isLoan && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: 'var(--fg-muted)',
                          marginRight: 4,
                        }}
                      >
                        LOAN ·
                      </span>
                    )}
                    <strong>{getJobType(c.jobType)?.short ?? c.jobType}</strong>
                    {c.customerName && <> · {c.customerName}</>}
                    {c.isLoan && c.loanPersonName && (
                      <span className="muted small"> · {c.loanPersonName} on loan</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <label className="exact-time-allow">
              <input
                type="checkbox"
                checked={allowConflict}
                onChange={(e) => onAllowConflictChange(e.target.checked)}
              />
              <span>
                Schedule anyway, ignore conflicts (force onto calendar — useful for meetings)
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="exact-time-footer">
        <span className="muted small">
          {canSchedule && hasIssue && (
            <>
              <Icon name="alert_circle" size={11} stroke="#C53030" /> Forcing conflict
            </>
          )}
          {canSchedule && !hasIssue && (
            <>
              <Icon name="check" size={11} stroke="var(--jetson-green)" /> Slot ready
            </>
          )}
        </span>
        <button
          type="button"
          className={'btn btn-sm ' + (canSchedule ? 'btn-primary' : 'btn-greige')}
          disabled={!canSchedule}
          onClick={commit}
        >
          <Icon name="check" size={12} /> Use this slot
        </button>
      </div>
    </div>
  );
}

// =============================================================
// SuggestTimeOverlay — modal wrapper used when triggered outside
// the wizard (e.g. from a drawer's "Schedule it" action).
// =============================================================
interface OverlayProps {
  onClose: () => void;
  onSchedule: (slot: PickedSlot) => void;
  job: PickerJob;
  defaultDate?: Date;
}

export function SuggestTimeOverlay({ onClose, onSchedule, job, defaultDate }: OverlayProps) {
  const customers = useStore((s) => s.customers);
  const [selected, setSelected] = useState<PickedSlot | null>(null);

  const templates = useStore((s) => s.templates);
  const duration =
    job.durationHrs ??
    Math.max(
      ...((templates[job.type]?.slots ?? []).map((s) => (s.start || 0) + s.hours)),
      2,
    );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const customerName = job.customer ? getCustomer(customers, job.customer)?.name : undefined;

  return (
    <>
      <WizardStyles />
      <div className="suggest-overlay" onClick={onClose}>
        <div className="suggest-card-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <Icon name="sparkle" size={18} stroke="var(--jetson-green)" />
            <div>
              <div className="eyebrow-sm">Suggest a time</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {job.type ? getJobType(job.type)?.label ?? 'New job' : 'New job'} · {Math.round(duration)}h needed
                {customerName && (
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    · {customerName}
                  </span>
                )}
              </div>
            </div>
            <div className="topbar-spacer"></div>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </div>

          <SuggestTimePicker
            job={job}
            defaultDate={defaultDate}
            value={selected}
            onChange={setSelected}
            height={520}
          />

          <div className="modal-footer">
            <div className="muted small">
              <Icon name="sparkle" size={11} stroke="var(--jetson-green)" /> Cells respect skill match, time-off, business hours, existing bookings, and loan commitments.
            </div>
            <div className="row">
              <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={'btn btn-sm ' + (selected ? 'btn-primary' : 'btn-greige')}
                disabled={!selected}
                onClick={() => selected && onSchedule(selected)}
              >
                <Icon name="check" size={12} /> Schedule selected slot
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
