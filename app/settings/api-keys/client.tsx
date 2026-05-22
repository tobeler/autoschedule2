// =============================================================
// Client component for /settings/api-keys. Lists keys, mints new,
// revokes. The plaintext secret only appears in the banner
// returned from create() — we never persist it client-side.
// =============================================================
'use client';

import { useEffect, useMemo, useState } from 'react';

import { client } from '@/api/client';

type Scope = 'read' | 'write' | 'admin';

interface ApiKeyRow {
  id: string;
  name: string;
  scopes: Scope[];
  createdByUserId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

export function ApiKeysClient() {
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['read']);
  const [busy, setBusy] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setLoading(true);
      const data = await client.apiKeys.list();
      setRows(data as ApiKeyRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || scopes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await client.apiKeys.create({ name: name.trim(), scopes });
      setRevealedSecret(res.secret);
      setName('');
      setScopes(['read']);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key.');
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
    setBusy(true);
    try {
      await client.apiKeys.revoke(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke.');
    } finally {
      setBusy(false);
    }
  }

  function toggleScope(scope: Scope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  const active = useMemo(() => rows.filter((r) => !r.revokedAt), [rows]);
  const revoked = useMemo(() => rows.filter((r) => !!r.revokedAt), [rows]);

  return (
    <div style={{ maxWidth: 920, margin: '32px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 4 }}>API Keys</h1>
      <p className="muted small" style={{ marginBottom: 24 }}>
        Programmatic access to the Jetson FSM API. Keys carry the scopes you
        assign; revoke any leaked key immediately.
      </p>

      {revealedSecret && (
        <div
          className="integ-card"
          style={{
            background: 'var(--brand-50, #f0fdf4)',
            border: '1px solid var(--brand-300, #86efac)',
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ flex: 1 }}>
            <h4 style={{ marginBottom: 6 }}>New API key generated</h4>
            <p className="small" style={{ marginBottom: 8 }}>
              Copy it now — for security we don&apos;t store the plaintext.
            </p>
            <code
              style={{
                display: 'block',
                background: '#fff',
                padding: 8,
                borderRadius: 4,
                fontSize: 12,
                wordBreak: 'break-all',
              }}
            >
              {revealedSecret}
            </code>
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setRevealedSecret(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="integ-card"
        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: 16 }}
      >
        <h4>Mint new key</h4>
        <label className="small">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. expo-app, jetson-autopilot"
            style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
            required
          />
        </label>
        <div>
          <div className="small" style={{ marginBottom: 4 }}>
            Scopes
          </div>
          {(['read', 'write', 'admin'] as Scope[]).map((s) => (
            <label key={s} style={{ marginRight: 16, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={() => toggleScope(s)}
              />{' '}
              {s}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim() || scopes.length === 0}
          className="btn btn-sm btn-primary"
          style={{ alignSelf: 'flex-start' }}
        >
          {busy ? 'Working…' : 'Generate key'}
        </button>
        {error && (
          <div className="muted small" style={{ color: 'crimson' }}>
            {error}
          </div>
        )}
      </form>

      <section style={{ marginTop: 24 }}>
        <h3>Active keys</h3>
        {loading ? (
          <p className="muted small">Loading…</p>
        ) : active.length === 0 ? (
          <p className="muted small">No active keys.</p>
        ) : (
          <KeyTable rows={active} onRevoke={onRevoke} />
        )}
      </section>

      {revoked.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>Revoked keys</h3>
          <KeyTable rows={revoked} onRevoke={onRevoke} />
        </section>
      )}
    </div>
  );
}

function KeyTable({
  rows,
  onRevoke,
}: {
  rows: ApiKeyRow[];
  onRevoke: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
      <thead>
        <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--ink-400)' }}>
          <th style={{ padding: '8px 4px' }}>Name</th>
          <th style={{ padding: '8px 4px' }}>Scopes</th>
          <th style={{ padding: '8px 4px' }}>Created</th>
          <th style={{ padding: '8px 4px' }}>Last used</th>
          <th style={{ padding: '8px 4px' }}>Status</th>
          <th style={{ padding: '8px 4px', width: 100 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderTop: '1px solid var(--ink-100, #eee)' }}>
            <td style={{ padding: '8px 4px' }}>{r.name}</td>
            <td style={{ padding: '8px 4px' }} className="small muted">
              {r.scopes.join(', ')}
            </td>
            <td style={{ padding: '8px 4px' }} className="small muted">
              {formatDate(r.createdAt)}
            </td>
            <td style={{ padding: '8px 4px' }} className="small muted">
              {formatDate(r.lastUsedAt)}
            </td>
            <td style={{ padding: '8px 4px' }}>
              {r.revokedAt ? (
                <span className="badge badge-scheduled">revoked</span>
              ) : (
                <span className="badge badge-onsite">active</span>
              )}
            </td>
            <td style={{ padding: '8px 4px', textAlign: 'right' }}>
              {!r.revokedAt && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => onRevoke(r.id)}
                >
                  Revoke
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
