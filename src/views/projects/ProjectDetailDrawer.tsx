// =============================================================
// Project detail drawer — summary, customer, scope, jobs timeline,
// other projects on the same property, and multi-day groupings.
// =============================================================
import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { StatusBadge } from '../../components/StatusBadge';
import { useStore } from '../../store';
import { fmtDate, fmtTime, hoursToStr } from '../../data/helpers';
import {
  getCrew,
  getCustomer,
  getJobType,
  jobsForProject,
  projectsForCustomer,
  statusLabel,
} from '../../data/selectors';
import type { Job, Project } from '../../types';
import { PROJECT_STATUS_META, ProjectStatusBadge } from './ProjectsView';

interface ProjectDetailDrawerProps {
  project: Project;
  onClose: () => void;
}

export function ProjectDetailDrawer({ project, onClose }: ProjectDetailDrawerProps) {
  const customers = useStore((s) => s.customers);
  const crews = useStore((s) => s.crews);
  const allJobs = useStore((s) => s.jobs);
  const allProjects = useStore((s) => s.projects);
  const selectJob = useStore((s) => s.selectJob);

  const customer = getCustomer(customers, project.customer);
  const projJobs = useMemo(
    () =>
      jobsForProject(allJobs, project.id).sort((a, b) =>
        (a.date || '').localeCompare(b.date || ''),
      ),
    [allJobs, project.id],
  );
  const completedJobs = projJobs.filter((j) => j.status === 'complete').length;
  const otherProjects = projectsForCustomer(allProjects, project.customer).filter(
    (p) => p.id !== project.id,
  );
  const meta = PROJECT_STATUS_META[project.status];

  const customerInitials = customer
    ? customer.name
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
    : 'C';

  function openJob(job: Job) {
    selectJob(job.id);
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(720px, 92vw)' }}
      >
        <div className="drawer-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="row" style={{ flex: 1, gap: 12 }}>
            <div
              style={{
                width: 4,
                height: 32,
                borderRadius: 2,
                background: meta.color,
              }}
            ></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow-sm mono" style={{ color: 'var(--fg-muted)' }}>
                {project.id}
              </div>
              <div
                className="h4"
                style={{ fontSize: 18, fontFamily: 'var(--font-subhead)' }}
              >
                {project.name}
              </div>
            </div>
            <ProjectStatusBadge status={project.status} />
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="drawer-body">
          {/* SUMMARY STATS */}
          <div className="proj-detail-stats">
            <div className="proj-detail-stat">
              <div className="l">Value</div>
              <div className="v">
                {project.value != null ? '$' + project.value.toLocaleString() : '—'}
              </div>
            </div>
            <div className="proj-detail-stat">
              <div className="l">Jobs</div>
              <div className="v">
                {completedJobs}/{projJobs.length}
              </div>
            </div>
            <div className="proj-detail-stat">
              <div className="l">Sold</div>
              <div className="v" style={{ fontSize: 14 }}>
                {project.soldDate
                  ? fmtDate(new Date(project.soldDate + 'T12:00:00'), {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </div>
            </div>
            <div className="proj-detail-stat">
              <div className="l">Target completion</div>
              <div className="v" style={{ fontSize: 14 }}>
                {project.targetCompletion
                  ? fmtDate(new Date(project.targetCompletion + 'T12:00:00'), {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </div>
            </div>
          </div>

          {/* CUSTOMER */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Icon name="user" size={14} /> Customer
            </div>
            <div className="row" style={{ gap: 12 }}>
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
                size="lg"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{customer?.name}</div>
                <div className="muted small">{customer?.address}</div>
                <div className="muted small">{customer?.phone}</div>
              </div>
              {project.hubspotDealId && (
                <span
                  className="badge"
                  style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24' }}
                >
                  <Icon name="hubspot" size={10} /> {project.hubspotDealId}
                </span>
              )}
            </div>
          </div>

          {/* DESCRIPTION + DESIGN NOTES */}
          {(project.description || project.designNotes) && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                <Icon name="briefcase" size={14} /> Scope of work
              </div>
              {project.description && (
                <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
                  {project.description}
                </div>
              )}
              {project.designNotes && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(255,182,39,0.08)',
                    border: '1px solid rgba(255,182,39,0.3)',
                    borderRadius: 8,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  <span className="eyebrow-sm" style={{ color: '#8A5500' }}>
                    Design notes
                  </span>
                  <div style={{ marginTop: 4 }}>{project.designNotes}</div>
                </div>
              )}
            </div>
          )}

          {/* JOBS */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Icon name="calendar" size={14} /> Jobs
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                }}
              >
                {completedJobs} / {projJobs.length} complete
              </span>
            </div>
            {projJobs.length === 0 ? (
              <div
                className="muted small"
                style={{
                  padding: 12,
                  textAlign: 'center',
                  background: 'var(--bg-subtle)',
                  borderRadius: 8,
                }}
              >
                No jobs scheduled yet. Click "Add job" to create the first one.
              </div>
            ) : (
              <div className="proj-jobs-list">
                {renderJobBlocks(projJobs, openJob)}
              </div>
            )}
            <button
              className="btn btn-outline btn-sm"
              style={{ marginTop: 10, width: '100%' }}
            >
              <Icon name="plus" size={12} /> Add job to project
            </button>
          </div>

          {/* OTHER PROJECTS FOR THIS PROPERTY */}
          {otherProjects.length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                <Icon name="home" size={14} /> Other projects on this property
                <span
                  style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-muted)' }}
                >
                  {otherProjects.length}
                </span>
              </div>
              <div className="col" style={{ gap: 6 }}>
                {otherProjects.map((op) => {
                  const opJobs = jobsForProject(allJobs, op.id);
                  return (
                    <div key={op.id} className="proj-other-row">
                      <div
                        className="proj-job-accent"
                        style={{ background: PROJECT_STATUS_META[op.status].color }}
                      ></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <span
                            className="mono"
                            style={{ fontSize: 11, color: 'var(--fg-muted)' }}
                          >
                            {op.id}
                          </span>
                          <ProjectStatusBadge status={op.status} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 3 }}>
                          {op.name}
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {opJobs.length} job{opJobs.length === 1 ? '' : 's'}
                          {op.value != null && <> · ${op.value.toLocaleString()}</>}
                          {op.soldDate && (
                            <>
                              {' '}
                              · sold{' '}
                              {fmtDate(new Date(op.soldDate + 'T12:00:00'), {
                                month: 'short',
                                year: 'numeric',
                              })}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-dark btn-sm">
            <Icon name="hubspot" size={12} /> Open deal in HubSpot
          </button>
          <button className="btn btn-primary btn-sm">
            <Icon name="plus" size={12} /> Add job
          </button>
        </div>
      </div>
    </div>
  );

  function renderJobBlocks(projJobsIn: Job[], onJobClick: (j: Job) => void) {
    const rendered = new Set<string>();
    const blocks: React.ReactNode[] = [];
    projJobsIn.forEach((j) => {
      if (rendered.has(j.id)) return;
      if (j.multidayGroupId) {
        const group = projJobsIn.filter((x) => x.multidayGroupId === j.multidayGroupId);
        group.forEach((g) => rendered.add(g.id));
        blocks.push(
          <MultidayJobGroup
            key={j.multidayGroupId}
            jobs={group}
            onJobClick={onJobClick}
            crewLookup={crews}
          />,
        );
      } else {
        rendered.add(j.id);
        blocks.push(
          <ProjectJobRow
            key={j.id}
            job={j}
            onClick={() => onJobClick(j)}
            crewLookup={crews}
          />,
        );
      }
    });
    return blocks;
  }
}

interface ProjectJobRowProps {
  job: Job;
  onClick: () => void;
  crewLookup: ReturnType<typeof useStore.getState>['crews'];
}

function ProjectJobRow({ job, onClick, crewLookup }: ProjectJobRowProps) {
  const jt = getJobType(job.type);
  const crew = getCrew(crewLookup, job.crewId);
  if (!jt) return null;
  return (
    <div className="proj-job-row" onClick={onClick} role="button" tabIndex={0}>
      <div className="proj-job-accent" style={{ background: 'var(--' + jt.color + ')' }}></div>
      <div className="proj-job-when">
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {job.date
            ? fmtDate(new Date(job.date + 'T12:00:00'), {
                month: 'short',
                day: 'numeric',
              })
            : '—'}
        </div>
        <div className="muted" style={{ fontSize: 10 }}>
          {job.startHour != null ? fmtTime(job.startHour) : 'Unscheduled'}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {job.id}
          </span>
          <span className="jt-tag" style={{ fontSize: 9 }}>
            {jt.short}
          </span>
          <StatusBadge status={job.status} />
          {job.continuationOf && (
            <span className="multiday-chip continuation">
              <Icon name="refresh" size={9} /> Continuation
            </span>
          )}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 3 }}>{jt.label}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {crew?.name || 'Unassigned'} · {hoursToStr(job.durationHrs)} ·{' '}
          {statusLabel(job.status)}
        </div>
      </div>
      <Icon name="chevron_right" size={14} stroke="var(--mid-gray)" />
    </div>
  );
}

interface MultidayJobGroupProps {
  jobs: Job[];
  onJobClick: (j: Job) => void;
  crewLookup: ReturnType<typeof useStore.getState>['crews'];
}

function MultidayJobGroup({ jobs, onJobClick, crewLookup }: MultidayJobGroupProps) {
  const sorted = [...jobs].sort(
    (a, b) => (a.multidayIndex || 0) - (b.multidayIndex || 0),
  );
  const total = sorted[0]?.multidayTotal || sorted.length;
  const completed = sorted.filter((j) => j.status === 'complete').length;
  return (
    <div className="proj-multiday-group">
      <div className="proj-multiday-group-head">
        <Icon name="refresh" size={12} stroke="#1A6F2E" />
        <span>
          Multi-day · {total} day{total === 1 ? '' : 's'}
        </span>
        <span className="badge-count">
          {completed}/{total} done
        </span>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {sorted.map((j) => (
          <ProjectJobRow
            key={j.id}
            job={j}
            onClick={() => onJobClick(j)}
            crewLookup={crewLookup}
          />
        ))}
      </div>
    </div>
  );
}
