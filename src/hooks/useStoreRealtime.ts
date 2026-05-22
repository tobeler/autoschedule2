// =============================================================
// useStoreRealtime — subscribe to outbox topics and reconcile the
// store on each event. The handler refetches the affected entity
// from the API (which is the source of truth) and applies it via
// the store's `apply*` helpers. This gives last-write-wins via
// `updatedAt` for free, since the refetch returns the latest row.
//
// Demo mode (no Supabase env vars) → events.ts no-ops, so this
// hook still mounts but never fires a handler.
// =============================================================
'use client';

import { useEffect } from 'react';

import { client } from '../api/client';
import { useStore } from '../store';
import { subscribe, type EventPayload, type EventTopic } from '../lib/events';
import {
  crewFromDTO,
  jobFromDTO,
  personFromDTO,
} from '../api/storeMappers';

interface OutboxEnvelope {
  id?: string;
  [k: string]: unknown;
}

function extractId(p: EventPayload): string | null {
  const data = p.data as OutboxEnvelope | null;
  if (data && typeof data.id === 'string') return data.id;
  return null;
}

export function useStoreRealtime(): void {
  const apiMode = useStore((s) => s.apiMode);

  useEffect(() => {
    if (!apiMode) return;

    const unsubs: Array<() => void> = [];

    // ---- jobs --------------------------------------------------------------
    const onJobChange = async (p: EventPayload): Promise<void> => {
      const id = extractId(p);
      if (!id) return;
      try {
        const dto = await client.jobs.get(id);
        useStore.getState().applyJob(jobFromDTO(dto));
      } catch (err) {
        // 404 means the row is gone — drop locally.
        if ((err as { status?: number }).status === 404) {
          useStore.getState().applyJobRemove(id);
          return;
        }
        // eslint-disable-next-line no-console
        console.warn('Realtime job refresh failed', err);
      }
    };
    (['jobs.updated', 'jobs.created', 'jobs.soft_deleted'] as const).forEach((t) => {
      unsubs.push(subscribe(t, onJobChange));
    });
    unsubs.push(
      subscribe('jobs.deleted', (p) => {
        const id = extractId(p);
        if (id) useStore.getState().applyJobRemove(id);
      }),
    );

    // ---- crews -------------------------------------------------------------
    const onCrewChange = async (p: EventPayload): Promise<void> => {
      const id = extractId(p);
      if (!id) return;
      try {
        const dto = await client.crews.get(id);
        useStore.getState().applyCrew(crewFromDTO(dto));
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          useStore.getState().applyCrewRemove(id);
          return;
        }
        // eslint-disable-next-line no-console
        console.warn('Realtime crew refresh failed', err);
      }
    };
    (['crews.updated', 'crews.created'] as const).forEach((t) => {
      unsubs.push(subscribe(t, onCrewChange));
    });
    unsubs.push(
      subscribe('crews.deleted', (p) => {
        const id = extractId(p);
        if (id) useStore.getState().applyCrewRemove(id);
      }),
    );

    // ---- people ------------------------------------------------------------
    const onPersonChange = async (p: EventPayload): Promise<void> => {
      const id = extractId(p);
      if (!id) return;
      try {
        const dto = await client.people.get(id);
        useStore.getState().applyPerson(personFromDTO(dto));
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          useStore.getState().applyPersonRemove(id);
          return;
        }
        // eslint-disable-next-line no-console
        console.warn('Realtime person refresh failed', err);
      }
    };
    (['people.updated', 'people.created'] as const).forEach((t) => {
      unsubs.push(subscribe(t, onPersonChange));
    });
    unsubs.push(
      subscribe('people.deleted', (p) => {
        const id = extractId(p);
        if (id) useStore.getState().applyPersonRemove(id);
      }),
    );

    // ---- slots: piggyback on jobs.updated since slots roll into jobs
    unsubs.push(
      subscribe('slots.updated' as EventTopic, (p) => {
        const data = p.data as { jobId?: string } | null;
        if (!data?.jobId) return;
        void onJobChange({ topic: 'jobs.updated', data: { id: data.jobId } });
      }),
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [apiMode]);
}
