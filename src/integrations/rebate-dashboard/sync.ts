// =============================================================
// rebate-dashboard sync orchestrator — wraps `fetchToSchedule` with
// a small in-memory cache keyed by region (30s TTL). Callers ask for
// the canonical "to-schedule" rows; we return cached entries if fresh
// or refetch on miss.
//
// This module is server-only — it imports from `./client.ts` which
// reads `process.env.REBATE_DASHBOARD_API_KEY`. The browser reaches it
// via the proxy route at `app/api/internal/to-schedule/route.ts`.
//
// The job-shape mapping intentionally stays here (not in the client)
// so the proxy route and any future server-side consumers (cron,
// background sync) share one code path.
// =============================================================
import type { ToScheduleItem, ToScheduleResponse } from './types';
import {
  RebateDashboardApiError,
  RebateDashboardConfigError,
  fetchToSchedule,
  isRebateDashboardConfigured,
} from './client';

export interface RebateDashboardSnapshot {
  fetchedAt: string;
  region: string;
  /** Items as returned by rebate-dashboard. */
  items: ToScheduleItem[];
  /**
   * Canonical key set the consumer should filter our local jobs by.
   * Includes both `zuperJobUid` and `hubspotDealId` values so callers
   * can match against either key.
   */
  zuperJobUids: string[];
  hubspotDealIds: string[];
}

const TTL_MS = 30_000;

interface CacheEntry {
  snapshot: RebateDashboardSnapshot;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function snapshotFromResponse(res: ToScheduleResponse): RebateDashboardSnapshot {
  const zuperJobUids = new Set<string>();
  const hubspotDealIds = new Set<string>();
  for (const item of res.items) {
    if (item.zuperJobUid) zuperJobUids.add(item.zuperJobUid);
    if (item.dealId) hubspotDealIds.add(item.dealId);
  }
  return {
    fetchedAt: res.fetchedAt,
    region: res.region,
    items: res.items,
    zuperJobUids: Array.from(zuperJobUids),
    hubspotDealIds: Array.from(hubspotDealIds),
  };
}

/**
 * Return the cached snapshot for `region` if fresh, otherwise fetch.
 * Throws the underlying error types so callers can distinguish "not
 * configured" (silent fallback) from "fetch failed" (log + fallback).
 */
export async function getToScheduleSnapshot(
  region: string,
): Promise<RebateDashboardSnapshot> {
  if (!isRebateDashboardConfigured()) throw new RebateDashboardConfigError();

  const key = region.toUpperCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.snapshot;

  const res = await fetchToSchedule(key);
  const snapshot = snapshotFromResponse(res);
  cache.set(key, { snapshot, expiresAt: now + TTL_MS });
  return snapshot;
}

/**
 * Convenience: get just the list of items. Returns `null` when env
 * vars are missing (so callers can fall back silently without
 * importing the error class). Other failures still throw.
 */
export async function getToScheduleItems(
  region: string,
): Promise<ToScheduleItem[] | null> {
  try {
    const snap = await getToScheduleSnapshot(region);
    return snap.items;
  } catch (err) {
    if (err instanceof RebateDashboardConfigError) return null;
    throw err;
  }
}

/** Test / dev helper — wipe the cache. Not exported through index. */
export function _resetCacheForTests() {
  cache.clear();
}

export { RebateDashboardApiError, RebateDashboardConfigError };
