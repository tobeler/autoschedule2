/* eslint-disable */
/* Suggest-a-Time — Google Calendar style picker.
   Grid of crews × days with skill-aware fit detection.
   Exposed as both an embeddable <SuggestTimePicker> and a wrapping <SuggestTimeOverlay> modal. */

const { useState: useSU, useMemo: useMU, useEffect: useEU } = React;

// =============================================================
// SUGGEST-TIME PICKER — embeddable
// =============================================================
function SuggestTimePicker({ job, defaultDate, value, onChange, height = 460 }) {
  // job = { type, slots, customer, address, durationHrs }
  const [windowStart, setWindowStart] = useSU(() => {
    // Snap to Monday on/after defaultDate (skip weekends)
    const d = defaultDate ? new Date(defaultDate) : addDays(TODAY, 1);
    const wd = d.getDay();
    const offset = wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd;
    return addDays(d, offset);
  });
  const [includeCrews, setIncludeCrews] = useSU(null);
  const [businessHours, setBusinessHours] = useSU({ start: 7, end: 17 });
  const [expandedCrewId, setExpandedCrewId] = useSU(null);
  const [mode, setMode] = useSU('suggested'); // 'suggested' | 'exact'

  // EXACT mode state — user-entered date / time / crew
  const [exactDate, setExactDate] = useSU(() => dateKey(addDays(TODAY, 1)));
  const [exactTime, setExactTime] = useSU(14); // 2pm default — the phone-call scenario
  const [exactCrewId, setExactCrewId] = useSU(null);
  const [exactAllowConflict, setExactAllowConflict] = useSU(false);

  // Show 5 weekdays (Mon–Fri). Chevrons move by a week.
  const dayCount = 5;
  const days = Array.from({ length: dayCount }).map((_, i) => addDays(windowStart, i));
  const workdayLen = businessHours.end - businessHours.start;

  // Roles required by this job — recomputes when job/type changes
  const requiredRoles = useMU(() => {
    const src = (job.slots && job.slots.length) ? job.slots : (JOB_TEMPLATES[job.type]?.slots || []);
    return src.filter(s => !s.optional).map(s => ({ role: s.role, level: s.level || 'L1' }));
  }, [job.type, job.slots]);

  const eligibleCrews = useMU(() => {
    return CREWS.filter(crew => {
      const leadReq = requiredRoles[0];
      if (!leadReq) return true;
      return crew.members.map(getPerson).some(p => p && p.roles.includes(leadReq.role));
    });
  }, [requiredRoles]);

  const visibleCrews = includeCrews ? eligibleCrews.filter(c => includeCrews.includes(c.id)) : eligibleCrews;

  // Duration is driven by the chosen job type's template
  const duration = useMU(() => {
    if (job.durationHrs) return job.durationHrs;
    const tplSlots = JOB_TEMPLATES[job.type]?.slots || [];
    return Math.max(...tplSlots.map(s => (s.start || 0) + s.hours), 2);
  }, [job.type, job.durationHrs]);

  // For each crew × day, compute earliest valid fit (single- or multi-day)
  const fits = useMU(() => {
    const out = [];
    visibleCrews.forEach(crew => {
      // Pre-compute day data
      const perDay = days.map(d => {
        const dk = dateKey(d);
        // Primary jobs this crew is leading
        const dayJobs = JOBS
          .filter(j => j.date === dk && j.crewId === crew.id)
          .sort((a, b) => a.startHour - b.startHour);
        // Loan-out commitments: other crews' jobs where one of our members is staffed
        const loanCommitments = JOBS
          .filter(j => j.date === dk && j.crewId !== crew.id)
          .flatMap(j => j.slots
            .filter(s => s.assignedTo && getPerson(s.assignedTo)?.defaultCrew === crew.id)
            .map(s => ({
              startHour: (j.startHour || 0) + (s.start || 0),
              durationHrs: s.hours,
              isLoan: true,
              hostJobId: j.id,
            })))
          .sort((a, b) => a.startHour - b.startHour);
        // Treat loans as occupied time for fit computation
        const combined = [...dayJobs, ...loanCommitments].sort((a, b) => a.startHour - b.startHour);
        const leadOff = TIME_OFF.some(t => t.date === dk && t.personId === crew.lead);
        return { day: d, dk, dayJobs: combined, leadOff };
      });

      perDay.forEach((entry, dayIdx) => {
        const { day: d, dk, dayJobs, leadOff } = entry;

        if (leadOff) {
          out.push({ crewId: crew.id, dateKey: dk, day: d, fit: null, reason: 'Lead on PTO/sick' });
          return;
        }

        // earliest contiguous free slot starting on this day
        let candidate = businessHours.start;
        for (const j of dayJobs) {
          if (j.startHour - candidate >= Math.min(duration, workdayLen)) break;
          candidate = Math.max(candidate, j.startHour + j.durationHrs + 0.25);
        }

        if (duration <= workdayLen) {
          // SINGLE-DAY FIT
          const fitsBefore = candidate + duration <= businessHours.end;
          out.push({
            crewId: crew.id, dateKey: dk, day: d,
            fit: fitsBefore ? {
              startHour: candidate,
              endHour: candidate + duration,
              daysSpanned: 1,
              endDateKey: dk,
              endDay: d,
              hoursBooked: dayJobs.reduce((a, j) => a + j.durationHrs, 0),
            } : null,
            reason: fitsBefore ? null : 'No contiguous ' + duration + 'h slot today',
          });
        } else {
          // MULTI-DAY FIT — must start at business-hour open with no jobs that day
          if (dayJobs.length > 0) {
            out.push({ crewId: crew.id, dateKey: dk, day: d, fit: null, reason: 'Needs full day · already booked' });
            return;
          }
          // Walk forward through workdays until duration consumed
          let remaining = duration;
          let endIdx = dayIdx;
          let endHour = businessHours.start;
          let blocked = false;
          for (let i = dayIdx; i < perDay.length; i++) {
            const e = perDay[i];
            if (e.leadOff || e.dayJobs.length > 0) {
              if (i === dayIdx) { /* start day already passed checks */ }
              else { blocked = true; break; }
            }
            if (remaining >= workdayLen) {
              remaining -= workdayLen;
              endIdx = i;
              endHour = businessHours.end;
              if (remaining === 0) break;
            } else {
              endIdx = i;
              endHour = businessHours.start + remaining;
              remaining = 0;
              break;
            }
          }
          if (blocked || remaining > 0) {
            out.push({
              crewId: crew.id, dateKey: dk, day: d, fit: null,
              reason: blocked ? 'Conflict mid-span' : 'Spans past window',
            });
          } else {
            out.push({
              crewId: crew.id, dateKey: dk, day: d,
              fit: {
                startHour: businessHours.start,
                endHour: endHour,
                daysSpanned: endIdx - dayIdx + 1,
                endDateKey: perDay[endIdx].dk,
                endDay: perDay[endIdx].day,
                hoursBooked: 0,
              },
              reason: null,
            });
          }
        }
      });
    });
    return out;
  }, [visibleCrews, days, duration, businessHours, workdayLen]);

  const ranked = useMU(() => {
    const valid = fits.filter(f => f.fit);
    return valid
      .map(f => {
        const crew = getCrew(f.crewId);
        const dayJobs = JOBS.filter(j => j.date === f.dateKey && j.crewId === crew.id);
        const hoursBooked = dayJobs.reduce((a, j) => a + j.durationHrs, 0);
        const isToday = f.dateKey === dateKey(TODAY);
        const score = 100
          - hoursBooked * 3
          - (f.fit.startHour - 8) * 0.5
          + (isToday ? -10 : 0)
          + (crew.color === '#3CD567' ? 5 : 0);
        const reasons = [];
        if (hoursBooked === 0) reasons.push({ tone:'good', icon:'check', text:'Free all day' });
        else reasons.push({ tone: hoursBooked < 4 ? 'good' : 'warn', icon:'clock', text: hoursBooked + 'h booked' });
        if (f.fit.startHour < 9) reasons.push({ tone:'good', icon:'sparkle', text:'Early start' });
        if (crew.type === 'install' && job.type === 'heatpump') reasons.push({ tone:'good', icon:'check', text:'Specialty crew' });
        return { ...f, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [fits, job.type]);

  function getFit(crewId, dk) {
    return fits.find(f => f.crewId === crewId && f.dateKey === dk);
  }

  // value: { crewId, dateKey, startHour } -> derive selectedKey for highlighting
  const selectedKey = value ? value.crewId + '-' + value.dateKey : null;

  function selectFit(f) {
    if (!f?.fit) return;
    onChange && onChange({
      crewId: f.crewId,
      dateKey: f.dateKey,
      startHour: f.fit.startHour,
      endHour: f.fit.endHour,
      endDateKey: f.fit.endDateKey,
      daysSpanned: f.fit.daysSpanned,
    });
  }

  return (
    <div className="suggest-picker" style={{ height }}>
      {/* MODE TOGGLE */}
      <div className="suggest-mode-bar">
        <div className="seg">
          <button className={mode === 'suggested' ? 'active' : ''} onClick={() => setMode('suggested')}>
            <Icon name="sparkle" size={11} /> Suggested times
          </button>
          <button className={mode === 'exact' ? 'active' : ''} onClick={() => setMode('exact')}>
            <Icon name="clock" size={11} /> Pick exact time
          </button>
        </div>
        <span className="muted small" style={{ marginLeft: 8 }}>
          {mode === 'exact' ? 'Type a date and time — we\'ll flag conflicts but let you schedule anyway.' : 'Best-fit slots based on crew load and skills.'}
        </span>
      </div>

      {mode === 'exact' ? (
        <ExactTimePanel
          job={job}
          duration={duration}
          eligibleCrews={eligibleCrews}
          date={exactDate}
          time={exactTime}
          crewId={exactCrewId}
          allowConflict={exactAllowConflict}
          onDateChange={setExactDate}
          onTimeChange={setExactTime}
          onCrewChange={setExactCrewId}
          onAllowConflictChange={setExactAllowConflict}
          onCommit={(slot) => onChange && onChange(slot)}
          selectedKey={value ? value.crewId + '-' + value.dateKey : null}
        />
      ) : (
      <>
      {/* CONTROLS */}
      <div className="suggest-controls">
        <div className="row" style={{ gap: 6 }}>
          <IconButton icon="chevron_left" label="Previous week" variant="outline" onClick={() => setWindowStart(addDays(windowStart, -7))} />
          <span style={{ fontFamily: 'var(--font-subhead)', fontWeight: 700, fontSize: 13, minWidth: 180, textAlign: 'center' }}>
            {windowStart.toLocaleDateString('en-US', { month:'short', day:'numeric' })} – {addDays(windowStart, dayCount-1).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
          </span>
          <IconButton icon="chevron_right" label="Next week" variant="outline" onClick={() => setWindowStart(addDays(windowStart, 7))} />
        </div>

        <div className="row" style={{ marginLeft: 8 }}>
          <span className="control-label">Crews</span>
          <div className="seg">
            <button className={includeCrews === null ? 'active' : ''} onClick={() => setIncludeCrews(null)}>
              All ({eligibleCrews.length})
            </button>
            <button className={includeCrews?.length === 3 ? 'active' : ''} onClick={() => setIncludeCrews(eligibleCrews.slice(0, 3).map(c => c.id))}>
              Top 3
            </button>
          </div>
        </div>

        <div className="row">
          <span className="control-label">Window</span>
          <select className="select" value={businessHours.start + '-' + businessHours.end}
            onChange={e => { const [a,b] = e.target.value.split('-').map(Number); setBusinessHours({ start: a, end: b }); }}>
            <option value="7-17">7a – 5p (standard)</option>
            <option value="6-19">6a – 7p (extended)</option>
            <option value="8-12">Mornings only</option>
            <option value="12-17">Afternoons only</option>
          </select>
        </div>

        <div className="topbar-spacer"></div>

        <div className="muted small" style={{ whiteSpace: 'nowrap' }}>
          <Icon name="info" size={11} /> {ranked.length} fit{ranked.length === 1 ? '' : 's'}
          {requiredRoles[0] && <> · {ROLES[requiredRoles[0].role]?.short || requiredRoles[0].role}</>}
        </div>
      </div>

      <div className="suggest-body">
        {/* SIDEBAR: ranked picks */}
        <div className="suggest-sidebar">
          <div className="suggest-sidebar-header">
            <div className="rail-title" style={{ fontSize: 13 }}>Best fits</div>
            <div className="muted small">By crew load, time-of-day, specialty</div>
          </div>
          <div className="suggest-sidebar-list">
            {ranked.map((r, i) => {
              const crew = getCrew(r.crewId);
              const key = r.crewId + '-' + r.dateKey;
              return (
                <div key={key}
                  className={"suggest-slot" + (i === 0 ? ' best' : '') + (selectedKey === key ? ' selected' : '')}
                  onClick={() => selectFit(r)}>
                  <div className="suggest-slot-rank">#{i+1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="suggest-slot-when">
                      {r.fit.daysSpanned > 1 ? (
                        <>
                          {r.day.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })} {fmtTime(r.fit.startHour)} <span className="suggest-slot-endhour">→ {r.fit.endDay.toLocaleDateString('en-US', { weekday:'short', day:'numeric' })} {fmtTime(r.fit.endHour)}</span>
                        </>
                      ) : (
                        <>
                          {r.day.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })} · {fmtTime(r.fit.startHour)}<span className="suggest-slot-endhour">–{fmtTime(r.fit.endHour)}</span>
                        </>
                      )}
                    </div>
                    <div className="suggest-slot-crew">
                      {crew.name}
                      {r.fit.daysSpanned > 1 && <span className="suggest-slot-spandays"> · spans {r.fit.daysSpanned} days</span>}
                    </div>
                    <div className="suggestion-reasons" style={{ marginTop: 4 }}>
                      {r.reasons.slice(0,2).map((rs, j) => (
                        <span key={j} className={"reason-chip " + rs.tone}>
                          {rs.icon && <Icon name={rs.icon} size={10} />} {rs.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                <div className="empty-icon"><Icon name="info" size={20} stroke="var(--mid-gray)" /></div>
                <div className="h4" style={{ fontSize: 13 }}>No fits in this window</div>
                <div className="muted small">Try a longer window or different crews</div>
              </div>
            )}
          </div>
        </div>

        {/* GRID: crews × days */}
        <div className="suggest-grid">
          <div className="suggest-grid-inner" style={{ '--day-count': dayCount }}>
            <div className="suggest-day-header" style={{ borderLeft: 0 }}>
              <span className="eyebrow-sm">Crew</span>
            </div>
            {days.map(d => {
              const isToday = dateKey(d) === dateKey(TODAY);
              return (
                <div key={dateKey(d)} className={"suggest-day-header" + (isToday ? ' today' : '')}>
                  <div>{d.toLocaleDateString('en-US', { weekday:'short' })}</div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{d.getDate()}</div>
                  <div className="muted small" style={{ fontSize: 10, fontWeight: 500 }}>{d.toLocaleDateString('en-US',{month:'short'})}</div>
                </div>
              );
            })}

            {visibleCrews.map(crew => {
              const lead = getPerson(crew.lead);
              const truck = getTruck(crew.truck);
              const isExpanded = expandedCrewId === crew.id;
              const members = crew.members.map(getPerson).filter(Boolean);

              // For SELECTED multi-day slot, highlight continuation cells
              const selFit = value && value.crewId === crew.id ? fits.find(f => f.crewId === crew.id && f.dateKey === value.dateKey)?.fit : null;
              const inSelectedSpan = (dk) => selFit && selFit.daysSpanned > 1 && dk > value.dateKey && dk <= selFit.endDateKey;

              return (
                <React.Fragment key={crew.id}>
                  <div className="suggest-crew-row-label">
                    <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: crew.color }}></div>
                    <button
                      type="button"
                      className="suggest-crew-toggle"
                      onClick={() => setExpandedCrewId(isExpanded ? null : crew.id)}
                      aria-expanded={isExpanded}
                      title={isExpanded ? 'Hide members' : 'Show members'}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{crew.name}</div>
                        <div className="muted small" style={{ fontSize: 10 }}>{lead?.name} · {truck?.name || 'no truck'}</div>
                      </div>
                      <Icon name={isExpanded ? 'chevron_down' : 'chevron_right'} size={12} stroke="var(--fg-muted)" />
                    </button>
                  </div>
                  {days.map(d => {
                    const dk = dateKey(d);
                    const f = getFit(crew.id, dk);
                    const existing = JOBS.filter(j => j.date === dk && j.crewId === crew.id).sort((a,b)=>a.startHour-b.startHour);
                    const rankIdx = ranked.findIndex(r => r.crewId === crew.id && r.dateKey === dk);
                    const isBest = rankIdx === 0;
                    const isTopHit = rankIdx >= 0 && rankIdx <= 2;
                    const isSelected = selectedKey === (crew.id + '-' + dk);
                    const inSpan = inSelectedSpan(dk);
                    const isSpanEnd = inSpan && dk === selFit.endDateKey;
                    const isMultiDayStart = f?.fit && f.fit.daysSpanned > 1;

                    const classes = ['suggest-cell'];
                    if (inSpan) classes.push('cell-in-span');
                    if (!f?.fit && !inSpan) classes.push('unavailable');
                    else if (isBest) classes.push('has-fit', 'fit-best');
                    else if (isTopHit) classes.push('has-fit');
                    else if (f?.fit) classes.push('has-fit');
                    if (isSelected) classes.push('fit-best');
                    if (isMultiDayStart) classes.push('multi-start');

                    return (
                      <div key={dk + crew.id}
                        className={classes.join(' ')}
                        onClick={() => f?.fit && selectFit(f)}>
                        {existing.map((j, idx) => {
                          const jt = getJobType(j.type);
                          return (
                            <div key={idx} className="suggest-cell-existing" title={getCustomer(j.customer)?.name + ' · ' + fmtTime(j.startHour) + '–' + fmtTime(j.startHour + j.durationHrs)}>
                              <span className="suggest-cell-existing-time">{fmtTime(j.startHour)}–{fmtTime(j.startHour + j.durationHrs)}</span>
                              <span className="suggest-cell-existing-label">{jt?.short || j.type}</span>
                            </div>
                          );
                        })}
                        {f?.fit && f.fit.daysSpanned === 1 && (
                          <div className="suggest-cell-fit-time">
                            <Icon name="sparkle" size={9} /> {fmtTime(f.fit.startHour)}<span className="suggest-cell-fit-end">–{fmtTime(f.fit.endHour)}</span>
                          </div>
                        )}
                        {f?.fit && f.fit.daysSpanned > 1 && (
                          <div className="suggest-cell-fit-time multiday">
                            <Icon name="sparkle" size={9} /> {fmtTime(f.fit.startHour)}<span className="suggest-cell-fit-end"> → {f.fit.endDay.toLocaleDateString('en-US',{weekday:'short'})} {fmtTime(f.fit.endHour)}</span>
                          </div>
                        )}
                        {inSpan && !f?.fit && (
                          <div className="suggest-cell-span">
                            <span className="suggest-cell-span-bar"></span>
                            <span className="suggest-cell-span-label">
                              {isSpanEnd ? 'ends ' + fmtTime(selFit.endHour) : 'continues'}
                            </span>
                          </div>
                        )}
                        {!f?.fit && !inSpan && (
                          <div className="suggest-cell-fits">{f?.reason || '—'}</div>
                        )}
                      </div>
                    );
                  })}
                  {isExpanded && (
                    <div className="suggest-crew-expanded" style={{ gridColumn: '1 / span ' + (dayCount + 1) }}>
                      <div className="suggest-crew-expanded-inner">
                        {members.map(m => {
                          const memberPto = days.filter(d => TIME_OFF.some(t => t.date === dateKey(d) && t.personId === m.id));
                          return (
                            <div key={m.id} className="suggest-crew-member">
                              <Avatar person={m} size="sm" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{m.name}{m.id === crew.lead && <span className="suggest-crew-member-lead">LEAD</span>}</div>
                                <div className="muted small" style={{ fontSize: 10 }}>
                                  {m.roles.map(r => ROLES[r]?.short || r).join(' · ')} · {m.level}
                                </div>
                              </div>
                              {memberPto.length > 0 && (
                                <span className="suggest-crew-member-pto" title={'Off: ' + memberPto.map(d => d.toLocaleDateString('en-US',{weekday:'short'})).join(', ')}>
                                  <Icon name="info" size={9} /> off {memberPto.map(d => d.toLocaleDateString('en-US',{weekday:'short'})).join(', ')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {truck ? (
                          <div className="suggest-crew-member">
                            <div className="suggest-crew-truck-icon"><Icon name="truck" size={12} /></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{truck.name}</div>
                              <div className="muted small" style={{ fontSize: 10 }}>{truck.capacity} · {truck.plate}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="suggest-crew-member">
                            <div className="suggest-crew-truck-icon"><Icon name="truck" size={12} /></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--fg-muted)' }}>No assigned truck</div>
                              <div className="muted small" style={{ fontSize: 10 }}>Driver brings own vehicle</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// =============================================================
// EXACT TIME PANEL — manual date / time / crew entry
// =============================================================
function ExactTimePanel({ job, duration, eligibleCrews, date, time, crewId, allowConflict, onDateChange, onTimeChange, onCrewChange, onAllowConflictChange, onCommit, selectedKey }) {
  const endHour = time + duration;

  // Compute conflict for each crew at the chosen date+time
  const crewStatus = useMU(() => {
    return eligibleCrews.map(crew => {
      const primaryJobs = JOBS.filter(j => j.date === date && j.crewId === crew.id);
      const loanJobs = JOBS
        .filter(j => j.date === date && j.crewId !== crew.id)
        .flatMap(j => j.slots
          .filter(s => s.assignedTo && getPerson(s.assignedTo)?.defaultCrew === crew.id)
          .map(s => ({
            startHour: (j.startHour || 0) + (s.start || 0),
            durationHrs: s.hours,
            isLoan: true,
            hostJob: j,
            slotRole: s.role,
            personId: s.assignedTo,
          })));
      const dayJobs = [...primaryJobs, ...loanJobs];
      const leadOff = TIME_OFF.some(t => t.date === date && t.personId === crew.lead);
      const conflicts = dayJobs.filter(j => {
        const jEnd = j.startHour + j.durationHrs;
        return time < jEnd && endHour > j.startHour;
      });
      return { crew, dayJobs, leadOff, conflicts };
    });
  }, [eligibleCrews, date, time, endHour]);

  const selected = crewStatus.find(s => s.crew.id === crewId);
  const selectedConflicts = selected?.conflicts || [];
  const selectedLeadOff = !!selected?.leadOff;
  const hasIssue = selectedConflicts.length > 0 || selectedLeadOff;
  const canSchedule = !!crewId && (!hasIssue || allowConflict);

  function commit() {
    if (!canSchedule) return;
    onCommit({
      crewId,
      dateKey: date,
      startHour: time,
      endHour: endHour,
      endDateKey: date,
      daysSpanned: 1,
      allowConflicts: hasIssue && allowConflict,
    });
  }

  // Date helpers — format for input[type=date]
  const dObj = new Date(date + 'T12:00:00');
  const dayLabel = dObj.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  // Time options — 15 min steps from 6:00 to 19:45
  const timeOptions = [];
  for (let h = 6; h < 20; h++) {
    [0, 0.25, 0.5, 0.75].forEach(f => timeOptions.push(h + f));
  }

  return (
    <div className="exact-time-panel">
      <div className="exact-time-fields">
        <div className="field">
          <label className="label">Date</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={e => onDateChange(e.target.value)} />
          <div className="muted small" style={{ marginTop: 4 }}>{dayLabel}</div>
        </div>
        <div className="field">
          <label className="label">Start time</label>
          <select
            className="select"
            value={time}
            onChange={e => onTimeChange(parseFloat(e.target.value))}>
            {timeOptions.map(h => (
              <option key={h} value={h}>{fmtTime(h)}</option>
            ))}
          </select>
          <div className="muted small" style={{ marginTop: 4 }}>
            Ends <strong style={{ color: 'var(--fg)' }}>{fmtTime(endHour)}</strong> · {duration}h
          </div>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="label">Crew</label>
          <select
            className="select"
            value={crewId || ''}
            onChange={e => onCrewChange(e.target.value || null)}>
            <option value="">— Pick a crew —</option>
            {crewStatus.map(s => (
              <option key={s.crew.id} value={s.crew.id}>
                {s.crew.name}{s.conflicts.length > 0 ? ' · ' + s.conflicts.length + ' conflict' + (s.conflicts.length === 1 ? '' : 's') : s.leadOff ? ' · lead off' : ' · free'}
              </option>
            ))}
          </select>
          {selected && (
            <div className="muted small" style={{ marginTop: 4 }}>
              {selected.crew.members.length} member{selected.crew.members.length === 1 ? '' : 's'} · {getTruck(selected.crew.truck)?.name || 'No truck'}
            </div>
          )}
        </div>
      </div>

      {/* Conflict / status display */}
      <div className="exact-time-status">
        {!crewId && (
          <div className="exact-time-empty">
            <Icon name="info" size={14} stroke="var(--fg-muted)" />
            <span>Pick a crew to see what's already on their calendar at {fmtTime(time)} on {dayLabel}.</span>
          </div>
        )}

        {crewId && !hasIssue && (
          <div className="exact-time-ok">
            <Icon name="check" size={14} stroke="var(--jetson-green)" strokeWidth={2.5} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{selected.crew.name} is free</div>
              <div className="muted small">No conflicts at this time. Ready to schedule.</div>
            </div>
          </div>
        )}

        {crewId && hasIssue && (
          <div className="exact-time-conflict">
            <div className="exact-time-conflict-head">
              <Icon name="alert_circle" size={14} stroke="#C53030" strokeWidth={2.5} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{selected.crew.name} has {selectedConflicts.length + (selectedLeadOff ? 1 : 0)} issue{(selectedConflicts.length + (selectedLeadOff ? 1 : 0)) === 1 ? '' : 's'}</div>
                <div className="muted small">Review what's already booked before forcing the slot.</div>
              </div>
            </div>
            <div className="exact-time-conflict-list">
              {selectedLeadOff && (
                <div className="exact-time-conflict-item">
                  <span className="exact-time-conflict-time">PTO</span>
                  <span>{getPerson(selected.crew.lead)?.name} (lead) is off this day</span>
                </div>
              )}
              {selectedConflicts.map((j, i) => {
                const jt = j.hostJob ? getJobType(j.hostJob.type) : getJobType(j.type);
                const cust = j.hostJob ? getCustomer(j.hostJob.customer) : getCustomer(j.customer);
                const isLoan = !!j.isLoan;
                return (
                  <div key={i} className="exact-time-conflict-item">
                    <span className="exact-time-conflict-time">{fmtTime(j.startHour)}–{fmtTime(j.startHour + j.durationHrs)}</span>
                    <span>
                      {isLoan && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--fg-muted)', marginRight: 4 }}>LOAN ·</span>}
                      <strong>{jt?.short || j.type || 'Job'}</strong> · {cust?.name || (j.hostJob?.address) || j.address}
                      {isLoan && <span className="muted small"> · {getPerson(j.personId)?.name} on loan</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <label className="exact-time-allow">
              <input type="checkbox" checked={allowConflict} onChange={e => onAllowConflictChange(e.target.checked)} />
              <span>Schedule anyway, ignore conflicts (force onto calendar — useful for meetings)</span>
            </label>
          </div>
        )}
      </div>

      <div className="exact-time-footer">
        <span className="muted small">
          {canSchedule && hasIssue && <><Icon name="alert_circle" size={11} stroke="#C53030" /> Forcing conflict</>}
          {canSchedule && !hasIssue && <><Icon name="check" size={11} stroke="var(--jetson-green)" /> Slot ready</>}
        </span>
        <button
          className={"btn btn-sm " + (canSchedule ? 'btn-primary' : 'btn-outline')}
          disabled={!canSchedule}
          onClick={commit}>
          <Icon name="check" size={12} /> Use this slot
        </button>
      </div>
    </div>
  );
}

// =============================================================
// SUGGEST-TIME OVERLAY — modal wrapper around the picker
// =============================================================
function SuggestTimeOverlay({ onClose, onSchedule, job, defaultDate }) {
  const [selected, setSelected] = useSU(null);  // { crewId, dateKey, startHour }

  const duration = job.durationHrs || Math.max(...((JOB_TEMPLATES[job.type]?.slots || []).map(s => (s.start||0) + s.hours)), 2);

  return (
    <div className="suggest-overlay" onClick={onClose}>
      <div className="suggest-card-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <Icon name="sparkle" size={18} stroke="var(--jetson-green)" />
          <div>
            <div className="eyebrow-sm">Suggest a time</div>
            <div className="h4" style={{ fontSize: 16 }}>
              {job.type ? JOB_TYPES[job.type]?.label : 'New job'} · {Math.round(duration)}h needed
              {getCustomer(job.customer)?.name && <span className="muted small" style={{ marginLeft: 8 }}>· {getCustomer(job.customer).name}</span>}
            </div>
          </div>
          <div className="topbar-spacer"></div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <SuggestTimePicker
          job={job}
          defaultDate={defaultDate}
          value={selected}
          onChange={setSelected}
          height={520}
        />

        <div className="modal-footer">
          <div className="muted small">
            <Icon name="sparkle" size={11} stroke="var(--jetson-green)" /> Cells respect skill match, time-off, business hours, and existing bookings.
          </div>
          <div className="row">
            <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!selected}
              style={{ opacity: selected ? 1 : 0.4 }}
              onClick={() => selected && onSchedule(selected)}>
              <Icon name="check" size={12} /> Schedule selected slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SuggestTimeOverlay, SuggestTimePicker });
