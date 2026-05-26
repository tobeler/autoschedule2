// =============================================================
// Projects view — list + detail drawer
// A project is a scope of work tied to a customer property.
// Jobs roll up to it.
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Avatar } from '../../components/Avatar';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import { TODAY, fmtDate, fmtTime } from '../../data/helpers';
import { getCustomer, jobsForProject } from '../../data/selectors';
import type { Project, ProjectStatus } from '../../types';
import { ProjectDetailDrawer } from './ProjectDetailDrawer';
import { AddProjectModal } from './AddProjectModal';
import { EditProjectModal } from './EditProjectModal';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { IconButton } from '../../components/IconButton';

interface ProjectStatusMeta {
  label: string;
  color: string;
  bg: string;
  fg: string;
}

export const PROJECT_STATUS_META: Record<ProjectStatus, ProjectStatusMeta> = {
  proposed: { label: 'Proposed', color: '#6B5BCF', bg: 'rgba(107,91,207,0.12)', fg: '#3A2E80' },
  sold: { label: 'Sold', color: '#FFB627', bg: 'rgba(255,182,39,0.18)', fg: '#7A4900' },
  in_progress: { label: 'In progress', color: '#3CD567', bg: 'rgba(60,213,103,0.16)', fg: '#1A6F2E' },
  complete: { label: 'Complete', color: '#113823', bg: 'rgba(17,56,35,0.12)', fg: '#113823' },
  warranty: { label: 'Warranty', color: '#4FB3E8', bg: 'rgba(79,179,232,0.16)', fg: '#1E5E80' },
  cancelled: { label: 'Cancelled', color: '#ACAA93', bg: 'rgba(172,170,147,0.18)', fg: '#666858' },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const m = PROJECT_STATUS_META[status] || PROJECT_STATUS_META.proposed;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 999,
        background: m.bg,
        color: m.fg,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: m.color,
        }}
      ></span>
      {m.label}
    </span>
  );
}

type StatusFilter = ProjectStatus | 'all';

export function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const customers = useStore((s) => s.customers);
  const jobs = useStore((s) => s.jobs);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const removeProjectAction = useStore((s) => s.removeProject);
  const pushToast = useStore((s) => s.pushToast);

  function activeJobsForProject(id: string) {
    return jobs.filter(
      (j) => j.projectId === id && j.status !== 'complete',
    );
  }

  const enriched = useMemo(() => {
    const todayMs = TODAY.getTime();
    return projects.map((p) => {
      const projJobs = jobsForProject(jobs, p.id);
      const completedJobs = projJobs.filter((j) => j.status === 'complete').length;
      const nextJob = projJobs
        .filter(
          (j) =>
            j.date && new Date(j.date + 'T12:00:00').getTime() >= todayMs - 86400000,
        )
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
      const isStale = !nextJob && p.status === 'in_progress';
      return { ...p, projJobs, completedJobs, nextJob, isStale };
    });
  }, [projects, jobs]);

  const counts = {
    all: enriched.length,
    proposed: enriched.filter((p) => p.status === 'proposed').length,
    sold: enriched.filter((p) => p.status === 'sold').length,
    in_progress: enriched.filter((p) => p.status === 'in_progress').length,
    complete: enriched.filter((p) => p.status === 'complete').length,
    warranty: enriched.filter((p) => p.status === 'warranty').length,
    cancelled: enriched.filter((p) => p.status === 'cancelled').length,
  };

  const filtered = enriched.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const cust = getCustomer(customers, p.customer);
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.id.toLowerCase().includes(q) &&
        !(cust?.name || '').toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const totalValue = filtered.reduce((s, p) => s + (p.value || 0), 0);

  const filters: [StatusFilter, string, number][] = [
    ['all', 'All', counts.all],
    ['proposed', 'Proposed', counts.proposed],
    ['sold', 'Sold', counts.sold],
    ['in_progress', 'In progress', counts.in_progress],
    ['warranty', 'Warranty', counts.warranty],
    ['complete', 'Complete', counts.complete],
  ];

  const selected = selectedId ? projects.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="proj-view">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        subtitle="Scope-of-work tied to a customer property. Jobs roll up here."
      >
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Icon name="plus" size={14} /> New project
        </button>
      </PageHeader>

      <div className="proj-toolbar">
        <div
          className="search"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
        >
          <Icon name="search" size={14} />
          <input
            placeholder="Search by customer, project name, ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          {filters.map(([k, l, c]) => (
            <button
              key={k}
              className={statusFilter === k ? 'active' : ''}
              onClick={() => setStatusFilter(k)}
            >
              {l}{' '}
              <span className="muted" style={{ marginLeft: 4, fontSize: 10 }}>
                {c}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="proj-summary">
        <div className="proj-summary-stat">
          <div className="l">Showing</div>
          <div className="v">{filtered.length}</div>
        </div>
        <div className="proj-summary-stat">
          <div className="l">Pipeline value</div>
          <div className="v">${totalValue.toLocaleString()}</div>
        </div>
        <div className="proj-summary-stat">
          <div className="l">Stale</div>
          <div
            className="v"
            style={{
              color: filtered.some((p) => p.isStale) ? '#C53030' : 'var(--fg)',
            }}
          >
            {filtered.filter((p) => p.isStale).length}
          </div>
        </div>
      </div>

      <div className="proj-table">
        <div className="proj-table-header">
          <div className="col-id">Project</div>
          <div className="col-cust">Customer</div>
          <div className="col-status">Status</div>
          <div className="col-jobs">Jobs</div>
          <div className="col-next">Next visit</div>
          <div className="col-value">Value</div>
          <div className="col-deal">Deal</div>
        </div>
        {filtered.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            projJobsCount={p.projJobs.length}
            completedJobs={p.completedJobs}
            nextJob={p.nextJob}
            isStale={p.isStale}
            selected={selectedId === p.id}
            onClick={() => setSelectedId(p.id)}
            menuOpen={openMenuId === p.id}
            onMenuToggle={() =>
              setOpenMenuId(openMenuId === p.id ? null : p.id)
            }
            onEdit={() => {
              setEditProject(p);
              setOpenMenuId(null);
            }}
            onDelete={() => {
              setDeleteProject(p);
              setOpenMenuId(null);
            }}
          />
        ))}
        {filtered.length === 0 && (
          <div className="proj-empty">
            <Icon name="briefcase" size={28} stroke="var(--mid-gray)" />
            <div
              style={{ marginTop: 12, fontFamily: 'var(--font-subhead)', fontWeight: 700 }}
            >
              No projects match
            </div>
            <div className="muted small">Try a different status filter or clear search.</div>
          </div>
        )}
      </div>

      {selected && (
        <ProjectDetailDrawer
          project={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditProject(selected)}
          onDelete={() => setDeleteProject(selected)}
        />
      )}

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} />}
      {editProject && (
        <EditProjectModal
          project={editProject}
          onClose={() => setEditProject(null)}
        />
      )}
      {deleteProject && (
        <ConfirmDeleteModal
          entityLabel={deleteProject.name}
          body={(() => {
            const blockers = activeJobsForProject(deleteProject.id);
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
                    {deleteProject.name} has {blockers.length} active job
                    {blockers.length === 1 ? '' : 's'} — cancel or reassign first.
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
                    {blockers.slice(0, 5).map((j) => (
                      <li key={j.id} className="mono">
                        {j.id} · {j.status}
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
                Completed jobs that referenced this project keep their history.
              </div>
            );
          })()}
          blocked={activeJobsForProject(deleteProject.id).length > 0}
          confirmText={'Delete ' + deleteProject.id}
          onCancel={() => setDeleteProject(null)}
          onConfirm={() => {
            removeProjectAction(deleteProject.id);
            pushToast('Deleted ' + deleteProject.name);
            setDeleteProject(null);
            if (selectedId === deleteProject.id) setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}

interface RowProps {
  project: Project;
  projJobsCount: number;
  completedJobs: number;
  nextJob: { id: string; date: string | null; startHour: number | null } | undefined;
  isStale: boolean;
  selected: boolean;
  onClick: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProjectRow({
  project,
  projJobsCount,
  completedJobs,
  nextJob,
  isStale,
  selected,
  onClick,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
}: RowProps) {
  const customers = useStore((s) => s.customers);
  const customer = getCustomer(customers, project.customer);
  const meta = PROJECT_STATUS_META[project.status];
  const customerInitials =
    (customer?.name || '?')
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('') || '?';
  return (
    <div
      className={'proj-row' + (selected ? ' selected' : '')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{ position: 'relative' }}
    >
      <div className="col-id">
        <div className="proj-row-stripe" style={{ background: meta.color }}></div>
        <div>
          {/*
            Customer-name + project-type is the primary label. The
            project's own name (often a verbose deal-name) is a subtitle.
            We deliberately do NOT surface the synthetic project id here
            (hs-i-… / hs-p-… / hs-d-…) — Erik doesn't want ID numbers in
            list views.
          */}
          <div className="proj-row-name" style={{ fontWeight: 600 }}>
            {customer ? customer.name : (project.name || 'Unknown customer')}
            {project.type ? ' — ' + project.type : ''}
          </div>
          {project.name && customer ? (
            <div className="muted small" style={{ marginTop: 2 }}>
              {project.name}
            </div>
          ) : null}
        </div>
      </div>
      <div className="col-cust">
        <Avatar
          person={
            customer
              ? {
                  id: customer.id,
                  initials: customerInitials,
                  name: customer.name,
                  roles: [],
                  level: 'L1',
                  defaultCrew: '',
                }
              : null
          }
          size="sm"
        />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{customer?.name || '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {customer?.address?.split('·')[1]?.trim() || '—'}
          </div>
        </div>
      </div>
      <div className="col-status">
        <ProjectStatusBadge status={project.status} />
        {isStale && (
          <span
            className="badge"
            style={{
              background: 'rgba(197,48,48,0.1)',
              color: '#781E1E',
              fontSize: 9,
              marginLeft: 6,
            }}
          >
            STALE
          </span>
        )}
      </div>
      <div className="col-jobs">
        <div className="proj-jobs-bar">
          {projJobsCount === 0 && <span className="muted small">No jobs yet</span>}
          {projJobsCount > 0 && (
            <>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {completedJobs}/{projJobsCount}
              </span>
              <div className="proj-jobs-track">
                <div
                  className="proj-jobs-fill"
                  style={{
                    width: projJobsCount
                      ? (completedJobs / projJobsCount) * 100 + '%'
                      : '0%',
                  }}
                ></div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="col-next">
        {nextJob && nextJob.date ? (
          <>
            <div style={{ fontWeight: 600, fontSize: 12 }}>
              {fmtDate(new Date(nextJob.date + 'T12:00:00'), {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {nextJob.startHour != null ? fmtTime(nextJob.startHour) : '—'} · {nextJob.id}
            </div>
          </>
        ) : (
          <span className="muted small">—</span>
        )}
      </div>
      <div className="col-value">
        {project.value != null ? (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            ${project.value.toLocaleString()}
          </span>
        ) : (
          <span className="muted small">—</span>
        )}
      </div>
      <div className="col-deal" style={{ position: 'relative' }}>
        {project.hubspotDealId && (
          <span
            className="badge"
            style={{
              background: 'rgba(255,122,89,0.12)',
              color: '#9F3D24',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Icon name="hubspot" size={10} /> {project.hubspotDealId}
          </span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle();
          }}
          style={{
            display: 'inline-flex',
            marginLeft: 6,
            verticalAlign: 'middle',
          }}
        >
          <IconButton icon="more" label="Project actions" />
        </span>
        {menuOpen && (
          <>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onMenuToggle();
              }}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            />
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                right: 4,
                top: 28,
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
                onClick={onEdit}
                style={projMenuStyle()}
              >
                <Icon name="settings" size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                style={projMenuStyle('#C53030')}
              >
                <Icon name="x" size={12} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function projMenuStyle(color?: string): React.CSSProperties {
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
