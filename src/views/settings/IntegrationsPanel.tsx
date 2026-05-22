import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import { HubspotFieldMapping } from './HubspotFieldMapping';
import { isHubspotConnected } from '../../integrations/hubspot/client';
import { pushJobToHubspot, syncFromHubspot } from '../../integrations/hubspot/sync';

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

export function IntegrationsPanel() {
  const hubspotMapping = useStore((s) => s.hubspotMapping);
  const pushToast = useStore((s) => s.pushToast);
  const jobs = useStore((s) => s.jobs);
  const [hsExpanded, setHsExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const connected = isHubspotConnected();
  const totalMappedFields = hubspotMapping.reduce((n, e) => n + e.fields.length, 0);

  async function onSyncNow() {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await syncFromHubspot();
      if (res.ok) {
        setLastResult(
          'Synced ' + res.contacts + ' contacts, ' + res.deals + ' deals, ' + res.serviceAreas + ' service areas.',
        );
        pushToast('HubSpot sync complete');
      } else if (res.errors.length) {
        setLastResult(res.errors[0]);
      }
      setLastSyncAt(res.finishedAt);
    } catch (err) {
      setLastResult(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function onTestPush() {
    const sample = jobs.find((j) => j.status === 'scheduled') ?? jobs[0];
    if (!sample) {
      setLastResult('No jobs to push.');
      return;
    }
    setPushing(true);
    setLastResult(null);
    try {
      const res = await pushJobToHubspot(sample);
      setLastResult(res.message);
      if (res.ok) pushToast('Pushed job ' + sample.id);
    } finally {
      setPushing(false);
    }
  }

  return (
    <>
      <div>
        <h3>Integrations</h3>
        <p className="muted small">Connect CRM, payroll, and mapping systems.</p>
      </div>

      <div className="integ-card">
        <div className="integ-logo">HS</div>
        <div style={{ flex: 1 }}>
          <div className="row">
            <h4 style={{ fontSize: 15 }}>HubSpot</h4>
            {connected
              ? <span className="badge badge-onsite">Connected</span>
              : <span className="badge badge-scheduled">Disconnected</span>}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {connected
              ? 'Jetson portal 21424670 (na1). ' + totalMappedFields + ' fields mapped'
                + (lastSyncAt ? ' · last sync ' + new Date(lastSyncAt).toLocaleTimeString() : ' · never synced')
              : 'Set VITE_HUBSPOT_TOKEN in your .env to enable Sync and Test push.'}
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
        <button className="btn btn-ghost btn-sm" onClick={onSyncNow} disabled={!connected || syncing}>
          <Icon name="refresh" size={12} /> {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onTestPush} disabled={!connected || pushing}>
          <Icon name="arrow_right" size={12} /> {pushing ? 'Pushing…' : 'Test push'}
        </button>
      </div>
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
