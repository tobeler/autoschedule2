// =============================================================
// LoanBlock — striped/dashed block rendered on a person's HOME-crew row
// when they are staffed on another crew's job. Spans only the slot hours.
// =============================================================
import type { MouseEventHandler } from 'react';
import type { Crew, Job, JobSlot, Person } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtTime, hoursToStr } from '../../data/helpers';

interface LoanBlockProps {
  job: Job;
  slot: JobSlot;
  person: Person;
  homeCrew: Crew | undefined;
  colW: number;
  hourStart: number;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function LoanBlock({ job, slot, person, homeCrew, colW, hourStart, onClick }: LoanBlockProps) {
  if (job.startHour == null) return null;
  const startH = job.startHour + (slot.start || 0);
  const left = (startH - hourStart) * colW;
  const width = Math.max(60, slot.hours * colW - 4);
  const title =
    person.name +
    ' loaned to ' +
    (homeCrew?.name || 'another crew') +
    ' for ' +
    job.id +
    ' · ' +
    fmtTime(startH) +
    '–' +
    fmtTime(startH + slot.hours);
  return (
    <div
      className="job-loan-block day-loan"
      style={{ position: 'absolute', left: left + 'px', width: width + 'px' }}
      title={title}
      onClick={onClick}
    >
      <div
        className="job-loan-stripe"
        style={{ background: homeCrew?.color || 'var(--mid-gray)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="job-loan-head">
          <Icon name="refresh" size={9} /> LOAN · {person.name.split(' ')[0]}
        </div>
        <div className="job-loan-time">
          {fmtTime(startH)}–{fmtTime(startH + slot.hours)}
        </div>
        <div className="job-loan-host">
          @ {homeCrew?.name || '—'} · {hoursToStr(slot.hours)}
        </div>
      </div>
    </div>
  );
}
