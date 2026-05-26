// =============================================================
// One-time Zuper address + customer enrichment.
//
// Zuper's bulk `/jobs` endpoint elides `property.property_address`
// and most `customer` fields. The per-job endpoint
// `GET /api/jobs/{uid}` DOES return a populated
// `customer.customer_address` (street/city/state/zip_code) plus
// the customer name + uid for every job we've sampled.
//
// This module walks every Zuper-sourced row in our `jobs` table
// that is missing `address` or `customerId`, calls the single-job
// endpoint, upserts a `customers` row keyed on `zuperCustomerId`,
// and stamps `jobs.address` + `jobs.customerId` from that.
//
// Read-only against Zuper (only GETs). Write-only against our DB.
// Not invoked from anywhere except `POST /api/v1/zuper/enrich`.
// =============================================================

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { customers, jobs as jobsTable } from '@/db/schema';

import { getJob, isZuperConfigured } from './client';
import type { ZuperJob, ZuperPropertyAddress } from './types';

export interface EnrichResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  /** Rows considered (address empty OR customerId null). */
  candidates: number;
  /** Per-job fetches against Zuper that succeeded. */
  fetched: number;
  /** Jobs that got a non-empty address written. */
  addressUpdated: number;
  /** Jobs whose customerId was set (or rebound to an enriched row). */
  customerLinked: number;
  /** customers rows inserted or updated. */
  customersUpserted: number;
  errors: string[];
}

interface EnrichOptions {
  /** Cap iterations for safety (default 2000 — well above current backlog). */
  limit?: number;
  /** Sleep (ms) between Zuper fetches. Zuper is more generous than HubSpot
   *  but we still keep a small gap so we don't trip 429s. */
  gapMs?: number;
}

/** street, city, state, zip joined with ", " — empty if all parts missing. */
function joinAddress(a: ZuperPropertyAddress | null | undefined): string {
  if (!a) return '';
  return [a.street, a.city, a.state, a.zip_code].filter(Boolean).join(', ');
}

/** Best display name from a Zuper customer payload. Falls back to a
 *  Zuper-uid placeholder so we never write an empty `customers.name`. */
function customerDisplayName(zJob: ZuperJob): string {
  const c = zJob.customer;
  const first = c?.customer_first_name?.trim() ?? '';
  const last = c?.customer_last_name?.trim() ?? '';
  const joined = [first, last].filter(Boolean).join(' ');
  if (joined) return joined;
  const uid = c?.customer_uid;
  return uid ? `Zuper customer ${uid.slice(0, 8)}` : 'Unknown customer';
}

/** Phones are returned as `{ home, work, mobile }` — pick the first set. */
function firstPhone(zJob: ZuperJob): string {
  const map = zJob.customer?.customer_contact_no ?? null;
  if (!map) return '';
  for (const v of Object.values(map)) {
    if (v && v.trim()) return v.trim();
  }
  return '';
}

/** Upsert a `customers` row keyed on `zuperCustomerId`. Returns the row id. */
async function ensureCustomerForZuper(
  zJob: ZuperJob,
): Promise<{ customerId: string; upserted: boolean } | null> {
  const uid = zJob.customer?.customer_uid;
  if (!uid) return null;

  const name = customerDisplayName(zJob);
  const address = joinAddress(zJob.customer?.customer_address);
  const phone = firstPhone(zJob);

  // Is there already a row with this zuperCustomerId?
  const existing = (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.zuperCustomerId, uid))
      .limit(1)
  )[0];

  if (existing) {
    await db
      .update(customers)
      .set({
        name,
        address,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, existing.id));
    return { customerId: existing.id, upserted: true };
  }

  // No existing row — create one with id `zup-cust-{uid}`.
  const id = `zup-cust-${uid}`;
  await db
    .insert(customers)
    .values({
      id,
      name,
      address,
      phone,
      zuperCustomerId: uid,
    })
    .onConflictDoUpdate({
      target: customers.id,
      set: {
        name,
        address,
        phone,
        zuperCustomerId: uid,
        updatedAt: new Date(),
      },
    });
  return { customerId: id, upserted: true };
}

export async function enrichZuperJobs(
  opts: EnrichOptions = {},
): Promise<EnrichResult> {
  const result: EnrichResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    candidates: 0,
    fetched: 0,
    addressUpdated: 0,
    customerLinked: 0,
    customersUpserted: 0,
    errors: [],
  };

  if (!isZuperConfigured()) {
    result.errors.push('ZUPER_API_KEY not configured');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const limit = opts.limit ?? 2000;
  const gapMs = opts.gapMs ?? 200;

  // Candidates: Zuper-sourced rows with empty address OR null customerId.
  const candidates = await db
    .select({
      id: jobsTable.id,
      zuperJobUid: jobsTable.zuperJobUid,
      address: jobsTable.address,
      customerId: jobsTable.customerId,
    })
    .from(jobsTable)
    .where(
      sql`${jobsTable.zuperJobUid} IS NOT NULL AND (${jobsTable.address} = '' OR ${jobsTable.customerId} IS NULL)`,
    )
    .limit(limit);

  result.candidates = candidates.length;

  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    if (!row.zuperJobUid) continue;

    let zJob: ZuperJob;
    try {
      zJob = await getJob(row.zuperJobUid);
      result.fetched += 1;
    } catch (err) {
      result.errors.push(
        `fetch ${row.zuperJobUid}: ${(err as Error).message}`,
      );
      // On rate-limit-ish errors, back off harder before continuing.
      if (/429|529|rate/i.test((err as Error).message)) {
        await new Promise((r) => setTimeout(r, 5000));
      }
      continue;
    }

    // Prefer property_address if present, else customer_address.
    const addr =
      joinAddress(zJob.property?.property_address) ||
      joinAddress(zJob.customer?.customer_address);

    let customerId: string | null = row.customerId;
    if (zJob.customer?.customer_uid) {
      try {
        const cust = await ensureCustomerForZuper(zJob);
        if (cust) {
          customerId = cust.customerId;
          if (cust.upserted) result.customersUpserted += 1;
        }
      } catch (err) {
        result.errors.push(
          `customer ${zJob.customer?.customer_uid}: ${(err as Error).message}`,
        );
      }
    }

    try {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (addr) update.address = addr;
      if (customerId) update.customerId = customerId;
      if (Object.keys(update).length > 1) {
        await db.update(jobsTable).set(update).where(eq(jobsTable.id, row.id));
        if (addr) result.addressUpdated += 1;
        if (customerId && customerId !== row.customerId) {
          result.customerLinked += 1;
        }
      }
    } catch (err) {
      result.errors.push(`update ${row.id}: ${(err as Error).message}`);
    }

    // Small gap between Zuper calls.
    if (i < candidates.length - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  result.ok = result.errors.length === 0;
  result.finishedAt = new Date().toISOString();
  return result;
}

