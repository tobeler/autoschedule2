// Standalone backfill: HubSpot installations → customers.address
// Bypasses the dev server. Pulls address fields from HubSpot per
// installation id (encoded in the customer id as hs-legacy-cust-<id>)
// and updates the matching customer row only when its address is empty.
//
// Run:  node scripts/backfill-customer-addresses.mjs
//
// Safety: READ-ONLY against HubSpot. WRITES only to local Postgres,
// only to customers.address, and only when the existing address is empty.
// Does not touch anything else.

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
const HUBSPOT_TOKEN = env.HUBSPOT_TOKEN || process.env.HUBSPOT_TOKEN;
const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
if (!HUBSPOT_TOKEN) throw new Error('HUBSPOT_TOKEN not set in .env.local');
if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');

const INSTALLATION_OBJECT_ID = '2-31703261';
const PROPS = ['full_address', 'address_city', 'state_province_region', 'address_zip'].join(',');

async function fetchInstallation(id) {
  const url = `https://api.hubapi.com/crm/v3/objects/${INSTALLATION_OBJECT_ID}/${encodeURIComponent(id)}?properties=${PROPS}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.properties ?? null;
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
  try {
    const empties = await sql`
      select id from customers
      where id like 'hs-legacy-cust-%'
        and (address is null or address = '')
    `;
    console.log(`To process: ${empties.length} customer rows`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < empties.length; i++) {
      const cust = empties[i];
      const installId = cust.id.replace(/^hs-legacy-cust-/, '');
      try {
        const props = await fetchInstallation(installId);
        if (!props) {
          skipped++;
        } else {
          const parts = [
            props.full_address,
            props.address_city,
            props.state_province_region,
            props.address_zip,
          ].filter((s) => !!(s && s.length));
          if (parts.length === 0) {
            skipped++;
          } else {
            const addr = parts.join(', ');
            await sql`
              update customers
              set address = ${addr}, "updatedAt" = now()
              where id = ${cust.id} and (address is null or address = '')
            `;
            updated++;
          }
        }
        if ((i + 1) % 50 === 0) {
          console.log(`  progress: ${i + 1}/${empties.length} · updated=${updated} skipped=${skipped} failed=${failed}`);
        }
      } catch (err) {
        failed++;
        if (failed < 5) console.warn(`  ${cust.id}: ${err.message}`);
      }
      // gentle pacing for HubSpot rate limit (~12 rps)
      await new Promise((r) => setTimeout(r, 80));
    }

    console.log(`Done. updated=${updated} skipped=${skipped} failed=${failed}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
