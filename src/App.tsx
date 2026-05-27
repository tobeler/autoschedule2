'use client';

import { useEffect } from 'react';
import { useStore } from './store';
import { Icon, type IconName } from './components/Icon';
import { IconButton } from './components/IconButton';
import { Avatar } from './components/Avatar';
import { RegionPicker } from './components/RegionPicker';
import { AttentionPill } from './components/AttentionPill';
import { Toast } from './components/Toast';
import { unscheduledJobs } from './data/selectors';
import { dateKey, TODAY } from './data/helpers';

import { DispatchView } from './views/dispatch/DispatchView';
import { AttentionView, buildAttentionItems } from './views/attention/AttentionView';
import { JobsView } from './views/jobs/JobsView';
import { TechniciansView } from './views/technicians/TechniciansView';
import { CrewsView } from './views/crews/CrewsView';
import { FleetView } from './views/fleet/FleetView';
import { TimesheetsView } from './views/timesheets/TimesheetsView';
import { ReportsView } from './views/reports/ReportsView';
import { SettingsView } from './views/settings/SettingsView';

import { JobDetailDrawer } from './modals/JobDetailDrawer';
import { NewJobWizard } from './modals/NewJobWizard/NewJobWizard';
import { SmartScheduleModal } from './modals/SmartScheduleModal';
import { ZuperWriteConfirmModal } from './modals/ZuperWriteConfirmModal';
import { BrowserErrorReporter } from './components/BrowserErrorReporter';

import { useStoreHydration } from './hooks/useStoreHydration';
import { useStoreRealtime } from './hooks/useStoreRealtime';

interface NavItem {
  id: import('./store').TabId;
  label: string;
  icon: IconName;
  badge?: number | null;
}

export default function App() {
  // Mount hydration + realtime hooks first so they own data lifecycle.
  const hydration = useStoreHydration();
  useStoreRealtime();

  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const collapseSidebar = useStore((s) => s.collapseSidebar);
  const selectedJobId = useStore((s) => s.selectedJobId);
  const selectJob = useStore((s) => s.selectJob);
  const showWizard = useStore((s) => s.showWizard);
  const smartScheduleJobId = useStore((s) => s.smartScheduleJobId);
  const region = useStore((s) => s.region);
  const setRegion = useStore((s) => s.setRegion);

  const jobs = useStore((s) => s.jobs);
  const people = useStore((s) => s.people);

  // Keyboard: Escape closes drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedJobId) selectJob(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedJobId, selectJob]);

  // ---- loading + error gates ----
  if (hydration.loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-spinner" aria-hidden="true" />
        <div className="app-loading-label">Loading dispatcher…</div>
      </div>
    );
  }
  if (hydration.error) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-label">Could not load dispatcher</div>
        <div className="muted small" style={{ marginBottom: 12 }}>{hydration.error}</div>
        <button className="btn primary" onClick={hydration.retry}>Retry</button>
      </div>
    );
  }

  const attentionItems = buildAttentionItems();
  const urgentCount = attentionItems.filter((i) => i.sev === 'urgent').length;
  const totalAttention = attentionItems.length;

  // Projects is hidden for now: HubSpot's "Installation" object is being
  // deprecated in favor of native "Jobs" in HubSpot. Until the deal/install/
  // job linkage stabilizes, dispatchers work directly off the Jobs view.
  // Jobs badge counts ACTIVE jobs only (matches the default filter in
  // JobsView and the dispatcher's mental model — historical jobs aren't
  // actionable work).
  const activeJobsCount = jobs.filter(
    (j) => j.status !== 'complete' && j.status !== 'cancelled',
  ).length;
  const navItems: NavItem[] = [
    { id: 'dispatch', label: 'Dispatch', icon: 'calendar', badge: unscheduledJobs(jobs).length || null },
    { id: 'jobs', label: 'Jobs', icon: 'briefcase', badge: activeJobsCount },
    { id: 'technicians', label: 'Technicians', icon: 'user', badge: people.length },
    { id: 'crews', label: 'Crews', icon: 'users' },
    { id: 'fleet', label: 'Trucks', icon: 'truck' },
    { id: 'timesheets', label: 'Timesheets', icon: 'timer', badge: 8 },
    { id: 'reports', label: 'Reports', icon: 'bar_chart' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <div className={'app' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logos/Jetson-Logo-Off-White.png" alt="Jetson" />
          {!sidebarCollapsed && (
            <div className="sidebar-brand-text">
              Schedule
              <small>+ Dispatch</small>
            </div>
          )}
        </div>

        {!sidebarCollapsed && <div className="sidebar-section">Workspace</div>}
        {navItems.map((item) => (
          <button
            key={item.id}
            className={'nav-item' + (tab === item.id ? ' active' : '')}
            onClick={() => setTab(item.id)}
            title={item.label}
          >
            <Icon name={item.icon} size={18} className="nav-icon" />
            {!sidebarCollapsed && (
              <>
                <span>{item.label}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </>
            )}
          </button>
        ))}

        {!sidebarCollapsed && <div className="sidebar-section">Quick filters</div>}
        {!sidebarCollapsed && (
          <>
            <button className="nav-item" onClick={() => setTab('dispatch')}>
              <span
                className="dot"
                style={{ width: 8, height: 8, background: 'var(--jt-heatpump)', borderRadius: '50%' }}
              />
              Heat pumps today<span className="nav-badge">{jobs.filter((j) => j.type === 'heatpump' && j.date === dateKey(TODAY)).length}</span>
            </button>
            <button className="nav-item" onClick={() => setTab('attention')}>
              <span
                className="dot"
                style={{ width: 8, height: 8, background: 'var(--jt-callback)', borderRadius: '50%' }}
              />
              Callbacks<span className="nav-badge">{jobs.filter((j) => j.type === 'callback' && j.status !== 'complete' && j.status !== 'cancelled').length}</span>
            </button>
            <button className="nav-item" onClick={() => setTab('attention')}>
              <Icon name="user" size={16} className="nav-icon" />
              Unfilled slots
              <span className="nav-badge">
                {jobs.filter((j) => j.slots.some((s) => !s.assignedTo && !s.optional)).length}
              </span>
            </button>
          </>
        )}

        <SidebarUserFooter collapsed={sidebarCollapsed} />
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="topbar">
          <IconButton
            icon={sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
            label="Toggle sidebar"
            onClick={() => collapseSidebar(!sidebarCollapsed)}
            variant="ghost"
          />
          <div className="topbar-title">{navItems.find((n) => n.id === tab)?.label || 'Schedule'}</div>
          <span className="muted small" style={{ marginLeft: 4, marginRight: 4 }}>
            ·
          </span>
          <RegionPicker
            value={region}
            onChange={(r) => setRegion(r ?? { regionId: '', subId: '' })}
          />

          <div className="topbar-spacer" />

          <div className="search">
            <Icon name="search" size={14} />
            <input placeholder="Search jobs, customers, techs…" />
            <span className="kbd">⌘ K</span>
          </div>
          <AttentionPill urgentCount={urgentCount} totalCount={totalAttention} active={tab === 'attention'} />
          <span
            className="badge"
            style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24', marginLeft: 4 }}
          >
            <Icon name="hubspot" size={11} /> HubSpot
          </span>
        </div>

        <div className="content">
          {tab === 'dispatch' && <DispatchView />}
          {tab === 'attention' && <AttentionView />}
          {tab === 'jobs' && <JobsView />}
          {tab === 'technicians' && <TechniciansView />}
          {tab === 'crews' && <CrewsView />}
          {tab === 'fleet' && <FleetView />}
          {tab === 'timesheets' && <TimesheetsView />}
          {tab === 'reports' && <ReportsView />}
          {tab === 'settings' && <SettingsView />}
        </div>
      </main>

      {selectedJobId && <JobDetailDrawer />}
      {showWizard && <NewJobWizard />}
      {smartScheduleJobId && <SmartScheduleModal />}
      <ZuperWriteConfirmModal />
      <BrowserErrorReporter />

      <Toast />
    </div>
  );
}

// Phase 19 fix: pull dispatcher name + role from the store so once auth
// lands the sidebar reflects the real signed-in user. Falls back to the
// seed dispatcher label in demo mode.
function SidebarUserFooter({ collapsed }: { collapsed: boolean }) {
  const name = useStore((s) => s.currentUserName) || 'Jordan Rivera';
  const role = useStore((s) => s.currentUserRole) || 'dispatcher';
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const region = useStore((s) => s.region);
  const regions = useStore((s) => s.regions);
  const subLabel = region?.subId
    ? regions
        .find((r) => r.id === region.regionId)
        ?.subs.find((s) => s.id === region.subId)?.name
    : 'Demo';

  return (
    <div className="sidebar-footer">
      <Avatar
        person={
          {
            id: 'me',
            initials,
            name,
            roles: [],
            level: 'L2',
            defaultCrew: '',
          } as never
        }
      />
      {!collapsed && (
        <div className="sidebar-user">
          <div>{name}</div>
          <small>
            {roleLabel}
            {subLabel ? ' · ' + subLabel : ''}
          </small>
        </div>
      )}
    </div>
  );
}
