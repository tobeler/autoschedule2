import { useState } from 'react';
import { Icon } from '../../components/Icon';

const ROLES = ['Owner / GM', 'Dispatcher', 'Ops Manager', 'Field Supervisor', 'Technician'] as const;
type Role = (typeof ROLES)[number];

const PERMISSIONS = [
  { key: 'create_jobs',      label: 'Create jobs' },
  { key: 'assign_crews',     label: 'Assign crews' },
  { key: 'edit_templates',   label: 'Edit templates' },
  { key: 'approve_ts',       label: 'Approve timesheets' },
  { key: 'settings_access',  label: 'Settings access' },
] as const;
type PermKey = (typeof PERMISSIONS)[number]['key'];

const INITIAL: Record<Role, Record<PermKey, boolean>> = {
  'Owner / GM':       { create_jobs: true,  assign_crews: true,  edit_templates: true,  approve_ts: true,  settings_access: true },
  'Dispatcher':       { create_jobs: true,  assign_crews: true,  edit_templates: false, approve_ts: true,  settings_access: false },
  'Ops Manager':      { create_jobs: true,  assign_crews: true,  edit_templates: true,  approve_ts: true,  settings_access: false },
  'Field Supervisor': { create_jobs: false, assign_crews: true,  edit_templates: false, approve_ts: false, settings_access: false },
  'Technician':       { create_jobs: false, assign_crews: false, edit_templates: false, approve_ts: false, settings_access: false },
};

export function PermissionsMatrix() {
  const [matrix, setMatrix] = useState(INITIAL);

  function toggle(role: Role, perm: PermKey) {
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [perm]: !m[role][perm] } }));
  }

  return (
    <>
      <div>
        <h3>Permissions</h3>
        <p className="muted small">Who can do what.</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              {PERMISSIONS.map((p) => (
                <th key={p.key} style={{ textAlign: 'center' }}>
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role}>
                <td style={{ fontWeight: 600 }}>{role}</td>
                {PERMISSIONS.map((p) => (
                  <td key={p.key} style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => toggle(role, p.key)}
                      aria-label={(matrix[role][p.key] ? 'Revoke ' : 'Grant ') + p.label + ' for ' + role}
                      style={{ padding: 4 }}
                    >
                      {matrix[role][p.key] ? (
                        <Icon name="check" size={16} stroke="var(--jetson-green)" strokeWidth={2.5} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
