// =============================================================
// Step 1 — Customer selection.
// Search-as-you-type filter on the local customers list (proxy for
// HubSpot contact lookup until the real /search endpoint is wired up).
// =============================================================
import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import type { Customer } from '../../types';

interface Step1CustomerProps {
  value: Customer | null;
  onChange: (c: Customer) => void;
}

export function Step1Customer({ value, onChange }: Step1CustomerProps) {
  const customers = useStore((s) => s.customers);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers.slice(0, 6);
    return customers.filter((c) =>
      (c.name + ' ' + c.address + ' ' + c.phone).toLowerCase().includes(needle),
    );
  }, [customers, q]);

  return (
    <>
      <label className="label">Search HubSpot</label>
      <div
        className="search"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          width: '100%',
          marginBottom: 14,
        }}
      >
        <Icon name="search" size={14} />
        <input
          placeholder="Search contacts by name, address, or phone…"
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          autoFocus
        />
        <span
          className="badge"
          style={{ background: 'rgba(255,122,89,0.12)', color: '#9F3D24' }}
        >
          <Icon name="hubspot" size={10} /> HubSpot
        </span>
      </div>

      <div className="col" style={{ gap: 6 }}>
        {filtered.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>
            <div className="empty-icon">
              <Icon name="search" size={18} stroke="var(--fg-muted)" />
            </div>
            <div className="h4">No matching contacts</div>
            <div className="muted small">Try a different name or address.</div>
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={'lookup-row' + (value?.id === c.id ? ' selected' : '')}
            onClick={() => onChange(c)}
          >
            <Avatar person={{ id: c.id, name: c.name, initials: initialsOf(c.name), roles: [], level: 'L1', defaultCrew: '' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="muted small">
                {c.address} · {c.phone}
              </div>
            </div>
            <span
              className="badge"
              style={{ background: 'rgba(255,122,89,0.1)', color: '#9F3D24' }}
            >
              <Icon name="hubspot" size={10} /> {c.hubspot}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        style={{ marginTop: 12 }}
        onClick={() => {/* stub — real HubSpot create lives in Phase 7 */ }}
      >
        <Icon name="plus" size={12} /> Create new contact in HubSpot
      </button>
    </>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('');
}
