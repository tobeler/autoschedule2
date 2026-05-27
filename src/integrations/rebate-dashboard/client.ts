// =============================================================
// rebate-dashboard client — server-side fetch wrapper for the
// sibling agentic-dashboards app's `/api/v1/to-schedule` endpoint.
//
// Reads `REBATE_DASHBOARD_BASE_URL` + `REBATE_DASHBOARD_API_KEY` from
// the *server* environment; the API key must never be bundled into
// client code. All proxying back to the browser happens through the
// route handler at `app/api/internal/to-schedule/route.ts`.
//
// The call is wrapped in an 8s `AbortSignal.timeout()`. Any
// non-2xx / timeout / network error throws `RebateDashboardApiError`,
// which the orchestrator catches and converts into a fallback
// (the local `readyToScheduleJobs` selector).
// =============================================================
import type { ToScheduleResponse } from './types';

/** rebate-dashboard env vars are not present — treat as "disabled". */
export class RebateDashboardConfigError extends Error {
  constructor() {
    super(
      'rebate-dashboard integration is not configured. Set REBATE_DASHBOARD_BASE_URL and REBATE_DASHBOARD_API_KEY in the server environment.',
    );
    this.name = 'RebateDashboardConfigError';
  }
}

/** rebate-dashboard returned a non-2xx, timed out, or the network failed. */
export class RebateDashboardApiError extends Error {
  status?: number;
  body?: unknown;
  cause?: unknown;
  constructor(
    message: string,
    opts: { status?: number; body?: unknown; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'RebateDashboardApiError';
    this.status = opts.status;
    this.body = opts.body;
    this.cause = opts.cause;
  }
}

/** True if both env vars are present (server-side only). */
export function isRebateDashboardConfigured(): boolean {
  return Boolean(
    process.env.REBATE_DASHBOARD_BASE_URL &&
      process.env.REBATE_DASHBOARD_BASE_URL.length &&
      process.env.REBATE_DASHBOARD_API_KEY &&
      process.env.REBATE_DASHBOARD_API_KEY.length,
  );
}

interface FetchOptions {
  /** Timeout in ms. Defaults to 8000. */
  timeoutMs?: number;
}

/**
 * Fetch the canonical "to be scheduled" rows for a given region from
 * rebate-dashboard. Throws `RebateDashboardConfigError` when env vars
 * are missing, or `RebateDashboardApiError` on any HTTP / network /
 * timeout failure. Returns the parsed response otherwise.
 */
export async function fetchToSchedule(
  region: string,
  opts: FetchOptions = {},
): Promise<ToScheduleResponse> {
  const baseRaw = process.env.REBATE_DASHBOARD_BASE_URL;
  const apiKey = process.env.REBATE_DASHBOARD_API_KEY;
  if (!baseRaw || !apiKey) throw new RebateDashboardConfigError();

  const base = baseRaw.replace(/\/+$/, '');
  const url = `${base}/api/v1/to-schedule?region=${encodeURIComponent(region)}`;
  const timeoutMs = opts.timeoutMs ?? 8000;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
      // Server-to-server — don't let Next.js try to cache it.
      cache: 'no-store',
    });
  } catch (err) {
    throw new RebateDashboardApiError(
      `rebate-dashboard fetch failed: ${(err as Error).message ?? String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw new RebateDashboardApiError(
      `rebate-dashboard returned ${res.status} ${res.statusText}`,
      { status: res.status, body },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new RebateDashboardApiError('rebate-dashboard returned malformed JSON', {
      status: res.status,
      cause: err,
    });
  }

  // Minimal shape guard. We deliberately don't fail hard on extra fields —
  // rebate-dashboard may add columns over time.
  if (
    !json ||
    typeof json !== 'object' ||
    !Array.isArray((json as { items?: unknown }).items)
  ) {
    throw new RebateDashboardApiError(
      'rebate-dashboard returned an unexpected response shape',
      { status: res.status, body: json },
    );
  }

  return json as ToScheduleResponse;
}
