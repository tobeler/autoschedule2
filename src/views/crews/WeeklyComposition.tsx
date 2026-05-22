// =============================================================
// WeeklyComposition — Crew × Mon-Fri grid showing the actual
// day-by-day composition derived live from job slot assignments.
// Members from another crew render with a yellow "on loan" pill.
// =============================================================
import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import { TODAY, addDays, dateKey, fmtDate } from '../../data/helpers';
import { getCrew, getPerson } from '../../data/selectors';
import type { Person } from '../../types';

interface WeeklyCompositionProps {
  /** Monday-anchored start of the week to render. */
  weekStart: Date;
}

export function WeeklyComposition({ weekStart }: WeeklyCompositionProps) {
  const jobs = useStore((s) => s.jobs);
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // For each crew & day, derive actual on-job composition from job slots.
  const weeklyComposition = useMemo(() => {
    const map: Record<string, Record<string, Set<string>>> = {};
    crews.forEach((c) => {
      map[c.id] = {};
    });
    weekDays.forEach((d) => {
      const dk = dateKey(d);
      jobs
        .filter((j) => j.date === dk)
        .forEach((j) => {
          if (!j.crewId) return;
          if (!map[j.crewId]) map[j.crewId] = {};
          if (!map[j.crewId][dk]) map[j.crewId][dk] = new Set();
          j.slots.forEach((s) => {
            if (s.assignedTo) map[j.crewId!][dk].add(s.assignedTo);
          });
        });
    });
    return map;
  }, [jobs, crews, weekDays]);

  // Per-person: where did they actually work each day? (crewId + lead)
  const personWeeklyTrail = useMemo(() => {
    const trail: Record<string, Record<string, { crewId: string | null; leadId: string | null }>> = {};
    people.forEach((p) => {
      trail[p.id] = {};
    });
    weekDays.forEach((d) => {
      const dk = dateKey(d);
      jobs
        .filter((j) => j.date === dk)
        .forEach((j) => {
          const leadSlot = j.slots.find((s) =>
            ['hvac_lead', 'electrician', 'plumber', 'fsm'].includes(s.role),
          );
          const leadId = leadSlot?.assignedTo || null;
          j.slots.forEach((s) => {
            if (!s.assignedTo) return;
            if (!trail[s.assignedTo][dk]) {
              trail[s.assignedTo][dk] = { crewId: j.crewId, leadId };
            }
          });
        });
    });
    return trail;
  }, [jobs, people, weekDays]);

  // Find techs who worked across multiple crews this week
  const wanderers = useMemo(() => {
    return people.filter((p) => {
      const trail = personWeeklyTrail[p.id] || {};
      const crewIds = new Set(
        Object.values(trail)
          .map((t) => t.crewId)
          .filter((v): v is string => !!v),
      );
      return crewIds.size > 1;
    });
  }, [people, personWeeklyTrail]);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontFamily: 'var(--font-subhead)',
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          This week ·{' '}
          {fmtDate(weekStart, { month: 'short', day: 'numeric' })}–
          {fmtDate(addDays(weekStart, 4), { month: 'short', day: 'numeric' })}
        </h3>
        <span className="muted small" style={{ marginLeft: 8 }}>
          Actual composition pulled from jobs. An installer may pair with different leads on
          different days — that's flagged below.
        </span>
      </div>

      {wanderers.length > 0 && (
        <div className="crew-wanderers">
          <div className="crew-wanderers-head">
            <Icon name="refresh" size={14} stroke="#8A5500" />
            <span>
              {wanderers.length} tech{wanderers.length === 1 ? '' : 's'} paired with multiple
              leads this week
            </span>
          </div>
          <div className="crew-wanderers-list">
            {wanderers.map((p) => {
              const trail = personWeeklyTrail[p.id];
              const leadIds = Array.from(
                new Set(
                  Object.values(trail)
                    .map((t) => t.leadId)
                    .filter((l): l is string => !!l && l !== p.id),
                ),
              );
              return (
                <div key={p.id} className="crew-wanderer-row">
                  <Avatar person={p} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      Home crew: {getCrew(crews, p.defaultCrew)?.name || '—'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {leadIds.map((lid) => {
                      const lead = getPerson(people, lid);
                      if (!lead) return null;
                      return (
                        <span
                          key={lid}
                          className="lead-pair-chip"
                          title={'Paired with ' + lead.name}
                        >
                          <Avatar person={lead} size="xs" />
                          <span>{lead.name.split(' ').slice(-1)[0]}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="crew-week-grid">
        <div className="crew-week-grid-head">
          <div className="crew-week-grid-corner">Crew</div>
          {weekDays.map((d) => {
            const isToday = dateKey(d) === dateKey(TODAY);
            return (
              <div
                key={dateKey(d)}
                className={'crew-week-grid-day' + (isToday ? ' today' : '')}
              >
                <div className="weekday">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="date">{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {crews
          .filter((c) => c.type !== 'sales')
          .map((crew) => (
            <div key={crew.id} className="crew-week-grid-row">
              <div className="crew-week-grid-label">
                <div className="stripe" style={{ background: crew.color }}></div>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{crew.name}</div>
                  <div
                    className="muted small"
                    style={{ fontSize: 10 }}
                  >
                    {getPerson(people, crew.lead)?.name}
                  </div>
                </div>
              </div>
              {weekDays.map((d) => {
                const dk = dateKey(d);
                const memberIds = Array.from(weeklyComposition[crew.id]?.[dk] || []);
                if (memberIds.length === 0) {
                  return (
                    <div
                      key={dk + crew.id}
                      className="crew-week-grid-cell empty"
                    >
                      <span
                        className="muted small"
                        style={{ fontSize: 10 }}
                      >
                        —
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={dk + crew.id} className="crew-week-grid-cell">
                    {memberIds.map((mid) => {
                      const m = getPerson(people, mid);
                      if (!m) return null;
                      const isHome = m.defaultCrew === crew.id;
                      return (
                        <WeekMemberChip
                          key={mid}
                          person={m}
                          home={isHome}
                          fromCrewName={
                            !isHome
                              ? getCrew(crews, m.defaultCrew)?.name
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      <div
        className="row"
        style={{
          marginTop: 14,
          gap: 18,
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
          Legend
        </span>
        <span className="row" style={{ gap: 4 }}>
          <span className="lead-pair-chip" style={{ background: 'var(--bg-subtle)' }}>
            Home crew
          </span>
        </span>
        <span className="row" style={{ gap: 4 }}>
          <span
            className="lead-pair-chip on-loan"
            style={{
              background: 'rgba(255,182,39,0.15)',
              color: '#8A5500',
            }}
          >
            <Icon name="refresh" size={9} stroke="#8A5500" />
            On loan
          </span>
        </span>
      </div>
    </>
  );
}

interface WeekMemberChipProps {
  person: Person;
  home: boolean;
  fromCrewName?: string;
}

function WeekMemberChip({ person, home, fromCrewName }: WeekMemberChipProps) {
  return (
    <div
      className={'crew-week-member' + (home ? '' : ' on-loan')}
      title={
        person.name + (home ? '' : ' · on loan from ' + (fromCrewName || 'another crew'))
      }
    >
      <Avatar person={person} size="xs" />
      <span className="name">{person.name.split(' ')[0]}</span>
      {!home && <Icon name="refresh" size={9} stroke="#8A5500" />}
    </div>
  );
}
