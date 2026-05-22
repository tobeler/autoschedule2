/* eslint-disable */
/* Map view (Dispatch alternate) + Reports view */

const { useState: useSMV, useMemo: useMMV } = React;

// =============================================================
// MAP VIEW (dispatch alternate)
// =============================================================
function MapView({ date, jobs, onJobClick }) {
  const dayJobs = jobs.filter(j => j.date === date && j.startHour != null)
    .sort((a, b) => a.startHour - b.startHour);

  const [selectedCrew, setSelectedCrew] = useSMV('all');

  // Group jobs by crew and assign pin coords (deterministic from job id)
  const crewRoutes = useMMV(() => {
    const map = {};
    dayJobs.forEach(j => {
      if (!j.crewId) return;
      if (!map[j.crewId]) map[j.crewId] = [];
      map[j.crewId].push(j);
    });
    return Object.entries(map).map(([crewId, js]) => ({
      crew: getCrew(crewId),
      jobs: js,
    })).filter(r => r.crew && (selectedCrew === 'all' || r.crew.id === selectedCrew));
  }, [dayJobs, selectedCrew]);

  // Pin coords — deterministic from job.id using a 0–100 box, biased to look like Boston-area sprawl
  function coords(jobId) {
    const seed = jobId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const x = 10 + ((seed * 7) % 80);
    const y = 12 + ((seed * 13) % 76);
    return { x, y };
  }

  return (
    <div className="map-view">
      <div className="map-canvas">
        {/* Route lines */}
        <svg className="map-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {crewRoutes.map(({ crew, jobs }) => {
            if (jobs.length < 2) return null;
            const path = jobs.map((j, i) => {
              const c = coords(j.id);
              return (i === 0 ? 'M' : 'L') + c.x + ' ' + c.y;
            }).join(' ');
            return <React.Fragment key={crew.id}>
              <path className="route-shadow" d={path} />
              <path d={path} stroke={crew.color} strokeDasharray="0" />
            </React.Fragment>;
          })}
        </svg>

        {/* Pins */}
        {crewRoutes.flatMap(({ crew, jobs }) => jobs.map((j, i) => {
          const { x, y } = coords(j.id);
          const c = getCustomer(j.customer);
          return (
            <div key={j.id} className="map-pin-large" style={{ left: x + '%', top: y + '%' }} onClick={() => onJobClick(j)}>
              <div className="pin-body" style={{ background: crew.color, color: '#0F1F0D' }}>
                <span>{i + 1}</span>
              </div>
              <div className="pin-label">{fmtTime(j.startHour)} · {c ? c.name.split(' ')[0] : '—'}</div>
            </div>
          );
        }))}

        {/* Map overlay legend */}
        <div className="map-overlay">
          <div>
            <div className="eyebrow-sm">Today</div>
            <div className="h4" style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16 }}>{dayJobs.length} stops</div>
          </div>
          <div>
            <div className="eyebrow-sm">Crews on the road</div>
            <div className="h4" style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16 }}>{crewRoutes.length}</div>
          </div>
          <div>
            <div className="eyebrow-sm">Total drive (est)</div>
            <div className="h4" style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16 }}>2h 14m</div>
          </div>
        </div>

        {/* Compass / scale */}
        <div style={{ position:'absolute', right: 14, bottom: 14, display:'flex', flexDirection:'column', gap: 6 }}>
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
              <div className="muted small">Optimized · saved 47 min vs unsorted</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-primary btn-sm">
                <Icon name="sparkle" size={12} /> Re-optimize
              </button>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 4, flexWrap:'wrap' }}>
            <button className={"filter-chip " + (selectedCrew === 'all' ? 'active' : '')} onClick={() => setSelectedCrew('all')}>All crews</button>
            {Array.from(new Set(dayJobs.map(j => j.crewId).filter(Boolean))).map(cid => {
              const c = getCrew(cid);
              return (
                <button key={cid} className={"filter-chip " + (selectedCrew === cid ? 'active' : '')} onClick={() => setSelectedCrew(cid)}>
                  <span className="dot" style={{ width: 8, height: 8, borderRadius: 999, background: c.color }}></span>
                  {c.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="route-list">
          {crewRoutes.map(({ crew, jobs }) => (
            <div key={crew.id} style={{ marginBottom: 14 }}>
              <div className="row" style={{ padding: '8px 10px 4px', alignItems:'center', gap: 8 }}>
                <div style={{ width: 4, height: 20, borderRadius: 2, background: crew.color }}></div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{crew.name}</div>
                <span className="muted small" style={{ marginLeft: 'auto' }}>{jobs.length} stop{jobs.length !== 1 ? 's' : ''}</span>
              </div>
              {jobs.map((j, i) => {
                const c = getCustomer(j.customer);
                const jt = getJobType(j.type);
                return (
                  <React.Fragment key={j.id}>
                    <div className="route-stop" onClick={() => onJobClick(j)}>
                      <div className="route-stop-num" style={{ background: crew.color }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="route-stop-time">{fmtTime(j.startHour)} – {fmtTime(j.startHour + j.durationHrs)}</div>
                        <div className="route-stop-name">{c ? c.name : j.address?.split('·')[0]}</div>
                        <div className="route-stop-meta">{j.address}</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                          <JobTypeTag type={j.type} />
                          <StatusBadge status={j.status} />
                        </div>
                      </div>
                    </div>
                    {i < jobs.length - 1 && (() => {
                      const seed = (j.id + jobs[i+1].id).split('').reduce((s,c) => s + c.charCodeAt(0), 0);
                      const drive = 12 + (seed % 24);
                      const miles = (3 + (seed % 9)).toFixed(1);
                      return (
                        <div className="route-connector">
                          <Icon name="truck" size={11} />
                          {drive} min · {miles} mi
                        </div>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </div>
          ))}
          {crewRoutes.length === 0 && (
            <div className="empty">
              <div className="empty-icon"><Icon name="map_pin" size={28} stroke="var(--mid-gray)" /></div>
              <div className="h4">No routes for this filter</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// REPORTS VIEW
// =============================================================
function ReportsView() {
  return (
    <>
      <PageHeader eyebrow="Insights" title="Reports" subtitle="How the team is performing — crew utilization, first-time-fix, drive-time savings, revenue per truck.">
        <div className="seg">
          {['Week','Month','Quarter','YTD'].map(p => (
            <button key={p} className={p === 'Week' ? 'active' : ''}>{p}</button>
          ))}
        </div>
        <button className="btn btn-outline btn-sm"><Icon name="refresh" size={14} /> Export CSV</button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          {[
            { label: 'Jobs completed', value: '187', meta: '+11% vs last week', good: true },
            { label: 'First-time-fix', value: '94%', meta: '+2 pts', good: true },
            { label: 'Avg utilization', value: '84%', meta: '+6 pts', good: true },
            { label: 'Drive-time saved', value: '4h 12m', meta: 'via auto-routing', good: true },
            { label: 'Callbacks', value: '3', meta: '0.3 per 100 jobs', good: true },
            { label: 'Avg on-site time', value: '6h 40m', meta: '-0:15 vs target', good: false },
          ].map((k, i) => (
            <div key={i} className="kpi">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <div className={"kpi-meta " + (k.good ? 'up' : 'down')}>{k.meta}</div>
            </div>
          ))}
        </div>

        <div className="report-grid">
          <div className="report-card">
            <h4>Crew utilization · this week</h4>
            <div className="report-meta">
              <Icon name="info" size={11} /> Hours assigned ÷ available hours
            </div>
            {CREWS.filter(c => c.type !== 'sales').map(c => {
              const utz = Math.round(60 + ((c.id.charCodeAt(1) * 11) % 40));
              return (
                <div key={c.id} className="bar-h">
                  <div className="bar-h-label">{c.name.replace(' Crew','').replace(' Electric','').replace(' Plumbing','')}</div>
                  <div className="bar-h-track">
                    <div className="bar-h-fill" style={{ width: utz + '%', background: utz > 95 ? 'var(--jt-callback)' : utz > 85 ? 'var(--jt-electrical)' : 'var(--jetson-green)' }}></div>
                  </div>
                  <div className="bar-h-value">{utz}%</div>
                </div>
              );
            })}
          </div>

          <div className="report-card">
            <h4>Jobs by type · this week</h4>
            <div className="report-meta">38 jobs scheduled across the week</div>
            {[
              { type:'heatpump',    pct: 62, val:'24 jobs' },
              { type:'water',       pct: 14, val:'5 jobs' },
              { type:'electrical',  pct: 10, val:'4 jobs' },
              { type:'retrofit',    pct: 6,  val:'2 jobs' },
              { type:'service',     pct: 5,  val:'2 jobs' },
              { type:'warranty',    pct: 3,  val:'1 job' },
            ].map((row, i) => {
              const jt = JOB_TYPES[row.type];
              return (
                <div key={i} className="bar-h">
                  <div className="bar-h-label"><span className="dot" style={{ display:'inline-block', width: 8, height: 8, borderRadius: 999, background:'var(--'+jt.color+')', marginRight: 6 }}></span>{jt.short}</div>
                  <div className="bar-h-track">
                    <div className="bar-h-fill" style={{ width: (row.pct * 1.5) + '%', background: 'var(--'+jt.color+')' }}></div>
                  </div>
                  <div className="bar-h-value">{row.val}</div>
                </div>
              );
            })}
          </div>

          <div className="report-card wide">
            <h4>Jobs per day · last 14 days</h4>
            <div className="report-meta">Heat pump installs are the day-driver. Service calls fill afternoons.</div>
            <svg className="chart-wrap" viewBox="0 0 700 180" preserveAspectRatio="none">
              {Array.from({ length: 14 }).map((_, i) => {
                const seed = (i * 37 + 11) % 24;
                const heatpumps = 1 + (seed % 5);
                const service = 1 + ((seed * 3) % 4);
                const retrofit = (seed % 3);
                const colW = 700 / 14;
                const x = i * colW + 6;
                const bw = colW - 12;
                const hpH = heatpumps * 18;
                const sH = service * 14;
                const rH = retrofit * 14;
                let y = 160;
                return (
                  <g key={i}>
                    <rect x={x} y={y - hpH} width={bw} height={hpH} fill="var(--jt-heatpump)" rx="2" />
                    <rect x={x} y={y - hpH - sH} width={bw} height={sH} fill="var(--jt-service)" rx="2" />
                    <rect x={x} y={y - hpH - sH - rH} width={bw} height={rH} fill="var(--jt-retrofit)" rx="2" />
                    <text x={x + bw/2} y={175} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">{i - 6 === 0 ? 'today' : i - 6 > 0 ? '+'+(i-6) : (i-6)}</text>
                  </g>
                );
              })}
              <line x1="0" y1="160" x2="700" y2="160" stroke="var(--border)" />
            </svg>
            <div className="row" style={{ gap: 12, marginTop: 8, justifyContent:'center' }}>
              <span style={{ fontSize: 11, display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ display:'inline-block', width: 12, height: 12, background:'var(--jt-heatpump)', borderRadius: 3 }}></span> Heat pump</span>
              <span style={{ fontSize: 11, display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ display:'inline-block', width: 12, height: 12, background:'var(--jt-service)', borderRadius: 3 }}></span> Service</span>
              <span style={{ fontSize: 11, display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ display:'inline-block', width: 12, height: 12, background:'var(--jt-retrofit)', borderRadius: 3 }}></span> Retrofit</span>
            </div>
          </div>

          <div className="report-card">
            <h4>First-time-fix by crew</h4>
            <div className="report-meta">Service + warranty + callback jobs, last 90 days</div>
            {CREWS.filter(c => c.type === 'install' || c.type === 'electrical').slice(0, 6).map(c => {
              const ftf = 85 + ((c.id.charCodeAt(1) * 7) % 14);
              return (
                <div key={c.id} className="bar-h">
                  <div className="bar-h-label">{c.name.replace(' Crew','').replace(' Electric','')}</div>
                  <div className="bar-h-track">
                    <div className="bar-h-fill" style={{ width: ftf + '%', background: ftf > 95 ? 'var(--jetson-green)' : ftf > 90 ? 'var(--jt-electrical)' : 'var(--jt-callback)' }}></div>
                  </div>
                  <div className="bar-h-value">{ftf}%</div>
                </div>
              );
            })}
          </div>

          <div className="report-card">
            <h4>Drive-time savings (auto-route on/off)</h4>
            <div className="report-meta">Avg minutes per crew per day</div>
            <svg className="chart-wrap" viewBox="0 0 400 180" preserveAspectRatio="none">
              {Array.from({ length: 7 }).map((_, i) => {
                const without = 110 + (i * 7) % 30;
                const withRoute = 70 + (i * 5) % 20;
                const x = i * 55 + 24;
                return (
                  <g key={i}>
                    <rect x={x} y={170 - without} width={20} height={without} fill="var(--mid-gray)" rx="3" />
                    <rect x={x + 24} y={170 - withRoute} width={20} height={withRoute} fill="var(--jetson-green)" rx="3" />
                    <text x={x + 22} y={178} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">{['M','T','W','T','F','S','S'][i]}</text>
                  </g>
                );
              })}
            </svg>
            <div className="row" style={{ gap: 12, marginTop: 4, justifyContent:'center' }}>
              <span style={{ fontSize: 11, display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ display:'inline-block', width: 12, height: 12, background:'var(--mid-gray)', borderRadius: 3 }}></span> Unoptimized</span>
              <span style={{ fontSize: 11, display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ display:'inline-block', width: 12, height: 12, background:'var(--jetson-green)', borderRadius: 3 }}></span> Auto-routed</span>
            </div>
          </div>

          <div className="report-card wide">
            <h4>Truck performance</h4>
            <div className="report-meta">Jobs completed, hours utilized, miles driven · last 30 days</div>
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr><th>Truck</th><th>Assigned crew</th><th style={{ textAlign:'right' }}>Jobs</th><th style={{ textAlign:'right' }}>Hours</th><th style={{ textAlign:'right' }}>Miles</th></tr>
              </thead>
              <tbody>
                {TRUCKS.filter(t => !t.status).slice(0, 8).map(t => {
                  const seed = t.id.charCodeAt(1);
                  return (
                    <tr key={t.id}>
                      <td><span style={{ fontWeight: 600 }}>{t.name}</span> <span className="mono small muted">{t.plate}</span></td>
                      <td>{getCrew(t.assignedCrew)?.name || '—'}</td>
                      <td style={{ textAlign:'right' }} className="mono">{18 + (seed % 9)}</td>
                      <td style={{ textAlign:'right' }} className="mono">{140 + (seed * 3 % 40)}h</td>
                      <td style={{ textAlign:'right' }} className="mono">{600 + (seed * 17 % 300)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { MapView, ReportsView });
