// =============================================================
// Dev-only token-paste endpoint.
//
// In development the dispatcher accepts a HubSpot Private App token
// pasted in the Integrations panel and stores it on `process.env.HUBSPOT_TOKEN`
// for the lifetime of the dev server. This avoids `.env.local` edits +
// restart cycles while iterating on the live HubSpot pull.
//
// In production this route returns 404 — the only supported path for
// setting the token is server-side env vars (Vercel).
// =============================================================
import { NextResponse, type NextRequest } from 'next/server';

import { getAccountDetails } from '@/integrations/hubspot/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function notFound(): NextResponse {
  return new NextResponse('Not Found', { status: 404 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') {
    return notFound();
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Body must be JSON: { token: string }' },
      { status: 400 },
    );
  }
  const token =
    typeof body === 'object' && body !== null && 'token' in body
      ? (body as { token: unknown }).token
      : undefined;
  if (typeof token !== 'string' || token.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'token must be a string (HubSpot Private App tokens are ~64 chars).' },
      { status: 400 },
    );
  }
  // Module-level mutation — lives for the dev process lifetime.
  process.env.HUBSPOT_TOKEN = token;
  try {
    const details = await getAccountDetails();
    return NextResponse.json(
      {
        ok: true,
        portalId: details.portalId,
        accountType: details.accountType,
        timeZone: details.timeZone,
        currency: details.companyCurrency,
      },
      { status: 200 },
    );
  } catch (err) {
    // Roll the token back so a bad paste doesn't poison subsequent calls.
    process.env.HUBSPOT_TOKEN = '';
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') return notFound();
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.HUBSPOT_TOKEN && process.env.HUBSPOT_TOKEN.length),
  });
}
