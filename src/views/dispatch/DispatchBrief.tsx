// =============================================================
// DispatchBrief — morning brief panel above the calendar.
// KPIs for today + "Optimize all routes" + weather placeholder pill.
// =============================================================
import { useMemo } from 'react';
import type { Job } from '../../types';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { dateKey, fmtDate } from '../../data/helpers';
import { unscheduledJobs, unscheduledNeedsReviewJobs } from '../../data/selectors';
import { useStore } from '../../store';
import { optimizeRouteForCrew } from '../../lib/routing';
import { buildAttentionItems } from '../attention/buildAttentionItems';
import { rankAttentionItemsByImpact } from '../attention/rankAttentionImpact';

interface DispatchBriefProps {
  date: Date;
  jobs: Job[];
  onNewJob: () => void;
  onHide: () => void;
}

export function DispatchBrief({ date, jobs, onNewJob, onHide }: DispatchBriefProps) {
  const crews = useStore((s) => s.crews);
  const customers = useStore((s) => s.customers);
  const projects = useStore((s) => s.projects);
  const people = useStore((s) => s.people);
  const timeOff = useStore((s) => s.timeOff);
  const updateJob = useStore((s) => s.updateJob);
  const pushToast = useStore((s) => s.pushToast);
  const currentUserName = useStore((s) => s.currentUserName);
  const setTab = useStore((s) => s.setTab);
  const openSmartSchedule = useStore((s) => s.openSmartSchedule);

  const todayKey = dateKey(date);

  const kpi = useMemo(() => {
    const todayJobs = jobs.filter((j) => j.date === todayKey);
    const active = jobs.filter((j) => j.status !== 'complete' && j.status !== 'cancelled');
    // Scoped to 'scheduled' only — enroute/onsite without a crewId are
    // already in the field and aren't an actionable assignment task.
    const scheduledNoCrew = active.filter((j) => j.status === 'scheduled' && !j.crewId);
    const readyUnscheduled = unscheduledJobs(active);
    const reviewUnscheduled = unscheduledNeedsReviewJobs(active);
    // The Unfilled-slots tile is only meaningful when at least one job
    // carries a roster. Zuper-sourced jobs ship without slots, so until
    // dispatchers start filling them locally this KPI is misleading
    // (always 0 even when crews are missing). slotsAvailable flips it
    // from a fake-good "0" to an honest "—".
    const slotsAvailable = todayJobs.some((j) => j.slots.length > 0);
    return {
      total: todayJobs.length,
      onsite: todayJobs.filter((j) => j.status === 'onsite').length,
      complete: todayJobs.filter((j) => j.status === 'complete').length,
      unfilled: todayJobs.filter((j) =>
        j.slots.some((s) => !s.assignedTo && !s.optional),
      ).length,
      slotsAvailable,
      capUsed: Math.round(
        todayJobs.reduce((a, j) => a + (j.durationHrs || 0), 0),
      ),
      revenue: todayJobs.reduce((a, j) => a + (j.price || 0), 0),
      scheduledNoCrew: scheduledNoCrew.length,
      readyUnscheduled: readyUnscheduled.length,
      reviewUnscheduled: reviewUnscheduled.length,
      missingAddress: active.filter((j) => !j.address).length,
    };
  }, [jobs, todayKey]);

  const topImpact = useMemo(
    () =>
      rankAttentionItemsByImpact(buildAttentionItems({ jobs, customers, people, crews, timeOff }), {
        jobs,
        projects,
        customers,
        people,
        crews,
        timeOff,
      }).slice(0, 3),
    [jobs, projects, customers, people, crews, timeOff],
  );

  const topReadyJob = useMemo(() => {
    return (
      unscheduledJobs(jobs)
        .filter((j) => j.type !== 'callback')
        .slice()
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0] ?? null
    );
  }, [jobs]);

  function optimizeAll() {
    // Confirmation gate — this rewrites every crew's job-order for today.
    // Cheap to undo per-job but expensive to undo across all crews.
    const todaysCrewJobCount = jobs.filter(
      (j) => j.date === todayKey && j.startHour != null && j.crewId,
    ).length;
    if (
      !window.confirm(
        `Re-optimize routes for ${todaysCrewJobCount} job${todaysCrewJobCount === 1 ? '' : 's'} across ` +
          `${crews.length} crew${crews.length === 1 ? '' : 's'} for ${fmtDate(date)}? ` +
          `This will reorder and re-time each crew's jobs based on travel distance.`,
      )
    ) {
      return;
    }
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
          <div className="brief-greeting">{(() => {
            const hr = new Date().getHours();
            const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
            const first = (currentUserName || '').split(' ')[0] || 'there';
            return greet + ', ' + first + '.';
          })()}</div>
          <div className="brief-sub">
            {kpi.total} jobs today · {kpi.onsite} on site · {kpi.readyUnscheduled} ready to schedule
          </div>
        </div>
        <div className="brief-stats">
          <div className="brief-stat">
            <div className="brief-stat-value good">{kpi.total}</div>
            <div className="brief-stat-label">Jobs today</div>
          </div>
          <div className="brief-stat">
            {(() => {
              // Capacity = active crews × 8 hour shift. Without crews
              // defined this metric is meaningless — show an honest "—"
              // rather than dividing-by-80 hardcoded denominator that
              // produces nonsense like "129%" on a board with no crews.
              const dispatchCrews = crews.filter((c) => c.type !== 'ad_hoc' && c.type !== 'sales');
              const installCapHrs = dispatchCrews.length * 8;
              if (installCapHrs === 0) {
                return (
                  <>
                    <div className="brief-stat-value">—</div>
                    <div className="brief-stat-label">Capacity used</div>
                  </>
                );
              }
              const pct = Math.round((kpi.capUsed / installCapHrs) * 100);
              const cls = pct > 100 ? 'alert' : pct > 85 ? 'warn' : 'good';
              return (
                <>
                  <div className={'brief-stat-value ' + cls}>{pct}%</div>
                  <div className="brief-stat-label">Capacity used</div>
                </>
              );
            })()}
          </div>
          <div className="brief-stat">
            {kpi.slotsAvailable ? (
              <>
                <div
                  className={
                    'brief-stat-value ' + (kpi.unfilled > 0 ? 'alert' : 'good')
                  }
                >
                  {kpi.unfilled}
                </div>
                <div className="brief-stat-label">Unfilled slots</div>
              </>
            ) : (
              <>
                <div className="brief-stat-value" title="Crew rosters per job not synced yet — assign slots in the drawer to populate this.">—</div>
                <div className="brief-stat-label">Unfilled slots</div>
              </>
            )}
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
          <button className="btn btn-outline btn-sm" onClick={() => setTab('attention')}>
            <Icon name="bar_chart" size={14} /> Impact queue
          </button>
          <button className="btn btn-outline btn-sm" onClick={optimizeAll}>
            <Icon name="sparkle" size={14} /> Optimize all routes
          </button>
          <IconButton icon="x" label="Hide" onClick={onHide} variant="ghost" />
        </div>
      </div>
      <div className="brief-risk-row">
        <div className="brief-risk-summary">
          {/* Count chips: severity color is derived from the count itself
              so "1,219 missing address" reads catastrophic while
              "107 ready to schedule" reads healthy without a number race. */}
          <span
            style={{
              color: kpi.readyUnscheduled > 0 ? 'var(--jetson-green, #3CD567)' : undefined,
            }}
          >
            {kpi.readyUnscheduled.toLocaleString()} ready to schedule
          </span>
          <span
            style={{
              color: kpi.reviewUnscheduled > 50 ? '#FFB627' : undefined,
            }}
          >
            {kpi.reviewUnscheduled.toLocaleString()} held for review
          </span>
          <span
            style={{
              color: kpi.scheduledNoCrew > 0 ? '#FFB627' : undefined,
            }}
          >
            {kpi.scheduledNoCrew.toLocaleString()} active without crew
          </span>
          <span
            style={{
              color:
                kpi.missingAddress > 500
                  ? '#C53030'
                  : kpi.missingAddress > 50
                    ? '#FFB627'
                    : undefined,
              fontWeight: kpi.missingAddress > 500 ? 700 : undefined,
            }}
            title={`${kpi.missingAddress} jobs have no address synced — driver can't navigate.`}
          >
            {kpi.missingAddress.toLocaleString()} missing address
          </span>
        </div>
        <div className="brief-impact-list">
          {/* Action queue: title only, no mystery leading number. Hover for
              impact-score detail. */}
          {topImpact.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab('attention')}
              title={`Impact score ${item.impact.score}`}
            >
              <span className="brief-impact-title">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="brief-agent-row">
        <div className="brief-agent-label">
          <Icon name="sparkle" size={12} />
          Agent tools
        </div>
        <button type="button" onClick={() => setTab('attention')}>
          <Icon name="bar_chart" size={12} />
          Rank impact
        </button>
        <button
          type="button"
          disabled={!topReadyJob}
          onClick={() => topReadyJob && openSmartSchedule(topReadyJob.id)}
        >
          <Icon name="calendar" size={12} />
          Schedule top job
        </button>
        <button type="button" onClick={() => setTab('attention')}>
          <Icon name="users" size={12} />
          Find coverage
        </button>
        <button type="button" onClick={optimizeAll}>
          <Icon name="truck" size={12} />
          Optimize routes
        </button>
      </div>
    </div>
  );
}
