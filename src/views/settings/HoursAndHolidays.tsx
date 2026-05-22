import { Fragment, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';

interface DayHours {
  day: string;
  open: string;
  close: string;
}

const DEFAULT_SCHEDULE: DayHours[] = [
  { day: 'Monday',    open: '7:00 AM', close: '5:00 PM' },
  { day: 'Tuesday',   open: '7:00 AM', close: '5:00 PM' },
  { day: 'Wednesday', open: '7:00 AM', close: '5:00 PM' },
  { day: 'Thursday',  open: '7:00 AM', close: '5:00 PM' },
  { day: 'Friday',    open: '7:00 AM', close: '5:00 PM' },
  { day: 'Saturday',  open: '8:00 AM', close: '2:00 PM' },
  { day: 'Sunday',    open: 'Closed',  close: 'Closed'  },
];

const DEFAULT_HOLIDAYS = [
  "Jan 1 · New Year's Day",
  'May 25 · Memorial Day',
  'Jul 3 · Independence Day',
  'Sep 7 · Labor Day',
  'Nov 26 · Thanksgiving',
  'Dec 25 · Christmas Day',
];

export function HoursAndHolidays() {
  const [schedule, setSchedule] = useState<DayHours[]>(DEFAULT_SCHEDULE);
  const [holidays, setHolidays] = useState<string[]>(DEFAULT_HOLIDAYS);

  function patch(i: number, patch: Partial<DayHours>) {
    setSchedule((s) => s.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
  function removeHoliday(i: number) {
    setHolidays((h) => h.filter((_, j) => j !== i));
  }

  return (
    <>
      <div>
        <h3>Hours &amp; holidays</h3>
        <p className="muted small">
          Standard working hours and company holidays — affect availability and scheduling suggestions.
        </p>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Default schedule</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 12, alignItems: 'center' }}>
          {schedule.map((d, i) => (
            <Fragment key={d.day}>
              <span style={{ fontWeight: 600 }}>{d.day}</span>
              <input className="input" value={d.open} onChange={(e) => patch(i, { open: e.target.value })} />
              <input className="input" value={d.close} onChange={(e) => patch(i, { close: e.target.value })} />
            </Fragment>
          ))}
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Company holidays (2026)</h4>
        <div className="col" style={{ gap: 6 }}>
          {holidays.map((h, i) => (
            <div key={h} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <Icon name="calendar" size={14} stroke="var(--fg-muted)" />
              <span style={{ fontSize: 13 }}>{h}</span>
              <div className="topbar-spacer" />
              <IconButton icon="x" label="Remove holiday" onClick={() => removeHoliday(i)} />
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
          <Icon name="plus" size={12} /> Add holiday
        </button>
      </div>

      <div className="muted small">
        Note: schedule + holidays persist within the session only — wire to the store once a `setOpenHours`
        action is added.
      </div>
    </>
  );
}
