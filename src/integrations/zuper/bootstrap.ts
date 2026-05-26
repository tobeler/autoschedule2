// =============================================================
// One-time Zuper → AutoSchedule data bootstrap.
//
// Pulls ACTIVE Zuper jobs (NEW/SCHEDULED/DISPATCHED/ON_MY_WAY/
// STARTED/ON_HOLD) and inserts them into our `jobs` table so the
// dispatcher has a starting set of work to schedule. Terminal
// statuses (COMPLETED/CLOSED/CANCELED/FAILED) are skipped.
//
// This is NOT a recurring sync — Zuper is a write target, not a
// read source going forward. We expose this as POST /api/v1/zuper/
// bootstrap so it's clearly one-shot rather than a /sync route.
//
// Behavior matching plan Unit 3, narrowed to active-only:
// - Title comes from Zuper job_title verbatim.
// - Customer resolution: HubSpot Deal ID → projects.hubspotDealId
//   → projects.customerId; fallback to projectByInstallationId
//   (legacy V1); fallback to Hubspot Contact ID lookup.
// - crewId is ALWAYS NULL. The dispatcher reassigns in-app.
// - zuperTeamName is set as reference text only (no crew row).
// =============================================================

import { db } from '@/lib/db';
import { customers, jobs as jobsTable, projects } from '@/db/schema';
import type { JobStatus } from '@/types';

import {
  currentStatus,
  getHubspotContactId,
  getHubspotDealId,
  getHubspotInstallationId,
  isZuperConfigured,
  listJobs,
  ZuperConfigError,
} from './client';
import { mapZuperCategory, mapZuperStatus, ACTIVE_STATUSES } from './field-map-defaults';
import type { ZuperJob } from './types';

export interface BootstrapResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  activeKept: number;
  upserted: number;
  withProject: number;
  withCustomer: number;
  errors: string[];
}

function hourOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function durationHoursBetween(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.round(((e - s) / (1000 * 60 * 60)) * 100) / 100;
}

function joinAddress(j: ZuperJob): string {
  const a = j.property?.property_address;
  if (!a) return '';
  return [a.street, a.city, a.state, a.zip_code].filter(Boolean).join(', ');
}

interface LookupMaps {
  projectByDealId: Map<string, { id: string; customerId: string }>;
  projectByInstallationId: Map<string, { id: string; customerId: string }>;
  customerByContactId: Map<string, string>;
}

async function buildLookupMaps(): Promise<LookupMaps> {
  const projectRows = await db
    .select({
      id: projects.id,
      customerId: projects.customerId,
      hubspotDealId: projects.hubspotDealId,
      source: projects.source,
    })
    .from(projects);
  const projectByDealId = new Map<string, { id: string; customerId: string }>();
  const projectByInstallationId = new Map<string, { id: string; customerId: string }>();
  for (const p of projectRows) {
    if (p.hubspotDealId) {
      projectByDealId.set(p.hubspotDealId, { id: p.id, customerId: p.customerId });
    }
    if (p.source === 'legacy_installation' && p.id.startsWith('hs-i-')) {
      projectByInstallationId.set(p.id.slice('hs-i-'.length), {
        id: p.id,
        customerId: p.customerId,
      });
    }
  }

  const customerRows = await db
    .select({ id: customers.id, hubspotId: customers.hubspotId })
    .from(customers);
  const customerByContactId = new Map<string, string>();
  for (const c of customerRows) {
    if (c.hubspotId) customerByContactId.set(c.hubspotId, c.id);
  }

  return { projectByDealId, projectByInstallationId, customerByContactId };
}

function projectAndCustomerFor(
  zJob: ZuperJob,
  maps: LookupMaps,
): { projectId: string | null; customerId: string | null; hubspotDealId: string | null } {
  const dealId = getHubspotDealId(zJob) ?? null;
  const installationId = getHubspotInstallationId(zJob) ?? null;
  const contactId = getHubspotContactId(zJob) ?? null;

  const project =
    (dealId ? maps.projectByDealId.get(dealId) : undefined) ??
    (installationId ? maps.projectByInstallationId.get(installationId) : undefined);

  const customerId =
    project?.customerId ??
    (contactId ? maps.customerByContactId.get(contactId) ?? null : null);

  return {
    projectId: project?.id ?? null,
    customerId,
    hubspotDealId: dealId,
  };
}

export async function bootstrapActiveJobsFromZuper(): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    pulled: 0,
    activeKept: 0,
    upserted: 0,
    withProject: 0,
    withCustomer: 0,
    errors: [],
  };

  if (!isZuperConfigured()) {
    result.errors.push('ZUPER_API_KEY not configured');
    result.finishedAt = new Date().toISOString();
    return result;
  }

  let zJobs: ZuperJob[];
  try {
    zJobs = await listJobs();
    result.pulled = zJobs.length;
  } catch (err) {
    result.errors.push(
      err instanceof ZuperConfigError
        ? err.message
        : 'Zuper fetch: ' + (err as Error).message,
    );
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const activeJobs = zJobs.filter((j) => ACTIVE_STATUSES.has(currentStatus(j)));
  result.activeKept = activeJobs.length;

  const maps = await buildLookupMaps();

  try {
    await db.transaction(async (tx) => {
      for (const zJob of activeJobs) {
        const { projectId, customerId, hubspotDealId } = projectAndCustomerFor(zJob, maps);
        if (projectId) result.withProject += 1;
        if (customerId) result.withCustomer += 1;

        const status: JobStatus = mapZuperStatus(currentStatus(zJob));
        const start = zJob.scheduled_start_time;
        const end = zJob.scheduled_end_time;
        const startDate = dateKey(start);
        const endDate = dateKey(end);
        const startH = hourOf(start);
        const endH = hourOf(end);
        const daysSpanned =
          startDate && endDate && startDate !== endDate
            ? Math.round(
                (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                  (1000 * 60 * 60 * 24),
              ) + 1
            : null;

        const id = 'zup-' + zJob.job_uid;
        const teamName = zJob.assigned_to_team?.[0]?.team?.team_name ?? null;

        try {
          await tx
            .insert(jobsTable)
            .values({
              id,
              type: mapZuperCategory(zJob.job_category?.category_name),
              title: zJob.job_title ?? null,
              status,
              customerId,
              projectId,
              date: startDate,
              startHour: startH != null ? String(startH) : null,
              durationHrs: String(durationHoursBetween(start, end)),
              address: joinAddress(zJob),
              hubspotDealId,
              zuperJobUid: zJob.job_uid,
              zuperJobUrl: null,
              zuperTeamName: teamName,
              endDate,
              endHour: endH != null ? String(endH) : null,
              daysSpanned,
              zuperSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: jobsTable.id,
              set: {
                title: zJob.job_title ?? null,
                type: mapZuperCategory(zJob.job_category?.category_name),
                status,
                customerId,
                projectId,
                date: startDate,
                startHour: startH != null ? String(startH) : null,
                durationHrs: String(durationHoursBetween(start, end)),
                address: joinAddress(zJob),
                hubspotDealId,
                zuperTeamName: teamName,
                endDate,
                endHour: endH != null ? String(endH) : null,
                daysSpanned,
                zuperSyncedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          result.upserted += 1;
        } catch (err) {
          result.errors.push(`Job ${zJob.job_uid}: ${(err as Error).message}`);
        }
      }
    });
    result.ok = result.errors.length === 0;
  } catch (err) {
    result.errors.push('Write phase: ' + (err as Error).message);
  }

  result.finishedAt = new Date().toISOString();
  return result;
}
