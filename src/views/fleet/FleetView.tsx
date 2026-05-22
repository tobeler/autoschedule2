// =============================================================
// Fleet view — trucks/vans table with utilization bars, today's
// jobs, in-shop/available status and assigned crew.
// =============================================================
import { useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JobTypeTag } from '../../components/JobTypeTag';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import { TODAY, dateKey, fmtTime } from '../../data/helpers';
import { getCrew } from '../../data/selectors';
import type { Truck } from '../../types';

export function FleetView() {
  const trucks = useStore((s) => s.trucks);
  const crews = useStore((s) => s.crews);
  const jobs = useStore((s) => s.jobs);

  const todayDk = dateKey(TODAY);

  // Stable utilization per-truck (deterministic, derived from id hash + jobs today)
  const utilization = useMemo(() => {
    const map: Record<string, number> = {};
    trucks.forEach((t) => {
      let h = 0;
      for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
      const base = 55 + (h % 40);
      const todayBoost = jobs.filter(
        (j) => j.truckId === t.id && j.date === todayDk,
      ).length;
      map[t.id] = Math.min(99, base + todayBoost * 3);
    });
    return map;
  }, [trucks, jobs, todayDk]);

  const activeCount = trucks.filter((t) => !t.status || t.status === 'assigned').length;
  const shopCount = trucks.filter((t) => t.status === 'shop').length;
  const availableCount = trucks.filter((t) => t.status === 'available').length;

  const fleetAvg = useMemo(() => {
    const vals = Object.values(utilization);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [utilization]);

  return (
    <>
      <PageHeader
        eyebrow="Resources"
        title="Trucks & vans"
        subtitle={
          trucks.length +
          ' vehicles · ' +
          activeCount +
          ' active, ' +
          shopCount +
          ' in shop, ' +
          availableCount +
          ' available'
        }
      >
        <button className="btn btn-outline btn-sm">
          <Icon name="grid" size={14} /> Map view
        </button>
        <button className="btn btn-primary btn-sm">
          <Icon name="plus" size={14} /> Add vehicle
        </button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Active vehicles</div>
            <div className="kpi-value">{activeCount}</div>
            <div className="kpi-meta">
              {trucks.filter((t) => t.kind === 'install').length} install ·{' '}
              {trucks.filter((t) => t.kind === 'electrical').length} electrical ·{' '}
              {trucks.filter((t) => t.kind === 'plumbing').length} plumbing
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Fleet utilization</div>
            <div className="kpi-value">{fleetAvg}%</div>
            <div className="kpi-meta up">7-day avg</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">In shop</div>
            <div className="kpi-value">{shopCount}</div>
            <div className="kpi-meta">
              {trucks.find((t) => t.status === 'shop')
                ? trucks.find((t) => t.status === 'shop')!.name +
                  ' · service · back Thu'
                : '—'}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Available pool</div>
            <div className="kpi-value">{availableCount}</div>
            <div className="kpi-meta">
              {trucks.find((t) => t.status === 'available')
                ? trucks.find((t) => t.status === 'available')!.name +
                  ' — assignable on demand'
                : '—'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Type</th>
                <th>Plate</th>
                <th>Assigned crew</th>
                <th>Today</th>
                <th>Utilization (7d)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((t) => {
                const crew = getCrew(crews, t.assignedCrew);
                const todayJobs = jobs.filter(
                  (j) => j.truckId === t.id && j.date === todayDk,
                );
                const u = utilization[t.id];
                return (
                  <tr key={t.id} className="clickable">
                    <td>
                      <div className="row">
                        <div className="row-icon-bg">
                          <Icon name={iconForKind(t.kind)} size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700 }}>{t.name}</div>
                          <div className="muted small">{t.capacity}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="tag"
                        style={{ textTransform: 'capitalize' }}
                      >
                        {t.kind}
                      </span>
                    </td>
                    <td className="mono small">{t.plate}</td>
                    <td>
                      {crew ? (
                        crew.name
                      ) : (
                        <span className="muted">— Unassigned —</span>
                      )}
                    </td>
                    <td>
                      {todayJobs.length === 0 && (
                        <span className="muted small">No jobs</span>
                      )}
                      {todayJobs.map((j) => (
                        <div
                          key={j.id}
                          className="row"
                          style={{ gap: 4, marginBottom: 2 }}
                        >
                          <JobTypeTag type={j.type} />
                          <span className="mono small muted">
                            {j.startHour != null ? fmtTime(j.startHour) : '—'}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div
                          style={{
                            width: 100,
                            height: 6,
                            background: 'var(--bg-muted)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: u + '%',
                              height: '100%',
                              background:
                                u > 90 ? 'var(--jt-callback)' : 'var(--jetson-green)',
                            }}
                          ></div>
                        </div>
                        <span className="mono small">{u}%</span>
                      </div>
                    </td>
                    <td>
                      {t.status === 'shop' && (
                        <span className="badge badge-callback">In shop</span>
                      )}
                      {t.status === 'available' && (
                        <span className="badge badge-scheduled">Available</span>
                      )}
                      {(!t.status || t.status === 'assigned') && (
                        <span className="badge badge-onsite">Active</span>
                      )}
                    </td>
                    <td>
                      <IconButton icon="more" label="Actions" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function iconForKind(kind: Truck['kind']) {
  if (kind === 'electrical') return 'bolt' as const;
  if (kind === 'plumbing') return 'droplet' as const;
  return 'truck' as const;
}
