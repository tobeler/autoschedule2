// =============================================================
// /api/internal/to-schedule — same-origin proxy that lets the
// browser ask for the canonical "to be scheduled" list without ever
// seeing the rebate-dashboard API key.
//
// Server-only: reads `REBATE_DASHBOARD_BASE_URL` +
// `REBATE_DASHBOARD_API_KEY`, calls the sibling rebate-dashboard app
// through `getToScheduleSnapshot`, and returns the snapshot.
//
// Auth: relies on the app-level NextAuth Google SSO. The middleware
// at /middleware.ts gates `/api/internal/*` for signed-in users.
//
// Failure modes (all caught — never surfaces a 500 to the client):
//   - env vars missing       → 503 { configured: false }
//   - upstream timeout / 5xx → 502 { configured: true, error: '…' }
// =============================================================
import { NextResponse, type NextRequest } from 'next/server';

import {
  RebateDashboardApiError,
  RebateDashboardConfigError,
  getToScheduleSnapshot,
} from '@/integrations/rebate-dashboard/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const region = (req.nextUrl.searchParams.get('region') || 'CO').toUpperCase();

  try {
    const snapshot = await getToScheduleSnapshot(region);
    return NextResponse.json(
      {
        configured: true,
        region,
        fetchedAt: snapshot.fetchedAt,
        count: snapshot.items.length,
        items: snapshot.items,
        zuperJobUids: snapshot.zuperJobUids,
        hubspotDealIds: snapshot.hubspotDealIds,
      },
      {
        headers: {
          // Browser-side: trust the upstream's freshness; we already
          // cache server-side for 30s in sync.ts.
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    if (err instanceof RebateDashboardConfigError) {
      return NextResponse.json(
        { configured: false, region, items: [] },
        { status: 503 },
      );
    }
    if (err instanceof RebateDashboardApiError) {
      // Log full detail server-side; return a thin error blob to the client.
      console.warn(
        '[rebate-dashboard] proxy: upstream error',
        err.status,
        err.message,
      );
      return NextResponse.json(
        {
          configured: true,
          region,
          error: err.message,
          status: err.status ?? null,
          items: [],
        },
        { status: 502 },
      );
    }
    console.warn('[rebate-dashboard] proxy: unexpected error', err);
    return NextResponse.json(
      { configured: true, region, error: 'unexpected', items: [] },
      { status: 500 },
    );
  }
}
