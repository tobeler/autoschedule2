// =============================================================
// EditCrewModal — edit name / type / color / lead / truck for an
// existing crew. Members are managed by AddMemberPicker + the
// per-chip remove action in CrewsView.
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import { roleLabel } from '../../data/selectors';
import type { Crew, CrewType } from '../../types';

interface EditCrewModalProps {
  crew: Crew;
  onClose: () => void;
}

const CREW_TYPES: CrewType[] = ['install', 'electrical', 'plumbing', 'sales'];

const COLOR_PALETTE: string[] = [
  '#3CD567',
  '#4FB3E8',
  '#FFB627',
  '#C53030',
  '#7F5AC8',
  '#1A6F2E',
];

export function EditCrewModal({ crew, onClose }: EditCrewModalProps) {
  const people = useStore((s) => s.people);
  const trucks = useStore((s) => s.trucks);
  const crews = useStore((s) => s.crews);
  const updateCrew = useStore((s) => s.updateCrew);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState(crew.name);
  const [type, setType] = useState<CrewType>(crew.type);
  const [color, setColor] = useState<string>(crew.color);
  const [leadId, setLeadId] = useState<string>(crew.lead);
  const [truckId, setTruckId] = useState<string>(crew.truck ?? '');

  // Lead can be any member of the crew (or any person; loosely scoped).
  const eligibleLeads = useMemo(() => {
    const inCrew = people.filter((p) => crew.members.includes(p.id));
    return inCrew.length > 0 ? inCrew : people;
  }, [people, crew.members]);

  // Trucks: unassigned OR currently this crew's truck.
  const otherCrewsTrucks = useMemo(
    () =>
      new Set(
        crews
          .filter((c) => c.id !== crew.id)
          .map((c) => c.truck)
          .filter((t): t is string => !!t),
      ),
    [crews, crew.id],
  );
  const eligibleTrucks = useMemo(
    () => trucks.filter((t) => !otherCrewsTrucks.has(t.id)),
    [trucks, otherCrewsTrucks],
  );

  const canSave = name.trim().length > 0 && leadId.length > 0;

  function save() {
    if (!canSave) return;
    // Ensure lead remains in members
    const members = crew.members.includes(leadId)
      ? crew.members
      : [leadId, ...crew.members];
    const next: Crew = {
      ...crew,
      name: name.trim(),
      type,
      lead: leadId,
      members,
      truck: truckId || null,
      color,
    };
    updateCrew(next);
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
        aria-label="Edit crew"
      >
        <div className="modal-header">
          <Icon name="users" size={18} />
          <div>
            <div className="eyebrow-sm">Resources</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Edit {crew.name}</div>
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
                {eligibleLeads.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {roleLabel(p.roles[0])} {p.level}
                  </option>
                ))}
              </select>
              <div className="muted small" style={{ marginTop: 4 }}>
                Lead is automatically kept in the crew roster.
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Truck</label>
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
