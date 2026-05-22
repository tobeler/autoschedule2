/* eslint-disable */
/* Needs Attention — triage workbench view */

const { useState: useAS, useMemo: useAM, useEffect: useAE } = React;

const SEV_ORDER = { urgent: 0, warn: 1, info: 2 };
const SEV_LABEL = { urgent: 'Urgent', warn: 'Today', info: 'FYI' };

const CATEGORY_META = {
  coverage:  { label: 'Coverage',  icon: 'user',         desc: 'Unfilled slots, people out' },
  schedule:  { label: 'Schedule',  icon: 'calendar',     desc: 'Unscheduled jobs, callbacks' },
  field:     { label: 'Field',     icon: 'map_pin',      desc: 'Late ETAs, missing photos' },
  heads_up:  { label: 'Heads-up',  icon: 'alert_circle', desc: 'Weather, customer notes' },
};

// ─────────────────────────────────────────────────────────────
// Build the item list — real data + a few synthetic exceptions
// ─────────────────────────────────────────────────────────────
function buildAttentionItems() {
  const items = [];
  const today = dateKey(TODAY);

  // 1. UNFILLED SLOTS — scan today's jobs
  JOBS.filter(j => j.date === today).forEach(job => {
    const unfilled = job.slots.filter(s => !s.assignedTo && !s.optional);
    unfilled.forEach(s => {
      const c = getCustomer(job.customer);
      const role = ROLES[s.role];
      const slotStart = fmtTime(job.startHour + s.start);
      items.push({
        id: 'unf-' + job.id + '-' + s.id,
        sev: 'urgent',
        cat: 'coverage',
        icon: 'user',
        title: 'Unfilled ' + role.label + ' slot on ' + job.id,
        desc: <>Needs <strong>{role.label}</strong> on site by <strong>{slotStart}</strong> · {hoursToStr(s.hours)} · {c?.name || job.address?.split('·')[0]}</>,
        meta: [
          { kind: 'due', label: 'By ' + slotStart },
          { kind: 'tag', label: JOB_TYPES[job.type].short },
        ],
        context: [
          ['Job', job.id + ' · ' + JOB_TYPES[job.type].label],
          ['Customer', c?.name || '—'],
          ['Address', job.address],
          ['Role needed', role.label + ' (' + s.level + ')'],
          ['Start time', slotStart + ' · ' + hoursToStr(s.hours)],
        ],
        resolutions: [
          { primary: true, icon: 'sparkle', title: 'Suggest an available ' + role.label, sub: 'Match level + region + travel window', action: 'assign' },
          { icon: 'user',  title: 'Pick from roster', sub: 'Manually assign a person', action: 'pick' },
          { icon: 'phone', title: 'Call subcontractor pool', sub: 'Brooks Electric · Walsh Electric on call' },
        ],
        jobId: job.id,
      });
    });
  });

  // 2. CALLBACKS — unscheduled or marked callback
  JOBS.filter(j => j.type === 'callback' && (j.status === 'unscheduled' || j.status === 'callback')).forEach(job => {
    const c = getCustomer(job.customer);
    const isToday = job.date === today;
    items.push({
      id: 'cb-' + job.id,
      sev: 'urgent',
      cat: 'schedule',
      icon: 'refresh',
      title: 'Callback · ' + (c?.name || job.id),
      desc: <>{job.notes || 'Customer reported recurring issue'} · {isToday ? 'same-day' : 'unscheduled'}</>,
      meta: [
        { kind: isToday ? 'due' : 'soft', label: isToday ? 'Today' : 'Unscheduled' },
        { kind: 'tag', label: 'Callback' },
      ],
      context: [
        ['Job', job.id],
        ['Customer', c?.name || '—'],
        ['Address', job.address],
        ['Original job', 'J-2562 · completed May 14'],
        ['Issue', job.notes || '—'],
      ],
      resolutions: [
        { primary: true, icon: 'sparkle', title: isToday ? "Drop into today's slack" : 'Suggest earliest fit', sub: 'Chen Crew has 1.5h gap at 3:30p', action: 'schedule' },
        { icon: 'phone', title: 'Call customer', sub: 'Confirm urgency + window' },
        { icon: 'briefcase', title: 'Open original job', sub: 'View install history' },
      ],
      jobId: job.id,
    });
  });

  // 3. MISSING COMMISSIONING (synthetic, anchored to J-2614)
  items.push({
    id: 'mc-J-2614',
    sev: 'urgent',
    cat: 'field',
    icon: 'camera',
    title: 'Commissioning photos overdue on J-2614',
    desc: <>Tyree's heat pump install at <strong>Margaret Chen</strong> is past the 4-hour mark · no commissioning photos uploaded yet</>,
    meta: [
      { kind: 'due', label: 'On site 4h+' },
      { kind: 'tag', label: 'HP Install' },
    ],
    context: [
      ['Job', 'J-2614 · Heat pump install'],
      ['Crew', 'Holloway Crew · Tyree Booker (lead)'],
      ['Customer', 'Margaret Chen · Newton'],
      ['Status', 'On site since 8:00a'],
      ['Photos', 'Before (4) · During (6) · After (0)'],
    ],
    resolutions: [
      { primary: true, icon: 'phone', title: 'Ping Tyree on his phone', sub: 'Send "submit commissioning photos" prompt' },
      { icon: 'message', title: 'Add note to job', sub: 'Visible in the mobile tech app' },
      { icon: 'check', title: 'Mark not required', sub: 'Customer agreed to skip docs' },
    ],
    jobId: 'J-2614',
  });

  // 3b. SPILLOVER REQUEST (synthetic — Bennett Crew flagged J-2611 as needing continuation)
  items.push({
    id: 'spill-J-2611',
    sev: 'urgent',
    cat: 'schedule',
    icon: 'refresh',
    title: 'Spillover: Bennett Crew needs to continue tomorrow',
    desc: <>Bennett flagged <strong>J-2611</strong> at Rachel Sondheim's at 3:42p · electrical pull running long, won't finish today · needs continuation slot</>,
    meta: [
      { kind: 'due', label: 'Confirm by 5p' },
      { kind: 'tag', label: 'Continuation' },
    ],
    context: [
      ['Job', 'J-2611 · Heat pump install'],
      ['Crew', 'Bennett Crew · Aaliyah Bennett (lead)'],
      ['Customer', 'Rachel Sondheim · Cambridge'],
      ['Status', 'On site · ~6h remaining of 8h scope'],
      ['Reason', 'Electrical pull running 2.5h longer than expected'],
      ['Crew availability tomorrow', 'Free 8a–12p · Highland Pl walk-through 2p'],
    ],
    resolutions: [
      { primary: true, icon: 'sparkle', title: 'Create continuation · tomorrow 8a–12p', sub: 'Same crew · auto-links as J-2611 cont.', action: 'create_continuation' },
      { icon: 'calendar', title: 'Pick a different slot', sub: 'Open Suggest-a-Time with Bennett constraints' },
      { icon: 'user', title: 'Hand off to Reyes Crew', sub: 'They have 9a–12p free tomorrow' },
      { icon: 'message', title: 'Ask Bennett for ETA estimate', sub: 'Maybe they can still finish today' },
    ],
    jobId: 'J-2611',
  });

  // 4. LATE ETA (synthetic — Park Crew behind)
  items.push({
    id: 'late-park',
    sev: 'warn',
    cat: 'field',
    icon: 'clock',
    title: 'Park Crew running 25 min behind',
    desc: <>Annual tune-up at <strong>Garrett &amp; Sasha M.</strong> set for 10:00a · ETA now 10:25a from prior stop</>,
    meta: [
      { kind: 'soft', label: 'ETA 10:25a' },
      { kind: 'tag', label: 'Service' },
    ],
    context: [
      ['Job', 'J-2630 · Care Plus tune-up'],
      ['Crew', 'Park Crew · Noor Khan'],
      ['Customer', 'Garrett & Sasha M. · Arlington'],
      ['Window', '10:00a – 12:00p'],
      ['Projected', '10:25a · 25 min late'],
    ],
    resolutions: [
      { primary: true, icon: 'message', title: 'Send "running late" SMS', sub: 'Templated · arrival in ~25 min' },
      { icon: 'refresh', title: 'Reassign to nearer crew', sub: 'Reyes Crew is 8 min from the address' },
      { icon: 'calendar', title: 'Reschedule for afternoon', sub: "Move to Park's 13:00 slot" },
    ],
    jobId: 'J-2630',
  });

  // 5. UNSCHEDULED QUEUE — bucket non-callback unscheduled
  const unsched = JOBS.filter(j => j.status === 'unscheduled' && j.type !== 'callback');
  if (unsched.length) {
    const total = unsched.reduce((s, j) => s + (j.price || 0), 0);
    items.push({
      id: 'queue-unsched',
      sev: 'warn',
      cat: 'schedule',
      icon: 'calendar',
      title: unsched.length + ' unscheduled job' + (unsched.length === 1 ? '' : 's') + ' for this week',
      desc: <>Total <strong>${total.toLocaleString()}</strong> in pipeline awaiting slots · oldest sits 3 days</>,
      meta: [
        { kind: 'soft', label: 'This week' },
        { kind: 'deal', label: 'HubSpot' },
      ],
      context: unsched.map(j => {
        const c = getCustomer(j.customer);
        return [j.id, (c?.name || j.address?.split('·')[0]) + ' · ' + JOB_TYPES[j.type].short + (j.price ? ' · $' + j.price.toLocaleString() : '')];
      }),
      resolutions: [
        { primary: true, icon: 'sparkle', title: 'Batch smart-schedule', sub: 'Suggest crew + day for each', action: 'smart_schedule' },
        { icon: 'calendar', title: 'Open unscheduled rail', sub: 'Drag into the day calendar' },
        { icon: 'message', title: 'Defer to next week', sub: 'Mark all as Week-of May 25' },
      ],
    });
  }

  // 6. TIGHT DRIVE WINDOW (synthetic)
  items.push({
    id: 'drive-J-2641',
    sev: 'warn',
    cat: 'field',
    icon: 'truck',
    title: 'Tight drive window into J-2641',
    desc: <>Reyes Crew ends Brookline install at 4:30p · sales walk-through at <strong>Highland Pl</strong> starts 4:30p · only 18 min of buffer</>,
    meta: [
      { kind: 'soft', label: '18 min buffer' },
      { kind: 'tag', label: 'Conflict' },
    ],
    context: [
      ['Stop 1', 'J-2615 · Brookline · ends 4:30p'],
      ['Stop 2', 'J-2641 · Highland Pl · starts 4:30p'],
      ['Drive', '18 min via I-90 E'],
      ['Risk', 'Customer waiting, no slack'],
    ],
    resolutions: [
      { primary: true, icon: 'refresh', title: 'Push J-2641 to 5:00p', sub: 'Notify customer · 30 min buffer' },
      { icon: 'user', title: 'Reassign walk-through to Theo', sub: "He's free at 4:30p in Cambridge" },
    ],
    jobId: 'J-2641',
  });

  // 7. PEOPLE OUT — derive from TIME_OFF
  TIME_OFF.forEach(t => {
    const p = getPerson(t.personId);
    if (!p) return;
    const isToday = t.date === today;
    items.push({
      id: 'to-' + t.id,
      sev: isToday ? 'warn' : 'info',
      cat: 'coverage',
      icon: t.type === 'sick' ? 'alert_circle' : (t.type === 'vacation' ? 'calendar' : 'sparkle'),
      title: p.name + ' out ' + (isToday ? 'today' : 'on ' + fmtDate(new Date(t.date + 'T12:00:00'), { weekday: 'short', month: 'short', day: 'numeric' })),
      desc: <>{t.label} · {ROLES[p.roles[0]].label} on {getCrew(p.defaultCrew)?.name}</>,
      meta: [
        { kind: 'soft', label: isToday ? 'Today' : 'Upcoming' },
        { kind: 'tag', label: t.type === 'sick' ? 'Sick' : t.type === 'vacation' ? 'PTO' : 'Training' },
      ],
      context: [
        ['Person', p.name],
        ['Role', ROLES[p.roles[0]].label + ' · ' + p.level],
        ['Crew', getCrew(p.defaultCrew)?.name || '—'],
        ['Date', isToday ? 'Today' : fmtDate(new Date(t.date + 'T12:00:00'), { weekday: 'long', month: 'long', day: 'numeric' })],
        ['Status', isToday ? (t.type === 'sick' ? 'Jobs already reassigned' : 'On schedule') : 'Heads-up only'],
      ],
      resolutions: isToday ? [
        { primary: true, icon: 'check', title: 'Review reassigned jobs', sub: '2 jobs moved to Reyes Crew' },
        { icon: 'message', title: 'Message ' + p.name.split(' ')[0], sub: 'Check in / wish well' },
      ] : [
        { primary: true, icon: 'sparkle', title: 'Find coverage', sub: 'Suggest backup ' + ROLES[p.roles[0]].label.toLowerCase() },
        { icon: 'calendar', title: 'See affected jobs', sub: 'Jobs assigned to ' + p.name.split(' ')[0] + ' that day' },
      ],
      personId: p.id,
    });
  });

  // 8. WEATHER (info)
  items.push({
    id: 'wx-fri',
    sev: 'info',
    cat: 'heads_up',
    icon: 'sparkle',
    title: 'Rain forecast Friday afternoon',
    desc: <>3 outdoor unit installs scheduled · 60% chance of heavy rain after 2p · plan for tarps + delays</>,
    meta: [
      { kind: 'soft', label: 'Fri May 22' },
      { kind: 'tag', label: '3 jobs' },
    ],
    context: [
      ['Forecast', 'Heavy rain, 60% PM · NWS'],
      ['Affected jobs', 'J-2664 · J-2670 · J-2673'],
      ['Crews', 'Bennett · Holloway · Sales'],
    ],
    resolutions: [
      { primary: true, icon: 'calendar', title: 'Move outdoor work to AM', sub: 'Reorder Friday stops · indoor jobs last' },
      { icon: 'message', title: 'Notify affected customers', sub: 'Templated weather alert' },
    ],
  });

  // 9. CUSTOMER NOTE (info)
  items.push({
    id: 'note-margaret',
    sev: 'info',
    cat: 'heads_up',
    icon: 'message',
    title: 'Customer note · Margaret Chen',
    desc: <>"Small dog, friendly but skittish — please call before entering side gate." · captured at booking</>,
    meta: [
      { kind: 'soft', label: 'J-2614' },
      { kind: 'tag', label: 'Note' },
    ],
    context: [
      ['Customer', 'Margaret Chen'],
      ['Job', 'J-2614 · Heat pump install'],
      ['Captured', 'May 18 · booking call'],
      ['Visible to tech?', 'Yes — also in mobile app'],
    ],
    resolutions: [
      { primary: true, icon: 'check', title: 'Acknowledge', sub: 'Mark as seen' },
      { icon: 'message', title: 'Add to job notes', sub: 'Forward to Tyree' },
    ],
    jobId: 'J-2614',
  });

  items.sort((a, b) => {
    if (SEV_ORDER[a.sev] !== SEV_ORDER[b.sev]) return SEV_ORDER[a.sev] - SEV_ORDER[b.sev];
    return (a.cat || '').localeCompare(b.cat || '');
  });
  return items;
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────
function AttentionView({ onJumpToJob, onSmartSchedule, onToast }) {
  const allItems = useAM(() => buildAttentionItems(), []);
  const [sevFilter, setSevFilter] = useAS('all');
  const [catFilter, setCatFilter] = useAS('all');
  const [resolved, setResolved] = useAS({});
  const [snoozed, setSnoozed] = useAS({});

  const visible = allItems.filter(it => {
    if (snoozed[it.id]) return false;
    if (sevFilter !== 'all' && it.sev !== sevFilter) return false;
    if (catFilter !== 'all' && it.cat !== catFilter) return false;
    return true;
  });

  const [selectedId, setSelectedId] = useAS(allItems[0]?.id || null);

  // If the selected item gets filtered out, fall back to first visible
  useAE(() => {
    if (!visible.find(v => v.id === selectedId)) {
      setSelectedId(visible[0]?.id || null);
    }
  }, [sevFilter, catFilter, Object.keys(snoozed).length, Object.keys(resolved).length]);

  const counts = {
    urgent: allItems.filter(i => i.sev === 'urgent' && !snoozed[i.id]).length,
    warn:   allItems.filter(i => i.sev === 'warn'   && !snoozed[i.id]).length,
    info:   allItems.filter(i => i.sev === 'info'   && !snoozed[i.id]).length,
  };
  const total = counts.urgent + counts.warn + counts.info;

  const grouped = useAM(() => {
    const map = {};
    visible.forEach(it => {
      if (!map[it.cat]) map[it.cat] = [];
      map[it.cat].push(it);
    });
    return Object.keys(CATEGORY_META).filter(k => map[k]).map(k => ({ cat: k, items: map[k] }));
  }, [visible]);

  const selected = allItems.find(i => i.id === selectedId);

  function resolveItem(id) {
    setResolved(r => ({ ...r, [id]: true }));
    onToast && onToast('Resolved');
    const remaining = visible.filter(v => v.id !== id);
    setSelectedId(remaining[0]?.id || null);
  }
  function snoozeItem(id) {
    setSnoozed(s => ({ ...s, [id]: true }));
    onToast && onToast('Snoozed · revisit in 1 hour');
    const remaining = visible.filter(v => v.id !== id);
    setSelectedId(remaining[0]?.id || null);
  }

  return (
    <div className="att-view">
      {/* HEADER */}
      <div className="att-header">
        <div>
          <h1>Needs attention</h1>
          <div className="sub">
            <span>{total} open item{total === 1 ? '' : 's'} across today and this week</span>
            {counts.urgent > 0 && <span style={{ color: '#C53030', fontWeight: 600 }}>· {counts.urgent} urgent</span>}
            {total === 0 && <span style={{ color: '#1A6F2E', fontWeight: 600 }}>· all clear</span>}
          </div>
        </div>
        <div className="att-counts">
          <button className={"att-count urgent" + (sevFilter === 'urgent' ? ' active' : '')} onClick={() => setSevFilter(sevFilter === 'urgent' ? 'all' : 'urgent')}>
            <span className="v">{counts.urgent}</span>
            <span className="l">Urgent</span>
          </button>
          <button className={"att-count warn" + (sevFilter === 'warn' ? ' active' : '')} onClick={() => setSevFilter(sevFilter === 'warn' ? 'all' : 'warn')}>
            <span className="v">{counts.warn}</span>
            <span className="l">Today</span>
          </button>
          <button className={"att-count info" + (sevFilter === 'info' ? ' active' : '')} onClick={() => setSevFilter(sevFilter === 'info' ? 'all' : 'info')}>
            <span className="v">{counts.info}</span>
            <span className="l">FYI</span>
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="att-toolbar">
        <span className="filter-label">Severity</span>
        <div className="seg">
          <button className={sevFilter === 'all' ? 'active' : ''} onClick={() => setSevFilter('all')}>All</button>
          <button className={sevFilter === 'urgent' ? 'active' : ''} onClick={() => setSevFilter('urgent')}>Urgent</button>
          <button className={sevFilter === 'warn' ? 'active' : ''} onClick={() => setSevFilter('warn')}>Today</button>
          <button className={sevFilter === 'info' ? 'active' : ''} onClick={() => setSevFilter('info')}>FYI</button>
        </div>
        <span className="filter-label" style={{ marginLeft: 12 }}>Category</span>
        <div className="seg">
          <button className={catFilter === 'all' ? 'active' : ''} onClick={() => setCatFilter('all')}>All</button>
          {Object.entries(CATEGORY_META).map(([k, m]) => (
            <button key={k} className={catFilter === k ? 'active' : ''} onClick={() => setCatFilter(k)}>{m.label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems:'center', gap: 8 }}>
          <Icon name="clock" size={13} />
          <span>Refreshed just now</span>
          {Object.keys(resolved).length > 0 && (
            <button className="btn btn-ghost btn-sm muted" onClick={() => setResolved({})}>
              Undo {Object.keys(resolved).length} resolved
            </button>
          )}
          {Object.keys(snoozed).length > 0 && (
            <button className="btn btn-ghost btn-sm muted" onClick={() => setSnoozed({})}>
              Unsnooze {Object.keys(snoozed).length}
            </button>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div className={"att-main" + (visible.length === 0 ? ' no-detail' : '')}>
        <div className="att-list">
          {grouped.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 60, textAlign: 'center', color: 'var(--fg-muted)',
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'rgba(60,213,103,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Icon name="check" size={32} stroke="#1A6F2E" strokeWidth={2.5} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: 'var(--forest)', marginBottom: 6 }}>
                All clear.
              </div>
              <div style={{ fontSize: 13, maxWidth: 340 }}>
                Nothing needs your attention right now. Items will surface here as conditions change in the field.
              </div>
            </div>
          )}

          {grouped.map(g => {
            const meta = CATEGORY_META[g.cat];
            return (
              <div key={g.cat} className="att-group">
                <div className="group-title">
                  <span className="ic"><Icon name={meta.icon} size={14} /></span>
                  <span>{meta.label}</span>
                  <span className="count">{g.items.length} item{g.items.length === 1 ? '' : 's'}</span>
                </div>
                <div className="att-cards">
                  {g.items.map(it => (
                    <AttentionRow
                      key={it.id}
                      item={it}
                      isResolved={!!resolved[it.id]}
                      selected={selectedId === it.id}
                      onSelect={() => setSelectedId(it.id)}
                      onResolve={() => resolveItem(it.id)}
                      onJump={() => it.jobId && onJumpToJob && onJumpToJob(it.jobId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {visible.length > 0 && (
          <DetailPane
            item={selected}
            onResolve={() => selected && resolveItem(selected.id)}
            onSnooze={() => selected && snoozeItem(selected.id)}
            onJump={() => selected?.jobId && onJumpToJob && onJumpToJob(selected.jobId)}
            onAction={(action) => {
              if (action === 'smart_schedule') onSmartSchedule && onSmartSchedule();
              if (selected) resolveItem(selected.id);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────
function AttentionRow({ item, isResolved, selected, onSelect, onResolve, onJump }) {
  return (
    <div className={"att-item " + item.sev + (selected ? ' selected' : '') + (isResolved ? ' resolved' : '')}
      onClick={onSelect} role="button" tabIndex={0}>
      <div className="sev-stripe"></div>
      <div className="ic-box"><Icon name={item.icon} size={18} /></div>
      <div className="att-item-body">
        <div className="att-item-title">{item.title}</div>
        <div className="att-item-desc">{item.desc}</div>
        <div className="att-item-meta">
          {item.meta?.map((m, i) => (
            <span key={i} className={"pill " + (m.kind === 'due' ? 'due' : '') + (m.kind === 'soft' ? ' due soft' : '') + (m.kind === 'deal' ? ' deal' : '')}>
              {m.kind === 'due' && <Icon name="clock" size={10} />}
              {m.kind === 'deal' && <Icon name="hubspot" size={10} />}
              {m.label}
            </span>
          ))}
          {item.jobId && (
            <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>{item.jobId}</span>
          )}
        </div>
      </div>
      <div className="att-item-actions" onClick={e => e.stopPropagation()}>
        {isResolved ? (
          <span className="att-item-resolved-tag">
            <Icon name="check" size={10} stroke="#1A6F2E" strokeWidth={3} />
            Done
          </span>
        ) : (
          <>
            {item.jobId && (
              <button className="btn btn-ghost btn-sm muted" onClick={onJump} title="Open job">
                <Icon name="expand" size={12} />
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={onResolve}>
              <Icon name="check" size={12} /> Resolve
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Detail pane
// ─────────────────────────────────────────────────────────────
function DetailPane({ item, onResolve, onSnooze, onJump, onAction }) {
  if (!item) {
    return (
      <div className="att-detail">
        <div className="att-detail-empty">
          <div className="glyph"><Icon name="alert_circle" size={28} stroke="var(--mid-gray)" /></div>
          <div className="title">Select an item</div>
          <div>Pick something from the list to see context and resolution options.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="att-detail">
      <div className="att-detail-head">
        <span className={"att-detail-sev " + item.sev}>
          <span className="dot"></span>
          {SEV_LABEL[item.sev]} · {CATEGORY_META[item.cat]?.label}
        </span>
        <h2>{item.title}</h2>
        <div className="why">{item.desc}</div>
      </div>

      <div className="att-detail-section">
        <div className="label">Context</div>
        <div className="att-detail-context">
          {item.context?.map(([k, v], i) => (
            <div className="row" key={i}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="att-detail-section">
        <div className="label">Resolve by</div>
        <div className="att-resolutions">
          {item.resolutions?.map((r, i) => (
            <button key={i} className={"att-resolution" + (r.primary ? ' primary' : '')}
              onClick={() => onAction(r.action)}>
              <span className="ic"><Icon name={r.icon} size={16} /></span>
              <span>
                <span className="ttl">{r.title}</span>
                <span className="sub">{r.sub}</span>
              </span>
              <Icon name="chevron_right" size={14} className="chev" />
            </button>
          ))}
        </div>
      </div>

      <div className="att-detail-footer">
        {item.jobId && (
          <button className="btn btn-outline btn-sm" onClick={onJump}>
            <Icon name="expand" size={12} /> Open job
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onSnooze}>
          <Icon name="clock" size={12} /> Snooze 1h
        </button>
        <button className="btn btn-dark btn-sm" style={{ marginLeft: 'auto' }} onClick={onResolve}>
          <Icon name="check" size={12} /> Mark resolved
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compact CTA for the dispatch view
// ─────────────────────────────────────────────────────────────
function AttentionCta({ onOpen }) {
  const items = useAM(() => buildAttentionItems(), []);
  const urgent = items.filter(i => i.sev === 'urgent').length;
  const warn = items.filter(i => i.sev === 'warn').length;
  const total = items.length;

  if (total === 0) {
    return (
      <div className="attention-cta" onClick={onOpen} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
        <span className="lead zero">
          <span className="ic"><Icon name="check" size={12} stroke="#1A6F2E" strokeWidth={2.5} /></span>
          All clear
        </span>
        <span className="summary">No exceptions on today's board.</span>
      </div>
    );
  }

  const top = items.slice(0, 2);

  return (
    <div className="attention-cta" onClick={onOpen} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
      <span className="lead">
        <span className="ic"><Icon name="alert_circle" size={12} /></span>
        Needs attention · {total}
      </span>
      <span className="summary">
        {urgent > 0 && <strong style={{ color: '#C53030' }}>{urgent} urgent</strong>}
        {urgent > 0 && warn > 0 && <span className="sep">·</span>}
        {warn > 0 && <strong>{warn} today</strong>}
        <span className="sep">·</span>
        <em>{top[0]?.title}</em>
        {top[1] && <><span className="sep">·</span><em>{top[1].title}</em></>}
      </span>
      <button className="btn btn-dark btn-sm open" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        Open workbench
        <Icon name="chevron_right" size={12} />
      </button>
    </div>
  );
}

Object.assign(window, { AttentionView, AttentionCta, buildAttentionItems });
