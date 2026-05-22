import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Icon, type IconName } from '../../components/Icon';
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
}

const NAV: NavEntry[] = [
  { id: 'templates',    label: 'Job templates',    icon: 'briefcase' },
  { id: 'forms',        label: 'Completion forms', icon: 'check' },
  { id: 'rules',        label: 'Business rules',   icon: 'sparkle' },
  { id: 'integrations', label: 'Integrations',     icon: 'plug' },
  { id: 'roles',        label: 'Roles & skills',   icon: 'users' },
  { id: 'hours',        label: 'Hours & holidays', icon: 'clock' },
  { id: 'permissions',  label: 'Permissions',      icon: 'settings' },
];

export function SettingsView() {
  const [section, setSection] = useState<Section>('templates');

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
            const active = entry.id === section;
            return (
              <button
                key={entry.id}
                className="nav-item"
                onClick={() => setSection(entry.id)}
                style={{
                  color: active ? 'var(--forest)' : 'var(--fg-muted)',
                  background: active ? 'var(--bg-subtle)' : 'transparent',
                  fontWeight: active ? 700 : 500,
                }}
              >
                <Icon name={entry.icon} size={16} />
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="settings-section">
          {section === 'templates'    && <JobTemplatesEditor />}
          {section === 'forms'        && <FormBuilder />}
          {section === 'rules'        && <BusinessRules />}
          {section === 'integrations' && <IntegrationsPanel />}
          {section === 'roles'        && <RolesAndSkills />}
          {section === 'hours'        && <HoursAndHolidays />}
          {section === 'permissions'  && <PermissionsMatrix />}
        </div>
      </div>
    </>
  );
}
