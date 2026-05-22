// =============================================================
// UnscheduledRail — drag-source rail of unscheduled jobs.
//
// Each card is HTML5-draggable; dropping it on a DayCalendar row
// schedules it to that crew/truck at the cursor's hour.
// =============================================================
import type { Job } from '../../types';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JobTypeTag } from '../../components/JobTypeTag';
import { useStore } from '../../store';

interface UnscheduledRailProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onCollapse: () => void;
}

export function UnscheduledRail({ jobs, onJobClick, onCollapse }: UnscheduledRailProps) {
  const customers = useStore((s) => s.customers);

  return (
    <div className="unscheduled-rail">
      <div className="rail-header">
        <div>
          <div className="rail-title">Unscheduled</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {jobs.length} jobs · drag to schedule
          </div>
        </div>
        <IconButton icon="chevron_left" label="Collapse" onClick={onCollapse} />
      </div>
      <div className="rail-list">
        {jobs.length === 0 && (
          <div
            className="muted small"
            style={{ padding: 16, textAlign: 'center' }}
          >
            No unscheduled jobs.
          </div>
        )}
        {jobs.map((job) => {
          const c = customers.find((cc) => cc.id === job.customer);
          return (
            <div
              key={job.id}
              className="unsched-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/job-id', job.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onJobClick(job)}
            >
              <div className="unsched-card-header">
                <JobTypeTag type={job.type} />
                <span className="unsched-card-id mono">{job.id}</span>
                <Icon
                  name="drag"
                  size={14}
                  stroke="var(--mid-gray)"
                  style={{ marginLeft: 'auto' }}
                />
              </div>
              <div className="unsched-card-name">
                {c ? c.name : job.address || 'Untitled'}
              </div>
              <div className="unsched-card-meta" style={{ marginTop: 4 }}>
                <Icon name="map_pin" size={11} />
                <span>
                  {job.address
                    ? job.address.split('·')[1]?.trim() || job.address
                    : '—'}
                </span>
              </div>
              {job.notes && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  {job.notes}
                </div>
              )}
              {job.price != null && (
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="pill" style={{ fontSize: 11 }}>
                    ${job.price.toLocaleString()}
                  </span>
                  {job.hubspotDealId && (
                    <span
                      className="pill"
                      style={{
                        fontSize: 10,
                        background: 'rgba(255,122,89,0.12)',
                        color: '#9F3D24',
                      }}
                    >
                      <Icon name="hubspot" size={10} /> Deal
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
