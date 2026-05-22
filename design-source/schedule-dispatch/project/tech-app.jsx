/* eslint-disable */
/* Mobile Tech App — polished, standalone */

const { useState: useTS, useEffect: useTE, useMemo: useTM } = React;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function TI({ name, size = 18, stroke = 'currentColor', strokeWidth = 1.75 }) {
  return <Icon name={name} size={size} stroke={stroke} strokeWidth={strokeWidth} />;
}

// Day "moments" — let the user preview the same day at different times
const DAY_MODES = [
  { id: 'morning', label: 'Morning',     hour: 7.5,   time: '7:30a', clockedAt: 7 + 1/15 },
  { id: 'midday',  label: 'Midday',      hour: 10.75, time: '10:45a', clockedAt: 7 + 1/15 },
  { id: 'eod',     label: 'End of day',  hour: 16.75, time: '4:45p', clockedAt: 7 + 1/15 },
];

// Synthetic drive-segment between two consecutive stops (deterministic from job IDs)
function driveBetween(a, b) {
  const seed = (a.id + b.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    minutes: 14 + (seed % 22),
    miles: (3.2 + (seed % 9)).toFixed(1),
    via: ['I-90 E', 'MA-2 W', 'US-3 N', 'Storrow Dr', 'Mass Ave'][seed % 5],
  };
}

function fmtClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// Decide each job's effective state given a "now" hour
function effectiveStatus(job, now, override) {
  if (override) return override;
  const end = job.startHour + job.durationHrs;
  if (job.status === 'callback' && now < job.startHour) return 'scheduled';
  if (now < job.startHour - 0.5) return 'scheduled';
  if (now < job.startHour) return 'enroute';
  if (now < end) return 'onsite';
  return 'complete';
}

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────
function MobileTechApp() {
  // Eligible techs (anyone on today's roster)
  const techsToday = useTM(() =>
    PEOPLE.filter(p => JOBS.some(j =>
      j.date === dateKey(TODAY) &&
      j.slots.some(s => s.assignedTo === p.id)
    )),
  []);

  const [techId, setTechId] = useTS('p6');     // Tyree Booker — heat pump install
  const [modeId, setModeId] = useTS('midday');
  const mode = DAY_MODES.find(m => m.id === modeId);
  const now = mode.hour;

  const [screen, setScreen] = useTS('today');           // today | job | time
  const [activeJobId, setActiveJobId] = useTS(null);
  const [detailTab, setDetailTab] = useTS('overview');  // overview | checklist | photos | parts
  const [overrides, setOverrides] = useTS({});          // jobId -> status
  const [spilloverFor, setSpilloverFor] = useTS(null);   // job object when "Continue tomorrow" flagged

  const tech = getPerson(techId);
  const todayJobs = useTM(() =>
    JOBS
      .filter(j => j.date === dateKey(TODAY) && j.slots.some(s => s.assignedTo === techId))
      .sort((a, b) => a.startHour - b.startHour),
    [techId]
  );

  const liveJob = todayJobs.find(j => ['onsite','enroute'].includes(effectiveStatus(j, now, overrides[j.id])));
  const completedCount = todayJobs.filter(j => effectiveStatus(j, now, overrides[j.id]) === 'complete').length;

  // Auto-pick job when entering Job screen
  useTE(() => {
    if (screen === 'job' && !activeJobId) {
      const j = liveJob || todayJobs[0];
      if (j) setActiveJobId(j.id);
    }
  }, [screen, liveJob, todayJobs.length]);

  // When tech changes, reset active job + go to today
  useTE(() => { setActiveJobId(null); setScreen('today'); setOverrides({}); }, [techId]);

  const activeJob = activeJobId ? todayJobs.find(j => j.id === activeJobId) || null : null;

  const hoursOnClock = Math.max(0, (now - mode.clockedAt));

  return (
    <div className="tech-page-shell">
      {/* TOP BAR */}
      <header className="tech-page-top">
        <div className="tech-page-brand">
          <img src="assets/logos/Jetson-Logo-Green.png" alt="Jetson" />
          <div>
            <div className="tech-page-brand-title">Jetson · Tech</div>
            <div className="tech-page-brand-sub">Mobile companion to Schedule + Dispatch</div>
          </div>
        </div>
        <div className="tech-page-eyebrow">Field view · iOS</div>
        <div className="tech-controls" style={{ justifyContent:'flex-end' }}>
          <PersonaSwitcher techs={techsToday} value={techId} onChange={setTechId} />
        </div>
      </header>

      {/* STAGE */}
      <div className="tech-page-stage">
        {/* LEFT — live state */}
        <aside className="stage-side" aria-label="Live tech state">
          <PersonaCard tech={tech} now={now} />
          <ModeSwitcher modes={DAY_MODES} value={modeId} onChange={setModeId} />
          <LiveStateCard mode={mode} now={now} jobs={todayJobs} overrides={overrides} />
        </aside>

        {/* CENTER — phone */}
        <IOSDevice width={402} height={874} dark={false}>
          <div className="in-phone">
            {screen === 'today' && (
              <TodayScreen
                tech={tech}
                mode={mode}
                now={now}
                jobs={todayJobs}
                overrides={overrides}
                liveJob={liveJob}
                completedCount={completedCount}
                hoursOnClock={hoursOnClock}
                onPickJob={(id) => { setActiveJobId(id); setScreen('job'); }}
              />
            )}
            {screen === 'job' && activeJob && (
              <JobDetailScreen
                job={activeJob}
                tab={detailTab}
                onTab={setDetailTab}
                now={now}
                status={effectiveStatus(activeJob, now, overrides[activeJob.id])}
                onAdvance={(next) => setOverrides(o => ({ ...o, [activeJob.id]: next }))}
                onContinue={() => setSpilloverFor(activeJob)}
                onBack={() => { setScreen('today'); setDetailTab('overview'); }}
              />
            )}
            {screen === 'time' && (
              <TimeScreen mode={mode} now={now} jobs={todayJobs} overrides={overrides} />
            )}

            <TabBar screen={screen} onScreen={setScreen} jobCount={todayJobs.length} />
          </div>

          {spilloverFor && (
            <SpilloverSheet
              job={spilloverFor}
              onClose={() => setSpilloverFor(null)}
              onConfirm={() => {
                setSpilloverFor(null);
              }}
            />
          )}
        </IOSDevice>

        {/* RIGHT — dispatcher / messages */}
        <aside className="stage-side" aria-label="Dispatcher side">
          <DispatcherCard mode={mode} />
          <UpNextCard jobs={todayJobs} now={now} overrides={overrides} />
          <BackOfficeCard />
        </aside>
      </div>

      <p className="tech-page-foot">
        Companion to the Schedule + Dispatch web app. Every status change you tap here
        emits a timeline event back to the dispatcher's job drawer. Travel and on-site segments
        auto-draft into Timesheets — no paper.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SIDE CARDS
// ─────────────────────────────────────────────────────────────
function PersonaCard({ tech, now }) {
  return (
    <div className="stage-card">
      <div className="ec">Viewing as</div>
      <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
        <Avatar person={tech} size="lg" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.15 }}>{tech.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>
            {ROLES[tech.roles[0]].label} · {tech.level} · {getCrew(tech.defaultCrew)?.name}
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonaSwitcher({ techs, value, onChange }) {
  return (
    <div className="tech-control-block">
      <span className="label">Tech</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {techs.map(p => (
          <option key={p.id} value={p.id}>{p.name} — {ROLES[p.roles[0]].label}</option>
        ))}
      </select>
    </div>
  );
}

function ModeSwitcher({ modes, value, onChange }) {
  return (
    <div className="stage-card">
      <div className="ec">Moment of day</div>
      <div style={{ display: 'grid', gridTemplateColumns:'1fr', gap: 6 }}>
        {modes.map(m => (
          <button key={m.id}
            onClick={() => onChange(m.id)}
            className="tech-seg-btn"
            style={{
              justifyContent: 'space-between',
              width: '100%',
              padding: '8px 12px',
              border: '1px solid ' + (m.id === value ? 'var(--forest)' : 'var(--border)'),
              background: m.id === value ? 'var(--forest)' : 'var(--surface-card)',
              color: m.id === value ? 'var(--off-white)' : 'var(--fg)',
              borderRadius: 10,
              fontSize: 12,
            }}>
            <span>{m.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.8 }}>{m.time}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LiveStateCard({ mode, now, jobs, overrides }) {
  const onJob = jobs.find(j => ['onsite','enroute'].includes(effectiveStatus(j, now, overrides[j.id])));
  return (
    <div className="stage-card dark">
      <div className="ec">Live state</div>
      <div className="stage-row" style={{ borderColor: 'rgba(251,250,241,0.1)' }}>
        <span className="dot" style={{ background: 'var(--jetson-green)' }}></span>
        <span>Clocked in · 7:04a</span>
        <span className="mono" style={{ color: 'rgba(251,250,241,0.6)' }}>{mode.time}</span>
      </div>
      <div className="stage-row" style={{ borderColor: 'rgba(251,250,241,0.1)' }}>
        <span className="dot" style={{ background: 'var(--jt-electrical)' }}></span>
        <span>GPS locked · battery 78%</span>
      </div>
      <div className="stage-row" style={{ borderColor: 'rgba(251,250,241,0.1)' }}>
        <span className="dot" style={{ background: 'var(--mid-gray)' }}></span>
        <span>Truck 07 · 38 mi today</span>
      </div>
      {onJob && (
        <div className="stage-row" style={{ borderColor: 'rgba(251,250,241,0.1)' }}>
          <span className="dot" style={{ background: 'var(--jetson-green)' }}></span>
          <span style={{ fontWeight: 600 }}>{effectiveStatus(onJob, now, overrides[onJob.id]) === 'onsite' ? 'On site' : 'En route'} · {onJob.id}</span>
        </div>
      )}
    </div>
  );
}

function DispatcherCard({ mode }) {
  const msgs = {
    morning: [
      { who: 'Jordan · dispatch', when: '7:02a', body: 'Morning, Tyree. Margaret\'s gate is on the left — code 8124. Garrett rolls at 12:30 for electrical handoff.' },
      { who: 'Jordan · dispatch', when: '7:14a', body: 'Heads up — Margaret has a small dog, friendly but skittish.' },
    ],
    midday: [
      { who: 'Jordan · dispatch', when: '10:18a', body: 'Customer just confirmed driveway is clear for the lift.' },
      { who: 'Garrett · electrician', when: '10:32a', body: 'On track for 12:30 arrival. I\'ll bring the 60-A disconnect.' },
    ],
    eod: [
      { who: 'Jordan · dispatch', when: '4:20p', body: 'Nice work today. Commissioning photos came through clean.' },
      { who: 'Jordan · dispatch', when: '4:41p', body: 'Tomorrow is Beacon St — same crew, 8a start.' },
    ],
  }[mode.id];
  return (
    <div className="stage-card">
      <div className="ec">Dispatcher channel</div>
      <div style={{ maxHeight: 220, overflow: 'auto' }}>
        {msgs.map((m, i) => (
          <div className="stage-msg" key={i}>
            <span className="who">{m.who}</span><span className="when">{m.when}</span>
            <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--fg)' }}>{m.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpNextCard({ jobs, now, overrides }) {
  const upcoming = jobs.find(j => {
    const s = effectiveStatus(j, now, overrides[j.id]);
    return s === 'scheduled' || s === 'enroute';
  });
  if (!upcoming) return (
    <div className="stage-card">
      <div className="ec">Up next</div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Day complete — drive back to yard.</div>
    </div>
  );
  const c = getCustomer(upcoming.customer);
  return (
    <div className="stage-card">
      <div className="ec">Up next</div>
      <div style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 14 }}>{c?.name || upcoming.address?.split('·')[0]}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{upcoming.address}</div>
      <div style={{ display:'flex', gap: 6, marginTop: 6 }}>
        <span className="tx-chip" style={{ background: 'var(--jt-' + JOB_TYPES[upcoming.type].color.replace('jt-','') + '-bg)', color: '#0F1F0D' }}>
          {JOB_TYPES[upcoming.type].short}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
          {fmtTime(upcoming.startHour)} · {hoursToStr(upcoming.durationHrs)}
        </span>
      </div>
    </div>
  );
}

function BackOfficeCard() {
  return (
    <div className="stage-card" style={{ background: 'rgba(60,213,103,0.08)', borderColor: 'rgba(60,213,103,0.4)' }}>
      <div className="ec" style={{ color: '#1A6F2E' }}>Counterpart to dispatch</div>
      <div style={{ fontSize: 12, lineHeight: 1.4, color: '#0F1F0D' }}>
        Every status change here pushes a timeline event to the dispatcher.
        Travel + on-site segments auto-draft into Timesheets.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TODAY SCREEN
// ─────────────────────────────────────────────────────────────
function TodayScreen({ tech, mode, now, jobs, overrides, liveJob, completedCount, hoursOnClock, onPickJob }) {
  return (
    <>
      {/* Header */}
      <div className="tx-header" style={{ paddingTop: 56 }}>
        <div className="tx-header-top">
          <span>{fmtDate(TODAY, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          <span className="live-pill"><span className="live-dot"></span>{mode.time}</span>
        </div>
        <div className="tx-name">Hi, {tech.name.split(' ')[0]}.</div>
        <div className="tx-sub">{getCrew(tech.defaultCrew)?.name} · Truck 07</div>
        <div className="tx-stats">
          <div className="tx-stat">
            <div className="tx-stat-label">On clock</div>
            <div className="tx-stat-value">{hoursOnClock.toFixed(1)}<span style={{ fontSize: 11, opacity: 0.6 }}>h</span></div>
          </div>
          <div className="tx-stat">
            <div className="tx-stat-label">Stops</div>
            <div className="tx-stat-value">{jobs.length}</div>
          </div>
          <div className="tx-stat">
            <div className="tx-stat-label">Done</div>
            <div className="tx-stat-value green">{completedCount}<span style={{ fontSize: 11, opacity: 0.6 }}>/{jobs.length}</span></div>
          </div>
        </div>
      </div>

      {/* Continue banner for the live job */}
      {liveJob && (() => {
        const c = getCustomer(liveJob.customer);
        const s = effectiveStatus(liveJob, now, overrides[liveJob.id]);
        return (
          <div className="tx-continue" onClick={() => onPickJob(liveJob.id)} role="button">
            <span className="badge">{s === 'enroute' ? 'En route' : 'On site'}</span>
            <div style={{ flex: 1 }}>
              <div className="ttl">{c?.name || liveJob.address?.split('·')[0]}</div>
              <div className="sub">{JOB_TYPES[liveJob.type].label} · {liveJob.id}</div>
            </div>
            <span className="arrow"><TI name="chevron_right" size={18} stroke="#0F1F0D" /></span>
          </div>
        );
      })()}

      <div className="tx-content">
        <div className="tx-sec-eyebrow">
          <span className="lbl">Route · today</span>
          <span className="meta">{jobs.length} stops · 38 mi</span>
        </div>

        <RouteTimeline jobs={jobs} now={now} overrides={overrides} onPick={onPickJob} />
      </div>
    </>
  );
}

function RouteTimeline({ jobs, now, overrides, onPick }) {
  return (
    <div className="tx-timeline">
      {jobs.map((job, i) => {
        const next = jobs[i + 1];
        const status = effectiveStatus(job, now, overrides[job.id]);
        const c = getCustomer(job.customer);
        const jt = JOB_TYPES[job.type];

        // node icon/label
        let nodeContent;
        let nodeCls = '';
        if (status === 'complete') { nodeContent = <TI name="check" size={12} stroke="#FBFAF1" />; nodeCls = 'done'; }
        else if (status === 'onsite') { nodeContent = i + 1; nodeCls = 'live'; }
        else if (status === 'enroute') { nodeContent = <TI name="truck" size={11} stroke="var(--jetson-green)" />; nodeCls = 'enroute'; }
        else { nodeContent = i + 1; }

        // accent color from job type
        const accentColor = `var(--${jt.color})`;

        // drive segment after this stop
        let drive = null;
        if (next) {
          drive = driveBetween(job, next);
        }

        return (
          <React.Fragment key={job.id}>
            <div className="tx-stop">
              <div className={"tx-stop-node " + nodeCls}>{nodeContent}</div>
              <div className={"tx-stop-card " + (status === 'onsite' || status === 'enroute' ? 'live' : '') + (status === 'complete' ? ' done' : '')}
                onClick={() => onPick(job.id)} role="button" tabIndex={0}>
                <div className="tx-stop-accent" style={{ background: accentColor }}></div>
                <div className="tx-stop-head">
                  <span>{fmtTime(job.startHour)} – {fmtTime(job.startHour + job.durationHrs)}</span>
                  {job.multidayGroupId && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 9, fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 999,
                      background: 'rgba(60,213,103,0.18)',
                      color: '#1A6F2E',
                      letterSpacing: '0.04em',
                      marginLeft: 4,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      <TI name="refresh" size={9} stroke="#1A6F2E" />
                      Day {job.multidayIndex}/{job.multidayTotal}
                    </span>
                  )}
                  <span className={"stat " + status}>{statusLabel(status)}</span>
                </div>
                <div className="name">{c?.name || job.address?.split('·')[0]}</div>
                <div className="addr">{job.address}</div>
                <div className="row2">
                  <span className="tx-chip" style={{ background: `var(--${jt.color}-bg)`, color: '#0F1F0D' }}>{jt.short}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{hoursToStr(job.durationHrs)}</span>
                  {job.slots.filter(s => s.assignedTo).length > 1 && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap: 4 }}>
                      <TI name="users" size={11} stroke="#666858" />
                      {job.slots.filter(s => s.assignedTo).length}
                    </span>
                  )}
                  {job.notes && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap: 4, marginLeft:'auto', color:'#8A5500' }}>
                      <TI name="alert_circle" size={11} stroke="#8A5500" />
                      Note
                    </span>
                  )}
                </div>
              </div>
            </div>

            {drive && (
              <div className="tx-drive">
                <span className="icon"><TI name="truck" size={12} stroke="#666858" /></span>
                <span className="miles">{drive.minutes} min</span>
                <span>·</span>
                <span className="miles">{drive.miles} mi</span>
                <span>·</span>
                <span>{drive.via}</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// JOB DETAIL SCREEN
// ─────────────────────────────────────────────────────────────
function JobDetailScreen({ job, tab, onTab, status, onAdvance, onBack }) {
  const c = getCustomer(job.customer);
  const jt = JOB_TYPES[job.type];

  // Mocked checklist state per job-type for the bar
  const [checked, setChecked] = useTS(() => {
    const init = {};
    (CHECKLISTS[job.type] || []).forEach(sec =>
      sec.items.forEach(it => { init[it.id] = false; })
    );
    // For an onsite job, fake some progress
    if (status === 'onsite' || status === 'complete') {
      const items = (CHECKLISTS[job.type] || []).flatMap(s => s.items);
      const target = status === 'complete' ? items.length : Math.floor(items.length * 0.55);
      items.slice(0, target).forEach(it => { init[it.id] = true; });
    }
    return init;
  });

  const sections = CHECKLISTS[job.type] || [];
  const allItems = sections.flatMap(s => s.items);
  const doneCount = allItems.filter(it => checked[it.id]).length;
  const totalCount = allItems.length;

  const advanceLabel = {
    scheduled: "I'm on my way",
    enroute:   "I've arrived",
    onsite:    "Complete job",
    complete:  "Job complete",
    callback:  "Resolve callback",
  }[status];
  function advance() {
    const next = { scheduled:'enroute', enroute:'onsite', onsite:'complete' }[status];
    if (next) onAdvance(next);
  }

  return (
    <>
      <div className="tj-detail-header" style={{ paddingTop: 56 }}>
        <button className="tj-back" onClick={onBack}>
          <TI name="chevron_left" size={14} />
          Today
        </button>
        <div className="tj-head-row">
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{job.id}</span>
          <span className={"tj-status " + status}>
            <span style={{
              display:'inline-block', width: 6, height: 6, borderRadius:'50%',
              background: 'currentColor',
              animation: status === 'onsite' ? 'live-pulse 2s infinite' : 'none',
            }}></span>
            {statusLabel(status)}
          </span>
        </div>
        <div className="tj-customer">{c?.name || job.address?.split('·')[0]}</div>
        <div className="tj-meta"><TI name="briefcase" size={12} stroke="rgba(251,250,241,0.7)" /> {jt.label}</div>
        <div className="tj-meta"><TI name="map_pin" size={12} stroke="rgba(251,250,241,0.7)" /> {job.address}</div>
        <div className="tj-meta"><TI name="clock" size={12} stroke="rgba(251,250,241,0.7)" /> {fmtTime(job.startHour)}–{fmtTime(job.startHour + job.durationHrs)} · {hoursToStr(job.durationHrs)}</div>

        {(status === 'onsite' || status === 'complete') && totalCount > 0 && (
          <div className="tj-detail-progress">
            <span>Checklist</span>
            <div className="track"><div className="fill" style={{ width: (doneCount/totalCount*100) + '%' }}></div></div>
            <span>{doneCount}/{totalCount}</span>
          </div>
        )}
        <div className="tj-detail-header-bar" style={{ background: `var(--${jt.color})` }}></div>
      </div>

      {status !== 'complete' && advanceLabel && (
        <div style={{ display: 'grid', gridTemplateColumns: status === 'onsite' ? '1fr auto' : '1fr', gap: 8, padding: '14px 16px 0' }}>
          <button className={"tj-action " + (status === 'onsite' ? 'dark' : '')} style={{ margin: 0, width: '100%' }} onClick={advance}>
            {status === 'scheduled' && <TI name="truck" size={16} stroke="#0F1F0D" />}
            {status === 'enroute' && <TI name="map_pin" size={16} stroke="#0F1F0D" />}
            {status === 'onsite' && <TI name="check" size={16} stroke="#FBFAF1" />}
            {advanceLabel}
          </button>
          {status === 'onsite' && !job.multidayGroupId && (
            <button
              style={{
                margin: 0, padding: '0 16px',
                background: 'rgba(255,182,39,0.18)',
                color: '#7A4900',
                border: '1px solid rgba(255,182,39,0.5)',
                borderRadius: 14,
                fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}
              onClick={() => onContinue && onContinue()}
              title="Flag this job to continue tomorrow — dispatcher will confirm the slot.">
              <TI name="refresh" size={14} stroke="#7A4900" />
              Continue tomorrow
            </button>
          )}
        </div>
      )}
      {status === 'complete' && (
        <div style={{ margin:'14px 16px 4px', padding:'12px 14px', background:'rgba(60,213,103,0.12)', border:'1px solid rgba(60,213,103,0.4)', borderRadius: 14, display:'flex', alignItems:'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background:'var(--jetson-green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <TI name="check" size={18} stroke="#0F1F0D" />
          </div>
          <div>
            <div style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>Wrapped up</div>
            <div style={{ fontSize: 11, color:'#1A6F2E' }}>Sent to dispatch · timesheet auto-drafted</div>
          </div>
        </div>
      )}

      <div className="tech-detail-tabs" style={{ marginTop: 14 }}>
        {[
          ['overview','Overview'],
          ['checklist','Checklist'],
          ['photos','Photos'],
          ['parts','Parts'],
        ].map(([k, label]) => (
          <button key={k} className={"tech-detail-tab" + (tab === k ? ' active' : '')} onClick={() => onTab(k)}>
            {label}
            {k === 'checklist' && totalCount > 0 && (
              <span style={{ marginLeft: 4, opacity: 0.7, fontFamily:'var(--font-mono)' }}>{doneCount}/{totalCount}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0 110px' }}>
        {tab === 'overview' && <TabOverview job={job} customer={c} status={status} />}
        {tab === 'checklist' && <TabChecklist sections={sections} checked={checked} setChecked={setChecked} doneCount={doneCount} totalCount={totalCount} />}
        {tab === 'photos' && <TabPhotos />}
        {tab === 'parts' && <TabParts />}
      </div>
    </>
  );
}

function TabOverview({ job, customer, status }) {
  const truck = getTruck(job.truckId);
  return (
    <>
      <div className="tech-section">
        <div className="tech-section-title">Customer</div>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <Avatar person={{ initials: customer?.name?.split(' ').map(s=>s[0]).slice(0,2).join('') || 'C', name: customer?.name || '' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{customer?.name}</div>
            <div style={{ fontSize: 11, color: '#666858' }}>{customer?.phone}</div>
          </div>
          <button style={{ background: 'var(--jetson-green)', border: 'none', width: 38, height: 38, borderRadius: 999, color: '#0F1F0D', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <TI name="phone" size={16} />
          </button>
        </div>
        <button style={{ marginTop: 12, width:'100%', padding: '11px', background:'#0F1F0D', color:'#FBFAF1', border:'none', borderRadius: 10, fontFamily:'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap: 8 }}>
          <TI name="map_pin" size={14} stroke="#FBFAF1" /> Navigate · Apple Maps
        </button>
      </div>

      {job.notes && (
        <div className="tech-section">
          <div className="tech-section-title" style={{ display:'flex', alignItems:'center', gap: 6 }}>
            <TI name="alert_circle" size={12} stroke="#8A5500" />
            Notes from dispatch
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>{job.notes}</div>
        </div>
      )}

      <div className="tech-section">
        <div className="tech-section-title">Crew on this job</div>
        {job.slots.filter(s => s.assignedTo).map(s => {
          const p = getPerson(s.assignedTo);
          if (!p) return null;
          const r = ROLES[s.role];
          return (
            <div key={s.id} className="tech-list-item">
              <Avatar person={p} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#666858' }}>{r.label} · {hoursToStr(s.hours)} · starts {fmtTime(job.startHour + s.start)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {truck && (
        <div className="tech-section">
          <div className="tech-section-title">Equipment</div>
          <div className="tech-list-item">
            <div style={{ width: 32, height: 32, background: '#F1EFE3', borderRadius: 8, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <TI name="truck" size={16} stroke="#0F1F0D" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{truck.name}</div>
              <div style={{ fontSize: 11, color: '#666858', fontFamily:'var(--font-mono)' }}>{truck.plate} · {truck.capacity}</div>
            </div>
          </div>
        </div>
      )}

      {job.hubspotDealId && (
        <div className="tech-section" style={{ background: '#FFF6F0', borderColor: 'rgba(255,122,89,0.3)' }}>
          <div className="tech-section-title" style={{ color: '#9F3D24' }}>HubSpot</div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Deal {job.hubspotDealId}</div>
              {job.price && <div style={{ fontSize: 11, color:'#666858' }}>${job.price.toLocaleString()}</div>}
            </div>
            <TI name="chevron_right" size={14} stroke="#ACAA93" />
          </div>
        </div>
      )}
    </>
  );
}

function TabChecklist({ sections, checked, setChecked, doneCount, totalCount }) {
  if (!sections.length) {
    return (
      <div className="tech-section">
        <div style={{ textAlign:'center', padding: 24, color:'#666858', fontSize: 13 }}>
          No checklist for this job type.
        </div>
      </div>
    );
  }
  return (
    <div className="tech-section">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
        <div className="tech-section-title" style={{ marginBottom: 0 }}>Job checklist</div>
        <span style={{ fontSize: 11, color: '#666858', fontFamily:'var(--font-mono)' }}>{doneCount} / {totalCount}</span>
      </div>
      <div style={{ height: 4, background: '#E2E1D3', borderRadius: 999, overflow:'hidden', marginBottom: 10 }}>
        <div style={{ width: (doneCount/totalCount*100) + '%', height: '100%', background: 'var(--jetson-green)' }}></div>
      </div>
      {sections.map(section => {
        const secDone = section.items.filter(it => checked[it.id]).length;
        return (
          <div key={section.section}>
            <div className="tech-checklist-section-title" style={{ display:'flex', justifyContent:'space-between' }}>
              <span>{section.section}</span>
              <span style={{ fontFamily:'var(--font-mono)', color: '#8A8B77' }}>{secDone}/{section.items.length}</span>
            </div>
            {section.items.map(it => (
              <div key={it.id}
                className={"tech-checklist-item" + (checked[it.id] ? ' done' : '')}
                onClick={() => setChecked(c => ({ ...c, [it.id]: !c[it.id] }))}
                style={{ cursor: 'pointer' }}>
                <div className={"tech-checkbox" + (checked[it.id] ? ' done' : '')}>
                  {checked[it.id] && <TI name="check" size={14} stroke="#0F1F0D" />}
                </div>
                <span className="check-name">{it.label}</span>
                {it.required && !checked[it.id] && (
                  <span style={{ marginLeft:'auto', fontSize: 9, fontWeight: 800, color: '#8A5500', background:'#FFF1D6', padding:'1px 6px', borderRadius: 999, letterSpacing:'0.06em' }}>REQ</span>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const PHOTO_CATEGORIES = [
  { id:'pre',  label:'Before',     count: 3, cls:'tech-photo-pre'  },
  { id:'mid',  label:'During',     count: 5, cls:'tech-photo-mid'  },
  { id:'post', label:'After',      count: 1, cls:'tech-photo-post' },
];
function TabPhotos() {
  return (
    <>
      {PHOTO_CATEGORIES.map(cat => (
        <div key={cat.id} className="tech-section">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
            <div className="tech-section-title" style={{ marginBottom: 0 }}>{cat.label}</div>
            <span style={{ fontSize: 11, color: '#666858', fontFamily:'var(--font-mono)' }}>{cat.count} photo{cat.count === 1 ? '' : 's'}</span>
          </div>
          <div className="tech-photo-grid">
            {Array.from({ length: cat.count }).map((_, i) => (
              <div key={i} className={"tech-photo " + cat.cls}>
                <span className="tech-photo-label">{cat.label.slice(0,3).toUpperCase()} {i + 1}</span>
              </div>
            ))}
            <div className="tech-photo empty">
              <TI name="plus" size={20} stroke="#ACAA93" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function TabParts() {
  const parts = [
    { sku: 'HP-OD-4T-J5', name: 'Jetson 4-ton outdoor unit', qty: 1 },
    { sku: 'HP-AH-4T-J5', name: 'Jetson 4-ton air handler',  qty: 1 },
    { sku: 'LS-3458-7',   name: 'Line set 3/8 + 5/8, 25 ft', qty: 1 },
    { sku: 'CD-T-3478',   name: 'Condensate trap',           qty: 1 },
    { sku: 'THM-J2',      name: 'Jetson thermostat',         qty: 1 },
  ];
  return (
    <div className="tech-section">
      <div className="tech-section-title">Parts used</div>
      {parts.map((p, i) => (
        <div key={i} className="tech-list-item">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: '#666858', fontFamily:'var(--font-mono)' }}>{p.sku}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, marginLeft:'auto' }}>×{p.qty}</span>
        </div>
      ))}
      <button style={{ marginTop: 10, padding: '11px', width:'100%', background:'#F2F0E4', border:'1px solid #E2E1D3', borderRadius: 10, fontFamily:'inherit', fontSize: 13, fontWeight: 600, cursor:'pointer', color:'#0F1F0D', display:'flex', alignItems:'center', justifyContent:'center', gap: 8 }}>
        <TI name="plus" size={14} /> Add part · scan SKU
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TIME SCREEN
// ─────────────────────────────────────────────────────────────
function TimeScreen({ mode, now, jobs, overrides }) {
  // Derive today's segments from job state under `now`
  const segs = useTM(() => buildTodaySegments({ now, jobs, overrides, mode }), [now, jobs, overrides, mode]);

  const seconds = Math.max(0, (now - mode.clockedAt) * 3600);
  const totalToday = (now - mode.clockedAt);

  const weekHrs = [
    { day:'Mon', h: 7.6 },
    { day:'Tue', h: 8.4 },
    { day:'Wed', h: 8.1 },
    { day:'Thu', h: totalToday, today: true },
    { day:'Fri', h: null },
    { day:'Sat', h: null },
    { day:'Sun', h: null },
  ];
  const weekTotal = weekHrs.reduce((s, d) => s + (d.h || 0), 0);

  return (
    <>
      <div className="tx-header brand-green" style={{ paddingTop: 56, background:'linear-gradient(180deg, #3CD567 0%, #2BB055 100%)', color:'#0F1F0D' }}>
        <div className="tx-header-top" style={{ color: 'rgba(15,31,13,0.65)' }}>
          <span>This week · {fmtDate(TODAY, { weekday: 'long' })}</span>
          <span style={{
            display:'inline-flex', alignItems:'center', gap: 6,
            background:'rgba(15,31,13,0.15)', color:'#0F1F0D',
            padding:'2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing:'0.08em', textTransform:'uppercase'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background:'var(--forest)' }}></span>
            {mode.time}
          </span>
        </div>
        <div className="tx-name">Time</div>
        <div className="tx-sub" style={{ color: 'rgba(15,31,13,0.7)' }}>
          Auto-tracked from your job status. You can edit anything before submitting.
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 0 110px' }}>
        <div className="tt-hero">
          <div className="label">Today · started 7:04a</div>
          <div className="clock">{fmtClock(seconds)}</div>
          <div className="meta">
            <span style={{ fontFamily:'var(--font-mono)' }}>{totalToday.toFixed(1)}h elapsed</span>
            <span>·</span>
            <span>Break 0h</span>
          </div>
          <div className="actions">
            <button className="break">Start break</button>
            <button className="end">End shift</button>
          </div>
        </div>

        <div style={{ padding: '0 16px', marginBottom: 6 }}>
          <div className="tx-sec-eyebrow" style={{ margin: 0 }}>
            <span className="lbl">Today · segments</span>
            <span className="meta">auto · {segs.length}</span>
          </div>
        </div>
        <div className="tt-segments">
          {segs.map((s, i) => (
            <div key={i} className={"tt-seg" + (s.live ? ' live' : '')}>
              <span className="time">{s.timeLabel}</span>
              <div>
                <div className="label">{s.label}</div>
                {s.sub && <div className="sublabel">{s.sub}</div>}
              </div>
              <span className="dur">{s.dur}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 16px', marginBottom: 6 }}>
          <div className="tx-sec-eyebrow" style={{ margin: 0 }}>
            <span className="lbl">This week</span>
            <span className="meta">pay period</span>
          </div>
        </div>
        <div className="tt-week">
          <div className="tt-week-title">
            <span className="h">Mon May 19 – Sun May 25</span>
            <span className="total">{weekTotal.toFixed(1)}<span style={{ fontSize: 11, color:'#666858', fontWeight: 600 }}>h</span></span>
          </div>
          {weekHrs.map(d => {
            const h = d.h;
            const isFuture = h === null;
            const isOT = h && h > 8;
            const pct = isFuture ? 0 : Math.min(h / 10 * 100, 100);
            return (
              <div className="tt-bars" key={d.day}>
                <span className={"day" + (d.today ? ' today' : '') + (isFuture ? ' future' : '')}>{d.day}</span>
                <div className="track">
                  {!isFuture && <div className={"fill" + (isOT ? ' ot' : '')} style={{ width: pct + '%' }}></div>}
                </div>
                <span className={"hrs" + (isFuture ? ' future' : '')}>
                  {isFuture ? '—' : h.toFixed(1) + 'h'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function buildTodaySegments({ now, jobs, overrides, mode }) {
  const out = [];
  out.push({ timeLabel: '7:04a', label: 'Clocked in', sub: 'Yard · Watertown', dur: '—' });

  let cursor = 7 + 4/60;
  jobs.forEach((job, i) => {
    const c = getCustomer(job.customer);
    const status = effectiveStatus(job, now, overrides[job.id]);
    // travel before the job
    const driveEnd = Math.min(job.startHour, now);
    if (now >= cursor) {
      const segEnd = Math.min(driveEnd, now);
      if (segEnd > cursor) {
        out.push({
          timeLabel: fmtTime(cursor),
          label: i === 0 ? 'Drive · yard → ' + (c?.name?.split(' ').slice(-1)[0] || 'site') : 'Drive · ' + (c?.name?.split(' ').slice(-1)[0] || 'site'),
          sub: ((segEnd - cursor) * 60).toFixed(0) + ' min · auto-recorded',
          dur: fmtDur(segEnd - cursor),
        });
      }
    }
    cursor = job.startHour;
    // on-site
    if (now >= job.startHour) {
      const onsiteEnd = status === 'complete' ? Math.min(job.startHour + job.durationHrs, now) : now;
      const live = status === 'onsite';
      out.push({
        timeLabel: fmtTime(job.startHour),
        label: (status === 'complete' ? 'On site · ' : 'On site · ') + (c?.name || job.address?.split('·')[0]),
        sub: job.id + ' · ' + JOB_TYPES[job.type].short,
        dur: live ? 'live' : fmtDur(onsiteEnd - job.startHour),
        live,
      });
      cursor = onsiteEnd;
    }
  });
  return out;
}

function fmtDur(h) {
  const totalMin = Math.max(0, Math.round(h * 60));
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return hh + ':' + String(mm).padStart(2, '0');
}

// ─────────────────────────────────────────────────────────────
// BOTTOM TAB BAR
// ─────────────────────────────────────────────────────────────
function TabBar({ screen, onScreen, jobCount }) {
  return (
    <div className="tx-tabs">
      {[
        ['today', 'Today', 'calendar'],
        ['job',   'Job',   'briefcase'],
        ['time',  'Time',  'timer'],
      ].map(([k, label, icon]) => (
        <button key={k} className={"tx-tab" + (screen === k ? ' active' : '')} onClick={() => onScreen(k)} style={{ position: 'relative' }}>
          <span className="ic">
            <TI name={icon} size={16} stroke={screen === k ? 'var(--forest)' : '#666858'} />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SPILLOVER SHEET — "Continue tomorrow" confirmation
// ─────────────────────────────────────────────────────────────
function SpilloverSheet({ job, onClose, onConfirm }) {
  const c = getCustomer(job.customer);
  const [reason, setReason] = useTS('Electrical pull running long');
  const [eta, setEta] = useTS('4h');
  const [submitted, setSubmitted] = useTS(false);

  function send() {
    setSubmitted(true);
    setTimeout(() => onConfirm(), 1400);
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(15,31,13,0.55)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      zIndex: 50,
      backdropFilter: 'blur(2px)',
      borderRadius: 48,
      overflow: 'hidden',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%',
        background: 'white',
        borderRadius: '24px 24px 0 0',
        padding: '20px 20px 36px',
        maxHeight: '78%',
        overflowY: 'auto',
        animation: 'modal-in 280ms cubic-bezier(.2,.9,.3,1.4)',
      }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--jetson-green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <TI name="check" size={28} stroke="var(--forest)" strokeWidth={2.5} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: 'var(--forest)' }}>
              Sent to dispatch
            </div>
            <div style={{ fontSize: 13, color: '#666858', marginTop: 6, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
              Jordan will confirm the continuation slot and message you back.
            </div>
          </div>
        ) : (
          <>
            <div style={{ width: 36, height: 4, background: '#E2E1D3', borderRadius: 999, margin: '0 auto 16px' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,182,39,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TI name="refresh" size={18} stroke="#8A5500" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-subhead)', fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>Continue tomorrow</div>
                <div style={{ fontSize: 12, color: '#666858', marginTop: 2 }}>{c?.name} · {job.id}</div>
              </div>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#0F1F0D', marginBottom: 16 }}>
              This flags the job as needing a continuation. Dispatch will confirm the slot — usually within 10 minutes.
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#666858', marginBottom: 6 }}>
                What still needs to happen?
              </div>
              {[
                'Electrical pull running long',
                'Equipment delivery delayed',
                'Customer not ready / access issue',
                'Scope expanded on site',
                'Other',
              ].map(r => (
                <button key={r}
                  onClick={() => setReason(r)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: 6,
                    background: reason === r ? '#0F1F0D' : '#F7F5EC',
                    color: reason === r ? '#FBFAF1' : '#0F1F0D',
                    border: '1px solid ' + (reason === r ? '#0F1F0D' : '#E2E1D3'),
                    borderRadius: 10,
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}>
                  {r}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#666858', marginBottom: 6 }}>
                Estimated work remaining
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {['2h','4h','6h','Full day'].map(opt => (
                  <button key={opt}
                    onClick={() => setEta(opt)}
                    style={{
                      padding: '10px',
                      background: eta === opt ? 'var(--jetson-green)' : '#F7F5EC',
                      color: eta === opt ? 'var(--forest)' : '#0F1F0D',
                      border: '1px solid ' + (eta === opt ? 'var(--jetson-green)' : '#E2E1D3'),
                      borderRadius: 10,
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={send}
              style={{
                width: '100%',
                padding: 16,
                background: 'var(--jetson-green)',
                color: 'var(--forest)',
                border: 'none',
                borderRadius: 14,
                fontFamily: 'inherit',
                fontWeight: 800,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(60,213,103,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <TI name="check" size={16} stroke="var(--forest)" />
              Send to dispatch
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(<MobileTechApp />);
