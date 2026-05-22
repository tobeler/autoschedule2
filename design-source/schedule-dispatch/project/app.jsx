/* eslint-disable */
/* Jetson Schedule + Dispatch — root App */

const { useState: useSA, useMemo: useMA, useEffect: useEA } = React;

function App() {
  const [tab, setTab] = useSA('dispatch');
  const [jobs, setJobs] = useSA(JOBS);
  const [selectedJob, setSelectedJob] = useSA(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useSA(false);
  const [toast, setToast] = useSA(null);
  const [showWizard, setShowWizard] = useSA(false);
  const [smartScheduleJob, setSmartScheduleJob] = useSA(null);
  const [region, setRegion] = useSA({ regionId: 'co', subId: 'co-d' }); // default: Colorado · Denver

  // Tweakable defaults
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "density": "cozy",
    "accent": "green",
    "showDriveTime": false,
    "dark": false
  }/*EDITMODE-END*/;
  const tweaks = useTweaks(TWEAK_DEFAULTS);

  function pushToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function updateJob(updated) {
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    setSelectedJob(updated);
  }

  function handleJobResize(jobId, hours) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, durationHrs: hours } : j));
    const j = jobs.find(x => x.id === jobId);
    if (j) pushToast('Resized ' + jobId + ' to ' + hoursToStr(hours));
  }

  function handleJobDrop(jobId, row, hour, dateKey) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const update = { ...job, date: dateKey, startHour: hour, status: job.status === 'unscheduled' ? 'scheduled' : job.status };
    if (row.id.startsWith('crew-')) {
      update.crewId = row.id.replace('crew-','');
      update.truckId = getCrew(update.crewId)?.truck || update.truckId;
    } else if (row.id.startsWith('truck-')) {
      update.truckId = row.id.replace('truck-','');
      update.crewId = getTruck(update.truckId)?.assignedCrew || update.crewId;
    }
    setJobs(prev => prev.map(j => j.id === jobId ? update : j));
    pushToast('Scheduled ' + job.id + ' at ' + fmtTime(hour));
  }

  // KEYBOARD nav
  useEA(() => {
    function onKey(e) {
      if (e.key === 'Escape' && selectedJob) setSelectedJob(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedJob]);

  const attentionItems = useMA(() => buildAttentionItems(), [jobs]);
  const urgentCount = attentionItems.filter(i => i.sev === 'urgent').length;
  const attentionBadge = attentionItems.length || null;

  const navItems = [
    { id:'dispatch',   label:'Dispatch',   icon:'calendar', badge: unscheduledJobs().length || null },
    { id:'projects',   label:'Projects',   icon:'home', badge: PROJECTS.length },
    { id:'jobs',       label:'Jobs',       icon:'briefcase', badge: jobs.length },
    { id:'crews',      label:'Crews',      icon:'users' },
    { id:'fleet',      label:'Trucks',     icon:'truck' },
    { id:'timesheets', label:'Timesheets', icon:'timer', badge: 8 },
    { id:'reports',    label:'Reports',    icon:'bar_chart' },
    { id:'settings',   label:'Settings',   icon:'settings' },
  ];

  return (
    <div className={"app" + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="assets/logos/Jetson-Logo-Off-White.png" alt="Jetson" />
          {!sidebarCollapsed && (
            <div className="sidebar-brand-text">
              Schedule
              <small>+ Dispatch</small>
            </div>
          )}
        </div>

        {!sidebarCollapsed && <div className="sidebar-section">Workspace</div>}
        {navItems.map(item => (
          <button key={item.id} className={"nav-item" + (tab === item.id ? ' active' : '')}
            onClick={() => setTab(item.id)} title={item.label}>
            <Icon name={item.icon} size={18} className="nav-icon" />
            {!sidebarCollapsed && <>
              <span>{item.label}</span>
              {item.badge && <span className={"nav-badge" + (item.badgeUrgent ? ' urgent' : '')}>{item.badge}</span>}
            </>}
          </button>
        ))}

        {!sidebarCollapsed && <div className="sidebar-section">Quick filters</div>}
        {!sidebarCollapsed && (
          <>
            <button className="nav-item">
              <span className="dot" style={{ width: 8, height: 8, background:'var(--jt-heatpump)', borderRadius:'50%' }}></span>
              Heat pumps today<span className="nav-badge">4</span>
            </button>
            <button className="nav-item">
              <span className="dot" style={{ width: 8, height: 8, background:'var(--jt-callback)', borderRadius:'50%' }}></span>
              Callbacks<span className="nav-badge">2</span>
            </button>
            <button className="nav-item">
              <Icon name="user" size={16} className="nav-icon" />
              Unfilled slots<span className="nav-badge">1</span>
            </button>
          </>
        )}

        <div className="sidebar-footer">
          <Avatar person={{ initials:'JR', name:'Jordan Rivera' }} />
          {!sidebarCollapsed && (
            <div className="sidebar-user">
              <div>Jordan Rivera</div>
              <small>Dispatcher · Watertown</small>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="topbar">
          <IconButton icon={sidebarCollapsed ? 'chevron_right' : 'chevron_left'} label="Toggle sidebar"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)} variant="ghost" />
          <div className="topbar-title">{navItems.find(n => n.id === tab)?.label || 'Schedule'}</div>
          <span className="muted small" style={{ marginLeft: 4, marginRight: 4 }}>·</span>
          <RegionPicker value={region} onChange={setRegion} />

          <div className="topbar-spacer"></div>

          <div className="search">
            <Icon name="search" size={14} />
            <input placeholder="Search jobs, customers, techs…" />
            <span className="kbd">⌘ K</span>
          </div>
          <button
            className={"attention-pill" + (urgentCount > 0 ? ' urgent' : attentionBadge ? ' warn' : ' ok') + (tab === 'attention' ? ' active' : '')}
            onClick={() => setTab('attention')}
            title={attentionBadge ? attentionBadge + ' items need attention' : 'Nothing needs attention'}>
            <Icon name={urgentCount > 0 ? 'alert_circle' : 'bell'} size={13} />
            <span className="attention-pill-label">Attention</span>
            {attentionBadge ? (
              <span className="attention-pill-count">{attentionBadge}</span>
            ) : (
              <Icon name="check" size={11} stroke="currentColor" strokeWidth={2.5} />
            )}
          </button>
          <span className="badge" style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24', marginLeft: 4 }}>
            <Icon name="hubspot" size={11} /> HubSpot
          </span>
        </div>

        <div className="content">
          {tab === 'dispatch' && (
            <DispatchView
              tweaks={tweaks.values}
              jobs={jobs}
              onJobClick={setSelectedJob}
              onJobDrop={handleJobDrop}
              onJobResize={handleJobResize}
              onToast={pushToast}
              selectedJobId={selectedJob?.id}
              onNewJob={() => setShowWizard(true)}
              onSmartSchedule={() => {
                const unsched = jobs.find(j => j.status === 'unscheduled');
                if (unsched) setSmartScheduleJob(unsched);
              }}
              onOpenAttention={() => setTab('attention')}
            />
          )}
          {tab === 'attention' && (
            <AttentionView
              onJumpToJob={(jobId) => {
                const j = jobs.find(x => x.id === jobId);
                if (j) setSelectedJob(j);
              }}
              onSmartSchedule={() => {
                const unsched = jobs.find(j => j.status === 'unscheduled');
                if (unsched) setSmartScheduleJob(unsched);
              }}
              onToast={pushToast}
            />
          )}
          {tab === 'jobs' && <JobsView jobs={jobs} onJobClick={setSelectedJob} />}
          {tab === 'projects' && <ProjectsView onJobClick={setSelectedJob} onToast={pushToast} />}
          {tab === 'crews' && <CrewsView />}
          {tab === 'fleet' && <FleetView />}
          {tab === 'timesheets' && <TimesheetsView />}
          {tab === 'reports' && <ReportsView />}
          {tab === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* DRAWER */}
      {selectedJob && (
        <JobDetailDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={updateJob}
          onToast={pushToast}
        />
      )}

      {/* NEW JOB WIZARD */}
      {showWizard && (
        <NewJobWizard
          onClose={() => setShowWizard(false)}
          onCreate={(j) => setJobs(prev => [...prev, j])}
          onToast={pushToast}
        />
      )}

      {/* SMART SCHEDULE */}
      {smartScheduleJob && (
        <SmartScheduleModal
          job={smartScheduleJob}
          onClose={() => setSmartScheduleJob(null)}
          onSchedule={(crewId, date, startHour) => {
            const crew = getCrew(crewId);
            const update = {
              ...smartScheduleJob, status: 'scheduled', crewId, truckId: crew?.truck,
              date, startHour,
              durationHrs: smartScheduleJob.durationHrs || Math.max(...((JOB_TEMPLATES[smartScheduleJob.type]?.slots || []).map(s => s.start + s.hours)), 1),
            };
            // Fill slots from crew members if empty
            const tplSlots = JOB_TEMPLATES[smartScheduleJob.type]?.slots || [];
            if (update.slots.length === 0 && tplSlots.length) {
              update.slots = tplSlots.map((s, i) => {
                const m = crew?.members.map(getPerson).find(p => p && p.roles.includes(s.role)) || PEOPLE.find(p => p.roles.includes(s.role));
                return { ...s, id: smartScheduleJob.id + '-s' + i, assignedTo: m?.id || null };
              });
            } else {
              update.slots = update.slots.map(s => {
                if (s.assignedTo) return s;
                const m = crew?.members.map(getPerson).find(p => p && p.roles.includes(s.role)) || PEOPLE.find(p => p.roles.includes(s.role));
                return { ...s, assignedTo: m?.id || null };
              });
            }
            setJobs(prev => prev.map(j => j.id === smartScheduleJob.id ? update : j));
            setSmartScheduleJob(null);
            pushToast('Scheduled ' + smartScheduleJob.id + ' with ' + crew.name);
          }}
        />
      )}

      {/* TWEAKS PANEL */}
      <TweaksPanel title="Tweaks" tweaks={tweaks}>
        <TweakSection title="Layout">
          <TweakRadio tweaks={tweaks} k="density" label="Density" options={['cozy','compact']} />
          <TweakToggle tweaks={tweaks} k="showDriveTime" label="Drive-time overlay" />
        </TweakSection>
        <TweakSection title="Theme">
          <TweakColor tweaks={tweaks} k="accent" label="Accent palette"
            options={[
              ['#3CD567','#0F1F0D','#CBFF8A'],
              ['#113823','#3CD567','#FBFAF1'],
              ['#FFB627','#0F1F0D','#3CD567'],
            ]} />
        </TweakSection>
      </TweaksPanel>

      {/* TOAST */}
      {toast && (
        <div className="toast">
          <Icon name="check" size={14} stroke="var(--jetson-green)" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
