import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useStore } from '../../store';
import { JobTemplatesEditor } from './JobTemplatesEditor';
import { BusinessRules } from './BusinessRules';
import { IntegrationsPanel } from './IntegrationsPanel';
import { RolesAndSkills } from './RolesAndSkills';
import { HoursAndHolidays } from './HoursAndHolidays';
import { PermissionsMatrix } from './PermissionsMatrix';
import { FormBuilder } from './FormBuilder';

type Section =
  | 'templates'
  | 'forms'
  | 'rules'
  | 'integrations'
  | 'roles'
  | 'hours'
  | 'permissions';

interface NavEntry {
  id: Section;
  label: string;
  icon: IconName;
  /** When set, only roles in this list may view the tab. */
  adminOnly?: boolean;
}

const NAV: NavEntry[] = [
  { id: 'templates',    label: 'Job templates',    icon: 'briefcase' },
  { id: 'forms',        label: 'Completion forms', icon: 'check' },
  { id: 'rules',        label: 'Business rules',   icon: 'sparkle' },
  { id: 'integrations', label: 'Integrations',     icon: 'plug', adminOnly: true },
  { id: 'roles',        label: 'Roles & skills',   icon: 'users' },
  { id: 'hours',        label: 'Hours & holidays', icon: 'clock' },
  { id: 'permissions',  label: 'Permissions',      icon: 'settings', adminOnly: true },
];

function isAdmin(role: string | null): boolean {
  return role === 'admin' || role === 'manager';
}

function PermissionRequired({ onSwitchToDispatch }: { onSwitchToDispatch: () => void }) {
  return (
    <div className="empty-state" style={{ padding: 32, textAlign: 'center' }}>
      <Icon name="alert_circle" size={28} />
      <h3 style={{ marginTop: 12 }}>Permission required</h3>
      <p className="muted small" style={{ maxWidth: 360, margin: '8px auto 16px' }}>
        This page is limited to admins and managers. Ask an admin to invite you, or
        head back to Dispatch.
      </p>
      <button className="btn btn-primary" onClick={onSwitchToDispatch}>
        Switch to Dispatch
      </button>
    </div>
  );
}

export function SettingsView() {
  const [section, setSection] = useState<Section>('templates');
  const role = useStore((s) => s.currentUserRole);
  const apiMode = useStore((s) => s.apiMode);
  const setTab = useStore((s) => s.setTab);
  // Demo mode (no API) has no real role — treat the local user as admin so
  // the laptop demo keeps showing every tab.
  const canAdmin = !apiMode || isAdmin(role);
  const active = NAV.find((n) => n.id === section);
  const blocked = active?.adminOnly && !canAdmin;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        subtitle="Job templates, business rules, integrations, and team permissions"
      />

      <div
        className="view-pad"
        style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, alignItems: 'flex-start' }}
      >
        <div style={{ position: 'sticky', top: 0 }}>
          {NAV.map((entry) => {
            const isActive = entry.id === section;
            const gated = entry.adminOnly && !canAdmin;
            return (
              <button
                key={entry.id}
                className="nav-item"
                onClick={() => setSection(entry.id)}
                style={{
                  color: isActive ? 'var(--forest)' : 'var(--fg-muted)',
                  background: isActive ? 'var(--bg-subtle)' : 'transparent',
                  fontWeight: isActive ? 700 : 500,
                  opacity: gated ? 0.55 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                title={gated ? 'Requires admin or manager role' : undefined}
              >
                <Icon name={entry.icon} size={16} />
                <span style={{ flex: 1, textAlign: 'left' }}>{entry.label}</span>
                {entry.adminOnly && (
                  <span
                    className="small muted"
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 999,
                      border: '1px solid var(--ink-100, #eee)',
                    }}
                  >
                    Admin
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="settings-section">
          {blocked ? (
            <PermissionRequired onSwitchToDispatch={() => setTab('dispatch')} />
          ) : (
            <>
              {section === 'templates'    && <JobTemplatesEditor />}
              {section === 'forms'        && <FormBuilder />}
              {section === 'rules'        && <BusinessRules />}
              {section === 'integrations' && <IntegrationsPanel />}
              {section === 'roles'        && <RolesAndSkills />}
              {section === 'hours'        && <HoursAndHolidays />}
              {section === 'permissions'  && <PermissionsMatrix />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
