// =============================================================
// NewJobWizard — 4-step modal: Customer → Job type → When & who → Review.
// Step headers are clickable to jump BACK to completed steps.
// Continue button uses a clear "greige" disabled treatment (not opacity).
// On commit, builds a real Job, calls useStore().addJob, closes, toasts.
// =============================================================
import { useEffect, useMemo, useState } from 'react';

import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';

import { addDays, dateKey, fmtTime, TODAY } from '../../data/helpers';
import { getCrew, getPerson } from '../../data/selectors';
import { ROLES } from '../../data/seed';
import { useStore } from '../../store';
import type { Customer, Job, JobSlot, VehicleMode } from '../../types';

import { Step1Customer } from './Step1Customer';
import { Step2JobType } from './Step2JobType';
import { Step3WhenWho } from './Step3WhenWho';
import { Step4Review } from './Step4Review';
import { WizardStyles } from './wizardStyles';
import type { TemplateDraft } from './TemplateBuilder';
import type { PickedSlot } from '../SuggestTimePicker';
import type { VehicleSelection } from '../VehiclePicker';

const STEPS = ['Customer', 'Job type', 'When & who', 'Review'] as const;

export function NewJobWizard() {
  const closeWizard = useStore((s) => s.closeWizard);
  const addJob = useStore((s) => s.addJob);
  const pushToast = useStore((s) => s.pushToast);
  const templates = useStore((s) => s.templates);
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);

  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [vehicle, setVehicle] = useState<VehicleSelection>({
    mode: 'fleet',
    personalDriverId: null,
  });
  const [extraCrews, setExtraCrews] = useState<string[]>([]);

  // ESC closes the wizard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWizard();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeWizard]);

  // Slots derived from the chosen template (always live to template changes).
  const templateSlots: JobSlot[] = useMemo(() => {
    if (!type) return [];
    const tpl = templates[type];
    if (!tpl) return [];
    return tpl.slots.map((s, i) => ({
      id: 'new-s' + i,
      role: s.role,
      level: s.level,
      hours: s.hours,
      start: s.start,
      optional: s.optional,
      assignedTo: null,
    }));
  }, [type, templates]);

  function canAdvance(): boolean {
    if (step === 0) return !!customer;
    if (step === 1) return !!type && !templateDraft;
    if (step === 2) return !!slot;
    return true;
  }

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  function commit() {
    if (!customer || !type || !slot) return;
    const crew = getCrew(crews, slot.crewId);
    const filledSlots: JobSlot[] = templateSlots.map((s) => ({ ...s }));
    if (crew) {
      filledSlots.forEach((s) => {
        if (s.assignedTo) return;
        const member = crew.members
          .map((id) => getPerson(people, id))
          .find((p) => !!p && p.roles.includes(s.role));
        if (member) {
          s.assignedTo = member.id;
          return;
        }
        const fallback = people.find((p) => p.roles.includes(s.role));
        if (fallback) s.assignedTo = fallback.id;
      });
    }

    const vehicleMode: VehicleMode = vehicle.mode;
    const truckId =
      vehicleMode === 'fleet' ? (crew?.truck ?? null) : null;

    const newJob: Job = {
      id: 'J-' + (2700 + Math.floor(Math.random() * 99)),
      type,
      status: 'scheduled',
      customer: customer.id,
      address: customer.address,
      date: slot.dateKey,
      startHour: slot.startHour,
      durationHrs:
        slot.daysSpanned > 1
          ? Math.max(...filledSlots.map((s) => (s.start || 0) + s.hours), 1)
          : slot.endHour - slot.startHour,
      crewId: slot.crewId,
      extraCrewIds: extraCrews,
      truckId,
      slots: filledSlots,
      notes: '',
      hubspotDealId: 'DEAL-' + (44300 + Math.floor(Math.random() * 99)),
      driveTimeMin: 18,
      vehicleMode,
      personalDriverId: vehicleMode === 'personal' ? vehicle.personalDriverId : null,
      endDate: slot.endDateKey,
      endHour: slot.endHour,
      daysSpanned: slot.daysSpanned || 1,
    };
    addJob(newJob);

    const whenStr =
      slot.daysSpanned > 1
        ? slot.dateKey + ' → ' + slot.endDateKey
        : slot.dateKey + ' at ' + fmtTime(slot.startHour);
    pushToast('Job ' + newJob.id + ' scheduled · ' + whenStr);
    closeWizard();
  }

  return (
    <>
      <WizardStyles />
      <div className="modal-backdrop" onClick={closeWizard}>
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          style={{ width: 920, maxWidth: '96vw' }}
          role="dialog"
          aria-label="New job"
        >
          <div className="modal-header">
            <div className="row-icon-bg">
              <Icon name="briefcase" size={16} />
            </div>
            <div>
              <div className="eyebrow-sm">New job</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Schedule a new job</div>
            </div>
            <div className="topbar-spacer"></div>
            <IconButton icon="x" label="Close" onClick={closeWizard} />
          </div>

          {/* CLICKABLE STEP STRIP */}
          <div className="wiz-steps">
            {STEPS.map((label, i) => {
              const canJump = i < step; // only let users jump BACK
              const cls =
                'wiz-step' +
                (step === i ? ' active' : step > i ? ' done' : '') +
                (canJump ? ' clickable' : '');
              return (
                <button
                  key={label}
                  type="button"
                  className={cls}
                  onClick={() => canJump && setStep(i)}
                  disabled={!canJump && step !== i}
                  aria-current={step === i ? 'step' : undefined}
                >
                  <span className="wiz-step-num">{step > i ? '✓' : i + 1}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="modal-body">
            {step === 0 && (
              <Step1Customer value={customer} onChange={setCustomer} />
            )}
            {step === 1 && (
              <Step2JobType
                type={type}
                onType={setType}
                draft={templateDraft}
                onDraft={setTemplateDraft}
              />
            )}
            {step === 2 && customer && type && (
              <Step3WhenWho
                type={type}
                customer={customer}
                templateSlots={templateSlots}
                slot={slot}
                onSlot={setSlot}
                vehicle={vehicle}
                onVehicle={setVehicle}
                extraCrews={extraCrews}
                onExtraCrews={setExtraCrews}
              />
            )}
            {step === 3 && customer && type && slot && (
              <Step4Review
                type={type}
                customer={customer}
                templateSlots={templateSlots}
                slot={slot}
                vehicle={vehicle}
                extraCrews={extraCrews}
              />
            )}
          </div>

          <div className="modal-footer">
            <div className="muted small">
              Step {step + 1} of {STEPS.length}
            </div>
            <div className="row">
              {step > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={back}
                >
                  Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  className={
                    'btn btn-sm ' + (canAdvance() ? 'btn-primary' : 'btn-greige')
                  }
                  disabled={!canAdvance()}
                  onClick={next}
                >
                  Continue <Icon name="arrow_right" size={12} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={commit}
                >
                  <Icon name="check" size={12} /> Create job
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Helper to drive a default-date suggestion for the picker — unused here
// but exported so other entry points (e.g. SmartScheduleModal v2) could share.
export function defaultPickerStartDate(): Date {
  return addDays(TODAY, 1);
}

export const _wizardDateKey = dateKey;
