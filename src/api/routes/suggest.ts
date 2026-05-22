// =============================================================
// /v1/suggest/* — crew + time suggestions used by the wizard.
//
// `crew` reuses `suggestCrewForJob()` from lib/assignment.ts.
// `time` walks forward day-by-day on each viable crew, returns
// the same shape the wizard's SuggestTimePicker renders.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  crewMembers,
  crews as crewsTable,
  jobs as jobsTable,
  people as peopleTable,
  personRoles,
  timeOff,
} from '@/db/schema';
import type { Crew, Job, JobSlot, Person, RoleKey, TimeOff } from '@/types';
import { suggestCrewForJob } from '@/lib/assignment';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import {
  SuggestCrewRequestSchema,
  SuggestCrewResponseSchema,
  SuggestTimeRequestSchema,
  SuggestTimeResponseSchema,
} from '../schemas/suggest';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';

async function loadAllForSuggestions() {
  const crewRows = await db.select().from(crewsTable);
  const memberRows = await db.select().from(crewMembers);
  const peopleRows = await db.select().from(peopleTable);
  const roleRows = await db.select().from(personRoles);
  const jobRows = await db.select().from(jobsTable);
  const timeOffRows = await db.select().from(timeOff);

  const rolesByPerson = new Map<string, RoleKey[]>();
  for (const r of roleRows) {
    const arr = rolesByPerson.get(r.personId) ?? [];
    arr.push(r.role as RoleKey);
    rolesByPerson.set(r.personId, arr);
  }
  const allPeople: Person[] = peopleRows.map((p) => ({
    id: p.id,
    name: p.name,
    initials: p.initials,
    level: p.level,
    defaultCrew: p.defaultCrewId ?? '',
    roles: rolesByPerson.get(p.id) ?? [],
    certs: (p.certs as string[] | null | undefined) ?? undefined,
  }));

  const membersByCrew = new Map<string, string[]>();
  for (const m of memberRows) {
    const arr = membersByCrew.get(m.crewId) ?? [];
    arr.push(m.personId);
    membersByCrew.set(m.crewId, arr);
  }
  const allCrews: Crew[] = crewRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    lead: c.leadPersonId ?? '',
    members: membersByCrew.get(c.id) ?? [],
    truck: c.truckId,
    color: c.color,
  }));

  const allJobs: Job[] = jobRows.map((j) => ({
    id: j.id,
    type: j.type,
    status: j.status,
    customer: j.customerId,
    date: j.date,
    startHour: j.startHour != null ? Number(j.startHour) : null,
    durationHrs: Number(j.durationHrs),
    crewId: j.crewId,
    extraCrewIds: [],
    truckId: j.truckId,
    slots: [],
    notes: j.notes,
    address: j.address,
    hubspotDealId: j.hubspotDealId,
    driveTimeMin: j.driveTimeMin,
    projectId: j.projectId,
  }));

  const allTimeOff: TimeOff[] = timeOffRows.map((t) => ({
    id: t.id,
    personId: t.personId,
    date: t.date,
    type: t.type,
    label: t.label,
  }));

  return { allCrews, allPeople, allJobs, allTimeOff };
}

const suggestCrewRoute = createRoute({
  method: 'post',
  path: '/suggest/crew',
  tags: ['suggest'],
  summary: 'Rank crews for a job or job draft',
  request: { body: jsonContent(SuggestCrewRequestSchema, 'Job ref or draft') },
  responses: {
    200: jsonContent(SuggestCrewResponseSchema, 'Ranked crews'),
    ...ProblemResponses,
  },
});

const suggestTimeRoute = createRoute({
  method: 'post',
  path: '/suggest/time',
  tags: ['suggest'],
  summary: 'Propose start times for a draft job',
  request: { body: jsonContent(SuggestTimeRequestSchema, 'Draft constraints') },
  responses: {
    200: jsonContent(SuggestTimeResponseSchema, 'Time suggestions'),
    ...ProblemResponses,
  },
});

const WORK_START = 8;
const WORK_END = 17;

export function registerSuggestRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(suggestCrewRoute, async (c) => {
    const body = c.req.valid('json');
    const { allCrews, allPeople, allJobs, allTimeOff } = await loadAllForSuggestions();
    let job: Job;
    if ('jobId' in body) {
      const found = allJobs.find((j) => j.id === body.jobId);
      if (!found) throw new ApiError({ status: 404, title: 'Not Found', detail: `job ${body.jobId}` });
      job = found;
    } else {
      const draft = body.jobDraft;
      job = {
        id: 'draft',
        type: draft.type,
        status: draft.status ?? 'unscheduled',
        customer: draft.customer ?? null,
        date: draft.date ?? null,
        startHour: draft.startHour ?? null,
        durationHrs: draft.durationHrs ?? 0,
        crewId: draft.crewId ?? null,
        extraCrewIds: draft.extraCrewIds ?? [],
        truckId: draft.truckId ?? null,
        slots: (draft.slots ?? []) as JobSlot[],
        notes: draft.notes ?? '',
        address: draft.address ?? '',
        hubspotDealId: draft.hubspotDealId ?? null,
        driveTimeMin: draft.driveTimeMin ?? 0,
        projectId: draft.projectId ?? null,
      };
    }
    const suggestions = suggestCrewForJob(job, allCrews, allPeople, allJobs, allTimeOff);
    return c.json({ suggestions }, 200);
  });

  app.openapi(suggestTimeRoute, async (c) => {
    const { jobType, durationHrs, requiredRoles, anchorDate, daysAhead } =
      c.req.valid('json');
    const { allCrews, allPeople, allJobs, allTimeOff } = await loadAllForSuggestions();

    const today = anchorDate ?? new Date().toISOString().slice(0, 10);
    const startDate = new Date(today + 'T00:00:00');
    const out: Array<{
      crewId: string;
      date: string;
      startHour: number;
      endHour: number;
      score: number;
      reasons: string[];
    }> = [];

    // Crew must have at least one member per required role.
    for (const crew of allCrews) {
      const members = allPeople.filter((p) => crew.members.includes(p.id));
      const okRoles =
        requiredRoles.length === 0 ||
        requiredRoles.every((rr) => members.some((m) => m.roles.includes(rr.role)));
      if (!okRoles) continue;
      for (let d = 0; d < daysAhead; d += 1) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + d);
        const day = date.toISOString().slice(0, 10);
        const dayJobs = allJobs.filter(
          (j) => j.date === day && j.crewId === crew.id && j.startHour != null,
        );
        const onLeave = allTimeOff.some(
          (t) => t.date === day && crew.members.includes(t.personId),
        );
        if (onLeave) continue;
        const used: Array<[number, number]> = dayJobs
          .map((j) => [j.startHour as number, (j.startHour as number) + j.durationHrs] as [number, number])
          .sort((a, b) => a[0] - b[0]);
        // Find earliest open slot of length `durationHrs` within working hours.
        let cursor = WORK_START;
        for (const [s, e] of used) {
          if (cursor + durationHrs <= s) break;
          cursor = Math.max(cursor, e);
        }
        if (cursor + durationHrs <= WORK_END) {
          out.push({
            crewId: crew.id,
            date: day,
            startHour: cursor,
            endHour: cursor + durationHrs,
            score: Math.max(0, 100 - d * 4 - (cursor - WORK_START) * 2),
            reasons: [
              d === 0 ? 'Today' : `${d}d out`,
              cursor === WORK_START ? 'First job of the day' : 'After current jobs',
              `${jobType}`,
            ],
          });
          break; // first open day per crew is plenty for the picker
        }
      }
    }

    out.sort((a, b) => b.score - a.score);
    return c.json({ suggestions: out.slice(0, 8) }, 200);
  });
}
