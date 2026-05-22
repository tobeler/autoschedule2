// =============================================================
// HubSpot client — thin fetch wrapper around the HubSpot v3 REST API.
// Reads VITE_HUBSPOT_TOKEN from build-time env. Token is never bundled
// into source — when missing, every call rejects with a friendly error
// that the Settings page surfaces in the integrations card.
// =============================================================
import type { Job } from '../../types';
import { STATUS_ENUM_MAP } from './field-map-defaults';

const HS_BASE = 'https://api.hubapi.com';

export class HubspotConfigError extends Error {
  constructor() {
    super(
      'HubSpot is not connected. Set VITE_HUBSPOT_TOKEN in your `.env.local` and reload to enable sync.',
    );
    this.name = 'HubspotConfigError';
  }
}

export class HubspotApiError extends Error {
  status: number;
  category?: string;
  constructor(status: number, message: string, category?: string) {
    super(message);
    this.name = 'HubspotApiError';
    this.status = status;
    this.category = category;
  }
}

function readToken(): string {
  const tok = import.meta.env.VITE_HUBSPOT_TOKEN as string | undefined;
  if (!tok || !tok.length) throw new HubspotConfigError();
  return tok;
}

/** True if a token is present at build time. Settings reads this to render Connected vs Disconnected. */
export function isHubspotConnected(): boolean {
  const tok = import.meta.env.VITE_HUBSPOT_TOKEN as string | undefined;
  return Boolean(tok && tok.length);
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
    try {
      const body = (await res.json()) as { message?: string; category?: string };
      detail = body.message ?? detail;
      category = body.category;
    } catch {
      // ignore parse failure
    }
    throw new HubspotApiError(res.status, detail, category);
  }
  return (await res.json()) as T;
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

export interface HubspotSearchPage<T> {
  total: number;
  results: T[];
  paging?: { next?: { after: string } };
}

export interface ContactFilter {
  query?: string;
  /** Contact ids to fetch in one round-trip. */
  ids?: string[];
  limit?: number;
}

export function searchContacts(filter: ContactFilter): Promise<HubspotSearchPage<HubspotContact>> {
  const body: Record<string, unknown> = {
    properties: CONTACT_PROPS,
    limit: filter.limit ?? 50,
  };
  if (filter.ids && filter.ids.length) {
    body.filterGroups = [{ filters: [{ propertyName: 'hs_object_id', operator: 'IN', values: filter.ids }] }];
  } else if (filter.query) {
    body.query = filter.query;
  }
  return hs<HubspotSearchPage<HubspotContact>>('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
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

export function searchDeals(filter: DealFilter): Promise<HubspotSearchPage<HubspotDeal>> {
  const filters: Array<{ propertyName: string; operator: string; value?: string }> = [];
  if (filter.pipeline) filters.push({ propertyName: 'pipeline', operator: 'EQ', value: filter.pipeline });
  if (filter.stage) filters.push({ propertyName: 'dealstage', operator: 'EQ', value: filter.stage });
  return hs<HubspotSearchPage<HubspotDeal>>('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: filters.length ? [{ filters }] : [],
      properties: DEAL_PROPS,
      limit: filter.limit ?? 50,
    }),
  });
}

/** Returns the contact ids associated with a given deal. */
export async function getDealContactIds(dealId: string): Promise<string[]> {
  const res = await hs<{ results: Array<{ id: string }> }>(
    '/crm/v3/objects/deals/' + encodeURIComponent(dealId) + '/associations/contacts',
  );
  return res.results.map((r) => r.id);
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

export function listServiceAreas(): Promise<HubspotSearchPage<HubspotServiceArea>> {
  return hs<HubspotSearchPage<HubspotServiceArea>>('/crm/v3/objects/service_areas/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [],
      properties: SA_PROPS,
      limit: 100,
    }),
  });
}

// ---------- Jobs (push) ------------------------------------------------------

export interface HubspotJob {
  id?: string;
  properties: Record<string, string | number | null>;
}

/** Serialize a FSM Job into the HubSpot Job custom object property bag. */
export function serializeJob(job: Job): HubspotJob['properties'] {
  const status = STATUS_ENUM_MAP[job.status] ?? STATUS_ENUM_MAP.scheduled;
  const start = job.date && job.startHour != null
    ? new Date(job.date + 'T' + Math.floor(job.startHour).toString().padStart(2, '0') + ':' + Math.round((job.startHour % 1) * 60).toString().padStart(2, '0') + ':00').toISOString()
    : null;
  const end = job.date && job.startHour != null
    ? new Date(new Date(start ?? job.date).getTime() + job.durationHrs * 3600 * 1000).toISOString()
    : null;
  return {
    fsm_job_id: job.id,
    fsm_job_url: 'jetson-fsm://job/' + job.id,
    fsm_status: status.fsmStatus,
    fsm_scheduled_start_time: start,
    fsm_scheduled_end_time: end,
    fsm_time_on_site: job.durationHrs,
    fsm_team_members_json: JSON.stringify(job.slots),
    job_type: mapJobTypeToHubspot(job.type),
    job_name: job.notes ? job.notes.slice(0, 120) : job.id,
    notes: job.notes,
  };
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

/** Create or update one HubSpot Job custom-object record for the supplied FSM Job. */
export async function createOrUpdateJobRecord(fsmJob: Job): Promise<HubspotJob> {
  // First try to find an existing record by fsm_job_id
  const search = await hs<HubspotSearchPage<HubspotJob>>('/crm/v3/objects/jobs/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'fsm_job_id', operator: 'EQ', value: fsmJob.id }] }],
      properties: ['fsm_job_id'],
      limit: 1,
    }),
  });
  const properties = serializeJob(fsmJob);
  if (search.results.length) {
    const existingId = search.results[0].id as string;
    return hs<HubspotJob>('/crm/v3/objects/jobs/' + existingId, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }
  return hs<HubspotJob>('/crm/v3/objects/jobs', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
}
