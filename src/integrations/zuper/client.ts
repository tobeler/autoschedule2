// =============================================================
// Zuper API client — read-only HTTP wrapper. Ported from
// jetson-kpi's src/lib/api/zuper.ts with KPI-specific code
// removed. Mirrors the shape of src/integrations/hubspot/client.ts:
// isXxxConfigured() gate, typed errors, paged-search cap.
//
// Writeback (PATCH/POST to Zuper) is deferred per the integration
// plan and not implemented here.
// =============================================================

import type {
  ZuperCustomField,
  ZuperJob,
  ZuperListResponse,
  ZuperTeam,
  ZuperUser,
} from './types';
import {
  normalizeRegionPrefix,
  type RegionPrefix,
} from '../../lib/region-core';

const BASE_URL =
  process.env.ZUPER_BASE_URL ?? 'https://us-east-1.zuperpro.com';

export class ZuperConfigError extends Error {
  constructor(message = 'ZUPER_API_KEY not configured') {
    super(message);
    this.name = 'ZuperConfigError';
  }
}

export class ZuperApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ZuperApiError';
  }
}

export function isZuperConfigured(): boolean {
  return Boolean(process.env.ZUPER_API_KEY);
}

/**
 * Low-level GET. Retries 3x on 429/529 with `attempt * 1500ms` backoff.
 * All paths are relative to `${BASE_URL}/api`. Throws `ZuperConfigError`
 * when unconfigured, `ZuperApiError` on upstream failure.
 */
async function zuperGet<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.ZUPER_API_KEY;
  if (!apiKey) throw new ZuperConfigError();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500));

    const res = await fetch(`${BASE_URL}/api${endpoint}`, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 429 || res.status === 529) {
      if (attempt < 2) continue;
      throw new ZuperApiError(res.status, 'Zuper rate limited after 3 attempts');
    }
    if (!res.ok) {
      throw new ZuperApiError(res.status, `Zuper ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }
  // Unreachable because the retry loop either returns or throws.
  throw new ZuperApiError(0, 'Zuper unreachable');
}

/**
 * Low-level WRITE (PUT/POST). Same retry behaviour as zuperGet. Throws
 * `ZuperConfigError` when unconfigured, `ZuperApiError` on upstream failure.
 *
 * Used by the writeback module (`./writeback.ts`). Kept here so all HTTP
 * concerns live in one place. We intentionally do NOT export this — callers
 * go through the typed writeback helpers, which gate behaviour on the
 * `integrations.zuper.writeback_enabled` feature flag.
 */
async function zuperWrite<TReq, TRes>(
  method: 'PUT' | 'POST' | 'PATCH',
  endpoint: string,
  body: TReq,
): Promise<TRes> {
  const apiKey = process.env.ZUPER_API_KEY;
  if (!apiKey) throw new ZuperConfigError();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500));

    const res = await fetch(`${BASE_URL}/api${endpoint}`, {
      method,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status === 529) {
      if (attempt < 2) continue;
      throw new ZuperApiError(res.status, 'Zuper rate limited after 3 attempts');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ZuperApiError(
        res.status,
        `Zuper ${method} ${endpoint} → ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`,
      );
    }
    return (await res.json()) as TRes;
  }
  throw new ZuperApiError(0, 'Zuper unreachable');
}

export const _zuperWriteInternal = zuperWrite;

const MAX_PAGES = 10; // 10 × 1000 = 10,000 record ceiling per call.

/**
 * Fetch every page of a paginated list endpoint. `?page=1&count=1000`
 * until the response page is short. Capped at MAX_PAGES so a runaway
 * upstream can't blow our function budget.
 */
async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const out: T[] = [];
  const count = 1000;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      ...params,
      page: String(page),
      count: String(count),
    }).toString();

    const res = await zuperGet<ZuperListResponse<T>>(`${endpoint}?${query}`);
    out.push(...res.data);
    if (res.data.length < count) break;
  }

  return out;
}

// ---- Custom-field helpers --------------------------------------------------

export function normalizeCustomFieldLabel(label: string | undefined): string {
  return label?.trim().toLowerCase() ?? '';
}

export function getCustomFieldValue(
  customFields: ZuperCustomField[] | undefined,
  labels: string[],
): string | undefined {
  const targets = new Set(labels.map(normalizeCustomFieldLabel));
  return (
    customFields?.find((f) => targets.has(normalizeCustomFieldLabel(f.label)))
      ?.value ?? undefined
  );
}

/** Common HubSpot linkage fields recorded by Jetson's Zuper template. */
export function getHubspotDealId(job: Pick<ZuperJob, 'custom_fields'>): string | undefined {
  return getCustomFieldValue(job.custom_fields, ['Hubspot Deal ID', 'HubSpot Deal ID']);
}
export function getHubspotInstallationId(job: Pick<ZuperJob, 'custom_fields'>): string | undefined {
  return getCustomFieldValue(job.custom_fields, [
    'Hubspot Installation ID',
    'HubSpot Installation ID',
  ]);
}
export function getHubspotContactId(job: Pick<ZuperJob, 'custom_fields'>): string | undefined {
  return getCustomFieldValue(job.custom_fields, ['Hubspot Contact ID', 'HubSpot Contact ID']);
}
export function getServiceAreaCode(job: Pick<ZuperJob, 'custom_fields'>): string | undefined {
  return getCustomFieldValue(job.custom_fields, ['Service Area Code']);
}

// ---- Region inference ------------------------------------------------------
//
// Resolution order matches jetson-kpi's inferRegion(): team prefix →
// Service Area Code → property address state. Returns null if no match.

export function inferRegion(job: ZuperJob): RegionPrefix | null {
  // 1) Team name (e.g. "CO-DE-1", "Dispatch MA-BO").
  const teamName = job.assigned_to_team?.[0]?.team?.team_name;
  const fromTeam = normalizeRegionPrefix(teamName);
  if (fromTeam) return fromTeam;
  // 2) Service Area Code custom field (e.g. "BC-NV", "CO-DE", "MA-BO").
  const fromServiceArea = normalizeRegionPrefix(getServiceAreaCode(job));
  if (fromServiceArea) return fromServiceArea;
  // 3) Property address state.
  return normalizeRegionPrefix(job.property?.property_address?.state);
}

/** Current status_type from the job_status history array. */
export function currentStatus(job: ZuperJob): string {
  return (
    job.job_status?.[job.job_status.length - 1]?.status_type?.toUpperCase() ??
    ''
  );
}

// ---- Public read endpoints -------------------------------------------------

/** Health probe — cheap call against /team that just verifies auth. */
export async function pingAccount(): Promise<{ ok: true; teamCount: number }> {
  // Zuper doesn't expose a stable /account or /me endpoint for all tenants.
  // /team always works and gives us a useful counter for the response.
  const res = await zuperGet<ZuperListResponse<unknown>>('/team?page=1&count=1');
  return { ok: true, teamCount: res.total_records ?? res.data.length };
}

export interface ListJobsOptions {
  /** Filter window applied CLIENT-side (Zuper ignores date params on /jobs). */
  since?: Date;
  until?: Date;
}

/**
 * Pulls all jobs from Zuper. Date filters are advisory at the API and applied
 * client-side after fetch (per jetson-kpi's discovery — Zuper ignores them).
 * Returns the raw ZuperJob array; parsers handle the mapping into our schema.
 */
export async function listJobs(opts: ListJobsOptions = {}): Promise<ZuperJob[]> {
  const all = await fetchAllPages<ZuperJob>('/jobs');
  if (!opts.since && !opts.until) return all;

  const sinceMs = opts.since ? opts.since.getTime() : -Infinity;
  const untilMs = opts.until ? opts.until.getTime() : Infinity;

  return all.filter((j) => {
    const t = j.scheduled_start_time ?? j.actual_start_time ?? j.created_at;
    if (!t) return false;
    const ms = new Date(t).getTime();
    return ms >= sinceMs && ms < untilMs;
  });
}

/** Fetch a single job by UID. */
export async function getJob(jobUid: string): Promise<ZuperJob> {
  const res = await zuperGet<{ type: string; data: ZuperJob }>(`/jobs/${encodeURIComponent(jobUid)}`);
  return res.data;
}

/** Returns all teams in the Zuper tenant. */
export async function listTeams(): Promise<ZuperTeam[]> {
  return fetchAllPages<ZuperTeam>('/team');
}

/**
 * Returns all users (technicians + back-office) in the Zuper tenant.
 *
 * Endpoint quirk: `/user/all` caps page size at 10 regardless of the `count`
 * param, so we use a dedicated paginator with a higher page ceiling instead
 * of the generic `fetchAllPages` helper (which assumes count=1000 works).
 * Production tenant has ~210 users → ~21 pages. We cap at 50 pages
 * (= 500 users) for safety.
 */
export async function listUsers(): Promise<ZuperUser[]> {
  const out: ZuperUser[] = [];
  const MAX_USER_PAGES = 50;
  const PAGE_SIZE = 10; // /user/all silently caps at 10

  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      count: String(PAGE_SIZE),
    }).toString();
    const res = await zuperGet<ZuperListResponse<ZuperUser>>(`/user/all?${query}`);
    out.push(...res.data);
    if (res.data.length < PAGE_SIZE) break;
  }

  return out;
}

// ---- Internals re-exported only for unit tests -----------------------------

export const _testing = { zuperGet, fetchAllPages };
