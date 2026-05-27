// =============================================================
// Vercel Cron entry — pulls Zuper daily-shift check-in events
// and upserts them into the `time_entries` table.
//
// Runs daily. vercel.json schedules `0 0 * * *` UTC = 8pm EDT
// (during DST, Mar–Nov) / 7pm EST (during standard time, Nov–Mar).
// The backfill is idempotent and overlaps a 3-day window, so the
// 1-hour DST drift is harmless operationally.
//
// Auth: same pattern as hubspot-sync — Vercel injects
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
//
// Strategy: re-pull the last 3 calendar days every run so a
// CHECK_OUT that lands the morning after a midnight-spanning shift
// gets paired up correctly. ON CONFLICT (id) DO UPDATE handles the
// idempotency.
// =============================================================
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { timeEntries } from '@/db/schema';
import {
  fetchTimesheetEventsForDate,
  pairEventsForDate,
  timeEntryIdFromZuperLogId,
} from '@/integrations/zuper/clock-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hobby plan cap.

const LOOKBACK_DAYS = 3;
const ZUPER_BASE_URL =
  process.env.ZUPER_BASE_URL ?? 'https://us-east-1.zuperpro.com';

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return !process.env.VERCEL;
  }
  const header = req.headers.get('authorization') ?? '';
  return header === 'Bearer ' + secret;
}

function buildDateList(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function zuperGet(path: string): Promise<unknown> {
  const apiKey = process.env.ZUPER_API_KEY;
  if (!apiKey) throw new Error('ZUPER_API_KEY not configured');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500));
    const res = await fetch(`${ZUPER_BASE_URL}/api${path}`, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    });
    if (res.status === 429 || res.status === 529) {
      if (attempt < 2) continue;
      throw new Error(`Zuper rate-limited on ${path}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Zuper ${res.status} ${res.statusText} on ${path}: ${text.slice(0, 200)}`,
      );
    }
    return res.json();
  }
  throw new Error('unreachable');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid CRON_SECRET',
      },
      { status: 401 },
    );
  }

  // Resolve people via the 'zup-user-' prefix convention. No separate column.
  const personRows = await db.execute<{ id: string }>(
    sql`SELECT id FROM people WHERE id LIKE 'zup-user-%'`,
  );
  const personLookup = new Map<string, string>();
  const PREFIX = 'zup-user-';
  for (const r of personRows) {
    personLookup.set(r.id.slice(PREFIX.length), r.id);
  }

  const dates = buildDateList(LOOKBACK_DAYS);
  let totalEvents = 0;
  let totalShifts = 0;
  let written = 0;
  let unmapped = 0;
  const anomalyCounts: Record<string, number> = {};

  for (const date of dates) {
    const events = await fetchTimesheetEventsForDate(date, zuperGet);
    totalEvents += events.length;
    const { shifts, anomalies } = pairEventsForDate(events);
    totalShifts += shifts.length;

    for (const a of anomalies) {
      anomalyCounts[a.kind] = (anomalyCounts[a.kind] || 0) + 1;
    }

    for (const s of shifts) {
      if (!s.zuperUserUid) continue;
      const personId = personLookup.get(s.zuperUserUid);
      if (!personId) {
        unmapped += 1;
        continue;
      }
      const id = timeEntryIdFromZuperLogId(s.zuperLogId);
      await db
        .insert(timeEntries)
        .values({
          id,
          personId,
          jobId: null,
          clockIn: new Date(s.clockIn),
          clockOut: s.clockOut ? new Date(s.clockOut) : null,
          source: 'zuper',
          zuperLogId: s.zuperLogId,
        })
        .onConflictDoUpdate({
          target: timeEntries.id,
          set: {
            clockOut: s.clockOut ? new Date(s.clockOut) : null,
            updatedAt: new Date(),
          },
        });
      written += 1;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      windowDays: LOOKBACK_DAYS,
      dates,
      totalEvents,
      totalShifts,
      written,
      unmapped,
      anomalyCounts,
    },
    { status: 200 },
  );
}

export const POST = GET;
