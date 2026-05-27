// =============================================================
// RegionPicker — multi-select region filter organized by state.
//
// Each region row is a toggle (checkbox-like). "All regions" clears
// the selection. The topbar label collapses to a count when more
// than one region is selected ("3 regions"), or shows the short
// prefix when just one is selected ("CO"), or "All regions" when
// none are selected.
// =============================================================
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  REGION_LABELS,
  normalizeRegionPrefix,
  useRegionFilter,
  type RegionPrefix,
} from '../lib/region-filter';
import { useStore } from '../store';
import { Icon } from './Icon';

interface RegionPickerProps {
  /** Kept for legacy compatibility — the picker now reads from store directly. */
  value?: unknown;
  onChange?: (v: unknown) => void;
}

export function RegionPicker(_props: RegionPickerProps) {
  const regions = useStore((s) => s.regions);
  const { regionSet, toggleRegion, clearRegions } = useRegionFilter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Compose the topbar button label.
  const { label, short } = useMemo(() => {
    const size = regionSet.size;
    if (size === 0) return { label: 'All regions', short: 'ALL' };
    if (size === 1) {
      const [only] = regionSet;
      return { label: REGION_LABELS[only], short: only };
    }
    return { label: `${size} regions`, short: String(size) };
  }, [regionSet]);

  // Group the visible service areas by STATE (the 2-letter prefix). HubSpot
  // sends ONE top-level "United States" region with every service area as a
  // sub-region — we don't care about that grouping. Re-bucket the subs by
  // their own `short` field (e.g. "CO", "MA", "BC") and treat each bucket
  // as a top-level multi-select option.
  const grouped = useMemo(() => {
    const m = new Map<
      RegionPrefix,
      {
        prefix: RegionPrefix;
        subs: typeof regions[number]['subs'];
        crews: number;
        headcount: number;
      }
    >();
    for (const r of regions) {
      for (const sub of r.subs) {
        const prefix =
          normalizeRegionPrefix(sub.short) ?? normalizeRegionPrefix(sub.name);
        if (!prefix) continue;
        const existing =
          m.get(prefix) ?? { prefix, subs: [], crews: 0, headcount: 0 };
        existing.subs = existing.subs.concat(sub);
        existing.crews += sub.crews;
        existing.headcount += sub.headcount;
        m.set(prefix, existing);
      }
      // Some tenants might still expose top-level regions whose `short` IS a
      // 2-letter state — fall through and include them.
      const topPrefix =
        normalizeRegionPrefix(r.short) ?? normalizeRegionPrefix(r.name);
      if (topPrefix && r.subs.length === 0 && !m.has(topPrefix)) {
        m.set(topPrefix, { prefix: topPrefix, subs: [], crews: 0, headcount: 0 });
      }
    }
    const q = query.trim().toLowerCase();
    const arr = Array.from(m.values()).sort((a, b) =>
      REGION_LABELS[a.prefix].localeCompare(REGION_LABELS[b.prefix]),
    );
    if (!q) return arr;
    return arr.filter(
      (g) =>
        REGION_LABELS[g.prefix].toLowerCase().includes(q) ||
        g.prefix.toLowerCase().includes(q) ||
        g.subs.some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [regions, query]);

  const totalCrews = grouped.reduce((a, g) => a + g.crews, 0);
  const totalHc = grouped.reduce((a, g) => a + g.headcount, 0);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="region-picker-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="map_pin" size={13} />
        <span className="region-picker-short">{short}</span>
        <span className="region-picker-label">{label}</span>
        <Icon name="chevron_down" size={13} />
      </button>
      {open && (
        <div className="region-picker-pop">
          <div className="region-picker-search">
            <Icon name="search" size={13} />
            <input
              placeholder="Find a region or branch…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <button
            className={'region-row region-row-all' + (regionSet.size === 0 ? ' selected' : '')}
            onClick={() => clearRegions()}
          >
            <div className="region-row-icon">
              <Icon name="layers" size={13} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="region-row-name">All regions</div>
              <div className="region-row-meta">
                {grouped.length} state{grouped.length === 1 ? '' : 's'} · {totalCrews} crews · {totalHc} technicians
              </div>
            </div>
            {regionSet.size === 0 && <Icon name="check" size={14} stroke="var(--jetson-green)" />}
          </button>

          <div className="region-picker-list">
            {grouped.map((g) => {
              const checked = regionSet.has(g.prefix);
              return (
                <div key={g.prefix} className="region-group">
                  <button
                    className={'region-row region-row-header' + (checked ? ' selected' : '')}
                    onClick={() => toggleRegion(g.prefix)}
                    aria-pressed={checked}
                  >
                    <span
                      className="region-row-icon"
                      style={{
                        background: checked ? 'var(--jetson-green)' : 'var(--bg-dark)',
                        color: 'var(--off-white)',
                      }}
                    >
                      {checked ? <Icon name="check" size={12} /> : g.prefix}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="region-row-name">{REGION_LABELS[g.prefix]}</div>
                      <div className="region-row-meta">
                        {g.subs.length} branch{g.subs.length === 1 ? '' : 'es'} · {g.crews} crews · {g.headcount} technicians
                      </div>
                    </div>
                    {/* Show a checkbox-style indicator on the right too. */}
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: '1.5px solid ' + (checked ? 'var(--jetson-green)' : 'var(--border-strong)'),
                        background: checked ? 'var(--jetson-green)' : 'transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-hidden
                    >
                      {checked && <Icon name="check" size={12} stroke="var(--off-white)" strokeWidth={3} />}
                    </span>
                  </button>
                  {/* Sub-region list shown for context only (read-only — toggling
                      a sub-region isn't meaningfully different from the state
                      it lives in for our dispatch model). */}
                  {g.subs.length > 0 && (
                    <div className="region-subs">
                      {g.subs.map((sub) => (
                        <div key={sub.id} className="region-row region-row-sub" style={{ cursor: 'default' }}>
                          <span className="region-row-dot" />
                          <div style={{ flex: 1 }}>
                            <div className="region-row-name">{sub.name}</div>
                            <div className="region-row-meta">
                              {sub.crews} crews · {sub.headcount} technicians
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="region-picker-foot">
            <Icon name="info" size={11} />
            <span>Multi-select. Filters jobs, crews, and trucks across every screen.</span>
          </div>
        </div>
      )}
    </div>
  );
}
