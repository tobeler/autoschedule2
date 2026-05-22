// =============================================================
// DispatchBrief — morning brief panel above the calendar.
// KPIs for today + "Optimize all routes" + weather placeholder pill.
// =============================================================
import { useMemo } from 'react';
import type { Job } from '../../types';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { dateKey } from '../../data/helpers';
import { useStore } from '../../store';
import { optimizeRouteForCrew } from '../../lib/routing';

interface DispatchBriefProps {
  date: Date;
  jobs: Job[];
  onNewJob: () => void;
  onHide: () => void;
}

export function DispatchBrief({ date, jobs, onNewJob, onHide }: DispatchBriefProps) {
  const crews = useStore((s) => s.crews);
  const updateJob = useStore((s) => s.updateJob);
  const pushToast = useStore((s) => s.pushToast);

  const todayKey = dateKey(date);

  const kpi = useMemo(() => {
    const todayJobs = jobs.filter((j) => j.date === todayKey);
    return {
      total: todayJobs.length,
      onsite: todayJobs.filter((j) => j.status === 'onsite').length,
      complete: todayJobs.filter((j) => j.status === 'complete').length,
      unfilled: todayJobs.filter((j) =>
        j.slots.some((s) => !s.assignedTo && !s.optional),
      ).length,
      capUsed: Math.round(
        todayJobs.reduce((a, j) => a + (j.durationHrs || 0), 0),
      ),
      revenue: todayJobs.reduce((a, j) => a + (j.price || 0), 0),
    };
  }, [jobs, todayKey]);

  function optimizeAll() {
    let changes = 0;
    crews.forEach((c) => {
      const crewJobs = jobs.filter(
        (j) => j.date === todayKey && j.crewId === c.id && j.startHour != null,
      );
      if (crewJobs.length < 2) return;
      const ordered = optimizeRouteForCrew(crewJobs);
      const anchor = ordered[0].startHour ?? 8;
      let cursor = anchor;
      ordered.forEach((j, idx) => {
        if (idx === 0) {
          cursor = (j.startHour ?? anchor) + j.durationHrs;
          return;
        }
        const next = cursor + 0.25;
        if (Math.abs(next - (j.startHour ?? next)) > 0.01) {
          updateJob({ ...j, startHour: next });
          changes++;
        }
        cursor = next + j.durationHrs;
      });
    });
    pushToast(
      changes > 0
        ? 'Optimized routes · ' + changes + ' jobs shifted'
        : 'Routes already optimized',
    );
  }

  return (
    <div className="brief">
      <div className="brief-row">
        <div>
          <div className="brief-greeting">Good morning, Jordan.</div>
          <div className="brief-sub">
            {kpi.total} jobs on the board · {kpi.onsite} on site · sunny, 64°F
          </div>
        </div>
        <div className="brief-stats">
          <div className="brief-stat">
            <div className="brief-stat-value good">{kpi.total}</div>
            <div className="brief-stat-label">Jobs today</div>
          </div>
          <div className="brief-stat">
            <div className="brief-stat-value good">
              {Math.round((kpi.capUsed / 80) * 100)}%
            </div>
            <div className="brief-stat-label">Capacity used</div>
          </div>
          <div className="brief-stat">
            <div
              className={
                'brief-stat-value ' + (kpi.unfilled > 0 ? 'alert' : 'good')
              }
            >
              {kpi.unfilled}
            </div>
            <div className="brief-stat-label">Unfilled slots</div>
          </div>
          <div className="brief-stat">
            <div className="brief-stat-value good">
              {kpi.complete}/{kpi.total}
            </div>
            <div className="brief-stat-label">Complete</div>
          </div>
        </div>
        <div className="brief-actions">
          <button className="btn btn-primary btn-sm" onClick={onNewJob}>
            <Icon name="plus" size={14} /> New job
          </button>
          <button className="btn btn-outline btn-sm" onClick={optimizeAll}>
            <Icon name="sparkle" size={14} /> Optimize all routes
          </button>
          <IconButton icon="x" label="Hide" onClick={onHide} variant="ghost" />
        </div>
      </div>
    </div>
  );
}
