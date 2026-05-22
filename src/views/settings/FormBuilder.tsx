import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JobTypeTag } from '../../components/JobTypeTag';
import { JOB_TYPES } from '../../data/seed';
import { useStore } from '../../store';
import type {
  ChecklistItem,
  ChecklistItemType,
  ChecklistMulti,
  ChecklistNumber,
  ChecklistPhoto,
  ChecklistSection,
  ChecklistSingle,
} from '../../types';

const FIELD_TYPES: Record<ChecklistItemType, { label: string; icon: IconName }> = {
  checkbox:  { label: 'Yes / No',           icon: 'check' },
  text:      { label: 'Short text',         icon: 'info' },
  longtext:  { label: 'Long text / Notes',  icon: 'info' },
  number:    { label: 'Number',             icon: 'info' },
  single:    { label: 'Single select',      icon: 'chevron_down' },
  multi:     { label: 'Multi-select',       icon: 'layers' },
  photo:     { label: 'Photo',              icon: 'grid' },
  signature: { label: 'Customer signature', icon: 'user' },
  rating:    { label: 'Star rating',        icon: 'sparkle' },
};

function makeId(): string {
  return 'ck-' + Math.random().toString(36).slice(2, 9);
}

function makeItem(type: ChecklistItemType): ChecklistItem {
  const base = { id: makeId(), label: 'New ' + FIELD_TYPES[type].label.toLowerCase(), required: false } as const;
  switch (type) {
    case 'checkbox':
      return { ...base, type };
    case 'text':
    case 'longtext':
      return { ...base, type, placeholder: '' };
    case 'number':
      return { ...base, type, unit: '' };
    case 'single':
      return { ...base, type, options: ['Option 1', 'Option 2'] };
    case 'multi':
      return { ...base, type, options: ['Option 1', 'Option 2'] };
    case 'photo':
      return { ...base, type, minPhotos: 1 };
    case 'signature':
      return { ...base, type };
    case 'rating':
      return { ...base, type };
  }
}

function castItem(prev: ChecklistItem, type: ChecklistItemType): ChecklistItem {
  if (prev.type === type) return prev;
  const next = makeItem(type);
  return { ...next, label: prev.label, required: prev.required };
}

function hasOptions(it: ChecklistItem): it is ChecklistSingle | ChecklistMulti {
  return it.type === 'single' || it.type === 'multi';
}
function isPhoto(it: ChecklistItem): it is ChecklistPhoto {
  return it.type === 'photo';
}
function isNumber(it: ChecklistItem): it is ChecklistNumber {
  return it.type === 'number';
}

export function FormBuilder() {
  const checklists = useStore((s) => s.checklists);
  const setChecklist = useStore((s) => s.setChecklist);
  const pushToast = useStore((s) => s.pushToast);

  const editableTypes = useMemo(
    () => Object.keys(JOB_TYPES).filter((k) => checklists[k]),
    [checklists],
  );
  const [editType, setEditType] = useState<string>(editableTypes[0] ?? 'heatpump');
  const liveSections = checklists[editType] ?? [];
  const [draft, setDraft] = useState<ChecklistSection[] | null>(null);
  const sections = draft ?? liveSections;
  const [activeIdx, setActiveIdx] = useState<number>(0);

  useEffect(() => {
    setDraft(null);
    setActiveIdx(0);
  }, [editType]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const required = sections.reduce((n, s) => n + s.items.filter((i) => i.required).length, 0);
  const isDirty = draft !== null;
  const active = sections[activeIdx];

  function commitDraft(next: ChecklistSection[]) {
    setDraft(next);
  }
  function patchSection(idx: number, patch: Partial<ChecklistSection>) {
    commitDraft(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addSection() {
    commitDraft([...sections, { section: 'New section', items: [] }]);
    setActiveIdx(sections.length);
  }
  function removeSection(idx: number) {
    const next = sections.filter((_, i) => i !== idx);
    commitDraft(next);
    if (activeIdx >= next.length) setActiveIdx(Math.max(0, next.length - 1));
  }
  function addItem(type: ChecklistItemType) {
    if (!active) return;
    const next = sections.map((s, i) =>
      i === activeIdx ? { ...s, items: [...s.items, makeItem(type)] } : s,
    );
    commitDraft(next);
  }
  function patchItem(idx: number, item: ChecklistItem) {
    if (!active) return;
    const nextItems = active.items.map((it, i) => (i === idx ? item : it));
    commitDraft(sections.map((s, i) => (i === activeIdx ? { ...s, items: nextItems } : s)));
  }
  function removeItem(idx: number) {
    if (!active) return;
    const nextItems = active.items.filter((_, i) => i !== idx);
    commitDraft(sections.map((s, i) => (i === activeIdx ? { ...s, items: nextItems } : s)));
  }
  function save() {
    if (!draft) return;
    setChecklist(editType, draft);
    setDraft(null);
    pushToast('Completion form saved');
  }
  function cancel() {
    setDraft(null);
  }

  const noForm = !checklists[editType] && !draft;

  return (
    <>
      <div>
        <h3>Completion forms</h3>
        <p className="muted small" style={{ marginTop: 4 }}>
          Customize the checklist a tech must complete to close a job. Required fields gate job completion.
        </p>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(JOB_TYPES).map(([k, jt]) => {
          const has = Boolean(checklists[k]);
          return (
            <button
              key={k}
              className={'filter-chip ' + (editType === k ? 'active' : '')}
              onClick={() => setEditType(k)}
              title={has ? '' : 'No form for this job type'}
            >
              <span className="dot" style={{ background: 'var(--' + jt.color + ')' }} />
              {jt.label}
              {!has && <span className="muted" style={{ marginLeft: 6 }}>—</span>}
            </button>
          );
        })}
      </div>

      {noForm ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="info" size={28} stroke="var(--mid-gray)" />
          </div>
          <div className="h4">No form for this job type</div>
          <div className="muted small">Add a form below to get started.</div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => setDraft([{ section: 'New section', items: [] }])}
          >
            <Icon name="plus" size={12} /> Create form for {JOB_TYPES[editType]?.label ?? editType}
          </button>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: -8 }}>
            <JobTypeTag type={editType} size="lg" />
            <div>
              <div style={{ fontFamily: 'var(--font-subhead)', fontWeight: 700, fontSize: 14 }}>
                {JOB_TYPES[editType]?.label ?? editType} · completion form
              </div>
              <div className="muted small">
                {total} fields · {required} required · {sections.length} section{sections.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="topbar-spacer" />
            <button className="btn btn-outline btn-sm" onClick={cancel} disabled={!isDirty}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!isDirty}>
              <Icon name="check" size={12} /> Save
            </button>
          </div>

          <div className="form-builder">
            <div className="form-builder-sections">
              <div className="eyebrow-sm" style={{ padding: '4px 0 8px' }}>Sections</div>
              {sections.map((s, idx) => (
                <button
                  key={idx}
                  className={'form-builder-section-btn' + (idx === activeIdx ? ' active' : '')}
                  onClick={() => setActiveIdx(idx)}
                >
                  <Icon name="layers" size={13} />
                  <span>{s.section}</span>
                  <span className="muted small" style={{ marginLeft: 'auto' }}>{s.items.length}</span>
                </button>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6, justifyContent: 'flex-start' }}
                onClick={addSection}
              >
                <Icon name="plus" size={12} /> Add section
              </button>
            </div>

            <div className="form-builder-fields">
              {active ? (
                <>
                  <div className="row" style={{ marginBottom: 12 }}>
                    <input
                      className="input"
                      value={active.section}
                      onChange={(e) => patchSection(activeIdx, { section: e.target.value })}
                      style={{ fontWeight: 700, fontSize: 15, flex: 1 }}
                    />
                    <button className="btn btn-outline btn-sm" onClick={() => removeSection(activeIdx)}>
                      <Icon name="x" size={12} /> Delete section
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {active.items.map((f, i) => (
                      <ItemRow
                        key={f.id}
                        item={f}
                        onChange={(next) => patchItem(i, next)}
                        onRemove={() => removeItem(i)}
                      />
                    ))}
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <div className="muted small">Quick add:</div>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginLeft: 6 }}>
                      {(Object.entries(FIELD_TYPES) as Array<[ChecklistItemType, { label: string; icon: IconName }]>).map(
                        ([k, t]) => (
                          <button key={k} className="filter-chip" onClick={() => addItem(k)}>
                            <Icon name={t.icon} size={12} />
                            {t.label}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="topbar-spacer" />
                    <span className="muted small">
                      {active.items.filter((f) => f.required).length} required · {active.items.length} total
                    </span>
                  </div>
                </>
              ) : (
                <div className="muted small">Select or add a section to edit its fields.</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

interface ItemRowProps {
  item: ChecklistItem;
  onChange: (next: ChecklistItem) => void;
  onRemove: () => void;
}

function ItemRow({ item, onChange, onRemove }: ItemRowProps) {
  function setLabel(label: string) {
    onChange({ ...item, label });
  }
  function setRequired(required: boolean) {
    onChange({ ...item, required });
  }
  function setType(type: ChecklistItemType) {
    onChange(castItem(item, type));
  }
  function setOptionsString(text: string) {
    if (!hasOptions(item)) return;
    onChange({ ...item, options: text.split(',').map((s) => s.trim()).filter(Boolean) });
  }
  function setMinPhotos(n: number) {
    if (!isPhoto(item)) return;
    onChange({ ...item, minPhotos: n });
  }
  function setNumberMeta(patch: Partial<ChecklistNumber>) {
    if (!isNumber(item)) return;
    onChange({ ...item, ...patch });
  }

  return (
    <>
      <div className="builder-field-row">
        <Icon name="drag" size={14} stroke="var(--mid-gray)" />
        <select
          className="select"
          style={{ width: 160, flexShrink: 0 }}
          value={item.type}
          onChange={(e) => setType(e.target.value as ChecklistItemType)}
        >
          {(Object.entries(FIELD_TYPES) as Array<[ChecklistItemType, { label: string; icon: IconName }]>).map(
            ([k, t]) => (
              <option key={k} value={k}>
                {t.label}
              </option>
            ),
          )}
        </select>
        <input
          className="input"
          value={item.label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ flex: 1 }}
        />
        <label className="row small" style={{ flexShrink: 0 }}>
          <input type="checkbox" checked={item.required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
        <IconButton icon="x" label="Remove field" onClick={onRemove} />
      </div>

      {hasOptions(item) && (
        <div className="builder-field-row options-row">
          <span className="eyebrow-sm" style={{ minWidth: 84 }}>Options</span>
          <input
            className="input"
            value={item.options.join(', ')}
            onChange={(e) => setOptionsString(e.target.value)}
            placeholder="Comma-separated options"
            style={{ flex: 1 }}
          />
        </div>
      )}
      {isPhoto(item) && (
        <div className="builder-field-row options-row">
          <span className="eyebrow-sm" style={{ minWidth: 84 }}>Min photos</span>
          <input
            className="input"
            type="number"
            min={0}
            value={item.minPhotos ?? 0}
            onChange={(e) => setMinPhotos(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </div>
      )}
      {isNumber(item) && (
        <div className="builder-field-row options-row">
          <span className="eyebrow-sm" style={{ minWidth: 84 }}>Unit</span>
          <input
            className="input"
            value={item.unit ?? ''}
            onChange={(e) => setNumberMeta({ unit: e.target.value })}
            placeholder="e.g. °F"
            style={{ width: 120 }}
          />
          <span className="eyebrow-sm">Min</span>
          <input
            className="input"
            type="number"
            value={item.min ?? ''}
            onChange={(e) => setNumberMeta({ min: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{ width: 90 }}
          />
          <span className="eyebrow-sm">Max</span>
          <input
            className="input"
            type="number"
            value={item.max ?? ''}
            onChange={(e) => setNumberMeta({ max: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{ width: 90 }}
          />
        </div>
      )}
    </>
  );
}
