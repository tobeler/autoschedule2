// Verify the new categorizeJob() predicate against the live DB.
// READ-ONLY. node scripts/verify-ready-to-schedule-count.mjs

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

// Mirror src/lib/ready-to-schedule.ts (post-port).
const SCHEDULABLE_CATEGORIES = new Set([
  'installation',
  'service',
  'repair',
  'followup',
  'walkthrough',
  'sub',
]);

// Mirror the Job.type → ReadyCategory mapping settled on in the port.
function categorizeJobType(type) {
  const t = (type || '').toLowerCase();
  switch (t) {
    case 'heatpump':
    case 'water_heater':
    case 'water':
    case 'electrical':
    case 'ev':
    case 'retrofit':
      return 'installation';
    case 'walkthrough':
      return 'walkthrough';
    case 'callback':
    case 'followup':
      return 'followup';
    case 'sub':
      return 'sub';
    case 'estimate':
      return 'estimate';
    case 'inspection':
      return 'inspection';
    case 'meeting':
    case 'training':
      return 'admin';
    case 'additional':
      return 'service';
    case 'service':
    case 'warranty':
      return 'service';
    default:
      if (/^repair/.test(t)) return 'repair';
      return 'other';
  }
}

const SCHEDULED_OR_LATER = new Set(['scheduled', 'enroute', 'onsite']);
const COMPLETED = new Set(['complete', 'cancelled']);

function isCallbackNeedsReschedule(j) {
  return j.status === 'callback' && !j.date;
}

function hasScheduledSibling(j, byProject) {
  if (!j.projectId) return false;
  const siblings = byProject.get(j.projectId) || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of siblings) {
    if (s.id === j.id) continue;
    if (s.type === 'walkthrough' || s.type === 'followup') continue;
    if (SCHEDULED_OR_LATER.has(s.status)) return true;
    if (s.date) {
      const d = new Date(s.date + 'T12:00:00');
      if (!Number.isNaN(d.getTime()) && d.getTime() >= today.getTime()) return true;
    }
  }
  return false;
}

function isAlreadyScheduled(j, byProject) {
  if (isCallbackNeedsReschedule(j)) return false;
  if (SCHEDULED_OR_LATER.has(j.status)) return true;
  if (j.date) return true;
  return hasScheduledSibling(j, byProject);
}

function readyOld(j, byProject) {
  // The OLD predicate — DISPATCHABLE_TYPES.has(j.type)
  const OLD_TYPES = new Set([
    'heatpump','water_heater','electrical','ev',
    'repair-general-legacy','repair-service-care','repair-customer-pay','repair-install-warranty',
    'additional','callback','followup','walkthrough','estimate','inspection','sub',
  ]);
  if (COMPLETED.has(j.status)) return false;
  if (isAlreadyScheduled(j, byProject)) return false;
  if (!OLD_TYPES.has(j.type)) return false;
  return true;
}

function readyNew(j, byProject) {
  if (COMPLETED.has(j.status)) return false;
  if (isAlreadyScheduled(j, byProject)) return false;
  const cat = categorizeJobType(j.type);
  if (!SCHEDULABLE_CATEGORIES.has(cat)) return false;
  return true;
}

try {
  const jobs = await sql`
    SELECT id, status, date, type, "projectId"
      FROM jobs
  `;

  // Group by project for sibling lookup
  const byProject = new Map();
  for (const j of jobs) {
    if (!j.projectId) continue;
    const arr = byProject.get(j.projectId) || [];
    arr.push(j);
    byProject.set(j.projectId, arr);
  }

  let oldCount = 0;
  let newCount = 0;
  const byCategoryOld = new Map();
  const byCategoryNew = new Map();
  const droppedByCategory = new Map();

  for (const j of jobs) {
    const cat = categorizeJobType(j.type);
    const o = readyOld(j, byProject);
    const n = readyNew(j, byProject);
    if (o) {
      oldCount++;
      byCategoryOld.set(cat, (byCategoryOld.get(cat) || 0) + 1);
    }
    if (n) {
      newCount++;
      byCategoryNew.set(cat, (byCategoryNew.get(cat) || 0) + 1);
    }
    if (o && !n) {
      droppedByCategory.set(cat, (droppedByCategory.get(cat) || 0) + 1);
    }
  }

  console.log('Total jobs in DB:', jobs.length);
  console.log('');
  console.log('OLD ready-to-schedule count (DISPATCHABLE_TYPES):', oldCount);
  console.log('  by category:');
  for (const [cat, n] of [...byCategoryOld.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(14)} ${n}`);
  }
  console.log('');
  console.log('NEW ready-to-schedule count (categorizeJob):', newCount);
  console.log('  by category:');
  for (const [cat, n] of [...byCategoryNew.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(14)} ${n}`);
  }
  console.log('');
  console.log('Dropped by category (in old, not in new):');
  for (const [cat, n] of [...droppedByCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(14)} ${n}`);
  }

  // Per-type breakdown of dropped jobs
  console.log('');
  console.log('All jobs by type (in DB):');
  const byType = new Map();
  for (const j of jobs) {
    byType.set(j.type, (byType.get(j.type) || 0) + 1);
  }
  for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${(t || '(null)').padEnd(28)} ${n}    → ${categorizeJobType(t)}`);
  }
} finally {
  await sql.end();
}
