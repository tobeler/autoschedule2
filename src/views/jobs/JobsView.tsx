// =============================================================
// Jobs view — sortable + filterable table.
//
// FILTER BAR LAYOUT (2026-05 cleanup):
//   - The 19-pill type strip is collapsed into a single "Types" popover
//     (multi-select checklist) — matches DispatchToolbar's pattern.
//   - Status, source, region, and "active only" share ONE filter row with
//     subtle separators instead of stacking into 4 labeled rows.
//   - When any filter is active, a compact "Filtering by: …" chip strip
//     appears under the count subtitle with a single "Clear all" affordance.
//   - Saved quick filters keep flowing through the existing sidebar list +
//     the unchanged "Save as quick filter" button.
// =============================================================
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { JobTypeTag } from '../../components/JobTypeTag';
import { StatusBadge } from '../../components/StatusBadge';
import { RoleChip } from '../../components/RoleChip';
import { SortableHeader } from '../../components/SortableHeader';
import { useStore } from '../../store';
import { fmtTime } from '../../data/helpers';
import { ROLES } from '../../data/seed';
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
  regionPrefixFromTeamName,
  useRegionFilter,
  type RegionPrefix,
} from '../../lib/region-filter';
import { resolveJobRegion } from '../../lib/region-resolve';
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

function regionOfJob(
  job: Job,
  customer?: import('../../types').Customer | null,
  project?: import('../../types').Project | null,
  siblings?: Job[],
): RegionPrefix | null {
  // Try the Zuper team prefix first (cheap, definitive when set). Fall back
  // to the multi-signal resolver (customer.address state, job.title city,
  // project.name parsing, sibling-job majority vote) so unscheduled rows
  // still get region-tagged from any available HubSpot data.
  const fromTeam = regionPrefixFromTeamName(job.zuperTeamName);
  if (fromTeam) return fromTeam;
  return resolveJobRegion(job, customer ?? undefined, project ?? undefined, siblings);
}

function defaultQuickFilterLabel(args: {
  typeSet: Set<string>;
  statusSet: Set<JobStatus>;
  regionFilter: RegionPrefix | 'all';
  activeOnly: boolean;
}): string {
  const parts: string[] = [];
  if (args.typeSet.size === 1) parts.push(Array.from(args.typeSet)[0]);
  else if (args.typeSet.size > 1) parts.push(args.typeSet.size + ' types');
  if (args.regionFilter !== 'all') parts.push(args.regionFilter);
  if (args.statusSet.size > 0) parts.push(Array.from(args.statusSet).join('/'));
  if (parts.length === 0) parts.push(args.activeOnly ? 'Active jobs' : 'All jobs');
  return parts.join(' · ');
}



function sourceOfJob(job: Job, projects: Project[]): SourceKey | null {
  if (!job.projectId) return null;
  const p = projects.find((pr) => pr.id === job.projectId);
  if (!p?.source) return null;
  if (p.source === 'legacy_installation') return 'v1';
  // native_project + deal_fallback both behave as V2.
  return 'v2';
}

// One-line crew summary used in the collapsed row. Picks the first 2 names
// (assigned tech name when present, else role short-code), then a "+N"
// overflow count, and an "Unfilled: M" tag when applicable. Kept text-only
// so it stays on a single line at the table's narrow column width.
function crewSummary(
  job: Job,
  people: import('../../types').Person[],
): { items: string[]; overflow: number; unfilled: number } {
  const items: string[] = [];
  let total = 0;
  if (job.assignedTechIds?.length) {
    total = job.assignedTechIds.length;
    for (const id of job.assignedTechIds.slice(0, 2)) {
      const p = people.find((x) => x.id === id);
      items.push(p?.name.split(' ')[0] ?? id);
    }
  } else {
    total = job.slots.length;
    for (const s of job.slots.slice(0, 2)) {
      const r = ROLES[s.role];
      const label = r?.short ?? s.role;
      const lvl = s.level ? ' ' + s.level : '';
      items.push(s.assignedTo ? label + lvl : 'Unfilled ' + label);
    }
  }
  const overflow = Math.max(0, total - items.length);
  const unfilled = job.slots.filter((s) => !s.assignedTo && !s.optional).length;
  return { items, overflow, unfilled };
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
  const addSavedQuickFilter = useStore((s) => s.addSavedQuickFilter);
  const pendingJobsFilter = useStore((s) => s.pendingJobsFilter);
  const clearPendingJobsFilter = useStore((s) => s.clearPendingJobsFilter);

  const [typeSet, setTypeSet] = useState<Set<string>>(() => new Set());
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

  // Type-popover open/close (mirrors DispatchToolbar's pattern).
  const [typePopOpen, setTypePopOpen] = useState(false);

  // Per-row expand state — session-only, deliberately not persisted. Default
  // is collapsed everywhere; expanding reveals the full crew-composition
  // stack inline beneath the row's main one-liner.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Apply any pending quick-filter snapshot (set by sidebar's saved filters).
  useEffect(() => {
    if (!pendingJobsFilter) return;
    if (pendingJobsFilter.types?.length) setTypeSet(new Set(pendingJobsFilter.types));
    if (pendingJobsFilter.statuses?.length) setStatusSet(new Set(pendingJobsFilter.statuses));
    if (typeof pendingJobsFilter.activeOnly === 'boolean') setActiveOnly(pendingJobsFilter.activeOnly);
    // regionPrefixes are already applied to the store by applySavedQuickFilter.
    clearPendingJobsFilter();
  }, [pendingJobsFilter, clearPendingJobsFilter]);

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
      if (!chipMatches(typeSet, j.type)) return false;
      if (!chipMatches(statusSet, j.status)) return false;
      if (sourceSet.size > 0) {
        const src = sourceOfJob(j, projects);
        if (!chipMatches(sourceSet, src)) return false;
      }
      if (regionFilter !== 'all') {
        const cust = j.customer ? customerById.get(j.customer) : null;
        const proj = j.projectId ? projectById.get(j.projectId) : null;
        const siblings = j.projectId
          ? jobs.filter((s) => s.projectId === j.projectId && s.id !== j.id)
          : undefined;
        const reg = regionOfJob(j, cust, proj, siblings);
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
    typeSet,
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

  // Helpers for the "active filter" chip strip + Clear all. We intentionally
  // do NOT count `activeOnly` here — it's the default and not really a
  // user-applied filter the way the others are. Region is shared via topbar.
  const activeFilterCount =
    (typeSet.size > 0 ? 1 : 0) +
    (statusSet.size > 0 ? 1 : 0) +
    (sourceSet.size > 0 ? 1 : 0) +
    (regionFilter !== 'all' ? 1 : 0) +
    (query.trim() ? 1 : 0);

  function clearAllFilters() {
    setTypeSet(new Set());
    setStatusSet(new Set());
    setSourceSet(new Set());
    setRegionFilter('all');
    setQuery('');
  }

  // Friendly label for the type popover button.
  const typeButtonLabel = (() => {
    if (typeSet.size === 0) return 'All types';
    if (typeSet.size === 1) {
      const only = Array.from(typeSet)[0];
      return getJobType(only)?.label ?? only;
    }
    return typeSet.size + ' types';
  })();

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
          ' complete'
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
          title="Snapshot the current filter selection (type, status, region, active-only) into the sidebar Quick filters list."
          onClick={() => {
            const label = window.prompt('Name this quick filter:', defaultQuickFilterLabel({
              typeSet, statusSet, regionFilter, activeOnly,
            }));
            if (!label || !label.trim()) return;
            const id = 'qf-' + Math.random().toString(36).slice(2, 10);
            const regionPrefixes = regionFilter === 'all' ? undefined : [regionFilter];
            addSavedQuickFilter({
              id,
              label: label.trim(),
              types: typeSet.size > 0 ? Array.from(typeSet) : undefined,
              statuses: statusSet.size > 0 ? Array.from(statusSet) : undefined,
              regionPrefixes,
              activeOnly,
            });
          }}
        >
          <Icon name="plus" size={14} /> Save as quick filter
        </button>
        <button className="btn btn-primary btn-sm" onClick={openWizard}>
          <Icon name="plus" size={14} /> New job
        </button>
      </PageHeader>

      {/* Active-filter chip strip — only renders when at least one user-applied
          filter is active. Sits between the count subtitle and the filter
          bar so dispatchers can see what's filtered AND clear it in one click. */}
      {activeFilterCount > 0 && (
        <div
          className="filter-row"
          style={{
            paddingTop: 4,
            paddingBottom: 0,
            gap: 6,
            fontSize: 12,
          }}
        >
          <span className="muted small" style={{ marginRight: 2 }}>
            Filtering by:
          </span>
          {query.trim() && (
            <span className="filter-chip active" style={{ cursor: 'default' }}>
              Search: "{query.trim()}"
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}
          {typeSet.size > 0 && (
            <span className="filter-chip active" style={{ cursor: 'default' }}>
              Types: {typeButtonLabel}
              <button
                onClick={() => setTypeSet(new Set())}
                aria-label="Clear type filter"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}
          {statusSet.size > 0 && (
            <span className="filter-chip active" style={{ cursor: 'default' }}>
              Status: {Array.from(statusSet).map((s) => statusLabel(s)).join(', ')}
              <button
                onClick={() => setStatusSet(new Set())}
                aria-label="Clear status filter"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}
          {sourceSet.size > 0 && (
            <span className="filter-chip active" style={{ cursor: 'default' }}>
              Source: {Array.from(sourceSet).map((s) => s.toUpperCase()).join(', ')}
              <button
                onClick={() => setSourceSet(new Set())}
                aria-label="Clear source filter"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          )}
          {/* Region is intentionally not surfaced as an active-filter chip here —
              the top-bar RegionPicker owns that UI. */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearAllFilters}
            style={{ marginLeft: 4 }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Single consolidated filter bar.
          Type → popover (multi-select). Status, source, region keep pill
          rows but share one line with subtle separators. Active-only sits
          at the right with its own visual treatment. */}
      <div className="filter-row" style={{ paddingBottom: 12, rowGap: 8 }}>
        {/* TYPE — popover dropdown */}
        <div
          className="dispatch-type-filter"
          style={{ position: 'relative' }}
        >
          <button
            className={
              'btn btn-sm ' + (typeSet.size > 0 ? 'btn-dark' : 'btn-outline')
            }
            onClick={() => setTypePopOpen((v) => !v)}
            title="Filter by job type"
          >
            <Icon name="briefcase" size={13} />
            {typeButtonLabel}
            <Icon name={typePopOpen ? 'chevron_up' : 'chevron_down'} size={11} />
          </button>
          {typePopOpen && (
            <div
              className="dispatch-type-filter-pop"
              onMouseLeave={() => setTypePopOpen(false)}
            >
              <div className="dispatch-type-filter-head">
                <span className="eyebrow-sm">Filter job types</span>
                {typeSet.size > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTypeSet(new Set())}
                  >
                    Clear
                  </button>
                )}
              </div>
              {typeOptions.map(({ type: k, meta: jt }) => {
                const checked = typeSet.has(k);
                const count = jobs.filter((j) => j.type === k).length;
                return (
                  <label
                    key={k}
                    className={
                      'dispatch-type-filter-row' + (checked ? ' checked' : '')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSet(typeSet, setTypeSet, k)}
                    />
                    <span
                      className="dot"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: 'var(--' + (jt?.color ?? 'jt-meeting') + ')',
                      }}
                    />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>
                      {jt?.label ?? k}
                    </span>
                    <span
                      className="muted small"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Visual separator */}
        <span style={{ opacity: 0.3, margin: '0 2px' }}>│</span>

        {/* STATUS pills */}
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

        {/* Visual separator */}
        <span style={{ opacity: 0.3, margin: '0 2px' }}>│</span>

        {/* SOURCE pills */}
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

        {/* Region intentionally NOT shown here — the top-bar RegionPicker is
            the single source of truth. The filter still applies via
            `regionFilter` from useRegionFilter() above. */}

        {/* Pushed to the right: Active-only toggle. */}
        <span style={{ flex: 1 }} />
        <button
          className={'filter-chip ' + (activeOnly ? 'active' : '')}
          onClick={() => setActiveOnly((v) => !v)}
          title={
            activeOnly
              ? 'Showing active only — click to include historical'
              : 'Showing all — click to hide completed/cancelled'
          }
        >
          {activeOnly ? 'Active only' : 'Including historical'}
        </button>
      </div>

      <div className="view-pad" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28, padding: '0 4px' }}>
                  {/* Expand-all / collapse-all toggle. Caret reflects the
                      majority state: down when any rows are expanded
                      (clicking collapses all), right otherwise (clicking
                      expands every currently filtered row). */}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{
                      padding: 2,
                      width: 22,
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={
                      expandedRows.size > 0
                        ? 'Collapse all rows'
                        : 'Expand all rows'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (expandedRows.size > 0) {
                        setExpandedRows(new Set());
                      } else {
                        setExpandedRows(new Set(filtered.map((j) => j.id)));
                      }
                    }}
                  >
                    <Icon
                      name={expandedRows.size > 0 ? 'chevron_down' : 'chevron_right'}
                      size={12}
                    />
                  </button>
                </th>
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
                <th>Region</th>
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
                const isExpanded = expandedRows.has(j.id);
                const summary = crewSummary(j, people);
                const summaryText =
                  summary.items.join(', ') +
                  (summary.overflow > 0 ? ', +' + summary.overflow : '');
                // Tight, single-line cell style for the collapsed view.
                const tightCell: React.CSSProperties = {
                  paddingTop: 6,
                  paddingBottom: 6,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                };
                return (
                  <Fragment key={j.id}>
                    <tr
                      className="clickable"
                      onClick={() => selectJob(j.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td
                        style={{ padding: '0 4px', width: 28 }}
                        onClick={(e) => {
                          // Don't open the drawer when the user just wants
                          // to expand/collapse the row.
                          e.stopPropagation();
                          toggleRow(j.id);
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          aria-expanded={isExpanded}
                          title={isExpanded ? 'Collapse row' : 'Expand row'}
                          style={{
                            padding: 2,
                            width: 22,
                            height: 22,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(j.id);
                          }}
                        >
                          <Icon
                            name={isExpanded ? 'chevron_down' : 'chevron_right'}
                            size={12}
                          />
                        </button>
                      </td>
                      <td style={{ ...tightCell, maxWidth: 280 }}>
                        {/* Single-line label: "{Customer} — {Job type}".
                            Address moves into the expanded sub-row to keep
                            collapsed rows tight. */}
                        <div
                          style={{
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c ? c.name : j.title || 'Unknown customer'}
                          {jobType?.label ? ' — ' + jobType.label : ''}
                        </div>
                      </td>
                      <td style={tightCell}>
                        <JobTypeTag type={j.type} />
                      </td>
                      <td style={tightCell}>
                        {j.date ? (
                          <span className="mono small">
                            {j.date}
                            {j.startHour != null
                              ? ' · ' + fmtTime(j.startHour)
                              : ''}
                          </span>
                        ) : (
                          <span className="muted small">Unscheduled</span>
                        )}
                      </td>
                      <td style={tightCell}>
                        {(() => {
                          const siblings = j.projectId
                            ? jobs.filter(
                                (s) => s.projectId === j.projectId && s.id !== j.id,
                              )
                            : undefined;
                          const reg = regionOfJob(j, c, project, siblings);
                          return reg ? (
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(60,213,103,0.12)',
                                color: 'var(--forest, #1F8A5B)',
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                              title={`Region inferred from ${
                                j.zuperTeamName
                                  ? 'Zuper team ' + j.zuperTeamName
                                  : c?.address
                                    ? 'customer address'
                                    : 'job title'
                              }`}
                            >
                              {reg}
                            </span>
                          ) : (
                            <span className="muted small">—</span>
                          );
                        })()}
                      </td>
                      <td style={tightCell}>
                        {crew ? crew.name : <span className="muted">—</span>}
                      </td>
                      <td style={tightCell}>
                        {truck ? (
                          <span className="mono small">{truck.name}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ ...tightCell, maxWidth: 240 }}>
                        {/* Collapsed crew summary: one line of names/roles,
                            "+N" overflow, and the unfilled count badge. */}
                        <span
                          className="small"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 170,
                            }}
                            title={summaryText}
                          >
                            {summary.items.length === 0 ? (
                              <span className="muted">—</span>
                            ) : (
                              summaryText
                            )}
                          </span>
                          {unfilled > 0 && (
                            <span
                              className="unfilled-pill"
                              title={unfilled + ' unfilled slot(s)'}
                            >
                              <Icon name="user" size={10} /> {unfilled}
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={tightCell}>
                        <StatusBadge status={j.status} />
                      </td>
                      <td style={{ ...tightCell, maxWidth: 240 }}>
                        {project && projectMeta ? (
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: 12,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'inline-block',
                              maxWidth: 220,
                              verticalAlign: 'middle',
                            }}
                            title={project.name}
                          >
                            {project.name}
                          </span>
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
                    {isExpanded && (
                      <tr
                        // Detail row: not clickable; clicking inside it
                        // shouldn't open the drawer (the chevron / main row
                        // already handles that intent).
                        style={{ background: 'var(--bg-soft, rgba(0,0,0,0.02))' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <td />
                        <td colSpan={9} style={{ padding: '8px 12px 12px' }}>
                          <div
                            className="row"
                            style={{
                              gap: 16,
                              flexWrap: 'wrap',
                              alignItems: 'flex-start',
                            }}
                          >
                            {/* Crew composition — the original stacked
                                pills, restored only on expand. */}
                            <div style={{ minWidth: 260 }}>
                              <div
                                className="eyebrow-sm"
                                style={{ marginBottom: 4 }}
                              >
                                Crew composition
                              </div>
                              <div
                                className="row"
                                style={{ gap: 4, flexWrap: 'wrap' }}
                              >
                                {j.assignedTechIds?.length
                                  ? j.assignedTechIds.map((id) => {
                                      const tech = getPerson(people, id);
                                      return (
                                        <span
                                          key={id}
                                          className="tag"
                                          style={{ fontSize: 11 }}
                                        >
                                          <Icon name="user" size={10} />
                                          {tech?.name ?? id}
                                        </span>
                                      );
                                    })
                                  : j.slots.map((s) => (
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
                            </div>

                            {/* Time window — full range only when expanded. */}
                            {j.date && j.startHour != null && (
                              <div style={{ minWidth: 140 }}>
                                <div
                                  className="eyebrow-sm"
                                  style={{ marginBottom: 4 }}
                                >
                                  Time
                                </div>
                                <div className="mono small">
                                  {fmtTime(j.startHour)}
                                  {'–'}
                                  {fmtTime(j.startHour + j.durationHrs)}
                                </div>
                              </div>
                            )}

                            {/* Address — moved out of the customer cell. */}
                            {j.address && (
                              <div style={{ minWidth: 200, flex: 1 }}>
                                <div
                                  className="eyebrow-sm"
                                  style={{ marginBottom: 4 }}
                                >
                                  Address
                                </div>
                                <div className="muted small">{j.address}</div>
                              </div>
                            )}

                            {/* Project / deal detail block — full form. */}
                            {project && projectMeta ? (
                              <div style={{ minWidth: 220 }}>
                                <div
                                  className="eyebrow-sm"
                                  style={{ marginBottom: 4 }}
                                >
                                  Deal / scope
                                </div>
                                <div
                                  style={{ fontWeight: 600, fontSize: 12 }}
                                >
                                  {project.name}
                                </div>
                                <div
                                  className="row muted"
                                  style={{ gap: 6, fontSize: 11 }}
                                >
                                  <span>
                                    {project.type ||
                                      PROJECT_STATUS_META[project.status]?.label}
                                  </span>
                                  {project.hubspotDealId && (
                                    <span className="mono">
                                      Deal {project.hubspotDealId}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {reviewReason && (
                              <div style={{ minWidth: 200 }}>
                                <div
                                  className="eyebrow-sm"
                                  style={{ marginBottom: 4 }}
                                >
                                  Review reason
                                </div>
                                <div className="muted small">{reviewReason}</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
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
