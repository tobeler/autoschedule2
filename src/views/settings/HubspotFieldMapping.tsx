import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import type {
  HubspotEntityMapping,
  HubspotFieldMap,
} from '../../types';
import {
  DEFAULT_HUBSPOT_MAPPINGS,
  ENTITY_LABELS,
  FSM_FIELDS,
  type FsmFieldDef,
} from '../../integrations/hubspot/field-map-defaults';
import schemaSnapshotData from '../../integrations/hubspot/schema-snapshot.json';

// ---------- Schema snapshot (typed) ------------------------------------------
interface SnapshotProperty {
  name: string;
  label?: string;
  type?: string;
  fieldType?: string;
  description?: string;
  hubspotDefined?: boolean;
  calculated?: boolean;
  readOnlyValue?: boolean;
  options?: Array<{ label: string; value: string }>;
}
interface SnapshotObjectGroup {
  objectType: string;
  properties: SnapshotProperty[];
}
interface SchemaSnapshot {
  account: { portalId: number; timeZone: string; companyCurrency: string };
  contacts: SnapshotObjectGroup;
  deals: SnapshotObjectGroup;
  customObjects: Record<string, SnapshotObjectGroup>;
}
const snapshot = schemaSnapshotData as unknown as SchemaSnapshot;

// ---------- Type badge styling ----------------------------------------------
type Entity = HubspotEntityMapping['entity'];
type Direction = HubspotFieldMap['direction'];

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  string:      { label: 'TEXT', color: 'var(--fg-muted)' },
  text:        { label: 'TEXT', color: 'var(--fg-muted)' },
  longtext:    { label: 'TEXT', color: 'var(--fg-muted)' },
  number:      { label: '123',  color: 'var(--fg-muted)' },
  currency:    { label: '$',    color: '#1A6F2E' },
  date:        { label: 'DATE', color: '#2A6FDB' },
  datetime:    { label: 'DATE', color: '#2A6FDB' },
  time:        { label: 'TIME', color: '#2A6FDB' },
  bool:        { label: 'BOOL', color: '#1A6F2E' },
  boolean:     { label: 'BOOL', color: '#1A6F2E' },
  enumeration: { label: 'ENUM', color: '#8A5500' },
  enum:        { label: 'ENUM', color: '#8A5500' },
  ref:         { label: 'REF',  color: '#6B5BCF' },
  id:          { label: 'ID',   color: 'var(--fg-muted)' },
  json:        { label: 'JSON', color: '#6B5BCF' },
  phone_number:{ label: 'TEL',  color: 'var(--fg-muted)' },
};

const ENTITY_ORDER: Entity[] = ['contact', 'deal', 'job', 'service_area'];

interface HsField {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  readonly: boolean;
}

function getHubspotFields(entity: Entity): HsField[] {
  let props: SnapshotProperty[] = [];
  if (entity === 'contact') props = snapshot.contacts.properties;
  else if (entity === 'deal') props = snapshot.deals.properties;
  else if (entity === 'job') props = snapshot.customObjects.jobs?.properties ?? [];
  else props = snapshot.customObjects.service_areas?.properties ?? [];
  return props
    .filter((p) => !p.calculated)
    .map((p) => ({
      name: p.name,
      label: p.label ?? p.name,
      type: p.type ?? 'string',
      custom: !p.hubspotDefined,
      readonly: Boolean(p.readOnlyValue),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function typeCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const groups = [
    ['string', 'text', 'longtext', 'enum', 'enumeration', 'id', 'url', 'phone_number'],
    ['number', 'currency'],
    ['date', 'datetime'],
    ['time', 'number'],
    ['bool', 'boolean', 'enum', 'enumeration'],
    ['json'],
    ['ref'],
  ];
  return groups.some((g) => g.includes(a) && g.includes(b));
}

function nextDirection(d: Direction): Direction {
  if (d === 'push') return 'pull';
  if (d === 'pull') return 'both';
  return 'push';
}

function dirGlyph(d: Direction): string {
  if (d === 'push') return '→ PUSH';
  if (d === 'pull') return '← PULL';
  return '↔ BOTH';
}

function ensureAllEntities(saved: HubspotEntityMapping[]): HubspotEntityMapping[] {
  return ENTITY_ORDER.map((entity) => {
    const found = saved.find((e) => e.entity === entity);
    if (found) return found;
    return DEFAULT_HUBSPOT_MAPPINGS.find((e) => e.entity === entity) ?? { entity, fields: [] };
  });
}

export function HubspotFieldMapping() {
  const stored = useStore((s) => s.hubspotMapping);
  const save = useStore((s) => s.setHubspotMapping);
  const pushToast = useStore((s) => s.pushToast);

  const [mapping, setMapping] = useState<HubspotEntityMapping[]>(() => ensureAllEntities(stored));
  const [entity, setEntity] = useState<Entity>('contact');
  const [search, setSearch] = useState('');
  const [syncedJustNow, setSyncedJustNow] = useState(false);

  useEffect(() => {
    if (stored.length === 0) {
      save(mapping);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stored.length === 0) return;
    setMapping(ensureAllEntities(stored));
  }, [stored]);

  const fsmFields: FsmFieldDef[] = FSM_FIELDS[entity];
  const hsFields: HsField[] = useMemo(() => getHubspotFields(entity), [entity]);
  const currentEntity = mapping.find((m) => m.entity === entity)!;
  const rows = currentEntity.fields;

  function patchEntity(next: HubspotFieldMap[]) {
    setMapping((m) =>
      m.map((e) => (e.entity === entity ? { ...e, fields: next } : e)),
    );
  }

  function update(i: number, patch: Partial<HubspotFieldMap>) {
    patchEntity(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function add() {
    patchEntity([...rows, { appField: '', hsField: '', direction: 'both' }]);
  }
  function remove(i: number) {
    patchEntity(rows.filter((_, j) => j !== i));
  }
  function resetToDefault() {
    setMapping(DEFAULT_HUBSPOT_MAPPINGS.map((e) => ({ ...e, fields: e.fields.map((f) => ({ ...f })) })));
    pushToast('Field mapping reset to Jetson defaults');
  }
  function commitSave() {
    save(mapping);
    pushToast('HubSpot field mapping saved');
  }
  function testSync() {
    setSyncedJustNow(true);
    setTimeout(() => setSyncedJustNow(false), 2400);
  }

  const unmappedRequired = fsmFields.filter((f) => f.required && !rows.some((r) => r.appField === f.key));
  const filteredRows = search
    ? rows.map((r, i) => ({ r, i })).filter(({ r }) => {
        const a = fsmFields.find((f) => f.key === r.appField)?.label ?? '';
        const b = hsFields.find((f) => f.name === r.hsField)?.label ?? '';
        return (a + ' ' + b + ' ' + r.appField + ' ' + r.hsField).toLowerCase().includes(search.toLowerCase());
      })
    : rows.map((r, i) => ({ r, i }));

  return (
    <div className="hs-mapper">
      <div className="hs-mapper-header">
        <div className="row" style={{ gap: 10 }}>
          <div className="integ-logo">HS</div>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <h4 style={{ fontSize: 15 }}>HubSpot field mapping</h4>
              <span
                className="badge"
                style={{ background: 'var(--bg-muted)', color: 'var(--fg-muted)', fontSize: 9 }}
              >
                ADMIN
              </span>
            </div>
            <div className="muted small" style={{ marginTop: 2 }}>
              Pre-populated with Jetson&apos;s portal (21424670). Direction governs whether values push, pull, or both.
            </div>
          </div>
          <div className="topbar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={resetToDefault} title="Restore default mappings">
            Reset
          </button>
          <button className="btn btn-outline btn-sm" onClick={commitSave}>
            <Icon name="check" size={12} /> Save
          </button>
          <button
            className={'btn btn-sm ' + (syncedJustNow ? 'btn-outline' : 'btn-primary')}
            onClick={testSync}
          >
            {syncedJustNow ? (
              <>
                <Icon name="check" size={12} stroke="var(--jetson-green)" /> Synced
              </>
            ) : (
              <>
                <Icon name="refresh" size={12} /> Test sync
              </>
            )}
          </button>
        </div>
      </div>

      <div className="hs-mapper-tabs">
        {ENTITY_ORDER.map((k) => {
          const label = ENTITY_LABELS[k];
          const count = mapping.find((m) => m.entity === k)?.fields.length ?? 0;
          return (
            <button
              key={k}
              className={'hs-mapper-tab' + (entity === k ? ' active' : '')}
              onClick={() => setEntity(k)}
            >
              <Icon name={label.icon as IconName} size={13} />
              <span>
                <strong>{label.app}</strong> <span className="muted small">↔ {label.hs}</span>
              </span>
              <span className="hs-mapper-tab-count">{count}</span>
            </button>
          );
        })}
        <div className="topbar-spacer" />
        <div className="search" style={{ minWidth: 180, background: 'var(--surface-card)' }}>
          <Icon name="search" size={12} />
          <input
            placeholder="Filter mappings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {unmappedRequired.length > 0 && (
        <div className="hs-mapper-warn">
          <Icon name="alert_circle" size={14} stroke="#C53030" strokeWidth={2.5} />
          <span>
            <strong>
              {unmappedRequired.length} required {ENTITY_LABELS[entity].app.toLowerCase()} field
              {unmappedRequired.length === 1 ? '' : 's'}
            </strong>{' '}
            not mapped: {unmappedRequired.map((f) => f.label).join(', ')}. Records won&apos;t sync without these.
          </span>
        </div>
      )}

      <div className="hs-mapper-table">
        <div className="hs-mapper-row hs-mapper-thead">
          <div className="hs-mapper-h">FSM ({ENTITY_LABELS[entity].app})</div>
          <div className="hs-mapper-h-dir">Direction</div>
          <div className="hs-mapper-h">HubSpot ({ENTITY_LABELS[entity].hs})</div>
          <div className="hs-mapper-h" />
        </div>

        {filteredRows.map(({ r, i }) => {
          const fsmField = fsmFields.find((f) => f.key === r.appField);
          const hsField = hsFields.find((f) => f.name === r.hsField);
          const sdType = fsmField?.type;
          const hsType = hsField?.type;
          const compatible = typeCompatible(sdType, hsType);
          const incomplete = !r.appField || !r.hsField;
          const sdBadge = sdType ? TYPE_BADGES[sdType] : undefined;
          const hsBadge = hsType ? TYPE_BADGES[hsType] : undefined;

          return (
            <div
              key={i}
              className={
                'hs-mapper-row' +
                (incomplete ? ' incomplete' : '') +
                (!compatible && !incomplete ? ' incompatible' : '')
              }
            >
              <div className="hs-mapper-cell">
                <select
                  className="select"
                  value={r.appField}
                  onChange={(e) => update(i, { appField: e.target.value })}
                >
                  <option value="">— Select field —</option>
                  {fsmFields.map((f) => (
                    <option
                      key={f.key}
                      value={f.key}
                      disabled={rows.some((rr, j) => j !== i && rr.appField === f.key)}
                    >
                      {f.label}
                      {f.required ? ' *' : ''}
                      {f.readonly ? ' (read-only)' : ''}
                    </option>
                  ))}
                </select>
                {sdBadge && (
                  <span className="hs-mapper-typebadge" style={{ color: sdBadge.color }}>
                    {sdBadge.label}
                  </span>
                )}
              </div>

              <div className="hs-mapper-cell hs-mapper-dir-cell">
                <button
                  className={'hs-mapper-dir hs-mapper-dir-' + r.direction}
                  onClick={() => update(i, { direction: nextDirection(r.direction) })}
                  title={
                    r.direction === 'push'
                      ? 'Push only: FSM → HubSpot'
                      : r.direction === 'pull'
                      ? 'Pull only: HubSpot → FSM'
                      : 'Bidirectional: both ways'
                  }
                >
                  {dirGlyph(r.direction)}
                </button>
              </div>

              <div className="hs-mapper-cell">
                <select
                  className="select"
                  value={r.hsField}
                  onChange={(e) => update(i, { hsField: e.target.value })}
                >
                  <option value="">— Select field —</option>
                  {hsFields.map((f) => (
                    <option
                      key={f.name}
                      value={f.name}
                      disabled={rows.some((rr, j) => j !== i && rr.hsField === f.name)}
                    >
                      {f.label}
                      {f.custom ? ' (custom)' : ''}
                      {f.readonly ? ' (read-only)' : ''}
                    </option>
                  ))}
                </select>
                {hsBadge && (
                  <span className="hs-mapper-typebadge" style={{ color: hsBadge.color }}>
                    {hsBadge.label}
                  </span>
                )}
                {hsField?.custom && <span className="hs-mapper-custom-badge">CUSTOM</span>}
              </div>

              <div className="hs-mapper-cell hs-mapper-actions">
                {incomplete && (
                  <span className="hs-mapper-status warn" title="Mapping incomplete">
                    <Icon name="alert_circle" size={12} stroke="#8A5500" />
                  </span>
                )}
                {!incomplete && !compatible && (
                  <span
                    className="hs-mapper-status warn"
                    title={sdType + ' may not convert cleanly to ' + hsType}
                  >
                    <Icon name="alert_circle" size={12} stroke="#8A5500" />
                  </span>
                )}
                {!incomplete && compatible && (
                  <span className="hs-mapper-status ok" title="Mapping ready">
                    <Icon name="check" size={12} stroke="var(--jetson-green)" strokeWidth={2.5} />
                  </span>
                )}
                <IconButton icon="x" label="Remove" onClick={() => remove(i)} />
              </div>
            </div>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="hs-mapper-empty">
            <span className="muted small">No mappings match &ldquo;{search}&rdquo;.</span>
          </div>
        )}
      </div>

      <div className="hs-mapper-footer">
        <button className="btn btn-outline btn-sm" onClick={add}>
          <Icon name="plus" size={12} /> Add mapping
        </button>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          <Icon name="info" size={11} /> {rows.filter((r) => r.appField && r.hsField).length} active ·{' '}
          {fsmFields.length - rows.filter((r) => r.appField).length} FSM fields unmapped ·{' '}
          {hsFields.length} HubSpot fields available
        </span>
      </div>

      <details className="hs-mapper-ref">
        <summary>
          Field reference ({fsmFields.length} FSM fields · {hsFields.length} HubSpot fields)
        </summary>
        <div className="hs-mapper-ref-grid">
          <div>
            <div className="eyebrow-sm" style={{ marginBottom: 6 }}>FSM</div>
            {fsmFields.map((f) => (
              <div key={f.key} className="hs-mapper-ref-item">
                <span className="mono" style={{ fontSize: 11 }}>{f.key}</span>
                <span className="muted small" style={{ marginLeft: 'auto' }}>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="eyebrow-sm" style={{ marginBottom: 6 }}>HubSpot</div>
            {hsFields.slice(0, 60).map((f) => (
              <div key={f.name} className="hs-mapper-ref-item">
                <span className="mono" style={{ fontSize: 11 }}>{f.name}</span>
                <span className="muted small" style={{ marginLeft: 'auto' }}>
                  {f.label}
                  {f.custom ? ' (custom)' : ''}
                </span>
              </div>
            ))}
            {hsFields.length > 60 && (
              <div className="muted small" style={{ padding: '4px 8px' }}>
                + {hsFields.length - 60} more — filter above to search.
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
