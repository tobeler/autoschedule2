// =============================================================
// HubSpot sync (Phase 13) — server-side orchestration that pulls
// HubSpot records (Service Areas, Contacts, native Projects,
// Closed-Won Deals, legacy Installations) and upserts the FSM
// Drizzle tables. Also handles pushing FSM Jobs and Project
// lifecycle updates back into HubSpot.
//
// Everything in this module assumes a server runtime — it reads
// `HUBSPOT_TOKEN`, opens a Postgres transaction, and never touches
// the Zustand store.
// =============================================================
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  customers,
  jobs as jobsTable,
  jobSlots,
  outbox,
  projects,
  regions,
} from '@/db/schema';
import type {
  Customer as AppCustomer,
  Job,
  Project as AppProject,
  ProjectStatus as AppProjectStatus,
  Region as AppRegion,
} from '../../types';

import {
  createOrUpdateJob,
  getContact,
  getDealContactIds,
  getInstallation,
  getProject,
  getProjectContactIds,
  HubspotApiError,
  HubspotConfigError,
  isHubspotConfigured,
  listServiceAreas,
  searchContacts,
  searchDeals,
  searchInstallations,
  searchProjects,
  updateProject,
  type HubspotContact,
  type HubspotDeal,
  type HubspotInstallation,
  type HubspotProject,
  type HubspotServiceArea,
  type HubspotJob,
} from './client';

// Closed Won + Closed Won-requote (Jetson-specific stage id).
const CLOSED_WON_STAGES = ['closedwon', '1108691004'];

// ---------- Pull -------------------------------------------------------------

export interface SyncCounts {
  regions: number;
  customers: number;
  projects: number;
  legacyInstallations: number;
  dealsAttached: number;
  deals: number;
  serviceAreas: number;
}

export interface SyncResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  counts: SyncCounts;
  errors: string[];
  notes: string[];
}

function describeError(err: unknown): string {
  if (err instanceof HubspotConfigError) return err.message;
  if (err instanceof HubspotApiError) {
    return 'HubSpot ' + err.status + (err.category ? ' [' + err.category + ']' : '') + ': ' + err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

function safeName(c: HubspotContact): string {
  const p = c.properties;
  const first = (p.firstname ?? '').trim();
  const last = (p.lastname ?? '').trim();
  const full = (first + ' ' + last).trim();
  if (full.length) return full;
  if (p.email) return p.email;
  return 'Contact ' + c.id;
}

function safeAddress(c: HubspotContact): string {
  const p = c.properties;
  const parts = [p.address, p.address_line_2, p.city, p.state, p.zip].filter(
    (s): s is string => Boolean(s && s.length),
  );
  return parts.join(', ');
}

function customerIdForContact(contactId: string): string {
  return 'hs-c-' + contactId;
}

function projectIdForHubspotProject(projectId: string): string {
  return 'hs-p-' + projectId;
}

function projectIdForLegacyInstallation(installationId: string): string {
  return 'hs-i-' + installationId;
}

function pipelineStageToStatus(stage: string | null | undefined): typeof projects.$inferInsert['status'] {
  switch ((stage ?? '').toLowerCase()) {
    case 'planning':
    case 'review':
      return 'sold';
    case 'execution':
      return 'in_progress';
    case 'completed':
      return 'complete';
    case 'cancelled':
      return 'cancelled';
    case 'on_hold':
      return 'in_progress';
    default:
      return 'sold';
  }
}

function dealStageToStatus(stage: string | null | undefined): typeof projects.$inferInsert['status'] {
  if (!stage) return 'sold';
  if (CLOSED_WON_STAGES.includes(stage)) return 'sold';
  if (stage === '1183937358' || stage === 'closedlost' || stage === '1353452390') return 'cancelled';
  return 'proposed';
}

function installationStageToStatus(stage: string | null | undefined): typeof projects.$inferInsert['status'] {
  switch ((stage ?? '').toLowerCase()) {
    case 'ready for install':
    case 'scheduled':
      return 'sold';
    case 'install incomplete':
    case 'close-out':
    case 'awaiting inspection':
      return 'in_progress';
    case 'complete':
    case 'closed':
      return 'complete';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'on hold':
    case 'pending':
    case 'pending rebate approval':
    case 'requote':
      return 'sold';
    default:
      return 'sold';
  }
}

function num(s: string | null | undefined): string | null {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n.toString();
}

function makeRegionShort(name: string): string {
  return name
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase() || 'XX';
}

// Heuristic for service areas whose HubSpot `countries` field is empty.
// Jetson operates in US (CO, MA, NY, CA) and Canada (BC). Recognize BC/AB
// and a few common Canadian city names so they don't get parented to
// "United States" by default.
function inferCountryFromServiceAreaName(name: string, code: string): string | null {
  const haystack = (name + ' ' + code).toUpperCase();
  if (/\b(BC|AB|ON|QC|VANCOUVER|TORONTO|MONTREAL|CALGARY)\b/.test(haystack)) {
    return 'Canada';
  }
  return null;
}

function legacyInstallationDescription(inst: HubspotInstallation): string {
  const stage = inst.properties.pipeline_stage_sync ?? null;
  const addressParts = [
    inst.properties.full_address,
    inst.properties.address_city,
    inst.properties.state_province_region,
    inst.properties.address_zip,
  ].filter((s): s is string => Boolean(s && s.length));
  const parts = ['Imported from legacy Installations object.'];
  if (stage) parts.push('Installation pipeline: ' + stage + '.');
  if (addressParts.length) parts.push(addressParts.join(', '));
  return parts.join(' ');
}

interface SyncOptions {
  /** Limit the per-record-type fetch (mainly for unit tests). */
  limit?: number;
}

// ---------- Pure parsers (HubSpot JSON → app entities) ---------------------
//
// These functions accept a single HubSpot record (already fetched) and
// return our typed app entity. They have NO DB dependency, so they can run
// in the laptop demo path where DATABASE_URL is unset. The DB-mode sync
// below uses them to derive the values it persists.

/** Convert a HubSpot Contact into our app's Customer. */
export function parseContactToCustomer(hsContact: HubspotContact): AppCustomer {
  return {
    id: customerIdForContact(hsContact.id),
    name: safeName(hsContact),
    address: safeAddress(hsContact),
    phone: hsContact.properties.phone ?? '',
    hubspot: hsContact.id,
  };
}

function numOrNull(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n;
}

/** Convert a HubSpot native Project (objectTypeId 0-970) into our app's Project. */
export function parseProjectToProject(
  hsProject: HubspotProject,
  opts: { customerId: string | null } = { customerId: null },
): AppProject {
  const p = hsProject.properties;
  const desc = [p.hs_description, p.system_design_notes]
    .filter((s): s is string => Boolean(s && s.length))
    .join('\n\n');
  return {
    id: projectIdForHubspotProject(hsProject.id),
    customer: opts.customerId ?? '',
    name: p.hs_name ?? 'Project ' + hsProject.id,
    type: p.hs_type ?? 'Retrofit',
    status: pipelineStageToStatus(p.hs_pipeline_stage) as AppProjectStatus,
    soldDate: p.hs_start_date ?? null,
    targetCompletion: p.hs_target_due_date ?? null,
    value: numOrNull(p.hs_total_cost),
    hubspotDealId: null,
    primaryCrew: null,
    description: desc.length ? desc : undefined,
    designNotes: p.system_design_notes ?? undefined,
    hubspotProjectId: hsProject.id,
    source: 'native_project',
  };
}

/** Convert a legacy HubSpot Installation into a Project stub (read-only history). */
export function parseInstallationToProject(
  hsInstallation: HubspotInstallation,
  opts: { customerId?: string | null } = {},
): AppProject {
  return {
    id: projectIdForLegacyInstallation(hsInstallation.id),
    customer: opts.customerId ?? 'hs-legacy-cust-' + hsInstallation.id,
    name: 'Legacy install ' + hsInstallation.id,
    type: 'Retrofit',
    status: installationStageToStatus(hsInstallation.properties.pipeline_stage_sync) as AppProjectStatus,
    soldDate: null,
    targetCompletion:
      hsInstallation.properties.zuper_job_installation_scheduled_start_time ??
      hsInstallation.properties.entered_complete_stage_date ??
      null,
    value: null,
    hubspotDealId: null,
    primaryCrew: null,
    description: legacyInstallationDescription(hsInstallation),
    hubspotProjectId: null,
    source: 'legacy_installation',
  };
}

/**
 * Convert a Closed Won HubSpot Deal into a Project stub. Used as a fallback
 * when no native Project record exists for the deal's contact.
 */
export function parseDealToProject(
  hsDeal: HubspotDeal,
  opts: { customerId?: string | null } = {},
): AppProject {
  const p = hsDeal.properties;
  return {
    id: 'hs-d-' + hsDeal.id,
    customer: opts.customerId ?? '',
    name: p.dealname ?? 'Deal ' + hsDeal.id,
    type: p.project_type ?? 'Retrofit',
    status: dealStageToStatus(p.dealstage) as AppProjectStatus,
    soldDate: p.closedate ? p.closedate.slice(0, 10) : null,
    targetCompletion: null,
    value: numOrNull(p.amount),
    hubspotDealId: hsDeal.id,
    primaryCrew: null,
    description: p.scheduling_instructions ?? undefined,
    designNotes: p.installation_notes ?? undefined,
    hubspotProjectId: null,
    source: 'deal_fallback',
  };
}

/** Convert a HubSpot Service Area record into our app's Region (flat, one-per-SA). */
export function parseServiceAreaToRegion(hsServiceArea: HubspotServiceArea): AppRegion {
  const p = hsServiceArea.properties;
  const name = p.name ?? 'Service area ' + hsServiceArea.id;
  const short = makeRegionShort(p.service_area_code ?? p.name ?? hsServiceArea.id);
  // Headcount + crews aren't carried by the HubSpot record; the dispatcher
  // computes them from the live people/crews tables. Demo defaults to 0.
  return {
    id: 'hs-sa-' + hsServiceArea.id,
    name,
    short,
    subs: [],
  };
}

/**
 * Pull HubSpot records into our Postgres. One Drizzle transaction wraps
 * every upsert so a partial failure rolls back cleanly. Returns a
 * structured summary the route handler echoes back to the caller.
 */
export async function syncFromHubspot(opts: SyncOptions = {}): Promise<SyncResult> {
  const result: SyncResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    counts: {
      regions: 0,
      customers: 0,
      projects: 0,
      legacyInstallations: 0,
      dealsAttached: 0,
      deals: 0,
      serviceAreas: 0,
    },
    errors: [],
    notes: [],
  };

  if (!isHubspotConfigured()) {
    result.errors.push('HubSpot not configured. Set HUBSPOT_TOKEN.');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  let serviceAreaRecords: HubspotServiceArea[] = [];
  let projectRecords: HubspotProject[] = [];
  let dealRecords: HubspotDeal[] = [];
  let installationRecords: HubspotInstallation[] = [];
  const contactIds = new Set<string>();
  const contactsByProject = new Map<string, string[]>();
  const contactsByDeal = new Map<string, string[]>();
  let contactRecords: HubspotContact[] = [];

  // -------- Fetch phase (network) ------------------------------------------
  //
  // V1/V2 toggle: read settings_kv flags so users can disable the legacy
  // Installations pull (V1) or the native Projects pull (V2) independently
  // from Settings → Integrations. Service Areas + Contacts + Deals are
  // shared and always run when either V1 or V2 is on.
  const { getAllIntegrationFlags } = await import('@/lib/settings');
  const flags = await getAllIntegrationFlags();
  result.notes.push(
    `Flags: V1 installations ${flags.hubspotV1 ? 'on' : 'off'}, V2 native projects ${flags.hubspotV2 ? 'on' : 'off'}.`,
  );

  try {
    serviceAreaRecords = await listServiceAreas();
    result.counts.serviceAreas = serviceAreaRecords.length;
  } catch (err) {
    result.errors.push('Service areas: ' + describeError(err));
  }

  if (flags.hubspotV2) {
    try {
      projectRecords = await searchProjects({ limit: opts.limit });
      result.counts.projects = projectRecords.length;
    } catch (err) {
      result.errors.push('Projects: ' + describeError(err));
    }
  } else {
    result.notes.push('Skipped native projects pull (V2 toggle is off).');
  }

  for (const proj of projectRecords) {
    try {
      const ids = await getProjectContactIds(proj.id);
      contactsByProject.set(proj.id, ids);
      ids.forEach((id) => contactIds.add(id));
    } catch (err) {
      result.errors.push('Project ' + proj.id + ' contacts: ' + describeError(err));
    }
  }

  try {
    for (const stage of CLOSED_WON_STAGES) {
      const page = await searchDeals({ pipeline: 'default', stage, limit: opts.limit });
      dealRecords.push(...page);
    }
    result.counts.deals = dealRecords.length;
  } catch (err) {
    result.errors.push('Deals: ' + describeError(err));
  }

  for (const deal of dealRecords) {
    try {
      const ids = await getDealContactIds(deal.id);
      contactsByDeal.set(deal.id, ids);
      ids.forEach((id) => contactIds.add(id));
    } catch (err) {
      result.errors.push('Deal ' + deal.id + ' contacts: ' + describeError(err));
    }
  }

  try {
    const ids = Array.from(contactIds);
    for (let i = 0; i < ids.length; i += 50) {
      const slice = ids.slice(i, i + 50);
      const page = await searchContacts({ ids: slice });
      contactRecords.push(...page);
    }
    result.counts.customers = contactRecords.length;
  } catch (err) {
    result.errors.push('Contacts batch: ' + describeError(err));
  }

  if (flags.hubspotV1) {
    try {
      installationRecords = await searchInstallations({ limit: opts.limit });
    } catch (err) {
      result.errors.push('Installations: ' + describeError(err));
    }
  } else {
    result.notes.push('Skipped legacy installations pull (V1 toggle is off).');
  }

  // -------- Write phase (one transaction) ----------------------------------

  try {
    await db.transaction(async (tx) => {
      // 1) Service areas → regions (parent country + sub regions).
      const byCountry = new Map<string, HubspotServiceArea[]>();
      for (const sa of serviceAreaRecords) {
        const rawCountry = (sa.properties.countries ?? '').split(';')[0].trim();
        // HubSpot's `countries` field is often empty on service areas, so
        // we'd default everything to US. That's wrong for BC, AB, etc.
        // Infer from the name/short-code as a fallback so non-US regions
        // don't get parented to "United States".
        const country =
          rawCountry ||
          inferCountryFromServiceAreaName(
            sa.properties.name ?? '',
            sa.properties.service_area_code ?? '',
          ) ||
          'United States';
        if (!byCountry.has(country)) byCountry.set(country, []);
        byCountry.get(country)!.push(sa);
      }
      let regionWrites = 0;
      for (const [country, subs] of byCountry) {
        const parentId = 'hs-reg-' + country.toLowerCase().replace(/\s+/g, '-');
        await tx
          .insert(regions)
          .values({
            id: parentId,
            name: country,
            short: makeRegionShort(country),
            parentRegionId: null,
            headcount: 0,
            crewCount: 0,
          })
          .onConflictDoUpdate({
            target: regions.id,
            set: { name: country, short: makeRegionShort(country), updatedAt: new Date() },
          });
        regionWrites += 1;
        for (const sa of subs) {
          await tx
            .insert(regions)
            .values({
              id: 'hs-sa-' + sa.id,
              name: sa.properties.name ?? 'Service area ' + sa.id,
              short: makeRegionShort(sa.properties.service_area_code ?? sa.properties.name ?? sa.id),
              parentRegionId: parentId,
              headcount: 0,
              crewCount: 0,
            })
            .onConflictDoUpdate({
              target: regions.id,
              set: {
                name: sa.properties.name ?? 'Service area ' + sa.id,
                short: makeRegionShort(sa.properties.service_area_code ?? sa.properties.name ?? sa.id),
                parentRegionId: parentId,
                updatedAt: new Date(),
              },
            });
          regionWrites += 1;
        }
      }
      result.counts.regions = regionWrites;

      // 2) Customers (only those linked to active projects/deals).
      for (const c of contactRecords) {
        await tx
          .insert(customers)
          .values({
            id: customerIdForContact(c.id),
            name: safeName(c),
            address: safeAddress(c),
            phone: c.properties.phone ?? '',
            hubspotId: c.id,
          })
          .onConflictDoUpdate({
            target: customers.id,
            set: {
              name: safeName(c),
              address: safeAddress(c),
              phone: c.properties.phone ?? '',
              hubspotId: c.id,
              updatedAt: new Date(),
            },
          });
      }

      // 3) Native Projects (`0-970`).
      for (const proj of projectRecords) {
        const projContacts = contactsByProject.get(proj.id) ?? [];
        const customerId = projContacts.length ? customerIdForContact(projContacts[0]) : null;
        if (!customerId) {
          // Skip projects without an associated contact — projects table
          // requires a non-null customerId. Note it for the report.
          result.notes.push('Project ' + proj.id + ' skipped: no associated contact');
          continue;
        }
        const id = projectIdForHubspotProject(proj.id);
        const p = proj.properties;
        const desc = [p.hs_description, p.system_design_notes]
          .filter((s): s is string => Boolean(s && s.length))
          .join('\n\n');
        const designNotes = p.system_design_notes ?? null;
        await tx
          .insert(projects)
          .values({
            id,
            customerId,
            name: p.hs_name ?? 'Project ' + proj.id,
            type: p.hs_type ?? 'Retrofit',
            status: pipelineStageToStatus(p.hs_pipeline_stage),
            soldDate: p.hs_start_date ?? null,
            targetCompletion: p.hs_target_due_date ?? null,
            value: num(p.hs_total_cost),
            hubspotDealId: null,
            hubspotProjectId: proj.id,
            source: 'native_project',
            description: desc.length ? desc : null,
            designNotes,
          })
          .onConflictDoUpdate({
            target: projects.id,
            set: {
              customerId,
              name: p.hs_name ?? 'Project ' + proj.id,
              type: p.hs_type ?? 'Retrofit',
              status: pipelineStageToStatus(p.hs_pipeline_stage),
              soldDate: p.hs_start_date ?? null,
              targetCompletion: p.hs_target_due_date ?? null,
              value: num(p.hs_total_cost),
              hubspotProjectId: proj.id,
              source: 'native_project',
              description: desc.length ? desc : null,
              designNotes,
              updatedAt: new Date(),
            },
          });
      }

      // 4) Closed Won Deals → attach as sales_context on the related project
      //    when we can resolve one (joined via shared contact ids). One deal
      //    may map to one project; the secondary deals beyond the first are
      //    noted in `result.notes`.
      //
      //    Join is best-effort: if no project shares a contact with this
      //    deal, the deal goes unattached. The route handler surfaces this
      //    via the result counts.
      let dealsAttached = 0;
      for (const deal of dealRecords) {
        const dealContacts = contactsByDeal.get(deal.id) ?? [];
        // Find the first project whose contacts overlap this deal's.
        const match = projectRecords.find((proj) => {
          const pc = contactsByProject.get(proj.id) ?? [];
          return pc.some((c) => dealContacts.includes(c));
        });
        if (!match) {
          result.notes.push('Deal ' + deal.id + ' could not be joined to a project');
          continue;
        }
        const projectRowId = projectIdForHubspotProject(match.id);
        // Stamp the deal id onto the project; further deals overwrite (we
        // intentionally keep the most recently-seen Closed Won as the primary
        // sales_context for v1).
        await tx
          .update(projects)
          .set({
            hubspotDealId: deal.id,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectRowId));
        dealsAttached += 1;
      }
      result.counts.dealsAttached = dealsAttached;

      // 5) Legacy Installations whose related Project doesn't already exist.
      //    The installation row carries `related_project_id` (set by HubSpot
      //    via the legacy pipeline). If that project id is in our active
      //    project set we skip; otherwise we upsert a stub with
      //    `source: 'legacy_installation'`.
      let legacyWrites = 0;
      const activeProjectKeys = new Set(projectRecords.map((p) => p.id));
      for (const inst of installationRecords) {
        const relProj = inst.properties.related_project_id ?? null;
        if (relProj && activeProjectKeys.has(relProj)) continue;
        const legacyId = projectIdForLegacyInstallation(inst.id);
        // Address-only — install records carry their own place_* fields.
        const addressParts = [
          inst.properties.full_address,
          inst.properties.address_city,
          inst.properties.state_province_region,
          inst.properties.address_zip,
        ].filter((s): s is string => Boolean(s && s.length));
        // Synthesize a stand-in customer when we can't reuse one (legacy
        // installs may pre-date the contact in our `customers` table).
        const standInCustomerId = 'hs-legacy-cust-' + inst.id;
        const addressJoined = addressParts.join(', ');
        await tx
          .insert(customers)
          .values({
            id: standInCustomerId,
            name: 'Legacy install ' + inst.id,
            address: addressJoined,
            phone: '',
            hubspotId: null,
          })
          // Backfill the address on existing rows whose address is still
          // empty — these were created in an earlier sync before the
          // full_address/city/state fields were pulled. Doing this on
          // conflict lets a re-sync populate addresses without manual
          // migration. Name is preserved (so the customer-name backfill
          // from job titles isn't clobbered).
          .onConflictDoUpdate({
            target: customers.id,
            set: { address: addressJoined, updatedAt: new Date() },
            setWhere: sql`coalesce(customers.address, '') = '' and ${addressJoined} <> ''`,
          });
        await tx
          .insert(projects)
          .values({
            id: legacyId,
            customerId: standInCustomerId,
            name: 'Legacy install ' + inst.id,
            type: 'Retrofit',
            status: installationStageToStatus(inst.properties.pipeline_stage_sync),
            soldDate: null,
            targetCompletion:
              inst.properties.zuper_job_installation_scheduled_start_time ??
              inst.properties.entered_complete_stage_date ??
              null,
            value: null,
            hubspotDealId: null,
            hubspotProjectId: null,
            source: 'legacy_installation',
            description: legacyInstallationDescription(inst),
            designNotes: null,
          })
          .onConflictDoUpdate({
            target: projects.id,
            set: {
              status: installationStageToStatus(inst.properties.pipeline_stage_sync),
              targetCompletion:
                inst.properties.zuper_job_installation_scheduled_start_time ??
                inst.properties.entered_complete_stage_date ??
                null,
              source: 'legacy_installation',
              description: legacyInstallationDescription(inst),
              updatedAt: new Date(),
            },
          });
        legacyWrites += 1;
      }
      result.counts.legacyInstallations = legacyWrites;

      // 6) Permits / Systems / Rebates — read-only child rows. There are no
      //    child tables in our schema today; noted so a future migration
      //    can land them. See route handler for the schema-gap warning.
      result.notes.push(
        'Permits/Systems/Rebates: read-only child tables not modeled in v1 schema; skipped.',
      );
    });

    result.ok = result.errors.length === 0;
  } catch (err) {
    result.errors.push('Write phase: ' + describeError(err));
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

// ---------- Stateless demo-mode pull ----------------------------------------
//
// Used by the API route when DATABASE_URL is unset. Pulls the same
// HubSpot records the DB-mode sync does, but returns the parsed app
// entities directly instead of writing to Postgres.

export interface DemoPullResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  customers: AppCustomer[];
  projects: AppProject[];
  regions: AppRegion[];
  errors: string[];
  notes: string[];
}

export async function pullHubspotForDemo(opts: SyncOptions = {}): Promise<DemoPullResult> {
  const out: DemoPullResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    customers: [],
    projects: [],
    regions: [],
    errors: [],
    notes: [],
  };

  if (!isHubspotConfigured()) {
    out.errors.push('HubSpot not configured. Set HUBSPOT_TOKEN.');
    out.finishedAt = new Date().toISOString();
    return out;
  }

  let serviceAreaRecords: HubspotServiceArea[] = [];
  let projectRecords: HubspotProject[] = [];
  let dealRecords: HubspotDeal[] = [];
  let installationRecords: HubspotInstallation[] = [];
  const contactIds = new Set<string>();
  const contactsByProject = new Map<string, string[]>();
  const contactsByDeal = new Map<string, string[]>();
  let contactRecords: HubspotContact[] = [];

  // V1/V2 flags also apply to the demo pull so the laptop demo matches
  // what the DB sync would do.
  const { getAllIntegrationFlags } = await import('@/lib/settings');
  const flags = await getAllIntegrationFlags();

  try {
    serviceAreaRecords = await listServiceAreas();
  } catch (err) {
    out.errors.push('Service areas: ' + describeError(err));
  }

  if (flags.hubspotV2) {
    try {
      projectRecords = await searchProjects({ limit: opts.limit });
    } catch (err) {
      out.errors.push('Projects: ' + describeError(err));
    }
  }

  for (const proj of projectRecords) {
    try {
      const ids = await getProjectContactIds(proj.id);
      contactsByProject.set(proj.id, ids);
      ids.forEach((id) => contactIds.add(id));
    } catch (err) {
      out.errors.push('Project ' + proj.id + ' contacts: ' + describeError(err));
    }
  }

  try {
    for (const stage of CLOSED_WON_STAGES) {
      const page = await searchDeals({ pipeline: 'default', stage, limit: opts.limit });
      dealRecords.push(...page);
    }
  } catch (err) {
    out.errors.push('Deals: ' + describeError(err));
  }

  for (const deal of dealRecords) {
    try {
      const ids = await getDealContactIds(deal.id);
      contactsByDeal.set(deal.id, ids);
      ids.forEach((id) => contactIds.add(id));
    } catch (err) {
      out.errors.push('Deal ' + deal.id + ' contacts: ' + describeError(err));
    }
  }

  try {
    const ids = Array.from(contactIds);
    for (let i = 0; i < ids.length; i += 50) {
      const slice = ids.slice(i, i + 50);
      const page = await searchContacts({ ids: slice });
      contactRecords.push(...page);
    }
  } catch (err) {
    out.errors.push('Contacts batch: ' + describeError(err));
  }

  if (flags.hubspotV1) {
    try {
      installationRecords = await searchInstallations({ limit: opts.limit });
    } catch (err) {
      out.errors.push('Installations: ' + describeError(err));
    }
  }

  // -------- Parse phase (pure, no DB) ---------------------------------------

  out.customers = contactRecords.map((c) => parseContactToCustomer(c));
  out.regions = serviceAreaRecords.map((sa) => parseServiceAreaToRegion(sa));

  // Track which customer keys map to which contact id so projects can be
  // attached to the right customer. The customer.id we emit is deterministic.
  const customerIdByContactId = new Map<string, string>();
  for (const c of out.customers) customerIdByContactId.set(c.hubspot, c.id);

  // Native projects (PRIMARY).
  const projectsOut: AppProject[] = [];
  const customersWithNativeProject = new Set<string>();
  for (const proj of projectRecords) {
    const projContacts = contactsByProject.get(proj.id) ?? [];
    const customerId = projContacts.length
      ? customerIdByContactId.get(projContacts[0]) ?? null
      : null;
    if (!customerId) {
      out.notes.push('Project ' + proj.id + ' skipped: no associated contact');
      continue;
    }
    customersWithNativeProject.add(customerId);
    // Attach the first matching Closed Won deal id for sales_context.
    const matchedDeal = dealRecords.find((d) => {
      const dc = contactsByDeal.get(d.id) ?? [];
      return dc.some((cid) => projContacts.includes(cid));
    });
    const parsed = parseProjectToProject(proj, { customerId });
    if (matchedDeal) parsed.hubspotDealId = matchedDeal.id;
    projectsOut.push(parsed);
  }

  // Closed Won deals → fallback projects for contacts with no native project.
  for (const deal of dealRecords) {
    const dealContacts = contactsByDeal.get(deal.id) ?? [];
    const customerId = dealContacts.length
      ? customerIdByContactId.get(dealContacts[0]) ?? null
      : null;
    if (!customerId) {
      out.notes.push('Deal ' + deal.id + ' could not be joined to a customer');
      continue;
    }
    if (customersWithNativeProject.has(customerId)) continue;
    projectsOut.push(parseDealToProject(deal, { customerId }));
  }

  // Legacy installations (read-only history) for installs without a native peer.
  const activeProjectIds = new Set(projectRecords.map((p) => p.id));
  for (const inst of installationRecords) {
    const relProj = inst.properties.related_project_id ?? null;
    if (relProj && activeProjectIds.has(relProj)) continue;
    // For the demo response we synthesize a stand-in customer (the legacy
    // install doesn't expose the contact id directly here).
    const standInCustomerId = 'hs-legacy-cust-' + inst.id;
    if (!out.customers.some((c) => c.id === standInCustomerId)) {
      const addressParts = [
        inst.properties.full_address,
        inst.properties.address_city,
        inst.properties.state_province_region,
        inst.properties.address_zip,
      ].filter((s): s is string => Boolean(s && s.length));
      out.customers.push({
        id: standInCustomerId,
        name: 'Legacy install ' + inst.id,
        address: addressParts.join(', '),
        phone: '',
        hubspot: '',
      });
    }
    projectsOut.push(parseInstallationToProject(inst, { customerId: standInCustomerId }));
  }

  out.projects = projectsOut;
  out.ok = out.errors.length === 0;
  out.finishedAt = new Date().toISOString();
  return out;
}

// ---------- Targeted single-record pulls (used by webhook receiver) ---------

/** Pull and upsert a single Project record. */
export async function syncProject(projectId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const proj = await getProject(projectId);
    const contactIds = await getProjectContactIds(projectId);
    const customerId = contactIds.length ? customerIdForContact(contactIds[0]) : null;
    if (!customerId) {
      return { ok: false, message: 'Project has no associated contact' };
    }
    // Make sure the contact exists locally first.
    const c = await getContact(contactIds[0]);
    await db
      .insert(customers)
      .values({
        id: customerId,
        name: safeName(c),
        address: safeAddress(c),
        phone: c.properties.phone ?? '',
        hubspotId: c.id,
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: safeName(c),
          address: safeAddress(c),
          phone: c.properties.phone ?? '',
          updatedAt: new Date(),
        },
      });
    const id = projectIdForHubspotProject(proj.id);
    const p = proj.properties;
    await db
      .insert(projects)
      .values({
        id,
        customerId,
        name: p.hs_name ?? 'Project ' + proj.id,
        type: p.hs_type ?? 'Retrofit',
        status: pipelineStageToStatus(p.hs_pipeline_stage),
        soldDate: p.hs_start_date ?? null,
        targetCompletion: p.hs_target_due_date ?? null,
        value: num(p.hs_total_cost),
        hubspotProjectId: proj.id,
        source: 'native_project',
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: p.hs_name ?? 'Project ' + proj.id,
          status: pipelineStageToStatus(p.hs_pipeline_stage),
          targetCompletion: p.hs_target_due_date ?? null,
          value: num(p.hs_total_cost),
          updatedAt: new Date(),
        },
      });
    return { ok: true, message: 'Synced project ' + projectId };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/** Pull and upsert a single Contact record. */
export async function syncContact(contactId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const c = await getContact(contactId);
    await db
      .insert(customers)
      .values({
        id: customerIdForContact(c.id),
        name: safeName(c),
        address: safeAddress(c),
        phone: c.properties.phone ?? '',
        hubspotId: c.id,
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: safeName(c),
          address: safeAddress(c),
          phone: c.properties.phone ?? '',
          updatedAt: new Date(),
        },
      });
    return { ok: true, message: 'Synced contact ' + contactId };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/** Pull and reconcile a single legacy Installation. */
export async function syncInstallation(installationId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const inst = await getInstallation(installationId);
    const relProj = inst.properties.related_project_id ?? null;
    if (relProj) {
      // If the live project exists in our DB, prefer it. The presence of the
      // live row is the cue to drop the legacy stub.
      const live = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.hubspotProjectId, relProj))
        .limit(1);
      if (live.length) return { ok: true, message: 'Legacy install ' + installationId + ' superseded' };
    }
    const legacyId = projectIdForLegacyInstallation(inst.id);
    const standInCustomerId = 'hs-legacy-cust-' + inst.id;
    await db
      .insert(customers)
      .values({
        id: standInCustomerId,
        name: 'Legacy install ' + inst.id,
        address: '',
        phone: '',
      })
      .onConflictDoNothing({ target: customers.id });
    await db
      .insert(projects)
      .values({
        id: legacyId,
        customerId: standInCustomerId,
        name: 'Legacy install ' + inst.id,
        type: 'Retrofit',
        status: installationStageToStatus(inst.properties.pipeline_stage_sync),
        targetCompletion:
          inst.properties.zuper_job_installation_scheduled_start_time ??
          inst.properties.entered_complete_stage_date ??
          null,
        description: legacyInstallationDescription(inst),
        source: 'legacy_installation',
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          status: installationStageToStatus(inst.properties.pipeline_stage_sync),
          targetCompletion:
            inst.properties.zuper_job_installation_scheduled_start_time ??
            inst.properties.entered_complete_stage_date ??
            null,
          description: legacyInstallationDescription(inst),
          updatedAt: new Date(),
        },
      });
    return { ok: true, message: 'Synced installation ' + installationId };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/**
 * Triggered by deal.propertyChange when a deal reaches Closed Won. If no
 * project already exists for the deal's contact, kicks off a full pull so the
 * project lands in our DB.
 */
export async function syncDealClosedWon(dealId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const contactIds = await getDealContactIds(dealId);
    if (!contactIds.length) return { ok: false, message: 'Deal ' + dealId + ' has no contacts' };
    const customerId = customerIdForContact(contactIds[0]);
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.customerId, customerId))
      .limit(1);
    if (existing.length) {
      return { ok: true, message: 'Deal ' + dealId + ' already has a project; no-op' };
    }
    // No existing project — kick off a full sync. Cheaper than constructing
    // a project record by hand because the native Project record probably
    // exists in HubSpot already and our sync logic already handles it.
    const r = await syncFromHubspot();
    return { ok: r.ok, message: 'Triggered full sync from deal ' + dealId };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

// ---------- Push: FSM Job → HubSpot Job custom object -----------------------

export interface PushJobResult {
  ok: boolean;
  jobId: string;
  hubspotObjectId?: string;
  message: string;
  raw?: HubspotJob;
}

export async function pushJobToHubspot(fsmJobId: string): Promise<PushJobResult> {
  if (!isHubspotConfigured()) {
    return { ok: false, jobId: fsmJobId, message: 'HubSpot not configured (no HUBSPOT_TOKEN).' };
  }

  // Load the job + slots from Postgres.
  const row = (
    await db.select().from(jobsTable).where(eq(jobsTable.id, fsmJobId)).limit(1)
  )[0];
  if (!row) return { ok: false, jobId: fsmJobId, message: 'Job not found' };

  const slotRows = await db
    .select()
    .from(jobSlots)
    .where(eq(jobSlots.jobId, fsmJobId));

  const job: Job = {
    id: row.id,
    type: row.type,
    status: row.status,
    customer: row.customerId,
    date: row.date,
    startHour: row.startHour !== null ? Number(row.startHour) : null,
    durationHrs: Number(row.durationHrs ?? 0),
    crewId: row.crewId,
    extraCrewIds: [],
    truckId: row.truckId,
    slots: slotRows.map((s) => ({
      id: s.id,
      role: s.role,
      level: s.level,
      hours: Number(s.hours),
      start: Number(s.startOffsetHours ?? 0),
      optional: s.optional,
      assignedTo: s.assignedTo,
      suggested: s.suggested,
    })),
    notes: row.notes,
    address: row.address,
    hubspotDealId: row.hubspotDealId,
    driveTimeMin: row.driveTimeMin,
    projectId: row.projectId,
  };

  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://autoschedule2.vercel.app';
    const jobUrl = baseUrl.replace(/\/$/, '') + '/jobs/' + encodeURIComponent(job.id);
    const result = await createOrUpdateJob(job, {
      jobUrl,
      existingHubspotId: row.hubspotJobObjectId,
    });
    // Persist the HubSpot record id.
    if (result.id && result.id !== row.hubspotJobObjectId) {
      await db
        .update(jobsTable)
        .set({ hubspotJobObjectId: result.id, updatedAt: new Date() })
        .where(eq(jobsTable.id, fsmJobId));
    }
    return {
      ok: true,
      jobId: fsmJobId,
      hubspotObjectId: result.id,
      message: 'Pushed job to HubSpot (record ' + (result.id ?? 'n/a') + ').',
      raw: result,
    };
  } catch (err) {
    return { ok: false, jobId: fsmJobId, message: describeError(err) };
  }
}

// ---------- Push: FSM Project lifecycle → HubSpot Project -------------------

export interface PushProjectResult {
  ok: boolean;
  projectId: string;
  hubspotObjectId?: string;
  message: string;
}

/**
 * Push our project's status updates back to the HubSpot Project record.
 * Writes:
 *  - installation_date_formatted (computed from earliest scheduled job date)
 *  - field_work_completed (true iff every linked job is `complete`)
 *  - ready_to_close + close_out_notes
 *  - hs_pipeline_stage = `completed` when all jobs are complete
 *  - hs_close_date = today when transitioning to completed
 */
export async function pushProjectToHubspot(fsmProjectId: string): Promise<PushProjectResult> {
  if (!isHubspotConfigured()) {
    return { ok: false, projectId: fsmProjectId, message: 'HubSpot not configured (no HUBSPOT_TOKEN).' };
  }
  const row = (
    await db.select().from(projects).where(eq(projects.id, fsmProjectId)).limit(1)
  )[0];
  if (!row) return { ok: false, projectId: fsmProjectId, message: 'Project not found' };
  if (!row.hubspotProjectId) {
    return {
      ok: false,
      projectId: fsmProjectId,
      message: 'Project ' + fsmProjectId + ' is not linked to a HubSpot Project record',
    };
  }

  // Gather child jobs to compute lifecycle flags.
  const childJobs = await db
    .select({ status: jobsTable.status, date: jobsTable.date })
    .from(jobsTable)
    .where(eq(jobsTable.projectId, fsmProjectId));

  const total = childJobs.length;
  const allComplete = total > 0 && childJobs.every((j) => j.status === 'complete');
  const earliestDate = childJobs
    .map((j) => j.date)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  const patch: Record<string, string | number | boolean | null> = {};
  if (earliestDate) patch.installation_date_formatted = earliestDate;
  patch.field_work_completed = allComplete;
  patch.ready_to_close = allComplete;
  if (row.description) patch.close_out_notes = row.description;
  if (allComplete) {
    patch.hs_pipeline_stage = 'completed';
    patch.hs_close_date = new Date().toISOString().slice(0, 10);
  }

  try {
    const result = await updateProject(row.hubspotProjectId, patch);
    return {
      ok: true,
      projectId: fsmProjectId,
      hubspotObjectId: result.id,
      message: 'Pushed project lifecycle to HubSpot Project ' + row.hubspotProjectId,
    };
  } catch (err) {
    return { ok: false, projectId: fsmProjectId, message: describeError(err) };
  }
}

// ---------- Outbox draining -------------------------------------------------

/** Drain a single outbox row by id. Called by the Supabase Database webhook. */
export async function drainOutboxRow(rowId: string): Promise<{ ok: boolean; message: string }> {
  const row = (await db.select().from(outbox).where(eq(outbox.id, rowId)).limit(1))[0];
  if (!row) return { ok: false, message: 'Outbox row not found' };
  if (row.deliveredAt) return { ok: true, message: 'Already delivered' };

  try {
    const payload = row.payloadJson as { jobId?: string; projectId?: string } | null;
    if (row.topic === 'jobs.updated') {
      const jobId = payload?.jobId;
      if (!jobId) throw new Error('jobs.updated payload missing jobId');
      const r = await pushJobToHubspot(jobId);
      if (!r.ok) throw new Error(r.message);
    } else if (row.topic === 'projects.updated') {
      const projectId = payload?.projectId;
      if (!projectId) throw new Error('projects.updated payload missing projectId');
      const r = await pushProjectToHubspot(projectId);
      if (!r.ok) throw new Error(r.message);
    } else {
      // Unknown topic — mark delivered so we don't retry forever.
    }
    await db
      .update(outbox)
      .set({ deliveredAt: new Date(), attempts: (row.attempts ?? 0) + 1 })
      .where(eq(outbox.id, rowId));
    return { ok: true, message: 'Delivered ' + row.topic };
  } catch (err) {
    await db
      .update(outbox)
      .set({ attempts: (row.attempts ?? 0) + 1 })
      .where(eq(outbox.id, rowId));
    return { ok: false, message: describeError(err) };
  }
}

/**
 * Drain every undelivered outbox row in order. Used by the cron entry as a
 * safety net in case the Database Webhook missed an insert.
 */
export async function drainOutbox(): Promise<{ delivered: number; failed: number }> {
  const pending = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(isNull(outbox.deliveredAt), sql`${outbox.attempts} < 10`))
    .limit(200);
  let delivered = 0;
  let failed = 0;
  for (const p of pending) {
    const r = await drainOutboxRow(p.id);
    if (r.ok) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed };
}
