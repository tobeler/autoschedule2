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
import { getJobType } from '../../data/selectors';
import { jobDisplayName } from '../../lib/customer-display';

interface UnscheduledRailProps {
  jobs: Job[];
  reviewCount?: number;
  /**
   * When set, the rail header shows a small badge identifying the
   * external source the canonical job list was pulled from
   * (currently always 'rebate-dashboard'). When null, the rail is
   * sourced from the local `readyToScheduleJobs` selector and no
   * badge renders.
   */
  liveSource?: string | null;
  onJobClick: (job: Job) => void;
  onCollapse: () => void;
}

export function UnscheduledRail({
  jobs,
  reviewCount = 0,
  liveSource = null,
  onJobClick,
  onCollapse,
}: UnscheduledRailProps) {
  const customers = useStore((s) => s.customers);
  const moveJob = useStore((s) => s.moveJob);
  const pushToast = useStore((s) => s.pushToast);

  return (
    <div
      className="unscheduled-rail"
      onDragOver={(e) => {
        // Allow dropping scheduled jobs back onto the rail.
        if (e.dataTransfer.types.includes('text/job-id')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          e.currentTarget.classList.add('rail-drag-target');
        }
      }}
      onDragLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        e.currentTarget.classList.remove('rail-drag-target');
      }}
      onDrop={(e) => {
        e.currentTarget.classList.remove('rail-drag-target');
        const jobId = e.dataTransfer.getData('text/job-id');
        if (!jobId) return;
        moveJob(jobId, {
          date: null,
          startHour: null,
          crewId: null,
          truckId: null,
        });
        pushToast(`Moved ${jobId} to Unscheduled`);
      }}
    >
      <div className="rail-header">
        <div>
          <div
            className="rail-title"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Unscheduled</span>
            {liveSource && (
              <span
                title={`Source: ${liveSource}`}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'rgba(80,160,255,0.14)',
                  color: '#1F5BB1',
                  border: '1px solid rgba(80,160,255,0.32)',
                }}
              >
                via {liveSource}
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {jobs.length} dispatch-ready
            {reviewCount > 0 ? ' · ' + reviewCount + ' need review' : ' · clean queue'}
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
            No dispatch-ready unscheduled jobs.
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
                <Icon
                  name="drag"
                  size={14}
                  stroke="var(--mid-gray)"
                  style={{ marginLeft: 'auto' }}
                />
              </div>
              <div className="unsched-card-name">
                {jobDisplayName(job, c, getJobType(job.type))}
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
              {job.hubspotDealId && (
                <div className="row" style={{ marginTop: 8 }}>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
