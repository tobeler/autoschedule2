import { EmptyState } from '../../components/EmptyState';

/**
 * STUB — Phase 2 agent replaces this with the full Dispatch view
 * (DispatchBrief + DispatchToolbar + UnscheduledRail + DayCalendar +
 *  Week/Month/Kanban/Gantt/Map + drag/drop/resize/conflict).
 *
 * See plan: /Users/work/.claude/plans/curious-toasting-sifakis.md
 * See prototype: design-source/schedule-dispatch/project/view-dispatch.jsx
 */
export function DispatchView() {
  return (
    <div className="view-stub">
      <EmptyState
        icon="sparkle"
        title="Dispatch board — building Phase 2"
        body="Day/Week/Month × Calendar/Kanban/Gantt × Crew/Truck/Tech, drag-drop, drive-time pills, capacity heatmap, conflict feedback."
      />
    </div>
  );
}
