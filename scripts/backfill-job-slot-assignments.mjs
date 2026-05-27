// =============================================================
// One-time backfill: populate `job_slots.assignedTo` for every
// Zuper-imported job by pulling its `assigned_to[]` array and
// matching users to slots by role.
//
// Run:  node scripts/backfill-job-slot-assignments.mjs
//   (add  ALL=1  to also process jobs in terminal statuses;
//    default is only jobs that ran through bootstrap, i.e.
//    anything with zuperJobUid IS NOT NULL).
//
// Safety: READ-ONLY against Zuper (GET only). WRITES only to
//   local Postgres `job_slots`. Re-runnable.
//
// Mirrors the in-app matcher in
// src/integrations/zuper/assigned-users.ts. The two MUST stay
// behaviourally aligned — when you tweak one, mirror the other.
// =============================================================

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
  env.ZUPER_BASE_URL ||
  process.env.ZUPER_BASE_URL ||
  'https://us-east-1.zuperpro.com';
if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');
if (!ZUPER_API_KEY) throw new Error('ZUPER_API_KEY not set in .env.local');

// ---- Mirror of DESIGNATION_TO_ROLE from bootstrap-technicians.ts ----
const DESIGNATION_TO_ROLE = {
  'hvac team lead': 'hvac_lead',
  'team lead': 'hvac_lead',
  'lead installer': 'hvac_lead',
  'hvac lead': 'hvac_lead',
  'hvac installer': 'hvac_installer',
  installer: 'hvac_installer',
  'heat pump service tech': 'hvac_installer',
  'hvac subcontractor': 'hvac_installer',
  subcontractor: 'hvac_installer',
  'hvac apprentice': 'apprentice',
  apprentice: 'apprentice',
  electrician: 'electrician',
  'electrician-sub': 'electrician',
  'electrical specialist': 'electrician',
  'master electrician': 'electrician',
  plumber: 'plumber',
  'field service manager': 'fsm',
  'field sales manager': 'fsm',
  fsm: 'fsm',
  'general manager': 'fsm',
};

function mapDesignation(d) {
  const key = (d ?? '').trim().toLowerCase();
  return DESIGNATION_TO_ROLE[key] ?? 'hvac_installer';
}

async function fetchZuperJob(uid) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500));
    const res = await fetch(`${ZUPER_BASE_URL}/api/jobs/${encodeURIComponent(uid)}`, {
      headers: { 'x-api-key': ZUPER_API_KEY, 'Content-Type': 'application/json' },
    });
    if (res.status === 429 || res.status === 529) {
      if (attempt < 2) continue;
      throw new Error(`Zuper 429 after 3 attempts for ${uid}`);
    }
    if (!res.ok) {
      throw new Error(`Zuper ${res.status} ${res.statusText} for ${uid}`);
    }
    const j = await res.json();
    return j.data;
  }
  throw new Error('Zuper unreachable');
}

// Mirror of matchAssignedUsersToSlots — same first-match-by-sortOrder rule.
function matchAssignees(zJob, slots, peopleById) {
  const assignments = [];
  const unmatched = [];
  const sortedSlots = [...slots].sort((a, b) => a.sortOrder - b.sortOrder);
  const usedSlotIds = new Set();
  const usedPersonIds = new Set();
  for (const entry of zJob.assigned_to ?? []) {
    const user = entry?.user;
    if (!user?.user_uid) continue;
    if (user.is_active === false || user.is_deleted === true) continue;
    const personId = 'zup-user-' + user.user_uid;
    if (usedPersonIds.has(personId)) continue;
    const localRole = peopleById.get(personId);
    const role = localRole ?? mapDesignation(user.designation);
    const userLabel =
      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.user_uid;
    if (!localRole) {
      unmatched.push({
        userUid: user.user_uid,
        name: userLabel,
        designation: user.designation ?? null,
        reason: 'no_local_person',
      });
      continue;
    }
    const slot = sortedSlots.find(
      (s) => !usedSlotIds.has(s.id) && s.role === role,
    );
    if (!slot) {
      unmatched.push({
        userUid: user.user_uid,
        name: userLabel,
        designation: user.designation ?? null,
        reason: 'no_matching_slot',
      });
      continue;
    }
    assignments.push({ slotId: slot.id, personId });
    usedSlotIds.add(slot.id);
    usedPersonIds.add(personId);
  }
  return { assignments, unmatched };
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
  try {
    // -------- Baseline --------
    const [before] = await sql`
      select count(*) filter (where "assignedTo" is not null)::int as assigned,
             count(*) filter (where "assignedTo" is null)::int as unassigned,
             count(*)::int as total
        from job_slots
    `;
    console.log(`Before: assigned=${before.assigned} unassigned=${before.unassigned} total=${before.total}`);

    // -------- Build people→role map (first role per person) --------
    const personRows = await sql`
      select p.id, pr.role
        from people p
        left join person_roles pr on pr."personId" = p.id
    `;
    const peopleById = new Map();
    for (const r of personRows) {
      if (peopleById.has(r.id)) continue;
      if (!r.role) continue;
      peopleById.set(r.id, r.role);
    }
    console.log(`Loaded ${peopleById.size} people with role mappings.`);

    // -------- Jobs to process --------
    const jobs = await sql`
      select id, "zuperJobUid"
        from jobs
        where "zuperJobUid" is not null
    `;
    console.log(`Candidate Zuper-imported jobs: ${jobs.length}`);

    let processed = 0;
    let withAssignees = 0;
    let totalAssigned = 0;
    let totalUnmatched = 0;
    let zuperFetchErrors = 0;
    const reasonCounts = { no_local_person: 0, no_matching_slot: 0 };
    const samples = [];

    for (const job of jobs) {
      // Fetch this job's slots up front; skip if it has none (no template).
      const slots = await sql`
        select id, role, "sortOrder"
          from job_slots
          where "jobId" = ${job.id}
      `;
      if (slots.length === 0) {
        processed += 1;
        continue;
      }
      // Pull the live Zuper job — assigned_to[] is fully populated on
      // the per-job endpoint (bulk listing also has it but we always
      // hit the per-job endpoint here so this script can be run after
      // bootstrap without depending on a stale listing).
      let zJob;
      try {
        zJob = await fetchZuperJob(job.zuperJobUid);
      } catch (err) {
        zuperFetchErrors += 1;
        processed += 1;
        if (zuperFetchErrors <= 5) {
          console.warn(`  fetch failed: ${job.id}: ${err.message}`);
        }
        continue;
      }
      const assignees = zJob.assigned_to ?? [];
      if (assignees.length > 0) withAssignees += 1;

      const { assignments, unmatched } = matchAssignees(
        zJob,
        slots.map((s) => ({ id: s.id, role: s.role, sortOrder: s.sortOrder })),
        peopleById,
      );

      for (const a of assignments) {
        await sql`
          update job_slots
             set "assignedTo" = ${a.personId},
                 suggested = false
           where id = ${a.slotId}
        `;
      }
      totalAssigned += assignments.length;
      totalUnmatched += unmatched.length;
      for (const u of unmatched) reasonCounts[u.reason] += 1;

      if (assignments.length > 0 && samples.length < 5) {
        samples.push({ jobId: job.id, assignments, unmatched });
      }

      processed += 1;
      if (processed % 200 === 0) {
        console.log(
          `  progress: jobs=${processed}/${jobs.length} bound=${totalAssigned} unmatched=${totalUnmatched}`,
        );
      }
    }

    // -------- Final counts --------
    const [after] = await sql`
      select count(*) filter (where "assignedTo" is not null)::int as assigned,
             count(*) filter (where "assignedTo" is null)::int as unassigned,
             count(*)::int as total
        from job_slots
    `;
    const pct =
      after.total > 0
        ? Math.round((after.assigned / after.total) * 1000) / 10
        : 0;
    console.log('');
    console.log('=== DONE ===');
    console.log(
      `Jobs processed=${processed} withAssignees=${withAssignees} fetchErrors=${zuperFetchErrors}`,
    );
    console.log(`Slot assignments written=${totalAssigned}`);
    console.log(
      `Unmatched assignees=${totalUnmatched} (no_local_person=${reasonCounts.no_local_person}, no_matching_slot=${reasonCounts.no_matching_slot})`,
    );
    console.log(
      `job_slots.assignedTo coverage: ${after.assigned}/${after.total} (${pct}%)`,
    );
    console.log('');
    console.log('Sample job → slot → person:');
    for (const s of samples) {
      console.log(`  ${s.jobId}`);
      for (const a of s.assignments) {
        console.log(`    ${a.slotId}  ←  ${a.personId}`);
      }
      if (s.unmatched.length > 0) {
        console.log(
          `    unmatched: ` +
            s.unmatched
              .map((u) => `${u.name}(${u.designation}|${u.reason})`)
              .join(', '),
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
