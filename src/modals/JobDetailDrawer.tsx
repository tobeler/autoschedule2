// =============================================================
// JobDetailDrawer — right-side slide-in drawer for an active job.
// Six tabs: Overview / Crew / Timeline / Customer / Completion form / Notes.
// When the job is unscheduled, a green hero appears at the top with a
// placeholder for Phase 5's SuggestTimePicker and a "Schedule it" button.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';

import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { JobTypeTag } from '../components/JobTypeTag';
import { StatusBadge } from '../components/StatusBadge';

import {
  checklistProgress,
  continuationChain,
  getCrew,
  getCustomer,
  getJobType,
  getPerson,
  getProject,
  getTruck,
  isItemAnswered,
  jobsForProject,
  multidaySiblings,
  projectStatusLabel,
  roleLabel,
  suggestAssignments,
} from '../data/selectors';
import { fmtDate, fmtTime, hoursToStr, parseDateKey } from '../data/helpers';
import { autoFillSlots } from '../lib/assignment';
import { useSelectedJob, useStore } from '../store';
import type {
  ChecklistItem,
  ChecklistResponseValue,
  ChecklistSection,
  Job,
  JobSlot,
  JobStatus,
} from '../types';

type TabKey = 'overview' | 'crew' | 'timeline' | 'customer' | 'completion' | 'notes';

const TAB_LABELS: Record<TabKey, string> = {
  overview: 'Overview',
  crew: 'Crew',
  timeline: 'Timeline',
  customer: 'Customer',
  completion: 'Completion form',
  notes: 'Notes',
};

const PROJECT_STATUS_COLOR: Record<string, string> = {
  proposed: '#ACAA93',
  sold: '#4FB3E8',
  in_progress: '#3CD567',
  complete: '#1F8A5B',
  warranty: '#FFB627',
  cancelled: '#C53030',
};

export function JobDetailDrawer() {
  const job = useSelectedJob();
  const selectJob = useStore((s) => s.selectJob);
  const updateJob = useStore((s) => s.updateJob);
  const moveJob = useStore((s) => s.moveJob);
  const setJobStatus = useStore((s) => s.setJobStatus);
  const pushToast = useStore((s) => s.pushToast);

  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const customers = useStore((s) => s.customers);
  const projects = useStore((s) => s.projects);
  const jobs = useStore((s) => s.jobs);
  const checklists = useStore((s) => s.checklists);
  const checklistResponses = useStore((s) => s.checklistResponses);

  const [tab, setTab] = useState<TabKey>('overview');
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  // Reset tab and drafts when the selected job changes.
  useEffect(() => {
    setTab('overview');
    setEditingSlot(null);
    setNotesDraft(job?.notes ?? '');
  }, [job?.id]);

  if (!job) return null;

  const customer = getCustomer(customers, job.customer);
  const jt = getJobType(job.type);
  const crew = getCrew(crews, job.crewId);
  const truck = getTruck(trucks, job.truckId);
  const project = getProject(projects, job.projectId);
  const projectSiblings = project ? jobsForProject(jobs, project.id) : [];
  const projectCompleted = projectSiblings.filter((j) => j.status === 'complete').length;

  const isUnscheduled = job.status === 'unscheduled';
  const unfilledCount = job.slots.filter((s) => !s.assignedTo && !s.optional).length;
  const siblings = multidaySiblings(jobs, job);
  const chain = continuationChain(jobs, job);
  const continuationHead =
    chain.length > 1 && chain[0].id !== job.id ? chain[0] : null;

  const close = () => selectJob(null);

  function autoFillThisJob() {
    if (!job) return;
    const filled = autoFillSlots(job, crew ?? null, people);
    const updated: Job = { ...job, slots: filled };
    updateJob(updated);
    const filledNow = filled.filter((s) => s.suggested).length;
    pushToast(`Auto-filled ${filledNow} slot${filledNow === 1 ? '' : 's'}`);
  }

  function assignSlot(slotId: string, personId: string) {
    if (!job) return;
    const next = job.slots.map((s) =>
      s.id === slotId ? { ...s, assignedTo: personId || null, suggested: false } : s,
    );
    updateJob({ ...job, slots: next });
    setEditingSlot(null);
  }

  function saveNotes() {
    if (!job) return;
    updateJob({ ...job, notes: notesDraft });
    pushToast('Notes saved');
  }

  function advanceStatus(next: JobStatus) {
    if (!job) return;
    setJobStatus(job.id, next);
    pushToast(`Marked ${job.id} as ${next}`);
  }

  // ===== Render =====
  return (
    <>
      <div className="drawer-backdrop" onClick={close}></div>
      <aside className="drawer" role="dialog" aria-label={`Job ${job.id}`}>
        <div className="drawer-header">
          <span className="mono small muted">{job.id}</span>
          <JobTypeTag type={job.type} size="lg" />
          <div className="topbar-spacer"></div>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>

        {/* ===== TITLE BAND ===== */}
        <div style={{ padding: '14px 20px 0', background: 'var(--surface-card)' }}>
          <h2 className="page-title">{customer?.name || job.address || 'Job'}</h2>
          <div className="row small muted" style={{ marginTop: 6 }}>
            <Icon name="map_pin" size={13} />
            <span>{job.address}</span>
            {job.startHour != null && job.date && (
              <>
                <span className="divider-v" style={{ height: 12 }}></span>
                <Icon name="clock" size={13} />
                <span>
                  {job.date} · {fmtTime(job.startHour)}–{fmtTime(job.startHour + job.durationHrs)}
                </span>
              </>
            )}
          </div>
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <StatusBadge status={job.status} />
            {job.hubspotDealId && (
              <span
                className="badge"
                style={{ background: 'rgba(255,122,89,0.15)', color: '#9F3D24' }}
              >
                <Icon name="hubspot" size={11} /> {job.hubspotDealId}
              </span>
            )}
            {unfilledCount > 0 && (
              <span className="badge badge-callback">{unfilledCount} unfilled</span>
            )}
            {job.multidayGroupId && job.multidayTotal && (
              <span
                className="multiday-chip"
                title={`Day ${job.multidayIndex ?? 1} of ${job.multidayTotal}`}
              >
                <Icon name="refresh" size={9} /> Day {job.multidayIndex ?? 1} of{' '}
                {job.multidayTotal}
              </span>
            )}
            {continuationHead && (
              <span
                className="multiday-chip continuation"
                title={`Continues ${continuationHead.id}`}
                onClick={() => selectJob(continuationHead.id)}
                style={{ cursor: 'pointer' }}
              >
                <Icon name="refresh" size={9} /> CONT. {continuationHead.id}
              </span>
            )}
          </div>

          {/* Multi-day sibling links */}
          {siblings.length > 1 && (
            <div className="row small muted" style={{ marginTop: 8, gap: 6 }}>
              <span>Days:</span>
              {siblings.map((s) => (
                <button
                  key={s.id}
                  className={'pill' + (s.id === job.id ? ' active' : '')}
                  style={{
                    fontSize: 11,
                    cursor: 'pointer',
                    background:
                      s.id === job.id ? 'var(--jetson-green)' : 'var(--bg-subtle)',
                    color: s.id === job.id ? 'var(--forest)' : 'var(--fg-muted)',
                    border: 'none',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                  onClick={() => selectJob(s.id)}
                >
                  Day {s.multidayIndex ?? '?'}
                </button>
              ))}
            </div>
          )}

          {/* Project link pill */}
          {project && (
            <div
              className="job-project-link"
              style={{ marginTop: 12 }}
              onClick={() => pushToast(`Open project ${project.id}`)}
            >
              <div
                className="stripe"
                style={{ background: PROJECT_STATUS_COLOR[project.status] || 'var(--mid-gray)' }}
              ></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow">Part of project</div>
                <div className="name">{project.name}</div>
                <div className="meta">
                  {project.id} · {projectCompleted}/{projectSiblings.length} jobs ·{' '}
                  {projectStatusLabel(project.status)}
                </div>
              </div>
              <Icon name="chevron_right" size={14} stroke="var(--mid-gray)" />
            </div>
          )}
        </div>

        {/* ===== TABS ===== */}
        <div className="drawer-tabs" style={{ marginTop: 16 }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => {
            const hasResponses = !!checklistResponses[job.id];
            return (
              <button
                key={t}
                type="button"
                className={'drawer-tab ' + (tab === t ? 'active' : '')}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
                {t === 'completion' && hasResponses && (
                  <span
                    className="badge badge-onsite"
                    style={{ marginLeft: 6, fontSize: 9 }}
                  >
                    <Icon name="check" size={9} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ===== BODY ===== */}
        <div className="drawer-body">
          {isUnscheduled && (
            <UnscheduledHero
              job={job}
              onSchedule={(payload) => {
                // Auto-fill slots from template + crew defaults
                const crewObj = getCrew(crews, payload.crewId);
                const slotsFilled = autoFillSlots(job, crewObj ?? null, people);
                const duration = Math.max(
                  ...slotsFilled.map((s) => s.start + s.hours),
                  1,
                );
                const updated: Job = {
                  ...job,
                  status: 'scheduled',
                  date: payload.date,
                  startHour: payload.startHour,
                  crewId: payload.crewId,
                  truckId: crewObj?.truck ?? job.truckId,
                  slots: slotsFilled,
                  durationHrs: duration,
                };
                updateJob(updated);
                // Also move (status flip happens via updateJob above; moveJob kept
                // for parity with the team-lead's brief).
                moveJob(job.id, {
                  date: payload.date,
                  startHour: payload.startHour,
                  crewId: payload.crewId,
                });
                pushToast(
                  `Scheduled ${job.id} · ${crewObj?.name ?? ''} on ${payload.date} at ${fmtTime(payload.startHour)}`,
                );
                close();
              }}
            />
          )}

          {tab === 'overview' && (
            <OverviewTab
              job={job}
              crewName={crew?.name}
              truckLabel={truck ? `${truck.name} · ${truck.plate}` : null}
              unfilledCount={unfilledCount}
              onAutoFill={autoFillThisJob}
            />
          )}

          {tab === 'crew' && (
            <CrewTab
              job={job}
              editingSlot={editingSlot}
              setEditingSlot={setEditingSlot}
              assignSlot={assignSlot}
              onAutoFill={autoFillThisJob}
              truckLabel={truck ? `${truck.name} · ${truck.plate}` : null}
              truckCapacity={truck?.capacity}
            />
          )}

          {tab === 'timeline' && (
            <TimelineTab job={job} crewName={crew?.name} onAdvance={advanceStatus} />
          )}

          {tab === 'customer' && <CustomerTab job={job} />}

          {tab === 'completion' && (
            <CompletionTab
              job={job}
              sections={checklists[job.type]}
              responses={checklistResponses[job.id]}
            />
          )}

          {tab === 'notes' && (
            <NotesTab value={notesDraft} onChange={setNotesDraft} onSave={saveNotes} />
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div className="drawer-footer">
          {isUnscheduled ? (
            <>
              <button className="btn btn-outline btn-sm" onClick={close}>
                Cancel
              </button>
              <span className="muted small" style={{ marginLeft: 6 }}>
                Pick a slot above or use Smart-schedule
              </span>
              <div className="topbar-spacer"></div>
              {unfilledCount > 0 && (
                <button className="btn btn-outline btn-sm" onClick={autoFillThisJob}>
                  <Icon name="sparkle" size={12} /> Auto-fill slots
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-outline btn-sm">
                <Icon name="map_pin" size={12} /> View on map
              </button>
              <div className="topbar-spacer"></div>
              <button className="btn btn-outline btn-sm" onClick={close}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  updateJob({ ...job, notes: notesDraft });
                  pushToast('Changes saved');
                  close();
                }}
              >
                <Icon name="check" size={12} /> Save changes
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// =============================================================
// UNSCHEDULED HERO — green-bordered card with embedded picker placeholder
// =============================================================
interface ScheduleSelection {
  crewId: string;
  date: string;
  startHour: number;
}

function UnscheduledHero({
  job,
  onSchedule,
}: {
  job: Job;
  onSchedule: (sel: ScheduleSelection) => void;
}) {
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const jt = getJobType(job.type);
  const requiredRoles = job.slots.filter((s) => !s.optional);
  const estimatedHours = Math.max(
    ...job.slots.map((s) => s.start + s.hours),
    1,
  );

  // Lightweight in-hero picker so the drawer is functional even before
  // Phase 5's SuggestTimePicker lands. The real picker will replace this.
  const eligibleCrews = useMemo(() => {
    if (requiredRoles.length === 0) return crews;
    const leadRole = requiredRoles[0].role;
    return crews.filter((c) => c.members.length > 0 && c.type !== 'sales' || leadRole === 'fsm');
    // simpler heuristic: keep all and let the user choose.
  }, [crews, requiredRoles]);
  const crewOptions = eligibleCrews.length ? eligibleCrews : crews;

  // Default to tomorrow at 8a with the first install crew.
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  })();

  const [crewId, setCrewId] = useState<string>(crewOptions[0]?.id ?? '');
  const [date, setDate] = useState<string>(tomorrow);
  const [startHour, setStartHour] = useState<number>(8);

  const selectedCrew = crews.find((c) => c.id === crewId);
  const selectedTruck = trucks.find((t) => t.id === (selectedCrew?.truck ?? ''));

  const ready = !!crewId && !!date && Number.isFinite(startHour);

  return (
    <div className="job-schedule-hero">
      <div className="job-schedule-hero-head">
        <div className="hero-icon">
          <Icon name="sparkle" size={18} stroke="var(--forest)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hero-eyebrow">This job needs scheduling</div>
          <div className="hero-title">Pick a crew and time</div>
        </div>
        {ready && (
          <span
            className="badge"
            style={{
              background: 'var(--jetson-green)',
              color: 'var(--forest)',
              fontWeight: 800,
            }}
          >
            Slot selected
          </span>
        )}
      </div>

      <div className="job-schedule-hero-summary">
        <div>
          <div className="k">Type</div>
          <div className="v">
            <JobTypeTag type={job.type} />{' '}
            <span style={{ marginLeft: 4 }}>{jt?.label ?? job.type}</span>
          </div>
        </div>
        <div>
          <div className="k">Needs</div>
          <div className="v" style={{ fontFamily: 'var(--font-mono)' }}>
            {Math.round(estimatedHours)}h · {requiredRoles.length} role
            {requiredRoles.length === 1 ? '' : 's'}
          </div>
        </div>
        {job.price != null && (
          <div>
            <div className="k">Value</div>
            <div className="v">${job.price.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Phase 5 placeholder — real picker lands later. */}
      <div
        style={{
          marginTop: 14,
          padding: 16,
          border: '1.5px dashed var(--border-strong)',
          borderRadius: 12,
          background: 'var(--bg-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div className="row small muted">
          <Icon name="info" size={12} />
          <span>
            Suggest-a-time picker (Phase 5) — using a simple form here for now.
          </span>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">Date</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              style={{ width: 160 }}
            />
          </label>
          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">Start</span>
            <select
              className="select"
              value={startHour}
              onChange={(e) => setStartHour(parseFloat(e.target.value))}
              style={{ width: 100 }}
            >
              {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((h) => (
                <option key={h} value={h}>
                  {fmtTime(h)}
                </option>
              ))}
            </select>
          </label>
          <label
            className="field"
            style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}
          >
            <span className="label">Crew</span>
            <select
              className="select"
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
            >
              {crewOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {ready && selectedCrew && (
        <div className="job-schedule-hero-selected">
          <Icon name="check" size={14} stroke="var(--jetson-green)" strokeWidth={2.5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {selectedCrew.name} ·{' '}
              {fmtDate(parseDateKey(date), {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              at {fmtTime(startHour)}
            </div>
            <div className="muted small">
              {selectedTruck?.name ?? 'No truck assigned'} · ends{' '}
              {fmtTime(startHour + estimatedHours)}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onSchedule({ crewId, date, startHour })}
          >
            <Icon name="check" size={12} /> Schedule it
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================
// TAB: OVERVIEW
// =============================================================
function OverviewTab({
  job,
  crewName,
  truckLabel,
  unfilledCount,
  onAutoFill,
}: {
  job: Job;
  crewName: string | undefined;
  truckLabel: string | null;
  unfilledCount: number;
  onAutoFill: () => void;
}) {
  const jt = getJobType(job.type);
  return (
    <>
      <div className="drawer-section">
        <div className="drawer-section-title">
          <Icon name="briefcase" size={14} /> Job summary
        </div>
        <dl className="kv-list">
          <dt>Type</dt>
          <dd>{jt?.label ?? job.type}</dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={job.status} />
          </dd>
          <dt>Date</dt>
          <dd>{job.date || '—'}</dd>
          <dt>Window</dt>
          <dd>
            {job.startHour != null
              ? `${fmtTime(job.startHour)}–${fmtTime(job.startHour + job.durationHrs)}`
              : 'Unscheduled'}
          </dd>
          <dt>Address</dt>
          <dd>{job.address}</dd>
          <dt>Crew</dt>
          <dd>{crewName || '—'}</dd>
          <dt>Truck</dt>
          <dd>{truckLabel || '—'}</dd>
          {job.driveTimeMin > 0 && (
            <>
              <dt>Drive time</dt>
              <dd>{job.driveTimeMin} min from prior job</dd>
            </>
          )}
        </dl>
      </div>

      {job.notes && (
        <div className="drawer-section">
          <div className="drawer-section-title">
            <Icon name="info" size={14} /> Notes
          </div>
          <p style={{ margin: 0, fontSize: 13 }}>{job.notes}</p>
        </div>
      )}

      <div className="drawer-section">
        <div className="drawer-section-title">
          <Icon name="map_pin" size={14} /> Location
          <span
            className="muted small"
            style={{ marginLeft: 'auto', fontWeight: 400 }}
          >
            {job.driveTimeMin > 0 ? `${job.driveTimeMin} min from prior stop` : ''}
          </span>
        </div>
        <div className="map-stub" style={{ height: 200, position: 'relative' }}>
          <div className="map-pin" style={{ top: '58%', left: '52%' }}>
            <div
              className="pin-dot"
              style={{ background: 'var(--jetson-green)', color: 'var(--forest)' }}
            >
              <Icon name="home" size={12} />
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              background: 'var(--surface-card)',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {job.address}
          </div>
        </div>
      </div>

      {unfilledCount > 0 && (
        <div className="drawer-section">
          <div className="suggest-card">
            <Icon name="sparkle" size={16} className="sparkle" stroke="var(--jetson-green)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Auto-fill {unfilledCount} unfilled slot{unfilledCount > 1 ? 's' : ''}?
              </div>
              <div style={{ opacity: 0.8, marginBottom: 8 }}>
                Suggests crew members based on role, level, and availability.
              </div>
              <button onClick={onAutoFill}>Run suggestion</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================
// TAB: CREW
// =============================================================
function CrewTab({
  job,
  editingSlot,
  setEditingSlot,
  assignSlot,
  onAutoFill,
  truckLabel,
  truckCapacity,
}: {
  job: Job;
  editingSlot: string | null;
  setEditingSlot: (id: string | null) => void;
  assignSlot: (slotId: string, personId: string) => void;
  onAutoFill: () => void;
  truckLabel: string | null;
  truckCapacity: string | undefined;
}) {
  const people = useStore((s) => s.people);

  const suggestions = useMemo(() => {
    return suggestAssignments(job, people)
      .filter((s) => s.suggested && s.assignedTo)
      .reduce<Record<string, string>>((acc, s) => {
        if (s.assignedTo) acc[s.id] = s.assignedTo;
        return acc;
      }, {});
  }, [job, people]);

  return (
    <>
      <div className="drawer-section">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="drawer-section-title" style={{ margin: 0 }}>
            <Icon name="users" size={14} /> Crew composition
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-outline btn-sm" onClick={onAutoFill}>
              <Icon name="sparkle" size={12} /> Auto-fill
            </button>
          </div>
        </div>

        {job.slots.length === 0 && (
          <div className="muted small">No required slots for this job type.</div>
        )}

        {job.slots.map((slot) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            isEditing={editingSlot === slot.id}
            startEdit={() => setEditingSlot(slot.id)}
            onAssign={(id) => assignSlot(slot.id, id)}
            suggestionId={suggestions[slot.id]}
          />
        ))}

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} disabled>
          <Icon name="plus" size={12} /> Add custom slot
        </button>
      </div>

      <div className="drawer-section">
        <div className="drawer-section-title">
          <Icon name="truck" size={14} /> Trucks &amp; resources
        </div>
        {truckLabel ? (
          <div className="slot-row">
            <div className="row-icon-bg">
              <Icon name="truck" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{truckLabel}</div>
              {truckCapacity && <div className="role-meta">{truckCapacity}</div>}
            </div>
            <button className="role-pick" type="button">
              Swap
            </button>
          </div>
        ) : (
          <div className="muted small">No truck assigned</div>
        )}
      </div>
    </>
  );
}

function SlotRow({
  slot,
  isEditing,
  startEdit,
  onAssign,
  suggestionId,
}: {
  slot: JobSlot;
  isEditing: boolean;
  startEdit: () => void;
  onAssign: (personId: string) => void;
  suggestionId: string | undefined;
}) {
  const people = useStore((s) => s.people);
  const person = getPerson(people, slot.assignedTo);
  const suggested = !person && suggestionId ? getPerson(people, suggestionId) : null;
  const eligible = useMemo(
    () => people.filter((p) => p.roles.includes(slot.role)),
    [people, slot.role],
  );

  const unfilled = !person && !slot.optional;

  return (
    <div className={'slot-row' + (unfilled ? ' unfilled' : '')}>
      {person ? (
        <Avatar person={person} />
      ) : (
        <div
          className="avatar"
          style={{
            background: 'transparent',
            border: '1.5px dashed var(--border-strong)',
            color: 'var(--fg-subtle)',
          }}
        >
          ?
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {person ? person.name : 'Unassigned'}{' '}
          {slot.optional && <span className="muted small">(optional)</span>}
        </div>
        <div className="role-meta">
          <span>
            {roleLabel(slot.role)} · {slot.level}
          </span>
          <span>·</span>
          <span className="role-time">
            {slot.start === 0 ? 'Start' : `+${slot.start}h`} → {hoursToStr(slot.hours)}
          </span>
        </div>
        {suggested && !person && (
          <div className="row small" style={{ marginTop: 4, gap: 6 }}>
            <span className="reason-chip good">
              <Icon name="sparkle" size={10} /> Suggested: {suggested.name}
            </span>
            <button
              type="button"
              className="role-pick"
              onClick={() => onAssign(suggested.id)}
              style={{ fontSize: 11 }}
            >
              Use
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        <select
          className="select"
          style={{ width: 180 }}
          defaultValue={slot.assignedTo ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onAssign(e.target.value)}
          autoFocus
        >
          <option value="">— Unassigned —</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.level})
            </option>
          ))}
        </select>
      ) : (
        <button type="button" className="role-pick" onClick={startEdit}>
          {person ? 'Swap' : 'Assign'}
        </button>
      )}
    </div>
  );
}

// =============================================================
// TAB: TIMELINE
// =============================================================
function TimelineTab({
  job,
  crewName,
  onAdvance,
}: {
  job: Job;
  crewName: string | undefined;
  onAdvance: (next: JobStatus) => void;
}) {
  interface Step {
    key: JobStatus;
    label: string;
    sub: string;
    done: boolean;
    time: string;
  }
  const startHour = job.startHour ?? 8;
  const steps: Step[] = [
    {
      key: 'scheduled',
      label: 'Dispatched',
      sub: crewName ? `${crewName} notified` : 'Crew notified',
      done: job.status !== 'unscheduled',
      time: '7:30a',
    },
    {
      key: 'enroute',
      label: 'En route',
      sub: 'Truck departed yard',
      done: ['enroute', 'onsite', 'complete'].includes(job.status),
      time: '7:45a',
    },
    {
      key: 'onsite',
      label: 'On site',
      sub: `Arrival window ${fmtTime(startHour)}–${fmtTime(startHour + 0.5)}`,
      done: ['onsite', 'complete'].includes(job.status),
      time: fmtTime(startHour),
    },
    {
      key: 'complete',
      label: 'Complete',
      sub: 'Customer sign-off',
      done: job.status === 'complete',
      time: fmtTime(startHour + job.durationHrs),
    },
  ];

  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="drawer-section">
      <div className="drawer-section-title">
        <Icon name="clock" size={14} /> Day timeline
      </div>
      <div
        style={{
          position: 'relative',
          padding: '12px 0',
          borderLeft: '2px solid var(--border)',
          marginLeft: 4,
        }}
      >
        {steps.map((step) => (
          <div
            key={step.key}
            style={{ position: 'relative', marginLeft: 20, marginBottom: 18 }}
          >
            <div
              style={{
                position: 'absolute',
                left: -28,
                top: 4,
                width: 12,
                height: 12,
                borderRadius: 6,
                background: step.done ? 'var(--jetson-green)' : 'var(--surface-card)',
                border:
                  '2px solid ' +
                  (step.done ? 'var(--jetson-green)' : 'var(--border-strong)'),
              }}
            ></div>
            <div className="mono small muted">{step.time}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{step.label}</div>
            <div className="muted small">{step.sub}</div>
          </div>
        ))}
      </div>
      {nextStep && job.status !== 'unscheduled' && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onAdvance(nextStep.key)}
        >
          <Icon name="arrow_right" size={12} /> Mark as {nextStep.label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

// =============================================================
// TAB: CUSTOMER
// =============================================================
function CustomerTab({ job }: { job: Job }) {
  const customers = useStore((s) => s.customers);
  const customer = getCustomer(customers, job.customer);
  if (!customer) {
    return (
      <div className="drawer-section">
        <div className="muted small">No customer linked to this job.</div>
      </div>
    );
  }
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">
        <Icon name="user" size={14} /> Customer
        <span
          className="badge"
          style={{
            marginLeft: 8,
            background: 'rgba(255,122,89,0.15)',
            color: '#9F3D24',
          }}
        >
          <Icon name="hubspot" size={10} /> HubSpot synced
        </span>
      </div>
      <dl className="kv-list">
        <dt>Name</dt>
        <dd>{customer.name}</dd>
        <dt>Address</dt>
        <dd>{customer.address}</dd>
        <dt>Phone</dt>
        <dd>
          <a href={`tel:${customer.phone}`} style={{ color: 'inherit' }}>
            {customer.phone}
          </a>
        </dd>
        <dt>HubSpot ID</dt>
        <dd className="mono">{customer.hubspot}</dd>
        {job.hubspotDealId && (
          <>
            <dt>Deal</dt>
            <dd className="mono">{job.hubspotDealId}</dd>
          </>
        )}
      </dl>
      <div className="map-stub" style={{ marginTop: 12, height: 160, position: 'relative' }}>
        <div className="map-pin" style={{ top: '60%', left: '50%' }}>
          <div className="pin-dot">
            <Icon name="home" size={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// TAB: COMPLETION FORM (read-only)
// =============================================================
function CompletionTab({
  job,
  sections,
  responses,
}: {
  job: Job;
  sections: ChecklistSection[] | undefined;
  responses: Record<string, ChecklistResponseValue> | undefined;
}) {
  if (job.status !== 'complete') {
    return (
      <div className="empty" style={{ padding: 24, textAlign: 'center' }}>
        <div className="empty-icon">
          <Icon name="info" size={28} stroke="var(--mid-gray)" />
        </div>
        <div className="h4" style={{ fontWeight: 700, marginTop: 8 }}>
          Form not yet submitted
        </div>
        <div className="muted small">
          The tech completes this form on site when the job wraps up.
        </div>
      </div>
    );
  }
  if (!sections || sections.length === 0) {
    return (
      <div className="empty" style={{ padding: 24, textAlign: 'center' }}>
        <div className="muted small">No completion form defined for this job type.</div>
      </div>
    );
  }
  const responseMap = responses ?? {};
  const progress = checklistProgress(sections, responseMap);
  return (
    <>
      <div className="form-summary">
        <div className="form-summary-row">
          <div
            className="row-icon-bg"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--jetson-green)',
              color: 'var(--forest)',
            }}
          >
            <Icon name="check" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Completion form</div>
            <div className="muted small">
              {progress.requiredDone}/{progress.requiredItems} required ·{' '}
              {progress.totalDone}/{progress.totalItems} total
            </div>
          </div>
          <span className="badge badge-onsite">
            <Icon name="check" size={11} /> Submitted
          </span>
        </div>
        <div className="form-progress">
          <div className="form-progress-track">
            <div
              className="form-progress-fill"
              style={{
                width:
                  (progress.totalItems === 0
                    ? 0
                    : (progress.totalDone / progress.totalItems) * 100) + '%',
              }}
            ></div>
          </div>
          <div className="muted small">
            {progress.totalDone}/{progress.totalItems}
          </div>
        </div>
      </div>

      {sections.map((sec) => {
        const sectionDone = sec.items.every(
          (it) => !it.required || isItemAnswered(it, responseMap[it.id]),
        );
        const doneCount = sec.items.filter((it) =>
          isItemAnswered(it, responseMap[it.id]),
        ).length;
        return (
          <div key={sec.section} className="form-section">
            <div className="form-section-header">
              <div className="form-section-title">
                <div className={'form-section-tick' + (sectionDone ? ' done' : '')}>
                  {sectionDone ? <Icon name="check" size={12} /> : ''}
                </div>
                {sec.section}
              </div>
              <span className="muted small">
                {doneCount}/{sec.items.length}
              </span>
            </div>
            <div className="form-fields">
              {sec.items.map((item) => (
                <FormFieldDisplay
                  key={item.id}
                  item={item}
                  response={responseMap[item.id]}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function FormFieldDisplay({
  item,
  response,
}: {
  item: ChecklistItem;
  response: ChecklistResponseValue | undefined;
}) {
  const answered = isItemAnswered(item, response);
  const tickStatus: 'done' | 'partial' | 'empty' = answered ? 'done' : 'empty';
  return (
    <div className="form-field-display">
      <div className="form-field-label">
        <div className={'form-field-tick ' + tickStatus}>
          {answered && <Icon name="check" size={11} />}
        </div>
        <span>{item.label}</span>
        {item.required && (
          <span className="muted small" style={{ marginLeft: 4 }}>
            · required
          </span>
        )}
      </div>
      <div className="form-field-answer">
        {answered ? renderAnswer(item, response) : (
          <span className="muted small">— not answered —</span>
        )}
      </div>
    </div>
  );
}

function renderAnswer(item: ChecklistItem, response: ChecklistResponseValue | undefined) {
  switch (item.type) {
    case 'checkbox':
      return (
        <span
          className="row"
          style={{ color: '#1A6F2E', fontWeight: 600 }}
        >
          <Icon name="check" size={14} /> Yes
        </span>
      );
    case 'number': {
      const v = typeof response === 'number' ? response : 0;
      const unit = (item as { unit?: string }).unit;
      return (
        <span className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
          {v}
          {unit ? ' ' + unit : ''}
        </span>
      );
    }
    case 'text':
    case 'longtext':
      return (
        <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {typeof response === 'string' ? response : ''}
        </div>
      );
    case 'single':
      return <span className="pill">{typeof response === 'string' ? response : ''}</span>;
    case 'multi':
      return (
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          {(Array.isArray(response) ? response : []).map((v) => (
            <span key={v} className="pill" style={{ fontSize: 11 }}>
              {v}
            </span>
          ))}
        </div>
      );
    case 'photo': {
      const n =
        typeof response === 'number'
          ? response
          : Array.isArray(response)
          ? response.length
          : 0;
      const swatches: CSSProperties[] = [
        { background: 'linear-gradient(135deg, #FFB627 0%, #B95F1D 100%)' },
        { background: 'linear-gradient(135deg, #4FB3E8 0%, #2A6FDB 100%)' },
        { background: 'linear-gradient(135deg, #3CD567 0%, #1F8A5B 100%)' },
      ];
      return (
        <div>
          <div className="tech-photo-grid" style={{ marginBottom: 6 }}>
            {Array.from({ length: Math.min(n, 6) }).map((_, i) => (
              <div
                key={i}
                className="tech-photo"
                style={swatches[i % swatches.length]}
              >
                <span className="tech-photo-label">PHOTO</span>
              </div>
            ))}
          </div>
          <div className="row small">
            <Icon name="grid" size={12} stroke="var(--fg-muted)" />
            <span className="muted">
              {n} photo{n === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      );
    }
    case 'signature': {
      const sig = (response ?? {}) as { name?: string; when?: string };
      return (
        <div
          className="signature-display"
          style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 8,
          }}
        >
          <svg viewBox="0 0 200 60" style={{ width: '100%', height: 50 }}>
            <path
              d="M 5 40 Q 20 10 30 32 T 50 28 T 75 32 Q 90 38 110 25 T 140 30 Q 155 35 175 22 T 195 28"
              stroke="var(--forest)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <div
            className="row"
            style={{ justifyContent: 'space-between', marginTop: 4 }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>{sig.name ?? '—'}</span>
            <span className="mono small muted">{sig.when ?? ''}</span>
          </div>
        </div>
      );
    }
    case 'rating': {
      const r = typeof response === 'number' ? response : 0;
      return (
        <div className="row" style={{ gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              style={{
                fontSize: 18,
                color: i <= r ? 'var(--jt-electrical)' : 'var(--border-strong)',
              }}
            >
              *
            </span>
          ))}
          <span className="muted small" style={{ marginLeft: 6 }}>
            {r}/5
          </span>
        </div>
      );
    }
    default:
      return <span className="muted small">—</span>;
  }
}

// =============================================================
// TAB: NOTES (editable)
// =============================================================
function NotesTab({
  value,
  onChange,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">
        <Icon name="info" size={14} /> Notes
      </div>
      <textarea
        className="input"
        rows={8}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        style={{ width: '100%', resize: 'vertical' }}
        placeholder="Anything dispatch should know…"
      />
      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={onSave}>
          <Icon name="check" size={12} /> Save notes
        </button>
      </div>
    </div>
  );
}
