// =============================================================
// One-time backfill: populate job_slots from JOB_TEMPLATES for
// every existing job that has zero slots and a recognized type.
//
// Run:  node scripts/backfill-job-slots.mjs
//
// Safety: WRITES only to local Postgres job_slots. Uses
//   INSERT ... ON CONFLICT DO NOTHING with deterministic slot ids,
//   so re-running is a no-op. No HubSpot / Zuper traffic.
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
if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');

// Mirror of TYPE_TO_TEMPLATE in src/integrations/zuper/job-slot-templates.ts.
// Kept in sync manually — only 6 keys, low churn.
const TYPE_TO_TEMPLATE = {
  heatpump: 'heatpump',
  walkthrough: 'walkthrough',
  callback: 'callback',
  water_heater: 'water',
  electrical: 'electrical',
  ev: 'electrical',
  followup: 'walkthrough',
  estimate: 'walkthrough',
  inspection: 'walkthrough',
  'repair-general-legacy': 'service',
  'repair-service-care': 'service',
  'repair-customer-pay': 'service',
  additional: 'service',
  'repair-install-warranty': 'warranty',
};

// Mirror of JOB_TEMPLATES.slots in src/data/seed.ts.
const TEMPLATES = {
  heatpump: [
    { role: 'hvac_lead', level: 'L2', hours: 8, start: 0, optional: false },
    { role: 'hvac_installer', level: 'L1', hours: 8, start: 0, optional: false },
    { role: 'apprentice', level: 'L1', hours: 8, start: 0, optional: true },
    { role: 'electrician', level: 'L2', hours: 3, start: 4, optional: false },
  ],
  water: [
    { role: 'plumber', level: 'L2', hours: 5, start: 0, optional: false },
    { role: 'electrician', level: 'L1', hours: 2, start: 1, optional: false },
    { role: 'apprentice', level: 'L1', hours: 5, start: 0, optional: false },
  ],
  electrical: [
    { role: 'electrician', level: 'L3', hours: 6, start: 0, optional: false },
    { role: 'apprentice', level: 'L1', hours: 6, start: 0, optional: false },
  ],
  service: [
    { role: 'hvac_installer', level: 'L2', hours: 2, start: 0, optional: false },
  ],
  warranty: [
    { role: 'hvac_installer', level: 'L2', hours: 2, start: 0, optional: false },
  ],
  callback: [{ role: 'hvac_lead', level: 'L2', hours: 1.5, start: 0, optional: false }],
  walkthrough: [{ role: 'fsm', level: 'L1', hours: 1.5, start: 0, optional: false }],
};

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
  try {
    const jobs = await sql`
      select j.id, j.type
      from jobs j
      left join job_slots s on s."jobId" = j.id
      where s.id is null
        and j.type is not null
    `;
    console.log(`Candidate jobs (no slots): ${jobs.length}`);

    const byTemplate = {};
    let queued = 0;
    let skipped = 0;
    for (const j of jobs) {
      const key = TYPE_TO_TEMPLATE[j.type];
      if (!key) {
        skipped++;
        continue;
      }
      const slots = TEMPLATES[key];
      if (!slots) {
        skipped++;
        continue;
      }
      byTemplate[key] = (byTemplate[key] ?? 0) + 1;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const slotId = `${j.id}::slot-${i}-${s.role}`;
        await sql`
          insert into job_slots (id, "jobId", role, level, hours, "startOffsetHours", optional, "assignedTo", suggested, "sortOrder")
          values (${slotId}, ${j.id}, ${s.role}, ${s.level}, ${s.hours}::numeric, ${s.start}::numeric, ${s.optional}, null, false, ${i})
          on conflict (id) do nothing
        `;
        queued++;
      }
      if (Object.values(byTemplate).reduce((a, b) => a + b, 0) % 200 === 0) {
        console.log(
          '  progress: ' +
            Object.entries(byTemplate)
              .map(([k, n]) => `${k}=${n}`)
              .join(' ') +
            ` · slots inserted=${queued}`,
        );
      }
    }
    console.log(`Done. jobs=${jobs.length - skipped} slots=${queued} skipped=${skipped}`);
    console.log(`By template: ${JSON.stringify(byTemplate)}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
