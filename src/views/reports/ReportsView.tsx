// =============================================================
// Reports — read-only summary cards derived from current store state.
// Crew utilization, first-time-fix, revenue per truck, drive-time saved.
// =============================================================
import { useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import { TODAY, addDays, dateKey, startOfWeek } from '../../data/helpers';
import { getCrew, getTruck } from '../../data/selectors';
import { estimateDriveTime, optimizeRouteForCrew } from '../../lib/routing';

const STD_DAY_HOURS = 8;

// Crews synced from Zuper for traceability (admin pool, office back-office,
// floating coverage, sub-contractor pools, dispatcher group). Real install
// jobs never roll up to these in any healthy state — exclude from utilization,
// FTF, drive-time, and revenue rollups so they don't drag KPIs down with 0s.
function isAdminOrSupportCrewName(name: string): boolean {
  if (/\b(office|float|admin|dispatch|technicians - all|fe team)\b/i.test(name)) {
    return true;
  }
  // -sub or sub- (e.g. CO-DE-sub, MA-BO-Sub-Electricians)
  if (/-sub(-|$)/i.test(name)) return true;
  return false;
}

export function ReportsView() {
  const jobs = useStore((s) => s.jobs);
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const pushToast = useStore((s) => s.pushToast);

  const weekStart = useMemo(() => startOfWeek(TODAY), []);
  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekKeys = useMemo(() => weekDays.map((d) => dateKey(d)), [weekDays]);

  // ===== Crew utilization (this week) =====
  const utilization = useMemo(() => {
    return crews
      .filter((c) => c.type !== 'sales')
      // Exclude admin / office / float / dispatcher / sub-* crews that are
      // synced from Zuper for traceability but aren't real dispatchable units.
      // These otherwise show up as 0%-utilization noise that drags the avg down.
      .filter((c) => !isAdminOrSupportCrewName(c.name))
      .map((c) => {
        const dayHours = weekKeys.map((dk) =>
          jobs
            .filter(
              (j) =>
                j.date === dk &&
                (j.crewId === c.id || (j.extraCrewIds || []).includes(c.id)),
            )
            .reduce((a, j) => a + j.durationHrs, 0),
        );
        const total = dayHours.reduce((a, h) => a + h, 0);
        const capacity = weekDays.length * STD_DAY_HOURS;
        return {
          crew: c,
          hours: total,
          capacity,
          pct: Math.round((total / capacity) * 100),
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [crews, jobs, weekKeys, weekDays.length]);

  const avgUtilization =
    utilization.length === 0
      ? 0
      : Math.round(
          utilization.reduce((a, u) => a + u.pct, 0) / utilization.length,
        );

  // ===== Revenue + jobs per truck (90-day rolling) =====
  const truckStats = useMemo(() => {
    return trucks
      .filter((t) => t.assignedCrew)
      .map((t) => {
        const truckJobs = jobs.filter((j) => j.truckId === t.id);
        const revenue = truckJobs.reduce((a, j) => a + (j.price || 0), 0);
        const completed = truckJobs.filter((j) => j.status === 'complete').length;
        return { truck: t, jobs: truckJobs.length, completed, revenue };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [trucks, jobs]);

  // ===== First-time-fix (completed jobs with no callback in chain) =====
  const ftf = useMemo(() => {
    const installJobs = jobs.filter(
      (j) => j.status === 'complete' && j.type !== 'callback' && j.type !== 'meeting',
    );
    if (installJobs.length === 0) return { rate: 0, total: 0, withCallback: 0 };
    let withCallback = 0;
    installJobs.forEach((j) => {
      const callback = jobs.find(
        (k) => k.customer === j.customer && k.type === 'callback' && k.id !== j.id,
      );
      if (callback) withCallback++;
    });
    return {
      rate: Math.round(((installJobs.length - withCallback) / installJobs.length) * 100),
      total: installJobs.length,
      withCallback,
    };
  }, [jobs]);

  // ===== Drive-time saved by routing (today) =====
  const driveTimeSavings = useMemo(() => {
    const todayKey = dateKey(TODAY);
    const todays = jobs.filter((j) => j.date === todayKey && j.crewId);
    let baselineMin = 0;
    let optimizedMin = 0;
    crews.forEach((c) => {
      const own = todays.filter((j) => j.crewId === c.id);
      if (own.length < 2) return;
      const inOrder = [...own].sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0));
      for (let i = 0; i < inOrder.length - 1; i++) {
        baselineMin += estimateDriveTime(inOrder[i].address, inOrder[i + 1].address).minutes;
      }
      const optimized = optimizeRouteForCrew(own);
      for (let i = 0; i < optimized.length - 1; i++) {
        optimizedMin += estimateDriveTime(optimized[i].address, optimized[i + 1].address).minutes;
      }
    });
    return {
      baseline: baselineMin,
      optimized: optimizedMin,
      saved: Math.max(0, baselineMin - optimizedMin),
    };
  }, [jobs, crews]);

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        subtitle="Crew utilization, fix rates, revenue per truck, routing wins"
      >
        <button className="btn btn-outline btn-sm" onClick={() => pushToast('Export queued')}>
          <Icon name="arrow_right" size={14} /> Export CSV
        </button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Avg crew utilization</div>
            <div className="kpi-value">{avgUtilization}%</div>
            <div className="kpi-meta">
              {utilization.length} crews · {weekDays.length}-weekday rolling
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">First-time-fix rate</div>
            <div className="kpi-value">{ftf.total === 0 ? '—' : ftf.rate + '%'}</div>
            <div className="kpi-meta">
              {ftf.total === 0
                ? 'No completed jobs yet'
                : `${ftf.total - ftf.withCallback}/${ftf.total} completed without callback`}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Drive-time saved (today)</div>
            <div className="kpi-value">{driveTimeSavings.saved}m</div>
            <div className="kpi-meta">
              {driveTimeSavings.baseline}m baseline → {driveTimeSavings.optimized}m optimized
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Jobs this week</div>
            <div className="kpi-value">
              {jobs.filter((j) => j.date != null && weekKeys.includes(j.date)).length}
            </div>
            <div className="kpi-meta">{utilization.length} crews active</div>
          </div>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-subhead)',
            fontWeight: 700,
            fontSize: 16,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          Crew utilization (this week)
        </h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Crew</th>
                <th>Type</th>
                <th>Hours booked</th>
                <th>Capacity</th>
                <th>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {utilization.map(({ crew, hours, capacity, pct }) => {
                const truck = getTruck(trucks, crew.truck);
                return (
                  <tr key={crew.id}>
                    <td>
                      <div className="row">
                        <span
                          className="dot"
                          style={{
                            width: 8,
                            height: 8,
                            background: crew.color,
                            borderRadius: 999,
                          }}
                        ></span>
                        <span style={{ fontWeight: 600 }}>{crew.name}</span>
                        {truck && <span className="muted small">· {truck.name}</span>}
                      </div>
                    </td>
                    <td>
                      <span className="tag" style={{ textTransform: 'capitalize' }}>
                        {crew.type}
                      </span>
                    </td>
                    <td className="mono">{hours.toFixed(1)}h</td>
                    <td className="mono muted">{capacity}h</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div
                          style={{
                            width: 120,
                            height: 6,
                            background: 'var(--bg-muted)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: Math.min(100, pct) + '%',
                              height: '100%',
                              background:
                                pct > 100
                                  ? 'var(--jt-callback)'
                                  : pct > 85
                                  ? 'var(--jt-electrical)'
                                  : 'var(--jetson-green)',
                            }}
                          />
                        </div>
                        <span className="mono small">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-subhead)',
            fontWeight: 700,
            fontSize: 16,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          Revenue per vehicle (lifetime)
        </h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Crew</th>
                <th>Jobs</th>
                <th>Completed</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {truckStats.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                    <span className="muted small">
                      No vehicles added yet. Add trucks in Trucks &amp; vans to see
                      per-vehicle revenue.
                    </span>
                  </td>
                </tr>
              )}
              {truckStats.map(({ truck, jobs: jobCount, completed, revenue }) => {
                const crew = getCrew(crews, truck.assignedCrew);
                return (
                  <tr key={truck.id}>
                    <td>
                      <div className="row">
                        <Icon name="truck" size={14} />
                        <strong>{truck.name}</strong>
                        <span className="muted small mono">· {truck.plate}</span>
                      </div>
                    </td>
                    <td>{crew?.name || <span className="muted">—</span>}</td>
                    <td className="mono">{jobCount}</td>
                    <td className="mono">{completed}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      ${revenue.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className="muted small"
          style={{
            marginTop: 24,
            padding: 16,
            background: 'var(--bg-subtle)',
            borderRadius: 8,
            display: 'flex',
            gap: 8,
          }}
        >
          <Icon name="info" size={14} />
          <span>
            All metrics computed from current dispatch state. For finance-grade reporting,
            connect NetSuite via Settings → Integrations.
          </span>
        </div>
      </div>
    </>
  );
}
