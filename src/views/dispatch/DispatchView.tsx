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

  const unsched = useMemo(() => unscheduledJobs(jobs), [jobs]);

  const dayMode = range === 'day' && layout === 'calendar';
  const railVisible = dayMode && showRail;

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

      {!railVisible && dayMode && (
        <button
          className="btn btn-dark btn-sm"
          style={{ position: 'absolute', left: 16, bottom: 16 }}
          onClick={() => setShowRail(true)}
        >
          <Icon name="chevron_right" size={14} /> Show unscheduled (
          {unsched.length})
        </button>
      )}
    </>
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
