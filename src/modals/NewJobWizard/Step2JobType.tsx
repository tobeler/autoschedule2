// =============================================================
// Step 2 — Job type picker + inline TemplateBuilder.
// Grid of job-type cards (swatch + name + duration · role count).
// A header "+ New template" button (NOT a card) opens the builder.
// Saved templates are persisted via useStore().updateTemplate().
// =============================================================
import { useMemo } from 'react';

import { Icon } from '../../components/Icon';
import { JobTypeTag } from '../../components/JobTypeTag';
import { ROLES, JOB_TYPES } from '../../data/seed';
import { useStore } from '../../store';
import type { JobSlot, JobTemplate } from '../../types';

import {
  TemplateBuilder,
  makeBlankTemplateDraft,
  registerCustomJobType,
  type TemplateDraft,
} from './TemplateBuilder';

interface Step2JobTypeProps {
  type: string | null;
  onType: (k: string) => void;
  draft: TemplateDraft | null;
  onDraft: (d: TemplateDraft | null) => void;
}

export function Step2JobType({ type, onType, draft, onDraft }: Step2JobTypeProps) {
  const templates = useStore((s) => s.templates);
  const updateTemplate = useStore((s) => s.updateTemplate);
  const pushToast = useStore((s) => s.pushToast);

  // Slots derived from the active template (built-in or custom)
  const previewSlots: JobSlot[] = useMemo(() => {
    if (!type) return [];
    const tpl = templates[type];
    if (!tpl) return [];
    return tpl.slots.map((s, i) => ({
      id: 'preview-' + i,
      role: s.role,
      level: s.level,
      hours: s.hours,
      start: s.start,
      optional: s.optional,
      assignedTo: null,
    }));
  }, [type, templates]);

  function startCustomTemplate() {
    onDraft(makeBlankTemplateDraft());
  }

  function saveCustomTemplate() {
    if (!draft) return;
    if (!draft.label.trim() || draft.slots.length === 0) return;
    const id = 'custom_' + Date.now().toString(36);
    registerCustomJobType(id, draft);
    const tpl: JobTemplate & { custom?: boolean } = {
      label: draft.label,
      slots: draft.slots.map((s) => ({ ...s })),
      truckCount: 1,
    };
    // Mark the template as custom for downstream display via a non-typed extra.
    (tpl as { custom?: boolean }).custom = true;
    updateTemplate(id, tpl);
    onType(id);
    onDraft(null);
    pushToast('Saved template · ' + draft.label);
  }

  if (draft) {
    return (
      <TemplateBuilder
        draft={draft}
        onChange={onDraft}
        onSave={saveCustomTemplate}
        onCancel={() => onDraft(null)}
      />
    );
  }

  // Build the list of selectable job types — built-ins from JOB_TYPES plus
  // any custom templates the user has saved in the store that lack a definition.
  const entries: Array<{ key: string; label: string; color: string; isCustom: boolean }> = [];
  Object.entries(JOB_TYPES).forEach(([k, jt]) => {
    entries.push({
      key: k,
      label: jt.label,
      color: jt.color,
      isCustom: !!(templates[k] as JobTemplate & { custom?: boolean })?.custom,
    });
  });
  // Pick up store templates that aren't in JOB_TYPES (e.g. custom_*).
  Object.entries(templates).forEach(([k, tpl]) => {
    if (JOB_TYPES[k]) return;
    entries.push({
      key: k,
      label: tpl.label,
      color: (tpl as JobTemplate & { color?: string }).color || 'jt-retrofit',
      isCustom: true,
    });
  });

  return (
    <>
      <div className="wiz-section-head">
        <div>
          <div className="eyebrow-sm">Job type</div>
          <div className="muted small">
            Pick a template — its required roles drive availability suggestions next.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={startCustomTemplate}
        >
          <Icon name="plus" size={12} /> New template
        </button>
      </div>

      <div className="wiz-type-grid">
        {entries.map(({ key, label, color, isCustom }) => {
          const tpl = templates[key];
          const slotCount = tpl?.slots.length ?? 0;
          const duration = Math.max(
            ...(tpl?.slots ?? []).map((s) => (s.start || 0) + s.hours),
            1,
          );
          const selected = type === key;
          return (
            <button
              key={key}
              type="button"
              className={'wiz-type-card' + (selected ? ' selected' : '')}
              onClick={() => onType(key)}
            >
              <span
                className="wiz-type-swatch"
                style={{ background: 'var(--' + color + ')' }}
              ></span>
              <span className="wiz-type-name">{label}</span>
              <span className="wiz-type-meta">
                <Icon name="clock" size={10} />
                <span>
                  {duration}h <span className="wiz-type-meta-sep">·</span> {slotCount} role{slotCount === 1 ? '' : 's'}
                </span>
              </span>
              {isCustom && <span className="wiz-type-badge">CUSTOM</span>}
              {selected && (
                <span className="wiz-type-check">
                  <Icon name="check" size={11} stroke="var(--off-white)" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected-template preview */}
      {type && (
        <div className="wiz-type-preview">
          <div className="row" style={{ marginBottom: 10 }}>
            <JobTypeTag type={type} size="lg" />
            <h4 style={{ fontFamily: 'var(--font-subhead)', fontSize: 14, margin: 0 }}>
              {templates[type]?.label ?? type}
            </h4>
            {(templates[type] as JobTemplate & { custom?: boolean })?.custom && (
              <span
                className="badge"
                style={{ background: 'rgba(60,213,103,0.18)', color: '#1A6F2E' }}
              >
                Just created
              </span>
            )}
            <span
              className="muted small"
              style={{ marginLeft: 'auto' }}
            >
              {previewSlots.length} required slot{previewSlots.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="wiz-type-preview-slots">
            {previewSlots.map((slot, i) => {
              const role = ROLES[slot.role];
              return (
                <div key={i} className="wiz-type-preview-slot">
                  <span className="wiz-type-preview-slot-num">{i + 1}</span>
                  <span style={{ fontWeight: 600 }}>{role?.label ?? slot.role}</span>
                  <span className="tag">{slot.level}</span>
                  <span className="muted small" style={{ marginLeft: 'auto' }}>
                    {slot.hours}h
                    {slot.start > 0 ? ' from +' + slot.start + 'h' : ''}
                    {slot.optional ? ' · opt' : ''}
                  </span>
                </div>
              );
            })}
            {previewSlots.length === 0 && (
              <div className="muted small" style={{ padding: 8 }}>
                Ad-hoc — composition decided at scheduling.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
