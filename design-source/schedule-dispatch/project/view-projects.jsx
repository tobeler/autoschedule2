/* eslint-disable */
/* Projects view — list + detail
   A project is a scope of work tied to a customer/property. Jobs roll up to it. */

const { useState: useSP, useMemo: useMP, useEffect: useEP } = React;

const PROJECT_STATUS_META = {
  proposed:    { label: 'Proposed',    color: '#6B5BCF', bg: 'rgba(107,91,207,0.12)',  fg: '#3A2E80' },
  sold:        { label: 'Sold',        color: '#FFB627', bg: 'rgba(255,182,39,0.18)',  fg: '#7A4900' },
  in_progress: { label: 'In progress', color: '#3CD567', bg: 'rgba(60,213,103,0.16)',  fg: '#1A6F2E' },
  complete:    { label: 'Complete',    color: '#113823', bg: 'rgba(17,56,35,0.12)',    fg: '#113823' },
  warranty:    { label: 'Warranty',    color: '#4FB3E8', bg: 'rgba(79,179,232,0.16)',  fg: '#1E5E80' },
  cancelled:   { label: 'Cancelled',   color: '#ACAA93', bg: 'rgba(172,170,147,0.18)', fg: '#666858' },
};

function ProjectStatusBadge({ status }) {
  const m = PROJECT_STATUS_META[status] || PROJECT_STATUS_META.proposed;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 8px', borderRadius: 999,
      background: m.bg, color: m.fg,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }}></span>
      {m.label}
    </span>
  );
}

// =============================================================
// PROJECTS LIST VIEW
// =============================================================
function ProjectsView({ onJobClick, onToast }) {
  const [statusFilter, setStatusFilter] = useSP('all');
  const [query, setQuery] = useSP('');
  const [selected, setSelected] = useSP(null);

  const projects = useMP(() => {
    return PROJECTS.map(p => {
      const projJobs = jobsForProject(p.id);
      const completedJobs = projJobs.filter(j => j.status === 'complete').length;
      const nextJob = projJobs
        .filter(j => j.date && new Date(j.date + 'T12:00:00') >= new Date(TODAY.getTime() - 86400000))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
      const isStale = !nextJob && p.status === 'in_progress';
      // Note: don't overwrite p.customer (string ID) — components re-resolve via getCustomer()
      return { ...p, projJobs, completedJobs, nextJob, isStale };
    });
  }, []);

  const counts = {
    all: projects.length,
    proposed: projects.filter(p => p.status === 'proposed').length,
    sold: projects.filter(p => p.status === 'sold').length,
    in_progress: projects.filter(p => p.status === 'in_progress').length,
    complete: projects.filter(p => p.status === 'complete').length,
    warranty: projects.filter(p => p.status === 'warranty').length,
  };

  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const cust = getCustomer(p.customer);
      if (!p.name.toLowerCase().includes(q)
          && !p.id.toLowerCase().includes(q)
          && !(cust?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalValue = filtered.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div className="proj-view">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        subtitle="Scope-of-work tied to a customer property. Jobs roll up here."
      >
        <button className="btn btn-outline btn-sm">
          <Icon name="plus" size={14} /> New project
        </button>
      </PageHeader>

      <div className="proj-toolbar">
        <div className="search" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Icon name="search" size={14} />
          <input placeholder="Search by customer, project name, ID…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          {[
            ['all', 'All', counts.all],
            ['proposed', 'Proposed', counts.proposed],
            ['sold', 'Sold', counts.sold],
            ['in_progress', 'In progress', counts.in_progress],
            ['warranty', 'Warranty', counts.warranty],
            ['complete', 'Complete', counts.complete],
          ].map(([k, l, c]) => (
            <button key={k} className={statusFilter === k ? 'active' : ''} onClick={() => setStatusFilter(k)}>
              {l} <span className="muted" style={{ marginLeft: 4, fontSize: 10 }}>{c}</span>
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
          <div className="v" style={{ color: filtered.some(p => p.isStale) ? '#C53030' : 'var(--fg)' }}>
            {filtered.filter(p => p.isStale).length}
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
        {filtered.map(p => (
          <ProjectRow key={p.id} project={p} onClick={() => setSelected(p.id)} selected={selected === p.id} />
        ))}
        {filtered.length === 0 && (
          <div className="proj-empty">
            <Icon name="briefcase" size={28} stroke="var(--mid-gray)" />
            <div style={{ marginTop: 12, fontFamily: 'var(--font-subhead)', fontWeight: 700 }}>No projects match</div>
            <div className="muted small">Try a different status filter or clear search.</div>
          </div>
        )}
      </div>

      {selected && (
        <ProjectDetailDrawer
          project={PROJECTS.find(p => p.id === selected)}
          onClose={() => setSelected(null)}
          onJobClick={(j) => { setSelected(null); onJobClick(j); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function ProjectRow({ project, onClick, selected }) {
  const customer = getCustomer(project.customer);
  const meta = PROJECT_STATUS_META[project.status];
  return (
    <div className={"proj-row" + (selected ? ' selected' : '')} onClick={onClick} role="button" tabIndex={0}>
      <div className="col-id">
        <div className="proj-row-stripe" style={{ background: meta.color }}></div>
        <div>
          <div className="proj-row-id mono">{project.id}</div>
          <div className="proj-row-name">{project.name}</div>
        </div>
      </div>
      <div className="col-cust">
        <Avatar person={{ initials: customer?.name.split(' ').map(s=>s[0]).slice(0,2).join('') || '?', name: customer?.name || '—' }} size="sm" />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{customer?.name || '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>{customer?.address?.split('·')[1]?.trim() || '—'}</div>
        </div>
      </div>
      <div className="col-status">
        <ProjectStatusBadge status={project.status} />
        {project.isStale && <span className="badge" style={{ background: 'rgba(197,48,48,0.1)', color: '#781E1E', fontSize: 9, marginLeft: 6 }}>STALE</span>}
      </div>
      <div className="col-jobs">
        <div className="proj-jobs-bar">
          {project.projJobs.length === 0 && <span className="muted small">No jobs yet</span>}
          {project.projJobs.length > 0 && (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>
                {project.completedJobs}/{project.projJobs.length}
              </span>
              <div className="proj-jobs-track">
                <div className="proj-jobs-fill" style={{
                  width: project.projJobs.length ? (project.completedJobs / project.projJobs.length * 100) + '%' : '0%',
                }}></div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="col-next">
        {project.nextJob ? (
          <>
            <div style={{ fontWeight: 600, fontSize: 12 }}>
              {fmtDate(new Date(project.nextJob.date + 'T12:00:00'), { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {fmtTime(project.nextJob.startHour)} · {project.nextJob.id}
            </div>
          </>
        ) : (
          <span className="muted small">—</span>
        )}
      </div>
      <div className="col-value">
        {project.value != null
          ? <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>${project.value.toLocaleString()}</span>
          : <span className="muted small">—</span>
        }
      </div>
      <div className="col-deal">
        {project.hubspotDealId && (
          <span className="badge" style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            <Icon name="hubspot" size={10} /> {project.hubspotDealId}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================
// PROJECT DETAIL DRAWER
// =============================================================
function ProjectDetailDrawer({ project, onClose, onJobClick, onToast }) {
  const customer = getCustomer(project.customer);
  const projJobs = jobsForProject(project.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const completedJobs = projJobs.filter(j => j.status === 'complete').length;
  const otherProjects = projectsForCustomer(project.customer).filter(p => p.id !== project.id);
  const meta = PROJECT_STATUS_META[project.status];

  // Synthesize a timeline of project events from jobs + project metadata
  const timeline = useMP(() => {
    const events = [];
    if (project.soldDate) {
      events.push({ when: project.soldDate, kind: 'sold', label: 'Project sold',
        sub: '$' + (project.value || 0).toLocaleString() + ' · ' + (project.hubspotDealId || '') });
    }
    projJobs.forEach(j => {
      events.push({ when: j.date, kind: 'job-' + j.status, label: JOB_TYPES[j.type].label,
        sub: j.id + ' · ' + statusLabel(j.status), job: j });
    });
    if (project.status === 'complete' && project.targetCompletion) {
      events.push({ when: project.targetCompletion, kind: 'complete', label: 'Project complete' });
    }
    return events.sort((a, b) => (a.when || '').localeCompare(b.when || ''));
  }, [project.id, projJobs.length]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 92vw)' }}>
        <div className="drawer-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="row" style={{ flex: 1, gap: 12 }}>
            <div style={{ width: 4, height: 32, borderRadius: 2, background: meta.color }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow-sm mono" style={{ color: 'var(--fg-muted)' }}>{project.id}</div>
              <div className="h4" style={{ fontSize: 18, fontFamily: 'var(--font-subhead)' }}>{project.name}</div>
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
              <div className="v">{project.value != null ? '$' + project.value.toLocaleString() : '—'}</div>
            </div>
            <div className="proj-detail-stat">
              <div className="l">Jobs</div>
              <div className="v">{completedJobs}/{projJobs.length}</div>
            </div>
            <div className="proj-detail-stat">
              <div className="l">Sold</div>
              <div className="v" style={{ fontSize: 14 }}>
                {project.soldDate ? fmtDate(new Date(project.soldDate + 'T12:00:00'), { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </div>
            </div>
            <div className="proj-detail-stat">
              <div className="l">Target completion</div>
              <div className="v" style={{ fontSize: 14 }}>
                {project.targetCompletion ? fmtDate(new Date(project.targetCompletion + 'T12:00:00'), { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </div>
            </div>
          </div>

          {/* CUSTOMER */}
          <div className="drawer-section">
            <div className="drawer-section-title"><Icon name="user" size={14} /> Customer</div>
            <div className="row" style={{ gap: 12 }}>
              <Avatar person={{ initials: customer?.name.split(' ').map(s=>s[0]).slice(0,2).join('') || 'C', name: customer?.name || '' }} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{customer?.name}</div>
                <div className="muted small">{customer?.address}</div>
                <div className="muted small">{customer?.phone}</div>
              </div>
              {project.hubspotDealId && (
                <span className="badge" style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24' }}>
                  <Icon name="hubspot" size={10} /> {project.hubspotDealId}
                </span>
              )}
            </div>
          </div>

          {/* DESCRIPTION + DESIGN NOTES */}
          {(project.description || project.designNotes) && (
            <div className="drawer-section">
              <div className="drawer-section-title"><Icon name="briefcase" size={14} /> Scope of work</div>
              {project.description && <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>{project.description}</div>}
              {project.designNotes && (
                <div style={{
                  padding: '10px 12px',
                  background: 'rgba(255,182,39,0.08)',
                  border: '1px solid rgba(255,182,39,0.3)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}>
                  <span className="eyebrow-sm" style={{ color: '#8A5500' }}>Design notes</span>
                  <div style={{ marginTop: 4 }}>{project.designNotes}</div>
                </div>
              )}
            </div>
          )}

          {/* JOBS */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Icon name="calendar" size={14} /> Jobs
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
                {completedJobs} / {projJobs.length} complete
              </span>
            </div>
            {projJobs.length === 0 ? (
              <div className="muted small" style={{ padding: 12, textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: 8 }}>
                No jobs scheduled yet. Click "Add job" to create the first one.
              </div>
            ) : (
              <div className="proj-jobs-list">
                {(() => {
                  const rendered = new Set();
                  const blocks = [];
                  projJobs.forEach(j => {
                    if (rendered.has(j.id)) return;
                    if (j.multidayGroupId) {
                      const group = projJobs.filter(x => x.multidayGroupId === j.multidayGroupId);
                      group.forEach(g => rendered.add(g.id));
                      blocks.push(<MultidayJobGroup key={j.multidayGroupId} jobs={group} onJobClick={onJobClick} />);
                    } else {
                      rendered.add(j.id);
                      blocks.push(<ProjectJobRow key={j.id} job={j} onClick={() => onJobClick(j)} />);
                    }
                  });
                  return blocks;
                })()}
              </div>
            )}
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10, width: '100%' }}>
              <Icon name="plus" size={12} /> Add job to project
            </button>
          </div>

          {/* OTHER PROJECTS FOR THIS PROPERTY */}
          {otherProjects.length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                <Icon name="home" size={14} /> Other projects on this property
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-muted)' }}>{otherProjects.length}</span>
              </div>
              <div className="col" style={{ gap: 6 }}>
                {otherProjects.map(op => {
                  const opJobs = jobsForProject(op.id);
                  return (
                    <div key={op.id} className="proj-other-row">
                      <div className="proj-job-accent" style={{ background: PROJECT_STATUS_META[op.status].color }}></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{op.id}</span>
                          <ProjectStatusBadge status={op.status} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 3 }}>{op.name}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {opJobs.length} job{opJobs.length === 1 ? '' : 's'}
                          {op.value != null && <> · ${op.value.toLocaleString()}</>}
                          {op.soldDate && <> · sold {fmtDate(new Date(op.soldDate + 'T12:00:00'), { month: 'short', year: 'numeric' })}</>}
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
          <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
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
}

// Individual job row inside the project drawer
function ProjectJobRow({ job, onClick }) {
  const jt = getJobType(job.type);
  const crew = getCrew(job.crewId);
  return (
    <div className="proj-job-row" onClick={onClick} role="button" tabIndex={0}>
      <div className="proj-job-accent" style={{ background: 'var(--' + jt.color + ')' }}></div>
      <div className="proj-job-when">
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {job.date ? fmtDate(new Date(job.date + 'T12:00:00'), { month: 'short', day: 'numeric' }) : '—'}
        </div>
        <div className="muted" style={{ fontSize: 10 }}>
          {job.startHour != null ? fmtTime(job.startHour) : 'Unscheduled'}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{job.id}</span>
          <span className="jt-tag" style={{ fontSize: 9 }}>{jt.short}</span>
          <StatusBadge status={job.status} />
          {job.continuationOf && (
            <span className="multiday-chip continuation"><Icon name="refresh" size={9} /> Continuation</span>
          )}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 3 }}>{jt.label}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {crew?.name || 'Unassigned'} · {hoursToStr(job.durationHrs)}
        </div>
      </div>
      <Icon name="chevron_right" size={14} stroke="var(--mid-gray)" />
    </div>
  );
}

// Multi-day group container: shows the linked days inline
function MultidayJobGroup({ jobs, onJobClick }) {
  const sorted = [...jobs].sort((a, b) => (a.multidayIndex || 0) - (b.multidayIndex || 0));
  const total = sorted[0]?.multidayTotal || sorted.length;
  const completed = sorted.filter(j => j.status === 'complete').length;
  return (
    <div className="proj-multiday-group">
      <div className="proj-multiday-group-head">
        <Icon name="refresh" size={12} stroke="#1A6F2E" />
        <span>Multi-day · {total} day{total === 1 ? '' : 's'}</span>
        <span className="badge-count">{completed}/{total} done</span>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {sorted.map(j => (
          <ProjectJobRow key={j.id} job={j} onClick={() => onJobClick(j)} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ProjectsView, ProjectDetailDrawer, ProjectStatusBadge, ProjectJobRow, MultidayJobGroup });
