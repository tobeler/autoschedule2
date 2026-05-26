// =============================================================
// Jobs view — sortable + filterable table.
// Type chips, status filters, search, crew composition column.
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { JobTypeTag } from '../../components/JobTypeTag';
import { StatusBadge } from '../../components/StatusBadge';
import { RoleChip } from '../../components/RoleChip';
import { useStore } from '../../store';
import { fmtTime } from '../../data/helpers';
import {
  getCrew,
  getCustomer,
  getProject,
  getTruck,
  statusLabel,
} from '../../data/selectors';
import { JOB_TYPES } from '../../data/seed';
import type { JobStatus } from '../../types';
import { PROJECT_STATUS_META } from '../projects/ProjectsView';

type TypeFilter = string | 'all';
type StatusFilterValue = JobStatus | 'all';

const STATUS_FILTERS: StatusFilterValue[] = [
  'all',
  'unscheduled',
  'scheduled',
  'enroute',
  'onsite',
  'complete',
  'callback',
];

export function JobsView() {
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const projects = useStore((s) => s.projects);
  const selectJob = useStore((s) => s.selectJob);
  const openWizard = useStore((s) => s.openWizard);
  const pushToast = useStore((s) => s.pushToast);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (typeFilter !== 'all' && j.type !== typeFilter) return false;
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (query) {
        const c = getCustomer(customers, j.customer);
        const hay = (
          j.id +
          ' ' +
          (c?.name || '') +
          ' ' +
          (j.address || '')
        ).toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [jobs, typeFilter, statusFilter, query, customers]);

  const activeCount = jobs.filter(
    (j) => j.status === 'scheduled' || j.status === 'enroute' || j.status === 'onsite',
  ).length;
  const unscheduledCount = jobs.filter((j) => j.status === 'unscheduled').length;
  const completeCount = jobs.filter((j) => j.status === 'complete').length;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        subtitle={
          filtered.length +
          ' jobs · ' +
          activeCount +
          ' active, ' +
          unscheduledCount +
          ' unscheduled, ' +
          completeCount +
          ' complete this quarter'
        }
      >
        <div className="search" style={{ width: 240 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="Search id, customer, address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => pushToast('Sync queued · HubSpot')}
        >
          <Icon name="refresh" size={14} /> Sync HubSpot
        </button>
        <button className="btn btn-primary btn-sm" onClick={openWizard}>
          <Icon name="plus" size={14} /> New job
        </button>
      </PageHeader>

      <div className="filter-row">
        <button
          className={'filter-chip ' + (typeFilter === 'all' ? 'active' : '')}
          onClick={() => setTypeFilter('all')}
        >
          All types
        </button>
        {Object.entries(JOB_TYPES).map(([k, jt]) => (
          <button
            key={k}
            className={'filter-chip ' + (typeFilter === k ? 'active' : '')}
            onClick={() => setTypeFilter(k)}
          >
            <span className="dot" style={{ background: 'var(--' + jt.color + ')' }}></span>
            {jt.label}
          </button>
        ))}
      </div>
      <div className="filter-row" style={{ paddingBottom: 12 }}>
        <span className="eyebrow-sm">Status</span>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={'filter-chip ' + (statusFilter === s ? 'active' : '')}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All' : statusLabel(s as JobStatus)}
          </button>
        ))}
      </div>

      <div className="view-pad" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Date · time</th>
                <th>Crew</th>
                <th>Truck</th>
                <th>Crew composition</th>
                <th>Status</th>
                <th>Project</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const c = getCustomer(customers, j.customer);
                const crew = getCrew(crews, j.crewId);
                const truck = getTruck(trucks, j.truckId);
                const project = getProject(projects, j.projectId);
                const unfilled = j.slots.filter(
                  (s) => !s.assignedTo && !s.optional,
                ).length;
                const projectMeta = project
                  ? PROJECT_STATUS_META[project.status]
                  : null;
                return (
                  <tr
                    key={j.id}
                    className="clickable"
                    onClick={() => selectJob(j.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      {/* Job label: "{Customer} — {Job type}" per Erik's
                          spec. Address subtitle when present. Internal id
                          is no longer surfaced in the list. */}
                      <div style={{ fontWeight: 600 }}>
                        {c ? c.name : j.title || 'Unknown customer'}
                        {JOB_TYPES[j.type]?.label
                          ? ' — ' + JOB_TYPES[j.type].label
                          : ''}
                      </div>
                      {j.address ? (
                        <div className="muted small">{j.address}</div>
                      ) : null}
                    </td>
                    <td>
                      <JobTypeTag type={j.type} />
                    </td>
                    <td>
                      {j.date ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{j.date}</div>
                          <div className="muted small mono">
                            {j.startHour != null
                              ? fmtTime(j.startHour) +
                                '–' +
                                fmtTime(j.startHour + j.durationHrs)
                              : '—'}
                          </div>
                        </>
                      ) : (
                        <span className="muted small">Unscheduled</span>
                      )}
                    </td>
                    <td>
                      {crew ? crew.name : <span className="muted">—</span>}
                    </td>
                    <td>
                      {truck ? (
                        <span className="mono small">{truck.name}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {j.slots.slice(0, 4).map((s) => (
                          <RoleChip
                            key={s.id}
                            role={s.role}
                            level={s.level}
                            assignedTo={s.assignedTo}
                            optional={s.optional}
                            compact
                          />
                        ))}
                        {unfilled > 0 && (
                          <span className="unfilled-pill">
                            <Icon name="user" size={10} /> {unfilled}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                    <td>
                      {project && projectMeta ? (
                        <span
                          className="badge"
                          style={{
                            background: projectMeta.bg,
                            color: projectMeta.fg,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                          title={project.name}
                        >
                          {project.id}
                        </span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                    <Icon name="briefcase" size={28} stroke="var(--mid-gray)" />
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: 'var(--font-subhead)',
                        fontWeight: 700,
                      }}
                    >
                      No jobs match
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
    </>
  );
}
