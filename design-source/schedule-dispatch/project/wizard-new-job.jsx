/* eslint-disable */
/* New Job wizard + Smart-schedule modal
   4-step flow: Customer → Job type (with custom template builder) → When & who → Review */

const { useState: useSM, useMemo: useMM, useEffect: useEM } = React;

// =============================================================
// NEW JOB WIZARD
// =============================================================
function NewJobWizard({ onClose, onCreate, onToast, initial }) {
  const [step, setStep] = useSM(initial?.step || 0);
  const [type, setType] = useSM(initial?.type || null);
  const [customer, setCustomer] = useSM(initial?.customer || null);
  const [slot, setSlot] = useSM(null);                 // { crewId, dateKey, startHour, endHour, endDateKey, daysSpanned } from picker
  const [extraCrews, setExtraCrews] = useSM([]);
  const [vehicle, setVehicle] = useSM({ mode: 'fleet', personalDriverId: null }); // mode: 'fleet' | 'personal' | 'none'
  const [customerQuery, setCustomerQuery] = useSM('');
  const [templateDraft, setTemplateDraft] = useSM(null); // null | { label, short, color, slots[] }
  const [tick, setTick] = useSM(0);                     // bump after saving custom template

  // Slot rows derived from the active template (built-in or custom)
  const tplSlots = useMM(() => {
    if (!type) return [];
    return (JOB_TEMPLATES[type]?.slots || []).map((s, i) => ({ ...s, id: 'new-s'+i, assignedTo: null }));
  }, [type, tick]);

  const filteredCustomers = customerQuery
    ? CUSTOMERS.filter(c => (c.name + ' ' + c.address).toLowerCase().includes(customerQuery.toLowerCase()))
    : CUSTOMERS.slice(0, 5);

  const STEPS = ['Customer', 'Job type', 'When & who', 'Review'];

  function next() { setStep(s => Math.min(STEPS.length - 1, s + 1)); }
  function back() { setStep(s => Math.max(0, s - 1)); }

  function canAdvance() {
    if (step === 0) return !!customer;
    if (step === 1) return !!type && !templateDraft;
    if (step === 2) return !!slot;
    return true;
  }

  // ─── Custom template handlers ───────────────────────────────
  function startCustomTemplate() {
    setTemplateDraft({
      label: '',
      short: '',
      color: 'jt-retrofit',
      slots: [{ role: 'hvac_lead', level: 'L2', hours: 4, start: 0, optional: false }],
    });
  }
  function saveCustomTemplate() {
    if (!templateDraft?.label || templateDraft.slots.length === 0) return;
    const id = 'custom_' + Date.now().toString(36);
    const short = templateDraft.short.trim() || templateDraft.label.split(' ').slice(0, 2).join(' ');
    // Mutate globals so downstream readers (picker, suggestion engine, calendar) see it
    window.JOB_TYPES[id] = { label: templateDraft.label, color: templateDraft.color, short };
    window.JOB_TEMPLATES[id] = {
      label: templateDraft.label,
      slots: templateDraft.slots.map(s => ({ ...s })),
      truckCount: 1,
      custom: true,
    };
    setType(id);
    setTemplateDraft(null);
    setTick(t => t + 1);
    onToast && onToast('Saved template · ' + templateDraft.label);
  }

  // ─── Commit ─────────────────────────────────────────────────
  function commit() {
    const filledSlots = tplSlots.map(s => ({ ...s }));
    if (slot?.crewId) {
      const crew = getCrew(slot.crewId);
      filledSlots.forEach(s => {
        if (s.assignedTo) return;
        const member = crew?.members.map(getPerson).find(p => p && p.roles.includes(s.role));
        if (member) s.assignedTo = member.id;
        else {
          const fallback = PEOPLE.find(p => p.roles.includes(s.role));
          if (fallback) s.assignedTo = fallback.id;
        }
      });
    }
    const crew = getCrew(slot.crewId);
    const truckId = vehicle.mode === 'fleet' ? (crew?.truck || null) : null;
    const newJob = {
      id: 'J-' + (2700 + Math.floor(Math.random() * 99)),
      type,
      status: 'scheduled',
      customer: customer.id,
      address: customer.address,
      date: slot.dateKey,
      startHour: slot.startHour,
      durationHrs: slot.daysSpanned > 1
        ? Math.max(...filledSlots.map(s => (s.start||0) + s.hours), 1)
        : (slot.endHour - slot.startHour),
      endDate: slot.endDateKey,
      endHour: slot.endHour,
      daysSpanned: slot.daysSpanned || 1,
      crewId: slot.crewId,
      extraCrewIds: extraCrews,
      truckId,
      vehicleMode: vehicle.mode,
      personalDriverId: vehicle.mode === 'personal' ? vehicle.personalDriverId : null,
      allowConflicts: !!slot.allowConflicts,
      slots: filledSlots,
      hubspotDealId: 'DEAL-' + (44300 + Math.floor(Math.random() * 99)),
      notes: '',
      driveTimeMin: 18,
    };
    onCreate(newJob);
    const whenStr = (slot.daysSpanned > 1)
      ? slot.dateKey + ' → ' + slot.endDateKey
      : slot.dateKey + ' at ' + fmtTime(slot.startHour);
    onToast && onToast('Job ' + newJob.id + ' scheduled · ' + whenStr);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 920, maxWidth: '96vw' }}>
        <div className="modal-header">
          <div className="row-icon-bg"><Icon name="briefcase" size={16} /></div>
          <div>
            <div className="eyebrow-sm">New job</div>
            <div className="h4" style={{ fontSize: 18 }}>Schedule a new job</div>
          </div>
          <div className="topbar-spacer"></div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="wiz-steps">
          {STEPS.map((label, i) => {
            const canJump = i < step; // only allow jumping back to completed steps
            return (
              <button
                key={i}
                type="button"
                className={"wiz-step" + (step === i ? ' active' : step > i ? ' done' : '') + (canJump ? ' clickable' : '')}
                onClick={() => canJump && setStep(i)}
                disabled={!canJump && step !== i}
                aria-current={step === i ? 'step' : undefined}>
                <span className="wiz-step-num">{step > i ? '✓' : i + 1}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="modal-body">
          {/* STEP 0: Customer */}
          {step === 0 && (
            <>
              <label className="label">Search HubSpot</label>
              <div className="search" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', width: '100%', marginBottom: 14 }}>
                <Icon name="search" size={14} />
                <input placeholder="Search contacts by name or address…" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} autoFocus />
                <span className="badge" style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24' }}>
                  <Icon name="hubspot" size={10} /> HubSpot
                </span>
              </div>
              <div className="col" style={{ gap: 6 }}>
                {filteredCustomers.map(c => (
                  <div key={c.id} className={"lookup-row" + (customer?.id === c.id ? ' selected' : '')} onClick={() => setCustomer(c)}>
                    <Avatar person={{ initials: c.name.split(' ').map(s=>s[0]).slice(0,2).join(''), name: c.name }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="muted small">{c.address} · {c.phone}</div>
                    </div>
                    <span className="badge" style={{ background: 'rgba(255,122,89,0.1)', color:'#9F3D24' }}>
                      <Icon name="hubspot" size={10} /> {c.hubspot}
                    </span>
                  </div>
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }}>
                <Icon name="plus" size={12} /> Create new contact in HubSpot
              </button>
            </>
          )}

          {/* STEP 1: Job type — built-in + custom templates + inline editor */}
          {step === 1 && (
            <>
              {!templateDraft && (
                <div className="wiz-section-head">
                  <div>
                    <div className="eyebrow-sm">Job type</div>
                    <div className="muted small">Pick a template — its required roles drive availability suggestions next.</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={startCustomTemplate}>
                    <Icon name="plus" size={12} /> New template
                  </button>
                </div>
              )}

              {!templateDraft && (
                <div className="wiz-type-grid">
                  {Object.entries(JOB_TYPES).map(([k, jt]) => {
                    const slotCount = JOB_TEMPLATES[k]?.slots.length || 0;
                    const duration = Math.max(...(JOB_TEMPLATES[k]?.slots || []).map(s => (s.start||0) + s.hours), 1);
                    const isSelected = type === k;
                    return (
                      <button key={k} className={"wiz-type-card" + (isSelected ? ' selected' : '')}
                        onClick={() => setType(k)}>
                        <span className="wiz-type-swatch" style={{ background: 'var(--' + jt.color + ')' }}></span>
                        <span className="wiz-type-name">{jt.label}</span>
                        <span className="wiz-type-meta">
                          <Icon name="clock" size={10} />
                          <span>{duration}h <span className="wiz-type-meta-sep">·</span> {slotCount} role{slotCount !== 1 ? 's' : ''}</span>
                        </span>
                        {JOB_TEMPLATES[k]?.custom && <span className="wiz-type-badge">CUSTOM</span>}
                        {isSelected && <span className="wiz-type-check"><Icon name="check" size={11} stroke="var(--off-white)" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* TEMPLATE EDITOR */}
              {templateDraft && (
                <TemplateEditor
                  draft={templateDraft}
                  onChange={setTemplateDraft}
                  onSave={saveCustomTemplate}
                  onCancel={() => setTemplateDraft(null)}
                />
              )}

              {/* TEMPLATE PREVIEW for selected type */}
              {type && !templateDraft && (
                <div className="wiz-type-preview">
                  <div className="row" style={{ marginBottom: 10 }}>
                    <JobTypeTag type={type} size="lg" />
                    <h4 style={{ fontFamily: 'var(--font-subhead)', fontSize: 14 }}>{JOB_TEMPLATES[type].label}</h4>
                    {JOB_TEMPLATES[type].custom && <span className="badge" style={{ background:'rgba(60,213,103,0.18)', color:'#1A6F2E' }}>Just created</span>}
                    <span className="muted small" style={{ marginLeft: 'auto' }}>{tplSlots.length} required slot{tplSlots.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="wiz-type-preview-slots">
                    {tplSlots.map((slot, i) => {
                      const role = ROLES[slot.role];
                      return (
                        <div key={i} className="wiz-type-preview-slot">
                          <span className="wiz-type-preview-slot-num">{i+1}</span>
                          <span style={{ fontWeight: 600 }}>{role.label}</span>
                          <span className="tag">{slot.level}</span>
                          <span className="muted small" style={{ marginLeft: 'auto' }}>{slot.hours}h{slot.start > 0 ? ' from +' + slot.start + 'h' : ''}{slot.optional ? ' · opt' : ''}</span>
                        </div>
                      );
                    })}
                    {tplSlots.length === 0 && <div className="muted small" style={{ padding: 8 }}>Ad-hoc — composition decided at scheduling.</div>}
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 2: When & who — embedded Suggest-a-Time picker */}
          {step === 2 && (
            <>
              <div className="wiz-section-head">
                <div>
                  <div className="row" style={{ gap: 6 }}>
                    <Icon name="sparkle" size={14} stroke="var(--jetson-green)" />
                    <div className="eyebrow-sm" style={{ marginBottom: 0 }}>Suggested times</div>
                  </div>
                  <div className="muted small">
                    For <strong style={{ color: 'var(--fg)' }}>{JOB_TYPES[type]?.label}</strong> · {Math.round(Math.max(...tplSlots.map(s => (s.start||0) + s.hours), 1))}h · {tplSlots.filter(s => !s.optional).length} required role{tplSlots.filter(s => !s.optional).length === 1 ? '' : 's'}
                  </div>
                </div>
                <JobTypeTag type={type} size="lg" />
              </div>
              <SuggestTimePicker
                job={{
                  type,
                  slots: tplSlots,
                  customer: customer?.id,
                  address: customer?.address,
                }}
                defaultDate={addDays(TODAY, 1)}
                value={slot}
                onChange={setSlot}
                height={440}
              />
              {slot && (
                <div className="card" style={{ marginTop: 12, background: 'rgba(60,213,103,0.06)', borderColor: 'rgba(60,213,103,0.4)', padding: 12 }}>
                  <div className="row" style={{ flexWrap: 'wrap', rowGap: 6 }}>
                    <Icon name="check" size={14} stroke="var(--jetson-green)" />
                    <strong style={{ fontSize: 13 }}>Selected slot</strong>
                    <span className="muted small">·</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {getCrew(slot.crewId)?.name} · {fmtDate(new Date(slot.dateKey + 'T12:00:00'))}
                      {slot.daysSpanned > 1 ? (
                        <span> · {fmtTime(slot.startHour)} → {fmtDate(new Date(slot.endDateKey + 'T12:00:00'), { weekday: 'short' })} {fmtTime(slot.endHour)} <span className="suggest-slot-spandays">{slot.daysSpanned}-day</span></span>
                      ) : (
                        <span> · {fmtTime(slot.startHour)}<span style={{ opacity: 0.7 }}>–{fmtTime(slot.endHour)}</span></span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Vehicle selection — fleet truck / personal / none */}
              {slot && (
                <VehiclePicker
                  crew={getCrew(slot.crewId)}
                  members={(getCrew(slot.crewId)?.members || []).map(getPerson).filter(Boolean)}
                  value={vehicle}
                  onChange={setVehicle}
                />
              )}

              {/* Optional extra-crew slot for heat pumps (electrician handoff) */}
              {type === 'heatpump' && slot && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg-subtle)' }}>
                  <div className="row">
                    <Icon name="bolt" size={14} stroke="var(--jt-electrical)" />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Electrician handoff (3h, mid-job)</span>
                    <select className="select" style={{ marginLeft: 'auto', width: 220 }} value={extraCrews[0] || ''} onChange={e => setExtraCrews(e.target.value ? [e.target.value] : [])}>
                      <option value="">Auto-pick available</option>
                      {CREWS.filter(c => c.type === 'electrical').map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 3: Review */}
          {step === 3 && slot && (
            <>
              <div className="row" style={{ marginBottom: 14 }}>
                <JobTypeTag type={type} size="lg" />
                <h3 style={{ fontFamily: 'var(--font-subhead)', fontSize: 18 }}>{customer?.name}</h3>
              </div>
              <dl className="kv-list" style={{ marginBottom: 14 }}>
                <dt>Type</dt><dd>{JOB_TYPES[type].label}{JOB_TEMPLATES[type]?.custom && <span className="badge" style={{ marginLeft: 6, background:'var(--bg-muted)' }}>Custom</span>}</dd>
                <dt>Customer</dt><dd>{customer?.name}</dd>
                <dt>Address</dt><dd>{customer?.address}</dd>
                <dt>HubSpot</dt><dd className="mono small">{customer?.hubspot}</dd>
                <dt>Date</dt><dd>{fmtDate(new Date(slot.dateKey + 'T12:00:00'), { weekday:'long', month:'long', day:'numeric' })}{slot.daysSpanned > 1 && <> → {fmtDate(new Date(slot.endDateKey + 'T12:00:00'), { weekday:'long', month:'long', day:'numeric' })}</>}</dd>
                <dt>Time</dt><dd>{fmtTime(slot.startHour)} – {fmtTime(slot.endHour)} <span className="muted small">({slot.daysSpanned > 1 ? slot.daysSpanned + '-day span' : Math.round(slot.endHour - slot.startHour) + 'h'})</span></dd>
                <dt>Crew</dt><dd>{getCrew(slot.crewId)?.name}</dd>
                <dt>Vehicle</dt><dd>{
                  vehicle.mode === 'fleet' ? (getTruck(getCrew(slot.crewId)?.truck)?.name || 'No truck assigned')
                    : vehicle.mode === 'personal' ? <>Personal vehicle · {getPerson(vehicle.personalDriverId)?.name || 'driver'}</>
                    : 'None — no vehicle'
                }</dd>
                {extraCrews.length > 0 && <><dt>Extra crews</dt><dd>{extraCrews.map(id => getCrew(id)?.name).join(', ')}</dd></>}
              </dl>
              <div className="card" style={{ background:'var(--bg-subtle)' }}>
                <h4 style={{ fontSize: 13, marginBottom: 8, fontFamily:'var(--font-subhead)' }}>Crew composition</h4>
                <div className="col" style={{ gap: 4 }}>
                  {tplSlots.map((slotRow, i) => {
                    const role = ROLES[slotRow.role];
                    const crew = getCrew(slot.crewId);
                    const member = crew?.members.map(getPerson).find(p => p && p.roles.includes(slotRow.role)) || PEOPLE.find(p => p.roles.includes(slotRow.role));
                    return (
                      <div key={i} className="row" style={{ fontSize: 13, padding: '6px 8px', background:'var(--surface-card)', borderRadius: 8 }}>
                        <Avatar person={member} size="sm" />
                        <strong>{member?.name || '—'}</strong>
                        <span className="tag">{role.label} · {slotRow.level}</span>
                        <span className="muted small mono" style={{ marginLeft: 'auto' }}>{slotRow.hours}h{slotRow.start ? ' (+' + slotRow.start + 'h)' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <div className="muted small">Step {step + 1} of {STEPS.length}</div>
          <div className="row">
            {step > 0 && <button className="btn btn-outline btn-sm" onClick={back}>Back</button>}
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary btn-sm" disabled={!canAdvance()} onClick={next}>
                Continue <Icon name="arrow_right" size={12} />
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={commit}>
                <Icon name="check" size={12} /> Create job
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// TEMPLATE EDITOR — define a custom job type inside the wizard
// =============================================================
function TemplateEditor({ draft, onChange, onSave, onCancel }) {
  const COLOR_OPTIONS = [
    { value: 'jt-heatpump',    name: 'Green' },
    { value: 'jt-water',       name: 'Blue' },
    { value: 'jt-electrical',  name: 'Amber' },
    { value: 'jt-warranty',    name: 'Orange' },
    { value: 'jt-walkthrough', name: 'Indigo' },
    { value: 'jt-callback',    name: 'Red' },
    { value: 'jt-retrofit',    name: 'Lime' },
    { value: 'jt-service',     name: 'Fern' },
  ];

  function updateSlot(i, patch) {
    onChange({ ...draft, slots: draft.slots.map((s, j) => j === i ? { ...s, ...patch } : s) });
  }
  function addSlot() {
    onChange({ ...draft, slots: [...draft.slots, { role: 'hvac_installer', level: 'L1', hours: 4, start: 0, optional: false }] });
  }
  function removeSlot(i) {
    onChange({ ...draft, slots: draft.slots.filter((_, j) => j !== i) });
  }

  const valid = draft.label.trim() && draft.slots.length > 0;

  return (
    <div className="template-editor">
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="dot" style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--' + draft.color + ')' }}></span>
        <h4 style={{ fontFamily: 'var(--font-subhead)', fontSize: 14 }}>New job type template</h4>
        <span className="muted small">Saved to this org — usable on future jobs.</span>
        <div className="topbar-spacer"></div>
        <IconButton icon="x" label="Cancel" onClick={onCancel} variant="ghost" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 12, marginBottom: 14 }}>
        <div className="field">
          <label className="label">Template name</label>
          <input className="input" placeholder="e.g. Mini-split install" autoFocus
            value={draft.label} onChange={e => onChange({ ...draft, label: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Short tag</label>
          <input className="input" placeholder="Mini-split"
            value={draft.short} onChange={e => onChange({ ...draft, short: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
            {COLOR_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => onChange({ ...draft, color: opt.value })}
                style={{
                  width: 24, height: 24, borderRadius: 8,
                  background: 'var(--' + opt.value + ')',
                  border: draft.color === opt.value ? '2px solid var(--forest)' : '1px solid var(--border)',
                  cursor: 'pointer', padding: 0,
                  boxShadow: draft.color === opt.value ? '0 0 0 2px rgba(60,213,103,0.3)' : 'none',
                }}
                title={opt.name} />
            ))}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 6 }}>
        <span className="label" style={{ marginBottom: 0 }}>Required slots</span>
        <span className="muted small">Each row is a role that must be on site for some portion of the job.</span>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {draft.slots.map((s, i) => (
          <div key={i} className="template-slot-row">
            <span className="num">{i + 1}</span>
            <select className="select" value={s.role} onChange={e => updateSlot(i, { role: e.target.value })}>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
            <select className="select" value={s.level} onChange={e => updateSlot(i, { level: e.target.value })}>
              {(ROLES[s.role]?.levels || ['L1','L2','L3']).map(lv => <option key={lv} value={lv}>{lv}</option>)}
            </select>
            <div className="template-slot-num">
              <input className="input" type="number" step="0.5" min="0.5"
                value={s.hours} onChange={e => updateSlot(i, { hours: parseFloat(e.target.value) || 0 })} />
              <span className="suffix">hrs</span>
            </div>
            <div className="template-slot-num">
              <input className="input" type="number" step="0.5" min="0"
                value={s.start} onChange={e => updateSlot(i, { start: parseFloat(e.target.value) || 0 })} />
              <span className="suffix">offset</span>
            </div>
            <label className="template-slot-toggle">
              <input type="checkbox" checked={s.optional} onChange={e => updateSlot(i, { optional: e.target.checked })} />
              <span>Optional</span>
            </label>
            <IconButton icon="x" label="Remove" variant="ghost" onClick={() => removeSlot(i)} />
          </div>
        ))}
      </div>
      <button className="btn btn-outline btn-sm" onClick={addSlot} style={{ marginTop: 8 }}>
        <Icon name="plus" size={12} /> Add slot
      </button>

      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end', gap: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onSave}>
          <Icon name="check" size={12} /> Save template
        </button>
      </div>
    </div>
  );
}

// =============================================================
// VEHICLE PICKER — fleet truck / personal / none
// =============================================================
function VehiclePicker({ crew, members, value, onChange }) {
  const fleetTruck = getTruck(crew?.truck);
  const mode = value?.mode || 'fleet';
  const driverId = value?.personalDriverId || null;

  // Auto-default to 'personal' when crew has no truck
  useEM(() => {
    if (mode === 'fleet' && !fleetTruck) {
      onChange({ mode: 'personal', personalDriverId: crew?.lead || null });
    }
  }, [crew?.id]);

  // Possible personal-vehicle drivers: any member of the crew
  const driverOptions = members.length > 0 ? members : (crew ? [getPerson(crew.lead)].filter(Boolean) : []);

  function setMode(m) {
    if (m === 'fleet') onChange({ mode: 'fleet', personalDriverId: null });
    else if (m === 'personal') onChange({ mode: 'personal', personalDriverId: driverId || crew?.lead || (driverOptions[0]?.id) });
    else onChange({ mode: 'none', personalDriverId: null });
  }

  return (
    <div className="vehicle-picker">
      <div className="vehicle-picker-head">
        <div className="row" style={{ gap: 6 }}>
          <Icon name="truck" size={13} stroke="var(--fg)" />
          <span className="eyebrow-sm" style={{ marginBottom: 0 }}>Vehicle</span>
        </div>
        <span className="muted small">How is the team getting to site?</span>
      </div>
      <div className="vehicle-picker-options">
        <button
          type="button"
          className={"vehicle-option" + (mode === 'fleet' ? ' selected' : '') + (!fleetTruck ? ' disabled' : '')}
          onClick={() => fleetTruck && setMode('fleet')}
          disabled={!fleetTruck}>
          <div className="vehicle-option-icon"><Icon name="truck" size={14} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vehicle-option-label">{fleetTruck ? fleetTruck.name : 'No fleet truck'}</div>
            <div className="vehicle-option-meta">
              {fleetTruck ? fleetTruck.plate + ' · ' + fleetTruck.capacity : 'Crew has none assigned'}
            </div>
          </div>
          {mode === 'fleet' && fleetTruck && <span className="vehicle-option-check"><Icon name="check" size={11} stroke="var(--off-white)" /></span>}
        </button>

        <button
          type="button"
          className={"vehicle-option" + (mode === 'personal' ? ' selected' : '')}
          onClick={() => setMode('personal')}>
          <div className="vehicle-option-icon"><Icon name="map_pin" size={14} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vehicle-option-label">Personal vehicle</div>
            <div className="vehicle-option-meta">Driver brings their own</div>
          </div>
          {mode === 'personal' && <span className="vehicle-option-check"><Icon name="check" size={11} stroke="var(--off-white)" /></span>}
        </button>

        <button
          type="button"
          className={"vehicle-option" + (mode === 'none' ? ' selected' : '')}
          onClick={() => setMode('none')}>
          <div className="vehicle-option-icon"><Icon name="x" size={14} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vehicle-option-label">No vehicle</div>
            <div className="vehicle-option-meta">e.g. ride-along / shadowing</div>
          </div>
          {mode === 'none' && <span className="vehicle-option-check"><Icon name="check" size={11} stroke="var(--off-white)" /></span>}
        </button>
      </div>

      {mode === 'personal' && driverOptions.length > 0 && (
        <div className="vehicle-picker-driver">
          <label className="label">Driver</label>
          <select
            className="select"
            value={driverId || ''}
            onChange={e => onChange({ mode: 'personal', personalDriverId: e.target.value })}>
            {driverOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name} · {p.roles.map(r => ROLES[r]?.short || r).join(', ')}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// =============================================================
// RANK CREWS for a job — simple heuristic (used by SmartScheduleModal)
// =============================================================
function rankCrewsFor({ type, slots, date, startHour, customer }) {
  const requiredRoles = slots.map(s => s.role);
  const candidates = CREWS.filter(c => {
    const leadRole = requiredRoles[0];
    if (!leadRole) return c.type === 'sales' || c.type === 'install';
    return c.members.map(getPerson).some(p => p && p.roles.includes(leadRole));
  });

  const scored = candidates.map(crew => {
    const dayKey = date;
    const todayJobs = JOBS.filter(j => j.date === dayKey && j.crewId === crew.id);
    const hoursBooked = todayJobs.reduce((a, j) => a + (j.durationHrs || 0), 0);
    const distance = (Math.abs(crew.id.charCodeAt(1) - 99) % 12) + 1;
    const skillMatch = slots.every(s => {
      if (s.optional) return true;
      const m = crew.members.map(getPerson).find(p => p && p.roles.includes(s.role));
      if (!m) return false;
      const order = { L1: 1, L2: 2, L3: 3 };
      return order[m.level] >= order[s.level || 'L1'];
    });

    const reasons = [];
    if (skillMatch) reasons.push({ tone: 'good', icon: 'check', text: 'All roles covered' });
    else reasons.push({ tone: 'warn', icon: 'info', text: 'Missing role — needs lend-out' });
    reasons.push({ tone: 'good', icon: 'map_pin', text: distance + ' mi away' });
    reasons.push({ tone: hoursBooked > 4 ? 'warn' : 'good', icon: 'clock', text: hoursBooked > 0 ? hoursBooked + 'h booked · ' + (8 - hoursBooked) + 'h free' : 'Free all day' });
    if (crew.id === 'c1' || crew.id === 'c2') reasons.push({ tone: 'good', icon: 'sparkle', text: '94% first-time-fix' });
    if (crew.id === 'c3') reasons.push({ tone: 'good', icon: 'home', text: 'Worked this neighborhood last week' });

    const score = (skillMatch ? 100 : 30) - distance * 2 - hoursBooked * 5 + (crew.type === 'install' && type === 'heatpump' ? 10 : 0);
    return { crewId: crew.id, score, reasons };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}

// =============================================================
// SMART-SCHEDULE MODAL — for an existing unscheduled job
// =============================================================
function SmartScheduleModal({ job, onClose, onSchedule }) {
  const [date, setDate] = useSM(dateKey(addDays(TODAY, 1)));
  const [startHour, setStartHour] = useSM(8);
  const [crewChoice, setCrewChoice] = useSM(null);

  const suggestions = useMM(() => rankCrewsFor({
    type: job.type, slots: job.slots.length ? job.slots : (JOB_TEMPLATES[job.type]?.slots || []),
    date, startHour, customer: job.customer,
  }), [job, date, startHour]);

  useEM(() => { if (suggestions.length > 0 && !crewChoice) setCrewChoice(suggestions[0].crewId); }, [suggestions]);

  const customer = getCustomer(job.customer);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 680 }}>
        <div className="modal-header">
          <Icon name="sparkle" size={18} stroke="var(--jetson-green)" />
          <div>
            <div className="eyebrow-sm">Smart schedule</div>
            <div className="h4" style={{ fontSize: 16 }}>{job.id} · {customer?.name}</div>
          </div>
          <div className="topbar-spacer"></div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="row" style={{ marginBottom: 16, gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Try date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Start time</label>
              <select className="select" value={startHour} onChange={e => setStartHour(parseFloat(e.target.value))}>
                {[7,8,9,10,11,12,13,14,15].map(h => <option key={h} value={h}>{fmtTime(h)}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="h4" style={{ fontSize: 13, fontFamily:'var(--font-subhead)' }}>Ranked crew options</span>
            <span className="muted small">Click a card to select</span>
          </div>
          <div className="suggestion-list">
            {suggestions.map((sug, i) => {
              const crew = getCrew(sug.crewId);
              const lead = getPerson(crew.lead);
              return (
                <div key={sug.crewId} className={"suggestion" + (i === 0 ? ' best' : '') + (crewChoice === sug.crewId ? ' selected' : '')}
                  onClick={() => setCrewChoice(sug.crewId)}>
                  <div className="suggestion-rank">#{i+1}</div>
                  <div>
                    <div className="row">
                      <strong style={{ fontSize: 14 }}>{crew.name}</strong>
                      <span className="muted small">· {lead?.name}</span>
                      {getTruck(crew.truck) && <span className="tag" style={{ marginLeft: 6 }}>
                        <Icon name="truck" size={10} /> {getTruck(crew.truck).name}
                      </span>}
                    </div>
                    <div className="suggestion-reasons">
                      {sug.reasons.map((r, j) => (
                        <span key={j} className={"reason-chip " + r.tone}>
                          {r.icon && <Icon name={r.icon} size={10} />}{r.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {crew.members.slice(0, 4).map(m => <Avatar key={m} person={m} size="xs" />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <div className="muted small">
            <Icon name="info" size={11} /> Suggestions weighted by skill match, distance, hours booked, and crew specialty.
          </div>
          <div className="row">
            <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!crewChoice} onClick={() => onSchedule(crewChoice, date, startHour)}>
              <Icon name="check" size={12} /> Schedule with {getCrew(crewChoice)?.name.split(' ')[0]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewJobWizard, SmartScheduleModal, TemplateEditor, VehiclePicker, rankCrewsFor });
