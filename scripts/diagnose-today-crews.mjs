// Diagnose today's missing-crew jobs. READ-ONLY.
// node scripts/diagnose-today-crews.mjs

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

try {
  console.log('Today (server) =', new Date().toISOString());

  const today = await sql`SELECT CURRENT_DATE::text AS d`;
  console.log('Postgres CURRENT_DATE =', today[0].d);

  console.log('\n── 1. Total jobs scheduled for today ───────────────────');
  const total = await sql`
    SELECT COUNT(*)::int AS n FROM jobs WHERE date = CURRENT_DATE::text
  `;
  console.log('Total jobs today:', total[0].n);

  console.log('\n── 2. Today jobs missing crewId ───────────────────');
  const missing = await sql`
    SELECT COUNT(*)::int AS n FROM jobs
     WHERE date = CURRENT_DATE::text
       AND "crewId" IS NULL
  `;
  console.log('Missing crewId today:', missing[0].n);

  console.log('\n── 3. Of missing-crew today, breakdown by zuperTeamName ──');
  const breakdown = await sql`
    SELECT
      CASE
        WHEN "zuperTeamName" IS NULL THEN '<NULL>'
        WHEN "zuperTeamName" = '' THEN '<empty>'
        ELSE "zuperTeamName"
      END AS team_name,
      COUNT(*)::int AS n
    FROM jobs
    WHERE date = CURRENT_DATE::text AND "crewId" IS NULL
    GROUP BY 1
    ORDER BY n DESC
  `;
  for (const r of breakdown) console.log(`  - ${String(r.n).padStart(4)}  ${r.team_name}`);

  console.log('\n── 4. UIDs of today-missing-crew jobs without zuperTeamName ──');
  const noTeam = await sql`
    SELECT id, "zuperJobUid", status, type, title, "projectId"
      FROM jobs
     WHERE date = CURRENT_DATE::text
       AND "crewId" IS NULL
       AND ("zuperTeamName" IS NULL OR "zuperTeamName" = '')
       AND "zuperJobUid" IS NOT NULL
     ORDER BY id
  `;
  console.log('count:', noTeam.length);
  for (const r of noTeam.slice(0, 50)) {
    console.log(`  - uid=${r.zuperJobUid}  status=${r.status}  type=${r.type}  title="${(r.title ?? '').slice(0, 50)}"`);
  }
  if (noTeam.length > 50) console.log(`  …+${noTeam.length - 50} more`);

  console.log('\n── 5. Today jobs missing crewId but zuperTeamName IS SET (bridge gap) ──');
  const bridgeGap = await sql`
    SELECT id, "zuperJobUid", "zuperTeamName", status, type
      FROM jobs
     WHERE date = CURRENT_DATE::text
       AND "crewId" IS NULL
       AND "zuperTeamName" IS NOT NULL
       AND "zuperTeamName" <> ''
     ORDER BY "zuperTeamName"
  `;
  console.log('count:', bridgeGap.length);
  for (const r of bridgeGap.slice(0, 30)) {
    const inCrews = await sql`SELECT id FROM crews WHERE name = ${r.zuperTeamName} LIMIT 1`;
    const tag = inCrews.length > 0 ? `[crewExists=${inCrews[0].id}]` : '[noCrewRow]';
    console.log(`  - uid=${r.zuperJobUid}  team="${r.zuperTeamName}" ${tag}`);
  }
  if (bridgeGap.length > 30) console.log(`  …+${bridgeGap.length - 30} more`);
} finally {
  await sql.end({ timeout: 5 });
}
