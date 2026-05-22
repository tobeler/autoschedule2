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
  crewRosterOverrideFromDTO,
  customerFromDTO,
  jobFromDTO,
  personFromDTO,
  projectFromDTO,
  regionFromDTO,
  templatesFromDTOs,
  timeOffFromDTO,
  truckFromDTO,
} from '../api/storeMappers';

interface HydrationStatus {
  loading: boolean;
  hydrated: boolean;
  apiMode: boolean;
  error: string | null;
  retry: () => void;
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
        jobsPage,
        peoplePage,
        crewsPage,
        crewRosterOverridesPage,
        trucksPage,
        customersPage,
        projectsPage,
        regionsPage,
        timeOffPage,
        templatesPage,
        checklistsResp,
      ] = await Promise.all([
        client.jobs.list({ limit: 500 }),
        client.people.list({ limit: 500 }),
        client.crews.list({ limit: 500 }),
        client.crewRosterOverrides.list({ limit: 1000 }),
        client.trucks.list({ limit: 500 }),
        client.customers.list({ limit: 500 }),
        client.projects.list({ limit: 500 }),
        client.regions.list({ limit: 500 }),
        client.timeOff.list({ limit: 1000 }),
        client.templates.list({ limit: 500 }),
        client.checklists.list(),
      ]);

      const templates: Record<string, JobTemplate> = templatesFromDTOs(templatesPage.data);
      const checklists = checklistsFromDTOs(checklistsResp);

      hydrateCollections({
        jobs: jobsPage.data.map(jobFromDTO),
        people: peoplePage.data.map(personFromDTO),
        crews: crewsPage.data.map(crewFromDTO),
        crewRosterOverrides: crewRosterOverridesPage.data.map(crewRosterOverrideFromDTO),
        trucks: trucksPage.data.map(truckFromDTO),
        customers: customersPage.data.map(customerFromDTO),
        projects: projectsPage.data.map(projectFromDTO),
        regions: regionsPage.data.map(regionFromDTO),
        timeOff: timeOffPage.data.map(timeOffFromDTO),
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
