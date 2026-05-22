// =============================================================
// Pub/sub abstraction over the outbox table.
//
// Today: backed by Supabase Realtime — open one channel per
// browser tab that listens for `outbox` INSERTs, route by `topic`.
// Tomorrow at Jetson: replace the backend with a WebSocket worker
// draining SQS without touching call sites.
//
// Demo mode: when NEXT_PUBLIC_SUPABASE_URL or
// NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, every operation is a
// no-op so the dispatcher still works fully offline against
// localStorage + seed.
// =============================================================

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';

export type EventTopic =
  | 'jobs.updated'
  | 'jobs.created'
  | 'jobs.deleted'
  | 'jobs.soft_deleted'
  | 'slots.updated'
  | 'crews.updated'
  | 'crews.created'
  | 'crews.deleted'
  | 'people.updated'
  | 'people.created'
  | 'people.deleted'
  | 'projects.updated'
  | 'projects.created'
  | 'projects.deleted'
  | 'customers.updated'
  | 'customers.created'
  | 'customers.deleted'
  | 'trucks.updated'
  | 'trucks.created'
  | 'trucks.deleted'
  | 'time-off.updated';

export interface EventPayload {
  topic: EventTopic;
  data: unknown;
}

type Listener = (p: EventPayload) => void;

// ---- env -------------------------------------------------------------------

const SUPABASE_URL =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
const SUPABASE_KEY =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : undefined;

// ---- channel singleton -----------------------------------------------------

const listeners: Map<EventTopic, Set<Listener>> = new Map();

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let initialised = false;

interface OutboxRow {
  topic?: string;
  payloadJson?: unknown;
}

function ensureChannel(): void {
  if (initialised) return;
  initialised = true;
  if (!SUPABASE_URL || !SUPABASE_KEY) return; // demo mode: no realtime
  if (typeof window === 'undefined') return; // SSR no-op
  try {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    channel = client
      .channel('jetson-outbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'outbox' },
        (payload) => {
          const row = payload.new as OutboxRow;
          if (typeof row.topic !== 'string') return;
          const topic = row.topic as EventTopic;
          const ls = listeners.get(topic);
          if (!ls || ls.size === 0) return;
          for (const cb of ls) {
            try {
              cb({ topic, data: row.payloadJson });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('events.subscribe handler threw', err);
            }
          }
        },
      )
      .subscribe();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Realtime channel init failed; falling back to local-only events', err);
    client = null;
    channel = null;
  }
}

// ---- public API ------------------------------------------------------------

export function subscribe(topic: EventTopic, cb: Listener): () => void {
  let set = listeners.get(topic);
  if (!set) {
    set = new Set();
    listeners.set(topic, set);
  }
  set.add(cb);
  ensureChannel();
  return () => {
    set?.delete(cb);
  };
}

/**
 * Client-side fanout helper for optimistic local writes — fires
 * subscribers in the same tab synchronously without round-tripping
 * through Realtime. The server-side `publish()` (in
 * `src/api/db/outbox.ts`) is the canonical cross-tab signal.
 */
export function publishLocal(payload: EventPayload): void {
  const ls = listeners.get(payload.topic);
  if (!ls) return;
  for (const cb of ls) {
    try {
      cb(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('events.publishLocal handler threw', err);
    }
  }
}

/** True when a realtime channel is live. UI may use this to badge connection state. */
export function isRealtimeActive(): boolean {
  return channel !== null;
}

/** Tear down — only used in tests or hot-reload cleanup. */
export async function teardownEvents(): Promise<void> {
  if (channel) {
    try {
      await channel.unsubscribe();
    } catch {
      /* noop */
    }
    channel = null;
  }
  client = null;
  initialised = false;
  listeners.clear();
}
