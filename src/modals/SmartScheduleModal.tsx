// =============================================================
// SmartScheduleModal — ranked crew suggestions for an unscheduled job.
// Opens when the dispatcher triggers smart-schedule for a specific job.
// Selecting a crew + date/time schedules the job, fills slots, sets status.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';

import {
  getCrew,
  getCustomer,
  getJobType,
  getPerson,
  getTruck,
} from '../data/selectors';
import { addDays, dateKey, fmtDate, fmtTime, parseDateKey, TODAY } from '../data/helpers';
import { autoFillSlots, suggestCrewForJob } from '../lib/assignment';
import { useStore } from '../store';
import type { Job } from '../types';

export function SmartScheduleModal() {
  const jobId = useStore((s) => s.smartScheduleJobId);
  const close = useStore((s) => s.closeSmartSchedule);
  const jobs = useStore((s) => s.jobs);
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const customers = useStore((s) => s.customers);
  const trucks = useStore((s) => s.trucks);
  const timeOff = useStore((s) => s.timeOff);
  const updateJob = useStore((s) => s.updateJob);
  const pushToast = useStore((s) => s.pushToast);

  const job = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  // Default to tomorrow at 8a.
  const [date, setDate] = useState<string>(dateKey(addDays(TODAY, 1)));
  const [startHour, setStartHour] = useState<number>(8);
  const [crewChoice, setCrewChoice] = useState<string | null>(null);

  // Reset selection when job changes.
  useEffect(() => {
    if (job) {
      setDate(job.date ?? dateKey(addDays(TODAY, 1)));
      setStartHour(job.startHour ?? 8);
      setCrewChoice(null);
    }
  }, [job?.id]);

  // Build a probe job that reflects the candidate date so scoring uses it.
  const suggestions = useMemo(() => {
    if (!job) return [];
    const probe: Job = { ...job, date, startHour };
    return suggestCrewForJob(probe, crews, people, jobs, timeOff).slice(0, 6);
  }, [job, date, startHour, crews, people, jobs, timeOff]);

  // Auto-pick the top suggestion.
  useEffect(() => {
    if (suggestions.length > 0 && !crewChoice) {
      setCrewChoice(suggestions[0].crewId);
    }
  }, [suggestions, crewChoice]);

  if (!job) return null;

  const customer = getCustomer(customers, job.customer);
  const jt = getJobType(job.type);

  function schedule() {
    if (!job || !crewChoice) return;
    const crew = getCrew(crews, crewChoice);
    const filledSlots = autoFillSlots(job, crew ?? null, people);
    const duration = Math.max(...filledSlots.map((s) => s.start + s.hours), 1);
    const updated: Job = {
      ...job,
      status: 'scheduled',
      date,
      startHour,
      crewId: crewChoice,
      truckId: crew?.truck ?? job.truckId,
      slots: filledSlots,
      durationHrs: duration,
    };
    updateJob(updated);
    pushToast(
      `Scheduled ${job.id} · ${crew?.name ?? ''} on ${date} at ${fmtTime(startHour)}`,
    );
    close();
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 720 }}
        role="dialog"
        aria-label="Smart schedule"
      >
        <div className="modal-header">
          <Icon name="sparkle" size={18} stroke="var(--jetson-green)" />
          <div>
            <div className="eyebrow-sm">Smart schedule</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {job.id} · {customer?.name ?? job.address}
            </div>
            {jt && (
              <div className="muted small" style={{ marginTop: 2 }}>
                {jt.label}
              </div>
            )}
          </div>
          <div className="topbar-spacer"></div>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>

        <div className="modal-body">
          {/* Date / time controls */}
          <div className="row" style={{ marginBottom: 16, gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Try date</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              />
              <div className="muted small" style={{ marginTop: 4 }}>
                {fmtDate(parseDateKey(date), {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Start time</label>
              <select
                className="select"
                value={startHour}
                onChange={(e) => setStartHour(parseFloat(e.target.value))}
              >
                {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((h) => (
                  <option key={h} value={h}>
                    {fmtTime(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row" style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontFamily: 'var(--font-subhead)',
                fontWeight: 700,
              }}
            >
              Ranked crew options
            </span>
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              Click a card to select
            </span>
          </div>

          {suggestions.length === 0 ? (
            <div className="empty" style={{ padding: 24, textAlign: 'center' }}>
              <div className="muted small">
                No crews could be scored for this job. Try a different date.
              </div>
            </div>
          ) : (
            <div className="suggestion-list">
              {suggestions.map((sug, i) => {
                const crew = getCrew(crews, sug.crewId);
                if (!crew) return null;
                const lead = getPerson(people, crew.lead);
                const tr = getTruck(trucks, crew.truck);
                const selected = crewChoice === sug.crewId;
                return (
                  <div
                    key={sug.crewId}
                    className={
                      'suggestion' +
                      (i === 0 ? ' best' : '') +
                      (selected ? ' selected' : '')
                    }
                    onClick={() => setCrewChoice(sug.crewId)}
                  >
                    <div className="suggestion-rank">#{i + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14 }}>{crew.name}</strong>
                        {lead && (
                          <span className="muted small">· lead {lead.name}</span>
                        )}
                        {tr && (
                          <span
                            className="tag"
                            style={{ marginLeft: 6, fontSize: 11 }}
                          >
                            <Icon name="truck" size={10} /> {tr.name}
                          </span>
                        )}
                        <span
                          className="mono small muted"
                          style={{ marginLeft: 'auto' }}
                        >
                          score {sug.score}
                        </span>
                      </div>
                      <div className="suggestion-reasons">
                        {sug.reasons.map((reason, j) => (
                          <span
                            key={j}
                            className={'reason-chip ' + classifyReason(reason)}
                          >
                            <Icon name={iconForReason(reason)} size={10} />
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      {crew.members.slice(0, 4).map((m) => (
                        <Avatar key={m} person={m} size="xs" />
                      ))}
                    </div>
                    <button
                      type="button"
                      className={
                        'btn btn-sm ' + (selected ? 'btn-primary' : 'btn-outline')
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setCrewChoice(sug.crewId);
                        // Schedule immediately if user clicks the inline Schedule button.
                        // We defer the actual schedule to the explicit footer action,
                        // since this row click also selects.
                      }}
                    >
                      {selected ? (
                        <>
                          <Icon name="check" size={12} /> Selected
                        </>
                      ) : (
                        'Schedule'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="muted small">
            <Icon name="info" size={11} /> Suggestions weighted by skill match, availability, continuity, and proximity.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!crewChoice}
              style={{ opacity: crewChoice ? 1 : 0.4 }}
              onClick={schedule}
            >
              <Icon name="check" size={12} />{' '}
              Schedule with {getCrew(crews, crewChoice ?? '')?.name.split(' ')[0] ?? '…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Reason → chip tone / icon (heuristic by keyword)
// =============================================================
function classifyReason(reason: string): 'good' | 'warn' | 'bad' {
  const low = reason.toLowerCase();
  if (low.includes('partial') || low.includes('missing')) return 'warn';
  if (low.includes('leave') || low.includes('no template')) return 'bad';
  if (low.startsWith('all') || low.includes('continuity') || low.includes('available')) return 'good';
  if (low.includes('min')) {
    const m = /([0-9]+)\s*min/.exec(low);
    if (m) {
      const n = Number(m[1]);
      if (n > 25) return 'warn';
    }
    return 'good';
  }
  return 'good';
}

function iconForReason(reason: string) {
  const low = reason.toLowerCase();
  if (low.includes('min ')) return 'map_pin' as const;
  if (low.includes('continuity')) return 'sparkle' as const;
  if (low.includes('leave')) return 'alert_circle' as const;
  if (low.includes('available') || low.includes('booked') || low.includes('free')) {
    return 'clock' as const;
  }
  if (low.includes('partial') || low.includes('missing')) return 'info' as const;
  return 'check' as const;
}
