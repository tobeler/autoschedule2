// =============================================================
// VehiclePicker — Fleet truck / Personal vehicle / None.
// Auto-defaults to Personal when the crew has no fleet truck.
// Personal mode reveals a driver dropdown (defaults to crew lead).
// =============================================================
import { useEffect } from 'react';

import { Icon } from '../components/Icon';
import { ROLES } from '../data/seed';
import { getPerson, getTruck } from '../data/selectors';
import { useStore } from '../store';
import type { Crew, VehicleMode } from '../types';

export interface VehicleSelection {
  mode: VehicleMode;
  personalDriverId: string | null;
}

interface VehiclePickerProps {
  crew: Crew | null | undefined;
  value: VehicleSelection;
  onChange: (v: VehicleSelection) => void;
}

export function VehiclePicker({ crew, value, onChange }: VehiclePickerProps) {
  const trucks = useStore((s) => s.trucks);
  const people = useStore((s) => s.people);
  const fleetTruck = getTruck(trucks, crew?.truck);

  const driverOptions =
    crew && crew.members.length > 0
      ? crew.members.map((id) => getPerson(people, id)).filter((p): p is NonNullable<typeof p> => !!p)
      : crew?.lead
        ? [getPerson(people, crew.lead)].filter((p): p is NonNullable<typeof p> => !!p)
        : [];

  // Auto-default to 'personal' when crew has no truck.
  useEffect(() => {
    if (!crew) return;
    if (value.mode === 'fleet' && !fleetTruck) {
      onChange({ mode: 'personal', personalDriverId: crew.lead ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew?.id, fleetTruck?.id]);

  function setMode(m: VehicleMode) {
    if (m === 'fleet') onChange({ mode: 'fleet', personalDriverId: null });
    else if (m === 'personal')
      onChange({
        mode: 'personal',
        personalDriverId:
          value.personalDriverId || crew?.lead || driverOptions[0]?.id || null,
      });
    else onChange({ mode: 'none', personalDriverId: null });
  }

  return (
    <div className="vehicle-picker">
      <div className="vehicle-picker-head">
        <div className="row" style={{ gap: 6 }}>
          <Icon name="truck" size={13} stroke="var(--fg)" />
          <span className="eyebrow-sm" style={{ marginBottom: 0 }}>
            Vehicle
          </span>
        </div>
        <span className="muted small">How is the team getting to site?</span>
      </div>

      <div className="vehicle-picker-options">
        <button
          type="button"
          className={
            'vehicle-option' +
            (value.mode === 'fleet' ? ' selected' : '') +
            (!fleetTruck ? ' disabled' : '')
          }
          onClick={() => fleetTruck && setMode('fleet')}
          disabled={!fleetTruck}
        >
          <div className="vehicle-option-icon">
            <Icon name="truck" size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vehicle-option-label">
              {fleetTruck ? fleetTruck.name : 'No fleet truck'}
            </div>
            <div className="vehicle-option-meta">
              {fleetTruck
                ? fleetTruck.plate + ' · ' + fleetTruck.capacity
                : 'Crew has none assigned'}
            </div>
          </div>
          {value.mode === 'fleet' && fleetTruck && (
            <span className="vehicle-option-check">
              <Icon name="check" size={11} stroke="var(--off-white)" />
            </span>
          )}
        </button>

        <button
          type="button"
          className={'vehicle-option' + (value.mode === 'personal' ? ' selected' : '')}
          onClick={() => setMode('personal')}
        >
          <div className="vehicle-option-icon">
            <Icon name="map_pin" size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vehicle-option-label">Personal vehicle</div>
            <div className="vehicle-option-meta">Driver brings their own</div>
          </div>
          {value.mode === 'personal' && (
            <span className="vehicle-option-check">
              <Icon name="check" size={11} stroke="var(--off-white)" />
            </span>
          )}
        </button>

        <button
          type="button"
          className={'vehicle-option' + (value.mode === 'none' ? ' selected' : '')}
          onClick={() => setMode('none')}
        >
          <div className="vehicle-option-icon">
            <Icon name="x" size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vehicle-option-label">No vehicle</div>
            <div className="vehicle-option-meta">e.g. ride-along / shadowing</div>
          </div>
          {value.mode === 'none' && (
            <span className="vehicle-option-check">
              <Icon name="check" size={11} stroke="var(--off-white)" />
            </span>
          )}
        </button>
      </div>

      {value.mode === 'personal' && driverOptions.length > 0 && (
        <div className="vehicle-picker-driver">
          <label className="label">Driver</label>
          <select
            className="select"
            value={value.personalDriverId ?? ''}
            onChange={(e) =>
              onChange({ mode: 'personal', personalDriverId: e.target.value || null })
            }
          >
            {driverOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.roles.map((r) => ROLES[r]?.short ?? r).join(', ')}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
