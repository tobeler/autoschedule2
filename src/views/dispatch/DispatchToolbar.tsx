// =============================================================
// DispatchToolbar — controls strip above the calendar.
// Range × Layout × Group × Density × Type-filter × + New job.
// =============================================================
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JOB_TYPES } from '../../data/seed';
import { addDays, dateKey, fmtDate, TODAY } from '../../data/helpers';
import { useStore } from '../../store';

export type RangeKind = 'day' | 'week' | 'month';
export type LayoutKind = 'calendar' | 'kanban' | 'gantt' | 'map';
export type GroupKind = 'crew' | 'truck' | 'tech';
export type Density = 'cozy' | 'compact';

interface DispatchToolbarProps {
  date: Date;
  setDate: (d: Date) => void;
  range: RangeKind;
  setRange: (r: RangeKind) => void;
  layout: LayoutKind;
  setLayout: (l: LayoutKind) => void;
  groupBy: GroupKind;
  setGroupBy: (g: GroupKind) => void;
  density: Density;
  setDensity: (d: Density) => void;
  typeFilter: string[];
  setTypeFilter: (t: string[]) => void;
  /** Visible jobs (for showing per-type counts in the dropdown) */
  visibleJobs: { type: string }[];
}

export function DispatchToolbar({
  date,
  setDate,
  range,
  setRange,
  layout,
  setLayout,
  groupBy,
  setGroupBy,
  density,
  setDensity,
  typeFilter,
  setTypeFilter,
  visibleJobs,
}: DispatchToolbarProps) {
  const openWizard = useStore((s) => s.openWizard);
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);

  function shiftDate(n: number) {
    if (range === 'day') setDate(addDays(date, n));
    else if (range === 'week') setDate(addDays(date, n * 7));
    else setDate(new Date(date.getFullYear(), date.getMonth() + n, 1));
  }

  let dateLabel: string;
  if (range === 'day') {
    const isToday = dateKey(date) === dateKey(TODAY);
    dateLabel = isToday
      ? 'Today · ' + fmtDate(date)
      : fmtDate(date, { weekday: 'short', month: 'long', day: 'numeric' });
  } else if (range === 'week') {
    const start = addDays(date, -date.getDay());
    const end = addDays(start, 6);
    dateLabel =
      fmtDate(start, { month: 'short', day: 'numeric' }) +
      ' – ' +
      fmtDate(end, { month: 'short', day: 'numeric' });
  } else {
    dateLabel = date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  const ranges: [RangeKind, string][] = [
    ['day', 'Day'],
    ['week', 'Week'],
    ['month', 'Month'],
  ];
  const layouts: [LayoutKind, string, 'calendar' | 'kanban' | 'gantt' | 'map_pin'][] = [
    ['calendar', 'Calendar', 'calendar'],
    ['kanban', 'Kanban', 'kanban'],
    ['gantt', 'Gantt', 'gantt'],
    ['map', 'Map', 'map_pin'],
  ];
  const groups: [GroupKind, string][] = [
    ['crew', 'Crew'],
    ['truck', 'Truck'],
    ['tech', 'Tech'],
  ];

  return (
    <div className="dispatch-controls">
      <div className="date-nav">
        <IconButton
          icon="chevron_left"
          label="Previous"
          onClick={() => shiftDate(-1)}
        />
        <div className="date-label">{dateLabel}</div>
        <IconButton
          icon="chevron_right"
          label="Next"
          onClick={() => shiftDate(1)}
        />
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setDate(TODAY)}
          style={{ marginLeft: 6 }}
        >
          Today
        </button>
      </div>

      <div className="control-group" style={{ marginLeft: 12 }}>
        <span className="control-label">Range</span>
        <div className="seg">
          {ranges.map(([k, l]) => (
            <button
              key={k}
              className={range === k ? 'active' : ''}
              onClick={() => setRange(k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">View</span>
        <div className="seg">
          {layouts.map(([k, l, ico]) => (
            <button
              key={k}
              className={layout === k ? 'active' : ''}
              onClick={() => setLayout(k)}
            >
              <Icon name={ico} size={13} /> {l}
            </button>
          ))}
        </div>
      </div>

      {layout !== 'kanban' && range !== 'month' && (
        <div className="control-group">
          <span className="control-label">Group</span>
          <div className="seg">
            {groups.map(([k, l]) =>
              layout === 'gantt' && k === 'tech' ? null : (
                <button
                  key={k}
                  className={groupBy === k ? 'active' : ''}
                  onClick={() => setGroupBy(k)}
                >
                  {l}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className="topbar-spacer" />

      {/* JOB TYPE FILTER */}
      <div className="dispatch-type-filter">
        <button
          className={
            'btn btn-sm ' +
            (typeFilter.length > 0 ? 'btn-dark' : 'btn-outline')
          }
          onClick={() => setTypeFilterOpen(!typeFilterOpen)}
        >
          <Icon name="briefcase" size={13} />
          {typeFilter.length === 0
            ? 'All types'
            : typeFilter.length === 1
            ? JOB_TYPES[typeFilter[0]]?.short ||
              JOB_TYPES[typeFilter[0]]?.label ||
              typeFilter[0]
            : typeFilter.length + ' types'}
          <Icon name={typeFilterOpen ? 'chevron_up' : 'chevron_down'} size={11} />
        </button>
        {typeFilterOpen && (
          <div
            className="dispatch-type-filter-pop"
            onMouseLeave={() => setTypeFilterOpen(false)}
          >
            <div className="dispatch-type-filter-head">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-muted)',
                }}
              >
                Filter job types
              </span>
              {typeFilter.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setTypeFilter([])}
                >
                  Clear
                </button>
              )}
            </div>
            {Object.entries(JOB_TYPES).map(([k, jt]) => {
              const checked = typeFilter.includes(k);
              const count = visibleJobs.filter((j) => j.type === k).length;
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
                    onChange={() =>
                      setTypeFilter(
                        checked
                          ? typeFilter.filter((x) => x !== k)
                          : [...typeFilter, k],
                      )
                    }
                  />
                  <span
                    className="dot"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: 'var(--' + jt.color + ')',
                    }}
                  />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>
                    {jt.label}
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

      <div className="control-group">
        <span className="control-label">Density</span>
        <div className="seg">
          <button
            className={density === 'cozy' ? 'active' : ''}
            onClick={() => setDensity('cozy')}
          >
            Cozy
          </button>
          <button
            className={density === 'compact' ? 'active' : ''}
            onClick={() => setDensity('compact')}
          >
            Compact
          </button>
        </div>
      </div>

      <button className="btn btn-dark btn-sm" onClick={openWizard}>
        <Icon name="plus" size={14} /> New job
      </button>
    </div>
  );
}
