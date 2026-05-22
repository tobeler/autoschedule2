import { Icon } from '../components/Icon';
import { useStore } from '../store';

/** STUB — Phase 3 agent fills in ranked-crew suggestions modal. */
export function SmartScheduleModal() {
  const closeSmartSchedule = useStore((s) => s.closeSmartSchedule);
  const jobId = useStore((s) => s.smartScheduleJobId);
  if (!jobId) return null;
  return (
    <div className="modal-overlay" onClick={closeSmartSchedule}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Smart schedule · {jobId}</h3>
          <button className="btn btn-ghost btn-icon" onClick={closeSmartSchedule} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          <p className="muted small">Phase 3 agent: ranked list of crews + reasoning + click-to-schedule.</p>
        </div>
      </div>
    </div>
  );
}
