// =============================================================
// KanbanBoard — columns by status. Drag a card between columns to
// transition its status via useStore().setJobStatus(id, newStatus).
//
// Columns: unscheduled · scheduled · enroute · onsite · callback ·
// complete (matches the prototype).
// =============================================================
import { useState } from 'react';
import type { Job, JobStatus } from '../../types';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JobTypeTag } from '../../components/JobTypeTag';
import { Avatar } from '../../components/Avatar';
import { fmtTime } from '../../data/helpers';
import { getCrew, getCustomer, getJobType } from '../../data/selectors';
import { useStore } from '../../store';

interface KanbanBoardProps {
  jobs: Job[];
  selectedJobId: string | null;
  onJobClick: (job: Job) => void;
}

interface ColDef {
  id: JobStatus;
  label: string;
}

const COLS: ColDef[] = [
  { id: 'unscheduled', label: 'Unscheduled' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'enroute', label: 'En route' },
  { id: 'onsite', label: 'On site' },
  { id: 'callback', label: 'Callback' },
  { id: 'complete', label: 'Complete' },
];

export function KanbanBoard({ jobs, selectedJobId, onJobClick }: KanbanBoardProps) {
  const allCrews = useStore((s) => s.crews);
  const allCustomers = useStore((s) => s.customers);
  const setJobStatus = useStore((s) => s.setJobStatus);
  const pushToast = useStore((s) => s.pushToast);

  const [dragOver, setDragOver] = useState<JobStatus | null>(null);

  function onDrop(target: JobStatus, jobId: string) {
    if (!jobId) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (job.status === target) return;
    setJobStatus(jobId, target);
    pushToast('Moved ' + jobId + ' → ' + target);
  }

  return (
    <div className="kanban">
      {COLS.map((col) => {
        const colJobs = jobs.filter((j) => j.status === col.id);
        return (
          <div
            key={col.id}
            className={'kanban-col' + (dragOver === col.id ? ' drop-active' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOver(col.id);
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (related && e.currentTarget.contains(related)) return;
              setDragOver((prev) => (prev === col.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const jobId = e.dataTransfer.getData('text/job-id');
              setDragOver(null);
              onDrop(col.id, jobId);
            }}
          >
            <div className="kanban-col-header">
              <div className="row">
                <span className="kanban-col-title">{col.label}</span>
                <span
                  className="badge"
                  style={{
                    background: 'var(--surface-card)',
                    marginLeft: 6,
                  }}
                >
                  {colJobs.length}
                </span>
              </div>
              <IconButton icon="plus" label="Add" size="sm" />
            </div>
            <div className="kanban-col-body">
              {colJobs.map((j) => {
                const c = getCustomer(allCustomers, j.customer);
                const jt = getJobType(j.type);
                const crew = getCrew(allCrews, j.crewId);
                const unfilled = j.slots.some(
                  (s) => !s.assignedTo && !s.optional,
                );
                const selected = selectedJobId === j.id;
                return (
                  <div
                    key={j.id}
                    className={
                      'kanban-card' + (selected ? ' selected' : '')
                    }
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/job-id', j.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onJobClick(j)}
                  >
                    <div
                      className="kanban-card-accent"
                      style={{
                        background:
                          'var(--' + (jt?.color || 'jt-meeting') + ')',
                      }}
                    />
                    <div style={{ paddingLeft: 6 }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <JobTypeTag type={j.type} />
                        <span
                          className="mono small muted"
                          style={{ marginLeft: 'auto' }}
                        >
                          {j.id}
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          marginBottom: 4,
                        }}
                      >
                        {c ? c.name : j.address?.split('·')[0] || 'Untitled'}
                      </div>
                      <div className="muted small row" style={{ gap: 6 }}>
                        <Icon name="map_pin" size={11} />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {j.address}
                        </span>
                      </div>
                      <div
                        className="row"
                        style={{
                          marginTop: 8,
                          justifyContent: 'space-between',
                        }}
                      >
                        <div className="row" style={{ gap: 4 }}>
                          {j.slots
                            .filter((s) => s.assignedTo)
                            .slice(0, 3)
                            .map((s, i) => (
                              <Avatar
                                key={i}
                                person={s.assignedTo}
                                size="xs"
                              />
                            ))}
                          {unfilled && (
                            <span className="unfilled-pill">
                              <Icon name="user" size={10} /> Unfilled
                            </span>
                          )}
                        </div>
                        {j.startHour != null && (
                          <span className="mono small muted">
                            {fmtTime(j.startHour)}
                          </span>
                        )}
                      </div>
                      {crew && (
                        <div
                          className="muted"
                          style={{ fontSize: 11, marginTop: 6 }}
                        >
                          {crew.name}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {colJobs.length === 0 && (
                <div
                  className="muted small"
                  style={{ padding: 12, textAlign: 'center' }}
                >
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
