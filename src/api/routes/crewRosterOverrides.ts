// =============================================================
// /v1/crew-roster-overrides — temporary day/partial-day moves.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { crewRosterOverrides } from '@/db/schema';

import {
  IdParamSchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  CrewRosterOverrideCreateSchema,
  CrewRosterOverrideSchema,
  CrewRosterOverrideUpdateSchema,
} from '../schemas/crewRosterOverride';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { crewRosterOverrideToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

const ListQuery = z.object({
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  personId: z.string().optional(),
  targetCrewId: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const listRoute = createRoute({
  method: 'get',
  path: '/crew-roster-overrides',
  tags: ['crew-roster-overrides'],
  summary: 'List crew roster overrides',
  request: { query: ListQuery },
  responses: {
    200: jsonContent(paged(CrewRosterOverrideSchema), 'Crew roster override page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/crew-roster-overrides/{id}',
  tags: ['crew-roster-overrides'],
  summary: 'Get a crew roster override',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(CrewRosterOverrideSchema, 'Crew roster override'),
    ...ProblemResponses,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/crew-roster-overrides',
  tags: ['crew-roster-overrides'],
  summary: 'Create a crew roster override',
  request: { body: jsonContent(CrewRosterOverrideCreateSchema, 'Override fields') },
  responses: { 201: jsonContent(CrewRosterOverrideSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/crew-roster-overrides/{id}',
  tags: ['crew-roster-overrides'],
  summary: 'Update a crew roster override',
  request: {
    params: IdParamSchema,
    body: jsonContent(CrewRosterOverrideUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(CrewRosterOverrideSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/crew-roster-overrides/{id}',
  tags: ['crew-roster-overrides'],
  summary: 'Delete a crew roster override',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerCrewRosterOverrideRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { date, from, to, personId, targetCrewId, limit: lim, offset: off } =
      c.req.valid('query');
    const limit = lim ? Math.max(1, Math.min(500, Number(lim))) : 100;
    const offset = off ? Math.max(0, Number(off)) : 0;
    const conds: SQL[] = [];
    if (date) conds.push(eq(crewRosterOverrides.date, date));
    if (from) conds.push(gte(crewRosterOverrides.date, from));
    if (to) conds.push(lte(crewRosterOverrides.date, to));
    if (personId) conds.push(eq(crewRosterOverrides.personId, personId));
    if (targetCrewId) conds.push(eq(crewRosterOverrides.targetCrewId, targetCrewId));
    const query = db.select().from(crewRosterOverrides);
    const rows = await (conds.length ? query.where(and(...conds)) : query)
      .limit(limit)
      .offset(offset);
    const data = rows.map(crewRosterOverrideToDTO);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (
      await db
        .select()
        .from(crewRosterOverrides)
        .where(eq(crewRosterOverrides.id, id))
        .limit(1)
    )[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(crewRosterOverrideToDTO(row), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `CRO-${Date.now().toString(36)}`;
    await db.insert(crewRosterOverrides).values({
      id,
      date: body.date,
      personId: body.personId,
      sourceCrewId: body.sourceCrewId ?? null,
      targetCrewId: body.targetCrewId,
      startHour: body.startHour != null ? String(body.startHour) : null,
      endHour: body.endHour != null ? String(body.endHour) : null,
      reason: body.reason,
      note: body.note,
    });
    const row = (
      await db
        .select()
        .from(crewRosterOverrides)
        .where(eq(crewRosterOverrides.id, id))
        .limit(1)
    )[0]!;
    await publish({ topic: 'crew_roster_overrides.created', payload: { id } });
    return c.json(crewRosterOverrideToDTO(row), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(crewRosterOverrides)
      .set({
        ...(body.date !== undefined && { date: body.date }),
        ...(body.personId !== undefined && { personId: body.personId }),
        ...(body.sourceCrewId !== undefined && { sourceCrewId: body.sourceCrewId }),
        ...(body.targetCrewId !== undefined && { targetCrewId: body.targetCrewId }),
        ...(body.startHour !== undefined && {
          startHour: body.startHour != null ? String(body.startHour) : null,
        }),
        ...(body.endHour !== undefined && {
          endHour: body.endHour != null ? String(body.endHour) : null,
        }),
        ...(body.reason !== undefined && { reason: body.reason }),
        ...(body.note !== undefined && { note: body.note }),
        updatedAt: new Date(),
      })
      .where(eq(crewRosterOverrides.id, id));
    const row = (
      await db
        .select()
        .from(crewRosterOverrides)
        .where(eq(crewRosterOverrides.id, id))
        .limit(1)
    )[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'crew_roster_overrides.updated', payload: { id } });
    return c.json(crewRosterOverrideToDTO(row), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(crewRosterOverrides).where(eq(crewRosterOverrides.id, id));
    await publish({ topic: 'crew_roster_overrides.deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });
}
