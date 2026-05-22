// =============================================================
// /v1/jobs — the central scheduling resource.
//
// List supports ?date / ?crewId / ?status / ?customer / ?projectId.
// The transition endpoint enforces a small state machine + writes
// actuals timestamps. Auto-fill runs the same `autoFillSlots()` the
// wizard uses, then persists the new slot assignments.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  crewMembers,
  crewRosterOverrides,
  crews,
  jobExtraCrews,
  jobSlots,
  jobs,
  people,
  personRoles,
  timeOff,
  type DbJob,
} from '@/db/schema';
import type { Crew, Job, JobSlot, JobStatus, Person, RoleKey, TimeOff } from '@/types';
import { autoFillSlots } from '@/lib/assignment';

import {
  IdParamSchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  JobCreateSchema,
  JobSchema,
  JobTransitionSchema,
  JobUpdateSchema,
  JobsListQuerySchema,
} from '../schemas/job';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { jobToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

// ---- state machine ---------------------------------------------------------

const ALLOWED: Record<JobStatus, JobStatus[]> = {
  unscheduled: ['scheduled', 'callback'],
  scheduled: ['enroute', 'onsite', 'unscheduled', 'callback'],
  enroute: ['onsite', 'scheduled', 'callback'],
  onsite: ['complete', 'enroute', 'callback'],
  complete: ['callback'],
  callback: ['scheduled', 'unscheduled'],
};

function validTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

// ---- helpers ---------------------------------------------------------------

async function loadJobBundle(id: string) {
  const row = (await db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  if (!row) return null;
  const slots = await db
    .select()
    .from(jobSlots)
    .where(eq(jobSlots.jobId, id))
    .orderBy(asc(jobSlots.sortOrder));
  const extras = await db
    .select()
    .from(jobExtraCrews)
    .where(eq(jobExtraCrews.jobId, id));
  return jobToDTO(
    row,
    slots,
    extras.map((e) => e.crewId),
  );
}

async function loadJobsListBundle(rows: DbJob[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const slots = await db
    .select()
    .from(jobSlots)
    .where(inArray(jobSlots.jobId, ids))
    .orderBy(asc(jobSlots.sortOrder));
  const extras = await db
    .select()
    .from(jobExtraCrews)
    .where(inArray(jobExtraCrews.jobId, ids));
  const slotsByJob = new Map<string, typeof slots>();
  for (const s of slots) {
    const arr = slotsByJob.get(s.jobId) ?? [];
    arr.push(s);
    slotsByJob.set(s.jobId, arr);
  }
  const extrasByJob = new Map<string, string[]>();
  for (const e of extras) {
    const arr = extrasByJob.get(e.jobId) ?? [];
    arr.push(e.crewId);
    extrasByJob.set(e.jobId, arr);
  }
  return rows.map((r) =>
    jobToDTO(r, slotsByJob.get(r.id) ?? [], extrasByJob.get(r.id) ?? []),
  );
}

async function writeJobSlots(jobId: string, slots: JobSlot[]) {
  await db.delete(jobSlots).where(eq(jobSlots.jobId, jobId));
  if (slots.length) {
    await db.insert(jobSlots).values(
      slots.map((s, i) => ({
        id: s.id || `${jobId}-S${i}`,
        jobId,
        role: s.role,
        level: s.level,
        hours: String(s.hours),
        startOffsetHours: String(s.start),
        optional: s.optional ?? false,
        assignedTo: s.assignedTo,
        suggested: s.suggested ?? false,
        sortOrder: i,
      })),
    );
  }
}

async function writeExtraCrews(jobId: string, ids: string[]) {
  await db.delete(jobExtraCrews).where(eq(jobExtraCrews.jobId, jobId));
  if (ids.length) {
    await db
      .insert(jobExtraCrews)
      .values(ids.map((crewId) => ({ jobId, crewId })));
  }
}

// ---- routes ----------------------------------------------------------------

const listRoute = createRoute({
  method: 'get',
  path: '/jobs',
  tags: ['jobs'],
  summary: 'List jobs',
  request: { query: JobsListQuerySchema },
  responses: {
    200: jsonContent(paged(JobSchema), 'Jobs page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/jobs/{id}',
  tags: ['jobs'],
  summary: 'Get a job',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(JobSchema, 'Job'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/jobs',
  tags: ['jobs'],
  summary: 'Create a job',
  request: { body: jsonContent(JobCreateSchema, 'Job fields') },
  responses: { 201: jsonContent(JobSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/jobs/{id}',
  tags: ['jobs'],
  summary: 'Update a job',
  request: {
    params: IdParamSchema,
    body: jsonContent(JobUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(JobSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/jobs/{id}',
  tags: ['jobs'],
  summary: 'Soft-delete a job (sets status=unscheduled, clears date)',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Soft-deleted'),
    ...ProblemResponses,
  },
});

const transitionRoute = createRoute({
  method: 'post',
  path: '/jobs/{id}/transition',
  tags: ['jobs'],
  summary: 'Transition a job status; writes the matching actuals timestamp',
  request: {
    params: IdParamSchema,
    body: jsonContent(JobTransitionSchema, 'New status'),
  },
  responses: { 200: jsonContent(JobSchema, 'Updated job'), ...ProblemResponses },
});

const autoFillRoute = createRoute({
  method: 'post',
  path: '/jobs/{id}/auto-fill',
  tags: ['jobs'],
  summary: 'Auto-assign empty slots from the job\'s crew, then any qualified person',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(JobSchema, 'Updated job'), ...ProblemResponses },
});

export function registerJobRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const q = c.req.valid('query');
    const limit = q.limit ? Math.max(1, Math.min(500, Number(q.limit))) : 200;
    const offset = q.offset ? Math.max(0, Number(q.offset)) : 0;
    const conds: SQL[] = [];
    if (q.date) conds.push(eq(jobs.date, q.date));
    if (q.crewId) conds.push(eq(jobs.crewId, q.crewId));
    if (q.status) conds.push(eq(jobs.status, q.status));
    if (q.customer) conds.push(eq(jobs.customerId, q.customer));
    if (q.projectId) conds.push(eq(jobs.projectId, q.projectId));
    const query = db.select().from(jobs);
    const rows = await (conds.length ? query.where(and(...conds)) : query)
      .limit(limit)
      .offset(offset);
    const data = await loadJobsListBundle(rows);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const dto = await loadJobBundle(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(dto, 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `J-${Date.now().toString(36)}`;
    await db.insert(jobs).values({
      id,
      type: body.type,
      status: body.status ?? 'unscheduled',
      customerId: body.customer ?? null,
      projectId: body.projectId ?? null,
      date: body.date ?? null,
      startHour: body.startHour != null ? String(body.startHour) : null,
      durationHrs: String(body.durationHrs ?? 0),
      crewId: body.crewId ?? null,
      truckId: body.truckId ?? null,
      notes: body.notes ?? '',
      address: body.address ?? '',
      hubspotDealId: body.hubspotDealId ?? null,
      driveTimeMin: body.driveTimeMin ?? 0,
      price: body.price != null ? String(body.price) : null,
      multidayGroupId: body.multidayGroupId ?? null,
      multidayIndex: body.multidayIndex ?? null,
      multidayTotal: body.multidayTotal ?? null,
      continuationOf: body.continuationOf ?? null,
      vehicleMode: body.vehicleMode ?? null,
      personalDriverId: body.personalDriverId ?? null,
      endDate: body.endDate ?? null,
      endHour: body.endHour != null ? String(body.endHour) : null,
      daysSpanned: body.daysSpanned ?? null,
    });
    if (body.slots?.length) {
      await writeJobSlots(id, body.slots as JobSlot[]);
    }
    if (body.extraCrewIds?.length) {
      await writeExtraCrews(id, body.extraCrewIds);
    }
    const dto = await loadJobBundle(id);
    if (!dto) throw new ApiError({ status: 500, title: 'Server Error' });
    await publish({ topic: 'jobs.created', payload: { id } });
    return c.json(dto, 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const existing = (await db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
    if (!existing) throw new ApiError({ status: 404, title: 'Not Found' });
    await db
      .update(jobs)
      .set({
        ...(body.type !== undefined && { type: body.type }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.customer !== undefined && { customerId: body.customer }),
        ...(body.projectId !== undefined && { projectId: body.projectId }),
        ...(body.date !== undefined && { date: body.date }),
        ...(body.startHour !== undefined && {
          startHour: body.startHour != null ? String(body.startHour) : null,
        }),
        ...(body.durationHrs !== undefined && { durationHrs: String(body.durationHrs) }),
        ...(body.crewId !== undefined && { crewId: body.crewId }),
        ...(body.truckId !== undefined && { truckId: body.truckId }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.hubspotDealId !== undefined && { hubspotDealId: body.hubspotDealId }),
        ...(body.driveTimeMin !== undefined && { driveTimeMin: body.driveTimeMin }),
        ...(body.price !== undefined && {
          price: body.price != null ? String(body.price) : null,
        }),
        ...(body.multidayGroupId !== undefined && { multidayGroupId: body.multidayGroupId }),
        ...(body.multidayIndex !== undefined && { multidayIndex: body.multidayIndex }),
        ...(body.multidayTotal !== undefined && { multidayTotal: body.multidayTotal }),
        ...(body.continuationOf !== undefined && { continuationOf: body.continuationOf }),
        ...(body.vehicleMode !== undefined && { vehicleMode: body.vehicleMode }),
        ...(body.personalDriverId !== undefined && { personalDriverId: body.personalDriverId }),
        ...(body.endDate !== undefined && { endDate: body.endDate }),
        ...(body.endHour !== undefined && {
          endHour: body.endHour != null ? String(body.endHour) : null,
        }),
        ...(body.daysSpanned !== undefined && { daysSpanned: body.daysSpanned }),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id));
    if (body.slots) await writeJobSlots(id, body.slots as JobSlot[]);
    if (body.extraCrewIds) await writeExtraCrews(id, body.extraCrewIds);
    const dto = await loadJobBundle(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'jobs.updated', payload: { id } });
    return c.json(dto, 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    // Soft-delete: send the job back to unscheduled + clear the date.
    const r = await db
      .update(jobs)
      .set({ status: 'unscheduled', date: null, startHour: null, updatedAt: new Date() })
      .where(eq(jobs.id, id));
    void r;
    await publish({ topic: 'jobs.soft_deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(transitionRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { status, at } = c.req.valid('json');
    const row = (await db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    if (!validTransition(row.status, status)) {
      throw new ApiError({
        status: 409,
        title: 'Invalid transition',
        detail: `Cannot move job ${id} from ${row.status} to ${status}`,
      });
    }
    const stamp = at ? new Date(at) : new Date();
    void stamp; // actuals timestamps live in audit/outbox for now; jobs row carries status.
    await db
      .update(jobs)
      .set({ status, updatedAt: new Date() })
      .where(eq(jobs.id, id));
    await publish({
      topic: 'jobs.updated',
      payload: {
        id,
        status,
        actuals: {
          enrouteAt: status === 'enroute' ? stamp.toISOString() : undefined,
          onsiteAt: status === 'onsite' ? stamp.toISOString() : undefined,
          completeAt: status === 'complete' ? stamp.toISOString() : undefined,
        },
      },
    });
    const dto = await loadJobBundle(id);
    if (!dto) throw new ApiError({ status: 500, title: 'Server Error' });
    return c.json(
      {
        ...dto,
        ...(status === 'enroute' && { actualsEnRouteAt: stamp.toISOString() }),
        ...(status === 'onsite' && { actualsInProgressAt: stamp.toISOString() }),
        ...(status === 'complete' && { actualsCompleteAt: stamp.toISOString() }),
      },
      200,
    );
  });

  app.openapi(autoFillRoute, async (c) => {
    const { id } = c.req.valid('param');
    const dto = await loadJobBundle(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found' });

    // Build a Job-shape object suitable for assignment.ts.
    const jobShape: Job = {
      id: dto.id,
      type: dto.type,
      status: dto.status,
      customer: dto.customer,
      date: dto.date,
      startHour: dto.startHour,
      durationHrs: dto.durationHrs,
      crewId: dto.crewId,
      extraCrewIds: dto.extraCrewIds,
      truckId: dto.truckId,
      slots: dto.slots as JobSlot[],
      notes: dto.notes,
      address: dto.address,
      hubspotDealId: dto.hubspotDealId,
      driveTimeMin: dto.driveTimeMin,
      price: dto.price,
    };

    let crew: Crew | null = null;
    if (jobShape.crewId) {
      const crewRow = (
        await db.select().from(crews).where(eq(crews.id, jobShape.crewId)).limit(1)
      )[0];
      if (crewRow) {
        const memberRows = await db
          .select({ personId: crewMembers.personId })
          .from(crewMembers)
          .where(eq(crewMembers.crewId, crewRow.id));
        crew = {
          id: crewRow.id,
          name: crewRow.name,
          type: crewRow.type,
          lead: crewRow.leadPersonId ?? '',
          members: memberRows.map((m) => m.personId),
          truck: crewRow.truckId,
          color: crewRow.color,
        };
      }
    }

    const peopleRows = await db.select().from(people);
    const roleRows = await db.select().from(personRoles);
    const rosterOverrideRows = jobShape.date
      ? await db.select().from(crewRosterOverrides).where(eq(crewRosterOverrides.date, jobShape.date))
      : [];
    const timeOffRows = jobShape.date
      ? await db.select().from(timeOff).where(eq(timeOff.date, jobShape.date))
      : [];
    const dayJobRows = jobShape.date
      ? await db.select().from(jobs).where(eq(jobs.date, jobShape.date))
      : [];
    const dayJobDTOs = await loadJobsListBundle(dayJobRows);
    const crewRows = await db.select().from(crews);
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

    const filledSlots = autoFillSlots(jobShape, crew, allPeople, {
      crews: crewRows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        lead: row.leadPersonId ?? '',
        members: row.id === crew?.id ? crew.members : [],
        truck: row.truckId,
        color: row.color,
      })),
      rosterOverrides: rosterOverrideRows.map((row) => ({
        id: row.id,
        date: row.date,
        personId: row.personId,
        sourceCrewId: row.sourceCrewId,
        targetCrewId: row.targetCrewId,
        startHour: row.startHour == null ? null : Number(row.startHour),
        endHour: row.endHour == null ? null : Number(row.endHour),
        reason: row.reason,
        note: row.note ?? undefined,
      })),
      jobs: dayJobDTOs.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        customer: d.customer,
        date: d.date,
        startHour: d.startHour,
        durationHrs: d.durationHrs,
        crewId: d.crewId,
        extraCrewIds: d.extraCrewIds,
        truckId: d.truckId,
        slots: d.slots as JobSlot[],
        notes: d.notes,
        address: d.address,
        hubspotDealId: d.hubspotDealId,
        driveTimeMin: d.driveTimeMin,
        price: d.price,
      })),
      timeOff: timeOffRows.map((row) => ({
        id: row.id,
        personId: row.personId,
        date: row.date,
        type: row.type,
        label: row.label,
      })),
    });
    await writeJobSlots(id, filledSlots);
    await publish({ topic: 'jobs.updated', payload: { id, reason: 'auto-fill' } });
    const fresh = await loadJobBundle(id);
    if (!fresh) throw new ApiError({ status: 500, title: 'Server Error' });
    return c.json(fresh, 200);
  });

}

export type { TimeOff };
