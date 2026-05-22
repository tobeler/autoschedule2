// =============================================================
// MapView — SVG canvas with numbered pins colored by crew and route
// lines connecting consecutive stops per crew. Side panel lists
// today's jobs grouped by crew, in route order.
// =============================================================
import { useMemo, useState, Fragment } from 'react';
import type { Crew, Job } from '../../types';
import { Icon } from '../../components/Icon';
import { JobTypeTag } from '../../components/JobTypeTag';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtTime } from '../../data/helpers';
import { getCrew, getCustomer } from '../../data/selectors';
import { estimateDriveTime } from '../../lib/routing';
import { useStore } from '../../store';

interface MapViewProps {
  date: string;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

interface CrewRoute {
  crew: Crew;
  jobs: Job[];
}

/** Deterministic pin coords (0..100) from job id. */
function coords(jobId: string): { x: number; y: number } {
  const seed = jobId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const x = 10 + ((seed * 7) % 80);
  const y = 12 + ((seed * 13) % 76);
  return { x, y };
}

export function MapView({ date, jobs, onJobClick }: MapViewProps) {
  const allCrews = useStore((s) => s.crews);
  const allCustomers = useStore((s) => s.customers);
  const pushToast = useStore((s) => s.pushToast);

  const [selectedCrew, setSelectedCrew] = useState<string>('all');

  const dayJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.date === date && j.startHour != null)
        .sort((a, b) => (a.startHour as number) - (b.startHour as number)),
    [jobs, date],
  );

  const crewRoutes = useMemo<CrewRoute[]>(() => {
    const map = new Map<string, Job[]>();
    dayJobs.forEach((j) => {
      if (!j.crewId) return;
      const arr = map.get(j.crewId);
      if (arr) arr.push(j);
      else map.set(j.crewId, [j]);
    });
    const out: CrewRoute[] = [];
    map.forEach((js, crewId) => {
      const crew = getCrew(allCrews, crewId);
      if (!crew) return;
      if (selectedCrew !== 'all' && crew.id !== selectedCrew) return;
      out.push({ crew, jobs: js });
    });
    return out;
  }, [dayJobs, allCrews, selectedCrew]);

  const allCrewIds = useMemo(() => {
    return Array.from(new Set(dayJobs.map((j) => j.crewId).filter(Boolean)));
  }, [dayJobs]) as string[];

  const totalDriveMinutes = useMemo(() => {
    let total = 0;
    crewRoutes.forEach(({ jobs: js }) => {
      for (let i = 0; i < js.length - 1; i++) {
        total += estimateDriveTime(js[i].address, js[i + 1].address).minutes;
      }
    });
    return total;
  }, [crewRoutes]);

  return (
    <div className="map-view">
      <div className="map-canvas">
        {/* Route lines */}
        <svg
          className="map-route-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {crewRoutes.map(({ crew, jobs: js }) => {
            if (js.length < 2) return null;
            const path = js
              .map((j, i) => {
                const c = coords(j.id);
                return (i === 0 ? 'M' : 'L') + c.x + ' ' + c.y;
              })
              .join(' ');
            return (
              <Fragment key={crew.id}>
                <path className="route-shadow" d={path} />
                <path d={path} stroke={crew.color} strokeDasharray="0" />
              </Fragment>
            );
          })}
        </svg>

        {/* Pins */}
        {crewRoutes.flatMap(({ crew, jobs: js }) =>
          js.map((j, i) => {
            const { x, y } = coords(j.id);
            const c = getCustomer(allCustomers, j.customer);
            return (
              <div
                key={j.id}
                className="map-pin-large"
                style={{ left: x + '%', top: y + '%' }}
                onClick={() => onJobClick(j)}
              >
                <div
                  className="pin-body"
                  style={{ background: crew.color, color: '#0F1F0D' }}
                >
                  <span>{i + 1}</span>
                </div>
                <div className="pin-label">
                  {fmtTime(j.startHour as number)} ·{' '}
                  {c ? c.name.split(' ')[0] : '—'}
                </div>
              </div>
            );
          }),
        )}

        {/* Overlay legend */}
        <div className="map-overlay">
          <div>
            <div className="eyebrow-sm">Today</div>
            <div
              className="h4"
              style={{
                fontFamily: 'var(--font-subhead)',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {dayJobs.length} stops
            </div>
          </div>
          <div>
            <div className="eyebrow-sm">Crews on the road</div>
            <div
              className="h4"
              style={{
                fontFamily: 'var(--font-subhead)',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {crewRoutes.length}
            </div>
          </div>
          <div>
            <div className="eyebrow-sm">Total drive (est)</div>
            <div
              className="h4"
              style={{
                fontFamily: 'var(--font-subhead)',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {Math.floor(totalDriveMinutes / 60)}h{' '}
              {totalDriveMinutes % 60}m
            </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <button className="btn btn-icon btn-outline">
            <Icon name="plus" size={14} />
          </button>
          <button className="btn btn-icon btn-outline">
            <span style={{ fontWeight: 800, fontSize: 16 }}>−</span>
          </button>
        </div>
      </div>

      <div className="map-side">
        <div className="route-list-header">
          <div className="row">
            <div>
              <div className="rail-title">Today's routes</div>
              <div className="muted small">
                Optimized · saved 47 min vs unsorted
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => pushToast('Re-optimized routes')}
              >
                <Icon name="sparkle" size={12} /> Re-optimize
              </button>
            </div>
          </div>
          <div
            className="row"
            style={{ marginTop: 10, gap: 4, flexWrap: 'wrap' }}
          >
            <button
              className={
                'filter-chip ' + (selectedCrew === 'all' ? 'active' : '')
              }
              onClick={() => setSelectedCrew('all')}
            >
              All crews
            </button>
            {allCrewIds.map((cid) => {
              const c = getCrew(allCrews, cid);
              if (!c) return null;
              return (
                <button
                  key={cid}
                  className={
                    'filter-chip ' + (selectedCrew === cid ? 'active' : '')
                  }
                  onClick={() => setSelectedCrew(cid)}
                >
                  <span
                    className="dot"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: c.color,
                    }}
                  />
                  {c.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="route-list">
          {crewRoutes.map(({ crew, jobs: js }) => (
            <div key={crew.id} style={{ marginBottom: 14 }}>
              <div
                className="row"
                style={{
                  padding: '8px 10px 4px',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 20,
                    borderRadius: 2,
                    background: crew.color,
                  }}
                />
                <div style={{ fontWeight: 700, fontSize: 13 }}>{crew.name}</div>
                <span className="muted small" style={{ marginLeft: 'auto' }}>
                  {js.length} stop{js.length !== 1 ? 's' : ''}
                </span>
              </div>
              {js.map((j, i) => {
                const c = getCustomer(allCustomers, j.customer);
                return (
                  <Fragment key={j.id}>
                    <div className="route-stop" onClick={() => onJobClick(j)}>
                      <div
                        className="route-stop-num"
                        style={{ background: crew.color }}
                      >
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="route-stop-time">
                          {fmtTime(j.startHour as number)} –{' '}
                          {fmtTime((j.startHour as number) + j.durationHrs)}
                        </div>
                        <div className="route-stop-name">
                          {c ? c.name : j.address?.split('·')[0] || 'Untitled'}
                        </div>
                        <div className="route-stop-meta">{j.address}</div>
                        <div
                          style={{ marginTop: 4, display: 'flex', gap: 4 }}
                        >
                          <JobTypeTag type={j.type} />
                          <StatusBadge status={j.status} />
                        </div>
                      </div>
                    </div>
                    {i < js.length - 1 &&
                      (() => {
                        const est = estimateDriveTime(
                          j.address,
                          js[i + 1].address,
                        );
                        return (
                          <div className="route-connector">
                            <Icon name="truck" size={11} />
                            {est.minutes} min · {est.miles} mi
                          </div>
                        );
                      })()}
                  </Fragment>
                );
              })}
            </div>
          ))}
          {crewRoutes.length === 0 && (
            <div className="empty">
              <div className="empty-icon">
                <Icon name="map_pin" size={28} stroke="var(--mid-gray)" />
              </div>
              <div className="h4">No routes for this filter</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
