/* eslint-disable */
/* Job detail drawer + Job block (used in dispatch) */

const { useState, useMemo, useEffect, useRef } = React;

// =============================================================
// JOB BLOCK — appears in the calendar grid
// Supports: HTML5 drag between rows; pointer-based right-edge resize;
// conflict shake when overlapping siblings.
// =============================================================
function JobBlock({ job, colW, hourStart, density, onClick, selected, onResize, allRowJobs }) {
  if (job.startHour == null) return null;
  const jt = getJobType(job.type);
  const blockRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [previewHours, setPreviewHours] = useState(null);

  // Effective hours for rendering during a live resize
  const liveHours = previewHours != null ? previewHours : job.durationHrs;

  const left = (job.startHour - hourStart) * colW;
  const width = Math.max(60, liveHours * colW - 4);
  const endHour = job.startHour + liveHours;

  // Detect conflicts: any sibling job that overlaps this one's time window
  const hasConflict = (allRowJobs || []).some((other) => {
    if (other.id === job.id || other.startHour == null) return false;
    const otherEnd = other.startHour + other.durationHrs;
    return job.startHour < otherEnd && endHour > other.startHour;
  });

  const unfilled = job.slots.some((s) => !s.assignedTo && !s.optional);
  const customer = getCustomer(job.customer);
  const compact = density === 'compact' || width < 140;
  const visiblePeople = job.slots.filter((s) => s.assignedTo).slice(0, 4).map((s) => s.assignedTo);

  // ===== Pointer-based right-edge resize =====
  function onResizeStart(e) {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startHrs = job.durationHrs;
    const startStart = job.startHour;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dHrs = dx / colW;
      // snap to 15 min (0.25h)
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
          onResize && onResize(job.id, prev);
        }
        return null;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      ref={blockRef}
      className={
      "job-block " + jt.color + " " + job.status + (
      unfilled ? ' unfilled-warning' : '') + (
      selected ? ' selected' : '') + (
      compact ? ' compact' : '') + (
      dragging ? ' dragging' : '') + (
      resizing ? ' resizing' : '') + (
      hasConflict ? ' conflict' : '')
      }
      style={{ left: left + 'px', width: width + 'px' }}
      onClick={(e) => {if (!resizing) onClick(e);}}
      draggable={!resizing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/job-id', job.id);
        e.dataTransfer.effectAllowed = 'move';
        // Use a small offset image so the drag preview is positioned at the cursor
        setTimeout(() => setDragging(true), 0);
      }}
      onDragEnd={() => setDragging(false)}>
      
      <div className="job-block-header">
        <span className="jt-tag" style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 5px' }}>
          {jt.short}
        </span>
        <span className="mono" style={{ opacity: 0.7, fontSize: 10 }}>{job.id.replace('J-', '')}</span>
        {job.multidayGroupId &&
        <span className="multiday-chip" title={'Day ' + job.multidayIndex + ' of ' + job.multidayTotal}>
            <Icon name="refresh" size={9} stroke="currentColor" /> {job.multidayIndex}/{job.multidayTotal}
          </span>
        }
        {job.continuationOf &&
        <span className="multiday-chip continuation" title={'Continues ' + job.continuationOf}>
            <Icon name="refresh" size={9} stroke="currentColor" /> CONT.
          </span>
        }
      </div>
      <div className="job-block-title">
        {customer ? customer.name : job.address ? job.address.split('·')[0].trim() : 'Untitled'}
      </div>
      {!compact &&
      <div className="job-block-meta">
          <Icon name="clock" size={10} />
          <span>{fmtTime(job.startHour)} · {hoursToStr(liveHours)}</span>
        </div>
      }
      <div className="job-block-people" style={{ marginTop: 'auto' }}>
        {visiblePeople.map((id, i) =>
        <Avatar key={i} person={id} size="xs" color="rgba(255,255,255,0.85)" />
        )}
        {unfilled &&
        <span className="unfilled-pill" style={{ marginLeft: 6 }}>
            <Icon name="user" size={10} /> Unfilled
          </span>
        }
      </div>

      {/* Resize handle (right edge) */}
      <div
        className="job-block-resize"
        onPointerDown={onResizeStart}
        title="Drag to resize">
      </div>

      {/* Live resize tooltip */}
      {resizing && previewHours != null &&
      <div className="job-block-resize-tooltip">
          {hoursToStr(previewHours)} · ends {fmtTime(job.startHour + previewHours)}
        </div>
      }

      {/* Conflict warning badge */}
      {hasConflict &&
      <div className="conflict-badge" title="Overlaps another job in this row">
          <Icon name="info" size={10} /> Conflict
        </div>
      }
    </div>);

}

// =============================================================
// JOB DETAIL DRAWER
// =============================================================
function JobDetailDrawer({ job, onClose, onUpdate, onToast }) {
  const [tab, setTab] = useState('overview');
  const [slots, setSlots] = useState(job.slots);
  const [editingSlot, setEditingSlot] = useState(null);
  const [scheduleSlot, setScheduleSlot] = useState(null); // {crewId, dateKey, startHour} for unscheduled jobs
  const isUnscheduled = job.status === 'unscheduled';
  const customer = getCustomer(job.customer);
  const jt = getJobType(job.type);
  const crew = getCrew(job.crewId);
  const truck = getTruck(job.truckId);

  useEffect(() => {setSlots(job.slots);}, [job.id]);

  const unfilledCount = slots.filter((s) => !s.assignedTo && !s.optional).length;

  function autoFill() {
    const filled = suggestAssignments({ ...job, slots });
    setSlots(filled);
    onUpdate({ ...job, slots: filled });
    onToast && onToast('Auto-filled ' + filled.filter((s) => s.suggested).length + ' slots');
  }
  function assignSlot(slotId, personId) {
    const next = slots.map((s) => s.id === slotId ? { ...s, assignedTo: personId, suggested: false } : s);
    setSlots(next);
    onUpdate({ ...job, slots: next });
    setEditingSlot(null);
  }
  function removeSlot(slotId) {
    const next = slots.filter((s) => s.id !== slotId);
    setSlots(next);
    onUpdate({ ...job, slots: next });
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-header">
          <span className="mono small muted">{job.id}</span>
          <JobTypeTag type={job.type} size="lg" />
          <div className="topbar-spacer"></div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div style={{ padding: '14px 20px 0', background: 'var(--surface-card)' }}>
          <h2 className="page-title">{customer ? customer.name : job.address || 'Job'}</h2>
          <div className="row small muted" style={{ marginTop: 6 }}>
            <Icon name="map_pin" size={13} /> <span>{job.address}</span>
            {job.startHour != null && <>
              <span className="divider-v" style={{ height: 12 }}></span>
              <Icon name="clock" size={13} /> <span>{job.date} · {fmtTime(job.startHour)}–{fmtTime(job.startHour + job.durationHrs)}</span>
            </>}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <StatusBadge status={job.status} />
            {job.hubspotDealId && <span className="badge" style={{ background: 'rgba(255,122,89,0.15)', color: '#9F3D24' }}><Icon name="hubspot" size={11} /> {job.hubspotDealId}</span>}
            {unfilledCount > 0 && <span className="badge badge-callback">{unfilledCount} unfilled</span>}
          </div>
          {job.projectId && (() => {
            const proj = getProject(job.projectId);
            const meta = typeof PROJECT_STATUS_META !== 'undefined' ? PROJECT_STATUS_META[proj?.status] : null;
            if (!proj) return null;
            const siblings = jobsForProject(proj.id);
            const completed = siblings.filter((j) => j.status === 'complete').length;
            return (
              <div className="job-project-link" style={{ marginTop: 12, marginBottom: 0 }}
              onClick={() => onToast && onToast('Open project ' + proj.id)}>
                <div className="stripe" style={{ background: meta ? meta.color : 'var(--mid-gray)' }}></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="eyebrow">Part of project</div>
                  <div className="name">{proj.name}</div>
                  <div className="meta">{proj.id} · {completed}/{siblings.length} jobs · {projectStatusLabel(proj.status)}</div>
                </div>
                <Icon name="chevron_right" size={14} stroke="var(--mid-gray)" />
              </div>);

          })()}
        </div>

        <div className="drawer-tabs" style={{ marginTop: 16 }}>
          {['overview', 'crew', 'timeline', 'customer', 'completion', 'notes'].map((t) =>
          <button key={t} className={"drawer-tab " + (tab === t ? 'active' : '')} onClick={() => setTab(t)}>
              {t === 'completion' ? 'Completion form' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'completion' && getSubmission && getSubmission(job.id) &&
            <span className="badge badge-onsite" style={{ marginLeft: 6, fontSize: 9 }}>✓</span>
            }
            </button>
          )}
        </div>

        <div className="drawer-body">
          {/* UNSCHEDULED HERO — primary action is "get this scheduled" */}
          {isUnscheduled &&
          <div className="job-schedule-hero">
              <div className="job-schedule-hero-head">
                <div className="hero-icon"><Icon name="sparkle" size={18} stroke="var(--forest)" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hero-eyebrow">This job needs scheduling</div>
                  <div className="hero-title">Pick a crew and time</div>
                </div>
                {scheduleSlot &&
              <span className="badge" style={{ background: 'var(--jetson-green)', color: 'var(--forest)', fontWeight: 800 }}>
                    Slot selected
                  </span>
              }
              </div>

              <div className="job-schedule-hero-summary">
                <div>
                  <div className="k">Type</div>
                  <div className="v"><JobTypeTag type={job.type} /> <span style={{ marginLeft: 4 }}>{jt.label}</span></div>
                </div>
                <div>
                  <div className="k">Needs</div>
                  <div className="v" style={{ fontFamily: 'var(--font-mono)' }}>
                    {Math.round(Math.max(...slots.map((s) => (s.start || 0) + s.hours), 1))}h · {slots.filter((s) => !s.optional).length} role{slots.filter((s) => !s.optional).length === 1 ? '' : 's'}
                  </div>
                </div>
                {job.price &&
              <div>
                    <div className="k">Value</div>
                    <div className="v">${job.price.toLocaleString()}</div>
                  </div>
              }
              </div>

              <SuggestTimePicker
              job={{ type: job.type, slots, customer: job.customer, address: job.address }}
              defaultDate={addDays(TODAY, 1)}
              value={scheduleSlot}
              onChange={setScheduleSlot}
              height={400} />
            

              {scheduleSlot &&
            <div className="job-schedule-hero-selected">
                  <Icon name="check" size={14} stroke="var(--jetson-green)" strokeWidth={2.5} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {getCrew(scheduleSlot.crewId)?.name} · {fmtDate(new Date(scheduleSlot.dateKey + 'T12:00:00'), { weekday: 'short', month: 'short', day: 'numeric' })} at {fmtTime(scheduleSlot.startHour)}
                    </div>
                    <div className="muted small">
                      {getTruck(getCrew(scheduleSlot.crewId)?.truck)?.name || 'No truck assigned'} · ends {fmtTime(scheduleSlot.startHour + Math.max(...slots.map((s) => (s.start || 0) + s.hours), 1))}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setScheduleSlot(null)}>Clear</button>
                </div>
            }
            </div>
          }

          {tab === 'overview' &&
          <>
              <div className="drawer-section">
                <div className="drawer-section-title"><Icon name="briefcase" size={14} /> Job summary</div>
                <dl className="kv-list" data-comment-anchor="a6751126b5-dl-312-17">
                  <dt>Type</dt><dd>{jt.label}</dd>
                  <dt>Status</dt><dd><StatusBadge status={job.status} /></dd>
                  <dt>Date</dt><dd>{job.date || '—'}</dd>
                  <dt>Window</dt><dd>{job.startHour != null ? fmtTime(job.startHour) + '–' + fmtTime(job.startHour + job.durationHrs) : 'Unscheduled'}</dd>
                  <dt>Address</dt><dd>{job.address}</dd>
                  <dt>Crew</dt><dd>{crew ? crew.name : '—'}</dd>
                  <dt>Truck</dt><dd>{truck ? truck.name + ' · ' + truck.plate : '—'}</dd>
                  {job.driveTimeMin && <><dt>Drive time</dt><dd>{job.driveTimeMin} min from prior job</dd></>}
                </dl>
              </div>
              {job.notes &&
            <div className="drawer-section">
                  <div className="drawer-section-title"><Icon name="info" size={14} /> Notes</div>
                  <p style={{ margin: 0, fontSize: 13 }}>{job.notes}</p>
                </div>
            }
              <div className="drawer-section">
                <div className="drawer-section-title">
                  <Icon name="map_pin" size={14} /> Location
                  <span className="muted small" style={{ marginLeft: 'auto', fontWeight: 400 }}>{job.driveTimeMin ? job.driveTimeMin + ' min from prior stop' : ''}</span>
                </div>
                <div className="map-stub" style={{ height: 200 }}>
                  <div className="map-pin" style={{ top: '58%', left: '52%' }}>
                    <div className="pin-dot" style={{ background: 'var(--jetson-green)', color: 'var(--forest)' }}>
                      <Icon name="home" size={12} />
                    </div>
                  </div>
                  {/* faux route from prior job */}
                  <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M 12 80 Q 30 50 52 58" fill="none" stroke="var(--forest)" strokeWidth="0.8" strokeDasharray="2 1.2" strokeOpacity="0.6" />
                  </svg>
                  <div style={{ position: 'absolute', left: 8, top: 8, background: 'var(--surface-card)', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>
                    {job.address}
                  </div>
                  <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 4 }}>
                    <button className="btn btn-outline btn-sm" style={{ background: 'var(--surface-card)' }}>
                      <Icon name="map_pin" size={11} /> Open in Maps
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ background: 'var(--surface-card)' }}>
                      <Icon name="expand" size={11} /> Full map
                    </button>
                  </div>
                </div>
              </div>
              {unfilledCount > 0 &&
            <div className="drawer-section">
                  <div className="suggest-card">
                    <Icon name="sparkle" size={16} className="sparkle" stroke="var(--jetson-green)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Auto-fill {unfilledCount} unfilled slot{unfilledCount > 1 ? 's' : ''}?</div>
                      <div style={{ opacity: 0.8, marginBottom: 8 }}>Suggests crew based on role, level, and availability.</div>
                      <button onClick={autoFill}>Run suggestion</button>
                    </div>
                  </div>
                </div>
            }
            </>
          }

          {tab === 'crew' &&
          <>
              <div className="drawer-section">
                <div className="row" style={{ marginBottom: 10 }}>
                  <div className="drawer-section-title" style={{ margin: 0 }}>
                    <Icon name="users" size={14} /> Crew composition
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-outline btn-sm" onClick={autoFill}>
                      <Icon name="sparkle" size={12} /> Auto-fill
                    </button>
                  </div>
                </div>
                {slots.length === 0 && <div className="muted small">No required slots for this job type.</div>}
                {slots.map((slot) => {
                const role = ROLES[slot.role];
                const person = slot.assignedTo ? getPerson(slot.assignedTo) : null;
                return (
                  <div key={slot.id} className={"slot-row" + (!person && !slot.optional ? ' unfilled' : '')}>
                      {person ? <Avatar person={person} /> : <div className="avatar" style={{ background: 'transparent', border: '1.5px dashed var(--border-strong)', color: 'var(--fg-subtle)' }}>?</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {person ? person.name : 'Unassigned'} {slot.optional && <span className="muted small">(optional)</span>}
                        </div>
                        <div className="role-meta">
                          <span>{role.label} · {slot.level}</span>
                          <span>·</span>
                          <span className="role-time">
                            {slot.start === 0 ? 'Start' : '+' + slot.start + 'h'} → {hoursToStr(slot.hours)}
                          </span>
                        </div>
                      </div>
                      {editingSlot === slot.id ?
                    <select className="select" style={{ width: 160 }} onChange={(e) => assignSlot(slot.id, e.target.value)} defaultValue={slot.assignedTo || ''}>
                          <option value="">— Unassigned —</option>
                          {PEOPLE.filter((p) => p.roles.includes(slot.role)).map((p) =>
                      <option key={p.id} value={p.id}>{p.name} ({p.level})</option>
                      )}
                        </select> :

                    <button className="role-pick" onClick={() => setEditingSlot(slot.id)}>
                          {person ? 'Swap' : 'Assign'}
                        </button>
                    }
                    </div>);

              })}
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                  <Icon name="plus" size={12} /> Add custom slot
                </button>
              </div>
              <div className="drawer-section">
                <div className="drawer-section-title"><Icon name="truck" size={14} /> Trucks & resources</div>
                {truck ?
              <div className="slot-row">
                    <div className="row-icon-bg"><Icon name="truck" size={16} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{truck.name} · <span className="mono small muted">{truck.plate}</span></div>
                      <div className="role-meta">{truck.capacity}</div>
                    </div>
                    <button className="role-pick">Swap</button>
                  </div> :

              <div className="muted small">No truck assigned</div>
              }
              </div>
            </>
          }

          {tab === 'timeline' &&
          <>
              <div className="drawer-section">
                <div className="drawer-section-title"><Icon name="clock" size={14} /> Day timeline</div>
                <div style={{ position: 'relative', padding: '12px 0', borderLeft: '2px solid var(--border)', marginLeft: 4 }}>
                  {[
                { time: '7:30a', label: 'Dispatched', sub: crew ? crew.name + ' notified' : '—', done: true },
                { time: '7:45a', label: 'En route', sub: 'Truck departed yard', done: ['enroute', 'onsite', 'complete'].includes(job.status) },
                { time: fmtTime(job.startHour || 8), label: 'On site', sub: 'Arrival window 8:00–8:30a', done: ['onsite', 'complete'].includes(job.status) },
                { time: '12:30p', label: 'Lunch break', sub: '30 min', done: false },
                { time: fmtTime((job.startHour || 8) + (job.durationHrs || 0)), label: 'Complete', sub: 'Customer sign-off', done: job.status === 'complete' }].
                map((step, i) =>
                <div key={i} style={{ position: 'relative', marginLeft: 20, marginBottom: 18 }}>
                      <div style={{ position: 'absolute', left: -28, top: 4, width: 12, height: 12, borderRadius: 6,
                    background: step.done ? 'var(--jetson-green)' : 'var(--surface-card)',
                    border: '2px solid ' + (step.done ? 'var(--jetson-green)' : 'var(--border-strong)') }}></div>
                      <div className="mono small muted">{step.time}</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{step.label}</div>
                      <div className="muted small">{step.sub}</div>
                    </div>
                )}
                </div>
              </div>
            </>
          }

          {tab === 'customer' && customer &&
          <>
              <div className="drawer-section">
                <div className="drawer-section-title">
                  <Icon name="user" size={14} /> Customer
                  <span className="badge" style={{ marginLeft: 8, background: 'rgba(255,122,89,0.15)', color: '#9F3D24' }}>
                    <Icon name="hubspot" size={10} /> HubSpot synced
                  </span>
                </div>
                <dl className="kv-list">
                  <dt>Name</dt><dd>{customer.name}</dd>
                  <dt>Address</dt><dd>{customer.address}</dd>
                  <dt>Phone</dt><dd>{customer.phone}</dd>
                  <dt>HubSpot ID</dt><dd className="mono">{customer.hubspot}</dd>
                  {job.hubspotDealId && <><dt>Deal</dt><dd className="mono">{job.hubspotDealId}</dd></>}
                </dl>
                <div className="map-stub" style={{ marginTop: 12 }}>
                  <div className="map-pin" style={{ top: '60%', left: '50%' }}>
                    <div className="pin-dot"><Icon name="home" size={12} /></div>
                  </div>
                </div>
              </div>
            </>
          }

          {tab === 'completion' &&
          <CompletedFormView jobId={job.id} />
          }

          {tab === 'notes' &&
          <div className="drawer-section">
              <div className="drawer-section-title"><Icon name="info" size={14} /> Notes</div>
              <textarea className="input" rows={6} defaultValue={job.notes} style={{ width: '100%', resize: 'vertical' }} />
            </div>
          }
        </div>

        <div className="drawer-footer">
          {isUnscheduled ?
          <>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
              <span className="muted small" style={{ marginLeft: 6 }}>
                {scheduleSlot ? 'Ready to schedule' : 'Pick a green cell above to continue'}
              </span>
              <div className="topbar-spacer"></div>
              <button className="btn btn-outline btn-sm" disabled style={{ opacity: 0.5 }}>
                <Icon name="user" size={12} /> Defer
              </button>
              <button
              className="btn btn-primary btn-sm"
              disabled={!scheduleSlot}
              style={{ opacity: scheduleSlot ? 1 : 0.4 }}
              onClick={() => {
                if (!scheduleSlot) return;
                const crew = getCrew(scheduleSlot.crewId);
                const filledSlots = slots.map((s) => {
                  if (s.assignedTo) return s;
                  const m = crew?.members.map(getPerson).find((p) => p && p.roles.includes(s.role)) || PEOPLE.find((p) => p.roles.includes(s.role));
                  return { ...s, assignedTo: m?.id || null };
                });
                const updated = {
                  ...job,
                  status: 'scheduled',
                  date: scheduleSlot.dateKey,
                  startHour: scheduleSlot.startHour,
                  crewId: scheduleSlot.crewId,
                  truckId: crew?.truck || job.truckId,
                  slots: filledSlots,
                  durationHrs: Math.max(...filledSlots.map((s) => (s.start || 0) + s.hours), 1)
                };
                onUpdate && onUpdate(updated);
                onToast && onToast('Scheduled ' + job.id + ' · ' + (crew?.name || '') + ' on ' + scheduleSlot.dateKey + ' at ' + fmtTime(scheduleSlot.startHour));
                onClose && onClose();
              }}>
                <Icon name="check" size={12} /> Schedule it
              </button>
            </> :

          <>
              <button className="btn btn-outline btn-sm">View on map</button>
              <div className="topbar-spacer"></div>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm">Save changes</button>
            </>
          }
        </div>
      </div>
    </>);

}

Object.assign(window, { JobBlock, JobDetailDrawer });