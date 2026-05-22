// =============================================================
// Technicians view — sortable table of every person on staff.
// "+ Add technician" modal + "View skills matrix" drawer.
// People are the primary atom; crews are a grouping (CrewsView).
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import {
  TODAY,
  addDays,
  dateKey,
  startOfWeek,
} from '../../data/helpers';
import { getCrew, roleLabel } from '../../data/selectors';
import { ROLES } from '../../data/seed';
import type { Crew, Person, RoleKey } from '../../types';
import { SkillsMatrix } from '../crews/SkillsMatrix';
import { AddTechnicianModal } from './AddTechnicianModal';

type SortKey =
  | 'name'
  | 'role'
  | 'crew'
  | 'utilization'
  | 'status';
type SortDir = 'asc' | 'desc';

type StatusValue = 'available' | 'out_today' | 'on_loan' | 'on_vacation';

interface RowData {
  person: Person;
  crew: Crew | undefined;
  hours: number;
  capacityHrs: number;
  utilization: number;
  pairLeadIds: string[];
  status: StatusValue;
}

const ROLE_FILTERS: RoleKey[] = [
  'hvac_lead',
  'hvac_installer',
  'apprentice',
  'electrician',
  'plumber',
  'fsm',
];

const STATUS_META: Record<StatusValue, { label: string; bg: string; fg: string }> = {
  available: { label: 'Available', bg: 'rgba(60,213,103,0.12)', fg: '#1A6F2E' },
  out_today: { label: 'Out today', bg: 'rgba(197,48,48,0.10)', fg: '#781E1E' },
  on_loan: { label: 'On loan', bg: 'rgba(255,182,39,0.18)', fg: '#8A5500' },
  on_vacation: { label: 'On vacation', bg: 'rgba(127,90,200,0.12)', fg: '#3A2E80' },
};

export function TechniciansView() {
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const jobs = useStore((s) => s.jobs);
  const timeOff = useStore((s) => s.timeOff);
  const setTab = useStore((s) => s.setTab);

  const [roleFilter, setRoleFilter] = useState<RoleKey | 'all'>('all');
  const [query, setQuery] = useState('');
  const [outTodayOnly, setOutTodayOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showAdd, setShowAdd] = useState(false);
  const [showSkills, setShowSkills] = useState(false);

  // Compute weekly utilization + pair-with leads from the live jobs grid
  const todayDk = dateKey(TODAY);
  const weekStart = useMemo(() => startOfWeek(TODAY), []);
  const weekDks = useMemo(
    () => Array.from({ length: 5 }, (_, i) => dateKey(addDays(weekStart, i))),
    [weekStart],
  );

  const outTodayIds = useMemo(
    () => new Set(timeOff.filter((t) => t.date === todayDk).map((t) => t.personId)),
    [timeOff, todayDk],
  );
  const onVacationIds = useMemo(() => {
    const map = new Map<string, boolean>();
    timeOff.forEach((t) => {
      if (t.type === 'vacation' && weekDks.includes(t.date)) map.set(t.personId, true);
    });
    return map;
  }, [timeOff, weekDks]);

  const rows: RowData[] = useMemo(() => {
    const hoursByPerson: Record<string, number> = {};
    const pairLeadsByPerson: Record<string, Map<string, number>> = {};
    weekDks.forEach((dk) => {
      jobs
        .filter((j) => j.date === dk)
        .forEach((j) => {
          const leadSlot = j.slots.find((s) =>
            ['hvac_lead', 'electrician', 'plumber', 'fsm'].includes(s.role),
          );
          const leadId = leadSlot?.assignedTo || null;
          j.slots.forEach((s) => {
            if (!s.assignedTo) return;
            hoursByPerson[s.assignedTo] =
              (hoursByPerson[s.assignedTo] ?? 0) + (s.hours || 0);
            if (leadId && leadId !== s.assignedTo) {
              if (!pairLeadsByPerson[s.assignedTo])
                pairLeadsByPerson[s.assignedTo] = new Map();
              const m = pairLeadsByPerson[s.assignedTo];
              m.set(leadId, (m.get(leadId) ?? 0) + 1);
            }
          });
        });
    });
    // On-loan: a person whose week trail crosses crews other than their defaultCrew
    const loanedThisWeek = new Set<string>();
    people.forEach((p) => {
      const trailCrews = new Set<string>();
      weekDks.forEach((dk) => {
        jobs
          .filter((j) => j.date === dk)
          .forEach((j) => {
            if (!j.crewId) return;
            if (j.slots.some((s) => s.assignedTo === p.id)) trailCrews.add(j.crewId);
          });
      });
      const others = Array.from(trailCrews).filter((c) => c !== p.defaultCrew);
      if (others.length > 0) loanedThisWeek.add(p.id);
    });
    const capacity = 40; // 5 days × 8 hours
    return people.map((p) => {
      const hours = hoursByPerson[p.id] ?? 0;
      const pairs = pairLeadsByPerson[p.id];
      const pairLeadIds = pairs
        ? Array.from(pairs.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id)
            .slice(0, 2)
        : [];
      let status: StatusValue = 'available';
      if (outTodayIds.has(p.id)) status = 'out_today';
      else if (onVacationIds.has(p.id)) status = 'on_vacation';
      else if (loanedThisWeek.has(p.id)) status = 'on_loan';
      return {
        person: p,
        crew: getCrew(crews, p.defaultCrew),
        hours,
        capacityHrs: capacity,
        utilization: Math.min(1, hours / capacity),
        pairLeadIds,
        status,
      };
    });
  }, [people, crews, jobs, weekDks, outTodayIds, onVacationIds]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (roleFilter !== 'all' && !r.person.roles.includes(roleFilter)) return false;
      if (outTodayOnly && r.status !== 'out_today') return false;
      if (query) {
        const hay = (
          r.person.name +
          ' ' +
          r.person.id +
          ' ' +
          (r.crew?.name || '') +
          ' ' +
          (r.person.certs || []).join(' ')
        ).toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, roleFilter, query, outTodayOnly]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = filtered.slice();
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.person.name.localeCompare(b.person.name) * dir;
        case 'role':
          return (
            roleLabel(a.person.roles[0]).localeCompare(roleLabel(b.person.roles[0])) *
            dir
          );
        case 'crew':
          return (a.crew?.name || '').localeCompare(b.crew?.name || '') * dir;
        case 'utilization':
          return (a.utilization - b.utilization) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  }

  // counts
  const total = people.length;
  const inField = people.filter((p) => (p.roles[0] || 'hvac_installer') !== 'fsm').length;
  const office = people.filter((p) => p.roles[0] === 'fsm').length;
  const outToday = rows.filter((r) => r.status === 'out_today').length;

  return (
    <>
      <PageHeader
        eyebrow="Resources"
        title="Technicians"
        subtitle={
          total +
          ' total · ' +
          inField +
          ' in field · ' +
          office +
          ' office · ' +
          outToday +
          ' out today'
        }
      >
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setShowSkills(true)}
        >
          <Icon name="layers" size={14} /> View skills matrix
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Icon name="plus" size={14} /> Add technician
        </button>
      </PageHeader>

      <div className="filter-row">
        <button
          className={'filter-chip ' + (roleFilter === 'all' ? 'active' : '')}
          onClick={() => setRoleFilter('all')}
        >
          All roles
        </button>
        {ROLE_FILTERS.map((rk) => (
          <button
            key={rk}
            className={'filter-chip ' + (roleFilter === rk ? 'active' : '')}
            onClick={() => setRoleFilter(rk)}
          >
            {ROLES[rk].label}
          </button>
        ))}
        <div className="search" style={{ width: 220, marginLeft: 12 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="Search name, cert…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label
          className="row"
          style={{ gap: 6, fontSize: 12, marginLeft: 8, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={outTodayOnly}
            onChange={(e) => setOutTodayOnly(e.target.checked)}
          />
          Out today only
        </label>
      </div>

      <div className="view-pad" style={{ paddingTop: 12 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <SortableTh
                  label="Technician"
                  k="name"
                  current={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <SortableTh
                  label="Role"
                  k="role"
                  current={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <SortableTh
                  label="Default crew"
                  k="crew"
                  current={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <SortableTh
                  label="Util (this wk)"
                  k="utilization"
                  current={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <th>Paired with</th>
                <SortableTh
                  label="Status"
                  k="status"
                  current={sortKey}
                  dir={sortDir}
                  onClick={toggleSort}
                />
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.person.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar person={r.person} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.person.name}</div>
                          <div className="muted small mono">
                            {r.person.id.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {roleLabel(r.person.roles[0])}
                      </div>
                      <div
                        className="row"
                        style={{ gap: 4, flexWrap: 'wrap', marginTop: 2 }}
                      >
                        <span
                          className="tag"
                          style={{
                            background:
                              r.person.level === 'L3'
                                ? 'var(--lime)'
                                : r.person.level === 'L2'
                                  ? 'var(--jt-water-bg)'
                                  : 'var(--bg-muted)',
                          }}
                        >
                          {r.person.level}
                        </span>
                        {(r.person.certs || []).map((c) => (
                          <span key={c} className="tag">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {r.crew ? (
                        <button
                          className="role-chip clickable compact"
                          onClick={() => setTab('crews')}
                          title={'Jump to ' + r.crew.name + ' on Crews'}
                          style={{ border: 'none', cursor: 'pointer' }}
                        >
                          <span
                            className="dot"
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: r.crew.color,
                            }}
                          />
                          <span className="role-chip-name">{r.crew.name}</span>
                        </button>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td>
                      <div
                        className="util-bar"
                        title={r.hours + 'h / ' + r.capacityHrs + 'h'}
                      >
                        <div
                          className="util-bar-fill"
                          style={{
                            width: Math.round(r.utilization * 100) + '%',
                            background:
                              r.utilization > 0.95
                                ? '#C53030'
                                : r.utilization > 0.8
                                  ? '#D69E2E'
                                  : 'var(--jetson-green)',
                          }}
                        />
                      </div>
                      <div
                        className="muted small mono"
                        style={{ marginTop: 2 }}
                      >
                        {r.hours}h
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {r.pairLeadIds.length === 0 ? (
                          <span className="muted small">—</span>
                        ) : (
                          r.pairLeadIds.map((lid) => {
                            const lead = people.find((x) => x.id === lid);
                            if (!lead) return null;
                            return (
                              <span key={lid} className="lead-pair-chip">
                                <Avatar person={lead} size="xs" />
                                <span>{lead.name.split(' ').slice(-1)[0]}</span>
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: meta.bg,
                          color: meta.fg,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <IconButton icon="more" label="More" />
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <Icon name="user" size={28} stroke="var(--mid-gray)" />
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: 'var(--font-subhead)',
                        fontWeight: 700,
                      }}
                    >
                      No technicians match
                    </div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      Try clearing filters or the search box.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddTechnicianModal onClose={() => setShowAdd(false)} />}
      {showSkills && <SkillsMatrixDrawer onClose={() => setShowSkills(false)} />}
    </>
  );
}

interface SortableThProps {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}

function SortableTh({ label, k, current, dir, onClick }: SortableThProps) {
  const active = k === current;
  return (
    <th
      onClick={() => onClick(k)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (
          <Icon name={dir === 'asc' ? 'chevron_up' : 'chevron_down'} size={10} />
        )}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────
// Skills matrix wrapper (drawer)
// ─────────────────────────────────────────────────────────────
function SkillsMatrixDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 1024 }}
        role="dialog"
        aria-label="Skills matrix"
      >
        <div className="modal-header">
          <Icon name="layers" size={18} />
          <div>
            <div className="eyebrow-sm">Resources</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Skills matrix</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <SkillsMatrix />
        </div>
        <div className="modal-footer">
          <span className="muted small">
            Hours derived from job-slot assignments this week.
          </span>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

