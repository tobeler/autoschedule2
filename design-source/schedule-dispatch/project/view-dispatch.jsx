/* eslint-disable */
/* Jetson — Dispatch view (Day/Week/Month × Calendar/Kanban/Gantt × Group by Crew/Truck/Tech) */

const { useState, useMemo, useEffect, useRef } = React;

// =============================================================
// UNSCHEDULED RAIL — drag source
// =============================================================
function UnscheduledRail({ jobs, onJobClick, onDragStart, onCollapse }) {
  return (
    <div className="unscheduled-rail">
      <div className="rail-header">
        <div>
          <div className="rail-title">Unscheduled</div>
          <div className="muted" style={{ fontSize: 11 }}>{jobs.length} jobs · drag to schedule</div>
        </div>
        <IconButton icon="chevron_left" label="Collapse" onClick={onCollapse} />
      </div>
      <div className="rail-list">
        {jobs.length === 0 && <div className="muted small" style={{ padding: 16, textAlign: 'center' }}>No unscheduled jobs.</div>}
        {jobs.map((job) => {
          const c = getCustomer(job.customer);
          const jt = getJobType(job.type);
          return (
            <div key={job.id} className="unsched-card"
            draggable
            onDragStart={(e) => {e.dataTransfer.setData('text/job-id', job.id);onDragStart && onDragStart(job.id);}}
            onClick={() => onJobClick(job)}>
              <div className="unsched-card-header">
                <JobTypeTag type={job.type} />
                <span className="unsched-card-id mono">{job.id}</span>
                <Icon name="drag" size={14} stroke="var(--mid-gray)" style={{ marginLeft: 'auto' }} />
              </div>
              <div className="unsched-card-name">{c ? c.name : job.address}</div>
              <div className="unsched-card-meta" style={{ marginTop: 4 }}>
                <Icon name="map_pin" size={11} />
                <span>{job.address ? job.address.split('·')[1]?.trim() || job.address : '—'}</span>
              </div>
              {job.notes && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{job.notes}</div>}
              {job.price &&
              <div className="row" style={{ marginTop: 8 }}>
                  <span className="pill" style={{ fontSize: 11 }}>${job.price.toLocaleString()}</span>
                  {job.hubspotDealId && <span className="pill" style={{ fontSize: 10, background: 'rgba(255,122,89,0.12)', color: '#9F3D24' }}>
                    <Icon name="hubspot" size={10} /> Deal
                  </span>}
                </div>
              }
            </div>);

        })}
      </div>
    </div>);

}

// =============================================================
// DAY CALENDAR — grouped by crew/truck/tech
// =============================================================
function DayCalendar({ date, groupBy, density, jobs, onJobClick, onJobDrop, onJobResize, selectedJobId }) {
  const colW = density === 'compact' ? 80 : 110; // px per hour
  const hourStart = 6;
  const hourEnd = 20;
  const cols = hourEnd - hourStart;

  // Build rows based on groupBy
  let rows = [];
  if (groupBy === 'crew') {
    rows = CREWS.map((c) => {
      const truck = getTruck(c.truck);
      const lead = getPerson(c.lead);
      const rowJobs = jobs.filter((j) => j.crewId === c.id);
      // Participation: jobs run by another crew where one of our members is staffed
      const loans = jobs.flatMap((j) => {
        if (j.crewId === c.id) return [];
        const out = [];
        j.slots.forEach((s) => {
          if (!s.assignedTo) return;
          const person = getPerson(s.assignedTo);
          if (!person || person.defaultCrew !== c.id) return;
          out.push({ job: j, slot: s, person });
        });
        return out;
      });
      return { id: 'crew-' + c.id, color: c.color, lead, truck, jobs: rowJobs, loans,
        name: c.name,
        meta: <>{truck && <><Icon name="truck" size={11} /> {truck.name}</>} {!truck && c.type === 'sales' && <><Icon name="user" size={11} /> Sales</>}</>,
        avatars: c.members.slice(0, 4).map((m) => <Avatar key={m} person={m} size="xs" />)
      };
    });
  } else if (groupBy === 'truck') {
    rows = TRUCKS.filter((t) => t.assignedCrew).map((t) => {
      const crew = getCrew(t.assignedCrew);
      const lead = crew ? getPerson(crew.lead) : null;
      const rowJobs = jobs.filter((j) => j.truckId === t.id);
      return { id: 'truck-' + t.id, color: crew ? crew.color : 'var(--mid-gray)', truck: t, jobs: rowJobs,
        name: t.name,
        meta: <><span className="mono">{t.plate}</span> · {crew ? crew.name : 'Unassigned'}</>,
        avatars: crew ? crew.members.slice(0, 4).map((m) => <Avatar key={m} person={m} size="xs" />) : []
      };
    });
  } else if (groupBy === 'tech') {
    // One row per person who has at least one job today — surface their effective lead for the day,
    // so dispatchers can see when an installer is paired with a non-default lead.
    rows = PEOPLE.
    filter((p) => jobs.some((j) => j.slots.some((s) => s.assignedTo === p.id))).
    sort((a, b) => a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0])).
    map((p) => {
      const rowJobs = jobs.filter((j) => j.slots.some((s) => s.assignedTo === p.id));
      const isLeadRole = ['hvac_lead', 'electrician', 'plumber', 'fsm'].includes(p.roles[0]);
      // Find unique leads on the day's jobs (excluding p themselves)
      const leadIds = [...new Set(
        rowJobs.flatMap((j) => {
          const leadSlot = j.slots.find((s) => ['hvac_lead', 'electrician', 'plumber', 'fsm'].includes(s.role));
          return leadSlot && leadSlot.assignedTo && leadSlot.assignedTo !== p.id ? [leadSlot.assignedTo] : [];
        })
      )];
      const leadNames = leadIds.map((id) => getPerson(id)?.name.split(' ').slice(-1)[0]).filter(Boolean);
      const meta = isLeadRole ?
      <>{ROLES[p.roles[0]].label} · {p.level}{p.certs && p.certs.length ? <span> · {p.certs[0]}</span> : null}</> :
      <>{ROLES[p.roles[0]].label} · {p.level}{leadNames.length > 0 && <span style={{ color: 'var(--fg-muted)' }}> · with {leadNames.join(', ')}</span>}</>;
      return { id: 'tech-' + p.id, color: getCrew(p.defaultCrew)?.color || 'var(--mid-gray)', jobs: rowJobs,
        name: p.name,
        meta,
        avatars: [<Avatar key={p.id} person={p} size="sm" />],
        avatarOnly: true
      };
    });
  }

  // Now indicator at 10:30a for the demo
  const nowHour = 10.5;
  const nowLeft = (nowHour - hourStart) * colW;

  return (
    <div className="calendar-wrap">
      <div className="daygrid" style={{ "--col-w": colW + 'px' }}>
        {/* Time header */}
        <div className="daygrid-time-header" style={{ gridColumn: '1 / -1' }}>
          <div className="daygrid-row-header" style={{ minHeight: 36, padding: 0 }}>
            <div style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              <Icon name="users" size={12} /> {groupBy === 'crew' ? 'Crew' : groupBy === 'truck' ? 'Truck' : 'Technician'}
            </div>
          </div>
          <div className="daygrid-time-ticks">
            {Array.from({ length: cols }).map((_, i) => {
              const h = hourStart + i;
              const isNow = Math.floor(nowHour) === h;
              return (
                <div key={i} className={"daygrid-time-tick" + (isNow ? ' now' : '')}>
                  {fmtTime(h)}
                </div>);

            })}
          </div>
        </div>

        {/* Row body */}
        {rows.map((row, ri) =>
        <React.Fragment key={row.id}>
            <div className="daygrid-row-header" style={{ minHeight: density === 'compact' ? 56 : 72 }}>
              <div className="daygrid-row-color" style={{ background: row.color }}></div>
              <div className="daygrid-row-label">
                <div className="daygrid-row-name">{row.name}</div>
                <div className="daygrid-row-meta">{row.meta}</div>
              </div>
              <div className="daygrid-row-avatars">{row.avatars}</div>
            </div>
            <div
            className={"daygrid-row" + (ri % 2 ? ' alt' : '')}
            style={{
              minHeight: density === 'compact' ? 56 : 72,
              width: cols * colW + 'px'
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              e.currentTarget.classList.add('drop-target');
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const hour = Math.max(hourStart, Math.min(hourEnd - 0.5, hourStart + Math.round(x / colW * 4) / 4));
              let preview = e.currentTarget.querySelector('.drop-preview');
              if (!preview) {
                preview = document.createElement('div');
                preview.className = 'drop-preview';
                e.currentTarget.appendChild(preview);
              }
              preview.style.left = (hour - hourStart) * colW + 'px';
              preview.setAttribute('data-time', fmtTime(hour));
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget)) return;
              e.currentTarget.classList.remove('drop-target');
              const preview = e.currentTarget.querySelector('.drop-preview');
              if (preview) preview.remove();
            }}
            onDrop={(e) => {
              e.currentTarget.classList.remove('drop-target');
              const preview = e.currentTarget.querySelector('.drop-preview');
              if (preview) preview.remove();
              const jobId = e.dataTransfer.getData('text/job-id');
              if (!jobId) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const hour = Math.max(hourStart, Math.min(hourEnd - 0.5, hourStart + Math.round(x / colW * 4) / 4));
              onJobDrop(jobId, row, hour);
            }}>
            
              {(() => {
              const sortedJobs = [...row.jobs].sort((a, b) => (a.startHour || 0) - (b.startHour || 0));
              const segs = [];
              for (let i = 0; i < sortedJobs.length - 1; i++) {
                const a = sortedJobs[i],b = sortedJobs[i + 1];
                const aEnd = (a.startHour || 0) + (a.durationHrs || 0);
                const bStart = b.startHour || 0;
                if (bStart <= aEnd) continue;
                // deterministic drive time from job-id hash
                const seed = (a.id + b.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
                const driveMin = 12 + seed % 24;
                const miles = (3 + seed % 9).toFixed(1);
                const long = bStart - aEnd > 1.25 || driveMin > 30;
                segs.push({ aEnd, bStart, driveMin, miles, long, key: a.id + '-' + b.id });
              }
              return segs.map((s) => {
                const left = (s.aEnd - hourStart) * colW;
                const width = (s.bStart - s.aEnd) * colW;
                if (width < 36) return null;
                return (
                  <React.Fragment key={s.key}>
                      <div className={"drive-seg-line" + (s.long ? ' long' : '')}
                    style={{ left: left + 8 + 'px', width: width - 16 + 'px' }} />
                      <div className={"drive-seg" + (s.long ? ' long' : '')}
                    style={{ left: left + width / 2 + 'px', transform: 'translate(-50%, -50%)' }}
                    title={"Drive · " + s.driveMin + " min · " + s.miles + " mi"}>
                        <Icon name="truck" size={10} /> {s.driveMin}m
                      </div>
                    </React.Fragment>);

              });
            })()}
              {row.jobs.map((j) =>
            <JobBlock key={j.id} job={j} colW={colW} hourStart={hourStart} density={density}
            selected={selectedJobId === j.id} onClick={() => onJobClick(j)}
            onResize={onJobResize}
            allRowJobs={row.jobs} />
            )}
              {(row.loans || []).map(({ job: j, slot: s, person }, li) => {
                const homeCrew = getCrew(j.crewId);
                const startH = (j.startHour || 0) + (s.start || 0);
                const left = (startH - hourStart) * colW;
                const width = Math.max(60, s.hours * colW - 4);
                return (
                  <div key={'day-loan-' + j.id + '-' + li}
                    className="job-loan-block day-loan"
                    style={{ position: 'absolute', left: left + 'px', width: width + 'px' }}
                    title={person.name + ' loaned to ' + (homeCrew?.name || 'another crew') + ' for ' + j.id + ' · ' + fmtTime(startH) + '–' + fmtTime(startH + s.hours)}
                    onClick={() => onJobClick(j)}>
                    <div className="job-loan-stripe" style={{ background: homeCrew?.color || 'var(--mid-gray)' }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="job-loan-head">
                        <Icon name="refresh" size={9} /> LOAN · {person.name.split(' ')[0]}
                      </div>
                      <div className="job-loan-time">{fmtTime(startH)}–{fmtTime(startH + s.hours)}</div>
                      <div className="job-loan-host">@ {homeCrew?.name || '—'}</div>
                    </div>
                  </div>
                );
              })}
              {ri === 0 &&
            <div className="now-line" style={{ left: nowLeft + 'px' }}></div>
            }
            </div>
          </React.Fragment>
        )}
      </div>
    </div>);

}

// =============================================================
// WEEK / MONTH VIEW (calendar density per day)
// =============================================================
function WeekCalendar({ startDate, groupBy, jobs, onJobClick }) {
  const days = Array.from({ length: 5 }).map((_, i) => addDays(startDate, i));
  const weekKeys = days.map(dateKey);
  let rows;
  if (groupBy === 'truck') {
    rows = TRUCKS.filter((t) => t.assignedCrew).map((item) => ({
      id: item.id,
      name: item.name,
      color: getCrew(item.assignedCrew)?.color,
      meta: item.assignedCrew && getCrew(item.assignedCrew)?.name,
      kind: 'truck'
    }));
  } else if (groupBy === 'tech') {
    // Per-person rows: only people scheduled this week
    rows = PEOPLE.
    filter((p) => jobs.some((j) => weekKeys.includes(j.date) && j.slots.some((s) => s.assignedTo === p.id))).
    sort((a, b) => a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0])).
    map((p) => ({
      id: p.id,
      name: p.name,
      color: getCrew(p.defaultCrew)?.color || 'var(--mid-gray)',
      meta: ROLES[p.roles[0]].label + ' · ' + p.level,
      kind: 'tech'
    }));
  } else {
    rows = CREWS.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      meta: item.type,
      kind: 'crew'
    }));
  }

  return (
    <div className="calendar-wrap" style={{ padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '180px repeat(5, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: 'var(--surface-card)', padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
          {groupBy === 'truck' ? 'Truck' : groupBy === 'tech' ? 'Technician' : 'Crew'}
        </div>
        {days.map((d) => {
          const isToday = dateKey(d) === dateKey(TODAY);
          return (
            <div key={dateKey(d)} style={{ background: 'var(--surface-card)', padding: '10px 12px' }}>
              <div className="eyebrow-sm" style={{ color: isToday ? 'var(--jetson-green)' : 'var(--fg-muted)' }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="h4" style={{ fontFamily: 'var(--font-subhead)', fontWeight: 700, fontSize: 18 }}>
                {d.getDate()} {d.toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </div>);

        })}

        {rows.map((row) =>
        <React.Fragment key={row.id}>
            <div style={{ background: 'var(--surface-card)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderRight: '1px solid var(--border)' }}>
              <div style={{ width: 4, height: 28, borderRadius: 2, background: row.color }}></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{row.name}</div>
                <div className="muted small" style={{ fontSize: 10 }}>{row.meta}</div>
              </div>
            </div>
            {days.map((d) => {
            const dk = dateKey(d);
            // PRIMARY: jobs where this row owns it
            const primaryJobs = jobs.filter((j) => {
              if (j.date !== dk) return false;
              if (row.kind === 'truck') return j.truckId === row.id;
              if (row.kind === 'tech') return j.slots.some((s) => s.assignedTo === row.id);
              return j.crewId === row.id;
            });
            // PARTICIPATION: only relevant for crew rows — a job run by another
            // crew but staffed by one of OUR techs (or where we're in extraCrewIds).
            // Render only the slot's time window, ghosted, so the dispatcher sees
            // their tech is unavailable even though they're not the owning crew.
            const loanBlocks = row.kind === 'crew' ? jobs.flatMap((j) => {
              if (j.date !== dk) return [];
              if (j.crewId === row.id) return [];
              const out = [];
              j.slots.forEach((s) => {
                if (!s.assignedTo) return;
                const person = getPerson(s.assignedTo);
                if (!person) return;
                if (person.defaultCrew !== row.id) return;
                out.push({ job: j, slot: s, person });
              });
              return out;
            }) : [];
            const cellJobs = primaryJobs;
            return (
              <div key={dk + row.id} style={{ background: 'var(--surface-card)', padding: 6, minHeight: 96, display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                  {(() => {
                  // Capacity heatmap counts BOTH primary hours and loan hours
                  const primaryHours = cellJobs.reduce((a, j) => a + (j.durationHrs || 0), 0);
                  const loanHours = loanBlocks.reduce((a, b) => a + b.slot.hours, 0);
                  const hoursBooked = primaryHours + loanHours;
                  const pct = hoursBooked / 8;
                  let level = null;
                  if (hoursBooked === 0) level = null;else
                  if (pct < 0.25) level = 'low';else
                  if (pct < 0.5) level = 'med';else
                  if (pct < 0.85) level = 'high';else
                  if (pct <= 1) level = 'full';else
                  level = 'over';
                  return level ?
                  <>
                        <div className="heat-overlay" data-level={level}></div>
                        <div className="heat-label">{Math.round(pct * 100)}%</div>
                      </> :
                  null;
                })()}
                  {cellJobs.map((j) => {
                  const c = getCustomer(j.customer);
                  return (
                    <div key={j.id} className={"job-block " + getJobType(j.type).color}
                    style={{ position: 'relative', zIndex: 1, height: 'auto', minHeight: 0, padding: '5px 8px' }}
                    onClick={() => onJobClick(j)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, opacity: 0.8 }}>
                          {fmtTime(j.startHour)} · {hoursToStr(j.durationHrs)}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.1 }}>{c ? c.name : j.address?.split('·')[0].trim()}</div>
                      </div>);

                })}
                  {loanBlocks.map(({ job: j, slot: s, person }, i) => {
                    const homeCrew = getCrew(j.crewId);
                    const startH = (j.startHour || 0) + (s.start || 0);
                    return (
                      <div key={'loan-' + j.id + '-' + i}
                        className="job-loan-block"
                        title={person.name + ' loaned to ' + (homeCrew?.name || 'another crew') + ' for ' + j.id}
                        onClick={() => onJobClick(j)}>
                        <div className="job-loan-stripe" style={{ background: homeCrew?.color || 'var(--mid-gray)' }}></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="job-loan-head">
                            <Icon name="refresh" size={9} /> LOAN · {ROLES[s.role]?.short || s.role}
                          </div>
                          <div className="job-loan-time">{fmtTime(startH)}–{fmtTime(startH + s.hours)} · {hoursToStr(s.hours)}</div>
                          <div className="job-loan-host">@ {homeCrew?.name || '—'}</div>
                        </div>
                      </div>
                    );
                  })}
                  {cellJobs.length === 0 && loanBlocks.length === 0 && <div style={{ height: '100%', minHeight: 60, border: '1px dashed var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mid-gray)', fontSize: 10, position: 'relative', zIndex: 1 }}>—</div>}
                </div>);

          })}
          </React.Fragment>
        )}
      </div>
    </div>);

}

// =============================================================
// MONTH VIEW
// =============================================================
function MonthCalendar({ monthDate, jobs, groupBy, onJobClick }) {
  // Build 6×7 grid starting on Sunday before the 1st
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDay = first.getDay(); // 0 = Sun
  const start = addDays(first, -startDay);
  const days = Array.from({ length: 42 }).map((_, i) => addDays(start, i));

  // ─── Per-person strip layout (groupBy === 'tech') ──────────────
  if (groupBy === 'tech') {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const dayCount = monthEnd.getDate();
    const monthDays = Array.from({ length: dayCount }).map((_, i) => addDays(monthStart, i));
    const monthKeys = monthDays.map(dateKey);
    const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const techs = PEOPLE.
    filter((p) => jobs.some((j) => monthKeys.includes(j.date) && j.slots.some((s) => s.assignedTo === p.id))).
    sort((a, b) => a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0]));

    function cellLevel(personJobs) {
      const hrs = personJobs.reduce((a, j) => a + (j.durationHrs || 0), 0);
      if (hrs === 0) return null;
      if (hrs <= 2) return 'low';
      if (hrs <= 5) return 'med';
      if (hrs <= 8) return 'high';
      if (hrs <= 10) return 'full';
      return 'over';
    }

    return (
      <div className="calendar-wrap" style={{ padding: 16, overflowY: 'auto' }}>
        <div style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'auto'
        }}>
          {/* Header row: dates */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '180px repeat(' + dayCount + ', minmax(22px, 1fr))',
            position: 'sticky', top: 0, zIndex: 4,
            background: 'var(--surface-card)',
            borderBottom: '1px solid var(--border)'
          }}>
            <div style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-muted)', borderRight: '1px solid var(--border)' }}>
              Technician · {monthLabel}
            </div>
            {monthDays.map((d) => {
              const isToday = dateKey(d) === dateKey(TODAY);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={dateKey(d)} style={{
                  padding: '6px 2px',
                  textAlign: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  color: isToday ? 'var(--jetson-green)' : isWeekend ? 'var(--mid-gray)' : 'var(--fg-muted)',
                  background: isWeekend ? 'var(--bg-subtle)' : 'transparent',
                  borderRight: '1px solid var(--border)',
                  lineHeight: 1.1
                }}>
                  <div style={{ textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7, fontSize: 8 }}>
                    {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>{d.getDate()}</div>
                </div>);

            })}
          </div>

          {techs.length === 0 &&
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
              No technicians scheduled this month.
            </div>
          }

          {/* Person rows */}
          {techs.map((p) => {
            const personMonthJobs = jobs.filter((j) => monthKeys.includes(j.date) && j.slots.some((s) => s.assignedTo === p.id));
            const totalHrs = personMonthJobs.reduce((a, j) => a + (j.durationHrs || 0), 0);
            const totalDays = new Set(personMonthJobs.map((j) => j.date)).size;
            return (
              <div key={p.id} style={{
                display: 'grid',
                gridTemplateColumns: '180px repeat(' + dayCount + ', minmax(22px, 1fr))',
                borderBottom: '1px solid var(--border)',
                minHeight: 44
              }}>
                <div style={{
                  padding: '8px 14px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderRight: '1px solid var(--border)',
                  background: 'var(--surface-card)',
                  position: 'sticky', left: 0, zIndex: 2
                }}>
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: getCrew(p.defaultCrew)?.color || 'var(--mid-gray)' }}></div>
                  <Avatar person={p} size="sm" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 10 }}>
                      {ROLES[p.roles[0]].short} · {totalDays}d · {totalHrs.toFixed(0)}h
                    </div>
                  </div>
                </div>
                {monthDays.map((d) => {
                  const dk = dateKey(d);
                  const dayJobs = personMonthJobs.filter((j) => j.date === dk);
                  const level = cellLevel(dayJobs);
                  const isToday = dk === dateKey(TODAY);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const tooltip = dayJobs.length ?
                  dayJobs.map((j) => fmtTime(j.startHour) + ' · ' + (getCustomer(j.customer)?.name || JOB_TYPES[j.type].short)).join('\n') :
                  null;
                  return (
                    <div key={dk + p.id}
                    onClick={() => dayJobs.length === 1 && onJobClick(dayJobs[0])}
                    title={tooltip || ''}
                    style={{
                      position: 'relative',
                      borderRight: '1px solid var(--border)',
                      background: isWeekend ? 'var(--bg-subtle)' : 'var(--surface-card)',
                      cursor: dayJobs.length ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 44
                    }}>
                      {level &&
                      <div className="heat-overlay" data-level={level} style={{ borderRadius: 0 }}></div>
                      }
                      {dayJobs.length > 0 &&
                      <span style={{
                        position: 'relative', zIndex: 1,
                        fontSize: 10, fontWeight: 800,
                        color: level === 'over' ? '#781E1E' : level === 'full' || level === 'high' ? '#6F4400' : '#0F1F0D',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                          {dayJobs.length > 1 ? dayJobs.length : '·'}
                        </span>
                      }
                      {isToday &&
                      <div style={{
                        position: 'absolute', inset: 0,
                        outline: '2px solid var(--jetson-green)',
                        outlineOffset: -2,
                        pointerEvents: 'none',
                        zIndex: 2
                      }}></div>
                      }
                    </div>);

                })}
              </div>);

          })}
        </div>

        {/* Legend */}
        <div className="row" style={{ marginTop: 12, gap: 16, fontSize: 11, color: 'var(--fg-muted)' }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>Load per day</span>
          {[['low', '≤ 2h'], ['med', '2–5h'], ['high', '5–8h'], ['full', '8–10h'], ['over', 'OT']].map(([lvl, label]) =>
          <span key={lvl} className="row" style={{ gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, position: 'relative', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <span className="heat-overlay" data-level={lvl} style={{ borderRadius: 0 }}></span>
              </span>
              <span>{label}</span>
            </span>
          )}
        </div>
      </div>);

  }

  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar-wrap" style={{ padding: 16, overflowY: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) =>
        <div key={d} style={{ background: 'var(--surface-card)', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
            {d}
          </div>
        )}
        {days.map((d, i) => {
          const dk = dateKey(d);
          const inMonth = d.getMonth() === monthDate.getMonth();
          const isToday = dk === dateKey(TODAY);
          const cellJobs = jobs.filter((j) => j.date === dk);
          // Compute capacity: assume 10 install-eligible crews × 8h = 80h capacity per day
          const hoursBooked = cellJobs.reduce((a, j) => a + (j.durationHrs || 0), 0);
          const pct = hoursBooked / 80;
          let heat = null;
          if (cellJobs.length === 0) heat = null;else
          if (pct < 0.25) heat = 'low';else
          if (pct < 0.5) heat = 'med';else
          if (pct < 0.85) heat = 'high';else
          if (pct <= 1) heat = 'full';else
          heat = 'over';
          return (
            <div key={i} style={{ background: inMonth ? 'var(--surface-card)' : 'var(--bg-subtle)', minHeight: 110, padding: 8, position: 'relative', opacity: inMonth ? 1 : 0.5 }}>
              {heat && inMonth &&
              <>
                  <div className="heat-overlay" data-level={heat}></div>
                  <div className="heat-label" style={{ top: 6, right: 6, bottom: 'auto' }}>{Math.round(pct * 100)}%</div>
                </>
              }
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, position: 'relative', zIndex: 1 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%',
                  background: isToday ? 'var(--jetson-green)' : 'transparent',
                  color: isToday ? 'var(--forest)' : 'inherit',
                  fontWeight: 700, fontSize: 12
                }}>{d.getDate()}</span>
                {cellJobs.length > 0 && <span className="muted" style={{ fontSize: 10 }}>{cellJobs.length}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative', zIndex: 1 }}>
                {cellJobs.slice(0, 3).map((j) => {
                  const c = getCustomer(j.customer);
                  return (
                    <div key={j.id} className={"jt-tag " + getJobType(j.type).color}
                    style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'none', textAlign: 'left' }}
                    onClick={() => onJobClick(j)}>
                      <span className="mono" style={{ opacity: 0.7, marginRight: 4 }}>{fmtTime(j.startHour)}</span>
                      {c ? c.name.split(' ')[0] : j.address?.split('·')[0].trim() || '—'}
                    </div>);

                })}
                {cellJobs.length > 3 && <div className="muted" style={{ fontSize: 10, padding: '0 4px' }}>+{cellJobs.length - 3} more</div>}
              </div>
            </div>);

        })}
      </div>
    </div>);

}

// =============================================================
// KANBAN VIEW
// =============================================================
function KanbanBoard({ jobs, onJobClick }) {
  const cols = [
  { id: 'unscheduled', label: 'Unscheduled', count: 0 },
  { id: 'scheduled', label: 'Scheduled', count: 0 },
  { id: 'enroute', label: 'En route', count: 0 },
  { id: 'onsite', label: 'On site', count: 0 },
  { id: 'callback', label: 'Callback', count: 0 },
  { id: 'complete', label: 'Complete', count: 0 }];

  cols.forEach((c) => c.count = jobs.filter((j) => j.status === c.id).length);

  return (
    <div className="kanban">
      {cols.map((col) => {
        const colJobs = jobs.filter((j) => j.status === col.id);
        return (
          <div key={col.id} className="kanban-col">
            <div className="kanban-col-header">
              <div className="row">
                <span className="kanban-col-title">{col.label}</span>
                <span className="badge" style={{ background: 'var(--surface-card)' }}>{col.count}</span>
              </div>
              <IconButton icon="plus" label="Add" size="sm" />
            </div>
            <div className="kanban-col-body">
              {colJobs.map((j) => {
                const c = getCustomer(j.customer);
                const jt = getJobType(j.type);
                const crew = getCrew(j.crewId);
                const unfilled = j.slots.some((s) => !s.assignedTo && !s.optional);
                return (
                  <div key={j.id} className="kanban-card" onClick={() => onJobClick(j)}>
                    <div className="kanban-card-accent" style={{ background: 'var(--' + jt.color.replace('jt-', 'jt-') + ')' }}></div>
                    <div style={{ paddingLeft: 6 }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <JobTypeTag type={j.type} />
                        <span className="mono small muted" style={{ marginLeft: 'auto' }}>{j.id}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{c ? c.name : j.address?.split('·')[0]}</div>
                      <div className="muted small row" style={{ gap: 6 }}>
                        <Icon name="map_pin" size={11} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.address}</span>
                      </div>
                      <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                        <div className="row" style={{ gap: 4 }}>
                          {j.slots.filter((s) => s.assignedTo).slice(0, 3).map((s, i) =>
                          <Avatar key={i} person={s.assignedTo} size="xs" />
                          )}
                          {unfilled && <span className="unfilled-pill"><Icon name="user" size={10} /> Unfilled</span>}
                        </div>
                        {j.startHour != null && <span className="mono small muted">{fmtTime(j.startHour)}</span>}
                      </div>
                      {crew && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{crew.name}</div>}
                    </div>
                  </div>);

              })}
              {colJobs.length === 0 && <div className="muted small" style={{ padding: 12, textAlign: 'center' }}>—</div>}
            </div>
          </div>);

      })}
    </div>);

}

// =============================================================
// GANTT VIEW — multi-day jobs over a week
// =============================================================
function GanttChart({ startDate, jobs, groupBy, onJobClick }) {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  const dayW = 140;
  const rows = (groupBy === 'truck' ? TRUCKS.filter((t) => t.assignedCrew) : CREWS).map((item) => ({
    id: item.id,
    name: item.name,
    color: item.color || getCrew(item.assignedCrew)?.color,
    meta: item.type || item.assignedCrew && getCrew(item.assignedCrew)?.name,
    jobs: jobs.filter((j) => groupBy === 'truck' ? j.truckId === item.id : j.crewId === item.id)
  }));

  return (
    <div className="calendar-wrap" style={{ overflowX: 'auto' }}>
      <div className="gantt" style={{ "--gantt-day": dayW + 'px', gridTemplateColumns: '240px repeat(' + days.length + ',' + dayW + 'px)' }}>
        {/* Header */}
        <div className="gantt-label gantt-header">
          <div className="eyebrow-sm">{groupBy === 'truck' ? 'Truck' : 'Crew'}</div>
        </div>
        {days.map((d) => {
          const isToday = dateKey(d) === dateKey(TODAY);
          return (
            <div key={dateKey(d)} className={"gantt-day-header gantt-header" + (isToday ? ' today' : '')}>
              {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>);

        })}

        {/* Rows */}
        {rows.map((row) =>
        <React.Fragment key={row.id}>
            <div className="gantt-label">
              <div style={{ width: 4, height: 28, borderRadius: 2, background: row.color }}></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{row.name}</div>
                <div className="muted small">{row.meta}</div>
              </div>
            </div>
            <div className="gantt-track" style={{ gridColumn: '2 / -1', position: 'relative' }}>
              {row.jobs.map((j) => {
              const dayIdx = days.findIndex((d) => dateKey(d) === j.date);
              if (dayIdx === -1 || j.startHour == null) return null;
              const left = dayIdx * dayW + j.startHour / 24 * dayW;
              const width = Math.max(40, j.durationHrs / 24 * dayW);
              const jt = getJobType(j.type);
              const c = getCustomer(j.customer);
              return (
                <div key={j.id} className={"gantt-bar " + jt.color}
                style={{ left: left + 'px', width: width + 'px', background: 'var(--' + jt.color.replace('jt-', 'jt-bg-').replace('-bg', '').replace('jt-bg-', 'jt-') + '-bg)' }}
                onClick={() => onJobClick(j)}>
                    <JobTypeTag type={j.type} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c ? c.name : j.address?.split('·')[0]}</span>
                  </div>);

            })}
            </div>
          </React.Fragment>
        )}
      </div>
    </div>);

}

// =============================================================
// DISPATCH ROOT
// =============================================================
function DispatchView({ tweaks, onJobClick, selectedJobId, onJobDrop, onJobResize, jobs, onToast, onNewJob, onSmartSchedule, onSuggestTime, onOpenAttention }) {
  const [date, setDate] = useState(TODAY);
  const [layout, setLayout] = useState('calendar'); // calendar | kanban | gantt | map
  const [range, setRange] = useState('day'); // day | week | month
  const [groupBy, setGroupBy] = useState('crew'); // crew | truck | tech
  const [density, setDensity] = useState(tweaks.density || 'cozy');
  const [showRail, setShowRail] = useState(true);
  const [showBrief, setShowBrief] = useState(true);
  const [typeFilter, setTypeFilter] = useState([]); // empty = all
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);

  useEffect(() => {setDensity(tweaks.density || 'cozy');}, [tweaks.density]);

  const visibleJobs = useMemo(() => {
    let base = jobs;
    if (range === 'day') base = jobs.filter((j) => j.date === dateKey(date));
    else if (range === 'week') {
      const start = addDays(date, -date.getDay());
      const keys = Array.from({ length: 7 }).map((_, i) => dateKey(addDays(start, i)));
      base = jobs.filter((j) => keys.includes(j.date));
    }
    else if (range === 'month') base = jobs.filter((j) => j.date && j.date.startsWith(date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')));
    if (typeFilter.length > 0) base = base.filter(j => typeFilter.includes(j.type));
    return base;
  }, [jobs, date, range, typeFilter]);

  const unsched = useMemo(() => jobs.filter((j) => j.status === 'unscheduled'), [jobs]);

  // KPIs for today
  const kpi = useMemo(() => {
    const todayJobs = jobs.filter((j) => j.date === dateKey(date));
    return {
      total: todayJobs.length,
      onsite: todayJobs.filter((j) => j.status === 'onsite').length,
      complete: todayJobs.filter((j) => j.status === 'complete').length,
      unfilled: todayJobs.filter((j) => j.slots.some((s) => !s.assignedTo && !s.optional)).length,
      capUsed: Math.round(todayJobs.reduce((a, j) => a + (j.durationHrs || 0), 0)),
      revenue: todayJobs.reduce((a, j) => a + (j.price || 0), 0)
    };
  }, [jobs, date]);

  function shiftDate(n) {
    if (range === 'day') setDate(addDays(date, n));else
    if (range === 'week') setDate(addDays(date, n * 7));else
    setDate(new Date(date.getFullYear(), date.getMonth() + n, 1));
  }

  let dateLabel;
  if (range === 'day') {
    const isToday = dateKey(date) === dateKey(TODAY);
    dateLabel = isToday ? 'Today · ' + fmtDate(date) : fmtDate(date, { weekday: 'short', month: 'long', day: 'numeric' });
  } else if (range === 'week') {
    const start = addDays(date, -date.getDay());
    const end = addDays(start, 6);
    dateLabel = fmtDate(start, { month: 'short', day: 'numeric' }) + ' – ' + fmtDate(end, { month: 'short', day: 'numeric' });
  } else {
    dateLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  return (
    <>
      {/* CONTROL BAR */}
      <div className="dispatch-controls" data-comment-anchor="6a9cda027a-div-800-7">
        <div className="date-nav">
          <IconButton icon="chevron_left" label="Previous" onClick={() => shiftDate(-1)} variant="outline" />
          <div className="date-label">{dateLabel}</div>
          <IconButton icon="chevron_right" label="Next" onClick={() => shiftDate(1)} variant="outline" />
          <button className="btn btn-outline btn-sm" onClick={() => setDate(TODAY)} style={{ marginLeft: 6 }}>Today</button>
        </div>

        <div className="control-group" style={{ marginLeft: 12 }}>
          <span className="control-label">Range</span>
          <div className="seg">
            {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) =>
            <button key={k} className={range === k ? 'active' : ''} onClick={() => setRange(k)}>{l}</button>
            )}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">View</span>
          <div className="seg">
            <button className={layout === 'calendar' ? 'active' : ''} onClick={() => setLayout('calendar')}>
              <Icon name="calendar" size={13} /> Calendar
            </button>
            <button className={layout === 'kanban' ? 'active' : ''} onClick={() => setLayout('kanban')}>
              <Icon name="kanban" size={13} /> Kanban
            </button>
            <button className={layout === 'gantt' ? 'active' : ''} onClick={() => setLayout('gantt')}>
              <Icon name="gantt" size={13} /> Gantt
            </button>
            <button className={layout === 'map' ? 'active' : ''} onClick={() => setLayout('map')}>
              <Icon name="map_pin" size={13} /> Map
            </button>
          </div>
        </div>

        {layout !== 'kanban' && range !== 'month' &&
        <div className="control-group">
            <span className="control-label">Group</span>
            <div className="seg">
              {[['crew', 'Crew'], ['truck', 'Truck'], ['tech', 'Tech']].map(([k, l]) =>
            layout === 'gantt' && k === 'tech' ? null :
            <button key={k} className={groupBy === k ? 'active' : ''} onClick={() => setGroupBy(k)}>{l}</button>
            )}
            </div>
          </div>
        }

        <div className="topbar-spacer"></div>

        {/* JOB TYPE FILTER */}
        <div className="dispatch-type-filter">
          <button
            className={"btn btn-sm " + (typeFilter.length > 0 ? 'btn-dark' : 'btn-outline')}
            onClick={() => setTypeFilterOpen(o => !o)}>
            <Icon name="briefcase" size={13} />
            {typeFilter.length === 0 ? 'All types' : (typeFilter.length === 1 ? (JOB_TYPES[typeFilter[0]]?.short || JOB_TYPES[typeFilter[0]]?.label) : typeFilter.length + ' types')}
            <Icon name={typeFilterOpen ? 'chevron_up' : 'chevron_down'} size={11} />
          </button>
          {typeFilterOpen && (
            <div className="dispatch-type-filter-pop" onMouseLeave={() => setTypeFilterOpen(false)}>
              <div className="dispatch-type-filter-head">
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>Filter job types</span>
                {typeFilter.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setTypeFilter([])}>Clear</button>
                )}
              </div>
              {Object.entries(JOB_TYPES).map(([k, jt]) => {
                const checked = typeFilter.includes(k);
                const count = visibleJobs.filter(j => j.type === k).length + (typeFilter.length > 0 && !checked ? jobs.filter(j => j.type === k && (range === 'day' ? j.date === dateKey(date) : true)).length : 0);
                return (
                  <label key={k} className={"dispatch-type-filter-row" + (checked ? ' checked' : '')}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setTypeFilter(prev => checked ? prev.filter(x => x !== k) : [...prev, k])} />
                    <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--' + jt.color + ')' }}></span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>{jt.label}</span>
                    <span className="muted small" style={{ fontFamily: 'var(--font-mono)' }}>{count}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="control-group">
          <span className="control-label">Density</span>
          <div className="seg">
            <button className={density === 'cozy' ? 'active' : ''} onClick={() => setDensity('cozy')}>Cozy</button>
            <button className={density === 'compact' ? 'active' : ''} onClick={() => setDensity('compact')}>Compact</button>
          </div>
        </div>

        <button className="btn btn-dark btn-sm" onClick={onNewJob}>
          <Icon name="plus" size={14} /> New job
        </button>
      </div>

      {/* MORNING BRIEF */}
      {range === 'day' && showBrief &&
      <div className="brief">
          <div className="brief-row">
            <div>
              <div className="brief-greeting">Good morning, Jordan.</div>
              <div className="brief-sub">{kpi.total} jobs on the board · {kpi.onsite} on site · sunny, 64°F</div>
            </div>
            <div className="brief-stats">
              <div className="brief-stat">
                <div className="brief-stat-value good">{kpi.total}</div>
                <div className="brief-stat-label">Jobs today</div>
              </div>
              <div className="brief-stat">
                <div className="brief-stat-value good">{Math.round(kpi.capUsed / 80 * 100)}%</div>
                <div className="brief-stat-label">Capacity used</div>
              </div>
              <div className="brief-stat">
                <div className={"brief-stat-value " + (kpi.unfilled > 0 ? 'alert' : 'good')}>{kpi.unfilled}</div>
                <div className="brief-stat-label">Unfilled slots</div>
              </div>
              <div className="brief-stat">
                <div className="brief-stat-value good">{kpi.complete}/{kpi.total}</div>
                <div className="brief-stat-label">Complete</div>
              </div>
            </div>
            <div className="brief-actions">
              <button className="btn btn-primary btn-sm" onClick={onNewJob}>
                <Icon name="plus" size={14} /> New job
              </button>
              <button className="btn btn-outline btn-sm">
                <Icon name="sparkle" size={14} /> Optimize all routes
              </button>
              <IconButton icon="x" label="Hide" onClick={() => setShowBrief(false)} variant="ghost" />
            </div>
          </div>
        </div>
      }

      {/* ATTENTION CTA — compact rail; full triage lives in Needs attention tab */}
      {range === 'day' &&
      <AttentionCta onOpen={onOpenAttention} />
      }

      {/* MAIN AREA */}
      <div className={"dispatch-main" + (showRail && layout === 'calendar' && range === 'day' ? '' : ' no-rail')}>
        {showRail && layout === 'calendar' && range === 'day' &&
        <UnscheduledRail jobs={unsched} onJobClick={onJobClick} onCollapse={() => setShowRail(false)} />
        }
        <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {layout === 'calendar' && range === 'day' &&
          <DayCalendar
            date={date} groupBy={groupBy} density={density}
            jobs={visibleJobs}
            onJobClick={onJobClick}
            onJobDrop={(jobId, row, hour) => onJobDrop(jobId, row, hour, dateKey(date))}
            onJobResize={onJobResize}
            selectedJobId={selectedJobId} />

          }
          {layout === 'calendar' && range === 'week' &&
          <WeekCalendar startDate={addDays(date, -date.getDay() + 1)} groupBy={groupBy} jobs={visibleJobs} onJobClick={onJobClick} />
          }
          {layout === 'calendar' && range === 'month' &&
          <MonthCalendar monthDate={date} jobs={visibleJobs} groupBy={groupBy} onJobClick={onJobClick} />
          }
          {layout === 'kanban' &&
          <KanbanBoard jobs={visibleJobs.concat(unsched)} onJobClick={onJobClick} />
          }
          {layout === 'gantt' &&
          <GanttChart startDate={addDays(date, -date.getDay() + 1)} groupBy={groupBy} jobs={visibleJobs} onJobClick={onJobClick} />
          }
          {layout === 'map' &&
          <MapView date={dateKey(date)} jobs={jobs} onJobClick={onJobClick} />
          }
        </div>
      </div>

      {!showRail && layout === 'calendar' && range === 'day' &&
      <button className="btn btn-dark btn-sm" style={{ position: 'absolute', left: 16, bottom: 16 }} onClick={() => setShowRail(true)}>
          <Icon name="chevron_right" size={14} /> Show unscheduled ({unsched.length})
        </button>
      }
    </>);

}

Object.assign(window, { DispatchView });