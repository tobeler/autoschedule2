// =============================================================
// Outbox publisher. Every mutation that needs to fan out — to
// HubSpot, to Supabase Realtime, to future SNS bridges — drops a
// row here. Phase 13's drainer reads + dispatches them.
// =============================================================
import { db } from '@/lib/db';
import { outbox } from '@/db/schema';

export interface OutboxEvent<T = unknown> {
  topic: string;
  payload: T;
}

export async function publish(event: OutboxEvent): Promise<void> {
  await db.insert(outbox).values({
    topic: event.topic,
    payloadJson: event.payload as Record<string, unknown>,
  });
}
