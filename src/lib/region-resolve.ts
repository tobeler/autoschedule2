// =============================================================
// region-resolve — derive a RegionPrefix for any job or project
// from the strongest available signal.
//
// Signals, in priority order:
//
//   1. job.zuperTeamName — most reliable when the crew is set in Zuper
//   2. linked project's resolved region (cascade — projects can carry
//      it via customer or installation city)
//   3. linked customer.address state (parsed)
//   4. job.title city/state token parsing
//   5. job.address state parsing (fallback for the rare case it's set)
//
// Returns null only when no signal lands. That's the "Region unknown"
// state — visible in the UI as a pill so the dispatcher can act.
// =============================================================
import type { Customer, Job, Project } from '@/types';
import { normalizeRegionPrefix, type RegionPrefix } from './region-core';

// Two-letter US state abbreviations -> RegionPrefix mapping. Only the
// states Jetson operates in roll up; everything else returns null.
const STATE_TO_PREFIX: Record<string, RegionPrefix> = {
  CO: 'CO',
  MA: 'MA',
  NY: 'NY',
  CA: 'CA',
  BC: 'BC', // not a US state — Canadian province; tolerated here
};

const STATE_NAME_TO_PREFIX: Record<string, RegionPrefix> = {
  COLORADO: 'CO',
  MASSACHUSETTS: 'MA',
  'NEW YORK': 'NY',
  CALIFORNIA: 'CA',
  'BRITISH COLUMBIA': 'BC',
};

// Cities -> RegionPrefix for title-token parsing where neither the
// state name nor the abbreviation is present.
const CITY_TO_PREFIX: Record<string, RegionPrefix> = {
  DENVER: 'CO',
  LOVELAND: 'CO',
  'COLORADO SPRINGS': 'CO',
  'GRAND JUNCTION': 'CO',
  BOSTON: 'MA',
  CAMBRIDGE: 'MA',
  NEWTON: 'MA',
  BROOKLINE: 'MA',
  SOMERVILLE: 'MA',
  ARLINGTON: 'MA',
  NORTON: 'MA',
  'WHITE PLAINS': 'NY',
  YONKERS: 'NY',
  'NEW YORK': 'NY',
  SACRAMENTO: 'CA',
  VANCOUVER: 'BC',
};

function fromAddress(addr: string | null | undefined): RegionPrefix | null {
  if (!addr) return null;
  const upper = addr.toUpperCase();
  // Match full state names first (more specific).
  for (const [name, prefix] of Object.entries(STATE_NAME_TO_PREFIX)) {
    if (upper.includes(name)) return prefix;
  }
  // Two-letter state code: ", XX " or ", XX," or end-of-string after comma.
  const m = upper.match(/,\s*([A-Z]{2})(?:\s|,|$)/);
  if (m && STATE_TO_PREFIX[m[1]]) return STATE_TO_PREFIX[m[1]];
  // City fallback.
  for (const [city, prefix] of Object.entries(CITY_TO_PREFIX)) {
    if (upper.includes(city)) return prefix;
  }
  return null;
}

/**
 * Resolve a region prefix for a job by trying every available signal.
 * `customer` and `project` are optional context lookups the caller passes
 * when they already have those rows handy. When all signals fail, returns
 * null and the UI should label this as "Region unknown".
 */
export function resolveJobRegion(
  job: Pick<Job, 'zuperTeamName' | 'address' | 'title'>,
  customer?: Customer | null,
  project?: Pick<Project, 'name' | 'id'> | null,
): RegionPrefix | null {
  // 1. Zuper team name carries the canonical region prefix.
  const fromTeam = normalizeRegionPrefix(job.zuperTeamName);
  if (fromTeam) return fromTeam;

  // 2. Job's own address (rare today — table is 100% empty — but cheap).
  const fromJobAddr = fromAddress(job.address);
  if (fromJobAddr) return fromJobAddr;

  // 3. Customer address state — the HubSpot-sourced signal we have.
  const fromCustAddr = fromAddress(customer?.address);
  if (fromCustAddr) return fromCustAddr;

  // 4. Job title city/state parsing — Zuper titles often include the
  // install city ("Eric Andalman - 6325 East Tufts Avenue, Denver, CO").
  const fromTitle = fromAddress(job.title);
  if (fromTitle) return fromTitle;

  // 5. Project name parsing — V2 projects may carry a city in their name.
  const fromProject = fromAddress(project?.name);
  if (fromProject) return fromProject;

  return null;
}

/**
 * Resolve a region prefix for a project. Uses its own name/customer first,
 * then aggregates from its linked jobs (caller passes the matching list).
 */
export function resolveProjectRegion(
  project: Pick<Project, 'name' | 'id'>,
  customer?: Customer | null,
  jobs: Array<Pick<Job, 'zuperTeamName' | 'address' | 'title' | 'projectId'>> = [],
): RegionPrefix | null {
  // 1. Customer address (HubSpot deal often carries it).
  const fromCust = fromAddress(customer?.address);
  if (fromCust) return fromCust;

  // 2. Project name parsing.
  const fromName = fromAddress(project.name);
  if (fromName) return fromName;

  // 3. Aggregate from linked jobs — first non-null wins.
  for (const j of jobs) {
    if (j.projectId !== project.id) continue;
    const r = resolveJobRegion(j, customer, project);
    if (r) return r;
  }

  return null;
}
