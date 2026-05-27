// =============================================================
// JobBlock — the calendar block for a scheduled job.
//
// Features:
//  - HTML5 drag between rows (sets text/job-id on dataTransfer).
//  - Right-edge pointer-based resize, snapped to 15 minutes.
//  - Conflict shake when overlapping siblings.
//  - Multi-day "n/N" chip and "CONT." continuation chip.
//  - "unfilled-warning" outline when any required slot is empty.
// =============================================================
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Job } from '../../types';
import { Icon } from '../../components/Icon';
import { Avatar } from '../../components/Avatar';
import { fmtTime, hoursToStr } from '../../data/helpers';
import { getJobType } from '../../data/selectors';
import { useStore } from '../../store';
import { jobDisplayName } from '../../lib/customer-display';

interface JobBlockProps {
  job: Job;
  /** Pixels per hour */
  colW: number;
  /** Calendar start hour (e.g. 6) */
  hourStart: number;
  density: 'cozy' | 'compact';
  selected: boolean;
  /** All jobs on this row (for conflict detection) */
  allRowJobs: Job[];
  /** Lane index within the row (0-based) for stack-packing overlapping jobs. */
  laneIndex?: number;
  /** Total lanes on this row — used to compute per-lane height. */
  laneCount?: number;
  onClick: (job: Job, e: ReactMouseEvent<HTMLDivElement>) => void;
  onResize: (id: string, hours: number) => void;
}

export function JobBlock({
  job,
  colW,
  hourStart,
  density,
  selected,
  allRowJobs,
  laneIndex,
  laneCount,
  onClick,
  onResize,
}: JobBlockProps) {
  const customers = useStore((s) => s.customers);
  const blockRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [previewHours, setPreviewHours] = useState<number | null>(null);

  if (job.startHour == null) return null;

  const jt = getJobType(job.type);
  if (!jt) return null;

  const liveHours = previewHours != null ? previewHours : job.durationHrs;
  const left = (job.startHour - hourStart) * colW;
  const width = Math.max(60, liveHours * colW - 4);
  const endHour = job.startHour + liveHours;

  // Conflict: any sibling on the row overlapping this block's time window
  const hasConflict = allRowJobs.some((other) => {
    if (other.id === job.id || other.startHour == null) return false;
    const otherEnd = other.startHour + other.durationHrs;
    return job.startHour! < otherEnd && endHour > other.startHour;
  });

  const unfilled = job.slots.some((s) => !s.assignedTo && !s.optional);
  const customer = customers.find((c) => c.id === job.customer);
  const compact = density === 'compact' || width < 140;
  const visiblePeople = job.slots
    .filter((s) => s.assignedTo)
    .slice(0, 4)
    .map((s) => s.assignedTo as string);

  // ===== Pointer-based right-edge resize =====
  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    if (job.startHour == null) return;
    setResizing(true);
    const startX = e.clientX;
    const startHrs = job.durationHrs;
    const startStart = job.startHour;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dHrs = dx / colW;
      const snapped = Math.round((startHrs + dHrs) * 4) / 4;
      const minH = 0.5;
      const maxH = 24 - startStart;
      const next = Math.max(minH, Math.min(maxH, snapped));
      setPreviewHours(next);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizing(false);
      setPreviewHours((prev) => {
        if (prev != null && Math.abs(prev - startHrs) > 0.01) {
          onResize(job.id, prev);
        }
        return null;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const className =
    'job-block ' +
    jt.color +
    ' ' +
    job.status +
    (unfilled ? ' unfilled-warning' : '') +
    (selected ? ' selected' : '') +
    (compact ? ' compact' : '') +
    (dragging ? ' dragging' : '') +
    (resizing ? ' resizing' : '') +
    (hasConflict ? ' conflict' : '');

  // When the parent row supplies lane info (e.g. the Unassigned bucket on the
  // dispatch board, where many uncrewed jobs share the same time window), we
  // stack-pack them vertically within the row instead of overlapping. CSS
  // defaults (top: 6, bottom: 6 — fills the row) are overridden by inline
  // top/height so jobs don't pile on top of each other.
  const usesLanes = laneCount != null && laneCount > 1 && laneIndex != null;
  const laneStyle = usesLanes
    ? (() => {
        const LANE_GAP = 4;
        const LANE_PAD = 6;
        const usableArea = `(100% - ${LANE_PAD * 2}px - ${(laneCount! - 1) * LANE_GAP}px)`;
        return {
          top: `calc(${LANE_PAD}px + ${laneIndex!} * ((${usableArea}) / ${laneCount!} + ${LANE_GAP}px))`,
          height: `calc((${usableArea}) / ${laneCount!})`,
          bottom: 'auto' as const,
        };
      })()
    : undefined;

  return (
    <div
      ref={blockRef}
      className={className}
      style={{ left: left + 'px', width: width + 'px', ...laneStyle }}
      onClick={(e) => {
        if (!resizing) onClick(job, e);
      }}
      draggable={!resizing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/job-id', job.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setDragging(true), 0);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="job-block-header">
        <span
          className="jt-tag"
          style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 5px' }}
        >
          {jt.short}
        </span>
        {job.multidayGroupId && (
          <span
            className="multiday-chip"
            title={'Day ' + job.multidayIndex + ' of ' + job.multidayTotal}
          >
            <Icon name="refresh" size={9} stroke="currentColor" /> {job.multidayIndex}/
            {job.multidayTotal}
          </span>
        )}
        {job.continuationOf && (
          <span
            className="multiday-chip continuation"
            title={'Continues ' + job.continuationOf}
          >
            <Icon name="refresh" size={9} stroke="currentColor" /> CONT.
          </span>
        )}
      </div>

      <div className="job-block-title">
        {jobDisplayName(job, customer, jt, { prefer: 'short' })}
      </div>

      {!compact && (
        <div className="job-block-meta">
          <Icon name="clock" size={10} />
          <span>
            {fmtTime(job.startHour)} · {hoursToStr(liveHours)}
          </span>
        </div>
      )}

      <div className="job-block-people" style={{ marginTop: 'auto' }}>
        {visiblePeople.map((id, i) => (
          <Avatar key={i} person={id} size="xs" color="rgba(255,255,255,0.85)" />
        ))}
        {unfilled && (
          <span className="unfilled-pill" style={{ marginLeft: 6 }}>
            <Icon name="user" size={10} /> Unfilled
          </span>
        )}
      </div>

      {/* Right-edge resize handle */}
      <div
        className="job-block-resize"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />

      {/* Live resize tooltip */}
      {resizing && previewHours != null && (
        <div className="job-block-resize-tooltip">
          {hoursToStr(previewHours)} · ends {fmtTime(job.startHour + previewHours)}
        </div>
      )}

      {/* Conflict warning badge */}
      {hasConflict && (
        <div className="conflict-badge" title="Overlaps another job in this row">
          <Icon name="info" size={10} /> Conflict
        </div>
      )}
    </div>
  );
}
