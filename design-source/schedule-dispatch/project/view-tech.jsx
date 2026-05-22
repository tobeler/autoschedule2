/* eslint-disable */
/* Mobile Tech App — phone-framed installer view */

const { useState: useST, useEffect: useET } = React;

// Mock checklists per job type (would be defined in settings normally)
// Note: shape differs from the canonical CHECKLISTS in data.js (uses text/done
// for the tech-view UI rather than label/type/required).
const TECH_CHECKLISTS = {
  heatpump: [
    { section: 'Pre-install', items: [
      { id:'p1', text:'Confirm equipment matches sales order', done: true },
      { id:'p2', text:'Walk customer through scope of work', done: true },
      { id:'p3', text:'Lay down floor protection', done: true },
      { id:'p4', text:'Lockout/tagout existing system', done: true },
    ]},
    { section: 'Mechanical', items: [
      { id:'m1', text:'Recover refrigerant from existing system', done: true },
      { id:'m2', text:'Remove old condenser + air handler', done: true },
      { id:'m3', text:'Install new outdoor unit on pad', done: true },
      { id:'m4', text:'Install new indoor air handler', done: false },
      { id:'m5', text:'Run line set + secure', done: false },
      { id:'m6', text:'Connect condensate drain + trap', done: false },
      { id:'m7', text:'Vacuum + pressure test (500 micron)', done: false },
    ]},
    { section: 'Electrical (handoff)', items: [
      { id:'e1', text:'Dedicated 240V circuit landed', done: false },
      { id:'e2', text:'Disconnect installed within sight', done: false },
      { id:'e3', text:'Grounding verified', done: false },
    ]},
    { section: 'Commissioning', items: [
      { id:'c1', text:'Charge to manufacturer spec', done: false },
      { id:'c2', text:'Verify temperature split (heat + cool)', done: false },
      { id:'c3', text:'Pair Jetson thermostat', done: false },
      { id:'c4', text:'Customer walk-through + signature', done: false },
      { id:'c5', text:'Submit commissioning photos', done: false },
    ]},
  ],
  service: [
    { section: 'Diagnosis', items: [
      { id:'d1', text:'Customer-reported issue confirmed', done: false },
      { id:'d2', text:'Visual inspection of indoor + outdoor units', done: false },
      { id:'d3', text:'Check refrigerant pressures', done: false },
    ]},
    { section: 'Repair', items: [
      { id:'r1', text:'Repair completed', done: false },
      { id:'r2', text:'System retest after repair', done: false },
      { id:'r3', text:'Customer sign-off', done: false },
    ]},
  ],
  water: [
    { section: 'Pre-install', items: [
      { id:'w1', text:'Shut off water + drain old tank', done: false },
      { id:'w2', text:'Confirm dedicated circuit available', done: false },
    ]},
    { section: 'Install', items: [
      { id:'w3', text:'Remove old water heater', done: false },
      { id:'w4', text:'Position new heat pump water heater', done: false },
      { id:'w5', text:'Connect supply + drain lines', done: false },
      { id:'w6', text:'Set up condensate drain', done: false },
    ]},
    { section: 'Commissioning', items: [
      { id:'w7', text:'Power on + verify operation', done: false },
      { id:'w8', text:'Set tank temp to 120°F', done: false },
      { id:'w9', text:'Customer walk-through', done: false },
    ]},
  ],
};

// Photo categories  
const PHOTO_CATEGORIES = [
  { id: 'pre', label: 'Before', count: 4, gradient: 'tech-photo-pre' },
  { id: 'mid', label: 'During', count: 6, gradient: 'tech-photo-mid' },
  { id: 'post', label: 'After', count: 2, gradient: 'tech-photo-post' },
];

// =============================================================
// Inline icons used inside the phone
// =============================================================
function TIcon({ name, size = 18, fill = 'none', stroke = 'currentColor' }) {
  return <Icon name={name} size={size} stroke={stroke} strokeWidth={2} />;
}

// =============================================================
// TECH APP — root (lives inside iOS frame)
// =============================================================
function TechApp({ techId, onClose }) {
  const [screen, setScreen] = useST('today');    // today | job | time | profile
  const [activeJobId, setActiveJobId] = useST(null);
  const [detailTab, setDetailTab] = useST('overview'); // overview | checklist | photos | parts
  const [jobStates, setJobStates] = useST({});    // overrides per-job status

  const tech = getPerson(techId);
  const todayJobs = JOBS
    .filter(j => j.date === dateKey(TODAY) && j.slots.some(s => s.assignedTo === techId))
    .sort((a, b) => a.startHour - b.startHour);

  // Always default to the current/first active job when entering "job" screen
  useET(() => {
    if (screen === 'job' && !activeJobId && todayJobs.length) {
      const live = todayJobs.find(j => ['onsite','enroute'].includes(j.status)) || todayJobs[0];
      setActiveJobId(live.id);
    }
  }, [screen]);

  const activeJob = activeJobId ? JOBS.find(j => j.id === activeJobId) : null;
  const liveJob = todayJobs.find(j => ['onsite','enroute'].includes(j.status));

  // Computed counters
  const hoursOnClock = 3.5;
  const completedCount = todayJobs.filter(j => j.status === 'complete').length;

  return (
    <IOSDevice width={402} height={874} dark={false} title="Jetson">
      {/* TODAY SCREEN */}
      {screen === 'today' && (
        <div className="tech-body">
          <div className="tech-header">
            <div className="tech-h-greeting">Good morning,</div>
            <div className="tech-h-name">{tech.name.split(' ')[0]}.</div>
            <div className="tech-h-row">
              <div className="tech-h-stat">
                <div className="tech-h-stat-label">On clock</div>
                <div className="tech-h-stat-value">{hoursOnClock}h</div>
              </div>
              <div className="tech-h-stat">
                <div className="tech-h-stat-label">Today's stops</div>
                <div className="tech-h-stat-value">{todayJobs.length}</div>
              </div>
              <div className="tech-h-stat">
                <div className="tech-h-stat-label">Done</div>
                <div className="tech-h-stat-value">{completedCount} / {todayJobs.length}</div>
              </div>
            </div>
          </div>

          {liveJob && (
            <div style={{ padding: '14px 16px 0' }}>
              <button className="tech-action-btn" style={{ margin: 0, width: '100%' }}
                onClick={() => { setActiveJobId(liveJob.id); setScreen('job'); }}>
                {liveJob.status === 'enroute' ? <><TIcon name="map_pin" size={16} /> Continue · en route to {getCustomer(liveJob.customer)?.name.split(' ')[0]}</>
                  : <><TIcon name="check" size={16} /> Continue · on site at {getCustomer(liveJob.customer)?.name.split(' ')[0]}</>}
              </button>
            </div>
          )}

          <div className="tech-content">
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform:'uppercase', color: '#666858', margin: '8px 4px' }}>
              Schedule · today
            </div>

            {todayJobs.map((job, i) => {
              const c = getCustomer(job.customer);
              const jt = getJobType(job.type);
              const isCurrent = job.id === liveJob?.id;
              return (
                <React.Fragment key={job.id}>
                  <div className={"tech-job-card" + (isCurrent ? ' current' : '')}
                    onClick={() => { setActiveJobId(job.id); setScreen('job'); }}>
                    <div className="tech-job-card-accent" style={{ background: 'var(--' + jt.color + ')' }}></div>
                    <div className="tech-job-card-body">
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span className="tech-job-time">{fmtTime(job.startHour)} – {fmtTime(job.startHour + job.durationHrs)}</span>
                        {job.status === 'complete' && <span style={{ fontSize:10, fontWeight:700, color:'#1A6F2E' }}>✓ COMPLETE</span>}
                        {job.status === 'onsite' && <span style={{ fontSize:10, fontWeight:800, color:'#1A6F2E', textTransform:'uppercase' }}>● On site</span>}
                        {job.status === 'enroute' && <span style={{ fontSize:10, fontWeight:800, color:'#8A5500', textTransform:'uppercase' }}>● En route</span>}
                      </div>
                      <div className="tech-job-name">{c ? c.name : job.address?.split('·')[0]}</div>
                      <div className="tech-job-addr">{job.address}</div>
                      <div style={{ display:'flex', gap: 6, marginTop: 8 }}>
                        <span className="jt-tag" style={{ fontSize: 9 }}>{jt.short}</span>
                        <span style={{ fontSize: 11, color:'#666858' }}>{hoursToStr(job.durationHrs)}</span>
                      </div>
                    </div>
                  </div>
                  {i < todayJobs.length - 1 && (() => {
                    const next = todayJobs[i + 1];
                    const seed = (job.id + next.id).split('').reduce((s,c) => s + c.charCodeAt(0), 0);
                    const drive = 12 + (seed % 24);
                    const miles = (3 + (seed % 9)).toFixed(1);
                    return (
                      <div style={{ display:'flex', alignItems:'center', gap: 8, padding:'2px 16px', color:'#666858', fontSize: 11 }}>
                        <div style={{ width: 28, display:'flex', justifyContent:'center' }}>
                          <TIcon name="truck" size={14} stroke="#666858" />
                        </div>
                        <span>{drive} min · {miles} mi · I-90 E</span>
                      </div>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </div>

          <TechBottomNav screen={screen} onScreen={setScreen} />
        </div>
      )}

      {/* JOB DETAIL SCREEN */}
      {screen === 'job' && activeJob && (
        <TechJobDetail
          job={activeJob}
          tab={detailTab}
          onTab={setDetailTab}
          onBack={() => { setScreen('today'); setDetailTab('overview'); }}
          jobStates={jobStates}
          setJobStates={setJobStates}
        />
      )}

      {/* TIME SCREEN */}
      {screen === 'time' && (
        <div className="tech-body">
          <div className="tech-header brand-green">
            <div className="tech-h-greeting" style={{ color:'rgba(15,31,13,0.7)' }}>This week</div>
            <div className="tech-h-name">Time</div>
            <div className="tech-h-row">
              <div className="tech-h-stat dark"><div className="tech-h-stat-label">On clock</div><div className="tech-h-stat-value">3.5h</div></div>
              <div className="tech-h-stat dark"><div className="tech-h-stat-label">This week</div><div className="tech-h-stat-value">28.5h</div></div>
              <div className="tech-h-stat dark"><div className="tech-h-stat-label">OT</div><div className="tech-h-stat-value">0h</div></div>
            </div>
          </div>
          <div className="tech-content">
            <div className="tech-time-clock-card">
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform:'uppercase', opacity: 0.7 }}>Today · started 7:14 AM</div>
              <div className="tech-time-big" style={{ marginTop: 6 }}>03:24:18</div>
              <div style={{ display:'flex', gap: 8, marginTop: 12 }}>
                <button className="tech-action-btn" style={{ margin: 0, padding: '12px', fontSize: 14, background:'rgba(15,31,13,0.9)', color:'#FBFAF1', boxShadow:'none' }}>
                  Start break
                </button>
                <button className="tech-action-btn" style={{ margin: 0, padding: '12px', fontSize: 14, background:'rgba(255,255,255,0.9)', color:'#0F1F0D', boxShadow:'none' }}>
                  End shift
                </button>
              </div>
            </div>

            <div className="tech-section">
              <div className="tech-section-title">Today's breakdown</div>
              {[
                { time: '7:14a', label: 'Clocked in at yard', dur: '—' },
                { time: '7:32a', label: 'Drive · yard → Newton', dur: '0:28' },
                { time: '8:00a', label: 'On site · 142 Elm Ridge Rd', dur: '2:42' },
                { time: '10:42a', label: 'Auto-recorded · current', dur: 'live' },
              ].map((row, i) => (
                <div key={i} className="tech-list-item">
                  <span className="mono" style={{ width: 50, fontSize: 11, color: '#666858' }}>{row.time}</span>
                  <span style={{ flex: 1 }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: row.dur === 'live' ? '#3CD567' : '#666858' }}>{row.dur}</span>
                </div>
              ))}
            </div>

            <div className="tech-section">
              <div className="tech-section-title">This week</div>
              {[['Mon', 7.6], ['Tue', 8.4], ['Wed', 8.1], ['Thu', 3.5], ['Fri', 0], ['Sat', 0], ['Sun', 0]].map(([d, h]) => (
                <div key={d} style={{ display:'grid', gridTemplateColumns:'40px 1fr 50px', gap: 8, padding: '8px 0', borderBottom: '1px solid #E2E1D3', alignItems:'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{d}</span>
                  <div style={{ height: 6, background: '#E2E1D3', borderRadius: 999, overflow:'hidden' }}>
                    <div style={{ width: (h / 10) * 100 + '%', height: '100%', background: h > 8 ? '#FFB627' : '#3CD567' }}></div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, textAlign:'right' }}>{h.toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </div>
          <TechBottomNav screen={screen} onScreen={setScreen} />
        </div>
      )}

      {/* PROFILE SCREEN */}
      {screen === 'profile' && (
        <div className="tech-body">
          <div className="tech-header">
            <div className="tech-h-greeting">Crew</div>
            <div className="tech-h-name">{getCrew(tech.defaultCrew)?.name}</div>
          </div>
          <div className="tech-content">
            <div className="tech-section">
              <div style={{ display:'flex', gap: 12, alignItems:'center' }}>
                <Avatar person={tech} size="lg" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{tech.name}</div>
                  <div style={{ fontSize: 12, color:'#666858' }}>{ROLES[tech.roles[0]].label} · {tech.level}</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginTop: 14 }}>
                <div style={{ background:'#F2F0E4', padding: 10, borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight:700, color:'#666858', textTransform:'uppercase', letterSpacing:'0.08em' }}>Pay period</div>
                  <div style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 20, marginTop: 4 }}>72.5h</div>
                </div>
                <div style={{ background:'#F2F0E4', padding: 10, borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight:700, color:'#666858', textTransform:'uppercase', letterSpacing:'0.08em' }}>First-time-fix</div>
                  <div style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 20, marginTop: 4 }}>96%</div>
                </div>
              </div>
            </div>

            <div className="tech-section">
              <div className="tech-section-title">Settings</div>
              {['Notifications','Truck inventory','Time-off requests','Pay stubs','Help & support','Sign out'].map((s, i) => (
                <div key={i} className="tech-list-item" style={{ cursor: 'pointer' }}>
                  <span style={{ flex: 1 }}>{s}</span>
                  <TIcon name="chevron_right" size={14} stroke="#ACAA93" />
                </div>
              ))}
            </div>
          </div>
          <TechBottomNav screen={screen} onScreen={setScreen} />
        </div>
      )}
    </IOSDevice>
  );
}

// =============================================================
// JOB DETAIL inside the phone
// =============================================================
function TechJobDetail({ job, tab, onTab, onBack, jobStates, setJobStates }) {
  const customer = getCustomer(job.customer);
  const jt = getJobType(job.type);
  const status = jobStates[job.id]?.status || job.status;
  const checklist = TECH_CHECKLISTS[job.type] || TECH_CHECKLISTS.heatpump;
  const [checked, setChecked] = useST(() => {
    const init = {};
    checklist.forEach(sec => sec.items.forEach(item => init[item.id] = item.done));
    return init;
  });

  const allItems = checklist.flatMap(s => s.items);
  const doneCount = allItems.filter(i => checked[i.id]).length;
  const totalCount = allItems.length;

  function advance() {
    if (status === 'scheduled')    return setJobStates(s => ({ ...s, [job.id]: { status: 'enroute' } }));
    if (status === 'enroute')      return setJobStates(s => ({ ...s, [job.id]: { status: 'onsite' } }));
    if (status === 'onsite')       return setJobStates(s => ({ ...s, [job.id]: { status: 'complete' } }));
  }
  const actionLabel = {
    scheduled: '🚐  I\'m on my way',
    enroute: '📍  I\'ve arrived',
    onsite: '✓  Complete job',
    complete: 'Completed',
    callback: '✓  Resolve callback',
  }[status];

  return (
    <div className="tech-body">
      <div className="tech-header" style={{ background: 'linear-gradient(180deg, ' + getJobTypeHeaderColor(job.type) + ' 100%)', paddingBottom: 20 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.18)', border:'none', borderRadius: 999, padding: 6, color:'inherit', cursor:'pointer', display:'flex' }}>
            <TIcon name="chevron_left" size={16} />
          </button>
          <span style={{ fontSize: 11, opacity: 0.85, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight: 700 }}>{job.id} · {jt.label}</span>
        </div>
        <div className="tech-detail-status" style={{ marginTop: 12 }}>{status === 'onsite' ? '● On site' : status === 'enroute' ? '● En route' : statusLabel(status)}</div>
        <div className="tech-detail-name">{customer?.name || job.address?.split('·')[0]}</div>
        <div className="tech-detail-meta">
          <TIcon name="map_pin" size={13} />
          <span>{job.address}</span>
        </div>
        <div className="tech-detail-meta">
          <TIcon name="clock" size={13} />
          <span>{fmtTime(job.startHour)}–{fmtTime(job.startHour + job.durationHrs)} · {hoursToStr(job.durationHrs)}</span>
        </div>
      </div>

      {status !== 'complete' && (
        <button className={"tech-action-btn " + (status === 'onsite' ? 'dark' : '')} onClick={advance}>
          {actionLabel}
        </button>
      )}
      {status === 'complete' && (
        <div className="tech-section" style={{ background:'#DCF8E1', border:'1px solid #3CD567', textAlign:'center', padding: 18 }}>
          <TIcon name="check" size={24} stroke="#1A6F2E" />
          <div style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16, marginTop: 6 }}>Job complete</div>
          <div style={{ fontSize: 12, color:'#1A6F2E' }}>Sent to dispatch · timesheet auto-drafted</div>
        </div>
      )}

      <div className="tech-detail-tabs">
        {[
          ['overview','Overview'],
          ['checklist','Checklist'],
          ['photos','Photos'],
          ['parts','Parts'],
        ].map(([k, l]) => (
          <button key={k} className={"tech-detail-tab" + (tab === k ? ' active' : '')} onClick={() => onTab(k)}>
            {l}
            {k === 'checklist' && <span style={{ marginLeft: 4, opacity: 0.7 }}>{doneCount}/{totalCount}</span>}
          </button>
        ))}
      </div>

      <div className="tech-content" style={{ paddingTop: 4 }}>
        {tab === 'overview' && (
          <>
            <div className="tech-section">
              <div className="tech-section-title">Crew on this job</div>
              {job.slots.filter(s => s.assignedTo).map(s => {
                const p = getPerson(s.assignedTo);
                return (
                  <div key={s.id} className="tech-list-item">
                    <Avatar person={p} size="sm" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color:'#666858' }}>{ROLES[s.role].label} · {hoursToStr(s.hours)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="tech-section">
              <div className="tech-section-title">Customer</div>
              <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                <Avatar person={{ initials: customer?.name.split(' ').map(s=>s[0]).slice(0,2).join('') || 'C', name: customer?.name || '' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{customer?.name}</div>
                  <div style={{ fontSize: 12, color:'#666858' }}>{customer?.phone}</div>
                </div>
                <button style={{ background:'#3CD567', border:'none', width: 40, height: 40, borderRadius: 999, color: '#0F1F0D', cursor: 'pointer' }}>
                  <TIcon name="phone" size={16} />
                </button>
              </div>
              <div className="map-stub" style={{ marginTop: 10, height: 120, borderRadius: 10 }}>
                <div className="map-pin" style={{ top: '60%', left: '50%' }}>
                  <div className="pin-dot"><TIcon name="home" size={12} /></div>
                </div>
              </div>
              <button style={{ marginTop: 8, width:'100%', padding: '10px', background:'#0F1F0D', color:'#FBFAF1', border:'none', borderRadius: 10, fontFamily:'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap: 6 }}>
                <TIcon name="map_pin" size={14} /> Navigate · Apple Maps
              </button>
            </div>

            {job.notes && (
              <div className="tech-section">
                <div className="tech-section-title">Notes from dispatch</div>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{job.notes}</div>
              </div>
            )}

            <div className="tech-section">
              <div className="tech-section-title">Truck · {getTruck(job.truckId)?.name}</div>
              <div style={{ fontSize: 12, color:'#666858' }}>{getTruck(job.truckId)?.capacity}</div>
              <div style={{ fontSize: 11, fontFamily:'var(--font-mono)', color:'#666858', marginTop: 4 }}>{getTruck(job.truckId)?.plate}</div>
            </div>
          </>
        )}

        {tab === 'checklist' && (
          <div className="tech-section">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
              <div className="tech-section-title" style={{ marginBottom: 0 }}>Job checklist</div>
              <span style={{ fontSize: 11, color:'#666858', fontVariantNumeric:'tabular-nums' }}>{doneCount} / {totalCount}</span>
            </div>
            <div style={{ height: 4, background: '#E2E1D3', borderRadius: 999, overflow:'hidden', marginBottom: 8 }}>
              <div style={{ width: (doneCount / totalCount * 100) + '%', height: '100%', background:'#3CD567' }}></div>
            </div>
            {checklist.map(section => (
              <div key={section.section}>
                <div className="tech-checklist-section-title">{section.section}</div>
                {section.items.map(item => (
                  <div key={item.id} className={"tech-checklist-item" + (checked[item.id] ? ' done' : '')}
                    onClick={() => setChecked(c => ({ ...c, [item.id]: !c[item.id] }))}
                    style={{ cursor: 'pointer' }}>
                    <div className={"tech-checkbox" + (checked[item.id] ? ' done' : '')}>
                      {checked[item.id] && <TIcon name="check" size={14} stroke="#0F1F0D" />}
                    </div>
                    <span className="check-name">{item.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'photos' && (
          <>
            {PHOTO_CATEGORIES.map(cat => (
              <div key={cat.id} className="tech-section">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
                  <div className="tech-section-title" style={{ marginBottom: 0 }}>{cat.label}</div>
                  <span style={{ fontSize: 11, color:'#666858' }}>{cat.count} photo{cat.count === 1 ? '' : 's'}</span>
                </div>
                <div className="tech-photo-grid">
                  {Array.from({ length: cat.count }).map((_, i) => (
                    <div key={i} className={"tech-photo " + cat.gradient}>
                      <span className="tech-photo-label">{cat.label.slice(0,3).toUpperCase()}</span>
                    </div>
                  ))}
                  <div className="tech-photo empty">
                    <TIcon name="plus" size={20} stroke="#ACAA93" />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'parts' && (
          <div className="tech-section">
            <div className="tech-section-title">Parts used</div>
            {[
              { sku:'HP-OD-4T-J5', name:'Jetson 4-ton outdoor unit', qty: 1 },
              { sku:'HP-AH-4T-J5', name:'Jetson 4-ton air handler',  qty: 1 },
              { sku:'LS-3458-7',   name:'Line set 3/8 + 5/8, 25ft',  qty: 1 },
              { sku:'CD-T-3478',   name:'Condensate trap',           qty: 1 },
              { sku:'THM-J2',      name:'Jetson Thermostat',         qty: 1 },
            ].map((p, i) => (
              <div key={i} className="tech-list-item">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 11, color:'#666858' }}>{p.sku}</div>
                </div>
                <span style={{ marginLeft:'auto', fontSize: 13, fontWeight: 700 }}>×{p.qty}</span>
              </div>
            ))}
            <button style={{ marginTop: 8, padding: 10, width:'100%', background:'#F2F0E4', border:'1px solid #E2E1D3', borderRadius: 10, fontFamily:'inherit', fontSize: 13, fontWeight: 600, cursor:'pointer', color:'#0F1F0D', display:'flex', alignItems:'center', justifyContent:'center', gap: 6 }}>
              <TIcon name="plus" size={14} /> Add part / scan SKU
            </button>
          </div>
        )}
      </div>

      <TechBottomNav screen="job" onScreen={() => onBack()} />
    </div>
  );
}

function TechBottomNav({ screen, onScreen }) {
  return (
    <div className="tech-tabs">
      {[
        ['today',   'Today',   'calendar'],
        ['job',     'Job',     'briefcase'],
        ['time',    'Time',    'timer'],
        ['profile', 'Profile', 'user'],
      ].map(([k, label, icon]) => (
        <button key={k} className={"tech-tab" + (screen === k ? ' active' : '')} onClick={() => onScreen(k)}>
          <span className="tech-tab-icon-bg"><TIcon name={icon} size={16} stroke="currentColor" /></span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function getJobTypeHeaderColor(type) {
  const map = {
    heatpump: '#0F1F0D 0%, #1A6F2E',
    water: '#1E5E80 0%, #4FB3E8',
    electrical: '#6F4400 0%, #B95F1D',
    service: '#0F1F0D 0%, #113823',
    warranty: '#6F3A11 0%, #B95F1D',
    callback: '#781E1E 0%, #C53030',
    retrofit: '#3A6816 0%, #6F8A2C',
    walkthrough: '#3A2E80 0%, #6B5BCF',
    meeting: '#666858 0%, #ACAA93',
  };
  return map[type] || map.heatpump;
}

// =============================================================
// TECH VIEW — outer wrapper with persona switcher
// =============================================================
function TechView() {
  const [techId, setTechId] = useST('p6'); // Tyree Booker — on today's heatpump install

  const tech = getPerson(techId);
  const todayJobs = JOBS.filter(j => j.date === dateKey(TODAY) && j.slots.some(s => s.assignedTo === techId));

  return (
    <>
      <PageHeader eyebrow="Mobile" title="Tech app preview" subtitle="What installers and technicians see on their phone in the field. Pick a tech to preview their day.">
        <button className="btn btn-outline btn-sm"><Icon name="expand" size={14} /> Open standalone</button>
      </PageHeader>

      <div className="tech-stage">
        <div className="tech-stage-side">
          <div className="tech-stage-side-card">
            <div className="eyebrow-sm" style={{ marginBottom: 8 }}>Viewing as</div>
            <div className="row" style={{ marginBottom: 12 }}>
              <Avatar person={tech} size="lg" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{tech.name}</div>
                <div className="muted small">{ROLES[tech.roles[0]].label} · {tech.level}</div>
              </div>
            </div>
            <div className="muted small" style={{ marginBottom: 8 }}>{todayJobs.length} job{todayJobs.length === 1 ? '' : 's'} today · {getCrew(tech.defaultCrew)?.name}</div>
            <select className="select" style={{ width: '100%' }} value={techId} onChange={e => setTechId(e.target.value)}>
              {PEOPLE.filter(p => JOBS.some(j => j.date === dateKey(TODAY) && j.slots.some(s => s.assignedTo === p.id))).map(p => (
                <option key={p.id} value={p.id}>{p.name} — {ROLES[p.roles[0]].label}</option>
              ))}
            </select>
          </div>

          <div className="tech-stage-side-card">
            <div className="eyebrow-sm" style={{ marginBottom: 8 }}>What the tech can do</div>
            <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, lineHeight: 1.6 }}>
              <li>View today's stops with arrival windows</li>
              <li>Tap-through status: en route → on site → complete</li>
              <li>Auto-tracked travel + on-site time</li>
              <li>Job-type-specific checklists with section progress</li>
              <li>Before / during / after photo capture</li>
              <li>Parts used + SKU scanning</li>
              <li>One-tap navigation handoff to Apple Maps</li>
              <li>Customer call + dispatch chat</li>
            </ul>
          </div>

          <div className="tech-stage-side-card" style={{ background: 'var(--bg-dark)', color:'var(--off-white)' }}>
            <div className="eyebrow-sm" style={{ color:'rgba(251,250,241,0.6)', marginBottom: 6 }}>How it feeds the back office</div>
            <div className="small" style={{ opacity: 0.85, lineHeight: 1.45 }}>
              Every status change pushes a timeline event to the dispatcher's job view. Travel + on-site segments auto-draft into the Timesheets tab — techs don't fill out paper.
            </div>
          </div>
        </div>

        <TechApp techId={techId} />

        <div className="tech-stage-side" style={{ display: 'flex' }}>
          <div className="tech-stage-side-card">
            <div className="eyebrow-sm" style={{ marginBottom: 8 }}>Live state</div>
            <div className="col" style={{ gap: 6, fontSize: 13 }}>
              <div className="row"><span className="dot" style={{ width: 8, height: 8, borderRadius: 999, background:'var(--jetson-green)' }}></span> Clocked in · 7:14a</div>
              <div className="row"><span className="dot" style={{ width: 8, height: 8, borderRadius: 999, background:'var(--jt-electrical)' }}></span> Battery 84% · GPS strong</div>
              <div className="row"><span className="dot" style={{ width: 8, height: 8, borderRadius: 999, background:'var(--mid-gray)' }}></span> Truck 07 · 38 mi today</div>
            </div>
          </div>
          <div className="tech-stage-side-card">
            <div className="eyebrow-sm" style={{ marginBottom: 8 }}>Dispatcher messages</div>
            <div className="col" style={{ gap: 8 }}>
              <div style={{ padding: 10, background:'var(--bg-subtle)', borderRadius: 10, fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Jordan · 8:42a</div>
                "Customer says side gate is unlocked, panel is in basement."
              </div>
              <div style={{ padding: 10, background:'var(--bg-subtle)', borderRadius: 10, fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Jordan · 9:15a</div>
                "Garrett (electrician) is ETA 12:30, not 12 like template — heads up."
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TechView, TechApp });
