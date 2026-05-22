// =============================================================
// EditTechnicianModal — mirrors AddTechnicianModal, prefilled.
// Saves via useStore().updatePerson(person).
// =============================================================
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import { ROLES } from '../../data/seed';
import type { Level, Person, RoleKey } from '../../types';

interface EditTechnicianModalProps {
  person: Person;
  onClose: () => void;
}

export function EditTechnicianModal({ person, onClose }: EditTechnicianModalProps) {
  const crews = useStore((s) => s.crews);
  const updatePerson = useStore((s) => s.updatePerson);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState(person.name);
  const [initials, setInitials] = useState(person.initials);
  const [role, setRole] = useState<RoleKey>(person.roles[0] ?? 'hvac_installer');
  const [level, setLevel] = useState<Level>(person.level);
  const [defaultCrew, setDefaultCrew] = useState<string>(person.defaultCrew ?? '');
  const [certsText, setCertsText] = useState((person.certs ?? []).join(', '));

  const availableLevels = ROLES[role].levels;
  const canSave = name.trim().length > 0 && initials.length > 0;

  function save() {
    if (!canSave) return;
    const certs = certsText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const next: Person = {
      ...person,
      name: name.trim(),
      initials: initials.slice(0, 3).toUpperCase(),
      roles: [role],
      level: availableLevels.includes(level) ? level : availableLevels[0],
      defaultCrew,
      certs: certs.length > 0 ? certs : undefined,
    };
    updatePerson(next);
    pushToast('Saved ' + next.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
        role="dialog"
        aria-label="Edit technician"
      >
        <div className="modal-header">
          <Icon name="user" size={18} />
          <div>
            <div className="eyebrow-sm">Resources</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Edit {person.name}</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="modal-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Full name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label className="label">Initials</label>
              <input
                className="input mono"
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>

            <div className="field">
              <label className="label">Role</label>
              <select
                className="select"
                value={role}
                onChange={(e) => {
                  const r = e.target.value as RoleKey;
                  setRole(r);
                  if (!ROLES[r].levels.includes(level)) setLevel(ROLES[r].levels[0]);
                }}
              >
                {(Object.keys(ROLES) as RoleKey[]).map((rk) => (
                  <option key={rk} value={rk}>
                    {ROLES[rk].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Level</label>
              <select
                className="select"
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
              >
                {availableLevels.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Default crew</label>
              <select
                className="select"
                value={defaultCrew}
                onChange={(e) => setDefaultCrew(e.target.value)}
              >
                <option value="">— None —</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Certifications</label>
              <input
                className="input"
                placeholder="EPA 608, NATE, Mass C/S Refrig"
                value={certsText}
                onChange={(e) => setCertsText(e.target.value)}
              />
              <div className="muted small" style={{ marginTop: 4 }}>
                Comma-separated.
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={!canSave}
          >
            <Icon name="check" size={14} /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
