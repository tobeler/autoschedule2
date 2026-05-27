// =============================================================
// Jobs view — sortable + filterable table.
// Type chips, status/source/region filters, search, crew composition column.
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { JobTypeTag } from '../../components/JobTypeTag';
import { StatusBadge } from '../../components/StatusBadge';
import { RoleChip } from '../../components/RoleChip';
import { SortableHeader } from '../../components/SortableHeader';
import { useStore } from '../../store';
import { fmtTime } from '../../data/helpers';
import {
  getCrew,
  getCustomer,
  getJobType,
  getPerson,
  getProject,
  getTruck,
  statusLabel,
  unscheduledJobs,
  unscheduledNeedsReviewJobs,
} from '../../data/selectors';
import { unscheduledReviewReason } from '../../lib/dispatch-work';
import {
  type SortState,
  chipMatches,
  makeSorter,
  matchesSearch,
  nextSort,
  tokenizeQuery,
} from '../../lib/table';
import {
  REGION_PREFIXES,
  regionPrefixFromTeamName,
  useRegionFilter,
  type RegionPrefix,
} from '../../lib/region-filter';
import type { Crew, Customer, Job, JobStatus, Project, Truck } from '../../types';
import { PROJECT_STATUS_META } from '../projects/ProjectsView';

// Sortable column keys for the jobs table.
type JobSortKey =
  | 'customer'
  | 'type'
  | 'date'
  | 'crew'
  | 'truck'
  | 'status'
  | 'project';

type TypeFilter = string | 'all';

// Status chips — explicit order. "Cancelled" lives in the type union but
// isn't part of the default chip strip; we keep it here so cancelled jobs
// can still be filtered explicitly.
const STATUS_CHIPS: JobStatus[] = [
  'unscheduled',
  'scheduled',
  'enroute',
  'onsite',
  'complete',
  'callback',
  'cancelled',
];

// Source chips collapse project provenance into the two operational
// "lanes" the dispatch team thinks in: V1 (legacy HubSpot-installation
// records) vs V2 (native project records, plus the deal-fallback bucket
// which behaves like V2 for scheduling).
type SourceKey = 'v1' | 'v2';
const SOURCE_CHIPS: { key: SourceKey; label: string }[] = [
  { key: 'v1', label: 'V1' },
  { key: 'v2', label: 'V2' },
];

// Region prefix on zuperTeamName (e.g. "CO-DE-1" → "CO"). Order mirrors
// the operational hierarchy used elsewhere in the app. We reuse the
// `RegionPrefix` type from useRegionFilter so the chip values match the
// shared region store exactly.
const REGION_CHIPS: RegionPrefix[] = [...REGION_PREFIXES];

function regionOfJob(job: Job): RegionPrefix | null {
  return regionPrefixFromTeamName(job.zuperTeamName);
}



function sourceOfJob(job: Job, projects: Project[]): SourceKey | null {
  if (!job.projectId) return null;
  const p = projects.find((pr) => pr.id === job.projectId);
  if (!p?.source) return null;
  if (p.source === 'legacy_installation') return 'v1';
  // native_project + deal_fallback both behave as V2.
  return 'v2';
}

// Combine date (ISO YYYY-MM-DD) and startHour into a sortable number.
// Unscheduled (no date) → null, which compareBy will sink to the end.
function jobTimestamp(job: Job): number | null {
  if (!job.date) return null;
  const d = new Date(job.date + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const hourMs = (job.startHour ?? 0) * 60 * 60 * 1000;
  return d.getTime() + hourMs;
}

export function JobsView() {
  const jobs = useStore((s) => s.jobs);
  const customers = useStore((s) => s.customers);
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const projects = useStore((s) => s.projects);
  const people = useStore((s) => s.people);
  const selectJob = useStore((s) => s.selectJob);
  const openWizard = useStore((s) => s.openWizard);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusSet, setStatusSet] = useState<Set<JobStatus>>(() => new Set());
  const [sourceSet, setSourceSet] = useState<Set<SourceKey>>(() => new Set());
  // Hide completed + cancelled by default — the Zuper bootstrap pulls all
  // history (4500+ completed rows) and a dispatcher rarely needs them in
  // the table. Toggle off to include historical jobs.
  const [activeOnly, setActiveOnly] = useState(true);
  // Region filter is shared with the topbar picker — single source of truth.
  const { region: regionFilter, setRegion: setRegionFilter } = useRegionFilter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState<JobSortKey> | null>({
    key: 'date',
    dir: 'desc',
  });

  // Build lookup maps once per render so the sort comparator doesn't run
  // a linear find() for every comparison (n*log n * n = O(n^2 log n)).
  const customerById = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);
  const crewById = useMemo(() => {
    const m = new Map<string, Crew>();
    for (const c of crews) m.set(c.id, c);
    return m;
  }, [crews]);
  const truckById = useMemo(() => {
    const m = new Map<string, Truck>();
    for (const t of trucks) m.set(t.id, t);
    return m;
  }, [trucks]);
  const projectById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const tokens = useMemo(() => tokenizeQuery(query), [query]);
  const typeOptions = useMemo(
    () =>
      Array.from(new Set(jobs.map((j) => j.type)))
        .map((type) => ({ type, meta: getJobType(type) }))
        .sort((a, b) =>
          (a.meta?.label ?? a.type).localeCompare(b.meta?.label ?? b.type),
        ),
    [jobs],
  );

  const filtered = useMemo(() => {
    const list = jobs.filter((j) => {
      // Active-only is a top-level filter that overrides nothing else; when
      // ON (default), historical rows never reach the chip filters at all.
      if (activeOnly && (j.status === 'complete' || j.status === 'cancelled')) return false;
      if (typeFilter !== 'all' && j.type !== typeFilter) return false;
      if (!chipMatches(statusSet, j.status)) return false;
      if (sourceSet.size > 0) {
        const src = sourceOfJob(j, projects);
        if (!chipMatches(sourceSet, src)) return false;
      }
      if (regionFilter !== 'all') {
        const reg = regionOfJob(j);
        if (reg !== regionFilter) return false;
      }
      if (tokens.length > 0) {
        const c = j.customer ? customerById.get(j.customer) : undefined;
        if (
          !matchesSearch(
            [
              c?.name,
              j.address,
              j.title,
              j.hubspotDealId,
              j.zuperJobUid,
              j.id,
            ],
            tokens,
          )
        ) {
          return false;
        }
      }
      return true;
    });

    const extractors: Record<JobSortKey, (j: Job) => unknown> = {
      customer: (j) =>
        (j.customer ? customerById.get(j.customer)?.name : null) ?? j.title ?? '',
      type: (j) => getJobType(j.type)?.label ?? j.type,
      date: (j) => jobTimestamp(j),
      crew: (j) => (j.crewId ? crewById.get(j.crewId)?.name : null),
      truck: (j) => (j.truckId ? truckById.get(j.truckId)?.name : null),
      status: (j) => statusLabel(j.status),
      project: (j) =>
        (j.projectId ? projectById.get(j.projectId)?.name : null) ?? '',
    };

    return [...list].sort(makeSorter<Job, JobSortKey>(sort, extractors));
  }, [
    jobs,
    activeOnly,
    typeFilter,
    statusSet,
    sourceSet,
    regionFilter,
    tokens,
    sort,
    customerById,
    crewById,
    truckById,
    projectById,
    projects,
  ]);

  const totalCount = jobs.length;
  const shownCount = filtered.length;
  const activeCount = filtered.filter(
    (j) => j.status === 'scheduled' || j.status === 'enroute' || j.status === 'onsite',
  ).length;
  const dispatchReadyUnscheduledCount = unscheduledJobs(filtered).length;
  const reviewUnscheduledCount = unscheduledNeedsReviewJobs(filtered).length;
  const completeCount = filtered.filter((j) => j.status === 'complete').length;

  function toggleSort(key: JobSortKey) {
    setSort((prev) => nextSort(prev, key));
  }
  function toggleSet<V>(
    set: Set<V>,
    apply: (next: Set<V>) => void,
    value: V,
  ): void {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        subtitle={
          'Showing ' +
          shownCount +
          ' of ' +
          totalCount +
          ' jobs · ' +
          activeCount +
          ' active, ' +
          dispatchReadyUnscheduledCount +
          ' dispatch-ready unscheduled, ' +
          reviewUnscheduledCount +
          ' held for review, ' +
          completeCount +
          ' complete this quarter'
        }
      >
        <div className="search" style={{ width: 260 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="Search customer, address, deal id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="btn btn-outline btn-sm"
          title="HubSpot sync runs from Settings → Integrations. The bottom of that page also runs a Zuper re-bootstrap."
          disabled
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
        {typeOptions.map(({ type: k, meta: jt }) => (
          <button
            key={k}
            className={'filter-chip ' + (typeFilter === k ? 'active' : '')}
            onClick={() => setTypeFilter(k)}
          >
            <span className="dot" style={{ background: 'var(--' + (jt?.color ?? 'jt-meeting') + ')' }}></span>
            {jt?.label ?? k}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span className="eyebrow-sm">Status</span>
        <button
          className={'filter-chip ' + (statusSet.size === 0 ? 'active' : '')}
          onClick={() => setStatusSet(new Set())}
        >
          All
        </button>
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            className={'filter-chip ' + (statusSet.has(s) ? 'active' : '')}
            onClick={() => toggleSet(statusSet, setStatusSet, s)}
          >
            {statusLabel(s)}
          </button>
        ))}
        <span style={{ marginLeft: 12, opacity: 0.5 }}>·</span>
        <button
          className={'filter-chip ' + (activeOnly ? 'active' : '')}
          onClick={() => setActiveOnly((v) => !v)}
          title={activeOnly ? 'Showing active only — click to include historical' : 'Showing all — click to hide completed/cancelled'}
        >
          {activeOnly ? 'Active only' : 'Including historical'}
        </button>
      </div>

      <div className="filter-row">
        <span className="eyebrow-sm">Source</span>
        <button
          className={'filter-chip ' + (sourceSet.size === 0 ? 'active' : '')}
          onClick={() => setSourceSet(new Set())}
        >
          All
        </button>
        {SOURCE_CHIPS.map((s) => (
          <button
            key={s.key}
            className={'filter-chip ' + (sourceSet.has(s.key) ? 'active' : '')}
            onClick={() => toggleSet(sourceSet, setSourceSet, s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="filter-row" style={{ paddingBottom: 12 }}>
        <span className="eyebrow-sm">Region</span>
        <button
          className={'filter-chip ' + (regionFilter === 'all' ? 'active' : '')}
          onClick={() => setRegionFilter('all')}
        >
          All
        </button>
        {REGION_CHIPS.map((r) => (
          <button
            key={r}
            className={'filter-chip ' + (regionFilter === r ? 'active' : '')}
            onClick={() => setRegionFilter(regionFilter === r ? 'all' : r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="view-pad" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <SortableHeader<JobSortKey>
                  label="Customer"
                  sortKey="customer"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<JobSortKey>
                  label="Type"
                  sortKey="type"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<JobSortKey>
                  label="Date · time"
                  sortKey="date"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<JobSortKey>
                  label="Crew"
                  sortKey="crew"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<JobSortKey>
                  label="Truck"
                  sortKey="truck"
                  state={sort}
                  onClick={toggleSort}
                />
                <th>Crew composition</th>
                <SortableHeader<JobSortKey>
                  label="Status"
                  sortKey="status"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<JobSortKey>
                  label="Deal / scope"
                  sortKey="project"
                  state={sort}
                  onClick={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const c = getCustomer(customers, j.customer);
                const crew = getCrew(crews, j.crewId);
                const truck = getTruck(trucks, j.truckId);
                const project = getProject(projects, j.projectId);
                const jobType = getJobType(j.type);
                const unfilled = j.slots.filter(
                  (s) => !s.assignedTo && !s.optional,
                ).length;
                const projectMeta = project
                  ? PROJECT_STATUS_META[project.status]
                  : null;
                const reviewReason = unscheduledReviewReason(j);
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
                        {jobType?.label ? ' — ' + jobType.label : ''}
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
                        {j.assignedTechIds?.length
                          ? j.assignedTechIds.slice(0, 4).map((id) => {
                              const tech = getPerson(people, id);
                              return (
                                <span key={id} className="tag" style={{ fontSize: 11 }}>
                                  <Icon name="user" size={10} />
                                  {tech?.name ?? id}
                                </span>
                              );
                            })
                          : j.slots.slice(0, 4).map((s) => (
                              <RoleChip
                                key={s.id}
                                role={s.role}
                                level={s.level}
                                assignedTo={s.assignedTo}
                                optional={s.optional}
                                compact
                              />
                            ))}
                        {j.assignedTechIds && j.assignedTechIds.length > 4 && (
                          <span className="muted small">+{j.assignedTechIds.length - 4}</span>
                        )}
                        {unfilled > 0 && (
                          <span className="unfilled-pill">
                            <Icon name="user" size={10} /> {unfilled}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={j.status} />
                      {reviewReason ? (
                        <div className="muted small" style={{ marginTop: 4 }}>
                          Review: {reviewReason}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {project && projectMeta ? (
                        <div style={{ maxWidth: 240 }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>
                            {project.name}
                          </div>
                          <div className="row muted" style={{ gap: 6, fontSize: 11 }}>
                            <span>{project.type || PROJECT_STATUS_META[project.status]?.label}</span>
                            {project.hubspotDealId && (
                              <span className="mono">Deal {project.hubspotDealId}</span>
                            )}
                          </div>
                        </div>
                      ) : j.hubspotDealId ? (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(255,122,89,0.12)',
                            color: '#9F3D24',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          <Icon name="hubspot" size={10} /> Deal {j.hubspotDealId}
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
