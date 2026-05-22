// =============================================================
// Vercel Cron entry — runs the HubSpot pull on a fixed cadence.
//
// Hobby plan only allows daily crons, so vercel.json schedules
// `0 8 * * *` (8am UTC) — adjust there if Erik wants a different time.
//
// Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>` when
// `CRON_SECRET` is set on the project. We reject everything else so
// nobody can drive an expensive sync from the public internet.
// =============================================================
import { NextResponse, type NextRequest } from 'next/server';

import { syncFromHubspot, drainOutbox } from '@/integrations/hubspot/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hobby plan cap.

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No CRON_SECRET configured: only allow in dev (when not on Vercel).
    return !process.env.VERCEL;
  }
  const header = req.headers.get('authorization') ?? '';
  return header === 'Bearer ' + secret;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json(
      { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Missing or invalid CRON_SECRET' },
      { status: 401 },
    );
  }

  const sync = await syncFromHubspot();
  // Safety-net: drain any outbox rows the database webhook may have missed.
  const drain = await drainOutbox().catch((err) => ({
    delivered: 0,
    failed: -1,
    error: err instanceof Error ? err.message : 'drain failed',
  }));

  return NextResponse.json({ ok: sync.ok, sync, drain }, { status: 200 });
}

// POST mirrors GET so Vercel Cron and manual `curl -X POST` both work.
export const POST = GET;
