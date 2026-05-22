// =============================================================
// AddCrewModal — name / type / color / lead / members / truck.
// Saves via useStore().addCrew(crew).
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import { roleLabel } from '../../data/selectors';
import type { Crew, CrewType, Person } from '../../types';

interface AddCrewModalProps {
  onClose: () => void;
}

const CREW_TYPES: CrewType[] = ['install', 'service', 'electrical', 'plumbing', 'sales'];

const COLOR_PALETTE: string[] = [
  '#3CD567', // jetson green
  '#4FB3E8', // sky blue
  '#FFB627', // amber
  '#C53030', // red
  '#7F5AC8', // purple
  '#1A6F2E', // forest
];

const LEAD_ROLES = ['hvac_lead', 'service_tech', 'electrician', 'plumber', 'fsm'];

export function AddCrewModal({ onClose }: AddCrewModalProps) {
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const crews = useStore((s) => s.crews);
  const addCrew = useStore((s) => s.addCrew);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [type, setType] = useState<CrewType>('install');
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);
  const [leadId, setLeadId] = useState<string>('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [truckId, setTruckId] = useState<string>('');

  const eligibleLeads = useMemo(
    () => people.filter((p) => LEAD_ROLES.includes(p.roles[0])),
    [people],
  );

  // trucks: unassigned OR currently assigned to a crew that doesn't yet exist (n/a).
  const assignedTruckIds = useMemo(
    () => new Set(crews.map((c) => c.truck).filter((t): t is string => !!t)),
    [crews],
  );
  const eligibleTrucks = useMemo(
    () => trucks.filter((t) => !assignedTruckIds.has(t.id)),
    [trucks, assignedTruckIds],
  );

  const canSave = name.trim().length > 0 && leadId.length > 0;

  function toggleMember(id: string) {
    setMemberIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  function save() {
    if (!canSave) return;
    // Lead must be included in members
    const members = memberIds.includes(leadId) ? memberIds : [leadId, ...memberIds];
    const crew: Crew = {
      id: 'c' + Date.now().toString(36),
      name: name.trim(),
      type,
      lead: leadId,
      members,
      truck: truckId || null,
      color,
    };
    addCrew(crew);
    pushToast('Added ' + crew.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 620 }}
        role="dialog"
        aria-label="Add crew"
      >
        <div className="modal-header">
          <Icon name="users" size={18} />
          <div>
            <div className="eyebrow-sm">Resources</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add crew</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="modal-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Crew name</label>
              <input
                className="input"
                placeholder="e.g. Holloway Crew"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label className="label">Type</label>
              <select
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value as CrewType)}
              >
                {CREW_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Color</label>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={'Color ' + c}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: c,
                      border:
                        color === c
                          ? '2px solid var(--forest)'
                          : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Lead</label>
              <select
                className="select"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                <option value="">— Select a lead —</option>
                {eligibleLeads.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {roleLabel(p.roles[0])} {p.level}
                  </option>
                ))}
              </select>
              <div className="muted small" style={{ marginTop: 4 }}>
                Must be an HVAC Lead, Service Technician, Electrician, Plumber, or FSM.
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Members</label>
              <div
                style={{
                  maxHeight: 200,
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 6,
                }}
              >
                {people.map((p) => (
                  <MemberCheck
                    key={p.id}
                    person={p}
                    checked={memberIds.includes(p.id) || p.id === leadId}
                    forceLocked={p.id === leadId}
                    onToggle={() => toggleMember(p.id)}
                  />
                ))}
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                Lead is added automatically.
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Truck (optional)</label>
              <select
                className="select"
                value={truckId}
                onChange={(e) => setTruckId(e.target.value)}
              >
                <option value="">— None —</option>
                {eligibleTrucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.plate}
                  </option>
                ))}
              </select>
              <div className="muted small" style={{ marginTop: 4 }}>
                Only unassigned trucks are listed.
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
            <Icon name="check" size={14} /> Add crew
          </button>
        </div>
      </div>
    </div>
  );
}

interface MemberCheckProps {
  person: Person;
  checked: boolean;
  forceLocked: boolean;
  onToggle: () => void;
}

function MemberCheck({ person, checked, forceLocked, onToggle }: MemberCheckProps) {
  return (
    <label
      className="row"
      style={{
        gap: 10,
        padding: '6px 8px',
        cursor: forceLocked ? 'default' : 'pointer',
        opacity: forceLocked ? 0.85 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={forceLocked}
        onChange={onToggle}
      />
      <Avatar person={person} size="xs" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{person.name}</div>
        <div className="muted small">
          {roleLabel(person.roles[0])} · {person.level}
        </div>
      </div>
      {forceLocked && (
        <span
          className="tag"
          style={{
            background: 'var(--jetson-green)',
            color: 'var(--forest)',
          }}
        >
          LEAD
        </span>
      )}
    </label>
  );
}
