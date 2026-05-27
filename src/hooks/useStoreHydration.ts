// =============================================================
// useStoreHydration — one-shot loader that runs on app mount.
//
// Fires all collection list calls in parallel and writes the
// results back to the Zustand store via `hydrateCollections`.
// Detects API-vs-demo at runtime: if the first request fails with
// a 401 / network error / 5xx, we fall back to demo mode (seeds +
// localStorage) and still mark the store hydrated so the UI can
// render. A subsequent retry can re-attempt.
// =============================================================
'use client';

import { useCallback, useEffect, useRef } from 'react';

import { client } from '../api/client';
import { useStore } from '../store';
import type { JobTemplate } from '../types';
import {
  checklistsFromDTOs,
  crewFromDTO,
  customerFromDTO,
  jobFromDTO,
  personFromDTO,
  projectFromDTO,
  regionFromDTO,
  templatesFromDTOs,
  timeOffFromDTO,
  truckFromDTO,
} from '../api/storeMappers';

interface Page<T> {
  data: T[];
  limit: number;
  offset: number;
}

interface HydrationStatus {
  loading: boolean;
  hydrated: boolean;
  apiMode: boolean;
  error: string | null;
  retry: () => void;
}

async function fetchAllPages<T>(
  loader: (params: { limit: number; offset: number }) => Promise<Page<T>>,
  limit = 500,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;

  for (let pageNo = 0; pageNo < 100; pageNo += 1) {
    const page = await loader({ limit, offset });
    out.push(...page.data);
    if (page.data.length < limit || page.data.length === 0) break;
    offset += page.data.length;
  }

  return out;
}

export function useStoreHydration(): HydrationStatus {
  const hydrated = useStore((s) => s.hydrated);
  const apiMode = useStore((s) => s.apiMode);
  const hydrationError = useStore((s) => s.hydrationError);
  const setApiMode = useStore((s) => s.setApiMode);
  const setHydrated = useStore((s) => s.setHydrated);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const hydrateCollections = useStore((s) => s.hydrateCollections);

  const inFlight = useRef(false);

  const runHydration = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setHydrated(false, null);
    try {
      // Fan out every list call in parallel. Any failure throws
      // and trips the demo-mode fallback below.
      const [
        jobsRows,
        peopleRows,
        crewsRows,
        trucksRows,
        customersRows,
        projectsRows,
        regionsRows,
        timeOffRows,
        templatesRows,
        checklistsResp,
      ] = await Promise.all([
        fetchAllPages(client.jobs.list),
        fetchAllPages(client.people.list),
        fetchAllPages(client.crews.list),
        fetchAllPages(client.trucks.list),
        fetchAllPages(client.customers.list),
        fetchAllPages(client.projects.list),
        fetchAllPages(client.regions.list),
        fetchAllPages(client.timeOff.list),
        fetchAllPages(client.templates.list),
        client.checklists.list(),
      ]);

      const templates: Record<string, JobTemplate> = templatesFromDTOs(templatesRows);
      const checklists = checklistsFromDTOs(checklistsResp);

      hydrateCollections({
        jobs: jobsRows.map(jobFromDTO),
        people: peopleRows.map(personFromDTO),
        crews: crewsRows.map(crewFromDTO),
        trucks: trucksRows.map(truckFromDTO),
        customers: customersRows.map(customerFromDTO),
        projects: projectsRows.map(projectFromDTO),
        regions: regionsRows.map(regionFromDTO),
        timeOff: timeOffRows.map(timeOffFromDTO),
        templates,
        checklists,
        // checklistResponses are loaded lazily per job (no list endpoint).
      });
      setApiMode(true);
      setHydrated(true, null);
      // Resolve the actor's role + display name in the background.
      // Failure is non-fatal — UI falls back to "no role known".
      void client.me
        .get()
        .then((me) => setCurrentUser(me.role, me.displayName))
        .catch(() => setCurrentUser(null, null));
    } catch (err) {
      const status = (err as { status?: number }).status;
      // 401 or network/5xx → fall back to demo mode (seeds + localStorage).
      // This is the green path for the laptop demo with no DB.
      // eslint-disable-next-line no-console
      console.warn(
        `Store hydration via API failed${status ? ` (status ${status})` : ''}; ` +
          'falling back to demo mode.',
        err,
      );
      setApiMode(false);
      // We still mark hydrated=true so the UI renders the cached
      // seed/localStorage state. `hydrationError` is left null in this
      // case — only set when we genuinely cannot show anything.
      setHydrated(true, null);
    } finally {
      inFlight.current = false;
    }
  }, [hydrateCollections, setApiMode, setHydrated]);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invocation by using
    // the in-flight ref + the persisted `hydrated` flag.
    if (hydrated) return;
    void runHydration();
  }, [hydrated, runHydration]);

  return {
    loading: !hydrated,
    hydrated,
    apiMode,
    error: hydrationError,
    retry: () => {
      setHydrated(false, null);
      void runHydration();
    },
  };
}
