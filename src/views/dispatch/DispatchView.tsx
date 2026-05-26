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
    return base;
  }, [jobs, date, range, typeFilter]);

  const unsched = useMemo(() => {
    const base = unscheduledJobs(jobs);
    return typeFilter.length > 0
      ? base.filter((j) => typeFilter.includes(j.type))
      : base;
  }, [jobs, typeFilter]);

  const dayMode = range === 'day' && layout === 'calendar';
  // Phase 15.1b — surface the Unscheduled rail (and its collapsed strip)
  // whenever we're in any calendar range, so jobs can be dragged onto Week
  // and Month cells too. Other layouts (kanban / gantt / map) still hide it.
  const calendarMode = layout === 'calendar';
  const railVisible = calendarMode && showRail;

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

      <div className={'dispatch-main' + (railVisible ? '' : ' no-rail')}>
        {railVisible && (
          <UnscheduledRail
            jobs={unsched}
            onJobClick={(j) => selectJob(j.id)}
            onCollapse={() => setShowRail(false)}
          />
        )}
        {!railVisible && calendarMode && (
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
