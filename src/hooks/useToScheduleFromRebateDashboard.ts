// =============================================================
// useToScheduleFromRebateDashboard — client hook that fetches the
// canonical "to be scheduled" set from rebate-dashboard via the
// same-origin `/api/internal/to-schedule` proxy.
//
// State machine:
//   - 'idle'        → request not yet started
//   - 'loading'     → first fetch in flight
//   - 'configured'  → fetched, env vars present, items returned
//   - 'unavailable' → env vars missing OR fetch failed; caller falls
//                     back to the local `readyToScheduleJobs` selector
//
// We re-fetch when the active region prefix changes (one request per
// distinct region). The server keeps a 30s in-memory cache, so rapid
// region toggles are cheap.
// =============================================================
'use client';

import { useEffect, useRef, useState } from 'react';

export interface RebateDashboardLiveData {
  status: 'idle' | 'loading' | 'configured' | 'unavailable';
  region: string | null;
  /** Set of zuperJobUid values present in the canonical list. */
  zuperJobUids: Set<string>;
  /** Set of HubSpot deal ids present (used as a secondary key). */
  hubspotDealIds: Set<string>;
  /** Last successful fetch ISO timestamp, or null. */
  fetchedAt: string | null;
}

const INITIAL: RebateDashboardLiveData = {
  status: 'idle',
  region: null,
  zuperJobUids: new Set(),
  hubspotDealIds: new Set(),
  fetchedAt: null,
};

interface ProxyResponse {
  configured: boolean;
  region: string;
  fetchedAt?: string;
  zuperJobUids?: string[];
  hubspotDealIds?: string[];
  error?: string;
}

/**
 * @param region 2-letter region prefix (e.g. 'CO'). When null, the hook
 *   stays in the 'unavailable' state — the local fallback selector
 *   covers the "all regions" case which the rebate-dashboard endpoint
 *   doesn't currently expose.
 */
export function useToScheduleFromRebateDashboard(
  region: string | null,
): RebateDashboardLiveData {
  const [state, setState] = useState<RebateDashboardLiveData>(INITIAL);
  // Track the most recent region we kicked off so out-of-order responses
  // can't overwrite a newer fetch's result.
  const inflightRegion = useRef<string | null>(null);

  useEffect(() => {
    if (!region) {
      setState({
        status: 'unavailable',
        region: null,
        zuperJobUids: new Set(),
        hubspotDealIds: new Set(),
        fetchedAt: null,
      });
      return;
    }

    inflightRegion.current = region;
    setState((prev) => ({ ...prev, status: 'loading', region }));

    const controller = new AbortController();
    fetch(`/api/internal/to-schedule?region=${encodeURIComponent(region)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as ProxyResponse | null;
        if (inflightRegion.current !== region) return; // stale
        if (!res.ok || !json) {
          console.warn(
            '[rebate-dashboard] proxy returned',
            res.status,
            json?.error ?? '(no body)',
          );
          setState({
            status: 'unavailable',
            region,
            zuperJobUids: new Set(),
            hubspotDealIds: new Set(),
            fetchedAt: null,
          });
          return;
        }
        if (!json.configured) {
          setState({
            status: 'unavailable',
            region,
            zuperJobUids: new Set(),
            hubspotDealIds: new Set(),
            fetchedAt: null,
          });
          return;
        }
        setState({
          status: 'configured',
          region,
          zuperJobUids: new Set(json.zuperJobUids ?? []),
          hubspotDealIds: new Set(json.hubspotDealIds ?? []),
          fetchedAt: json.fetchedAt ?? null,
        });
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[rebate-dashboard] fetch failed', err);
        if (inflightRegion.current !== region) return;
        setState({
          status: 'unavailable',
          region,
          zuperJobUids: new Set(),
          hubspotDealIds: new Set(),
          fetchedAt: null,
        });
      });

    return () => controller.abort();
  }, [region]);

  return state;
}
