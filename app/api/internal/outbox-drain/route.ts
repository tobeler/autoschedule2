// =============================================================
// Outbox drain handler (Phase 13).
//
// Triggered by a Supabase Database Webhook on `outbox` INSERT.
// The webhook posts `{ record: { id, topic, payload_json, ... } }`
// (Supabase's standard shape); we accept that and a thinner
// `{ id: '<uuid>' }` body for manual replay.
//
// Auth: shared secret in `x-internal-key` (or `Authorization: Bearer`).
// =============================================================
import { NextResponse, type NextRequest } from 'next/server';

import { drainOutboxRow } from '@/integrations/hubspot/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SupabaseWebhookBody {
  type?: string;
  table?: string;
  record?: { id?: string };
  // Manual replay shape:
  id?: string;
}

function authorize(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_SHARED_SECRET;
  if (!expected) return false;
  const headerKey = req.headers.get('x-internal-key');
  if (headerKey && headerKey === expected) return true;
  const bearer = req.headers.get('authorization');
  if (bearer === 'Bearer ' + expected) return true;
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid x-internal-key',
      },
      { status: 401 },
    );
  }

  let body: SupabaseWebhookBody;
  try {
    body = (await req.json()) as SupabaseWebhookBody;
  } catch (err) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid JSON: ' + (err instanceof Error ? err.message : 'parse error'),
      },
      { status: 400 },
    );
  }

  const rowId = body.record?.id ?? body.id;
  if (!rowId) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Missing outbox row id',
      },
      { status: 400 },
    );
  }

  const result = await drainOutboxRow(rowId);
  // Return 200 either way so Supabase doesn't infinitely retry on
  // permanent failures — the `attempts` counter on the outbox row
  // is the source of truth for retry behavior.
  return NextResponse.json({ ok: result.ok, message: result.message }, { status: 200 });
}
