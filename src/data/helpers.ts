// =============================================================
// Date / time / formatting helpers (port of data.js helpers)
// =============================================================

/**
 * Anchor date used as "today" throughout the dispatcher. Resolved to the
 * actual current local date when the bundle loads. The seed dataset's hand-
 * picked "May 21 2026" anchor is only used when running tests that pin the
 * clock via a date mock.
 */
function resolveToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
export const TODAY = resolveToday();

export function dateKey(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmtDate(d: Date, opts?: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format an hour-of-day decimal (e.g. 8.5) as "8:30a" / "1:15p". */
export function fmtTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + period;
}

export function hoursToStr(h: number): string {
  if (h === 1) return '1 hr';
  return h + ' hrs';
}

/** Snap an hour to the nearest 0.25 (15 min). */
export function snapQuarter(hour: number): number {
  return Math.round(hour * 4) / 4;
}

/** Range of integer hours [start, end). */
export function hourRange(start: number, end: number): number[] {
  const out: number[] = [];
  for (let h = start; h < end; h++) out.push(h);
  return out;
}

/** Get the Monday on or before this date. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Five weekday Date objects from a Monday anchor. */
export function weekdaysFrom(monday: Date): Date[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** All days of the month containing `d`. */
export function daysOfMonth(d: Date): Date[] {
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
}
