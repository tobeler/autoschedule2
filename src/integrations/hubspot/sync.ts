// =============================================================
// High-level HubSpot sync — orchestrates pulls (contacts/deals/SAs)
// and pushes (FSM Job custom-object records).
//
// The functions here read from / write to the Zustand store via the
// `actions` argument so they remain testable and so this module
// has no circular import dependency on `../../store`.
// =============================================================
import type { Customer, Job, Project, Region, SubRegion } from '../../types';
import {
  createOrUpdateJobRecord,
  getDealContactIds,
  HubspotApiError,
  HubspotConfigError,
  isHubspotConnected,
  listServiceAreas,
  searchContacts,
  searchDeals,
  type HubspotContact,
  type HubspotDeal,
  type HubspotJob,
  type HubspotServiceArea,
} from './client';

const CLOSED_WON_STAGES = ['closedwon', '1108691004']; // closedwon + closedwon-requote

// ---------- Pull -------------------------------------------------------------

export interface SyncFromHubspotResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  contacts: number;
  deals: number;
  serviceAreas: number;
  errors: string[];
}

export interface SyncActions {
  setCustomers: (next: Customer[]) => void;
  setProjects: (next: Project[]) => void;
  setRegions: (next: Region[]) => void;
}

export async function syncFromHubspot(actions?: SyncActions): Promise<SyncFromHubspotResult> {
  const result: SyncFromHubspotResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    contacts: 0,
    deals: 0,
    serviceAreas: 0,
    errors: [],
  };

  if (!isHubspotConnected()) {
    result.errors.push('HubSpot is not connected. Set VITE_HUBSPOT_TOKEN.');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  try {
    // 1) Pull Closed Won deals first — they're the seeds for the contacts we need.
    const dealPages: HubspotDeal[] = [];
    for (const stage of CLOSED_WON_STAGES) {
      try {
        const page = await searchDeals({ pipeline: 'default', stage, limit: 100 });
        dealPages.push(...page.results);
      } catch (err) {
        result.errors.push('Deals (' + stage + '): ' + describeError(err));
      }
    }
    result.deals = dealPages.length;

    // 2) Collect associated contact ids for those deals.
    const contactIdSet = new Set<string>();
    for (const deal of dealPages) {
      try {
        const ids = await getDealContactIds(deal.id);
        ids.forEach((id) => contactIdSet.add(id));
      } catch (err) {
        result.errors.push('Deal ' + deal.id + ' contacts: ' + describeError(err));
      }
    }

    // 3) Fetch those contacts.
    const contactRecords: HubspotContact[] = [];
    const ids = Array.from(contactIdSet);
    for (let i = 0; i < ids.length; i += 50) {
      try {
        const page = await searchContacts({ ids: ids.slice(i, i + 50), limit: 50 });
        contactRecords.push(...page.results);
      } catch (err) {
        result.errors.push('Contacts batch: ' + describeError(err));
      }
    }
    result.contacts = contactRecords.length;

    // 4) Service areas.
    let serviceAreaRecords: HubspotServiceArea[] = [];
    try {
      const sa = await listServiceAreas();
      serviceAreaRecords = sa.results;
      result.serviceAreas = sa.results.length;
    } catch (err) {
      result.errors.push('Service areas: ' + describeError(err));
    }

    // 5) Map into FSM entities and write into the store via the provided actions.
    if (actions) {
      actions.setCustomers(contactRecords.map(toCustomer));
      actions.setProjects(dealPages.map(toProject));
      if (serviceAreaRecords.length) actions.setRegions(toRegions(serviceAreaRecords));
    }

    result.ok = result.errors.length === 0;
  } catch (err) {
    result.errors.push(describeError(err));
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

// ---------- Push -------------------------------------------------------------

export interface PushJobResult {
  ok: boolean;
  jobId: string;
  hubspotRecordId?: string;
  message: string;
  raw?: HubspotJob;
}

export async function pushJobToHubspot(job: Job): Promise<PushJobResult> {
  if (!isHubspotConnected()) {
    return { ok: false, jobId: job.id, message: 'HubSpot not connected (no VITE_HUBSPOT_TOKEN).' };
  }
  try {
    const result = await createOrUpdateJobRecord(job);
    return {
      ok: true,
      jobId: job.id,
      hubspotRecordId: result.id,
      message: 'Pushed Job to HubSpot' + (result.id ? ' (record ' + result.id + ')' : '') + '.',
      raw: result,
    };
  } catch (err) {
    return { ok: false, jobId: job.id, message: describeError(err) };
  }
}

// ---------- Mappers (HubSpot → FSM) -----------------------------------------

function toCustomer(c: HubspotContact): Customer {
  const p = c.properties;
  const first = p.firstname ?? '';
  const last = p.lastname ?? '';
  const fullName = (first + ' ' + last).trim() || p.email || ('Contact ' + c.id);
  const addressParts = [p.address, p.city, p.state, p.zip].filter(Boolean) as string[];
  return {
    id: 'hs-c-' + c.id,
    name: fullName,
    address: addressParts.join(', '),
    phone: p.phone ?? '',
    hubspot: c.id,
  };
}

function toProject(d: HubspotDeal): Project {
  const p = d.properties;
  return {
    id: 'hs-d-' + d.id,
    customer: '', // wired up later in the seed→sync merge layer
    name: p.dealname ?? ('Deal ' + d.id),
    type: p.project_type ?? 'Retrofit',
    status: dealStageToStatus(p.dealstage),
    soldDate: p.closedate ?? null,
    targetCompletion: p.install_end_date ?? null,
    value: p.amount ? Number(p.amount) : null,
    hubspotDealId: d.id,
    primaryCrew: null,
    description: p.scheduling_instructions ?? undefined,
    designNotes: p.installation_notes ?? undefined,
  };
}

function dealStageToStatus(stage: string | null | undefined): Project['status'] {
  if (!stage) return 'sold';
  if (stage === 'closedwon' || stage === '1108691004') return 'sold';
  if (stage === '1183937358') return 'cancelled';
  if (stage === 'closedlost' || stage === '1353452390') return 'cancelled';
  return 'proposed';
}

function toRegions(records: HubspotServiceArea[]): Region[] {
  // Group SAs by country into a single region; each SA becomes a sub.
  const byCountry = new Map<string, SubRegion[]>();
  for (const r of records) {
    const props = r.properties;
    const country = (props.countries || 'United States').split(';')[0].trim();
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push({
      id: r.id,
      name: props.name ?? ('Service area ' + r.id),
      headcount: 0,
      crews: 0,
    });
  }
  const result: Region[] = [];
  let i = 0;
  for (const [country, subs] of byCountry) {
    i += 1;
    result.push({
      id: 'reg-' + i,
      name: country,
      short: country.slice(0, 2).toUpperCase(),
      subs,
    });
  }
  return result;
}

function describeError(err: unknown): string {
  if (err instanceof HubspotConfigError) return err.message;
  if (err instanceof HubspotApiError) return 'HubSpot ' + err.status + (err.category ? ' [' + err.category + ']' : '') + ': ' + err.message;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
