// =============================================================
// AddTechnicianModal — fields for name / initials / role / level /
// default crew / certs. Saves via useStore().addPerson(...)
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import { ROLES } from '../../data/seed';
import type { Level, Person, RoleKey } from '../../types';

interface AddTechnicianModalProps {
  onClose: () => void;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AddTechnicianModal({ onClose }: AddTechnicianModalProps) {
  const crews = useStore((s) => s.crews);
  const addPerson = useStore((s) => s.addPerson);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [initials, setInitials] = useState('');
  const [role, setRole] = useState<RoleKey>('hvac_installer');
  const [level, setLevel] = useState<Level>('L1');
  const [defaultCrew, setDefaultCrew] = useState<string>(crews[0]?.id ?? '');
  const [certsText, setCertsText] = useState('');

  const availableLevels = ROLES[role].levels;

  const finalInitials = useMemo(
    () => (initialsTouched ? initials : deriveInitials(name)),
    [initialsTouched, initials, name],
  );

  const canSave = name.trim().length > 0 && finalInitials.length > 0;

  function save() {
    if (!canSave) return;
    const certs = certsText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const p: Person = {
      id: 'p' + Date.now().toString(36),
      name: name.trim(),
      initials: finalInitials.slice(0, 3).toUpperCase(),
      roles: [role],
      level: availableLevels.includes(level) ? level : availableLevels[0],
      defaultCrew,
      certs: certs.length > 0 ? certs : undefined,
    };
    addPerson(p);
    pushToast('Added ' + p.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
        role="dialog"
        aria-label="Add technician"
      >
        <div className="modal-header">
          <Icon name="user" size={18} />
          <div>
            <div className="eyebrow-sm">Resources</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add technician</div>
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
                placeholder="e.g. Jamie Holloway"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label className="label">Initials</label>
              <input
                className="input mono"
                placeholder="JH"
                value={finalInitials}
                onChange={(e) => {
                  setInitialsTouched(true);
                  setInitials(e.target.value.toUpperCase());
                }}
                maxLength={3}
              />
              <div className="muted small" style={{ marginTop: 4 }}>
                Auto-derived from name. Override if needed.
              </div>
            </div>

            <div className="field">
              <label className="label">Role</label>
              <select
                className="select"
                value={role}
                onChange={(e) => {
                  const r = e.target.value as RoleKey;
                  setRole(r);
                  // re-clamp level
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
                Comma-separated. Will display as chips.
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
            <Icon name="check" size={14} /> Add technician
          </button>
        </div>
      </div>
    </div>
  );
}
