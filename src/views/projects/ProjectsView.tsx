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
import type { Customer, Job, Project, ProjectStatus } from '../../types';
import { ProjectDetailDrawer } from './ProjectDetailDrawer';
import {
  makeSorter,
  matchesSearch,
  nextSort,
  tokenizeQuery,
  type SortState,
} from '../../lib/table';
import {
  REGION_PREFIXES,
  regionPrefixFromTeamName,
  useRegionFilter,
} from '../../lib/region-filter';

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
type SourceFilter = 'all' | 'v1' | 'v2';
// Region filter values come from useRegionFilter so the chip selection
// stays in sync with the topbar RegionPicker and every other list view.
type RegionFilter = ReturnType<typeof useRegionFilter>['region'];

type SortKey =
  | 'customer'
  | 'type'
  | 'status'
  | 'jobs'
  | 'nextVisit'
  | 'value'
  | 'dealId';

// Status filter chips sort by display order, not enum order.
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'proposed', label: 'Proposed' },
  { key: 'sold', label: 'Sold' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'complete', label: 'Complete' },
  { key: 'warranty', label: 'Warranty' },
  { key: 'cancelled', label: 'Cancelled' },
];

const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'v1', label: 'V1' },
  { key: 'v2', label: 'V2' },
];

const REGION_FILTERS: { key: RegionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...REGION_PREFIXES.map((prefix) => ({ key: prefix, label: prefix })),
];

const VALID_REGIONS = new Set<RegionFilter>(REGION_PREFIXES);

type ProjectRegion = Exclude<RegionFilter, 'all'>;

function regionFromCustomerAddress(customer: Customer | undefined): ProjectRegion | null {
  if (!customer?.address) return null;
  // Grab the segment after the last comma, then the 2-letter state code.
  const tail = customer.address.split(',').pop()?.trim() ?? '';
  const code = tail.slice(0, 2).toUpperCase() as ProjectRegion;
  return VALID_REGIONS.has(code) ? code : null;
}

function regionForProject(customer: Customer | undefined, projectJobs: Job[]): ProjectRegion | null {
  const byJobTeam = new Map<ProjectRegion, number>();
  for (const job of projectJobs) {
    const region = regionPrefixFromTeamName(job.zuperTeamName);
    if (!region) continue;
    byJobTeam.set(region, (byJobTeam.get(region) ?? 0) + 1);
  }
  const [topRegion] =
    Array.from(byJobTeam.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];
  return topRegion ?? regionFromCustomerAddress(customer);
}

function sourceBucket(p: Project): 'v1' | 'v2' {
  return p.source === 'legacy_installation' ? 'v1' : 'v2';
}

export function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const customers = useStore((s) => s.customers);
  const jobs = useStore((s) => s.jobs);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  // Region filter is shared with the topbar picker — single source of truth.
  const { region: regionFilter, setRegion: setRegionFilter } = useRegionFilter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState<SortKey> | null>({
    key: 'customer',
    dir: 'asc',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ProjectsView is intentionally READ-ONLY. Projects mirror HubSpot deals;
  // creating/editing/deleting them locally would diverge from the source of
  // truth without writing back (which we don't do). Add/Edit/Delete UI was
  // removed to avoid the illusion of local CRUD.

  // Customer lookup map — O(1) per row instead of an array scan.
  const customerById = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

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
      const customer = customerById.get(p.customer);
      const region = regionForProject(customer, projJobs);
      return {
        ...p,
        projJobs,
        completedJobs,
        nextJob,
        isStale,
        customer_ref: customer,
        region,
      };
    });
  }, [projects, jobs, customerById]);

  type EnrichedProject = (typeof enriched)[number];

  const counts = useMemo(
    () => ({
      all: enriched.length,
      proposed: enriched.filter((p) => p.status === 'proposed').length,
      sold: enriched.filter((p) => p.status === 'sold').length,
      in_progress: enriched.filter((p) => p.status === 'in_progress').length,
      complete: enriched.filter((p) => p.status === 'complete').length,
      warranty: enriched.filter((p) => p.status === 'warranty').length,
      cancelled: enriched.filter((p) => p.status === 'cancelled').length,
      v1: enriched.filter((p) => sourceBucket(p) === 'v1').length,
      v2: enriched.filter((p) => sourceBucket(p) === 'v2').length,
      CO: enriched.filter((p) => p.region === 'CO').length,
      MA: enriched.filter((p) => p.region === 'MA').length,
      BC: enriched.filter((p) => p.region === 'BC').length,
      NY: enriched.filter((p) => p.region === 'NY').length,
      CA: enriched.filter((p) => p.region === 'CA').length,
    }),
    [enriched],
  );

  const queryTokens = useMemo(() => tokenizeQuery(query), [query]);

  const filtered = useMemo(() => {
    return enriched.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && sourceBucket(p) !== sourceFilter) return false;
      if (regionFilter !== 'all' && p.region !== regionFilter) return false;
      if (queryTokens.length === 0) return true;
      return matchesSearch(
        [
          p.customer_ref?.name,
          p.name,
          p.hubspotDealId,
          p.customer_ref?.address,
        ],
        queryTokens,
      );
    });
  }, [enriched, statusFilter, sourceFilter, regionFilter, queryTokens]);

  // Sort extractors — strings sort by locale, numbers/dates natural.
  const sortExtractors: Record<SortKey, (row: EnrichedProject) => unknown> = useMemo(
    () => ({
      customer: (row) => row.customer_ref?.name ?? '',
      type: (row) => row.type ?? '',
      status: (row) => row.status,
      jobs: (row) => row.projJobs.length,
      nextVisit: (row) => row.nextJob?.date ?? null,
      value: (row) => row.value ?? null,
      dealId: (row) => row.hubspotDealId ?? '',
    }),
    [],
  );

  const sorted = useMemo(() => {
    const sorter = makeSorter(sort, sortExtractors);
    // toSorted keeps `filtered` immutable for downstream memo stability.
    return filtered.slice().sort(sorter);
  }, [filtered, sort, sortExtractors]);


  const selected = selectedId ? projects.find((p) => p.id === selectedId) ?? null : null;

  function handleSort(key: SortKey) {
    setSort((prev) => nextSort(prev, key));
  }

  return (
    <div className="proj-view">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        subtitle={`${projects.length} deals synced from HubSpot · read-only mirror. Jobs are linked from Zuper.`}
      />
      {/* Data-quality banner — surfaces the volume of jobs without a project link
          so dispatchers know why some project rows show "No linked jobs". */}
      {(() => {
        const unlinkedJobs = jobs.filter((j) => !j.projectId).length;
        if (unlinkedJobs === 0) return null;
        return (
          <div
            className="muted small"
            style={{
              margin: '0 16px 8px',
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--bg-subtle)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <Icon name="info" size={14} />
            <span>
              {unlinkedJobs} of {jobs.length} jobs are not yet linked to a project
              — they appear under "Jobs" but won't roll up here until HubSpot
              deal IDs are written onto them in Zuper.
            </span>
          </div>
        );
      })()}

      <div className="proj-toolbar">
        <div
          className="search"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
        >
          <Icon name="search" size={14} />
          <input
            placeholder="Search customer, project, deal id, address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div
        className="proj-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          rowGap: 6,
          marginTop: -4,
        }}
      >
        <FilterChipGroup
          label="Status"
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          counts={counts}
        />
        <FilterChipGroup
          label="Source"
          options={SOURCE_FILTERS}
          value={sourceFilter}
          onChange={setSourceFilter}
          counts={counts}
        />
        <FilterChipGroup
          label="Region"
          options={REGION_FILTERS}
          value={regionFilter}
          onChange={setRegionFilter}
          counts={counts}
        />
      </div>

      <div className="proj-summary">
        <div className="proj-summary-stat">
          <div className="l">Showing</div>
          <div className="v">
            {sorted.length}
            <span
              className="muted"
              style={{ fontSize: 13, fontWeight: 500, marginLeft: 6 }}
            >
              of {enriched.length}
            </span>
          </div>
        </div>
{/* Pipeline value intentionally hidden — dispatch decisions don't depend on deal $. */}
        <div className="proj-summary-stat">
          <div className="l">Stale</div>
          <div
            className="v"
            style={{
              color: sorted.some((p) => p.isStale) ? '#C53030' : 'var(--fg)',
            }}
          >
            {sorted.filter((p) => p.isStale).length}
          </div>
        </div>
      </div>

      <div className="proj-table">
        <div className="proj-table-header">
          <SortHeaderCell
            className="col-id"
            label="Project / Type"
            sortKey="type"
            state={sort}
            onClick={handleSort}
          />
          <SortHeaderCell
            className="col-cust"
            label="Customer"
            sortKey="customer"
            state={sort}
            onClick={handleSort}
          />
          <SortHeaderCell
            className="col-status"
            label="Status"
            sortKey="status"
            state={sort}
            onClick={handleSort}
          />
          <SortHeaderCell
            className="col-jobs"
            label="Jobs"
            sortKey="jobs"
            state={sort}
            onClick={handleSort}
          />
          <SortHeaderCell
            className="col-next"
            label="Next visit"
            sortKey="nextVisit"
            state={sort}
            onClick={handleSort}
          />
          <SortHeaderCell
            className="col-value"
            label="Value"
            sortKey="value"
            state={sort}
            onClick={handleSort}
          />
          <SortHeaderCell
            className="col-deal"
            label="Deal"
            sortKey="dealId"
            state={sort}
            onClick={handleSort}
          />
        </div>
        {sorted.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            projJobsCount={p.projJobs.length}
            completedJobs={p.completedJobs}
            nextJob={p.nextJob}
            isStale={p.isStale}
            selected={selectedId === p.id}
            onClick={() => setSelectedId(p.id)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="proj-empty">
            <Icon name="briefcase" size={28} stroke="var(--mid-gray)" />
            <div
              style={{ marginTop: 12, fontFamily: 'var(--font-subhead)', fontWeight: 700 }}
            >
              No projects match
            </div>
            <div className="muted small">Try a different filter or clear search.</div>
          </div>
        )}
      </div>

      {selected && (
        <ProjectDetailDrawer
          project={selected}
          onClose={() => setSelectedId(null)}
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
}

function ProjectRow({
  project,
  projJobsCount,
  completedJobs,
  nextJob,
  isStale,
  selected,
  onClick,
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
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Filter chip group — labelled segmented control with live counts.
// Generic over the chip-value type so each filter (status/source/region)
// shares one render but keeps strict typing on `value`/`onChange`.
// -----------------------------------------------------------------
interface FilterChipGroupProps<V extends string> {
  label: string;
  options: { key: V; label: string }[];
  value: V;
  onChange: (next: V) => void;
  counts: Record<string, number>;
}

function FilterChipGroup<V extends string>({
  label,
  options,
  value,
  onChange,
  counts,
}: FilterChipGroupProps<V>) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--fg-muted)',
        }}
      >
        {label}
      </span>
      <div className="seg">
        {options.map((o) => {
          const count = counts[o.key];
          return (
            <button
              key={o.key}
              type="button"
              className={value === o.key ? 'active' : ''}
              onClick={() => onChange(o.key)}
            >
              {o.label}
              {typeof count === 'number' && (
                <span className="muted" style={{ marginLeft: 4, fontSize: 10 }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// SortHeaderCell — div-grid equivalent of <SortableHeader>. The
// project list uses a CSS grid header row (not a <table>), so we
// inline a div-based version that mirrors the same UX: click to
// toggle asc/desc, chevron when active, faint ↕ when inactive.
// -----------------------------------------------------------------
interface SortHeaderCellProps {
  label: string;
  sortKey: SortKey;
  state: SortState<SortKey> | null;
  onClick: (key: SortKey) => void;
  className: string;
}

function SortHeaderCell({
  label,
  sortKey,
  state,
  onClick,
  className,
}: SortHeaderCellProps) {
  const active = state?.key === sortKey;
  const dir = active ? state!.dir : null;
  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-sort={
        active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      onClick={() => onClick(sortKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(sortKey);
        }
      }}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {label}
      {active ? (
        <Icon name={dir === 'asc' ? 'chevron_up' : 'chevron_down'} size={11} />
      ) : (
        <span style={{ opacity: 0.3, fontSize: 11 }}>↕</span>
      )}
    </div>
  );
}
