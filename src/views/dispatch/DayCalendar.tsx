// =============================================================
// DayCalendar — rows × hours grid for a single date.
//
// Group modes: crew | truck | tech.
// Renders JobBlock for primary jobs and LoanBlock for cross-crew slot
// participation. Drop-target row highlight, drive-time pills between
// consecutive jobs, vertical "now" line.
// =============================================================
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Crew, Job, JobSlot, Person, Truck } from '../../types';
import { Icon } from '../../components/Icon';
import { Avatar } from '../../components/Avatar';
import { fmtTime } from '../../data/helpers';
import { ROLES } from '../../data/seed';
import { useStore } from '../../store';
import { estimateDriveTime } from '../../lib/routing';
import { JobBlock } from './JobBlock';
import { LoanBlock } from './LoanBlock';

export type GroupBy = 'crew' | 'truck' | 'tech';

interface DayCalendarProps {
  date: Date;
  dateKeyStr: string;
  jobs: Job[];
  groupBy: GroupBy;
  density: 'cozy' | 'compact';
  selectedJobId: string | null;
  onJobClick: (job: Job) => void;
}

interface LoanEntry {
  job: Job;
  slot: JobSlot;
  person: Person;
}

interface RowModel {
  id: string;
  name: string;
  color: string;
  meta: React.ReactNode;
  avatars: React.ReactNode[];
  jobs: Job[];
  loans: LoanEntry[];
  homeCrew?: Crew;
  truck?: Truck | null;
}

const HOUR_START = 6;
const HOUR_END = 22;
const COLS = HOUR_END - HOUR_START;

function leadRoles(): string[] {
  return ['hvac_lead', 'electrician', 'plumber', 'fsm'];
}

export function DayCalendar({
  date,
  dateKeyStr,
  jobs,
  groupBy,
  density,
  selectedJobId,
  onJobClick,
}: DayCalendarProps) {
  const allCrews = useStore((s) => s.crews);
  const allTrucks = useStore((s) => s.trucks);
  const allPeople = useStore((s) => s.people);
  const allJobs = useStore((s) => s.jobs);
  const moveJob = useStore((s) => s.moveJob);
  const resizeJob = useStore((s) => s.resizeJob);
  const selectJob = useStore((s) => s.selectJob);
  const pushToast = useStore((s) => s.pushToast);
  const showDriveTime = useStore((s) => s.tweaks.showDriveTime);

  const colW = density === 'compact' ? 80 : 110;

  // Tick once a minute so the now-line moves smoothly.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isToday = useMemo(() => {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }, [date, now]);

  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowLeft = (nowHour - HOUR_START) * colW;
  const nowVisible = isToday && nowHour >= HOUR_START && nowHour <= HOUR_END;

  // ===== Build rows =====
  const rows = useMemo<RowModel[]>(() => {
    if (groupBy === 'crew') {
      // Scheduled jobs whose crewId isn't in the active crews list. These
      // are Zuper-sourced rows where the source team doesn't map to a real
      // dispatcher crew. We don't auto-create crews from Zuper teams (per
      // Erik's directive) but we DO group these jobs into virtual rows by
      // the Zuper team name so 11 simultaneous 8am installs across 11
      // teams render as 11 separate rows instead of overlapping into one.
      // Pattern adapted from jetson-kpi's TeamRow grouping.
      const crewIds = new Set(allCrews.map((c) => c.id));
      const unassignedJobs = jobs.filter(
        (j) => j.startHour != null && (!j.crewId || !crewIds.has(j.crewId)),
      );
      const byTeam = new Map<string, Job[]>();
      const noTeamJobs: Job[] = [];
      for (const j of unassignedJobs) {
        const teamName = j.zuperTeamName?.trim() || '';
        if (teamName) {
          if (!byTeam.has(teamName)) byTeam.set(teamName, []);
          byTeam.get(teamName)!.push(j);
        } else {
          noTeamJobs.push(j);
        }
      }
      // Pre-bucket people by their zuperPrimaryTeam so each team row can
      // show its real crew avatars.
      const peopleByTeam = new Map<string, Person[]>();
      for (const p of allPeople) {
        const t = p.zuperPrimaryTeam;
        if (!t) continue;
        if (!peopleByTeam.has(t)) peopleByTeam.set(t, []);
        peopleByTeam.get(t)!.push(p);
      }

      // Region accent color per team prefix, matching jetson-kpi's palette.
      const REGION_ACCENT: Record<string, string> = {
        CO: '#0EA5E9', // sky-500
        MA: '#10B981', // emerald-500
        NY: '#8B5CF6', // violet-500
        BC: '#F59E0B', // amber-500
        CA: '#F97316', // orange-500
      };

      // Stable lexicographic team ordering. Real crews still appear below.
      const teamRows: RowModel[] = Array.from(byTeam.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([teamName, teamJobs]) => {
          const teamPeople = peopleByTeam.get(teamName) ?? [];
          const prefix = teamName.split('-')[0]?.toUpperCase() ?? '';
          const color = REGION_ACCENT[prefix] ?? 'var(--mid-gray)';
          const lead = teamPeople.find((p) => p.roles.includes('hvac_lead'));
          return {
            id: 'zup-team-row-' + teamName,
            name: teamName,
            color,
            meta: (
              <>
                {lead ? (
                  <>
                    <Icon name="user" size={11} /> {lead.name.split(' ').slice(-1)[0]}
                  </>
                ) : null}
                {lead && teamPeople.length > 1 ? ' · ' : ''}
                {teamPeople.length > 0 ? (
                  <>
                    {teamPeople.length} on team
                  </>
                ) : (
                  <>
                    <Icon name="alert_circle" size={11} /> No techs assigned
                  </>
                )}
                {teamJobs.length > 0 ? ' · ' + teamJobs.length + ' scheduled' : ''}
              </>
            ),
            avatars: teamPeople.slice(0, 4).map((p) => (
              <Avatar key={p.id} person={p.id} size="xs" />
            )),
            jobs: teamJobs,
            loans: [],
            homeCrew: undefined,
            truck: null,
          };
        });
      // Tail row for any jobs with no team_name (e.g. Zuper jobs that have
      // no team assignment yet — usually NEW status).
      const noTeamRow: RowModel | null =
        noTeamJobs.length > 0
          ? {
              id: 'zup-no-team',
              name: 'Unassigned (no team)',
              color: 'var(--mid-gray)',
              meta: (
                <>
                  <Icon name="alert_circle" size={11} /> {noTeamJobs.length} scheduled, no Zuper team
                </>
              ),
              avatars: [],
              jobs: noTeamJobs,
              loans: [],
              homeCrew: undefined,
              truck: null,
            }
          : null;
      const unassignedRow: RowModel | null = null;
      const crewRows = allCrews.map((c) => {
        const truck = allTrucks.find((t) => t.id === c.truck) ?? null;
        const rowJobs = jobs.filter((j) => j.crewId === c.id);
        const loans: LoanEntry[] = [];
        jobs.forEach((j) => {
          if (j.crewId === c.id) return;
          j.slots.forEach((s) => {
            if (!s.assignedTo) return;
            const person = allPeople.find((p) => p.id === s.assignedTo);
            if (!person || person.defaultCrew !== c.id) return;
            loans.push({ job: j, slot: s, person });
          });
        });
        return {
          id: 'crew-' + c.id,
          name: c.name,
          color: c.color,
          meta: (
            <>
              {truck && (
                <>
                  <Icon name="truck" size={11} /> {truck.name}
                </>
              )}
              {!truck && c.type === 'sales' && (
                <>
                  <Icon name="user" size={11} /> Sales
                </>
              )}
            </>
          ),
          avatars: c.members.slice(0, 4).map((m) => (
            <Avatar key={m} person={m} size="xs" />
          )),
          jobs: rowJobs,
          loans,
          homeCrew: c,
          truck,
        };
      });
      // Compose: Zuper-team virtual rows first, then any no-team bucket,
      // then real dispatcher crews. unassignedRow is now always null —
      // kept in scope only for the future case where we re-introduce a
      // single bucket.
      return [
        ...teamRows,
        ...(noTeamRow ? [noTeamRow] : []),
        ...(unassignedRow ? [unassignedRow] : []),
        ...crewRows,
      ];
    }

    if (groupBy === 'truck') {
      return allTrucks
        .filter((t) => t.assignedCrew)
        .map((t) => {
          const crew = allCrews.find((c) => c.id === t.assignedCrew) ?? null;
          const rowJobs = jobs.filter((j) => j.truckId === t.id);
          return {
            id: 'truck-' + t.id,
            name: t.name,
            color: crew ? crew.color : 'var(--mid-gray)',
            meta: (
              <>
                <span className="mono">{t.plate}</span> · {crew ? crew.name : 'Unassigned'}
              </>
            ),
            avatars: crew
              ? crew.members
                  .slice(0, 4)
                  .map((m) => <Avatar key={m} person={m} size="xs" />)
              : [],
            jobs: rowJobs,
            loans: [],
            homeCrew: crew ?? undefined,
            truck: t,
          };
        });
    }

    // tech
    const techs = allPeople
      .filter((p) => jobs.some((j) => j.slots.some((s) => s.assignedTo === p.id)))
      .slice()
      .sort((a, b) =>
        a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0]),
      );
    return techs.map<RowModel>((p) => {
      const rowJobs = jobs.filter((j) => j.slots.some((s) => s.assignedTo === p.id));
      const isLeadRole = leadRoles().includes(p.roles[0]);
      const leadIds = Array.from(
        new Set(
          rowJobs.flatMap((j) => {
            const leadSlot = j.slots.find((s) => leadRoles().includes(s.role));
            return leadSlot && leadSlot.assignedTo && leadSlot.assignedTo !== p.id
              ? [leadSlot.assignedTo]
              : [];
          }),
        ),
      );
      const leadNames = leadIds
        .map((id) => allPeople.find((pp) => pp.id === id)?.name.split(' ').slice(-1)[0])
        .filter(Boolean) as string[];
      const role = ROLES[p.roles[0]];
      const meta = isLeadRole ? (
        <>
          {role?.label} · {p.level}
          {p.certs && p.certs.length ? <span> · {p.certs[0]}</span> : null}
        </>
      ) : (
        <>
          {role?.label} · {p.level}
          {leadNames.length > 0 && (
            <span style={{ color: 'var(--fg-muted)' }}> · with {leadNames.join(', ')}</span>
          )}
        </>
      );
      const homeCrew = allCrews.find((c) => c.id === p.defaultCrew);
      return {
        id: 'tech-' + p.id,
        name: p.name,
        color: homeCrew?.color || 'var(--mid-gray)',
        meta,
        avatars: [<Avatar key={p.id} person={p} size="sm" />],
        jobs: rowJobs,
        loans: [],
        homeCrew,
        truck: null,
      };
    });
  }, [groupBy, allCrews, allTrucks, allPeople, jobs]);

  // ===== Drop handling =====
  function rowDropMeta(rowId: string): {
    crewId: string | null;
    truckId: string | null;
  } | null {
    if (rowId.startsWith('crew-')) {
      const crewId = rowId.slice('crew-'.length);
      const crew = allCrews.find((c) => c.id === crewId);
      return { crewId, truckId: crew?.truck ?? null };
    }
    if (rowId.startsWith('truck-')) {
      const truckId = rowId.slice('truck-'.length);
      const t = allTrucks.find((tt) => tt.id === truckId);
      return { crewId: t?.assignedCrew ?? null, truckId };
    }
    // tech rows are not valid drop targets for changing assignment;
    // we still allow placement on the home crew/truck.
    if (rowId.startsWith('tech-')) {
      const personId = rowId.slice('tech-'.length);
      const person = allPeople.find((p) => p.id === personId);
      if (!person) return null;
      const crew = allCrews.find((c) => c.id === person.defaultCrew);
      return { crewId: person.defaultCrew, truckId: crew?.truck ?? null };
    }
    return null;
  }

  function handleDrop(rowId: string, hour: number, jobId: string) {
    const meta = rowDropMeta(rowId);
    if (!meta) return;
    // Snapshot the pre-move status so we can detect lifts from unscheduled.
    const prevJob = allJobs.find((j) => j.id === jobId);
    const wasUnscheduled = prevJob?.status === 'unscheduled';
    const previouslyFilledCount =
      prevJob?.slots.filter((s) => s.assignedTo).length ?? 0;
    moveJob(jobId, {
      date: dateKeyStr,
      startHour: hour,
      crewId: meta.crewId,
      truckId: meta.truckId,
    });
    if (wasUnscheduled) {
      // moveJob auto-filled empty slots; surface that in the toast and pop the
      // drawer open on the Crew tab so dispatch can review the suggestions.
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

  function clearDropAffordances(el: HTMLElement) {
    el.classList.remove('drop-target');
    const preview = el.querySelector('.drop-preview');
    if (preview) preview.remove();
  }

  return (
    <div className="calendar-wrap">
      <div className="daygrid" style={{ ['--col-w' as string]: colW + 'px' }}>
        {/* Time header */}
        <div className="daygrid-time-header" style={{ gridColumn: '1 / -1' }}>
          <div className="daygrid-row-header" style={{ minHeight: 36, padding: 0 }}>
            <div
              style={{
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--fg-muted)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              <Icon name="users" size={12} />{' '}
              {groupBy === 'crew' ? 'Crew' : groupBy === 'truck' ? 'Truck' : 'Technician'}
            </div>
          </div>
          <div className="daygrid-time-ticks">
            {Array.from({ length: COLS }).map((_, i) => {
              const h = HOUR_START + i;
              const isNow = nowVisible && Math.floor(nowHour) === h;
              return (
                <div
                  key={i}
                  className={'daygrid-time-tick' + (isNow ? ' now' : '')}
                >
                  {fmtTime(h)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Row body */}
        {rows.map((row, ri) => (
          <Fragment key={row.id}>
            <div
              className="daygrid-row-header"
              style={{ minHeight: density === 'compact' ? 56 : 72 }}
            >
              <div className="daygrid-row-color" style={{ background: row.color }} />
              <div className="daygrid-row-label">
                <div className="daygrid-row-name">{row.name}</div>
                <div className="daygrid-row-meta">{row.meta}</div>
              </div>
              <div className="daygrid-row-avatars">{row.avatars}</div>
            </div>

            <div
              className={'daygrid-row' + (ri % 2 ? ' alt' : '')}
              style={{
                minHeight: density === 'compact' ? 56 : 72,
                width: COLS * colW + 'px',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const target = e.currentTarget;
                target.classList.add('drop-target');
                const rect = target.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const hour = Math.max(
                  HOUR_START,
                  Math.min(
                    HOUR_END - 0.5,
                    HOUR_START + Math.round((x / colW) * 4) / 4,
                  ),
                );
                let preview = target.querySelector<HTMLDivElement>('.drop-preview');
                if (!preview) {
                  preview = document.createElement('div');
                  preview.className = 'drop-preview';
                  target.appendChild(preview);
                }
                preview.style.left = (hour - HOUR_START) * colW + 'px';
                preview.setAttribute('data-time', fmtTime(hour));
              }}
              onDragLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                if (related && e.currentTarget.contains(related)) return;
                clearDropAffordances(e.currentTarget);
              }}
              onDrop={(e) => {
                const target = e.currentTarget;
                clearDropAffordances(target);
                const jobId = e.dataTransfer.getData('text/job-id');
                if (!jobId) return;
                const rect = target.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const hour = Math.max(
                  HOUR_START,
                  Math.min(
                    HOUR_END - 0.5,
                    HOUR_START + Math.round((x / colW) * 4) / 4,
                  ),
                );
                handleDrop(row.id, hour, jobId);
              }}
            >
              {/* Drive-time pills between consecutive jobs */}
              {showDriveTime &&
                (() => {
                  const sortedJobs = [...row.jobs].sort(
                    (a, b) => (a.startHour || 0) - (b.startHour || 0),
                  );
                  const segs: {
                    aEnd: number;
                    bStart: number;
                    driveMin: number;
                    miles: number;
                    long: boolean;
                    key: string;
                  }[] = [];
                  for (let i = 0; i < sortedJobs.length - 1; i++) {
                    const a = sortedJobs[i];
                    const b = sortedJobs[i + 1];
                    const aEnd = (a.startHour || 0) + (a.durationHrs || 0);
                    const bStart = b.startHour || 0;
                    if (bStart <= aEnd) continue;
                    const est = estimateDriveTime(a.address, b.address);
                    const long = bStart - aEnd > 1.25 || est.minutes > 30;
                    segs.push({
                      aEnd,
                      bStart,
                      driveMin: est.minutes,
                      miles: est.miles,
                      long,
                      key: a.id + '-' + b.id,
                    });
                  }
                  return segs.map((s) => {
                    const left = (s.aEnd - HOUR_START) * colW;
                    const width = (s.bStart - s.aEnd) * colW;
                    if (width < 36) return null;
                    return (
                      <Fragment key={s.key}>
                        <div
                          className={'drive-seg-line' + (s.long ? ' long' : '')}
                          style={{ left: left + 8 + 'px', width: width - 16 + 'px' }}
                        />
                        <div
                          className={'drive-seg' + (s.long ? ' long' : '')}
                          style={{
                            left: left + width / 2 + 'px',
                            transform: 'translate(-50%, -50%)',
                          }}
                          title={'Drive · ' + s.driveMin + ' min · ' + s.miles + ' mi'}
                        >
                          <Icon name="truck" size={10} /> {s.driveMin}m
                        </div>
                      </Fragment>
                    );
                  });
                })()}

              {/* Primary jobs */}
              {row.jobs.map((j) => (
                <JobBlock
                  key={j.id}
                  job={j}
                  colW={colW}
                  hourStart={HOUR_START}
                  density={density}
                  selected={selectedJobId === j.id}
                  onClick={() => onJobClick(j)}
                  onResize={resizeJob}
                  allRowJobs={row.jobs}
                />
              ))}

              {/* Loan blocks (members on loan to other crews' jobs) */}
              {row.loans.map((loan, li) => {
                const homeCrew = allCrews.find((c) => c.id === loan.job.crewId);
                return (
                  <LoanBlock
                    key={'day-loan-' + loan.job.id + '-' + li}
                    job={loan.job}
                    slot={loan.slot}
                    person={loan.person}
                    homeCrew={homeCrew}
                    colW={colW}
                    hourStart={HOUR_START}
                    onClick={() => onJobClick(loan.job)}
                  />
                );
              })}

              {/* Now indicator only on first row (it overlays the full grid) */}
              {ri === 0 && nowVisible && (
                <div className="now-line" style={{ left: nowLeft + 'px' }} />
              )}
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
            Nothing scheduled for this day in this grouping.
          </div>
        )}
      </div>
    </div>
  );
}
