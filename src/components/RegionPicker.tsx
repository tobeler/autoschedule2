import { useEffect, useRef, useState } from 'react';
import { useStore, type RegionSelection } from '../store';
import { Icon } from './Icon';

interface RegionPickerProps {
  value: RegionSelection | null;
  onChange: (r: RegionSelection | null) => void;
}

export function RegionPicker({ value, onChange }: RegionPickerProps) {
  const regions = useStore((s) => s.regions);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  let label = 'All regions';
  let short = 'ALL';
  if (value?.regionId && !value.subId) {
    const r = regions.find((r) => r.id === value.regionId);
    label = r ? 'All ' + r.name : 'All regions';
    short = r?.short || 'ALL';
  } else if (value?.subId) {
    const r = regions.find((r) => r.id === value.regionId);
    const s = r?.subs.find((s) => s.id === value.subId);
    label = s ? s.name : 'All regions';
    short = r?.short || '';
  }

  const totalCrews = regions.reduce((a, r) => a + r.subs.reduce((b, s) => b + s.crews, 0), 0);
  const totalHc = regions.reduce((a, r) => a + r.subs.reduce((b, s) => b + s.headcount, 0), 0);

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
            <input placeholder="Find a region or branch…" autoFocus />
          </div>

          <button
            className={'region-row region-row-all' + (!value ? ' selected' : '')}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <div className="region-row-icon">
              <Icon name="layers" size={13} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="region-row-name">All regions</div>
              <div className="region-row-meta">
                {regions.length} regions · {totalCrews} crews · {totalHc} technicians
              </div>
            </div>
            {!value && <Icon name="check" size={14} stroke="var(--jetson-green)" />}
          </button>

          <div className="region-picker-list">
            {regions.map((region) => {
              const regionActive = value?.regionId === region.id && !value?.subId;
              const totalCrewsR = region.subs.reduce((a, s) => a + s.crews, 0);
              const totalHcR = region.subs.reduce((a, s) => a + s.headcount, 0);
              return (
                <div key={region.id} className="region-group">
                  <button
                    className={'region-row region-row-header' + (regionActive ? ' selected' : '')}
                    onClick={() => {
                      onChange({ regionId: region.id, subId: '' });
                      setOpen(false);
                    }}
                  >
                    <div
                      className="region-row-icon"
                      style={{ background: 'var(--bg-dark)', color: 'var(--off-white)' }}
                    >
                      {region.short}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="region-row-name">All {region.name}</div>
                      <div className="region-row-meta">
                        {region.subs.length} branches · {totalCrewsR} crews · {totalHcR} technicians
                      </div>
                    </div>
                    {regionActive && <Icon name="check" size={14} stroke="var(--jetson-green)" />}
                  </button>
                  <div className="region-subs">
                    {region.subs.map((sub) => {
                      const subActive = value?.subId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          className={'region-row region-row-sub' + (subActive ? ' selected' : '')}
                          onClick={() => {
                            onChange({ regionId: region.id, subId: sub.id });
                            setOpen(false);
                          }}
                        >
                          <span className="region-row-dot"></span>
                          <div style={{ flex: 1 }}>
                            <div className="region-row-name">{sub.name}</div>
                            <div className="region-row-meta">
                              {sub.crews} crews · {sub.headcount} technicians
                            </div>
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
