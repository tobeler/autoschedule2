/* Jetson Schedule + Dispatch — shared icon set + tiny components.
   Loaded with babel. Exports to window.*  */

// ---- ICONS — minimal stroke icons matching Jetson illustration weight (1.5–2px) ----
function Icon({ name, size = 18, stroke = 'currentColor', strokeWidth = 1.75, style }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    kanban: <><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="16" y="4" width="5" height="14" rx="1.5"/></>,
    gantt: <><path d="M3 5h8M3 12h12M3 19h6M11 5l4 0M15 12l4 0"/><circle cx="3" cy="5" r="0" fill="currentColor"/></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></>,
    truck: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 4-7 8-7s8 2.5 8 7"/></>,
    users: <><circle cx="9" cy="9" r="3.5"/><path d="M2.5 19c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="8" r="2.5"/><path d="M16 13.5c3 0 5 2 5 4.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    chevron_left: <><path d="M15 6l-6 6 6 6"/></>,
    chevron_right: <><path d="M9 6l6 6-6 6"/></>,
    chevron_down: <><path d="M6 9l6 6 6-6"/></>,
    chevron_up: <><path d="M18 15l-6-6-6 6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-5-5"/></>,
    filter: <><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>,
    map_pin: <><path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="3"/></>,
    phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5 13 13 0 0 0 2.6.6 2 2 0 0 1 1.7 2z"/></>,
    check: <><path d="M5 12l5 5L20 7"/></>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
    arrow_right: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    drag: <><circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/></>,
    bell: <><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 3h16z"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    sparkle: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
    tool: <><path d="M14.7 6.3a4 4 0 0 1 5.6 5.6L8.7 23.5l-5.6-5.6L14.7 6.3zM12 9l3 3"/></>,
    bolt: <><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></>,
    home: <><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/></>,
    timer: <><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 9v4l2 2"/></>,
    settings_2: <><path d="M5 4v6M5 18v2M5 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 4v2M12 14v6M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 4v10M19 18v2M19 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></>,
    bar_chart: <><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/></>,
    plug: <><path d="M9 2v6M15 2v6M5 8h14v3a7 7 0 0 1-14 0V8zM12 18v4"/></>,
    droplet: <><path d="M12 3s7 7.5 7 13a7 7 0 0 1-14 0c0-5.5 7-13 7-13z"/></>,
    flame: <><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5a6 6 0 0 1-2-3.5c-2 1-4 3-4 6 0-2-1-3-2-4a8 8 0 0 0-2 7 7 7 0 0 0 6 7z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>,
    layers: <><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></>,
    hubspot: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>,
    expand: <><path d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    more: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths[name] || null}
    </svg>
  );
}

// ---- Tiny avatar / chip ----
function Avatar({ person, size = 'sm', color }) {
  const p = typeof person === 'string' ? getPerson(person) : person;
  if (!p) return null;
  const initials = p.initials || p.name.split(' ').map(s => s[0]).slice(0,2).join('');
  return (
    <div className={"avatar " + size} title={p.name} style={color ? { background: color } : null}>
      {initials}
    </div>
  );
}

function RoleChip({ role, level, assignedTo, optional, suggested, onClick, compact }) {
  const r = ROLES[role];
  if (!r) return null;
  const p = assignedTo ? getPerson(assignedTo) : null;
  return (
    <div className={"role-chip" + (optional ? " optional" : "") + (suggested ? " suggested" : "") + (compact ? " compact" : "") + (onClick ? " clickable" : "")} onClick={onClick}>
      {p ? <Avatar person={p} size="xs" /> : <div className="avatar xs" style={{ background:'transparent', border:'1.5px dashed var(--border-strong)', color:'var(--fg-subtle)' }}>?</div>}
      <span className="role-chip-text">
        <span className="role-chip-name">{p ? (compact ? p.initials : p.name.split(' ')[0]) : 'Unfilled'}</span>
        <span className="role-chip-meta">{r.short}{level ? ' ' + level : ''}</span>
      </span>
    </div>
  );
}

// ---- Status badge ----
function StatusBadge({ status }) {
  return <span className={"badge dot badge-" + status}>{statusLabel(status)}</span>;
}

// ---- Job type tag ----
function JobTypeTag({ type, size }) {
  const jt = getJobType(type);
  if (!jt) return null;
  return <span className={"jt-tag " + jt.color + (size === 'lg' ? ' lg':'')}>{jt.short}</span>;
}

// ---- Inline icon button ----
function IconButton({ icon, label, onClick, variant = 'ghost', size = 'md', className = '' }) {
  return (
    <button className={"btn btn-" + variant + " btn-icon " + className} onClick={onClick} title={label}>
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}

// ---- Empty state ----
function EmptyState({ icon, title, body, action }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <svg viewBox="0 0 200 120" width="180" height="108" fill="none">
          {/* House sketch — pulled from Jetson's illustration vocabulary */}
          <defs>
            <linearGradient id="empty-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#CBFF8A" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#3CD567" stopOpacity="0.05"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="200" height="120" rx="20" fill="url(#empty-sky)" />
          <path d="M 40 80 L 100 38 L 160 80 L 160 100 L 40 100 Z" fill="#FBFAF1" stroke="#113823" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M 40 80 L 100 38 L 160 80" stroke="#113823" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
          <rect x="86" y="68" width="20" height="32" rx="2" fill="#3CD567" stroke="#113823" strokeWidth="2" />
          <circle cx="102" cy="84" r="1.6" fill="#113823" />
          <rect x="55" y="68" width="14" height="14" rx="1.5" fill="#CBFF8A" stroke="#113823" strokeWidth="1.6" />
          <rect x="130" y="68" width="14" height="14" rx="1.5" fill="#CBFF8A" stroke="#113823" strokeWidth="1.6" />
          {/* Outdoor unit (heat pump) */}
          <rect x="146" y="86" width="22" height="14" rx="2" fill="#113823" />
          <circle cx="157" cy="93" r="3" fill="#FBFAF1" />
          {icon === 'sparkle' && <path d="M 100 18 L 102 24 L 108 26 L 102 28 L 100 34 L 98 28 L 92 26 L 98 24 Z" fill="#3CD567" />}
        </svg>
      </div>
      <div className="h4" style={{ marginTop: 8 }}>{title}</div>
      {body && <div className="muted small">{body}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

// ---- Page header ----
function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow-sm" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h2 className="page-title">{title}</h2>
        {subtitle && <div className="muted small" style={{ marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div className="row" style={{ marginLeft: 'auto' }}>{children}</div>
    </div>
  );
}

Object.assign(window, { Icon, Avatar, RoleChip, StatusBadge, JobTypeTag, IconButton, EmptyState, PageHeader, RegionPicker });

// =============================================================
// REGION PICKER — branch/market filter at top of app
// =============================================================
function RegionPicker({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // value: { regionId, subId | null }  OR  null = "all regions"
  let label = 'All regions';
  let short = 'ALL';
  if (value?.regionId && !value.subId) {
    const r = REGIONS.find(r => r.id === value.regionId);
    label = r ? 'All ' + r.name : 'All regions';
    short = r?.short || 'ALL';
  } else if (value?.subId) {
    const r = REGIONS.find(r => r.id === value.regionId);
    const s = r?.subs.find(s => s.id === value.subId);
    label = s ? s.name : 'All regions';
    short = r?.short || '';
  }

  const totalCrews = REGIONS.reduce((a, r) => a + r.subs.reduce((b, s) => b + s.crews, 0), 0);
  const totalHc = REGIONS.reduce((a, r) => a + r.subs.reduce((b, s) => b + s.headcount, 0), 0);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="region-picker-btn" onClick={() => setOpen(o => !o)}>
        <Icon name="map_pin" size={13} />
        <span className="region-picker-short">{short}</span>
        <span className="region-picker-label">{label}</span>
        <Icon name="chevron_down" size={13} />
      </button>
      {open && (
        <div className="region-picker-pop">
          <div className="region-picker-search">
            <Icon name="search" size={13} />
            <input placeholder="Find a region or branch…" autoFocus />
          </div>

          <button
            className={"region-row region-row-all" + (!value ? ' selected' : '')}
            onClick={() => { onChange(null); setOpen(false); }}>
            <div className="region-row-icon"><Icon name="layers" size={13} /></div>
            <div style={{ flex: 1 }}>
              <div className="region-row-name">All regions</div>
              <div className="region-row-meta">{REGIONS.length} regions · {totalCrews} crews · {totalHc} technicians</div>
            </div>
            {!value && <Icon name="check" size={14} stroke="var(--jetson-green)" />}
          </button>

          <div className="region-picker-list">
            {REGIONS.map(region => {
              const regionActive = value?.regionId === region.id && !value?.subId;
              const totalCrewsR = region.subs.reduce((a, s) => a + s.crews, 0);
              const totalHcR = region.subs.reduce((a, s) => a + s.headcount, 0);
              return (
                <div key={region.id} className="region-group">
                  <button
                    className={"region-row region-row-header" + (regionActive ? ' selected' : '')}
                    onClick={() => { onChange({ regionId: region.id }); setOpen(false); }}>
                    <div className="region-row-icon" style={{ background: 'var(--bg-dark)', color:'var(--off-white)' }}>{region.short}</div>
                    <div style={{ flex: 1 }}>
                      <div className="region-row-name">All {region.name}</div>
                      <div className="region-row-meta">{region.subs.length} branches · {totalCrewsR} crews · {totalHcR} technicians</div>
                    </div>
                    {regionActive && <Icon name="check" size={14} stroke="var(--jetson-green)" />}
                  </button>
                  <div className="region-subs">
                    {region.subs.map(sub => {
                      const subActive = value?.subId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          className={"region-row region-row-sub" + (subActive ? ' selected' : '')}
                          onClick={() => { onChange({ regionId: region.id, subId: sub.id }); setOpen(false); }}>
                          <span className="region-row-dot"></span>
                          <div style={{ flex: 1 }}>
                            <div className="region-row-name">{sub.name}</div>
                            <div className="region-row-meta">{sub.crews} crews · {sub.headcount} technicians</div>
                          </div>
                          {subActive && <Icon name="check" size={14} stroke="var(--jetson-green)" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="region-picker-foot">
            <Icon name="info" size={11} />
            <span>Filters jobs, crews, and trucks across every screen.</span>
          </div>
        </div>
      )}
    </div>
  );
}
