/* eslint-disable */
/* Timesheets + Settings views */

const { useState: useS2 } = React;

// =============================================================
// TIMESHEETS — week grid
// =============================================================
function TimesheetsView() {
  const [weekStart, setWeekStart] = useS2(() => {
    const monday = addDays(TODAY, -((TODAY.getDay() + 6) % 7));
    return monday;
  });
  const [view, setView] = useS2('summary'); // summary | detail

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  // derive hours per person per day from JOBS
  function hoursFor(personId, dk) {
    return JOBS.filter(j => j.date === dk && j.slots.some(s => s.assignedTo === personId))
      .reduce((sum, j) => {
        const slot = j.slots.find(s => s.assignedTo === personId);
        return sum + (slot?.hours || j.durationHrs || 0);
      }, 0);
  }
  function statusFor(personId) {
    // mock approval status
    const seed = personId.charCodeAt(1);
    return seed % 3 === 0 ? 'approved' : seed % 3 === 1 ? 'pending' : 'draft';
  }

  return (
    <>
      <PageHeader eyebrow="Operations" title="Timesheets" subtitle="Auto-drafted from job clock-in / clock-out · review & approve">
        <div className="seg">
          <button className={view==='summary'?'active':''} onClick={()=>setView('summary')}>Summary</button>
          <button className={view==='detail'?'active':''} onClick={()=>setView('detail')}>Detail</button>
        </div>
        <button className="btn btn-outline btn-sm"><Icon name="refresh" size={14} /> Re-derive from jobs</button>
        <button className="btn btn-primary btn-sm"><Icon name="check" size={14} /> Approve all pending</button>
      </PageHeader>

      <div className="dispatch-controls">
        <div className="date-nav">
          <IconButton icon="chevron_left" label="Previous" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))} />
          <div className="date-label" style={{ minWidth: 200 }}>
            Week of {weekStart.toLocaleDateString('en-US', { month:'short', day:'numeric' })} – {addDays(weekStart, 6).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
          </div>
          <IconButton icon="chevron_right" label="Next" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))} />
        </div>
        <div className="topbar-spacer"></div>
        <div className="muted small">
          <Icon name="info" size={11} /> Auto-drafted entries become "Pending" when the tech ends their day. Approved entries lock.
        </div>
      </div>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Hours this week</div>
            <div className="kpi-value">682h</div>
            <div className="kpi-meta">across 20 techs</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Pending approval</div>
            <div className="kpi-value">8</div>
            <div className="kpi-meta">2 with overtime flags</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Approved</div>
            <div className="kpi-value">11</div>
            <div className="kpi-meta up">ready for payroll</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Avg utilization</div>
            <div className="kpi-value">87%</div>
            <div className="kpi-meta up">vs 40h target</div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="ts-grid">
            <thead>
              <tr>
                <th style={{ width: 220 }}>Technician</th>
                {days.map(d => {
                  const isToday = dateKey(d) === dateKey(TODAY);
                  return (
                    <th key={dateKey(d)} className="ts-day" style={{ color: isToday ? 'var(--jetson-green)' : undefined }}>
                      <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 500, color:'var(--fg-muted)' }}>{d.getDate()}</div>
                    </th>
                  );
                })}
                <th className="ts-day">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {PEOPLE.map(p => {
                const daily = days.map(d => hoursFor(p.id, dateKey(d)));
                const total = daily.reduce((a,b)=>a+b, 0);
                const status = statusFor(p.id);
                const over = total > 40;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar person={p} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                          <div className="muted small">{ROLES[p.roles[0]].short} · {p.level}</div>
                        </div>
                      </div>
                    </td>
                    {daily.map((h, i) => (
                      <td key={i} className={"ts-day" + (h === 0 ? ' empty' : '') + (h > 9 ? ' over' : '')}>
                        {h === 0 ? '—' : h.toFixed(1)}
                      </td>
                    ))}
                    <td className={"ts-day mono " + (over ? 'over' : '')} style={{ fontWeight: 700 }}>{total.toFixed(1)}</td>
                    <td>
                      <span className={"ts-status " + status}>{status}</span>
                      {over && <span className="badge badge-callback" style={{ marginLeft: 4 }}>OT</span>}
                    </td>
                    <td>
                      {status === 'pending' && <button className="btn btn-primary btn-sm">Approve</button>}
                      {status === 'approved' && <span className="muted small"><Icon name="check" size={11} /> Locked</span>}
                      {status === 'draft' && <button className="btn btn-outline btn-sm">Submit</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// =============================================================
// HUBSPOT FIELD MAPPING — interactive two-column mapper
// =============================================================
// App field catalog — everything we read/write in Schedule + Dispatch
const SD_FIELDS = {
  customer: [
    { key: 'name',         label: 'Customer name',     type: 'string',  required: true },
    { key: 'firstName',    label: 'First name',        type: 'string' },
    { key: 'lastName',     label: 'Last name',         type: 'string' },
    { key: 'address',      label: 'Service address',   type: 'string',  required: true },
    { key: 'phone',        label: 'Phone',             type: 'string',  required: true },
    { key: 'email',        label: 'Email',             type: 'string' },
    { key: 'city',         label: 'City',              type: 'string' },
    { key: 'state',        label: 'State',             type: 'string' },
    { key: 'zip',          label: 'ZIP / Postal code', type: 'string' },
    { key: 'hubspotId',    label: 'HubSpot ID',        type: 'id',      readonly: true },
    { key: 'lifecycleStage',label:'Lifecycle stage',   type: 'enum' },
    { key: 'notes',        label: 'Customer notes',    type: 'text' },
  ],
  job: [
    { key: 'id',             label: 'Job ID',          type: 'id',       readonly: true },
    { key: 'type',           label: 'Job type',        type: 'enum',     required: true },
    { key: 'status',         label: 'Status',          type: 'enum' },
    { key: 'date',           label: 'Scheduled date',  type: 'date',     required: true },
    { key: 'startHour',      label: 'Start time',      type: 'time' },
    { key: 'durationHrs',    label: 'Duration (hrs)',  type: 'number' },
    { key: 'price',          label: 'Job value ($)',   type: 'currency' },
    { key: 'crew',           label: 'Crew assignment', type: 'ref' },
    { key: 'truck',          label: 'Truck',           type: 'ref' },
    { key: 'address',        label: 'Service address', type: 'string',   required: true },
    { key: 'notes',          label: 'Job notes',       type: 'text' },
    { key: 'hubspotDealId',  label: 'HubSpot Deal ID', type: 'id',       readonly: true },
    { key: 'completionPhotos',label:'Completion photos',type:'attachment' },
    { key: 'rebateProgram',  label: 'Rebate program',  type: 'enum' },
  ],
};

// HubSpot field catalog — standard + a few custom
const HS_FIELDS = {
  contact: [
    { key: 'firstname',                 label: 'First name',           type: 'string' },
    { key: 'lastname',                  label: 'Last name',            type: 'string' },
    { key: 'email',                     label: 'Email',                type: 'string' },
    { key: 'phone',                     label: 'Phone number',         type: 'string' },
    { key: 'mobilephone',               label: 'Mobile phone',         type: 'string' },
    { key: 'address',                   label: 'Street address',       type: 'string' },
    { key: 'city',                      label: 'City',                 type: 'string' },
    { key: 'state',                     label: 'State / Region',       type: 'string' },
    { key: 'zip',                       label: 'Postal code',          type: 'string' },
    { key: 'lifecyclestage',            label: 'Lifecycle stage',      type: 'enum' },
    { key: 'hs_lead_status',            label: 'Lead status',          type: 'enum' },
    { key: 'hs_object_id',              label: 'Record ID',            type: 'id',     readonly: true },
    { key: 'createdate',                label: 'Create date',          type: 'datetime', readonly: true },
    { key: 'hubspot_owner_id',          label: 'Contact owner',        type: 'ref' },
    { key: 'jt__home_type',             label: 'Home type',            type: 'enum',   custom: true },
    { key: 'jt__heating_system',        label: 'Existing heating',     type: 'enum',   custom: true },
    { key: 'jt__preferred_install',     label: 'Preferred install date',type:'date',   custom: true },
    { key: 'jt__rebate_eligible',       label: 'Rebate eligible',      type: 'bool',   custom: true },
  ],
  deal: [
    { key: 'dealname',                  label: 'Deal name',            type: 'string' },
    { key: 'amount',                    label: 'Deal amount',          type: 'currency' },
    { key: 'dealstage',                 label: 'Deal stage',           type: 'enum' },
    { key: 'pipeline',                  label: 'Pipeline',             type: 'enum' },
    { key: 'closedate',                 label: 'Close date',           type: 'date' },
    { key: 'createdate',                label: 'Create date',          type: 'datetime', readonly: true },
    { key: 'hubspot_owner_id',          label: 'Deal owner',           type: 'ref' },
    { key: 'hs_object_id',              label: 'Deal ID',              type: 'id',     readonly: true },
    { key: 'jt__install_address',       label: 'Install address',      type: 'string', custom: true },
    { key: 'jt__scheduled_date',        label: 'Scheduled date',       type: 'date',   custom: true },
    { key: 'jt__scheduled_start',       label: 'Scheduled start time', type: 'time',   custom: true },
    { key: 'jt__crew_assigned',         label: 'Crew assigned',        type: 'string', custom: true },
    { key: 'jt__truck_assigned',        label: 'Truck assigned',       type: 'string', custom: true },
    { key: 'jt__equipment_sku',         label: 'Equipment SKU',        type: 'string', custom: true },
    { key: 'jt__install_complete',      label: 'Install complete',     type: 'bool',   custom: true },
    { key: 'jt__photo_url',             label: 'Completion photos',    type: 'url',    custom: true },
  ],
};

// Default mappings — pre-populated with common pairs
const DEFAULT_MAPPINGS = {
  customer: [
    { sd: 'firstName',     hs: 'firstname',                  dir: 'both' },
    { sd: 'lastName',      hs: 'lastname',                   dir: 'both' },
    { sd: 'phone',         hs: 'phone',                      dir: 'both' },
    { sd: 'email',         hs: 'email',                      dir: 'both' },
    { sd: 'address',       hs: 'address',                    dir: 'pull' },
    { sd: 'city',          hs: 'city',                       dir: 'pull' },
    { sd: 'state',         hs: 'state',                      dir: 'pull' },
    { sd: 'zip',           hs: 'zip',                        dir: 'pull' },
    { sd: 'hubspotId',     hs: 'hs_object_id',               dir: 'pull' },
    { sd: 'lifecycleStage',hs: 'lifecyclestage',             dir: 'push' },
  ],
  job: [
    { sd: 'hubspotDealId', hs: 'hs_object_id',               dir: 'pull' },
    { sd: 'price',         hs: 'amount',                     dir: 'both' },
    { sd: 'type',          hs: 'dealstage',                  dir: 'pull' },
    { sd: 'address',       hs: 'jt__install_address',        dir: 'both' },
    { sd: 'date',          hs: 'jt__scheduled_date',         dir: 'push' },
    { sd: 'startHour',     hs: 'jt__scheduled_start',        dir: 'push' },
    { sd: 'crew',          hs: 'jt__crew_assigned',          dir: 'push' },
    { sd: 'truck',         hs: 'jt__truck_assigned',         dir: 'push' },
    { sd: 'status',        hs: 'jt__install_complete',       dir: 'push' },
    { sd: 'completionPhotos', hs: 'jt__photo_url',           dir: 'push' },
  ],
};

const ENTITY_LABELS = {
  customer: { app: 'Customer', hs: 'Contact', icon: 'user' },
  job:      { app: 'Job',      hs: 'Deal',    icon: 'briefcase' },
};

const TYPE_BADGES = {
  string:    { label: 'TEXT',  color: 'var(--fg-muted)' },
  text:      { label: 'TEXT',  color: 'var(--fg-muted)' },
  number:    { label: '123',   color: 'var(--fg-muted)' },
  currency:  { label: '$',     color: '#1A6F2E' },
  date:      { label: 'DATE',  color: '#2A6FDB' },
  datetime:  { label: 'DATE',  color: '#2A6FDB' },
  time:      { label: 'TIME',  color: '#2A6FDB' },
  bool:      { label: '✓',     color: '#1A6F2E' },
  enum:      { label: 'ENUM',  color: '#8A5500' },
  ref:       { label: 'REF',   color: '#6B5BCF' },
  id:        { label: 'ID',    color: 'var(--fg-muted)' },
  attachment:{ label: 'FILE',  color: '#8A5500' },
  url:       { label: 'URL',   color: 'var(--fg-muted)' },
};

function HubspotFieldMapping() {
  const [entity, setEntity] = useS2('customer'); // 'customer' | 'job'
  const [mappings, setMappings] = useS2(DEFAULT_MAPPINGS);
  const [search, setSearch] = useS2('');
  const [syncedJustNow, setSyncedJustNow] = useS2(false);

  const sdFields  = SD_FIELDS[entity];
  const hsFields  = HS_FIELDS[entity === 'customer' ? 'contact' : 'deal'];
  const rows      = mappings[entity];

  // Type compatibility check between two field types
  function typeCompatible(a, b) {
    if (!a || !b) return true;
    const groups = [
      ['string','text','enum','id','url'],
      ['number','currency'],
      ['date','datetime'],
      ['time','number'],
      ['bool','enum'],
    ];
    if (a === b) return true;
    return groups.some(g => g.includes(a) && g.includes(b));
  }

  function update(i, patch) {
    setMappings(prev => ({ ...prev, [entity]: prev[entity].map((r, j) => j === i ? { ...r, ...patch } : r) }));
  }
  function add() {
    setMappings(prev => ({ ...prev, [entity]: [...prev[entity], { sd: '', hs: '', dir: 'both' }] }));
  }
  function remove(i) {
    setMappings(prev => ({ ...prev, [entity]: prev[entity].filter((_, j) => j !== i) }));
  }
  function reset() {
    setMappings(DEFAULT_MAPPINGS);
  }
  function testSync() {
    setSyncedJustNow(true);
    setTimeout(() => setSyncedJustNow(false), 2400);
  }

  // Required fields not yet mapped — surface a warning
  const unmappedRequired = sdFields.filter(f => f.required && !rows.some(r => r.sd === f.key));

  // Filter rows by search
  const filteredRows = search
    ? rows.map((r, i) => ({ r, i })).filter(({ r }) => {
        const a = sdFields.find(f => f.key === r.sd)?.label || '';
        const b = hsFields.find(f => f.key === r.hs)?.label || '';
        return (a + ' ' + b + ' ' + r.sd + ' ' + r.hs).toLowerCase().includes(search.toLowerCase());
      })
    : rows.map((r, i) => ({ r, i }));

  return (
    <div className="hs-mapper">
      <div className="hs-mapper-header">
        <div className="row" style={{ gap: 10 }}>
          <div className="integ-logo">HS</div>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <h4 style={{ fontSize: 15 }}>HubSpot field mapping</h4>
              <span className="badge" style={{ background: 'var(--bg-muted)', color: 'var(--fg-muted)', fontSize: 9 }}>ADMIN</span>
            </div>
            <div className="muted small" style={{ marginTop: 2 }}>
              Choose how Schedule + Dispatch fields exchange data with HubSpot. Direction governs whether values push, pull, or both.
            </div>
          </div>
          <div className="topbar-spacer"></div>
          <button className="btn btn-ghost btn-sm" onClick={reset} title="Restore default mappings">Reset</button>
          <button className={"btn btn-sm " + (syncedJustNow ? 'btn-outline' : 'btn-primary')} onClick={testSync}>
            {syncedJustNow ? <><Icon name="check" size={12} stroke="var(--jetson-green)" /> Synced</> : <><Icon name="refresh" size={12} /> Test sync</>}
          </button>
        </div>
      </div>

      {/* Entity selector */}
      <div className="hs-mapper-tabs">
        {Object.entries(ENTITY_LABELS).map(([k, e]) => {
          const required = SD_FIELDS[k].filter(f => f.required).length;
          const mapped = mappings[k].length;
          return (
            <button key={k} className={"hs-mapper-tab" + (entity === k ? ' active' : '')} onClick={() => setEntity(k)}>
              <Icon name={e.icon} size={13} />
              <span><strong>{e.app}</strong> <span className="muted small">↔ {e.hs}</span></span>
              <span className="hs-mapper-tab-count">{mapped}</span>
            </button>
          );
        })}
        <div className="topbar-spacer"></div>
        <div className="search" style={{ minWidth: 180, background: 'var(--surface-card)' }}>
          <Icon name="search" size={12} />
          <input placeholder="Filter mappings…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Warning for unmapped required */}
      {unmappedRequired.length > 0 && (
        <div className="hs-mapper-warn">
          <Icon name="alert_circle" size={14} stroke="#C53030" strokeWidth={2.5} />
          <span><strong>{unmappedRequired.length} required {ENTITY_LABELS[entity].app.toLowerCase()} field{unmappedRequired.length === 1 ? '' : 's'}</strong> not mapped: {unmappedRequired.map(f => f.label).join(', ')}. Records won't sync without these.</span>
        </div>
      )}

      {/* Header row */}
      <div className="hs-mapper-table">
        <div className="hs-mapper-row hs-mapper-thead">
          <div className="hs-mapper-h">Schedule + Dispatch ({ENTITY_LABELS[entity].app})</div>
          <div className="hs-mapper-h-dir">Direction</div>
          <div className="hs-mapper-h">HubSpot ({ENTITY_LABELS[entity].hs})</div>
          <div className="hs-mapper-h"></div>
        </div>

        {filteredRows.map(({ r, i }) => {
          const sdField = sdFields.find(f => f.key === r.sd);
          const hsField = hsFields.find(f => f.key === r.hs);
          const sdType = sdField?.type;
          const hsType = hsField?.type;
          const compatible = typeCompatible(sdType, hsType);
          const incomplete = !r.sd || !r.hs;
          const sdBadge = sdType && TYPE_BADGES[sdType];
          const hsBadge = hsType && TYPE_BADGES[hsType];

          return (
            <div key={i} className={"hs-mapper-row" + (incomplete ? ' incomplete' : '') + (!compatible && !incomplete ? ' incompatible' : '')}>
              <div className="hs-mapper-cell">
                <select className="select" value={r.sd} onChange={e => update(i, { sd: e.target.value })}>
                  <option value="">— Select field —</option>
                  {sdFields.map(f => (
                    <option key={f.key} value={f.key} disabled={rows.some((rr, j) => j !== i && rr.sd === f.key)}>
                      {f.label}{f.required ? ' *' : ''}{f.readonly ? ' (read-only)' : ''}
                    </option>
                  ))}
                </select>
                {sdBadge && <span className="hs-mapper-typebadge" style={{ color: sdBadge.color }}>{sdBadge.label}</span>}
              </div>

              <div className="hs-mapper-cell hs-mapper-dir-cell">
                <button
                  className={"hs-mapper-dir hs-mapper-dir-" + r.dir}
                  onClick={() => update(i, { dir: r.dir === 'push' ? 'pull' : r.dir === 'pull' ? 'both' : 'push' })}
                  title={
                    r.dir === 'push' ? 'Push only: changes here go to HubSpot' :
                    r.dir === 'pull' ? 'Pull only: changes in HubSpot come here' :
                    'Bidirectional: changes sync both ways'
                  }>
                  {r.dir === 'push' && <>→ PUSH</>}
                  {r.dir === 'pull' && <>← PULL</>}
                  {r.dir === 'both' && <>↔ BOTH</>}
                </button>
              </div>

              <div className="hs-mapper-cell">
                <select className="select" value={r.hs} onChange={e => update(i, { hs: e.target.value })}>
                  <option value="">— Select field —</option>
                  {hsFields.map(f => (
                    <option key={f.key} value={f.key} disabled={rows.some((rr, j) => j !== i && rr.hs === f.key)}>
                      {f.label}{f.custom ? ' (custom)' : ''}{f.readonly ? ' (read-only)' : ''}
                    </option>
                  ))}
                </select>
                {hsBadge && <span className="hs-mapper-typebadge" style={{ color: hsBadge.color }}>{hsBadge.label}</span>}
                {hsField?.custom && <span className="hs-mapper-custom-badge">CUSTOM</span>}
              </div>

              <div className="hs-mapper-cell hs-mapper-actions">
                {incomplete && (
                  <span className="hs-mapper-status warn" title="Mapping incomplete">
                    <Icon name="alert_circle" size={12} stroke="#8A5500" />
                  </span>
                )}
                {!incomplete && !compatible && (
                  <span className="hs-mapper-status warn" title={sdType + ' may not convert cleanly to ' + hsType}>
                    <Icon name="alert_circle" size={12} stroke="#8A5500" />
                  </span>
                )}
                {!incomplete && compatible && (
                  <span className="hs-mapper-status ok" title="Mapping ready">
                    <Icon name="check" size={12} stroke="var(--jetson-green)" strokeWidth={2.5} />
                  </span>
                )}
                <IconButton icon="x" label="Remove" variant="ghost" onClick={() => remove(i)} />
              </div>
            </div>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="hs-mapper-empty">
            <span className="muted small">No mappings match "{search}".</span>
          </div>
        )}
      </div>

      <div className="hs-mapper-footer">
        <button className="btn btn-outline btn-sm" onClick={add}>
          <Icon name="plus" size={12} /> Add mapping
        </button>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          <Icon name="info" size={11} /> {rows.filter(r => r.sd && r.hs).length} active · {SD_FIELDS[entity].length - rows.filter(r => r.sd).length} app fields unmapped · {HS_FIELDS[entity === 'customer' ? 'contact' : 'deal'].length - rows.filter(r => r.hs).length} HubSpot fields available
        </span>
      </div>

      {/* Quick reference of available fields */}
      <details className="hs-mapper-ref">
        <summary>Field reference ({SD_FIELDS[entity].length} app fields · {HS_FIELDS[entity === 'customer' ? 'contact' : 'deal'].length} HubSpot fields)</summary>
        <div className="hs-mapper-ref-grid">
          <div>
            <div className="eyebrow-sm" style={{ marginBottom: 6 }}>Schedule + Dispatch</div>
            {sdFields.map(f => (
              <div key={f.key} className="hs-mapper-ref-item">
                <span className="mono" style={{ fontSize: 11 }}>{f.key}</span>
                <span className="muted small" style={{ marginLeft: 'auto' }}>{f.label}{f.required ? ' *' : ''}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="eyebrow-sm" style={{ marginBottom: 6 }}>HubSpot</div>
            {hsFields.map(f => (
              <div key={f.key} className="hs-mapper-ref-item">
                <span className="mono" style={{ fontSize: 11 }}>{f.key}</span>
                <span className="muted small" style={{ marginLeft: 'auto' }}>{f.label}{f.custom ? ' (custom)' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

// =============================================================
// SETTINGS — job templates / integrations / business rules
// =============================================================
function SettingsView() {
  const [section, setSection] = useS2('templates');
  const [editType, setEditType] = useS2('heatpump');
  const [hsExpanded, setHsExpanded] = useS2(false);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Settings" subtitle="Job templates, business rules, integrations, and team permissions" />

      <div className="view-pad" style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap: 32, alignItems:'flex-start' }}>
        {/* Side nav */}
        <div style={{ position:'sticky', top: 0 }}>
          {[
            { id:'templates',   label:'Job templates',     icon:'briefcase' },
            { id:'forms',       label:'Completion forms',  icon:'check' },
            { id:'rules',       label:'Business rules',    icon:'sparkle' },
            { id:'integrations',label:'Integrations',      icon:'plug' },
            { id:'roles',       label:'Roles & skills',    icon:'users' },
            { id:'hours',       label:'Hours & holidays',  icon:'clock' },
            { id:'permissions', label:'Permissions',       icon:'settings' },
          ].map(s => (
            <button key={s.id} onClick={()=>setSection(s.id)}
              className="nav-item" style={{
                color: section === s.id ? 'var(--forest)' : 'var(--fg-muted)',
                background: section === s.id ? 'var(--bg-subtle)' : 'transparent',
                fontWeight: section === s.id ? 700 : 500,
              }}>
              <Icon name={s.icon} size={16} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Right pane */}
        <div className="settings-section">
          {section === 'templates' && (
            <>
              <div>
                <h3>Job templates</h3>
                <p className="muted small" style={{ marginTop: 4 }}>
                  Define required crew composition per job type. Used to auto-suggest crews at scheduling time. All slots are editable on a per-job basis.
                </p>
              </div>

              <div className="row" style={{ flexWrap:'wrap', gap: 6 }}>
                {Object.entries(JOB_TEMPLATES).map(([k, tpl]) => (
                  <button key={k} className={"filter-chip " + (editType===k ? 'active' : '')} onClick={()=>setEditType(k)}>
                    <span className="dot" style={{ background:'var(--' + JOB_TYPES[k].color + ')' }}></span>
                    {tpl.label}
                  </button>
                ))}
              </div>

              <div className="card">
                <div className="row" style={{ marginBottom: 12 }}>
                  <JobTypeTag type={editType} size="lg" />
                  <h4 style={{ marginLeft: 8 }}>{JOB_TEMPLATES[editType].label}</h4>
                  <div className="topbar-spacer"></div>
                  <button className="btn btn-outline btn-sm"><Icon name="plus" size={12} /> Add slot</button>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1.4fr 0.7fr 0.7fr 0.7fr 80px 32px', gap: 8, padding:'0 8px', marginBottom: 6 }}>
                  <span className="eyebrow-sm">Role</span>
                  <span className="eyebrow-sm">Min level</span>
                  <span className="eyebrow-sm">Hours</span>
                  <span className="eyebrow-sm">Start (h)</span>
                  <span className="eyebrow-sm">Optional</span>
                  <span></span>
                </div>
                <div className="col">
                  {JOB_TEMPLATES[editType].slots.map((slot, i) => (
                    <div key={i} className="tpl-slot-row">
                      <select className="select" defaultValue={slot.role}>
                        {Object.entries(ROLES).map(([k, r]) => (
                          <option key={k} value={k}>{r.label}</option>
                        ))}
                      </select>
                      <select className="select" defaultValue={slot.level}>
                        <option>L1</option><option>L2</option><option>L3</option>
                      </select>
                      <input className="input" defaultValue={slot.hours} type="number" step="0.5" />
                      <input className="input" defaultValue={slot.start} type="number" step="0.5" />
                      <input type="checkbox" defaultChecked={slot.optional} style={{ justifySelf:'center' }} />
                      <IconButton icon="x" label="Remove" />
                    </div>
                  ))}
                  {JOB_TEMPLATES[editType].slots.length === 0 && (
                    <div className="muted small" style={{ padding: 16, textAlign:'center', background:'var(--bg-subtle)', borderRadius: 8 }}>
                      No required slots — composition is fully ad-hoc per job (e.g. meeting / training)
                    </div>
                  )}
                </div>

                <div className="divider"></div>
                <div className="row" style={{ alignItems:'flex-start', gap: 24 }}>
                  <div className="field">
                    <span className="label">Truck count</span>
                    <input className="input" type="number" defaultValue={JOB_TEMPLATES[editType].truckCount} style={{ width: 80 }} />
                  </div>
                  <div className="field">
                    <span className="label">Default duration</span>
                    <input className="input" defaultValue={Math.max(...(JOB_TEMPLATES[editType].slots.map(s=>s.start+s.hours).concat([1])))} type="number" step="0.5" style={{ width: 80 }} />
                  </div>
                  <div className="field">
                    <span className="label">Buffer (min)</span>
                    <input className="input" type="number" defaultValue={15} style={{ width: 80 }} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <span className="label">Required certifications</span>
                    <input className="input" defaultValue={editType === 'heatpump' ? 'EPA 608' : ''} />
                  </div>
                </div>
              </div>

              <div className="row" style={{ justifyContent:'flex-end' }}>
                <button className="btn btn-outline btn-sm">Cancel</button>
                <button className="btn btn-primary btn-sm">Save template</button>
              </div>
            </>
          )}

          {section === 'forms' && (
            <>
              <div>
                <h3>Completion forms</h3>
                <p className="muted small" style={{ marginTop: 4 }}>
                  Customize the checklist a tech must complete to close a job. Supports yes/no, photos, numbers, single + multi-select, free text, signatures, ratings. Required fields gate job completion.
                </p>
              </div>

              <div className="row" style={{ flexWrap:'wrap', gap: 6 }}>
                {Object.entries(JOB_TYPES).filter(([k]) => FORM_TEMPLATES[k]).map(([k, jt]) => (
                  <button key={k} className={"filter-chip " + (editType===k ? 'active' : '')} onClick={()=>setEditType(k)}>
                    <span className="dot" style={{ background:'var(--' + jt.color + ')' }}></span>
                    {jt.label}
                  </button>
                ))}
              </div>

              {FORM_TEMPLATES[editType] ? (
                <>
                  <div className="row" style={{ marginBottom: -8 }}>
                    <JobTypeTag type={editType} size="lg" />
                    <div>
                      <div style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 14 }}>{FORM_TEMPLATES[editType].name}</div>
                      <div className="muted small">Version {FORM_TEMPLATES[editType].version} · {totalFields(FORM_TEMPLATES[editType])} fields · {requiredFields(FORM_TEMPLATES[editType]).length} required</div>
                    </div>
                    <div className="topbar-spacer"></div>
                    <button className="btn btn-outline btn-sm"><Icon name="refresh" size={12} /> Duplicate</button>
                    <button className="btn btn-primary btn-sm"><Icon name="check" size={12} /> Publish new version</button>
                  </div>
                  <FormBuilder jobType={editType} />
                </>
              ) : (
                <div className="empty">
                  <div className="empty-icon"><Icon name="info" size={28} stroke="var(--mid-gray)" /></div>
                  <div className="h4">No form for this job type</div>
                  <div className="muted small">Click below to start one.</div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                    <Icon name="plus" size={12} /> Create form for {JOB_TYPES[editType].label}
                  </button>
                </div>
              )}
            </>
          )}

          {section === 'rules' && (
            <>
              <div><h3>Business rules</h3><p className="muted small">Logic that runs when scheduling, auto-assigning, or routing.</p></div>

              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Auto-assignment</h4>
                <div className="col" style={{ gap: 14 }}>
                  {[
                    { title:'Prefer default crew members', sub:'When filling slots, prioritize a job\'s assigned crew\'s default people before borrowing from other crews.', on: true },
                    { title:'Match minimum skill level', sub:'Don\'t suggest a tech below the required level (e.g. don\'t pick an L1 for an L2 slot).', on: true },
                    { title:'Honor time-off requests', sub:'Skip techs marked off, sick, or in training on that date.', on: true },
                    { title:'Respect 40-hour weekly cap', sub:'Don\'t suggest techs who would cross 40h that week — flag if no alternative.', on: false },
                    { title:'Same lead for callbacks', sub:'When a callback comes in for a recent install, suggest the original lead.', on: true },
                  ].map((r, i) => (
                    <div key={i} className="row" style={{ alignItems:'flex-start' }}>
                      <input type="checkbox" defaultChecked={r.on} style={{ marginTop: 4 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                        <div className="muted small">{r.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Auto-routing</h4>
                <div className="col" style={{ gap: 14 }}>
                  {[
                    { title:'Optimize daily route order', sub:'Re-sequence a crew\'s jobs each morning to minimize drive time. Honors fixed-time arrivals.', on: true },
                    { title:'Suggest nearest available crew', sub:'When new jobs are created, surface the closest crew with capacity in the unscheduled rail.', on: true },
                    { title:'Show drive-time on calendar', sub:'Overlay travel gaps between jobs in the day calendar.', on: false },
                    { title:'Service-radius limit', sub:'Don\'t suggest crews more than X miles from the job site.', on: true, extra: <input className="input" defaultValue={25} type="number" style={{ width: 70 }} /> },
                  ].map((r, i) => (
                    <div key={i} className="row" style={{ alignItems:'flex-start' }}>
                      <input type="checkbox" defaultChecked={r.on} style={{ marginTop: 4 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                        <div className="muted small">{r.sub}</div>
                      </div>
                      {r.extra}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {section === 'integrations' && (
            <>
              <div><h3>Integrations</h3><p className="muted small">Connect CRM, payroll, and mapping systems.</p></div>

              <div className="integ-card">
                <div className="integ-logo">HS</div>
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <h4 style={{ fontSize: 15 }}>HubSpot</h4>
                    <span className="badge badge-onsite">Connected</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    Sync contacts, deals, and pipeline stages bidirectionally. Last sync 4 minutes ago · 1,284 contacts, 89 active deals.
                  </div>
                </div>
                <button
                  className={"btn btn-sm " + (hsExpanded ? 'btn-dark' : 'btn-outline')}
                  onClick={() => setHsExpanded(v => !v)}
                  aria-expanded={hsExpanded}>
                  <Icon name="settings" size={12} /> Configure
                  <Icon name={hsExpanded ? 'chevron_up' : 'chevron_down'} size={11} />
                </button>
                <button className="btn btn-ghost btn-sm"><Icon name="refresh" size={12} /> Sync now</button>
              </div>
              {hsExpanded && (
                <div className="integ-config-expand">
                  <HubspotFieldMapping />
                </div>
              )}

              <div className="integ-card">
                <div className="integ-logo" style={{ background:'#2A6FDB' }}>G</div>
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <h4 style={{ fontSize: 15 }}>Google Maps Platform</h4>
                    <span className="badge badge-onsite">Connected</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>Distance Matrix + Routes API. Powers drive-time estimates and route optimization.</div>
                </div>
                <button className="btn btn-outline btn-sm">Configure</button>
              </div>

              <div className="integ-card">
                <div className="integ-logo" style={{ background:'#1F8A5B' }}>QB</div>
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <h4 style={{ fontSize: 15 }}>QuickBooks Time</h4>
                    <span className="badge badge-scheduled">Not connected</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>Push approved timesheets to payroll.</div>
                </div>
                <button className="btn btn-primary btn-sm">Connect</button>
              </div>

              <div className="integ-card">
                <div className="integ-logo" style={{ background:'#000' }}>T</div>
                <div style={{ flex: 1 }}>
                  <div className="row">
                    <h4 style={{ fontSize: 15 }}>Twilio</h4>
                    <span className="badge badge-onsite">Connected</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>Customer SMS for arrival windows and "tech is on the way" notifications.</div>
                </div>
                <button className="btn btn-outline btn-sm">Configure</button>
              </div>

            </>
          )}

          {section === 'roles' && (
            <>
              <div><h3>Roles & skill levels</h3><p className="muted small">Define what roles exist and how they're tiered.</p></div>
              <div className="card" style={{ padding: 0, overflow:'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Short label</th>
                      <th>Levels</th>
                      <th>Needs truck</th>
                      <th style={{ textAlign:'right' }}>Headcount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ROLES).map(([k, r]) => (
                      <tr key={k}>
                        <td><span style={{ fontWeight: 600 }}>{r.label}</span></td>
                        <td className="mono small">{r.short}</td>
                        <td>{r.levels.map(l => <span key={l} className="tag" style={{ marginRight: 4 }}>{l}</span>)}</td>
                        <td>{r.needsTruck ? <Icon name="check" size={14} stroke="var(--jetson-green)" /> : <span className="muted">—</span>}</td>
                        <td style={{ textAlign:'right' }} className="mono">{PEOPLE.filter(p => p.roles.includes(k)).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'hours' && (
            <>
              <div><h3>Hours & holidays</h3><p className="muted small">Standard working hours and company holidays — affect availability and scheduling suggestions.</p></div>
              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Default schedule</h4>
                <div style={{ display:'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 12, alignItems:'center' }}>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d, i) => (
                    <React.Fragment key={d}>
                      <span style={{ fontWeight: 600 }}>{d}</span>
                      <input className="input" defaultValue={i < 5 ? '7:00 AM' : i === 5 ? '8:00 AM' : 'Closed'} />
                      <input className="input" defaultValue={i < 5 ? '5:00 PM' : i === 5 ? '2:00 PM' : 'Closed'} />
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Company holidays (2026)</h4>
                <div className="col" style={{ gap: 6 }}>
                  {['Jan 1 · New Year\'s Day','May 25 · Memorial Day','Jul 3 · Independence Day','Sep 7 · Labor Day','Nov 26 · Thanksgiving','Dec 25 · Christmas Day'].map(h => (
                    <div key={h} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <Icon name="calendar" size={14} stroke="var(--fg-muted)" />
                      <span style={{ fontSize: 13 }}>{h}</span>
                      <IconButton icon="x" label="Remove" />
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}><Icon name="plus" size={12} /> Add holiday</button>
              </div>
            </>
          )}

          {section === 'permissions' && (
            <>
              <div><h3>Permissions</h3><p className="muted small">Who can do what.</p></div>
              <div className="card" style={{ padding: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th style={{ textAlign:'center' }}>Create jobs</th>
                      <th style={{ textAlign:'center' }}>Assign crews</th>
                      <th style={{ textAlign:'center' }}>Edit templates</th>
                      <th style={{ textAlign:'center' }}>Approve timesheets</th>
                      <th style={{ textAlign:'center' }}>Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Owner / GM',        [1,1,1,1,1]],
                      ['Dispatcher',        [1,1,0,1,0]],
                      ['Ops Manager',       [1,1,1,1,0]],
                      ['Field Supervisor',  [0,1,0,0,0]],
                      ['Technician',        [0,0,0,0,0]],
                    ].map(([role, perms]) => (
                      <tr key={role}>
                        <td style={{ fontWeight: 600 }}>{role}</td>
                        {perms.map((v, i) => (
                          <td key={i} style={{ textAlign:'center' }}>
                            {v ? <Icon name="check" size={16} stroke="var(--jetson-green)" /> : <span className="muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TimesheetsView, SettingsView });
