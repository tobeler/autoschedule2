// =============================================================
// DispatchView — top-level dispatch tab.
//
// Day calendar (Phase 2) plus Week / Month / Kanban / Gantt / Map
// views (Phase 4). The toolbar drives range × layout × groupBy ×
// density × type filter; we route to the right child below.
// =============================================================
import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { addDays, dateKey, startOfWeek, TODAY } from '../../data/helpers';
import { unscheduledJobs } from '../../data/selectors';
import { Icon } from '../../components/Icon';

import { DispatchBrief } from './DispatchBrief';
import {
  DispatchToolbar,
  type Density,
  type GroupKind,
  type LayoutKind,
  type RangeKind,
} from './DispatchToolbar';
import { AttentionCTA } from './AttentionCTA';
import { UnscheduledRail } from './UnscheduledRail';
import { DayCalendar } from './DayCalendar';
import { WeekCalendar } from './WeekCalendar';
import { MonthCalendar } from './MonthCalendar';
import { KanbanBoard } from './KanbanBoard';
import { GanttChart } from './GanttChart';
import { MapView } from './MapView';

export function DispatchView() {
  const jobs = useStore((s) => s.jobs);
  const projects = useStore((s) => s.projects);
  const regions = useStore((s) => s.regions);
  const regionSel = useStore((s) => s.region);
  const selectJob = useStore((s) => s.selectJob);
  const selectedJobId = useStore((s) => s.selectedJobId);
  const openWizard = useStore((s) => s.openWizard);
  const tweakDensity = useStore((s) => s.tweaks.density);

  const [date, setDate] = useState<Date>(TODAY);
  const [range, setRange] = useState<RangeKind>('day');
  const [layout, setLayout] = useState<LayoutKind>('calendar');
  const [groupBy, setGroupBy] = useState<GroupKind>('crew');
  const [density, setDensity] = useState<Density>(tweakDensity);
  const [showRail, setShowRail] = useState(true);
  const [showBrief, setShowBrief] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'v1' | 'v2'>('all');

  // Map projectId → source so the V1/V2 chip can filter jobs without
  // re-scanning the projects collection on every render.
  const projectSourceById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) if (p.source) m.set(p.id, p.source);
    return m;
  }, [projects]);

  function matchesSourceFilter(projectId: string | null | undefined): boolean {
    if (sourceFilter === 'all') return true;
    if (!projectId) return false; // Jobs with no project link don't match V1 or V2.
    const src = projectSourceById.get(projectId);
    if (sourceFilter === 'v1') return src === 'legacy_installation';
    // V2 covers native_project AND deal_fallback (both are post-V1 paths).
    return src === 'native_project' || src === 'deal_fallback';
  }

  // Resolve the active region's team prefix. The topbar picker writes a
  // RegionSelection (`regionId` + `subId`) into the store; we map those
  // back to the team-name prefix (CO/MA/BC/NY) so we can filter jobs whose
  // `zuperTeamName` starts with that prefix.
  //
  // Two paths because the regions collection in store is in flux:
  //   1. Seed regions use short ids like 'co' / 'ma' / 'bc' / 'ny' / 'va'.
  //   2. HubSpot-sourced regions use ids like 'hs-sa-30404396210' with the
  //      proper `short` field (e.g. "CO" for CO Denver).
  // We accept either: lookup by id and read `short`, OR fall back to
  // checking the regionId itself for a 2-letter region code prefix.
  // 'va' (legacy seed for Vancouver) maps to BC.
  const VALID_PREFIXES = ['CO', 'MA', 'BC', 'NY', 'CA'] as const;
  const SEED_ID_TO_PREFIX: Record<string, string> = {
    co: 'CO',
    ma: 'MA',
    bc: 'BC',
    ny: 'NY',
    ca: 'CA',
    va: 'BC', // legacy seed treated Vancouver as a separate region; it's BC
  };
  const regionPrefix = useMemo<string | null>(() => {
    if (!regionSel?.regionId) return null;
    const r = regions.find((x) => x.id === regionSel.regionId);
    const fromShort = r?.short?.toUpperCase() ?? '';
    if (VALID_PREFIXES.includes(fromShort as (typeof VALID_PREFIXES)[number])) {
      return fromShort;
    }
    const seedPrefix = SEED_ID_TO_PREFIX[regionSel.regionId.toLowerCase()];
    if (seedPrefix) return seedPrefix;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionSel, regions]);

  function matchesRegion(j: { zuperTeamName?: string | null }): boolean {
    if (!regionPrefix) return true;
    const team = (j.zuperTeamName ?? '').toUpperCase();
    return team.startsWith(regionPrefix + '-');
  }

  const visibleJobs = useMemo(() => {
    let base = jobs;
    if (range === 'day') base = jobs.filter((j) => j.date === dateKey(date));
    else if (range === 'week') {
      const start = addDays(date, -date.getDay());
      const keys = Array.from({ length: 7 }).map((_, i) =>
        dateKey(addDays(start, i)),
      );
      base = jobs.filter((j) => j.date != null && keys.includes(j.date));
    } else if (range === 'month') {
      const prefix =
        date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0');
      base = jobs.filter((j) => j.date != null && j.date.startsWith(prefix));
    }
    if (typeFilter.length > 0) base = base.filter((j) => typeFilter.includes(j.type));
    if (sourceFilter !== 'all') base = base.filter((j) => matchesSourceFilter(j.projectId));
    if (regionPrefix) base = base.filter(matchesRegion);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, date, range, typeFilter, sourceFilter, projectSourceById, regionPrefix]);

  const unsched = useMemo(() => {
    let base = unscheduledJobs(jobs);
    if (typeFilter.length > 0) base = base.filter((j) => typeFilter.includes(j.type));
    if (sourceFilter !== 'all') base = base.filter((j) => matchesSourceFilter(j.projectId));
    if (regionPrefix) base = base.filter(matchesRegion);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, typeFilter, sourceFilter, projectSourceById, regionPrefix]);

  const dayMode = range === 'day' && layout === 'calendar';
  // Phase 15.1b — surface the Unscheduled rail (and its collapsed strip)
  // whenever we're in any calendar range, so jobs can be dragged onto Week
  // and Month cells too. Other layouts (kanban / gantt / map) still hide it.
  const calendarMode = layout === 'calendar';
  const railVisible = calendarMode && showRail;
  // The collapsed 14px stub only shows in calendar mode. Kanban/Gantt/Map
  // get the full width (no-rail-no-stub variant).
  const stubVisible = calendarMode && !showRail;
  const mainClass =
    'dispatch-main' +
    (railVisible ? '' : stubVisible ? ' no-rail' : ' no-rail-no-stub');

  return (
    <>
      <DispatchToolbar
        date={date}
        setDate={setDate}
        range={range}
        setRange={setRange}
        layout={layout}
        setLayout={setLayout}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        density={density}
        setDensity={setDensity}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        visibleJobs={visibleJobs}
      />

      {range === 'day' && showBrief && (
        <DispatchBrief
          date={date}
          jobs={jobs}
          onNewJob={openWizard}
          onHide={() => setShowBrief(false)}
        />
      )}

      {range === 'day' && <AttentionCTA />}

      <div className={mainClass}>
        {railVisible && (
          <UnscheduledRail
            jobs={unsched}
            onJobClick={(j) => selectJob(j.id)}
            onCollapse={() => setShowRail(false)}
          />
        )}
        {stubVisible && (
          <CollapsedRailStub
            count={unsched.length}
            onExpand={() => setShowRail(true)}
          />
        )}
        <div
          style={{
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {renderContent({
            range,
            layout,
            date,
            visibleJobs,
            allJobs: jobs,
            unsched,
            groupBy,
            density,
            selectedJobId,
            onJobClick: (j) => selectJob(j.id),
          })}
        </div>
      </div>
    </>
  );
}

// Slim 14px collapse handle on the left edge of the dispatch area.
// Just a chevron — no rotated label, no count badge — so it doesn't
// visually band against the topbar. Click anywhere on the strip
// re-opens the rail.
function CollapsedRailStub({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Show unscheduled (${count})`}
      style={{
        flex: '0 0 14px',
        width: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        background: 'var(--surface-card)',
        border: 'none',
        borderRight: '1px solid var(--border)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'var(--fg-muted)',
        transition: 'background var(--dur-fast)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-card)')}
    >
      <Icon name="chevron_right" size={12} />
    </button>
  );
}

// Route the (range, layout) tuple to the right view component.
interface RenderArgs {
  range: RangeKind;
  layout: LayoutKind;
  date: Date;
  visibleJobs: import('../../types').Job[];
  allJobs: import('../../types').Job[];
  unsched: import('../../types').Job[];
  groupBy: GroupKind;
  density: Density;
  selectedJobId: string | null;
  onJobClick: (j: import('../../types').Job) => void;
}

function renderContent({
  range,
  layout,
  date,
  visibleJobs,
  allJobs,
  unsched,
  groupBy,
  density,
  selectedJobId,
  onJobClick,
}: RenderArgs) {
  if (layout === 'kanban') {
    // Kanban shows scheduled (visible) jobs + the unscheduled rail items.
    const merged = visibleJobs.concat(
      unsched.filter((u) => !visibleJobs.some((v) => v.id === u.id)),
    );
    return (
      <KanbanBoard
        jobs={merged}
        selectedJobId={selectedJobId}
        onJobClick={onJobClick}
      />
    );
  }

  if (layout === 'gantt') {
    return (
      <GanttChart
        startDate={startOfWeek(date)}
        groupBy={groupBy}
        jobs={visibleJobs}
        onJobClick={onJobClick}
      />
    );
  }

  if (layout === 'map') {
    return (
      <MapView date={dateKey(date)} jobs={allJobs} onJobClick={onJobClick} />
    );
  }

  // layout === 'calendar'
  if (range === 'week') {
    return (
      <WeekCalendar
        startDate={startOfWeek(date)}
        groupBy={groupBy}
        jobs={visibleJobs}
        onJobClick={onJobClick}
      />
    );
  }
  if (range === 'month') {
    return (
      <MonthCalendar
        monthDate={date}
        jobs={visibleJobs}
        groupBy={groupBy}
        onJobClick={onJobClick}
      />
    );
  }
  // range === 'day'
  return (
    <DayCalendar
      date={date}
      dateKeyStr={dateKey(date)}
      jobs={visibleJobs}
      groupBy={groupBy}
      density={density}
      selectedJobId={selectedJobId}
      onJobClick={onJobClick}
    />
  );
}
