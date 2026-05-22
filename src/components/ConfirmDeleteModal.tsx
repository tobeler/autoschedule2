// =============================================================
// ConfirmDeleteModal — shared destructive confirm dialog.
//
// Used everywhere we delete an entity: trucks, technicians, crews,
// projects, time-off, templates, regions. Accepts a body slot for
// per-entity warnings (e.g. referential dependency lists).
// =============================================================
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

interface ConfirmDeleteModalProps {
  /** Short label of the thing being deleted, e.g. "Truck 07". */
  entityLabel: string;
  /** Optional body slot — used to surface referential warnings. */
  body?: ReactNode;
  /** Override the primary destructive label. */
  confirmText?: string;
  /** When true the confirm button is disabled (use when a guard fails). */
  blocked?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  entityLabel,
  body,
  confirmText = 'Delete',
  blocked = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460 }}
        role="dialog"
        aria-label={'Delete ' + entityLabel}
      >
        <div className="modal-header">
          <Icon name="alert_circle" size={18} stroke="#C53030" />
          <div>
            <div className="eyebrow-sm">Confirm delete</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{entityLabel}</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onCancel} />
        </div>

        <div className="modal-body">
          {body ?? (
            <div className="muted small">
              This action can&apos;t be undone. The record will be removed for
              everyone using the app.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={onConfirm}
            disabled={blocked}
            title={blocked ? 'Resolve dependencies first' : undefined}
          >
            <Icon name="x" size={12} /> {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
