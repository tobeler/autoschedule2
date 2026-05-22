// =============================================================
// TimeOffEditor — settings sub-tab. Lists all PTO/sick/training/
// vacation entries, lets admins add/remove rows. Edits live on
// useStore().timeOff.
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { useStore } from '../../store';
import { fmtDate, parseDateKey } from '../../data/helpers';
import type { Person, TimeOff, TimeOffType } from '../../types';

const TIME_OFF_TYPES: TimeOffType[] = ['pto', 'sick', 'vacation', 'training'];

export function TimeOffEditor() {
  const timeOff = useStore((s) => s.timeOff);
  const people = useStore((s) => s.people);
  const removeTimeOff = useStore((s) => s.removeTimeOff);
  const pushToast = useStore((s) => s.pushToast);

  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimeOff | null>(null);

  const sorted = useMemo(
    () =>
      timeOff
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [timeOff],
  );

  function personFor(id: string): Person | undefined {
    return people.find((p) => p.id === id);
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3>Time off</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            PTO, sick days, vacation, and training. Affects crew availability
            in the dispatch board and suggest-a-time picker.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Icon name="plus" size={12} /> Add time off
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Person</th>
              <th>Type</th>
              <th>Label</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const person = personFor(t.personId);
              return (
                <tr key={t.id}>
                  <td>
                    <div className="mono small" style={{ fontWeight: 600 }}>
                      {fmtDate(parseDateKey(t.date), {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </td>
                  <td>{person?.name ?? <span className="muted">unknown</span>}</td>
                  <td>
                    <span
                      className="tag"
                      style={{ textTransform: 'uppercase' }}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="small">{t.label}</td>
                  <td>
                    <IconButton
                      icon="x"
                      label="Delete time off"
                      onClick={() => setDeleteTarget(t)}
                    />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: 'center',
                    padding: 40,
                    color: 'var(--fg-muted)',
                  }}
                >
                  No time off entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && <AddTimeOffModal onClose={() => setShowAdd(false)} />}
      {deleteTarget && (
        <ConfirmDeleteModal
          entityLabel={'Time off · ' + deleteTarget.date}
          confirmText="Delete entry"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            removeTimeOff(deleteTarget.id);
            pushToast('Removed time off');
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

function AddTimeOffModal({ onClose }: { onClose: () => void }) {
  const people = useStore((s) => s.people);
  const addTimeOff = useStore((s) => s.addTimeOff);
  const pushToast = useStore((s) => s.pushToast);

  const [personId, setPersonId] = useState<string>(people[0]?.id ?? '');
  const [date, setDate] = useState<string>('');
  const [type, setType] = useState<TimeOffType>('pto');
  const [label, setLabel] = useState('');

  const canSave = personId && date.length === 10;

  function save() {
    if (!canSave) return;
    const t: TimeOff = {
      id: 'to' + Date.now().toString(36),
      personId,
      date,
      type,
      label: label.trim() || type.toUpperCase(),
    };
    addTimeOff(t);
    pushToast('Added time off');
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460 }}
        role="dialog"
        aria-label="Add time off"
      >
        <div className="modal-header">
          <Icon name="clock" size={18} />
          <div>
            <div className="eyebrow-sm">Time off</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add entry</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="modal-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Person</label>
              <select
                className="select"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label className="label">Type</label>
              <select
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value as TimeOffType)}
              >
                {TIME_OFF_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Label</label>
              <input
                className="input"
                placeholder="Reason or note"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={!canSave}
          >
            <Icon name="check" size={14} /> Add entry
          </button>
        </div>
      </div>
    </div>
  );
}
