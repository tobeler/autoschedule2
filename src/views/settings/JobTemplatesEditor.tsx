import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JobTypeTag } from '../../components/JobTypeTag';
import { JOB_TYPES, ROLES } from '../../data/seed';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import type { JobTemplate, RoleKey, Level, TemplateSlot } from '../../types';

const LEVELS: Level[] = ['L1', 'L2', 'L3'];

export function JobTemplatesEditor() {
  const templates = useStore((s) => s.templates);
  const updateTemplate = useStore((s) => s.updateTemplate);
  const removeTemplate = useStore((s) => s.removeTemplate);
  const jobs = useStore((s) => s.jobs);
  const pushToast = useStore((s) => s.pushToast);
  const keys = Object.keys(templates);
  const [editType, setEditType] = useState<string>(keys[0] ?? 'heatpump');
  const [draft, setDraft] = useState<JobTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const jobsUsingType = useMemo(
    () => jobs.filter((j) => j.type === editType),
    [jobs, editType],
  );
  // Block delete when this template's job type is referenced AND no other
  // template still covers it. Since templates are keyed by jobType, deleting
  // here always removes the only template for that type — so we block on any
  // job reference.
  const deleteBlocked = jobsUsingType.length > 0;

  const live = templates[editType];
  const editing = draft ?? live;
  if (!live) {
    return (
      <div className="empty">
        <div className="h4">No templates yet</div>
        <div className="muted small">Add one from the New-Job wizard.</div>
      </div>
    );
  }

  function patchSlot(idx: number, patch: Partial<TemplateSlot>) {
    if (!editing) return;
    const slots = editing.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setDraft({ ...editing, slots });
  }
  function removeSlot(idx: number) {
    if (!editing) return;
    setDraft({ ...editing, slots: editing.slots.filter((_, i) => i !== idx) });
  }
  function addSlot() {
    if (!editing) return;
    const next: TemplateSlot = { role: 'hvac_installer', level: 'L1', hours: 4, start: 0 };
    setDraft({ ...editing, slots: [...editing.slots, next] });
  }
  function patchTpl(patch: Partial<JobTemplate>) {
    if (!editing) return;
    setDraft({ ...editing, ...patch });
  }
  function save() {
    if (!draft) return;
    updateTemplate(editType, draft);
    setDraft(null);
    pushToast('Saved ' + draft.label);
  }
  function cancel() {
    setDraft(null);
  }

  const isDirty = draft !== null;
  const jobType = JOB_TYPES[editType];

  return (
    <>
      <div>
        <h3>Job templates</h3>
        <p className="muted small" style={{ marginTop: 4 }}>
          Define required crew composition per job type. Used to auto-suggest crews at scheduling time. All slots are editable per-job.
        </p>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {keys.map((k) => {
          const tpl = templates[k];
          const jt = JOB_TYPES[k];
          return (
            <button
              key={k}
              className={'filter-chip ' + (editType === k ? 'active' : '')}
              onClick={() => {
                setEditType(k);
                setDraft(null);
              }}
            >
              {jt && <span className="dot" style={{ background: 'var(--' + jt.color + ')' }}></span>}
              {tpl.label}
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          {jobType && <JobTypeTag type={editType} size="lg" />}
          <h4 style={{ marginLeft: 8 }}>{editing.label}</h4>
          <div className="topbar-spacer" />
          <button className="btn btn-outline btn-sm" onClick={addSlot}>
            <Icon name="plus" size={12} /> Add slot
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 80px 32px',
            gap: 8,
            padding: '0 8px',
            marginBottom: 6,
          }}
        >
          <span className="eyebrow-sm">Role</span>
          <span className="eyebrow-sm">Min level</span>
          <span className="eyebrow-sm">Hours</span>
          <span className="eyebrow-sm">Start (h)</span>
          <span className="eyebrow-sm">Optional</span>
          <span />
        </div>

        <div className="col">
          {editing.slots.map((slot, i) => (
            <div key={i} className="tpl-slot-row">
              <select
                className="select"
                value={slot.role}
                onChange={(e) => patchSlot(i, { role: e.target.value as RoleKey })}
              >
                {Object.entries(ROLES).map(([k, r]) => (
                  <option key={k} value={k}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={slot.level}
                onChange={(e) => patchSlot(i, { level: e.target.value as Level })}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={slot.hours}
                type="number"
                step="0.5"
                onChange={(e) => patchSlot(i, { hours: Number(e.target.value) })}
              />
              <input
                className="input"
                value={slot.start}
                type="number"
                step="0.5"
                onChange={(e) => patchSlot(i, { start: Number(e.target.value) })}
              />
              <input
                type="checkbox"
                checked={Boolean(slot.optional)}
                style={{ justifySelf: 'center' }}
                onChange={(e) => patchSlot(i, { optional: e.target.checked })}
              />
              <IconButton icon="x" label="Remove slot" onClick={() => removeSlot(i)} />
            </div>
          ))}
          {editing.slots.length === 0 && (
            <div
              className="muted small"
              style={{ padding: 16, textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: 8 }}
            >
              No required slots — composition is fully ad-hoc per job (e.g. meeting / training).
            </div>
          )}
        </div>

        <div className="divider" />
        <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
          <div className="field">
            <span className="eyebrow-sm">Truck count</span>
            <input
              className="input"
              type="number"
              value={editing.truckCount}
              onChange={(e) => patchTpl({ truckCount: Number(e.target.value) })}
              style={{ width: 80 }}
            />
          </div>
          <div className="field">
            <span className="eyebrow-sm">Default duration</span>
            <input
              className="input"
              type="number"
              step="0.5"
              defaultValue={Math.max(1, ...editing.slots.map((s) => s.start + s.hours))}
              style={{ width: 80 }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <span className="eyebrow-sm">Label</span>
            <input
              className="input"
              value={editing.label}
              onChange={(e) => patchTpl({ label: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => setConfirmDelete(editType)}
          title={
            deleteBlocked
              ? jobsUsingType.length +
                ' job(s) still use this type — delete blocked'
              : undefined
          }
        >
          <Icon name="x" size={12} /> Delete template
        </button>
        <div className="row">
          <button className="btn btn-outline btn-sm" onClick={cancel} disabled={!isDirty}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!isDirty}>
            Save template
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          entityLabel={'Template: ' + (templates[confirmDelete]?.label ?? confirmDelete)}
          body={
            deleteBlocked ? (
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: '#781E1E' }}
                >
                  {jobsUsingType.length} job
                  {jobsUsingType.length === 1 ? '' : 's'} still use this type.
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  Add another template for {confirmDelete} or reassign those
                  jobs before removing this template.
                </div>
              </div>
            ) : (
              <div className="muted small">
                Removes the template definition. Job types remain available;
                jobs of this type will need explicit slots until a new template
                is added.
              </div>
            )
          }
          blocked={deleteBlocked}
          confirmText="Delete template"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            removeTemplate(confirmDelete);
            pushToast('Deleted template');
            setConfirmDelete(null);
            const remaining = Object.keys(templates).filter(
              (k) => k !== confirmDelete,
            );
            if (remaining[0]) setEditType(remaining[0]);
          }}
        />
      )}
    </>
  );
}
