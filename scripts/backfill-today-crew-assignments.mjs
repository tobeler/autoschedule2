// Backfill missing crew assignments for jobs on TODAY's dispatch board.
//
// Per-job flow:
//   1. Pull fresh Zuper /jobs/{uid}
//   2. Read assigned_to_team[0].team.team_name (Zuper's authoritative crew field)
//   3. UPDATE jobs.zuperTeamName from that value (so it stays in sync with Zuper)
//   4. Try to bridge to crews.name → set jobs.crewId
//
// READ-ONLY against Zuper (only GET). Postgres writes only.
//
// Outcomes:
//   [FIXED]                  — crewId set
//   [NO_TEAM_IN_ZUPER]       — Zuper itself has no assigned_to_team
//   [TEAM_NOT_IN_CREWS_TABLE]— team set, but crews.name has no matching row
//   [ALREADY_BRIDGED]        — racy case; another process already set crewId
//   [ERROR]                  — fetch / write failed
//
// Scope is intentionally narrow: only jobs with date = CURRENT_DATE and
// crewId IS NULL. Widen by editing the WHERE clause if needed in a later run.
//
// Usage:
//   node scripts/backfill-today-crew-assignments.mjs              # writes
//   node scripts/backfill-today-crew-assignments.mjs --dry-run    # logs only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  env.ZUPER_BASE_URL || process.env.ZUPER_BASE_URL || 'https://us-east-1.zuperpro.com';

if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');
if (!ZUPER_API_KEY)
  throw new Error(
    'ZUPER_API_KEY not set in .env.local — cannot fetch fresh Zuper data',
  );

const DRY_RUN = process.argv.includes('--dry-run');
const sql = postgres(DATABASE_URL, { prepare: false });

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
      throw new Error(`Zuper rate limited after 3 attempts on ${endpoint}`);
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

function unassignedish(name) {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return n === '' || n.startsWith('unassigned') || n.startsWith('admin team');
}

try {
  console.log(
    `\n${DRY_RUN ? '[DRY-RUN] ' : ''}Backfilling crew assignments for today's missing-crew jobs…`,
  );

  // Today's missing-crew Zuper jobs.
  const candidates = await sql`
    SELECT id, "zuperJobUid", "zuperTeamName", status, type, date, title
      FROM jobs
     WHERE date = CURRENT_DATE::text
       AND "crewId" IS NULL
       AND "zuperJobUid" IS NOT NULL
     ORDER BY id
  `;
  console.log(`scanned: ${candidates.length} jobs`);

  const counts = {
    FIXED: 0,
    NO_TEAM_IN_ZUPER: 0,
    TEAM_NOT_IN_CREWS_TABLE: 0,
    ALREADY_BRIDGED: 0,
    ERROR: 0,
  };

  for (const c of candidates) {
    let body;
    try {
      body = await zuperGet(`/jobs/${encodeURIComponent(c.zuperJobUid)}`);
    } catch (err) {
      counts.ERROR += 1;
      console.log(`  [ERROR] uid=${c.zuperJobUid}  fetch: ${err.message}`);
      continue;
    }
    const job = body?.data ?? body;
    const teamName = job?.assigned_to_team?.[0]?.team?.team_name ?? null;

    if (!teamName || unassignedish(teamName)) {
      counts.NO_TEAM_IN_ZUPER += 1;
      console.log(
        `  [NO_TEAM_IN_ZUPER] uid=${c.zuperJobUid}  status=${c.status}  type=${c.type}  ` +
          `zuperTeam=${teamName ?? 'null'}  "${(c.title ?? '').slice(0, 50)}"`,
      );
      // Still refresh zuperTeamName to match Zuper's current state (could be
      // a row whose previous team got cleared upstream — keep us in sync).
      if (!DRY_RUN && c.zuperTeamName !== teamName) {
        await sql`UPDATE jobs SET "zuperTeamName" = ${teamName}, "zuperSyncedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${c.id}`;
      }
      continue;
    }

    // Look up crews.name = teamName.
    const crewRows = await sql`SELECT id, name FROM crews WHERE name = ${teamName} LIMIT 1`;

    if (crewRows.length === 0) {
      counts.TEAM_NOT_IN_CREWS_TABLE += 1;
      console.log(
        `  [TEAM_NOT_IN_CREWS_TABLE] uid=${c.zuperJobUid}  team="${teamName}"  ` +
          `"${(c.title ?? '').slice(0, 50)}"`,
      );
      // Still update zuperTeamName so a future bridge can re-attempt.
      if (!DRY_RUN && c.zuperTeamName !== teamName) {
        await sql`UPDATE jobs SET "zuperTeamName" = ${teamName}, "zuperSyncedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${c.id}`;
      }
      continue;
    }

    const crew = crewRows[0];
    if (DRY_RUN) {
      counts.FIXED += 1;
      console.log(
        `  [FIXED-dry] uid=${c.zuperJobUid}  ${c.zuperTeamName ?? 'null'} → ${teamName}  crewId=${crew.id}`,
      );
      continue;
    }

    // Race-guard: only update if still crewId IS NULL.
    const updated = await sql`
      UPDATE jobs
         SET "crewId" = ${crew.id},
             "zuperTeamName" = ${teamName},
             "zuperSyncedAt" = NOW(),
             "updatedAt" = NOW()
       WHERE id = ${c.id} AND "crewId" IS NULL
      RETURNING id
    `;
    if (updated.length === 0) {
      counts.ALREADY_BRIDGED += 1;
      console.log(`  [ALREADY_BRIDGED] uid=${c.zuperJobUid}  (crewId set by another writer)`);
    } else {
      counts.FIXED += 1;
      console.log(
        `  [FIXED] uid=${c.zuperJobUid}  team="${teamName}"  crewId=${crew.id}  "${(c.title ?? '').slice(0, 50)}"`,
      );
    }
  }

  console.log('\n── Summary ──');
  console.log(`scanned:                  ${candidates.length}`);
  console.log(`FIXED:                    ${counts.FIXED}`);
  console.log(`NO_TEAM_IN_ZUPER:         ${counts.NO_TEAM_IN_ZUPER}`);
  console.log(`TEAM_NOT_IN_CREWS_TABLE:  ${counts.TEAM_NOT_IN_CREWS_TABLE}`);
  console.log(`ALREADY_BRIDGED:          ${counts.ALREADY_BRIDGED}`);
  console.log(`ERROR:                    ${counts.ERROR}`);
} finally {
  await sql.end({ timeout: 5 });
}
