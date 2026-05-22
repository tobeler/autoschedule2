// =============================================================
// /v1/crews — crews + their member joins.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { crewMembers, crews } from '@/db/schema';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import { CrewCreateSchema, CrewSchema, CrewUpdateSchema } from '../schemas/crew';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { crewToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

async function loadCrewDTO(id: string) {
  const row = (await db.select().from(crews).where(eq(crews.id, id)).limit(1))[0];
  if (!row) return null;
  const memberRows = await db
    .select({ personId: crewMembers.personId })
    .from(crewMembers)
    .where(eq(crewMembers.crewId, id));
  return crewToDTO(
    row,
    memberRows.map((m) => m.personId),
  );
}

const listRoute = createRoute({
  method: 'get',
  path: '/crews',
  tags: ['crews'],
  summary: 'List crews',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(CrewSchema), 'Crews page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/crews/{id}',
  tags: ['crews'],
  summary: 'Get a crew',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(CrewSchema, 'Crew'),
    ...ProblemResponses,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/crews',
  tags: ['crews'],
  summary: 'Create a crew',
  request: { body: jsonContent(CrewCreateSchema, 'Crew fields') },
  responses: { 201: jsonContent(CrewSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/crews/{id}',
  tags: ['crews'],
  summary: 'Update a crew',
  request: {
    params: IdParamSchema,
    body: jsonContent(CrewUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(CrewSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/crews/{id}',
  tags: ['crews'],
  summary: 'Delete a crew',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerCrewRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const rows = await db.select().from(crews).limit(limit).offset(offset);
    const memberRows = rows.length
      ? await db
          .select()
          .from(crewMembers)
          .where(
            inArray(
              crewMembers.crewId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    const byCrew = new Map<string, string[]>();
    for (const m of memberRows) {
      const arr = byCrew.get(m.crewId) ?? [];
      arr.push(m.personId);
      byCrew.set(m.crewId, arr);
    }
    const data = rows.map((r) => crewToDTO(r, byCrew.get(r.id) ?? []));
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const dto = await loadCrewDTO(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(dto, 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `C-${Date.now().toString(36)}`;
    await db.insert(crews).values({
      id,
      name: body.name,
      type: body.type,
      leadPersonId: body.lead ?? null,
      truckId: body.truck ?? null,
      color: body.color,
    });
    if (body.members?.length) {
      await db
        .insert(crewMembers)
        .values(body.members.map((personId) => ({ crewId: id, personId })));
    }
    const dto = await loadCrewDTO(id);
    if (!dto) throw new ApiError({ status: 500, title: 'Server Error' });
    await publish({ topic: 'crews.created', payload: { id } });
    return c.json(dto, 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(crews)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.lead !== undefined && { leadPersonId: body.lead }),
        ...(body.truck !== undefined && { truckId: body.truck }),
        ...(body.color !== undefined && { color: body.color }),
        updatedAt: new Date(),
      })
      .where(eq(crews.id, id));
    if (body.members) {
      await db.delete(crewMembers).where(eq(crewMembers.crewId, id));
      if (body.members.length) {
        await db
          .insert(crewMembers)
          .values(body.members.map((personId) => ({ crewId: id, personId })));
      }
    }
    const dto = await loadCrewDTO(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'crews.updated', payload: { id } });
    return c.json(dto, 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(crews).where(eq(crews.id, id));
    await publish({ topic: 'crews.deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });
}
