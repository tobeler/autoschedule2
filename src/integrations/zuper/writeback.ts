// =============================================================
// Zuper writeback — push AutoSchedule mutations back to Zuper.
//
// SAFETY:
// - Every export is gated on `integrations.zuper.writeback_enabled`
//   (settings_kv). When OFF, the helpers return a typed "dry-run"
//   preview and DO NOT call Zuper.
// - This is the single chokepoint for outgoing Zuper writes. Do not
//   add HTTP calls to Zuper from anywhere else in this codebase.
// - Confirmation is the UI's responsibility (see
//   `src/modals/ZuperWriteConfirmModal.tsx`). The writeback functions
//   trust their caller — they assume the dispatcher already approved.
//
// Endpoints used (Zuper Pro API):
//   PUT  /api/jobs/schedule         — reschedule a job (date/time/duration)
//   POST /api/jobs/assign           — assign users / teams
//   PUT  /api/jobs/{job_uid}        — generic patch (status etc.)
// =============================================================

import { _zuperWriteInternal, isZuperConfigured, ZuperConfigError } from './client';
import { getBooleanFlag, INTEGRATION_FLAGS } from '@/lib/settings';

export type WritebackAction = 'reschedule' | 'assign' | 'status' | 'cancel';

/**
 * Common preview shape returned both by dry-run mode (flag OFF) and by
 * the confirm-then-apply flow's "preview" step. Surfaces enough detail
 * for the confirmation modal to show "About to push X to Zuper".
 */
export interface WritebackPreview {
  action: WritebackAction;
  zuperJobUid: string;
  endpoint: string;
  method: 'PUT' | 'POST' | 'PATCH';
  payload: unknown;
  /** Human-readable description for the confirmation modal. */
  summary: string;
}

export interface WritebackResult {
  ok: boolean;
  /** True when the request actually hit Zuper. False = dry-run / flag off. */
  applied: boolean;
  preview: WritebackPreview;
  /** Present when applied=true. */
  zuperResponse?: unknown;
  /** Present when ok=false. */
  error?: string;
}

async function writebackEnabled(): Promise<boolean> {
  return getBooleanFlag(INTEGRATION_FLAGS.zuperWriteback, false);
}

/**
 * Apply a writeback preview against Zuper. Skips the HTTP call when the
 * feature flag is OFF — callers always get the same WritebackResult shape
 * so the UI doesn't have to branch on flag state.
 *
 * SAFETY: We re-read the flag inside this function so a flip in settings
 * takes effect on the next mutation, not the next server restart.
 */
async function applyPreview(preview: WritebackPreview): Promise<WritebackResult> {
  if (!isZuperConfigured()) {
    return {
      ok: false,
      applied: false,
      preview,
      error: 'ZUPER_API_KEY not configured',
    };
  }
  const enabled = await writebackEnabled();
  if (!enabled) {
    return { ok: true, applied: false, preview };
  }
  try {
    const zuperResponse = await _zuperWriteInternal<unknown, unknown>(
      preview.method,
      preview.endpoint,
      preview.payload,
    );
    return { ok: true, applied: true, preview, zuperResponse };
  } catch (err) {
    if (err instanceof ZuperConfigError) {
      return { ok: false, applied: false, preview, error: err.message };
    }
    return {
      ok: false,
      applied: false,
      preview,
      error: err instanceof Error ? err.message : 'Unknown Zuper write error',
    };
  }
}

// -----------------------------------------------------------------
// Reschedule — change date / start time / duration
// -----------------------------------------------------------------

export interface RescheduleInput {
  zuperJobUid: string;
  /** YYYY-MM-DD local-to-team. */
  date: string;
  /** Decimal hours from midnight (e.g. 9.5 = 9:30am). */
  startHour: number;
  durationHrs: number;
  /** Team-name prefix used to pick the right UTC offset (e.g. "CO-DE-1"). */
  teamName?: string | null;
}

/** Convert a local clock value to a UTC ISO instant via team-prefix offset. */
function localToUtcIso(date: string, hourLocal: number, teamName?: string | null): string {
  const offsetH =
    !teamName || teamName.startsWith('CO-')
      ? -6
      : teamName.startsWith('BC-') || teamName.startsWith('CA-')
        ? -7
        : teamName.startsWith('MA-') || teamName.startsWith('NY-')
          ? -4
          : -6;
  const baseMs = new Date(date + 'T00:00:00Z').getTime();
  const localOffsetMs = hourLocal * 3600_000;
  const utcMs = baseMs + localOffsetMs - offsetH * 3600_000;
  return new Date(utcMs).toISOString();
}

export function previewReschedule(input: RescheduleInput): WritebackPreview {
  const startUtc = localToUtcIso(input.date, input.startHour, input.teamName);
  const endUtc = localToUtcIso(
    input.date,
    input.startHour + input.durationHrs,
    input.teamName,
  );
  return {
    action: 'reschedule',
    zuperJobUid: input.zuperJobUid,
    endpoint: '/jobs/schedule',
    method: 'PUT',
    payload: {
      job_uid: input.zuperJobUid,
      scheduled_start_time: startUtc,
      scheduled_end_time: endUtc,
    },
    summary:
      `Reschedule ${input.zuperJobUid.slice(0, 8)}… → ` +
      `${input.date} ${formatHour(input.startHour)} for ${input.durationHrs}h`,
  };
}

export async function rescheduleJob(input: RescheduleInput): Promise<WritebackResult> {
  return applyPreview(previewReschedule(input));
}

// -----------------------------------------------------------------
// Assign — change which users / team handle the job
// -----------------------------------------------------------------

export interface AssignInput {
  zuperJobUid: string;
  /** Zuper user_uid values for individual technicians. */
  userUids?: string[];
  /** Zuper team_uid value for a crew assignment. */
  teamUid?: string | null;
}

export function previewAssign(input: AssignInput): WritebackPreview {
  return {
    action: 'assign',
    zuperJobUid: input.zuperJobUid,
    endpoint: '/jobs/assign',
    method: 'POST',
    payload: {
      job_uid: input.zuperJobUid,
      user_uids: input.userUids ?? [],
      team_uid: input.teamUid ?? null,
    },
    summary:
      `Assign ${input.zuperJobUid.slice(0, 8)}… → ` +
      (input.teamUid ? `team ${input.teamUid.slice(0, 8)}…` : '') +
      (input.userUids?.length ? ` (${input.userUids.length} tech${input.userUids.length === 1 ? '' : 's'})` : ''),
  };
}

export async function assignJob(input: AssignInput): Promise<WritebackResult> {
  return applyPreview(previewAssign(input));
}

// -----------------------------------------------------------------
// Status change (cancel, complete, etc.)
// -----------------------------------------------------------------

export interface StatusInput {
  zuperJobUid: string;
  /** Zuper status_uid for the target status. */
  statusUid: string;
  statusLabel: string;
}

export function previewStatus(input: StatusInput): WritebackPreview {
  return {
    action: 'status',
    zuperJobUid: input.zuperJobUid,
    endpoint: `/jobs/${input.zuperJobUid}`,
    method: 'PUT',
    payload: { job_status_uid: input.statusUid },
    summary: `Set ${input.zuperJobUid.slice(0, 8)}… → status "${input.statusLabel}"`,
  };
}

export async function changeJobStatus(input: StatusInput): Promise<WritebackResult> {
  return applyPreview(previewStatus(input));
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function formatHour(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const ampm = hh < 12 ? 'AM' : 'PM';
  const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return mm === 0
    ? `${display} ${ampm}`
    : `${display}:${String(mm).padStart(2, '0')} ${ampm}`;
}
