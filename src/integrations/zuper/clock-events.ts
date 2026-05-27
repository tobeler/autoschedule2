// =============================================================
// Zuper clock-event sync (READ-ONLY against Zuper).
//
// Verified against the tenant on 2026-05-27: the per-job
// /api/jobs/{uid} response does NOT carry an embedded time-log
// array on this account (probed 431 completed jobs — zero hits).
// The real surface for daily-shift check-ins is:
//
//   GET /api/timesheets?date=YYYY-MM-DD&page=N&count=100
//     → { data: { total_pages, current_page, timesheets: [...] } }
//
// Each timesheet record is ONE event (CHECK_IN, CHECK_OUT, or a
// break). Pairing CHECK_IN → CHECK_OUT into shifts happens in
// `pairCheckEventsForUserDay()`. Break events split a shift, so
// a typical "morning shift + afternoon shift" day for one tech
// emits TWO time_entries rows.
//
// The job-level `actual_start_time` / `actual_end_time` from
// /api/jobs/{uid} is a secondary, optional surface. Not wired
// here yet — Surface 1 already feeds the Timesheets daily totals.
//
// Each shift becomes one `time_entries` row keyed by
//   zuperLogId = <employee_timesheet_uid of the CHECK_IN event>
// id          = TE-Z-<employee_timesheet_uid>
// so re-runs are idempotent and a CHECK_OUT that arrives later
// just updates the open shift.
//
// We map upstream user → our `people.id` via the existing
// `bootstrap-technicians.ts` convention: people.id = 'zup-user-'
// + user_uid. No separate column.
// =============================================================

export type CheckType = 'CHECK_IN' | 'CHECK_OUT';

export interface ZuperTimesheetEvent {
  employee_timesheet_uid: string;
  type_of_check: CheckType | string;
  checked_time: string;
  latitude?: number | null;
  longitude?: number | null;
  auth_pic?: string | null;
  remarks?: string | null;
  flagged?: boolean;
  /** null for the regular CHECK_IN / CHECK_OUT events. Non-null when this
   *  event is a break (lunch / unpaid). Break events split a shift. */
  break_type?: string | null;
  created_at?: string;
  users?: {
    user_uid?: string;
    first_name?: string;
    last_name?: string;
    designation?: string;
  };
  created_user?: { user_uid?: string };
}

export interface ZuperTimesheetsPage {
  status?: string;
  type?: string;
  data: {
    total_pages: number;
    current_page: number;
    total_records?: number;
    timesheets: ZuperTimesheetEvent[];
  };
}

export interface ParsedShift {
  /** Stable upstream id for the shift — the CHECK_IN event's
   *  employee_timesheet_uid. Drives idempotent upserts. */
  zuperLogId: string;
  /** Zuper user_uid (NOT our people.id). Caller resolves to a Person. */
  zuperUserUid: string | null;
  clockIn: string;
  clockOut: string | null;
}

export interface PairingAnomaly {
  kind: 'leading_check_out' | 'trailing_check_in' | 'unknown_check_type';
  zuperUserUid: string | null;
  checkedTime: string;
  detail?: string;
}

export interface PairingResult {
  shifts: ParsedShift[];
  anomalies: PairingAnomaly[];
}

const TIMESHEETS_PATH = '/timesheets';
const PAGE_SIZE = 100; // Briefing: do NOT raise above 200 — rate-limit risk.

/**
 * Fetch every page of timesheet events for a single date.
 *
 * Pagination contract from the upstream API:
 *   { data: { total_pages, current_page, timesheets[] } }
 *
 * Returns the flat array of events for that day. The fetcher is injected
 * so tests can stub it. In production, callers pass `zuperGetTimesheets`
 * which wraps the existing zuperGet retry/backoff.
 */
export async function fetchTimesheetEventsForDate(
  date: string,
  fetcher: (path: string) => Promise<unknown>,
): Promise<ZuperTimesheetEvent[]> {
  const out: ZuperTimesheetEvent[] = [];
  let page = 1;
  // Fetch page 1, then loop until current_page === total_pages.
  // Guardrail: cap at 200 pages so a runaway never spins forever.
  for (let safety = 0; safety < 200; safety += 1) {
    const path = `${TIMESHEETS_PATH}?date=${encodeURIComponent(date)}&page=${page}&count=${PAGE_SIZE}`;
    const body = (await fetcher(path)) as ZuperTimesheetsPage | undefined;
    const data = body?.data;
    if (!data || !Array.isArray(data.timesheets)) break;
    out.push(...data.timesheets);
    const total = Number(data.total_pages) || 1;
    if (page >= total) break;
    page += 1;
  }
  return out;
}

/**
 * Group events by the resolving user_uid. Records without a user_uid
 * (data anomaly) land in the '' bucket which the caller can drop.
 */
export function groupEventsByUser(
  events: ZuperTimesheetEvent[],
): Map<string, ZuperTimesheetEvent[]> {
  const out = new Map<string, ZuperTimesheetEvent[]>();
  for (const ev of events) {
    const uid = ev.users?.user_uid ?? ev.created_user?.user_uid ?? '';
    if (!out.has(uid)) out.set(uid, []);
    out.get(uid)!.push(ev);
  }
  return out;
}

/**
 * Pair CHECK_IN → CHECK_OUT events for ONE user on ONE day.
 *
 * Rules (per briefing):
 *  1. Sort events ascending by `checked_time`.
 *  2. A CHECK_IN followed by a CHECK_OUT emits one shift row.
 *  3. Break events (`break_type != null`) split a shift — treat
 *     the regular CHECK_IN/CHECK_OUT pattern around them normally.
 *     A break does NOT end the parent shift on its own; the next
 *     regular CHECK_OUT does. Break-IN/break-OUT pairs are ignored
 *     by this pairer (they don't get their own time_entries row).
 *  4. Trailing CHECK_IN with no CHECK_OUT → emit shift with
 *     clockOut=null (the tech is "still on the clock"). The next
 *     resync of the same day picks up the eventual CHECK_OUT.
 *  5. Leading CHECK_OUT with no prior CHECK_IN → log anomaly + skip.
 *
 * `zuperLogId` is always the CHECK_IN event's
 * `employee_timesheet_uid` — that's the stable handle for upserts.
 */
export function pairCheckEventsForUserDay(
  events: ZuperTimesheetEvent[],
  zuperUserUid: string | null,
): PairingResult {
  const shifts: ParsedShift[] = [];
  const anomalies: PairingAnomaly[] = [];

  // Filter break events out — they don't produce shift rows of their own.
  // Sort the rest by checked_time ascending.
  const regular = events
    .filter((e) => !e.break_type)
    .slice()
    .sort((a, b) => {
      const at = new Date(a.checked_time).getTime();
      const bt = new Date(b.checked_time).getTime();
      return at - bt;
    });

  let openCheckIn: ZuperTimesheetEvent | null = null;
  for (const ev of regular) {
    const kind = String(ev.type_of_check || '').toUpperCase();
    if (kind === 'CHECK_IN') {
      if (openCheckIn) {
        // Two CHECK_INs in a row with no intervening CHECK_OUT.
        // Emit the first as an open shift and start fresh with this one.
        shifts.push(makeShift(openCheckIn, null, zuperUserUid));
      }
      openCheckIn = ev;
    } else if (kind === 'CHECK_OUT') {
      if (!openCheckIn) {
        anomalies.push({
          kind: 'leading_check_out',
          zuperUserUid,
          checkedTime: ev.checked_time,
        });
        continue;
      }
      shifts.push(makeShift(openCheckIn, ev, zuperUserUid));
      openCheckIn = null;
    } else {
      anomalies.push({
        kind: 'unknown_check_type',
        zuperUserUid,
        checkedTime: ev.checked_time,
        detail: String(ev.type_of_check),
      });
    }
  }

  if (openCheckIn) {
    shifts.push(makeShift(openCheckIn, null, zuperUserUid));
    anomalies.push({
      kind: 'trailing_check_in',
      zuperUserUid,
      checkedTime: openCheckIn.checked_time,
    });
  }

  return { shifts, anomalies };
}

function makeShift(
  checkIn: ZuperTimesheetEvent,
  checkOut: ZuperTimesheetEvent | null,
  zuperUserUid: string | null,
): ParsedShift {
  return {
    zuperLogId: checkIn.employee_timesheet_uid,
    zuperUserUid,
    clockIn: new Date(checkIn.checked_time).toISOString(),
    clockOut: checkOut ? new Date(checkOut.checked_time).toISOString() : null,
  };
}

/**
 * Top-level convenience: take the raw events for a date and produce
 * the per-user pairing result for every user that punched that day.
 */
export function pairEventsForDate(
  events: ZuperTimesheetEvent[],
): { shifts: ParsedShift[]; anomalies: PairingAnomaly[] } {
  const byUser = groupEventsByUser(events);
  const shifts: ParsedShift[] = [];
  const anomalies: PairingAnomaly[] = [];
  for (const [uid, evs] of byUser.entries()) {
    if (!uid) {
      // Events without a user_uid — log + skip rather than emit a NULL row.
      for (const ev of evs) {
        anomalies.push({
          kind: 'unknown_check_type',
          zuperUserUid: null,
          checkedTime: ev.checked_time,
          detail: 'event has no user_uid',
        });
      }
      continue;
    }
    const res = pairCheckEventsForUserDay(evs, uid);
    shifts.push(...res.shifts);
    anomalies.push(...res.anomalies);
  }
  return { shifts, anomalies };
}

/**
 * Synthesize the `time_entries.id` value from a zuperLogId. Strips
 * any non-id-safe chars and trims to keep the row id readable. The
 * resulting id is what the backfill script upserts on.
 */
export function timeEntryIdFromZuperLogId(zuperLogId: string): string {
  return `TE-Z-${zuperLogId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
}
