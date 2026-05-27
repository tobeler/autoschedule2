// =============================================================
// ZuperWriteConfirmModal — confirmation dialog that fires before a
// local mutation is pushed to Zuper.
//
// Triggered by store.pendingZuperWrite. Mounted globally in App.tsx
// so any view that mutates a Zuper-sourced job triggers it.
//
// Behaviour:
// - Local change is already applied optimistically by the time the
//   modal renders — that's what makes the dispatch board feel snappy.
// - "Push to Zuper" calls the writeback function, which is itself
//   gated by `integrations.zuper.writeback_enabled`. With the flag
//   OFF (default), confirm is a no-op against Zuper and the user
//   sees a "writeback OFF" toast.
// - "Undo" reverts the local change via the onCancel callback.
// - Esc / backdrop click defaults to UNDO (safer than auto-confirm).
// =============================================================
'use client';

import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

export function ZuperWriteConfirmModal() {
  const pending = useStore((s) => s.pendingZuperWrite);

  // Esc → cancel.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pending.onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      className="drawer-backdrop"
      onClick={pending.onCancel}
      style={{
        background: 'rgba(15, 31, 13, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)',
          background: 'var(--surface-card)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 18px 48px rgba(0,0,0,0.18)',
        }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="zuper-write-title"
      >
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,182,39,0.18)',
              color: '#7A4900',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="refresh" size={16} />
          </div>
          <div>
            <div
              id="zuper-write-title"
              style={{ fontFamily: 'var(--font-subhead)', fontWeight: 800, fontSize: 16 }}
            >
              Push change to Zuper?
            </div>
            <div className="muted small">
              {labelForAction(pending.action)} · Zuper writeback off by default — toggle in
              Settings → Integrations to actually transmit.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 8,
            background: 'var(--bg-subtle)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--fg)',
            wordBreak: 'break-word',
          }}
        >
          {pending.summary}
        </div>

        <div
          className="muted small"
          style={{
            marginTop: 12,
            padding: '8px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <Icon name="info" size={12} />
          <span>
            Your local change is already saved. <strong>Push to Zuper</strong> sends it upstream
            (when writeback is enabled). <strong>Undo</strong> reverts the local change.
          </span>
        </div>

        <div
          style={{
            marginTop: 18,
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn btn-outline btn-sm" onClick={pending.onCancel}>
            Undo
          </button>
          <button className="btn btn-primary btn-sm" onClick={pending.onConfirm} autoFocus>
            <Icon name="check" size={12} /> Push to Zuper
          </button>
        </div>
      </div>
    </div>
  );
}

function labelForAction(action: 'reschedule' | 'assign' | 'status' | 'cancel'): string {
  switch (action) {
    case 'reschedule':
      return 'Reschedule';
    case 'assign':
      return 'Reassign';
    case 'status':
      return 'Status change';
    case 'cancel':
      return 'Cancellation';
  }
}
