// =============================================================
// Crews view — header toggle between "Default crews" and "This week"
// KPI row, per-crew roster cards (default), weekly grid (weekly),
// skills matrix below.
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import { TODAY, addDays, dateKey, startOfWeek } from '../../data/helpers';
import { getPerson, getTruck, roleLabel } from '../../data/selectors';
import type { Person } from '../../types';
import { WeeklyComposition } from './WeeklyComposition';
import { SkillsMatrix } from './SkillsMatrix';

type Mode = 'default' | 'weekly';

export function CrewsView() {
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const timeOff = useStore((s) => s.timeOff);
  const jobs = useStore((s) => s.jobs);

  const [mode, setMode] = useState<Mode>('default');
  const weekStart = useMemo(() => startOfWeek(TODAY), []);
  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const todayDk = dateKey(TODAY);
  const outToday = timeOff.filter((t) => t.date === todayDk);

  // Cross-crew shifts metric (weekly mode KPI)
  const crossCrewShifts = useMemo(() => {
    const trail: Record<string, Set<string>> = {};
    weekDays.forEach((d) => {
      const dk = dateKey(d);
      jobs
        .filter((j) => j.date === dk)
        .forEach((j) => {
          if (!j.crewId) return;
          j.slots.forEach((s) => {
            if (!s.assignedTo) return;
            if (!trail[s.assignedTo]) trail[s.assignedTo] = new Set();
            trail[s.assignedTo].add(j.crewId!);
          });
        });
    });
    let count = 0;
    for (const id in trail) if (trail[id].size > 1) count++;
    return count;
  }, [jobs, weekDays]);

  const installCount = crews.filter((c) => c.type === 'install').length;
  const electricalCount = crews.filter((c) => c.type === 'electrical').length;
  const plumbingCount = crews.filter((c) => c.type === 'plumbing').length;
  const salesCount = crews.filter((c) => c.type === 'sales').length;

  return (
    <>
      <PageHeader
        eyebrow="Resources"
        title="Crews & technicians"
        subtitle={
          crews.length +
          ' default crews · ' +
          people.length +
          ' technicians on staff'
        }
      >
        <div className="seg">
          <button
            className={mode === 'default' ? 'active' : ''}
            onClick={() => setMode('default')}
          >
            Default crews
          </button>
          <button
            className={mode === 'weekly' ? 'active' : ''}
            onClick={() => setMode('weekly')}
          >
            This week
          </button>
        </div>
        <button className="btn btn-outline btn-sm">
          <Icon name="layers" size={14} /> Skills matrix
        </button>
        <button className="btn btn-primary btn-sm">
          <Icon name="plus" size={14} /> Add crew
        </button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Crews</div>
            <div className="kpi-value">{crews.length}</div>
            <div className="kpi-meta">
              {installCount} install · {electricalCount} electrical · {plumbingCount} plumbing
              {salesCount > 0 ? ' · ' + salesCount + ' sales' : ''}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Technicians</div>
            <div className="kpi-value">{people.length}</div>
            <div className="kpi-meta">
              {people.filter((p) => p.roles[0] !== 'fsm').length} in field ·{' '}
              {people.filter((p) => p.roles[0] === 'fsm').length} office
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Out today</div>
            <div className="kpi-value">{outToday.length}</div>
            <div className="kpi-meta">
              {outToday
                .map((t) => getPerson(people, t.personId)?.name.split(' ')[0])
                .filter(Boolean)
                .join(', ') || '—'}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">
              {mode === 'weekly' ? 'Cross-crew shifts (week)' : 'Avg utilization (7-day)'}
            </div>
            {mode === 'weekly' ? (
              <>
                <div className="kpi-value">{crossCrewShifts}</div>
                <div className="kpi-meta">techs with multiple leads this week</div>
              </>
            ) : (
              <>
                <div className="kpi-value">84%</div>
                <div className="kpi-meta up">+6 pts vs last week</div>
              </>
            )}
          </div>
        </div>

        {mode === 'default' && <CrewsDefaultView />}
        {mode === 'weekly' && <WeeklyComposition weekStart={weekStart} />}

        {/* SKILLS MATRIX — always visible */}
        <h3
          style={{
            fontFamily: 'var(--font-subhead)',
            fontWeight: 700,
            fontSize: 16,
            marginTop: 32,
            marginBottom: 12,
          }}
        >
          Skills & certifications
        </h3>
        <SkillsMatrix />
      </div>

      {/* keep trucks reference live so subtitle counts can pull from store */}
      <span hidden>{trucks.length}</span>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// DEFAULT crews — permanent composition cards
// ─────────────────────────────────────────────────────────────
function CrewsDefaultView() {
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);

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
          Default crews
        </h3>
        <span className="muted small" style={{ marginLeft: 8 }}>
          Permanent crew composition. Switch to "This week" to see actual day-by-day pairings.
        </span>
      </div>

      <div className="roster-grid">
        {crews.map((crew) => {
          const truck = getTruck(trucks, crew.truck);
          return (
            <div key={crew.id} className="roster-card">
              <div className="roster-card-header">
                <div
                  className="roster-color-bar"
                  style={{ background: crew.color }}
                ></div>
                <div style={{ flex: 1 }}>
                  <div className="h4" style={{ fontSize: 16 }}>
                    {crew.name}
                  </div>
                  <div
                    className="muted small"
                    style={{ textTransform: 'capitalize' }}
                  >
                    {crew.type} crew
                  </div>
                </div>
                <IconButton icon="more" label="Edit" />
              </div>

              {truck && (
                <div className="pill" style={{ alignSelf: 'flex-start' }}>
                  <Icon name="truck" size={12} /> {truck.name}
                  <span
                    className="mono muted small"
                    style={{ marginLeft: 4 }}
                  >
                    {truck.plate}
                  </span>
                </div>
              )}

              <div className="divider" style={{ margin: '6px 0' }}></div>

              <div className="roster-members">
                {crew.members.map((mid) => {
                  const m = getPerson(people, mid);
                  if (!m) return null;
                  const isLead = mid === crew.lead;
                  return (
                    <MemberRow key={mid} person={m} isLead={isLead} />
                  );
                })}
              </div>

              <div className="divider" style={{ margin: '6px 0' }}></div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">{crew.members.length} people</span>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="plus" size={12} /> Add person
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MemberRow({ person, isLead }: { person: Person; isLead: boolean }) {
  return (
    <div className="member-row">
      <Avatar person={person} />
      <div style={{ flex: 1 }}>
        <div className="member-row-name">
          {person.name}
          {isLead && (
            <span
              className="tag"
              style={{
                marginLeft: 8,
                background: 'var(--jetson-green)',
                color: 'var(--forest)',
              }}
            >
              LEAD
            </span>
          )}
        </div>
        <div className="member-row-meta">
          {roleLabel(person.roles[0])} · {person.level}
          {person.certs && person.certs.length > 0 && (
            <span> · {person.certs.join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
