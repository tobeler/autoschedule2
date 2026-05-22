// =============================================================
// /v1/projects — sales + install lifecycle (HubSpot Project mirror).
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  ProjectCreateSchema,
  ProjectSchema,
  ProjectUpdateSchema,
} from '../schemas/project';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { projectToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

const listRoute = createRoute({
  method: 'get',
  path: '/projects',
  tags: ['projects'],
  summary: 'List projects',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(ProjectSchema), 'Projects page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/projects/{id}',
  tags: ['projects'],
  summary: 'Get a project',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(ProjectSchema, 'Project'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/projects',
  tags: ['projects'],
  summary: 'Create a project',
  request: { body: jsonContent(ProjectCreateSchema, 'Project fields') },
  responses: { 201: jsonContent(ProjectSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/projects/{id}',
  tags: ['projects'],
  summary: 'Update a project',
  request: {
    params: IdParamSchema,
    body: jsonContent(ProjectUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(ProjectSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/projects/{id}',
  tags: ['projects'],
  summary: 'Delete a project',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerProjectRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const rows = await db.select().from(projects).limit(limit).offset(offset);
    const data = rows.map(projectToDTO);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(projectToDTO(row), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `PRJ-${Date.now().toString(36)}`;
    await db.insert(projects).values({
      id,
      customerId: body.customer,
      name: body.name,
      type: body.type,
      status: body.status,
      soldDate: body.soldDate ?? null,
      targetCompletion: body.targetCompletion ?? null,
      value: body.value != null ? String(body.value) : null,
      hubspotDealId: body.hubspotDealId ?? null,
      hubspotProjectId: body.hubspotProjectId ?? null,
      primaryCrewId: body.primaryCrew ?? null,
      description: body.description ?? null,
      designNotes: body.designNotes ?? null,
      source: body.source ?? 'native_project',
    });
    const row = (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0]!;
    await publish({ topic: 'projects.created', payload: { id } });
    return c.json(projectToDTO(row), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(projects)
      .set({
        ...(body.customer !== undefined && { customerId: body.customer }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.soldDate !== undefined && { soldDate: body.soldDate }),
        ...(body.targetCompletion !== undefined && {
          targetCompletion: body.targetCompletion,
        }),
        ...(body.value !== undefined && {
          value: body.value != null ? String(body.value) : null,
        }),
        ...(body.hubspotDealId !== undefined && { hubspotDealId: body.hubspotDealId }),
        ...(body.hubspotProjectId !== undefined && {
          hubspotProjectId: body.hubspotProjectId,
        }),
        ...(body.primaryCrew !== undefined && { primaryCrewId: body.primaryCrew }),
        ...(body.description !== undefined && { description: body.description ?? null }),
        ...(body.designNotes !== undefined && { designNotes: body.designNotes ?? null }),
        ...(body.source !== undefined && { source: body.source }),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));
    const row = (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'projects.updated', payload: { id } });
    return c.json(projectToDTO(row), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(projects).where(eq(projects.id, id));
    await publish({ topic: 'projects.deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });
}
