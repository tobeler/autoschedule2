// =============================================================
// TemplateBuilder — inline custom job-type editor opened from Step 2.
// Renders a name + short tag + color swatch picker plus a list of
// editable slot rows (role / level / hours / start offset / optional).
// On save, persists via useStore().updateTemplate() and registers a
// JobTypeDef in the local JOB_TYPES map (best-effort — see note below).
// =============================================================
import type { ChangeEvent } from 'react';

import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { ROLES, JOB_TYPES } from '../../data/seed';
import type { Level, RoleKey, TemplateSlot } from '../../types';

export interface TemplateDraft {
  label: string;
  short: string;
  /** CSS var name like 'jt-retrofit' */
  color: string;
  slots: TemplateSlot[];
}

interface TemplateBuilderProps {
  draft: TemplateDraft;
  onChange: (d: TemplateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

const COLOR_OPTIONS: Array<{ value: string; name: string }> = [
  { value: 'jt-heatpump', name: 'Green' },
  { value: 'jt-water', name: 'Blue' },
  { value: 'jt-electrical', name: 'Amber' },
  { value: 'jt-warranty', name: 'Orange' },
  { value: 'jt-walkthrough', name: 'Indigo' },
  { value: 'jt-callback', name: 'Red' },
  { value: 'jt-retrofit', name: 'Lime' },
  { value: 'jt-service', name: 'Fern' },
];

const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export function TemplateBuilder({ draft, onChange, onSave, onCancel }: TemplateBuilderProps) {
  function updateSlot(i: number, patch: Partial<TemplateSlot>) {
    onChange({
      ...draft,
      slots: draft.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  }
  function addSlot() {
    onChange({
      ...draft,
      slots: [
        ...draft.slots,
        { role: 'hvac_installer', level: 'L1', hours: 4, start: 0, optional: false },
      ],
    });
  }
  function removeSlot(i: number) {
    onChange({
      ...draft,
      slots: draft.slots.filter((_, j) => j !== i),
    });
  }

  const valid = draft.label.trim().length > 0 && draft.slots.length > 0;

  return (
    <div className="template-editor">
      <div className="row" style={{ marginBottom: 12 }}>
        <span
          className="dot"
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: 'var(--' + draft.color + ')',
            display: 'inline-block',
          }}
        />
        <h4 style={{ fontFamily: 'var(--font-subhead)', fontSize: 14, margin: 0 }}>
          New job type template
        </h4>
        <span className="muted small">Saved to this org — usable on future jobs.</span>
        <div className="topbar-spacer"></div>
        <IconButton icon="x" label="Cancel" variant="ghost" onClick={onCancel} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1.4fr',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div className="field">
          <label className="label">Template name</label>
          <input
            className="input"
            placeholder="e.g. Mini-split install"
            autoFocus
            value={draft.label}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...draft, label: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label className="label">Short tag</label>
          <input
            className="input"
            placeholder="Mini-split"
            value={draft.short}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...draft, short: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label className="label">Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...draft, color: opt.value })}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: 'var(--' + opt.value + ')',
                  border:
                    draft.color === opt.value
                      ? '2px solid var(--forest)'
                      : '1px solid var(--border)',
                  cursor: 'pointer',
                  padding: 0,
                  boxShadow:
                    draft.color === opt.value
                      ? '0 0 0 2px rgba(60,213,103,0.3)'
                      : 'none',
                }}
                title={opt.name}
                aria-label={opt.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 6 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Required slots
        </span>
        <span className="muted small">
          Each row is a role that must be on site for some portion of the job.
        </span>
      </div>

      <div className="col" style={{ gap: 6 }}>
        {draft.slots.map((s, i) => {
          const levels = ROLES[s.role]?.levels ?? (['L1', 'L2', 'L3'] as Level[]);
          return (
            <div key={i} className="template-slot-row">
              <span className="num">{i + 1}</span>
              <select
                className="select"
                value={s.role}
                onChange={(e) =>
                  updateSlot(i, { role: e.target.value as RoleKey })
                }
              >
                {ROLE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ROLES[k].label}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={s.level}
                onChange={(e) => updateSlot(i, { level: e.target.value as Level })}
              >
                {levels.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}
                  </option>
                ))}
              </select>
              <div className="template-slot-num">
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={s.hours}
                  onChange={(e) =>
                    updateSlot(i, { hours: parseFloat(e.target.value) || 0 })
                  }
                />
                <span className="suffix">hrs</span>
              </div>
              <div className="template-slot-num">
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0"
                  value={s.start}
                  onChange={(e) =>
                    updateSlot(i, { start: parseFloat(e.target.value) || 0 })
                  }
                />
                <span className="suffix">offset</span>
              </div>
              <label className="template-slot-toggle">
                <input
                  type="checkbox"
                  checked={!!s.optional}
                  onChange={(e) => updateSlot(i, { optional: e.target.checked })}
                />
                <span>Optional</span>
              </label>
              <IconButton
                icon="x"
                label="Remove"
                variant="ghost"
                onClick={() => removeSlot(i)}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={addSlot}
        style={{ marginTop: 8 }}
      >
        <Icon name="plus" size={12} /> Add slot
      </button>

      <div
        className="row"
        style={{ marginTop: 16, justifyContent: 'flex-end', gap: 6 }}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={'btn btn-sm ' + (valid ? 'btn-primary' : 'btn-greige')}
          disabled={!valid}
          onClick={onSave}
        >
          <Icon name="check" size={12} /> Save template
        </button>
      </div>
    </div>
  );
}

/** Build a fresh draft. */
export function makeBlankTemplateDraft(): TemplateDraft {
  return {
    label: '',
    short: '',
    color: 'jt-retrofit',
    slots: [{ role: 'hvac_lead', level: 'L2', hours: 4, start: 0, optional: false }],
  };
}

/** Side-effect helper that registers a saved template into JOB_TYPES (best-effort). */
export function registerCustomJobType(key: string, draft: TemplateDraft): void {
  const short = draft.short.trim() || draft.label.split(' ').slice(0, 2).join(' ');
  JOB_TYPES[key] = { label: draft.label, color: draft.color, short };
}
