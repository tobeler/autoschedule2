// =============================================================
// EditTruckModal — mirrors AddTruckModal, prefilled. Saves via
// useStore().updateTruck(truck).
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import type { Truck, TruckKind, TruckStatus } from '../../types';

interface EditTruckModalProps {
  truck: Truck;
  onClose: () => void;
}

const TRUCK_KINDS: TruckKind[] = ['install', 'electrical', 'plumbing'];
const TRUCK_STATUSES: TruckStatus[] = ['assigned', 'available', 'shop'];

export function EditTruckModal({ truck, onClose }: EditTruckModalProps) {
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const updateTruck = useStore((s) => s.updateTruck);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState(truck.name);
  const [plate, setPlate] = useState(truck.plate);
  const [kind, setKind] = useState<TruckKind>(truck.kind);
  const [capacity, setCapacity] = useState(truck.capacity);
  const [assignedCrew, setAssignedCrew] = useState<string>(truck.assignedCrew ?? '');
  const [vin, setVin] = useState(truck.vin);
  const [status, setStatus] = useState<TruckStatus>(truck.status ?? 'assigned');

  // Eligible crews: this truck's current crew + any unassigned crew.
  const occupiedByOthers = useMemo(
    () =>
      new Set(
        trucks
          .filter((t) => t.id !== truck.id)
          .map((t) => t.assignedCrew)
          .filter((c): c is string => !!c),
      ),
    [trucks, truck.id],
  );
  const eligibleCrews = useMemo(
    () => crews.filter((c) => !occupiedByOthers.has(c.id)),
    [crews, occupiedByOthers],
  );

  const canSave = name.trim().length > 0 && plate.trim().length > 0;

  function save() {
    if (!canSave) return;
    const next: Truck = {
      ...truck,
      name: name.trim(),
      plate: plate.trim().toUpperCase(),
      kind,
      capacity: capacity.trim() || '—',
      assignedCrew: assignedCrew || null,
      vin: vin.trim(),
      status,
    };
    updateTruck(next);
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
        aria-label="Edit truck"
      >
        <div className="modal-header">
          <Icon name="truck" size={18} />
          <div>
            <div className="eyebrow-sm">Fleet</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Edit {truck.name}</div>
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
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label className="label">Plate</label>
              <input
                className="input mono"
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
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Assigned crew</label>
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
            </div>

            <div className="field">
              <label className="label">Status</label>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TruckStatus)}
              >
                {TRUCK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">VIN</label>
              <input
                className="input mono"
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
            <Icon name="check" size={14} /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
