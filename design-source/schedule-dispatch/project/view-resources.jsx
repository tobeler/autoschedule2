/* eslint-disable */
/* Jobs list, Crews roster, Fleet/trucks views */

const { useState: useS1, useMemo: useM1 } = React;

// =============================================================
// JOBS — list table
// =============================================================
function JobsView({ jobs, onJobClick }) {
  const [filter, setFilter] = useS1('all');
  const [statusFilter, setStatusFilter] = useS1('all');
  const [query, setQuery] = useS1('');

  const filtered = jobs.filter(j => {
    if (filter !== 'all' && j.type !== filter) return false;
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (query) {
      const c = getCustomer(j.customer);
      const hay = (j.id + ' ' + (c?.name || '') + ' ' + (j.address || '')).toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader eyebrow="Operations" title="Jobs" subtitle={filtered.length + ' jobs · 14 active, 3 unscheduled, 89 complete this quarter'}>
        <div className="search" style={{ width: 240 }}>
          <Icon name="search" size={14} />
          <input placeholder="Search id, customer, address…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-outline btn-sm"><Icon name="refresh" size={14} /> Sync HubSpot</button>
        <button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> New job</button>
      </PageHeader>

      <div className="filter-row">
        <button className={"filter-chip " + (filter==='all'?'active':'')} onClick={()=>setFilter('all')}>All types</button>
        {Object.entries(JOB_TYPES).map(([k, jt]) => (
          <button key={k} className={"filter-chip " + (filter===k?'active':'')} onClick={()=>setFilter(k)}>
            <span className="dot" style={{ background:'var(--' + jt.color + ')' }}></span>
            {jt.label}
          </button>
        ))}
      </div>
      <div className="filter-row" style={{ paddingBottom: 12 }}>
        <span className="eyebrow-sm">Status</span>
        {['all','unscheduled','scheduled','enroute','onsite','complete','callback'].map(s => (
          <button key={s} className={"filter-chip " + (statusFilter===s?'active':'')} onClick={()=>setStatusFilter(s)}>
            {s === 'all' ? 'All' : statusLabel(s)}
          </button>
        ))}
      </div>

      <div className="view-pad" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Crew</th>
                <th>Truck</th>
                <th>Crew composition</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => {
                const c = getCustomer(j.customer);
                const crew = getCrew(j.crewId);
                const truck = getTruck(j.truckId);
                const unfilled = j.slots.filter(s => !s.assignedTo && !s.optional).length;
                return (
                  <tr key={j.id} className="clickable" onClick={() => onJobClick(j)}>
                    <td>
                      <div className="mono small muted">{j.id}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{j.hubspotDealId || ''}</div>
                    </td>
                    <td><JobTypeTag type={j.type} /></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c ? c.name : '—'}</div>
                      <div className="muted small">{j.address}</div>
                    </td>
                    <td>
                      {j.date ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{j.date}</div>
                          <div className="muted small mono">{j.startHour != null ? fmtTime(j.startHour) + '–' + fmtTime(j.startHour + j.durationHrs) : '—'}</div>
                        </>
                      ) : (
                        <span className="muted small">Unscheduled</span>
                      )}
                    </td>
                    <td>{crew ? crew.name : <span className="muted">—</span>}</td>
                    <td>{truck ? <span className="mono small">{truck.name}</span> : <span className="muted">—</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap:'wrap' }}>
                        {j.slots.slice(0, 4).map(s => (
                          <RoleChip key={s.id} role={s.role} level={s.level} assignedTo={s.assignedTo} optional={s.optional} compact />
                        ))}
                        {unfilled > 0 && <span className="unfilled-pill"><Icon name="user" size={10} /> {unfilled}</span>}
                      </div>
                    </td>
                    <td><StatusBadge status={j.status} /></td>
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

// =============================================================
// CREWS — roster with default crews + skill levels
// =============================================================
function CrewsView({ onJobClick }) {
  const [mode, setMode] = useS1('default'); // default | weekly
  const weekStart = useM1(() => addDays(TODAY, -TODAY.getDay() + 1), []); // Mon
  const weekDays = useM1(() => Array.from({ length: 5 }).map((_, i) => addDays(weekStart, i)), [weekStart]);

  // For each crew & day, derive actual on-job composition from JOBS.slots.assignedTo
  const weeklyComposition = useM1(() => {
    const map = {};
    CREWS.forEach(c => { map[c.id] = {}; });
    weekDays.forEach(d => {
      const dk = dateKey(d);
      JOBS.filter(j => j.date === dk).forEach(j => {
        if (!j.crewId) return;
        if (!map[j.crewId]) map[j.crewId] = {};
        if (!map[j.crewId][dk]) map[j.crewId][dk] = new Set();
        j.slots.forEach(s => {
          if (s.assignedTo) map[j.crewId][dk].add(s.assignedTo);
        });
      });
    });
    return map;
  }, [weekDays]);

  // Per-person: where did they actually work each day? (which crew lead)
  const personWeeklyTrail = useM1(() => {
    const trail = {};
    PEOPLE.forEach(p => { trail[p.id] = {}; });
    weekDays.forEach(d => {
      const dk = dateKey(d);
      JOBS.filter(j => j.date === dk).forEach(j => {
        const lead = j.slots.find(s => ['hvac_lead','electrician','plumber','fsm'].includes(s.role))?.assignedTo;
        j.slots.forEach(s => {
          if (!s.assignedTo) return;
          if (!trail[s.assignedTo][dk]) trail[s.assignedTo][dk] = { crewId: j.crewId, leadId: lead };
        });
      });
    });
    return trail;
  }, [weekDays]);

  return (
    <>
      <PageHeader eyebrow="Resources" title="Crews & technicians" subtitle={CREWS.length + ' default crews · ' + PEOPLE.length + ' technicians on staff'}>
        <div className="seg">
          <button className={mode === 'default' ? 'active' : ''} onClick={() => setMode('default')}>Default crews</button>
          <button className={mode === 'weekly' ? 'active' : ''} onClick={() => setMode('weekly')}>This week</button>
        </div>
        <button className="btn btn-outline btn-sm"><Icon name="layers" size={14} /> Skills matrix</button>
        <button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Add crew</button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Crews</div>
            <div className="kpi-value">{CREWS.length}</div>
            <div className="kpi-meta">5 install · 3 electrical · 1 plumbing · 1 sales</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Technicians</div>
            <div className="kpi-value">{PEOPLE.length}</div>
            <div className="kpi-meta">18 in field · 2 office</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Out today</div>
            <div className="kpi-value">{TIME_OFF.filter(t => t.date === dateKey(TODAY)).length}</div>
            <div className="kpi-meta">{TIME_OFF.filter(t => t.date === dateKey(TODAY)).map(t => getPerson(t.personId)?.name.split(' ')[0]).join(', ') || '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">{mode === 'weekly' ? 'Cross-crew shifts (week)' : 'Avg utilization (7-day)'}</div>
            {mode === 'weekly' ? (
              <>
                <div className="kpi-value">
                  {Object.values(personWeeklyTrail).filter(trail => {
                    const days = Object.values(trail);
                    if (days.length < 2) return false;
                    const crews = new Set(days.map(d => d.crewId));
                    return crews.size > 1;
                  }).length}
                </div>
                <div className="kpi-meta">techs with multiple leads this week</div>
              </>
            ) : (
              <>
                <div className="kpi-value">84%</div>
                <div className="kpi-meta up">+6 pts vs last week</div>
              </>
            )}
          </div>
        </div>

        {mode === 'default' && (
          <CrewsDefaultView />
        )}

        {mode === 'weekly' && (
          <CrewsWeeklyView
            weekStart={weekStart}
            weekDays={weekDays}
            weeklyComposition={weeklyComposition}
            personWeeklyTrail={personWeeklyTrail}
          />
        )}

        {/* SKILLS MATRIX — always visible */}
        <h3 style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16, marginTop: 32, marginBottom: 12 }}>Skills & certifications</h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Technician</th>
                <th>Primary role</th>
                <th>Level</th>
                <th>Default crew</th>
                <th>Certifications</th>
                <th style={{ textAlign:'right' }}>Hrs (this wk)</th>
              </tr>
            </thead>
            <tbody>
              {PEOPLE.map(p => {
                const crew = getCrew(p.defaultCrew);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar person={p} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="muted small mono">{p.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td>{ROLES[p.roles[0]].label}</td>
                    <td><span className="tag" style={{ background: p.level === 'L3' ? 'var(--lime)' : p.level === 'L2' ? 'var(--jt-water-bg)' : 'var(--bg-muted)' }}>{p.level}</span></td>
                    <td>{crew ? crew.name : '—'}</td>
                    <td>{p.certs ? p.certs.map(c => <span key={c} className="tag" style={{ marginRight: 4 }}>{c}</span>) : <span className="muted small">—</span>}</td>
                    <td style={{ textAlign:'right' }} className="mono">{32 + Math.floor(Math.random()*8)}h</td>
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

// ─────────────────────────────────────────────────────────────
// DEFAULT crews grid (legacy — extracted)
// ─────────────────────────────────────────────────────────────
function CrewsDefaultView() {
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h3 style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16 }}>Default crews</h3>
        <span className="muted small" style={{ marginLeft: 8 }}>Permanent crew composition. Switch to "This week" to see actual day-by-day pairings.</span>
      </div>

      <div className="roster-grid">
        {CREWS.map(crew => {
          const truck = getTruck(crew.truck);
          return (
            <div key={crew.id} className="roster-card">
              <div className="roster-card-header">
                <div className="roster-color-bar" style={{ background: crew.color }}></div>
                <div style={{ flex: 1 }}>
                  <div className="h4" style={{ fontSize: 16 }}>{crew.name}</div>
                  <div className="muted small" style={{ textTransform:'capitalize' }}>{crew.type} crew</div>
                </div>
                <IconButton icon="more" label="Edit" />
              </div>

              {truck && (
                <div className="pill" style={{ alignSelf:'flex-start' }}>
                  <Icon name="truck" size={12} /> {truck.name}
                  <span className="mono muted small" style={{ marginLeft: 4 }}>{truck.plate}</span>
                </div>
              )}

              <div className="divider" style={{ margin: '6px 0' }}></div>

              <div className="roster-members">
                {crew.members.map(mid => {
                  const m = getPerson(mid);
                  const isLead = mid === crew.lead;
                  return (
                    <div key={mid} className="member-row">
                      <Avatar person={m} />
                      <div style={{ flex: 1 }}>
                        <div className="member-row-name">
                          {m.name}
                          {isLead && <span className="tag" style={{ marginLeft: 8, background:'var(--jetson-green)', color:'var(--forest)' }}>LEAD</span>}
                        </div>
                        <div className="member-row-meta">
                          {ROLES[m.roles[0]].label} · {m.level}
                          {m.certs && <span> · {m.certs.join(', ')}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="divider" style={{ margin: '6px 0' }}></div>
              <div className="row" style={{ justifyContent:'space-between' }}>
                <span className="muted small">{crew.members.length} people</span>
                <button className="btn btn-ghost btn-sm"><Icon name="plus" size={12} /> Add person</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// WEEKLY composition view — actual day-by-day pairings
// ─────────────────────────────────────────────────────────────
function CrewsWeeklyView({ weekStart, weekDays, weeklyComposition, personWeeklyTrail }) {
  // Find techs who worked across multiple crews this week
  const wanderers = PEOPLE.filter(p => {
    const trail = personWeeklyTrail[p.id] || {};
    const crews = new Set(Object.values(trail).map(t => t.crewId).filter(Boolean));
    return crews.size > 1;
  });

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h3 style={{ fontFamily:'var(--font-subhead)', fontWeight: 700, fontSize: 16 }}>
          This week · {fmtDate(weekStart, { month: 'short', day: 'numeric' })} – {fmtDate(addDays(weekStart, 4), { month: 'short', day: 'numeric' })}
        </h3>
        <span className="muted small" style={{ marginLeft: 8 }}>Actual composition pulled from jobs. An installer may pair with different leads on different days — that's flagged below.</span>
      </div>

      {wanderers.length > 0 && (
        <div className="crew-wanderers">
          <div className="crew-wanderers-head">
            <Icon name="refresh" size={14} stroke="#8A5500" />
            <span>{wanderers.length} tech{wanderers.length === 1 ? '' : 's'} paired with multiple leads this week</span>
          </div>
          <div className="crew-wanderers-list">
            {wanderers.map(p => {
              const trail = personWeeklyTrail[p.id];
              const leadIds = [...new Set(Object.values(trail).map(t => t.leadId).filter(l => l && l !== p.id))];
              return (
                <div key={p.id} className="crew-wanderer-row">
                  <Avatar person={p} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      Home crew: {getCrew(p.defaultCrew)?.name || '—'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {leadIds.map(lid => {
                      const lead = getPerson(lid);
                      return (
                        <span key={lid} className="lead-pair-chip" title={'Paired with ' + lead.name}>
                          <Avatar person={lead} size="xs" />
                          <span>{lead?.name.split(' ').slice(-1)[0]}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="crew-week-grid">
        <div className="crew-week-grid-head">
          <div className="crew-week-grid-corner">Crew</div>
          {weekDays.map(d => {
            const isToday = dateKey(d) === dateKey(TODAY);
            return (
              <div key={dateKey(d)} className={"crew-week-grid-day" + (isToday ? ' today' : '')}>
                <div className="weekday">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="date">{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {CREWS.filter(c => c.type !== 'sales').map(crew => {
          return (
            <div key={crew.id} className="crew-week-grid-row">
              <div className="crew-week-grid-label">
                <div className="stripe" style={{ background: crew.color }}></div>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{crew.name}</div>
                  <div className="muted small" style={{ fontSize: 10 }}>{getPerson(crew.lead)?.name}</div>
                </div>
              </div>
              {weekDays.map(d => {
                const dk = dateKey(d);
                const memberIds = Array.from(weeklyComposition[crew.id]?.[dk] || []);
                if (memberIds.length === 0) {
                  return (
                    <div key={dk + crew.id} className="crew-week-grid-cell empty">
                      <span className="muted small" style={{ fontSize: 10 }}>—</span>
                    </div>
                  );
                }
                return (
                  <div key={dk + crew.id} className="crew-week-grid-cell">
                    {memberIds.map(mid => {
                      const m = getPerson(mid);
                      if (!m) return null;
                      const isHome = m.defaultCrew === crew.id;
                      return (
                        <div key={mid} className={"crew-week-member" + (isHome ? '' : ' on-loan')} title={m.name + (isHome ? '' : ' · on loan from ' + getCrew(m.defaultCrew)?.name)}>
                          <Avatar person={m} size="xs" />
                          <span className="name">{m.name.split(' ')[0]}</span>
                          {!isHome && <Icon name="refresh" size={9} stroke="#8A5500" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 14, gap: 18, fontSize: 11, color: 'var(--fg-muted)' }}>
        <span style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>Legend</span>
        <span className="row" style={{ gap: 4 }}>
          <span className="lead-pair-chip" style={{ background: 'var(--bg-subtle)' }}>Home crew</span>
        </span>
        <span className="row" style={{ gap: 4 }}>
          <span className="lead-pair-chip on-loan" style={{ background: 'rgba(255,182,39,0.15)', color: '#8A5500' }}>
            <Icon name="refresh" size={9} stroke="#8A5500" />
            On loan
          </span>
        </span>
      </div>
    </>
  );
}

// =============================================================
// FLEET — trucks/vans
// =============================================================
function FleetView({ onJobClick }) {
  const utilization = (t) => Math.round(50 + Math.random() * 50);
  return (
    <>
      <PageHeader eyebrow="Resources" title="Trucks & vans" subtitle={TRUCKS.length + ' vehicles · ' + TRUCKS.filter(t=>!t.status).length + ' active, ' + TRUCKS.filter(t=>t.status === 'shop').length + ' in shop, ' + TRUCKS.filter(t=>t.status === 'available').length + ' available'}>
        <button className="btn btn-outline btn-sm"><Icon name="grid" size={14} /> Map view</button>
        <button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Add vehicle</button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Active vehicles</div>
            <div className="kpi-value">{TRUCKS.filter(t=>!t.status).length}</div>
            <div className="kpi-meta">5 install trucks · 3 electrical vans · 1 plumbing van</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Fleet utilization</div>
            <div className="kpi-value">79%</div>
            <div className="kpi-meta up">7-day avg</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">In shop</div>
            <div className="kpi-value">1</div>
            <div className="kpi-meta">Truck 18 · brake service · back Thu</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Available pool</div>
            <div className="kpi-value">1</div>
            <div className="kpi-meta">Van 10 — assignable on demand</div>
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
              {TRUCKS.map(t => {
                const crew = getCrew(t.assignedCrew);
                const todayJobs = JOBS.filter(j => j.truckId === t.id && j.date === dateKey(TODAY));
                const u = utilization(t);
                return (
                  <tr key={t.id} className="clickable">
                    <td>
                      <div className="row">
                        <div className="row-icon-bg"><Icon name={t.kind === 'install' ? 'truck' : t.kind === 'electrical' ? 'bolt' : 'droplet'} size={16} /></div>
                        <div>
                          <div style={{ fontWeight: 700 }}>{t.name}</div>
                          <div className="muted small">{t.capacity}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="tag" style={{ textTransform:'capitalize' }}>{t.kind}</span></td>
                    <td className="mono small">{t.plate}</td>
                    <td>{crew ? crew.name : <span className="muted">— Unassigned —</span>}</td>
                    <td>
                      {todayJobs.length === 0 && <span className="muted small">No jobs</span>}
                      {todayJobs.map(j => (
                        <div key={j.id} className="row" style={{ gap: 4, marginBottom: 2 }}>
                          <JobTypeTag type={j.type} />
                          <span className="mono small muted">{fmtTime(j.startHour)}</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ width: 100, height: 6, background:'var(--bg-muted)', borderRadius: 999, overflow:'hidden' }}>
                          <div style={{ width: u + '%', height:'100%', background: u > 90 ? 'var(--jt-callback)' : 'var(--jetson-green)' }}></div>
                        </div>
                        <span className="mono small">{u}%</span>
                      </div>
                    </td>
                    <td>
                      {t.status === 'shop' && <span className="badge badge-callback">In shop</span>}
                      {t.status === 'available' && <span className="badge badge-scheduled">Available</span>}
                      {!t.status && <span className="badge badge-onsite">Active</span>}
                    </td>
                    <td><IconButton icon="more" label="Actions" /></td>
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

Object.assign(window, { JobsView, CrewsView, FleetView });
