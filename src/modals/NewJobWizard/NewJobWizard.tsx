import { Icon } from '../../components/Icon';
import { useStore } from '../../store';

/** STUB — Phase 5 agent fills in the 4-step wizard + SuggestTimePicker + VehiclePicker + TemplateBuilder. */
export function NewJobWizard() {
  const closeWizard = useStore((s) => s.closeWizard);
  return (
    <div className="modal-overlay" onClick={closeWizard}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New job</h3>
          <button className="btn btn-ghost btn-icon" onClick={closeWizard} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          <p className="muted small">Phase 5 agent: replace this with the full wizard.</p>
        </div>
      </div>
    </div>
  );
}
