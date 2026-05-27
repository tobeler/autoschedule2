// =============================================================
// Backfill: pull Zuper daily-shift check-in events into our local
// `time_entries` table.
//
// Run:
//   node scripts/backfill-clock-events.mjs            # last 30 days
//   node scripts/backfill-clock-events.mjs --dry-run  # probe only
//   node scripts/backfill-clock-events.mjs --limit 7  # last 7 days
//   DAYS=30 LIMIT=7 node scripts/backfill-clock-events.mjs
//
// Strategy (verified 2026-05-27 — earlier per-job time_logs assumption
// was WRONG for this tenant):
//
//   1. For each date in the window, GET /api/timesheets?date=YYYY-MM-DD
//      paginating with count=100 until current_page === total_pages.
//   2. Group events by user_uid.
//   3. Pair CHECK_IN → CHECK_OUT into shift rows. Break events split a
//      shift. Trailing CHECK_IN with no CHECK_OUT → open shift
//      (clockOut=NULL). Leading CHECK_OUT → anomaly, skip.
//   4. Resolve user_uid → people.id via the 'zup-user-' prefix
//      convention from src/integrations/zuper/bootstrap-technicians.ts.
//   5. Upsert into `time_entries`. ON CONFLICT (id) updates clockOut +
//      updatedAt — so a CHECK_OUT that arrives after the first sync
//      closes the open shift on re-run.
//
// SAFETY: READ-ONLY against Zuper (GET only). Local Postgres writes only.
// Re-runnable: dedup on `id` keeps row counts stable.
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Env loading ----
const envPath = path.resolve(__dirname, '..', '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
const ZUPER_API_KEY = env.ZUPER_API_KEY || process.env.ZUPER_API_KEY;
const ZUPER_BASE_URL =
  env.ZUPER_BASE_URL ||
  process.env.ZUPER_BASE_URL ||
  'https://us-east-1.zuperpro.com';
if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');
if (!ZUPER_API_KEY)
  throw new Error('ZUPER_API_KEY not set in .env.local — cannot backfill');

// ---- CLI flag parsing (also accepts DAYS / LIMIT / DRY env vars) ----
function parseFlags(argv) {
  const out = { dryRun: false, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--dry') out.dryRun = true;
    else if (a === '--limit') out.limit = Number(argv[i + 1]);
    else if (a.startsWith('--limit=')) out.limit = Number(a.slice('--limit='.length));
  }
  return out;
}

const flags = parseFlags(process.argv.slice(2));
const DAYS = Number(
  flags.limit ?? process.env.LIMIT ?? process.env.DAYS ?? 30,
);
const DRY = flags.dryRun || process.env.DRY === '1';
const PAGE_SIZE = 100;

const sql = postgres(DATABASE_URL, { prepare: false });

// ---- HTTP helper: GET /api with retry on 429/529 ----
async function zuperGet(endpoint) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500));
    const res = await fetch(`${ZUPER_BASE_URL}/api${endpoint}`, {
      headers: {
        'x-api-key': ZUPER_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 429 || res.status === 529) {
      if (attempt < 2) continue;
      throw new Error(`Zuper rate limited on ${endpoint}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Zuper ${res.status} ${res.statusText} on ${endpoint}: ${text.slice(0, 200)}`,
      );
    }
    return res.json();
  }
}

// ---- Pull every page for a single date ----
async function fetchAllEventsForDate(date) {
  const events = [];
  let page = 1;
  for (let safety = 0; safety < 200; safety += 1) {
    const body = await zuperGet(
      `/timesheets?date=${encodeURIComponent(date)}&page=${page}&count=${PAGE_SIZE}`,
    );
    const data = body?.data;
    if (!data || !Array.isArray(data.timesheets)) break;
    events.push(...data.timesheets);
    const total = Number(data.total_pages) || 1;
    if (page >= total) break;
    page += 1;
  }
  return events;
}

// ---- Pairing logic (mirror of src/integrations/zuper/clock-events.ts) ----
function pairEventsForUserDay(events, zuperUserUid) {
  const shifts = [];
  const anomalies = [];

  const regular = events
    .filter((e) => !e.break_type)
    .slice()
    .sort((a, b) => {
      const at = new Date(a.checked_time).getTime();
      const bt = new Date(b.checked_time).getTime();
      return at - bt;
    });

  let openIn = null;
  for (const ev of regular) {
    const kind = String(ev.type_of_check || '').toUpperCase();
    if (kind === 'CHECK_IN') {
      if (openIn) {
        // Two CHECK_INs in a row → close the previous as open shift.
        shifts.push(makeShift(openIn, null, zuperUserUid));
      }
      openIn = ev;
    } else if (kind === 'CHECK_OUT') {
      if (!openIn) {
        anomalies.push({
          kind: 'leading_check_out',
          zuperUserUid,
          checkedTime: ev.checked_time,
        });
        continue;
      }
      shifts.push(makeShift(openIn, ev, zuperUserUid));
      openIn = null;
    } else {
      anomalies.push({
        kind: 'unknown_check_type',
        zuperUserUid,
        checkedTime: ev.checked_time,
        detail: ev.type_of_check,
      });
    }
  }
  if (openIn) {
    shifts.push(makeShift(openIn, null, zuperUserUid));
    anomalies.push({
      kind: 'trailing_check_in',
      zuperUserUid,
      checkedTime: openIn.checked_time,
    });
  }
  return { shifts, anomalies };
}

function makeShift(checkIn, checkOut, zuperUserUid) {
  return {
    zuperLogId: checkIn.employee_timesheet_uid,
    zuperUserUid,
    clockIn: new Date(checkIn.checked_time).toISOString(),
    clockOut: checkOut ? new Date(checkOut.checked_time).toISOString() : null,
  };
}

function teIdFromLogId(zuperLogId) {
  return `TE-Z-${zuperLogId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
}

// ---- Date window ----
function buildDateList(days) {
  // Today (local) backwards `days` days. We work in UTC for the date keys
  // since Zuper accepts YYYY-MM-DD as the query param and returns the
  // events that fall in that calendar day in the tenant's preferred TZ —
  // which on this tenant's data is roughly UTC-anchored.
  const out = [];
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ---- Main ----
try {
  const dates = buildDateList(DAYS);
  console.log(
    `Backfilling Zuper timesheets for ${dates.length} days ` +
      `(${dates[dates.length - 1]} … ${dates[0]})${DRY ? ' [DRY RUN]' : ''}`,
  );

  // Person lookup: 'zup-user-{user_uid}' → that same row id.
  const personRows = await sql`SELECT id FROM people WHERE id LIKE 'zup-user-%'`;
  const personLookup = new Map();
  const PREFIX = 'zup-user-';
  for (const r of personRows) {
    personLookup.set(r.id.slice(PREFIX.length), r.id);
  }
  console.log(`  resolved ${personLookup.size} Zuper-bound people rows`);

  // Pre-cache a Zuper-jobUid → jobs.id map so we can populate jobId on
  // entries that reference a known job. Today the timesheets endpoint
  // does NOT carry a job_uid — so this map is currently unused. Kept
  // wired so when Surface 2 lands we don't have to re-query.
  const jobRows = await sql`
    SELECT id, "zuperJobUid" FROM jobs WHERE "zuperJobUid" IS NOT NULL
  `;
  const jobByUid = new Map();
  for (const r of jobRows) jobByUid.set(r.zuperJobUid, r.id);

  let totalEvents = 0;
  let totalShifts = 0;
  let totalUnmapped = 0;
  let totalWritten = 0;
  const anomalyCounts = {
    leading_check_out: 0,
    trailing_check_in: 0,
    unknown_check_type: 0,
  };
  const userDayStats = {
    totalUserDays: 0,
    successUserDays: 0, // user-days with >=1 closed shift (clockOut not null) and no anomalies
  };
  const sampleUserDays = []; // up to 3 example person-days for the final report
  // Track per-user trailing-CHECK_IN counts to flag tech-level patterns
  const trailingByUser = new Map();

  for (const date of dates) {
    let events = [];
    try {
      events = await fetchAllEventsForDate(date);
    } catch (err) {
      console.log(`  ! fetch error for ${date}: ${err.message}`);
      continue;
    }
    totalEvents += events.length;

    // Group → pair → upsert
    const byUser = new Map();
    for (const ev of events) {
      const uid = ev.users?.user_uid ?? ev.created_user?.user_uid ?? '';
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(ev);
    }

    for (const [uid, evs] of byUser.entries()) {
      if (!uid) {
        anomalyCounts.unknown_check_type += evs.length;
        continue;
      }
      userDayStats.totalUserDays += 1;
      const { shifts, anomalies } = pairEventsForUserDay(evs, uid);

      // Count anomalies
      let anomalyCountThisUserDay = 0;
      for (const a of anomalies) {
        anomalyCounts[a.kind] = (anomalyCounts[a.kind] || 0) + 1;
        anomalyCountThisUserDay += 1;
        if (a.kind === 'trailing_check_in') {
          trailingByUser.set(uid, (trailingByUser.get(uid) || 0) + 1);
        }
      }

      // Success: at least one closed shift AND no anomalies
      const hasClosed = shifts.some((s) => s.clockOut != null);
      if (hasClosed && anomalyCountThisUserDay === 0) {
        userDayStats.successUserDays += 1;
      }

      totalShifts += shifts.length;

      // Stash 3 sample user-days for the report (only "rich" days — >=2 shifts)
      if (sampleUserDays.length < 3 && shifts.length >= 2) {
        const u = evs[0]?.users;
        sampleUserDays.push({
          date,
          uid,
          name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : uid,
          shifts: shifts.slice(),
        });
      }

      if (DRY) continue;

      const personId = personLookup.get(uid);
      if (!personId) {
        totalUnmapped += shifts.length;
        continue;
      }

      for (const s of shifts) {
        const teId = teIdFromLogId(s.zuperLogId);
        try {
          await sql`
            INSERT INTO time_entries
                (id, "personId", "jobId", "clockIn", "clockOut", source, "zuperLogId")
            VALUES
                (${teId}, ${personId}, NULL, ${s.clockIn}, ${s.clockOut}, 'zuper', ${s.zuperLogId})
            ON CONFLICT (id) DO UPDATE
              SET "clockOut" = EXCLUDED."clockOut",
                  "updatedAt" = now()
          `;
          totalWritten += 1;
        } catch (err) {
          console.log(`  ! upsert error on ${teId}: ${err.message}`);
        }
      }
    }
    // Brief progress line per date
    console.log(
      `  ${date}: ${events.length} events, ` +
        `${byUser.size} users, anomalies so far ` +
        `(L:${anomalyCounts.leading_check_out} ` +
        `T:${anomalyCounts.trailing_check_in} ` +
        `U:${anomalyCounts.unknown_check_type})`,
    );
  }

  // Final summary
  console.log('\n=== Backfill summary ===');
  console.log(`Days probed:         ${dates.length}`);
  console.log(`Events seen:         ${totalEvents}`);
  console.log(`Shifts paired:       ${totalShifts}`);
  console.log(`Entries written:     ${totalWritten}${DRY ? ' (DRY mode)' : ''}`);
  console.log(`Unmapped uid shifts: ${totalUnmapped}`);
  console.log(`User-days total:     ${userDayStats.totalUserDays}`);
  console.log(
    `User-days clean:     ${userDayStats.successUserDays}` +
      ` (${userDayStats.totalUserDays > 0 ? ((userDayStats.successUserDays / userDayStats.totalUserDays) * 100).toFixed(1) : '0.0'}%)`,
  );
  console.log('Anomaly counts:');
  console.log(`  leading_check_out (CHECK_OUT before any CHECK_IN): ${anomalyCounts.leading_check_out}`);
  console.log(`  trailing_check_in  (CHECK_IN with no CHECK_OUT):    ${anomalyCounts.trailing_check_in}`);
  console.log(`  unknown_check_type / missing user_uid:              ${anomalyCounts.unknown_check_type}`);

  if (trailingByUser.size > 0) {
    const top = [...trailingByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    console.log('\nTop techs by trailing-CHECK_IN count (forgot to check out):');
    for (const [uid, n] of top) {
      console.log(`  ${uid.slice(0, 8)}…  ${n}`);
    }
  }

  if (sampleUserDays.length > 0) {
    console.log('\nSample person-days:');
    for (const s of sampleUserDays) {
      console.log(`  ${s.date}  ${s.name} (${s.uid.slice(0, 8)}…)`);
      for (const sh of s.shifts) {
        const hours =
          sh.clockOut && sh.clockIn
            ? ((new Date(sh.clockOut) - new Date(sh.clockIn)) / 3_600_000).toFixed(2)
            : 'open';
        console.log(
          `    in=${sh.clockIn}  out=${sh.clockOut ?? '—'}  h=${hours}`,
        );
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
