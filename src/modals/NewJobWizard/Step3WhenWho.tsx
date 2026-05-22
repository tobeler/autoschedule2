// =============================================================
// Step 3 — When & who.
// Embeds the SuggestTimePicker (both grid + exact-time modes) and
// surfaces a VehiclePicker once a slot is selected. Heat-pump jobs
// expose an extra-crew selector for the electrician handoff.
// =============================================================
import { Icon } from '../../components/Icon';
import { JobTypeTag } from '../../components/JobTypeTag';
import { JOB_TYPES } from '../../data/seed';
import { getCrew } from '../../data/selectors';
import { addDays, fmtDate, fmtTime, TODAY } from '../../data/helpers';
import { useStore } from '../../store';
import type { Customer, JobSlot } from '../../types';

import { SuggestTimePicker, type PickedSlot } from '../SuggestTimePicker';
import { VehiclePicker, type VehicleSelection } from '../VehiclePicker';

interface Step3Props {
  type: string;
  customer: Customer;
  templateSlots: JobSlot[];
  slot: PickedSlot | null;
  onSlot: (s: PickedSlot) => void;
  vehicle: VehicleSelection;
  onVehicle: (v: VehicleSelection) => void;
  extraCrews: string[];
  onExtraCrews: (ids: string[]) => void;
}

export function Step3WhenWho({
  type,
  customer,
  templateSlots,
  slot,
  onSlot,
  vehicle,
  onVehicle,
  extraCrews,
  onExtraCrews,
}: Step3Props) {
  const crews = useStore((s) => s.crews);
  const requiredCount = templateSlots.filter((s) => !s.optional).length;
  const duration = Math.max(
    ...templateSlots.map((s) => (s.start || 0) + s.hours),
    1,
  );
  const crew = slot ? getCrew(crews, slot.crewId) : null;

  return (
    <>
      <div className="wiz-section-head">
        <div>
          <div className="row" style={{ gap: 6 }}>
            <Icon name="sparkle" size={14} stroke="var(--jetson-green)" />
            <div className="eyebrow-sm" style={{ marginBottom: 0 }}>
              Suggested times
            </div>
          </div>
          <div className="muted small">
            For{' '}
            <strong style={{ color: 'var(--fg)' }}>
              {JOB_TYPES[type]?.label ?? type}
            </strong>{' '}
            · {Math.round(duration)}h · {requiredCount} required role
            {requiredCount === 1 ? '' : 's'}
          </div>
        </div>
        <JobTypeTag type={type} size="lg" />
      </div>

      <SuggestTimePicker
        job={{
          type,
          slots: templateSlots,
          customer: customer.id,
          address: customer.address,
        }}
        defaultDate={addDays(TODAY, 1)}
        value={slot}
        onChange={onSlot}
        height={440}
      />

      {slot && (
        <div
          className="card"
          style={{
            marginTop: 12,
            background: 'rgba(60,213,103,0.06)',
            borderColor: 'rgba(60,213,103,0.4)',
            padding: 12,
          }}
        >
          <div className="row" style={{ flexWrap: 'wrap', rowGap: 6 }}>
            <Icon name="check" size={14} stroke="var(--jetson-green)" />
            <strong style={{ fontSize: 13 }}>Selected slot</strong>
            <span className="muted small">·</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {crew?.name} · {fmtDate(new Date(slot.dateKey + 'T12:00:00'))}
              {slot.daysSpanned > 1 ? (
                <span>
                  {' · '}
                  {fmtTime(slot.startHour)} →{' '}
                  {fmtDate(new Date(slot.endDateKey + 'T12:00:00'), {
                    weekday: 'short',
                  })}{' '}
                  {fmtTime(slot.endHour)}{' '}
                  <span className="suggest-slot-spandays">
                    {slot.daysSpanned}-day
                  </span>
                </span>
              ) : (
                <span>
                  {' · '}
                  {fmtTime(slot.startHour)}
                  <span style={{ opacity: 0.7 }}>–{fmtTime(slot.endHour)}</span>
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {slot && crew && (
        <VehiclePicker crew={crew} value={vehicle} onChange={onVehicle} />
      )}

      {/* Heat-pump-only optional extra-crew slot for the electrician handoff */}
      {type === 'heatpump' && slot && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: 'var(--bg-subtle)',
          }}
        >
          <div className="row">
            <Icon name="bolt" size={14} stroke="var(--jt-electrical)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Electrician handoff (3h, mid-job)
            </span>
            <select
              className="select"
              style={{ marginLeft: 'auto', width: 240 }}
              value={extraCrews[0] ?? ''}
              onChange={(e) => onExtraCrews(e.target.value ? [e.target.value] : [])}
            >
              <option value="">Auto-pick available</option>
              {crews
                .filter((c) => c.type === 'electrical')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}
    </>
  );
}
