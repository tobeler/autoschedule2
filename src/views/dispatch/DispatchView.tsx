// =============================================================
// DispatchView — top-level dispatch tab.
//
// Phase 2 ships the Day calendar end-to-end. Week / Month / Kanban /
// Gantt / Map are handled by the Phase 4 agent — DispatchView renders a
// placeholder for those combinations so the toolbar still works.
// =============================================================
import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { EmptyState } from '../../components/EmptyState';
import { addDays, dateKey, TODAY } from '../../data/helpers';
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
          {dayMode ? (
            <DayCalendar
              date={date}
              dateKeyStr={dateKey(date)}
              jobs={visibleJobs}
              groupBy={groupBy}
              density={density}
              selectedJobId={selectedJobId}
              onJobClick={(j) => selectJob(j.id)}
            />
          ) : (
            <Phase4Stub layout={layout} range={range} />
          )}
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

function Phase4Stub({ layout, range }: { layout: LayoutKind; range: RangeKind }) {
  const label =
    layout === 'calendar'
      ? range === 'week'
        ? 'Week calendar'
        : 'Month calendar'
      : layout === 'kanban'
      ? 'Kanban board'
      : layout === 'gantt'
      ? 'Gantt chart'
      : 'Map view';
  return (
    <div className="view-stub" style={{ flex: 1, overflow: 'auto' }}>
      <EmptyState
        icon="sparkle"
        title={label + ' — building Phase 4'}
        body="Capacity heatmap, multi-day bars, kanban columns, route map. Day view is fully wired — switch back to Day · Calendar to schedule jobs."
      />
    </div>
  );
}
