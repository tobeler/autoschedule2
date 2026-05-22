// =============================================================
// HubSpot webhook receiver (Phase 13).
//
// HubSpot POSTs an array of event objects to this endpoint. Each
// event includes `objectId`, `subscriptionType` (e.g.
// `project.creation`, `project.propertyChange`, `deal.propertyChange`,
// `contact.propertyChange`, `installations.propertyChange`), and
// `propertyName` / `propertyValue` for property-change events.
//
// We verify the v3 signature (HMAC SHA-256 of the raw body using
// `HUBSPOT_APP_SECRET`) before doing any work. Mismatch → 401.
//
// For each accepted event we dispatch a targeted sync. The handler
// returns 200 once events are queued — we never await each upstream
// fetch beyond the targeted sync because HubSpot retries are
// expensive when we 5xx them.
// =============================================================
import { NextResponse, type NextRequest } from 'next/server';

import { verifyWebhookSignature } from '@/integrations/hubspot/client';
import {
  syncContact,
  syncDealClosedWon,
  syncInstallation,
  syncProject,
} from '@/integrations/hubspot/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HubspotEvent {
  eventId?: number;
  subscriptionType?: string;
  objectId?: number | string;
  propertyName?: string;
  propertyValue?: string | null;
  changeFlag?: string;
}

const CLOSED_WON_VALUES = new Set(['closedwon', '1108691004']);

async function dispatchEvent(ev: HubspotEvent): Promise<{ ok: boolean; message: string }> {
  const type = ev.subscriptionType ?? '';
  const objectId = ev.objectId ? String(ev.objectId) : '';
  if (!objectId) return { ok: false, message: 'Event missing objectId' };

  switch (type) {
    case 'project.creation':
      return syncProject(objectId);
    case 'project.propertyChange': {
      // We care about pipeline stage + status changes for now.
      if (
        ev.propertyName === 'hs_pipeline_stage'
        || ev.propertyName === 'hs_status'
        || !ev.propertyName
      ) {
        return syncProject(objectId);
      }
      return { ok: true, message: 'Ignored property ' + (ev.propertyName ?? '?') };
    }
    case 'deal.propertyChange': {
      if (ev.propertyName === 'dealstage' && ev.propertyValue && CLOSED_WON_VALUES.has(ev.propertyValue)) {
        return syncDealClosedWon(objectId);
      }
      return { ok: true, message: 'Ignored deal stage transition' };
    }
    case 'contact.propertyChange': {
      const addressFields = new Set([
        'address', 'address_line_2', 'city', 'state', 'zip', 'phone', 'firstname', 'lastname',
      ]);
      if (!ev.propertyName || addressFields.has(ev.propertyName)) {
        return syncContact(objectId);
      }
      return { ok: true, message: 'Ignored contact property ' + ev.propertyName };
    }
    case 'installations.propertyChange':
    case 'installation.propertyChange':
      return syncInstallation(objectId);
    default:
      return { ok: true, message: 'Ignored subscription ' + type };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const signature = req.headers.get('x-hubspot-signature-v3') ?? req.headers.get('X-HubSpot-Signature-v3');
  const secret = process.env.HUBSPOT_APP_SECRET;

  if (!verifyWebhookSignature(signature, raw, secret)) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid or missing HubSpot signature',
        instance: '/api/webhooks/hubspot',
      },
      { status: 401 },
    );
  }

  let events: HubspotEvent[] = [];
  try {
    const parsed = JSON.parse(raw);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid JSON body: ' + (err instanceof Error ? err.message : 'parse error'),
      },
      { status: 400 },
    );
  }

  const results: Array<{ ok: boolean; message: string; eventId?: number; subscriptionType?: string }> = [];
  for (const ev of events) {
    const r = await dispatchEvent(ev);
    results.push({ ...r, eventId: ev.eventId, subscriptionType: ev.subscriptionType });
  }

  return NextResponse.json({ ok: true, processed: results.length, results }, { status: 200 });
}

// HubSpot also occasionally sends a verification GET. Just answer it.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: 'jetson-fsm hubspot webhook' }, { status: 200 });
}
