// Cleanup audit: ports the rebate-dashboard PC "Clean-up" section rules
// (samuellegge/rebate-dashboard public/pc-dashboard.js: computeCleanupFlags)
// to autoschedule2's local DB. READ-ONLY — emits a report; writes nothing.
//
// Adapted because our schema normalizes Zuper job status → JobStatus enum
// and collapses HubSpot installation_stage_sync → ProjectStatus enum.
// Stage-label-specific rules (e.g. "HS=Ready for Walkthrough but the
// walkthrough is booked") can only be approximated locally; we run what
// we can faithfully and flag the gaps.
//
// Run:  node scripts/cleanup-audit.mjs

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
if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');

const sql = postgres(DATABASE_URL, { prepare: false });

const SAMPLES = 5;

function header(title) {
  console.log(`\n${'═'.repeat(70)}\n${title}\n${'═'.repeat(70)}`);
}
function subhead(s) {
  console.log(`\n── ${s} ${'─'.repeat(Math.max(2, 65 - s.length))}`);
}

try {
  header('autoschedule2 cleanup audit (rebate-dashboard rule port)');

  // ────────────────────────────────────────────────────────────────
  // RULE A — Scheduled but unassigned (Zuper job, has a date, status
  // active, no real team assignment for the region).
  //   rebate-dashboard: r.rowType === 'zuper' && r.scheduledDate &&
  //   !cancelled && !completed && !hasRealAssignment(r)
  // autoschedule2:    zuperJobUid IS NOT NULL, date IS NOT NULL,
  //   status NOT IN ('complete','cancelled'), crewId IS NULL,
  //   and zuperTeamName empty or unassigned-y.
  // ────────────────────────────────────────────────────────────────
  subhead('A. Scheduled but unassigned');
  const ruleA = await sql`
    SELECT j.id, j.type, j.status, j.date, j."zuperJobUid",
           j."zuperTeamName", j."crewId", j.title, j.address
      FROM jobs j
     WHERE j."zuperJobUid" IS NOT NULL
       AND j.date IS NOT NULL
       AND j.status NOT IN ('complete', 'cancelled')
       AND j."crewId" IS NULL
       AND (
         j."zuperTeamName" IS NULL
         OR j."zuperTeamName" = ''
         OR j."zuperTeamName" ILIKE 'unassigned%'
         OR j."zuperTeamName" ILIKE 'admin team%'
       )
  `;
  console.log(`count: ${ruleA.length}`);
  for (const r of ruleA.slice(0, SAMPLES)) {
    console.log(`  - ${r.id} | ${r.date} | status=${r.status} | type=${r.type} | team=${r.zuperTeamName ?? 'NULL'} | "${r.title?.slice(0, 50) ?? ''}"`);
  }
  if (ruleA.length > SAMPLES) console.log(`  …+${ruleA.length - SAMPLES} more`);

  // Sub-question: of A, how many do have a zuperTeamName but it doesn't
  // resolve to a crewId? That's the "bridge failed" subset vs the
  // "really unassigned" subset.
  subhead('A.1 Of A: zuperTeamName set but crewId never bridged');
  const ruleA1 = await sql`
    SELECT j."zuperTeamName", COUNT(*)::int AS n
      FROM jobs j
     WHERE j."zuperJobUid" IS NOT NULL
       AND j.date IS NOT NULL
       AND j.status NOT IN ('complete', 'cancelled')
       AND j."crewId" IS NULL
       AND j."zuperTeamName" IS NOT NULL
       AND j."zuperTeamName" <> ''
       AND j."zuperTeamName" NOT ILIKE 'unassigned%'
       AND j."zuperTeamName" NOT ILIKE 'admin team%'
  GROUP BY j."zuperTeamName"
  ORDER BY n DESC
     LIMIT 15
  `;
  console.log(`distinct team names: ${ruleA1.length}`);
  for (const r of ruleA1) console.log(`  - ${r.n.toString().padStart(4)}  ${r.zuperTeamName}`);

  // ────────────────────────────────────────────────────────────────
  // RULE B — Walkthrough stage drift.
  //   rebate-dashboard: r.rowType === 'installation' &&
  //     r.stageLabel === 'Ready for Walkthrough' &&
  //     r.jobType === 'walkthrough' &&
  //     (r.scheduledDate || isZuperScheduledOrLater(status))
  // autoschedule2:    we don't store the HubSpot stage label. The closest
  //   proxy: project.status='proposed' AND a walkthrough job exists that
  //   is scheduled/enroute/onsite or has a date.
  //   This is a SUPERSET of the real signal — proposed projects past the
  //   walkthrough booking moment but not yet moved to "Walkthrough
  //   Scheduled" in HubSpot.
  // ────────────────────────────────────────────────────────────────
  subhead('B. Walkthrough stage drift (approximation — no stage labels locally)');
  const ruleB = await sql`
    SELECT j.id, j.date, j.status, j."projectId", p.status AS project_status,
           j.title
      FROM jobs j
      JOIN projects p ON p.id = j."projectId"
     WHERE j.type = 'walkthrough'
       AND p.status = 'proposed'
       AND (j.date IS NOT NULL OR j.status IN ('scheduled', 'enroute', 'onsite'))
  `;
  console.log(`count: ${ruleB.length}`);
  for (const r of ruleB.slice(0, SAMPLES)) {
    console.log(`  - ${r.id} | ${r.date ?? 'unsched'} | jobStatus=${r.status} | projStatus=${r.project_status} | "${r.title?.slice(0, 50) ?? ''}"`);
  }

  // ────────────────────────────────────────────────────────────────
  // RULE C — Missing follow-up: install-type jobs past their date, not
  // completed or cancelled, no follow-up sibling on the project.
  //   rebate-dashboard: r.rowType === 'installation' &&
  //     r.jobType === 'installation' && isPastDate(r.scheduledDate) &&
  //     !completed && !cancelled && !isZuperNeedsReschedule &&
  //     !followupsByInstall.has(r.id)
  // autoschedule2:    heatpump/water_heater/electrical/ev install types,
  //   date < today, status NOT IN complete/cancelled/callback, no sibling
  //   job on the same projectId with type=followup/callback.
  // ────────────────────────────────────────────────────────────────
  subhead('C. Past-due install with no follow-up');
  const ruleC = await sql`
    WITH installs AS (
      SELECT j.id, j.type, j.status, j.date, j."projectId", j.title, j."zuperJobUid"
        FROM jobs j
       WHERE j.type IN ('heatpump','water_heater','electrical','ev')
         AND j.date IS NOT NULL
         AND j.date::date < CURRENT_DATE
         AND j.status NOT IN ('complete','cancelled','callback')
    ),
    has_followup AS (
      SELECT DISTINCT i.id
        FROM installs i
        JOIN jobs s ON s."projectId" = i."projectId" AND s.id <> i.id
       WHERE s.type IN ('followup','callback')
    )
    SELECT i.*
      FROM installs i
     WHERE NOT EXISTS (SELECT 1 FROM has_followup hf WHERE hf.id = i.id)
  `;
  console.log(`count: ${ruleC.length}`);
  // Distribution by month so we can see whether this is one bad month or chronic
  const monthBucket = new Map();
  for (const r of ruleC) {
    const m = r.date.slice(0, 7);
    monthBucket.set(m, (monthBucket.get(m) ?? 0) + 1);
  }
  const months = [...monthBucket.entries()].sort();
  const lastMonths = months.slice(-8);
  console.log(`  distribution by month (${months.length > 8 ? 'last 8' : 'all'}):`);
  for (const [m, n] of lastMonths) console.log(`    ${m}: ${n}`);
  console.log('  sample rows:');
  for (const r of ruleC.slice(0, SAMPLES)) {
    console.log(`    - ${r.id} | ${r.date} | status=${r.status} | type=${r.type} | "${r.title?.slice(0, 50) ?? ''}"`);
  }

  // ────────────────────────────────────────────────────────────────
  // RULES D / E — Hidden stubs.
  // autoschedule2 doesn't track rebate-dashboard's `hiddenStubs` notion.
  // We can approximate "empty-stub-looking" jobs locally: zuperJobUid set,
  // no date, no crewId, status='unscheduled', AND a SIBLING on the same
  // project is already complete (D) OR the project has moved to a later
  // status (E).
  // ────────────────────────────────────────────────────────────────
  subhead('D. Duplicate-looking stub (sibling already complete)');
  const ruleD = await sql`
    SELECT j.id, j.type, j.title, j."projectId"
      FROM jobs j
     WHERE j."zuperJobUid" IS NOT NULL
       AND j.date IS NULL
       AND j.status = 'unscheduled'
       AND j."crewId" IS NULL
       AND EXISTS (
         SELECT 1 FROM jobs s
          WHERE s."projectId" = j."projectId"
            AND s.id <> j.id
            AND s.type = j.type
            AND s.status = 'complete'
       )
  `;
  console.log(`count: ${ruleD.length}`);
  for (const r of ruleD.slice(0, SAMPLES)) {
    console.log(`  - ${r.id} | type=${r.type} | "${r.title?.slice(0, 50) ?? ''}"`);
  }

  subhead('E. Stale walkthrough stub (install moved past)');
  const ruleE = await sql`
    SELECT j.id, j.type, j.title, p.status AS project_status
      FROM jobs j
      JOIN projects p ON p.id = j."projectId"
     WHERE j.type = 'walkthrough'
       AND j."zuperJobUid" IS NOT NULL
       AND j.date IS NULL
       AND j.status = 'unscheduled'
       AND p.status IN ('in_progress','complete','cancelled','warranty')
  `;
  console.log(`count: ${ruleE.length}`);
  for (const r of ruleE.slice(0, SAMPLES)) {
    console.log(`  - ${r.id} | proj=${r.project_status} | "${r.title?.slice(0, 50) ?? ''}"`);
  }

  // ────────────────────────────────────────────────────────────────
  // EXTRA — autoschedule2 specific hygiene that the rebate-dashboard
  // doesn't surface but we know we've struggled with:
  //   F. Placeholder customer names ("Legacy install …" etc) we already
  //      partially backfilled
  //   G. Empty addresses on scheduled-or-later jobs (drive-time / routing
  //      breaks without these)
  //   H. Jobs whose zuperTeamName references a crew we don't have
  //   I. Projects with no jobs (dead deal rows)
  //   J. Customers with no projects AND no jobs (orphans)
  // ────────────────────────────────────────────────────────────────
  subhead('F. Placeholder customer names still in DB');
  const ruleF = await sql`
    SELECT COUNT(*)::int AS n FROM customers WHERE name ILIKE 'Legacy install%' OR name ILIKE 'Unnamed%' OR name = '' OR name IS NULL
  `;
  console.log(`count: ${ruleF[0].n}`);

  subhead('G. Empty address on scheduled-or-later jobs');
  const ruleG = await sql`
    SELECT COUNT(*)::int AS n FROM jobs
     WHERE status IN ('scheduled','enroute','onsite')
       AND (address IS NULL OR address = '')
  `;
  console.log(`count: ${ruleG[0].n}`);

  subhead('H. zuperTeamName set but no matching crew row');
  const ruleH = await sql`
    SELECT j."zuperTeamName", COUNT(*)::int AS n
      FROM jobs j
     WHERE j."zuperTeamName" IS NOT NULL
       AND j."zuperTeamName" <> ''
       AND NOT EXISTS (SELECT 1 FROM crews c WHERE c.name = j."zuperTeamName")
  GROUP BY j."zuperTeamName"
  ORDER BY n DESC
     LIMIT 10
  `;
  console.log(`distinct unbridged teams: ${ruleH.length}`);
  for (const r of ruleH) console.log(`  - ${r.n.toString().padStart(4)}  ${r.zuperTeamName}`);

  subhead('I. Projects with zero jobs');
  const ruleI = await sql`
    SELECT COUNT(*)::int AS n FROM projects p
     WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j."projectId" = p.id)
  `;
  console.log(`count: ${ruleI[0].n}`);

  subhead('J. Customers with no projects AND no jobs');
  const ruleJ = await sql`
    SELECT COUNT(*)::int AS n FROM customers c
     WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p."customerId" = c.id)
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j."customerId" = c.id)
  `;
  console.log(`count: ${ruleJ[0].n}`);

  // ────────────────────────────────────────────────────────────────
  // Totals
  // ────────────────────────────────────────────────────────────────
  header('SUMMARY');
  console.log(`A.  Scheduled but unassigned:           ${ruleA.length}`);
  console.log(`A.1   of A, team-set but unbridged:     ${ruleA1.reduce((n, r) => n + r.n, 0)}`);
  console.log(`B.  Walkthrough stage drift (approx):   ${ruleB.length}`);
  console.log(`C.  Past-due install, no follow-up:     ${ruleC.length}`);
  console.log(`D.  Duplicate-looking stub:             ${ruleD.length}`);
  console.log(`E.  Stale walkthrough stub:             ${ruleE.length}`);
  console.log(`F.  Placeholder customer names:         ${ruleF[0].n}`);
  console.log(`G.  Scheduled-or-later with no addr:    ${ruleG[0].n}`);
  console.log(`H.  Unbridged zuper team names:         ${ruleH.length}`);
  console.log(`I.  Empty projects:                     ${ruleI[0].n}`);
  console.log(`J.  Orphan customers:                   ${ruleJ[0].n}`);
} finally {
  await sql.end({ timeout: 5 });
}
