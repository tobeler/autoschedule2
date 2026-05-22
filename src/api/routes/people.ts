// =============================================================
// /v1/people — list, get, create, update, delete.
//
// Role assignments live on `person_roles`. Each mutation rewrites
// the join in a single transaction so the DTO round-trips cleanly.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { people, personRoles } from '@/db/schema';
import type { RoleKey } from '@/types';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import { PersonCreateSchema, PersonSchema, PersonUpdateSchema } from '../schemas/person';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { personToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

async function loadPersonDTO(id: string) {
  const row = (await db.select().from(people).where(eq(people.id, id)).limit(1))[0];
  if (!row) return null;
  const rolesRows = await db
    .select({ role: personRoles.role })
    .from(personRoles)
    .where(eq(personRoles.personId, id));
  return personToDTO(
    row,
    rolesRows.map((r) => r.role as RoleKey),
  );
}

const listRoute = createRoute({
  method: 'get',
  path: '/people',
  tags: ['people'],
  summary: 'List people',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(PersonSchema), 'People page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/people/{id}',
  tags: ['people'],
  summary: 'Get a person',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(PersonSchema, 'Person'),
    ...ProblemResponses,
  },
});

const createBody = jsonContent(PersonCreateSchema, 'Person fields');
const createRouteDef = createRoute({
  method: 'post',
  path: '/people',
  tags: ['people'],
  summary: 'Create a person',
  request: { body: createBody },
  responses: {
    201: jsonContent(PersonSchema, 'Created'),
    ...ProblemResponses,
  },
});

const updateBody = jsonContent(PersonUpdateSchema, 'Patch fields');
const updateRouteDef = createRoute({
  method: 'patch',
  path: '/people/{id}',
  tags: ['people'],
  summary: 'Update a person',
  request: { params: IdParamSchema, body: updateBody },
  responses: {
    200: jsonContent(PersonSchema, 'Updated'),
    ...ProblemResponses,
  },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/people/{id}',
  tags: ['people'],
  summary: 'Delete a person',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerPeopleRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const rows = await db.select().from(people).limit(limit).offset(offset);
    const roleRows = rows.length
      ? await db
          .select()
          .from(personRoles)
          .where(
            inArray(
              personRoles.personId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    const byPerson = new Map<string, RoleKey[]>();
    for (const r of roleRows) {
      const arr = byPerson.get(r.personId) ?? [];
      arr.push(r.role as RoleKey);
      byPerson.set(r.personId, arr);
    }
    const data = rows.map((r) => personToDTO(r, byPerson.get(r.id) ?? []));
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const dto = await loadPersonDTO(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found', detail: `person ${id}` });
    return c.json(dto, 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `P-${Date.now().toString(36)}`;
    await db.insert(people).values({
      id,
      name: body.name,
      initials: body.initials,
      level: body.level,
      defaultCrewId: body.defaultCrew ?? null,
      certs: body.certs ?? null,
    });
    if (body.roles?.length) {
      await db
        .insert(personRoles)
        .values(body.roles.map((role) => ({ personId: id, role })));
    }
    const dto = await loadPersonDTO(id);
    if (!dto) throw new ApiError({ status: 500, title: 'Server Error' });
    await publish({ topic: 'people.created', payload: { id } });
    return c.json(dto, 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const existing = (
      await db.select().from(people).where(eq(people.id, id)).limit(1)
    )[0];
    if (!existing) throw new ApiError({ status: 404, title: 'Not Found' });
    await db
      .update(people)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.initials !== undefined && { initials: body.initials }),
        ...(body.level !== undefined && { level: body.level }),
        ...(body.defaultCrew !== undefined && { defaultCrewId: body.defaultCrew }),
        ...(body.certs !== undefined && { certs: body.certs ?? null }),
        updatedAt: new Date(),
      })
      .where(eq(people.id, id));
    if (body.roles) {
      await db.delete(personRoles).where(eq(personRoles.personId, id));
      if (body.roles.length) {
        await db
          .insert(personRoles)
          .values(body.roles.map((role) => ({ personId: id, role })));
      }
    }
    const dto = await loadPersonDTO(id);
    if (!dto) throw new ApiError({ status: 500, title: 'Server Error' });
    await publish({ topic: 'people.updated', payload: { id } });
    return c.json(dto, 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const r = await db.delete(people).where(eq(people.id, id));
    if (!r) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'people.deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });

  // Suppress unused var warning for the join helper.
  void and;
}
