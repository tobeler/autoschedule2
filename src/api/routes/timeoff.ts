// =============================================================
// /v1/time-off — per-person leave rows. Optional ?personId / ?date.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { timeOff } from '@/db/schema';

import {
  IdParamSchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  TimeOffCreateSchema,
  TimeOffSchema,
  TimeOffUpdateSchema,
} from '../schemas/timeoff';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { timeOffToDTO } from '../db/mappers';

const ListQuery = z.object({
  personId: z.string().optional(),
  date: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const listRoute = createRoute({
  method: 'get',
  path: '/time-off',
  tags: ['time-off'],
  summary: 'List time-off entries',
  request: { query: ListQuery },
  responses: {
    200: jsonContent(paged(TimeOffSchema), 'Time-off page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/time-off/{id}',
  tags: ['time-off'],
  summary: 'Get a time-off entry',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(TimeOffSchema, 'Time-off'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/time-off',
  tags: ['time-off'],
  summary: 'Create a time-off entry',
  request: { body: jsonContent(TimeOffCreateSchema, 'Time-off fields') },
  responses: { 201: jsonContent(TimeOffSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/time-off/{id}',
  tags: ['time-off'],
  summary: 'Update a time-off entry',
  request: {
    params: IdParamSchema,
    body: jsonContent(TimeOffUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(TimeOffSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/time-off/{id}',
  tags: ['time-off'],
  summary: 'Delete a time-off entry',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerTimeOffRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { personId, date, limit: lim, offset: off } = c.req.valid('query');
    const limit = lim ? Math.max(1, Math.min(500, Number(lim))) : 100;
    const offset = off ? Math.max(0, Number(off)) : 0;
    const conds: SQL[] = [];
    if (personId) conds.push(eq(timeOff.personId, personId));
    if (date) conds.push(eq(timeOff.date, date));
    const query = db.select().from(timeOff);
    const filtered = conds.length ? query.where(and(...conds)) : query;
    const rows = await filtered.limit(limit).offset(offset);
    const data = rows.map(timeOffToDTO);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (await db.select().from(timeOff).where(eq(timeOff.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(timeOffToDTO(row), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `TO-${Date.now().toString(36)}`;
    await db.insert(timeOff).values({
      id,
      personId: body.personId,
      date: body.date,
      type: body.type,
      label: body.label,
    });
    const row = (await db.select().from(timeOff).where(eq(timeOff.id, id)).limit(1))[0]!;
    return c.json(timeOffToDTO(row), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(timeOff)
      .set({
        ...(body.personId !== undefined && { personId: body.personId }),
        ...(body.date !== undefined && { date: body.date }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.label !== undefined && { label: body.label }),
        updatedAt: new Date(),
      })
      .where(eq(timeOff.id, id));
    const row = (await db.select().from(timeOff).where(eq(timeOff.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(timeOffToDTO(row), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(timeOff).where(eq(timeOff.id, id));
    return c.json({ ok: true as const }, 200);
  });
}
