// =============================================================
// HubSpot client (Phase 13) — server-side fetch wrapper for the
// HubSpot v3 REST API. Reads `HUBSPOT_TOKEN` from the *server*
// environment. The token is never bundled into client code.
//
// Every function returns parsed JSON or throws `HubspotApiError`
// with the upstream status + parsed body. Route handlers catch
// these and surface them via the global RFC 7807 problem-details
// translator.
//
// All searches are scoped to the property catalogs documented in
// the plan (`/Users/work/.claude/plans/curious-toasting-sifakis.md`).
// =============================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Job } from '../../types';

import { STATUS_ENUM_MAP } from './field-map-defaults';

const HS_BASE = 'https://api.hubapi.com';

/** HubSpot is not configured (no token). The route handler turns this into a 503. */
export class HubspotConfigError extends Error {
  constructor() {
    super('HubSpot is not connected. Set HUBSPOT_TOKEN in the server environment.');
    this.name = 'HubspotConfigError';
  }
}

/** Any HubSpot REST call that returned a non-2xx response. */
export class HubspotApiError extends Error {
  status: number;
  category?: string;
  body?: unknown;
  constructor(status: number, message: string, opts: { category?: string; body?: unknown } = {}) {
    super(message);
    this.name = 'HubspotApiError';
    this.status = status;
    this.category = opts.category;
    this.body = opts.body;
  }
}

function readToken(): string {
  const tok = process.env.HUBSPOT_TOKEN;
  if (!tok || !tok.length) throw new HubspotConfigError();
  return tok;
}

/** True if `HUBSPOT_TOKEN` is configured. Server-side only. */
export function isHubspotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_TOKEN && process.env.HUBSPOT_TOKEN.length);
}

async function hs<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const res = await fetch(HS_BASE + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let category: string | undefined;
    let detail = res.statusText;
    let body: unknown;
    try {
      body = await res.json();
      const parsed = body as { message?: string; category?: string };
      detail = parsed.message ?? detail;
      category = parsed.category;
    } catch {
      // ignore parse failure
    }
    throw new HubspotApiError(res.status, detail, { category, body });
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ---------- Paging helpers ---------------------------------------------------

export interface HubspotSearchPage<T> {
  total: number;
  results: T[];
  paging?: { next?: { after: string } };
}

async function pagedSearch<T extends { id: string }>(
  path: string,
  bodyBase: Record<string, unknown>,
  limit = 100,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  // Cap at 50 pages of `limit` to keep cron-time bounded.
  for (let i = 0; i < 50; i += 1) {
    const body: Record<string, unknown> = { ...bodyBase, limit };
    if (after) body.after = after;
    const page = await hs<HubspotSearchPage<T>>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    out.push(...page.results);
    if (!page.paging?.next?.after) break;
    after = page.paging.next.after;
  }
  return out;
}

// ---------- Contacts ---------------------------------------------------------

export interface HubspotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
}

const CONTACT_PROPS = [
  'firstname', 'lastname', 'email', 'phone',
  'address', 'address_line_2', 'city', 'state', 'zip',
  'customer_id', 'service_areas', 'jetson_care_status',
  'lead_type', 'primary_heating_system', 'home_cooling_system', 'type_of_home',
];

export function getContact(id: string): Promise<HubspotContact> {
  const qs = '?properties=' + CONTACT_PROPS.join(',');
  return hs<HubspotContact>('/crm/v3/objects/contacts/' + encodeURIComponent(id) + qs);
}

export interface ContactFilter {
  query?: string;
  /** Contact ids to fetch in one round-trip. */
  ids?: string[];
  limit?: number;
}

export function searchContacts(filter: ContactFilter = {}): Promise<HubspotContact[]> {
  const body: Record<string, unknown> = { properties: CONTACT_PROPS };
  if (filter.ids && filter.ids.length) {
    body.filterGroups = [
      { filters: [{ propertyName: 'hs_object_id', operator: 'IN', values: filter.ids }] },
    ];
  } else if (filter.query) {
    body.query = filter.query;
  }
  return pagedSearch<HubspotContact>(
    '/crm/v3/objects/contacts/search',
    body,
    filter.limit ?? 100,
  );
}

// ---------- Deals ------------------------------------------------------------

export interface HubspotDeal {
  id: string;
  properties: Record<string, string | null>;
}

const DEAL_PROPS = [
  'dealname', 'amount', 'dealstage', 'pipeline', 'closedate',
  'project_type', 'trade', 'install_dates', 'install_end_date', 'walkthrough_date',
  'home_assessment_date', 'permit_status', 'inspection_status',
  'customer_urgency', 'scheduling_instructions', 'installation_notes',
  'heating_load__btus_', 'main_panel_rating', 'site_technician', 'point_guard',
  'accepted_quote_amount',
];

export function getDeal(id: string): Promise<HubspotDeal> {
  const qs = '?properties=' + DEAL_PROPS.join(',');
  return hs<HubspotDeal>('/crm/v3/objects/deals/' + encodeURIComponent(id) + qs);
}

export interface DealFilter {
  pipeline?: string;
  stage?: string;
  limit?: number;
}

export function searchDeals(filter: DealFilter = {}): Promise<HubspotDeal[]> {
  const filters: Array<{ propertyName: string; operator: string; value?: string }> = [];
  if (filter.pipeline) filters.push({ propertyName: 'pipeline', operator: 'EQ', value: filter.pipeline });
  if (filter.stage) filters.push({ propertyName: 'dealstage', operator: 'EQ', value: filter.stage });
  return pagedSearch<HubspotDeal>(
    '/crm/v3/objects/deals/search',
    {
      filterGroups: filters.length ? [{ filters }] : [],
      properties: DEAL_PROPS,
    },
    filter.limit ?? 100,
  );
}

/** Returns the contact ids associated with a given deal. */
export async function getDealContactIds(dealId: string): Promise<string[]> {
  const res = await hs<{ results: Array<{ id: string }> }>(
    '/crm/v3/objects/deals/' + encodeURIComponent(dealId) + '/associations/contacts',
  );
  return res.results.map((r) => r.id);
}

// ---------- Native Projects (objectTypeId 0-970) -----------------------------

export interface HubspotProject {
  id: string;
  properties: Record<string, string | null>;
}

const PROJECT_PROPS = [
  'hs_name', 'hs_pipeline', 'hs_pipeline_stage', 'hs_status', 'hs_priority',
  'hs_start_date', 'hs_target_due_date', 'hs_close_date',
  'hs_total_cost', 'hs_amount_paid', 'hs_description', 'hs_type',
  'hubspot_owner_id',
  // Jetson-custom
  'design_status', 'design_priority', 'system_designer',
  'project_coordinator', 'customer_success_person',
  'permit_status', 'hoa_status', 'loan_qualification_status',
  'rebate_qualification_status', 'rebate_pre_approval',
  'field_work_completed', 'ready_to_close', 'close_out_notes',
  'close_out_tasks_required', 'on_hold_reason', 'on_hold_end_date',
  'vwt_status', 'vwt_scheduled_date',
  'system_design_notes', 'out_of_bom_items',
  'breaker_brands_identified', 'mechanical_room_space_verified',
  'fsm_provider', 'installation_date_formatted',
];

const PROJECT_OBJECT = '0-970';

export function getProject(id: string): Promise<HubspotProject> {
  const qs = '?properties=' + PROJECT_PROPS.join(',');
  return hs<HubspotProject>('/crm/v3/objects/' + PROJECT_OBJECT + '/' + encodeURIComponent(id) + qs);
}

export interface ProjectFilter {
  pipeline?: string;
  /** Pipeline stages (any of). Defaults to the active scope-of-work stages. */
  stages?: string[];
  limit?: number;
}

const ACTIVE_PROJECT_STAGES = ['planning', 'review', 'execution', 'on_hold'];

export function searchProjects(filter: ProjectFilter = {}): Promise<HubspotProject[]> {
  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [];
  if (filter.pipeline) filters.push({ propertyName: 'hs_pipeline', operator: 'EQ', value: filter.pipeline });
  const stages = filter.stages ?? ACTIVE_PROJECT_STAGES;
  if (stages.length) filters.push({ propertyName: 'hs_pipeline_stage', operator: 'IN', values: stages });
  return pagedSearch<HubspotProject>(
    '/crm/v3/objects/' + PROJECT_OBJECT + '/search',
    {
      filterGroups: filters.length ? [{ filters }] : [],
      properties: PROJECT_PROPS,
    },
    filter.limit ?? 100,
  );
}

/** PATCH a HubSpot Project record. Used to push lifecycle updates from FSM. */
export function updateProject(
  id: string,
  patch: Record<string, string | number | boolean | null>,
): Promise<HubspotProject> {
  return hs<HubspotProject>('/crm/v3/objects/' + PROJECT_OBJECT + '/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify({ properties: patch }),
  });
}

/** Contact ids associated with a native Project. */
export async function getProjectContactIds(projectId: string): Promise<string[]> {
  try {
    const res = await hs<{ results: Array<{ id: string }> }>(
      '/crm/v3/objects/' + PROJECT_OBJECT + '/' + encodeURIComponent(projectId) + '/associations/contacts',
    );
    return res.results.map((r) => r.id);
  } catch (err) {
    if (err instanceof HubspotApiError && err.status === 404) return [];
    throw err;
  }
}

// ---------- Legacy Installations (objectTypeId 2-31703261) -------------------

export interface HubspotInstallation {
  id: string;
  properties: Record<string, string | null>;
}

const INSTALLATION_OBJECT = '2-31703261';

const INSTALLATION_PROPS = [
  'hs_object_id', 'zuper_job_installation_status',
  'zuper_job_installation_scheduled_start_time',
  'zuper_job_installation_serial_number_indoor_unit',
  'zuper_job_installation_serial_number_outdoor_unit',
  'entered_complete_stage_date',
  'full_address', 'address_line_2', 'address_city', 'state_province_region',
  'address_zip', 'country',
  'related_project_id',
];

export function getInstallation(id: string): Promise<HubspotInstallation> {
  const qs = '?properties=' + INSTALLATION_PROPS.join(',');
  return hs<HubspotInstallation>(
    '/crm/v3/objects/' + INSTALLATION_OBJECT + '/' + encodeURIComponent(id) + qs,
  );
}

export interface InstallationFilter {
  status?: string;
  limit?: number;
}

export function searchInstallations(filter: InstallationFilter = {}): Promise<HubspotInstallation[]> {
  const filters: Array<{ propertyName: string; operator: string; value?: string }> = [];
  if (filter.status) {
    filters.push({ propertyName: 'zuper_job_installation_status', operator: 'EQ', value: filter.status });
  }
  return pagedSearch<HubspotInstallation>(
    '/crm/v3/objects/' + INSTALLATION_OBJECT + '/search',
    {
      filterGroups: filters.length ? [{ filters }] : [],
      properties: INSTALLATION_PROPS,
    },
    filter.limit ?? 100,
  );
}

// ---------- Service areas (custom object) -----------------------------------

export interface HubspotServiceArea {
  id: string;
  properties: Record<string, string | null>;
}

const SA_PROPS = [
  'name', 'service_area_code', 'time_zone', 'status',
  'cities', 'states', 'countries', 'postal_codes',
  'heating_indoor_db_temp', 'heating_outdoor_db_temp',
  'altitude_derating_factor', 'capacity_margin_factor',
  'fsm_provider', 'default_warehouse',
];

export function listServiceAreas(): Promise<HubspotServiceArea[]> {
  return pagedSearch<HubspotServiceArea>(
    '/crm/v3/objects/service_areas/search',
    { filterGroups: [], properties: SA_PROPS },
    100,
  );
}

// ---------- Jobs (push) ------------------------------------------------------

export interface HubspotJob {
  id?: string;
  properties: Record<string, string | number | null>;
}

const JOB_OBJECT = 'jobs';

/** Build the property bag we write to a HubSpot Job custom-object record. */
export function serializeJob(job: Job, opts: { jobUrl?: string } = {}): HubspotJob['properties'] {
  const mapping = STATUS_ENUM_MAP[job.status] ?? STATUS_ENUM_MAP.scheduled;
  const start = job.date && job.startHour != null
    ? new Date(
        job.date
          + 'T'
          + Math.floor(job.startHour).toString().padStart(2, '0')
          + ':'
          + Math.round((job.startHour % 1) * 60).toString().padStart(2, '0')
          + ':00',
      ).toISOString()
    : null;
  const end = start && job.durationHrs
    ? new Date(new Date(start).getTime() + job.durationHrs * 3600 * 1000).toISOString()
    : null;

  const props: HubspotJob['properties'] = {
    fsm_job_id: job.id,
    fsm_job_url: opts.jobUrl ?? 'jetson-fsm://job/' + job.id,
    fsm_status: mapping.fsmStatus,
    fsm_scheduled_start_time: start,
    fsm_scheduled_end_time: end,
    fsm_time_on_site: job.durationHrs,
    fsm_team_members_json: JSON.stringify(job.slots ?? []),
    job_type: mapJobTypeToHubspot(job.type),
    job_name: job.notes ? job.notes.slice(0, 120) : job.id,
    notes: job.notes ?? '',
  };
  return props;
}

function mapJobTypeToHubspot(t: string): string {
  switch (t) {
    case 'walkthrough': return 'walkthrough';
    case 'service':
    case 'warranty':   return 'service';
    case 'callback':   return 'followup';
    default:           return 'installation';
  }
}

/** Create or update one HubSpot Job custom-object record. */
export async function createOrUpdateJob(
  fsmJob: Job,
  opts: { jobUrl?: string; existingHubspotId?: string | null } = {},
): Promise<HubspotJob> {
  const properties = serializeJob(fsmJob, { jobUrl: opts.jobUrl });

  // Prefer the explicit existingHubspotId we may have stored already.
  if (opts.existingHubspotId) {
    return hs<HubspotJob>(
      '/crm/v3/objects/' + JOB_OBJECT + '/' + encodeURIComponent(opts.existingHubspotId),
      {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      },
    );
  }
  // Otherwise fall back to searching by fsm_job_id (the natural key).
  const search = await hs<HubspotSearchPage<HubspotJob>>('/crm/v3/objects/' + JOB_OBJECT + '/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'fsm_job_id', operator: 'EQ', value: fsmJob.id }] }],
      properties: ['fsm_job_id'],
      limit: 1,
    }),
  });
  if (search.results.length && search.results[0].id) {
    return hs<HubspotJob>('/crm/v3/objects/' + JOB_OBJECT + '/' + search.results[0].id, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }
  return hs<HubspotJob>('/crm/v3/objects/' + JOB_OBJECT, {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
}

// ---------- Webhook signature verification ----------------------------------

/**
 * Verify a HubSpot v3 webhook signature.
 *
 * HubSpot signs the raw request body with the app secret using HMAC SHA-256.
 * The signature is sent as a base64 string in the `X-HubSpot-Signature-v3`
 * (or v2) header. We accept the v3 shape.
 *
 * Returns true if `signature` matches `HMAC_SHA256(secret, rawBody)`.
 */
export function verifyWebhookSignature(
  signature: string | null | undefined,
  rawBody: string,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  // Length-mismatch defeats timingSafeEqual; guard up front.
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
