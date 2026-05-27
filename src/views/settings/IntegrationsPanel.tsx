// =============================================================
// HubSpot integration card (Settings → Integrations).
//
// Phase 17:
//  - Test connection (POST /v1/hubspot/ping) shows green check + portal id
//    on 200, "Token invalid" on 401, "Token missing" if no token.
//  - When not connected, a small "Paste HubSpot token" input POSTs to
//    /api/dev/set-hubspot-token (dev only) and re-pings.
//  - Sync now: demo branch hydrates the store via setCustomers /
//    setProjects / setRegions and persists lastSyncedAt to localStorage.
//  - Test push is disabled in demo mode (no DATABASE_URL) with a tooltip.
//  - HubspotFieldMapping save now PUTs each entity to the API too.
// =============================================================
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import { HubspotFieldMapping } from './HubspotFieldMapping';
import { client } from '../../api/client';
import type { HubspotEntityMapping } from '../../types';

const LAST_SYNC_STORAGE_KEY = 'jetson-fsm-v1.hubspotSync.lastAt';

interface PartnerCardProps {
  letters: string;
  bg: string;
  title: string;
  blurb: string;
  status: 'connected' | 'not_connected';
  cta?: { label: string; primary?: boolean };
}

function PartnerCard({ letters, bg, title, blurb, status, cta }: PartnerCardProps) {
  return (
    <div className="integ-card">
      <div className="integ-logo" style={{ background: bg }}>{letters}</div>
      <div style={{ flex: 1 }}>
        <div className="row">
          <h4 style={{ fontSize: 15 }}>{title}</h4>
          <span className={status === 'connected' ? 'badge badge-onsite' : 'badge badge-scheduled'}>
            {status === 'connected' ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="muted small" style={{ marginTop: 2 }}>{blurb}</div>
      </div>
      {cta && <button className={'btn btn-sm ' + (cta.primary ? 'btn-primary' : 'btn-outline')}>{cta.label}</button>}
    </div>
  );
}

type PingState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; portalId: number; accountType: string }
  | { status: 'invalid'; message: string }
  | { status: 'missing' };

function isDevEnv(): boolean {
  // Vite exposes NODE_ENV via import.meta.env.MODE; we also accept the
  // Next.js convention so this card works in either harness.
  try {
    // @ts-expect-error import.meta is widened by Vite
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'development') {
      return true;
    }
  } catch {
    // ignore
  }
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

export function IntegrationsPanel() {
  const hubspotMapping = useStore((s) => s.hubspotMapping);
  const pushToast = useStore((s) => s.pushToast);
  const jobs = useStore((s) => s.jobs);
  const setCustomers = useStore((s) => s.setCustomers);
  const setProjects = useStore((s) => s.setProjects);
  const setRegions = useStore((s) => s.setRegions);

  const [hsExpanded, setHsExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pingState, setPingState] = useState<PingState>({ status: 'idle' });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
  });
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [savingToken, setSavingToken] = useState(false);

  // Connection probe: a /mapping GET is cheap and uses the same auth path.
  const [connectionState, setConnectionState] =
    useState<'unknown' | 'connected' | 'disconnected'>('unknown');

  const connected = connectionState !== 'disconnected';
  const totalMappedFields = hubspotMapping.reduce((n, e) => n + e.fields.length, 0);
  const dev = isDevEnv();

  const setHubspotMapping = useStore((s) => s.setHubspotMapping);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mapping = await client.hubspot.getMapping();
        if (!cancelled) {
          // Hydrate the store so the "N fields mapped" badge updates and
          // future tabs/sessions see the same numbers. The API echoes back
          // strings for `entity`/`direction`; cast to the typed app shape.
          setHubspotMapping(mapping as unknown as HubspotEntityMapping[]);
          setConnectionState('connected');
        }
      } catch {
        if (!cancelled) setConnectionState('disconnected');
      }
    })();
    // Backfill lastSyncAt from audit_log when local state doesn't have it.
    // Otherwise the panel shows "never synced" on a fresh device or after a
    // cache clear even though the integration ran many times on the server.
    void (async () => {
      if (cancelled) return;
      if (lastSyncAt) return;
      try {
        const recent = await client.auditLog.list({
          entityType: 'hubspot',
          limit: 20,
        });
        const lastSync = (recent.data || []).find((r) =>
          /\/hubspot\/sync\b/i.test(r.action || ''),
        );
        if (lastSync && !cancelled) {
          setLastSyncAt(lastSync.createdAt);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, lastSync.createdAt);
          }
        }
      } catch {
        // best-effort — silent failure is fine, just leaves the label alone
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onTestConnection() {
    setPingState({ status: 'checking' });
    try {
      const res = await client.hubspot.ping();
      if (res.ok) {
        setPingState({ status: 'ok', portalId: res.portalId, accountType: res.accountType });
        setConnectionState('connected');
      } else {
        setPingState({ status: 'invalid', message: 'Ping returned ok=false' });
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : 'Ping failed.';
      if (status === 401) {
        setPingState({ status: 'invalid', message: 'Token invalid' });
        setConnectionState('disconnected');
      } else if (status === 503 || /not configured/i.test(msg)) {
        setPingState({ status: 'missing' });
        setConnectionState('disconnected');
      } else {
        setPingState({ status: 'invalid', message: msg });
      }
    }
  }

  async function onPasteToken() {
    const trimmed = tokenInput.trim();
    if (trimmed.length < 10) {
      setLastResult('Token looks too short — paste the full Private App token.');
      return;
    }
    setSavingToken(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/dev/set-hubspot-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: trimmed }),
      });
      const payload = await res.json().catch(() => ({ ok: false, error: 'Bad response' }));
      if (!res.ok || !payload.ok) {
        const message = payload.error || `set-hubspot-token returned ${res.status}`;
        setLastResult(message);
        setPingState({ status: 'invalid', message });
        return;
      }
      setPingState({
        status: 'ok',
        portalId: payload.portalId,
        accountType: payload.accountType,
      });
      setConnectionState('connected');
      setTokenInput('');
      pushToast('HubSpot connected · portal ' + payload.portalId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Token paste failed.';
      setLastResult(msg);
    } finally {
      setSavingToken(false);
    }
  }

  async function onSyncNow() {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await client.hubspot.sync();
      if ('demo' in res && res.demo) {
        // Demo branch — hydrate the store directly.
        setCustomers(res.customers);
        setProjects(res.projects);
        setRegions(res.regions);
        setDemoMode(true);
        const at = res.lastSyncedAt || new Date().toISOString();
        setLastSyncAt(at);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, at);
        }
        setLastResult(
          'Demo sync: ' +
            res.customers.length +
            ' customers, ' +
            res.projects.length +
            ' projects, ' +
            res.regions.length +
            ' regions.',
        );
        if (res.ok) pushToast('HubSpot sync complete · ' + res.customers.length + ' contacts');
        setConnectionState('connected');
      } else {
        // DB-mode response.
        if (res.ok) {
          setLastResult(
            'Synced ' +
              res.contacts +
              ' contacts, ' +
              res.deals +
              ' deals, ' +
              res.projects +
              ' projects, ' +
              res.serviceAreas +
              ' service areas, ' +
              res.installations +
              ' legacy installations.',
          );
          pushToast('HubSpot sync complete');
          setConnectionState('connected');
        } else if (res.errors.length) {
          setLastResult(res.errors[0] ?? 'Sync returned errors.');
        }
        setLastSyncAt(res.finishedAt);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, res.finishedAt);
        }
        setDemoMode(false);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : 'Sync failed.';
      if (status === 503 || /not configured/i.test(msg)) {
        setConnectionState('disconnected');
        setPingState({ status: 'missing' });
      }
      setLastResult(msg);
    } finally {
      setSyncing(false);
    }
  }

  async function onTestPush() {
    if (demoMode) return;
    const sample = jobs.find((j) => j.status === 'scheduled') ?? jobs[0];
    if (!sample) {
      setLastResult('No jobs to push.');
      return;
    }
    setPushing(true);
    setLastResult(null);
    try {
      const res = await client.hubspot.pushJob(sample.id);
      setLastResult(res.message);
      if (res.ok) pushToast('Pushed job ' + sample.id);
    } catch (err) {
      setLastResult(err instanceof Error ? err.message : 'Push failed.');
    } finally {
      setPushing(false);
    }
  }

  function renderPingBadge(): React.ReactNode {
    if (pingState.status === 'idle') return null;
    if (pingState.status === 'checking') {
      return (
        <span className="muted small" style={{ marginLeft: 8 }}>
          <Icon name="refresh" size={11} /> Checking…
        </span>
      );
    }
    if (pingState.status === 'ok') {
      return (
        <span
          className="badge badge-onsite"
          style={{ marginLeft: 8 }}
          title={'Account type: ' + pingState.accountType}
        >
          <Icon name="check" size={10} /> Portal {pingState.portalId}
        </span>
      );
    }
    if (pingState.status === 'missing') {
      return (
        <span className="badge badge-scheduled" style={{ marginLeft: 8 }}>
          Token missing
        </span>
      );
    }
    return (
      <span
        className="badge"
        style={{
          marginLeft: 8,
          background: 'rgba(220,53,69,0.12)',
          color: '#9C2334',
        }}
        title={pingState.message}
      >
        <Icon name="alert_circle" size={10} /> {pingState.message}
      </span>
    );
  }

  return (
    <>
      <div>
        <h3>Integrations</h3>
        <p className="muted small">Connect CRM, payroll, and mapping systems.</p>
      </div>

      <DemoDataCard />

      <div className="integ-card">
        <div className="integ-logo">HS</div>
        <div style={{ flex: 1 }}>
          <div className="row">
            <h4 style={{ fontSize: 15 }}>HubSpot</h4>
            {connected
              ? <span className="badge badge-onsite">Connected</span>
              : <span className="badge badge-scheduled">Not connected</span>}
            {renderPingBadge()}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {connected
              ? 'Jetson portal 21424670 (na1). ' + totalMappedFields + ' fields mapped'
                + (lastSyncAt ? ' · last sync ' + new Date(lastSyncAt).toLocaleString() : ' · never synced')
              : 'Set HUBSPOT_TOKEN on the server to enable Sync and Test push.'}
          </div>
        </div>
        <button
          className={'btn btn-sm ' + (hsExpanded ? 'btn-primary' : 'btn-outline')}
          onClick={() => setHsExpanded((v) => !v)}
          aria-expanded={hsExpanded}
        >
          <Icon name="settings" size={12} /> Configure
          <Icon name={hsExpanded ? 'chevron_up' : 'chevron_down'} size={11} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onTestConnection}
          disabled={pingState.status === 'checking'}
        >
          <Icon name="zap" size={12} />{' '}
          {pingState.status === 'checking' ? 'Testing…' : 'Test connection'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onSyncNow} disabled={syncing}>
          <Icon name="refresh" size={12} /> {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onTestPush}
          disabled={!connected || pushing || demoMode}
          title={demoMode ? 'Push enabled when DATABASE_URL is set' : undefined}
        >
          <Icon name="arrow_right" size={12} /> {pushing ? 'Pushing…' : 'Test push'}
        </button>
      </div>

      {/* V1/V2 data-model toggles — control which HubSpot sources sync runs */}
      {connected && <V1V2Toggles />}

      {/* Dev-only token paste — surfaces when the server isn't connected. */}
      {dev && !connected && (
        <div
          className="integ-card"
          style={{ marginLeft: 60, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div className="muted small" style={{ flex: '0 0 100%', marginBottom: 4 }}>
            <Icon name="info" size={11} /> Development only. Paste a HubSpot Private App token
            to connect for this dev process. Production uses Vercel env vars.
          </div>
          <input
            type="password"
            className="input"
            placeholder="pat-na1-…"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={onPasteToken}
            disabled={savingToken || tokenInput.length < 10}
          >
            {savingToken ? 'Saving…' : 'Save & test'}
          </button>
        </div>
      )}

      {lastResult && (
        <div className="muted small" style={{ marginLeft: 60, marginTop: -8 }}>
          <Icon name="info" size={11} /> {lastResult}
        </div>
      )}
      {hsExpanded && (
        <div className="integ-config-expand">
          <HubspotFieldMapping />
        </div>
      )}

      <PartnerCard
        letters="G"
        bg="#2A6FDB"
        title="Google Maps Platform"
        blurb="Distance Matrix + Routes API. Powers drive-time estimates and route optimization. (placeholder)"
        status="not_connected"
        cta={{ label: 'Connect', primary: true }}
      />

      <PartnerCard
        letters="QB"
        bg="#1F8A5B"
        title="QuickBooks Time"
        blurb="Push approved timesheets to payroll. (placeholder)"
        status="not_connected"
        cta={{ label: 'Connect', primary: true }}
      />

      <PartnerCard
        letters="T"
        bg="#000"
        title="Twilio"
        blurb='Customer SMS for arrival windows and "tech is on the way" notifications. (placeholder)'
        status="not_connected"
        cta={{ label: 'Configure' }}
      />
    </>
  );
}

// =============================================================
// Demo Data card — toggle the prototype seed dataset on/off.
// When off, every collection is empty until HubSpot Sync hydrates.
// =============================================================
function DemoDataCard() {
  const enabled = useStore((s) => s.demoDataEnabled);
  const setEnabled = useStore((s) => s.setDemoDataEnabled);
  const jobsLen = useStore((s) => s.jobs.length);
  const peopleLen = useStore((s) => s.people.length);
  const crewsLen = useStore((s) => s.crews.length);
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  function handleToggle() {
    if (enabled) {
      setConfirmingDisable(true);
    } else {
      setEnabled(true);
    }
  }

  return (
    <>
      <div className="integ-card">
        <div className="integ-logo" style={{ background: '#3CD567', color: '#0F1F0D' }}>
          DEMO
        </div>
        <div style={{ flex: 1 }}>
          <div className="row">
            <h4 style={{ fontSize: 15 }}>Demo data</h4>
            {enabled
              ? <span className="badge badge-onsite">Loaded</span>
              : <span className="badge badge-scheduled">Cleared</span>}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {enabled
              ? `Demo overlay active · ${jobsLen} jobs · ${peopleLen} technicians · ${crewsLen} crews. Real DB rows are untouched and reappear on next reload.`
              : 'Showing real data from Postgres. Toggle on to overlay the local store with seed data (your DB is never modified).'}
          </div>
        </div>
        <button
          className={'btn btn-sm ' + (enabled ? 'btn-outline' : 'btn-primary')}
          onClick={handleToggle}
        >
          {enabled ? 'Turn off' : 'Reload demo'}
        </button>
      </div>
      {confirmingDisable && (
        <div className="modal-backdrop" onClick={() => setConfirmingDisable(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Turn off demo mode?</h3>
            </div>
            <div className="modal-body">
              <p>
                The local seed overlay is removed; your real DB rows (HubSpot + Zuper sync) reappear on next page reload.
              </p>
              <p className="muted small">No data is deleted — your Postgres tables are untouched.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingDisable(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setEnabled(false);
                  setConfirmingDisable(false);
                }}
              >
                Turn off demo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================
// V1/V2 data-model toggles. Inset under the HubSpot card so the
// user can independently enable/disable each source-of-truth model
// without affecting Contacts/Deals (which are shared).
// =============================================================
interface IntegrationFlagsState {
  hubspotV1: boolean;
  hubspotV2: boolean;
  zuperWriteback: boolean;
}

function V1V2Toggles() {
  const [flags, setFlags] = useState<IntegrationFlagsState | null>(null);
  const [pending, setPending] = useState<keyof IntegrationFlagsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/v1/settings/integrations', { credentials: 'include' });
        if (!r.ok) return;
        const data = (await r.json()) as IntegrationFlagsState;
        if (!cancelled) setFlags(data);
      } catch {
        // silent — surfaces as "loading…" until retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof IntegrationFlagsState) {
    if (!flags) return;
    const next = { ...flags, [key]: !flags[key] };
    setPending(key);
    setFlags(next); // optimistic
    try {
      const r = await fetch('/api/v1/settings/integrations', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!r.ok) throw new Error('PUT failed');
      const updated = (await r.json()) as IntegrationFlagsState;
      setFlags(updated);
    } catch {
      setFlags(flags); // revert
    } finally {
      setPending(null);
    }
  }

  if (!flags) {
    return (
      <div className="muted small" style={{ marginLeft: 60, marginTop: 4 }}>
        <Icon name="info" size={11} /> Loading data-model toggles…
      </div>
    );
  }

  const Row = ({
    label,
    sub,
    value,
    flagKey,
  }: {
    label: string;
    sub: string;
    value: boolean;
    flagKey: keyof IntegrationFlagsState;
  }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 0',
      }}
    >
      <button
        className={'tweak-toggle' + (value ? ' on' : '')}
        onClick={() => toggle(flagKey)}
        disabled={pending === flagKey}
        aria-label={(value ? 'Disable' : 'Enable') + ' ' + label}
        style={{ flex: '0 0 auto' }}
      >
        <span className="tweak-toggle-dot" />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {label}
          {value ? (
            <span className="badge badge-onsite" style={{ marginLeft: 8, fontSize: 10 }}>
              On
            </span>
          ) : (
            <span className="badge badge-scheduled" style={{ marginLeft: 8, fontSize: 10 }}>
              Off
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 1 }}>
          {sub}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="integ-card"
      style={{
        marginLeft: 60,
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0,
      }}
    >
      <div className="muted small" style={{ marginBottom: 6 }}>
        <Icon name="info" size={11} /> Data model — toggles control which HubSpot sources the next sync includes. Existing rows are kept; rows from a disabled source go stale until you re-enable + sync.
      </div>
      <Row
        label="V1 — Installations (legacy)"
        sub="Pulls HubSpot Installation custom object (2-31703261). Currently the primary source: ~2,800 records."
        value={flags.hubspotV1}
        flagKey="hubspotV1"
      />
      <Row
        label="V2 — Native Projects"
        sub="Pulls HubSpot Projects (0-970) + Jobs (2-62483808). Currently small but grows as you move to the new model."
        value={flags.hubspotV2}
        flagKey="hubspotV2"
      />
    </div>
  );
}
