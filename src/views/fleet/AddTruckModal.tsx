// =============================================================
// AddTruckModal — name / plate / kind / capacity / assigned crew / VIN.
// Saves via useStore().addTruck(truck).
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import type { Truck, TruckKind } from '../../types';

interface AddTruckModalProps {
  onClose: () => void;
}

const TRUCK_KINDS: TruckKind[] = ['install', 'electrical', 'plumbing'];

export function AddTruckModal({ onClose }: AddTruckModalProps) {
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const addTruck = useStore((s) => s.addTruck);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [kind, setKind] = useState<TruckKind>('install');
  const [capacity, setCapacity] = useState('');
  const [assignedCrew, setAssignedCrew] = useState<string>('');
  const [vin, setVin] = useState('');

  // Crews already assigned a truck shouldn't be re-pickable (1:1 mapping).
  const occupiedCrews = useMemo(
    () => new Set(trucks.map((t) => t.assignedCrew).filter((c): c is string => !!c)),
    [trucks],
  );
  const eligibleCrews = useMemo(
    () => crews.filter((c) => !occupiedCrews.has(c.id)),
    [crews, occupiedCrews],
  );

  const canSave = name.trim().length > 0 && plate.trim().length > 0;

  function save() {
    if (!canSave) return;
    const truck: Truck = {
      id: 't' + Date.now().toString(36),
      name: name.trim(),
      plate: plate.trim().toUpperCase(),
      kind,
      capacity: capacity.trim() || '—',
      assignedCrew: assignedCrew || null,
      vin: vin.trim(),
      status: assignedCrew ? 'assigned' : 'available',
    };
    addTruck(truck);
    pushToast('Added ' + truck.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
        role="dialog"
        aria-label="Add truck"
      >
        <div className="modal-header">
          <Icon name="truck" size={18} />
          <div>
            <div className="eyebrow-sm">Fleet</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add vehicle</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="modal-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. Truck 23"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label className="label">Plate</label>
              <input
                className="input mono"
                placeholder="JTN-0023"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
              />
            </div>

            <div className="field">
              <label className="label">Kind</label>
              <select
                className="select"
                value={kind}
                onChange={(e) => setKind(e.target.value as TruckKind)}
              >
                {TRUCK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Capacity</label>
              <input
                className="input"
                placeholder="Heat pump + tools"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Assigned crew (optional)</label>
              <select
                className="select"
                value={assignedCrew}
                onChange={(e) => setAssignedCrew(e.target.value)}
              >
                <option value="">— None (available pool) —</option>
                {eligibleCrews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.type}
                  </option>
                ))}
              </select>
              <div className="muted small" style={{ marginTop: 4 }}>
                Crews with a truck already assigned are filtered out.
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">VIN (optional)</label>
              <input
                className="input mono"
                placeholder="1FTBR1Y8…"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
              />
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
            <Icon name="check" size={14} /> Add vehicle
          </button>
        </div>
      </div>
    </div>
  );
}
