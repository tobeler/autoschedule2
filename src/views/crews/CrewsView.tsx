// =============================================================
// Crews view — crew composition only. Default crews ↔ This week.
// "+ Add crew" and per-card "+ Add member" pickers.
// Skills matrix lives under Technicians (modal trigger).
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { PageHeader } from '../../components/PageHeader';
import { SortableHeader } from '../../components/SortableHeader';
import { useStore } from '../../store';
import { TODAY, addDays, dateKey, startOfWeek } from '../../data/helpers';
import { getPerson, getTruck, roleLabel } from '../../data/selectors';
import {
  chipMatches,
  makeSorter,
  nextSort,
  type SortState,
} from '../../lib/table';
import {
  REGION_PREFIXES,
  regionPrefixFromTeamName,
  useRegionFilter,
  type RegionPrefix,
} from '../../lib/region-filter';
import type { Crew, CrewType, Person } from '../../types';
import { WeeklyComposition } from './WeeklyComposition';
import { AddCrewModal } from './AddCrewModal';
import { AddMemberPicker } from './AddMemberPicker';
import { EditCrewModal } from './EditCrewModal';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';

type Mode = 'default' | 'weekly';

export function CrewsView() {
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const timeOff = useStore((s) => s.timeOff);
  const jobs = useStore((s) => s.jobs);

  const [mode, setMode] = useState<Mode>('default');
  const [showAddCrew, setShowAddCrew] = useState(false);

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
        title="Crews"
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
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddCrew(true)}
        >
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
                {/*
                  Utilization needs real crew→hours assignment data. With 0
                  crews defined and Zuper-sourced jobs all having crewId=null,
                  there's nothing to compute against. Show an honest "—"
                  instead of the prior hard-coded 84%. We'll wire real
                  utilization once crews are created in the dispatcher.
                */}
                <div className="kpi-value">—</div>
                <div className="kpi-meta">
                  {crews.length === 0
                    ? 'Create a crew to start tracking utilization'
                    : 'Awaiting crew assignment'}
                </div>
              </>
            )}
          </div>
        </div>

        {mode === 'default' && <CrewsDefaultView />}
        {mode === 'weekly' && <WeeklyComposition weekStart={weekStart} />}
      </div>

      {/* keep trucks reference live so subtitle counts can pull from store */}
      <span hidden>{trucks.length}</span>

      {showAddCrew && <AddCrewModal onClose={() => setShowAddCrew(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// DEFAULT crews — permanent composition cards w/ sortable header
// + filter chips controlling order/visibility of the cards below.
// ─────────────────────────────────────────────────────────────
// Crew Model v2: 'install' first (the day-to-day dispatch crews), then
// specialty crews, then 'ad_hoc' last (the Pool — office / float / dispatch
// / admin / sub teams inherited from Zuper). Default filter is 'install'
// so the dispatcher's primary view isn't cluttered with ad_hoc operational
// groupings that never own a job.
const CREW_TYPE_FILTERS: CrewType[] = ['install', 'electrical', 'sales', 'plumbing', 'solo', 'ad_hoc'];
const CREW_TYPE_LABEL: Record<string, string> = {
  install: 'Install',
  electrical: 'Electrical',
  sales: 'Sales',
  plumbing: 'Plumbing',
  solo: 'Solo',
  ad_hoc: 'Pool',
};
const CREW_REGION_FILTERS = REGION_PREFIXES;
type CrewRegion = RegionPrefix;

function crewRegionOf(name: string): CrewRegion | null {
  return regionPrefixFromTeamName(name);
}

type CrewSortKey = 'name' | 'type' | 'members' | 'region' | 'truck';

function CrewsDefaultView() {
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const jobs = useStore((s) => s.jobs);
  const removeCrew = useStore((s) => s.removeCrew);
  const updateCrew = useStore((s) => s.updateCrew);
  const updatePerson = useStore((s) => s.updatePerson);
  const pushToast = useStore((s) => s.pushToast);
  const [pickerForCrew, setPickerForCrew] = useState<Crew | null>(null);
  const [editCrew, setEditCrew] = useState<Crew | null>(null);
  const [deleteCrew, setDeleteCrew] = useState<Crew | null>(null);
  const [removeMember, setRemoveMember] = useState<{ crew: Crew; person: Person } | null>(null);
  // Default to 'install' so the dispatcher's primary view shows real
  // install crews, not the ~13 ad_hoc operational labels.
  const [typeFilter, setTypeFilter] = useState<CrewType | 'all'>('install');
  // Region filter is shared with the topbar picker — single source of truth.
  const { region: regionFilter, setRegion: setRegionFilter } = useRegionFilter();
  const [sort, setSort] = useState<SortState<CrewSortKey> | null>({
    key: 'name',
    dir: 'asc',
  });

  function activeJobsForCrew(crewId: string) {
    return jobs.filter(
      (j) => j.crewId === crewId && j.status !== 'complete',
    );
  }

  const activeTypes = useMemo<Set<CrewType>>(
    () => (typeFilter === 'all' ? new Set() : new Set([typeFilter])),
    [typeFilter],
  );
  const activeRegions = useMemo<Set<CrewRegion>>(
    () => (regionFilter === 'all' ? new Set() : new Set([regionFilter])),
    [regionFilter],
  );

  const visibleCrews = useMemo(() => {
    const filtered = crews.filter((c) => {
      if (!chipMatches(activeTypes, c.type)) return false;
      if (!chipMatches(activeRegions, crewRegionOf(c.name))) return false;
      return true;
    });
    const sorter = makeSorter<Crew, CrewSortKey>(sort, {
      name: (c) => c.name,
      type: (c) => c.type,
      members: (c) => c.members.length,
      region: (c) => crewRegionOf(c.name) ?? '',
      truck: (c) => getTruck(trucks, c.truck)?.name ?? '',
    });
    return filtered.slice().sort(sorter);
  }, [crews, trucks, activeTypes, activeRegions, sort]);

  function toggleSort(k: CrewSortKey) {
    setSort((prev) => nextSort(prev, k));
  }

  function confirmRemoveMember() {
    if (!removeMember) return;
    const { crew, person } = removeMember;
    const next: Crew = {
      ...crew,
      members: crew.members.filter((m) => m !== person.id),
      lead: crew.lead === person.id ? '' : crew.lead,
    };
    updateCrew(next);
    if (person.defaultCrew === crew.id) {
      updatePerson({ ...person, defaultCrew: '' });
    }
    pushToast('Removed ' + person.name + ' from ' + crew.name);
    setRemoveMember(null);
  }

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

      <div
        className="row"
        style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
      >
        <button
          className={'filter-chip ' + (typeFilter === 'all' ? 'active' : '')}
          onClick={() => setTypeFilter('all')}
        >
          All types
        </button>
        {CREW_TYPE_FILTERS.map((t) => (
          <button
            key={t}
            className={'filter-chip ' + (typeFilter === t ? 'active' : '')}
            onClick={() => setTypeFilter(t)}
          >
            {CREW_TYPE_LABEL[t] ?? t}
          </button>
        ))}
        <span
          aria-hidden
          style={{
            width: 1,
            height: 18,
            background: 'var(--border, rgba(15,31,13,0.12))',
            margin: '0 4px',
          }}
        />
        <button
          className={'filter-chip ' + (regionFilter === 'all' ? 'active' : '')}
          onClick={() => setRegionFilter('all')}
        >
          All regions
        </button>
        {CREW_REGION_FILTERS.map((rg) => (
          <button
            key={rg}
            className={'filter-chip ' + (regionFilter === rg ? 'active' : '')}
            onClick={() => setRegionFilter(rg)}
          >
            {rg}
          </button>
        ))}
      </div>

      {/*
        Sort bar — applies a column-style ordering to the crew cards
        below. Same SortableHeader UX as the table views so the toggle
        cycle (asc → desc) is consistent site-wide.
      */}
      <div
        className="card"
        style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}
      >
        <table className="table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <SortableHeader<CrewSortKey>
                label="Crew"
                sortKey="name"
                state={sort}
                onClick={toggleSort}
              />
              <SortableHeader<CrewSortKey>
                label="Type"
                sortKey="type"
                state={sort}
                onClick={toggleSort}
              />
              <SortableHeader<CrewSortKey>
                label="Members"
                sortKey="members"
                state={sort}
                onClick={toggleSort}
                align="right"
              />
              <SortableHeader<CrewSortKey>
                label="Region"
                sortKey="region"
                state={sort}
                onClick={toggleSort}
              />
              <SortableHeader<CrewSortKey>
                label="Truck"
                sortKey="truck"
                state={sort}
                onClick={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {visibleCrews.map((c) => {
              const truck = getTruck(trucks, c.truck);
              const region = crewRegionOf(c.name);
              return (
                <tr
                  key={c.id}
                  className="clickable"
                  onClick={() => setEditCrew(c)}
                >
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: c.color,
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="tag" style={{ textTransform: 'capitalize' }}>
                      {c.type}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {c.members.length}
                  </td>
                  <td>
                    {region ? (
                      <span className="mono small">{region}</span>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td>
                    {truck ? (
                      <span className="row" style={{ gap: 6 }}>
                        <Icon name="truck" size={12} />
                        <span>{truck.name}</span>
                        <span className="mono muted small">{truck.plate}</span>
                      </span>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleCrews.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 28 }}>
                  <span className="muted small">No crews match.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="roster-grid">
        {visibleCrews.map((crew) => {
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
                <CardActions
                  onEdit={() => setEditCrew(crew)}
                  onDelete={() => setDeleteCrew(crew)}
                />
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
                    <MemberRow
                      key={mid}
                      person={m}
                      isLead={isLead}
                      onRemove={
                        isLead
                          ? undefined
                          : () => setRemoveMember({ crew, person: m })
                      }
                    />
                  );
                })}
                {crew.members.length === 0 && (
                  <div className="muted small" style={{ padding: '6px 0' }}>
                    No members yet.
                  </div>
                )}
              </div>

              <div className="divider" style={{ margin: '6px 0' }}></div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">
                  Members ({crew.members.length})
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPickerForCrew(crew)}
                >
                  <Icon name="plus" size={12} /> Add member
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pickerForCrew && (
        <AddMemberPicker
          crew={pickerForCrew}
          onClose={() => setPickerForCrew(null)}
        />
      )}
      {editCrew && (
        <EditCrewModal crew={editCrew} onClose={() => setEditCrew(null)} />
      )}
      {deleteCrew && (
        <ConfirmDeleteModal
          entityLabel={deleteCrew.name}
          body={(() => {
            const blockers = activeJobsForCrew(deleteCrew.id);
            if (blockers.length > 0) {
              return (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#781E1E',
                    }}
                  >
                    {deleteCrew.name} is on {blockers.length} active job
                    {blockers.length === 1 ? '' : 's'} — cancel or reassign first.
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
                    {blockers.slice(0, 5).map((j) => (
                      <li key={j.id} className="mono">
                        {j.id} · {j.date ?? 'unscheduled'} · {j.status}
                      </li>
                    ))}
                    {blockers.length > 5 && (
                      <li className="muted">+{blockers.length - 5} more…</li>
                    )}
                  </ul>
                </div>
              );
            }
            return (
              <div className="muted small">
                Members of this crew will have their default crew unset (they
                are not cascade-deleted).
              </div>
            );
          })()}
          blocked={activeJobsForCrew(deleteCrew.id).length > 0}
          confirmText={'Delete ' + deleteCrew.name}
          onCancel={() => setDeleteCrew(null)}
          onConfirm={() => {
            removeCrew(deleteCrew.id);
            pushToast('Deleted ' + deleteCrew.name);
            setDeleteCrew(null);
          }}
        />
      )}
      {removeMember && (
        <ConfirmDeleteModal
          entityLabel={removeMember.person.name}
          confirmText={'Remove from ' + removeMember.crew.name}
          body={
            <div className="muted small">
              Removes {removeMember.person.name} from {removeMember.crew.name}.
              {removeMember.person.defaultCrew === removeMember.crew.id && (
                <> Their default crew will be cleared.</>
              )}
            </div>
          }
          onCancel={() => setRemoveMember(null)}
          onConfirm={confirmRemoveMember}
        />
      )}
    </>
  );
}

function CardActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <IconButton
        icon="more"
        label="Crew actions"
        onClick={() => setOpen(!open)}
      />
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: 30,
              minWidth: 140,
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))',
              padding: 4,
              zIndex: 51,
            }}
          >
            <button
              type="button"
              onClick={() => {
                onEdit();
                setOpen(false);
              }}
              style={menuBtnStyle()}
            >
              <Icon name="settings" size={12} /> Edit crew
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              style={menuBtnStyle('#C53030')}
            >
              <Icon name="x" size={12} /> Delete crew
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function menuBtnStyle(color?: string): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 12,
    borderRadius: 6,
    color: color ?? 'var(--fg)',
  };
}

function MemberRow({
  person,
  isLead,
  onRemove,
}: {
  person: Person;
  isLead: boolean;
  onRemove?: () => void;
}) {
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
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={'Remove ' + person.name + ' from crew'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 4,
          }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
