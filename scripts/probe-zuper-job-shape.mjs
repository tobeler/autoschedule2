// Probe: fetch a few unbridged Zuper jobs and inspect crew-like fields.
// READ-ONLY (only GET to Zuper). Logs raw JSON of first 3 responses to a file
// so we can study the contract, then a summary table of crew-like fields for
// the rest.
//
// node scripts/probe-zuper-job-shape.mjs

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
const ZUPER_BASE_URL = env.ZUPER_BASE_URL || process.env.ZUPER_BASE_URL || 'https://us-east-1.zuperpro.com';

if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');
if (!ZUPER_API_KEY) throw new Error('ZUPER_API_KEY not set in .env.local — cannot probe Zuper');

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
      throw new Error(`Zuper ${res.status} ${res.statusText} on ${endpoint}: ${text.slice(0,200)}`);
    }
    return res.json();
  }
}

try {
  // Pull candidate UIDs: active, dated near today, missing crewId. We pick up
  // to 8 across the window for shape inspection.
  const candidates = await sql`
    SELECT id, "zuperJobUid", date, status, type
      FROM jobs
     WHERE "zuperJobUid" IS NOT NULL
       AND date IS NOT NULL
       AND date::date BETWEEN (CURRENT_DATE - 14) AND (CURRENT_DATE + 14)
       AND status NOT IN ('complete','cancelled')
       AND "crewId" IS NULL
     ORDER BY date
     LIMIT 8
  `;
  console.log(`Probing ${candidates.length} candidate Zuper jobs…`);

  const dumpPath = path.resolve(__dirname, '..', 'zuper-job-shape-dump.json');
  const dump = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    let body;
    try {
      body = await zuperGet(`/jobs/${encodeURIComponent(c.zuperJobUid)}`);
    } catch (err) {
      console.log(`  ! ${c.zuperJobUid}  ERROR: ${err.message}`);
      continue;
    }
    const job = body?.data ?? body;

    const teamRefs = job?.assigned_to_team ?? [];
    const teamNames = teamRefs
      .map((t) => t?.team?.team_name ?? t?.team_name ?? null)
      .filter(Boolean);
    const assignedUsers = (job?.assigned_to ?? [])
      .map((a) => `${a?.user?.first_name ?? ''} ${a?.user?.last_name ?? ''}`.trim())
      .filter(Boolean);
    const status = (job?.job_status?.[job.job_status.length - 1]?.status_type ?? '').toUpperCase();

    console.log(
      `  ${c.zuperJobUid}  localStatus=${c.status}  zStatus=${status}  ` +
      `teams=[${teamNames.join('|')}]  users=[${assignedUsers.join('|')}]`,
    );

    // Dump full body for first 3 so we can read the field contract.
    if (i < 3) dump.push({ uid: c.zuperJobUid, localStatus: c.status, body });
  }

  fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
  console.log(`\nWrote ${dump.length} full job bodies to ${dumpPath}`);

  // For the first dumped body, surface top-level field names.
  if (dump[0]) {
    const top = Object.keys(dump[0].body?.data ?? dump[0].body ?? {});
    console.log('\nTop-level fields in /jobs/{uid}:');
    for (const k of top) console.log('  -', k);
  }
} finally {
  await sql.end({ timeout: 5 });
}
