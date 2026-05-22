// =============================================================
// Step 4 — Review.
// Summary of every choice the dispatcher made so far; final
// "Create job" lives in the footer of the parent wizard.
// =============================================================
import { Avatar } from '../../components/Avatar';
import { JobTypeTag } from '../../components/JobTypeTag';
import { ROLES } from '../../data/seed';
import { getCrew, getJobType, getPerson, getTruck } from '../../data/selectors';
import { fmtDate, fmtTime } from '../../data/helpers';
import { useStore } from '../../store';
import type { Customer, JobSlot, JobTemplate } from '../../types';

import type { PickedSlot } from '../SuggestTimePicker';
import type { VehicleSelection } from '../VehiclePicker';

interface Step4Props {
  type: string;
  customer: Customer;
  templateSlots: JobSlot[];
  slot: PickedSlot;
  vehicle: VehicleSelection;
  extraCrews: string[];
}

export function Step4Review({
  type,
  customer,
  templateSlots,
  slot,
  vehicle,
  extraCrews,
}: Step4Props) {
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const templates = useStore((s) => s.templates);

  const crew = getCrew(crews, slot.crewId);
  const jt = getJobType(type);
  const isCustom = !!(templates[type] as JobTemplate & { custom?: boolean })?.custom;
  const truck = vehicle.mode === 'fleet' ? getTruck(trucks, crew?.truck) : null;

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <JobTypeTag type={type} size="lg" />
        <h3 style={{ fontFamily: 'var(--font-subhead)', fontSize: 18, margin: 0 }}>
          {customer.name}
        </h3>
      </div>

      <dl className="kv-list" style={{ marginBottom: 14 }}>
        <dt>Type</dt>
        <dd>
          {jt?.label ?? type}
          {isCustom && (
            <span
              className="badge"
              style={{ marginLeft: 6, background: 'var(--bg-muted)' }}
            >
              Custom
            </span>
          )}
        </dd>

        <dt>Customer</dt>
        <dd>{customer.name}</dd>

        <dt>Address</dt>
        <dd>{customer.address}</dd>

        <dt>HubSpot</dt>
        <dd className="mono small">{customer.hubspot}</dd>

        <dt>Date</dt>
        <dd>
          {fmtDate(new Date(slot.dateKey + 'T12:00:00'), {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          {slot.daysSpanned > 1 && (
            <>
              {' → '}
              {fmtDate(new Date(slot.endDateKey + 'T12:00:00'), {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </>
          )}
        </dd>

        <dt>Time</dt>
        <dd>
          {fmtTime(slot.startHour)} – {fmtTime(slot.endHour)}{' '}
          <span className="muted small">
            (
            {slot.daysSpanned > 1
              ? slot.daysSpanned + '-day span'
              : Math.round(slot.endHour - slot.startHour) + 'h'}
            )
          </span>
        </dd>

        <dt>Crew</dt>
        <dd>{crew?.name ?? '—'}</dd>

        <dt>Vehicle</dt>
        <dd>
          {vehicle.mode === 'fleet' ? (
            truck?.name ?? 'No truck assigned'
          ) : vehicle.mode === 'personal' ? (
            <>
              Personal vehicle ·{' '}
              {getPerson(people, vehicle.personalDriverId)?.name ?? 'driver'}
            </>
          ) : (
            'None — no vehicle'
          )}
        </dd>

        {extraCrews.length > 0 && (
          <>
            <dt>Extra crews</dt>
            <dd>
              {extraCrews
                .map((id) => getCrew(crews, id)?.name)
                .filter(Boolean)
                .join(', ')}
            </dd>
          </>
        )}
      </dl>

      <div className="card" style={{ background: 'var(--bg-subtle)' }}>
        <h4
          style={{
            fontSize: 13,
            marginBottom: 8,
            marginTop: 0,
            fontFamily: 'var(--font-subhead)',
          }}
        >
          Crew composition
        </h4>
        <div className="col" style={{ gap: 4 }}>
          {templateSlots.map((slotRow, i) => {
            const role = ROLES[slotRow.role];
            const member =
              crew?.members
                .map((id) => getPerson(people, id))
                .find((p) => !!p && p.roles.includes(slotRow.role)) ??
              people.find((p) => p.roles.includes(slotRow.role));
            return (
              <div
                key={i}
                className="row"
                style={{
                  fontSize: 13,
                  padding: '6px 8px',
                  background: 'var(--surface-card)',
                  borderRadius: 8,
                }}
              >
                <Avatar person={member ?? null} size="sm" />
                <strong>{member?.name ?? '—'}</strong>
                <span className="tag">
                  {role?.label ?? slotRow.role} · {slotRow.level}
                </span>
                <span
                  className="muted small mono"
                  style={{ marginLeft: 'auto' }}
                >
                  {slotRow.hours}h
                  {slotRow.start ? ' (+' + slotRow.start + 'h)' : ''}
                </span>
              </div>
            );
          })}
          {templateSlots.length === 0 && (
            <div className="muted small">Ad-hoc — no required slots.</div>
          )}
        </div>
      </div>
    </>
  );
}
