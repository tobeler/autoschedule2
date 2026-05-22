// =============================================================
// /v1/regions — service areas. Subs are self-referential rows.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { regions } from '@/db/schema';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  RegionCreateSchema,
  RegionSchema,
  RegionUpdateSchema,
} from '../schemas/region';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { regionToDTO } from '../db/mappers';

const listRoute = createRoute({
  method: 'get',
  path: '/regions',
  tags: ['regions'],
  summary: 'List regions',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(RegionSchema), 'Regions page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/regions/{id}',
  tags: ['regions'],
  summary: 'Get a region',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(RegionSchema, 'Region'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/regions',
  tags: ['regions'],
  summary: 'Create a region',
  request: { body: jsonContent(RegionCreateSchema, 'Region fields') },
  responses: { 201: jsonContent(RegionSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/regions/{id}',
  tags: ['regions'],
  summary: 'Update a region',
  request: {
    params: IdParamSchema,
    body: jsonContent(RegionUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(RegionSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/regions/{id}',
  tags: ['regions'],
  summary: 'Delete a region',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerRegionRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const top = await db
      .select()
      .from(regions)
      .where(isNull(regions.parentRegionId))
      .limit(limit)
      .offset(offset);
    const subs = top.length
      ? await db
          .select()
          .from(regions)
          .where(
            inArray(
              regions.parentRegionId,
              top.map((r) => r.id),
            ),
          )
      : [];
    const byParent = new Map<string, typeof subs>();
    for (const s of subs) {
      const arr = byParent.get(s.parentRegionId ?? '') ?? [];
      arr.push(s);
      byParent.set(s.parentRegionId ?? '', arr);
    }
    const data = top.map((r) => regionToDTO(r, byParent.get(r.id) ?? []));
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (await db.select().from(regions).where(eq(regions.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    const subs = await db.select().from(regions).where(eq(regions.parentRegionId, id));
    return c.json(regionToDTO(row, subs), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `R-${Date.now().toString(36)}`;
    await db.insert(regions).values({
      id,
      name: body.name,
      short: body.short,
      parentRegionId: null,
      headcount: body.subs.reduce((n, s) => n + s.headcount, 0),
      crewCount: body.subs.reduce((n, s) => n + s.crews, 0),
    });
    if (body.subs.length) {
      await db.insert(regions).values(
        body.subs.map((s) => ({
          id: s.id,
          name: s.name,
          short: s.name.slice(0, 4).toUpperCase(),
          parentRegionId: id,
          headcount: s.headcount,
          crewCount: s.crews,
        })),
      );
    }
    const row = (await db.select().from(regions).where(eq(regions.id, id)).limit(1))[0]!;
    const subs = await db.select().from(regions).where(eq(regions.parentRegionId, id));
    return c.json(regionToDTO(row, subs), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(regions)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.short !== undefined && { short: body.short }),
        updatedAt: new Date(),
      })
      .where(eq(regions.id, id));
    if (body.subs) {
      await db.delete(regions).where(eq(regions.parentRegionId, id));
      if (body.subs.length) {
        await db.insert(regions).values(
          body.subs.map((s) => ({
            id: s.id,
            name: s.name,
            short: s.name.slice(0, 4).toUpperCase(),
            parentRegionId: id,
            headcount: s.headcount,
            crewCount: s.crews,
          })),
        );
      }
    }
    const row = (await db.select().from(regions).where(eq(regions.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    const subs = await db.select().from(regions).where(eq(regions.parentRegionId, id));
    return c.json(regionToDTO(row, subs), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(regions).where(eq(regions.parentRegionId, id));
    await db.delete(regions).where(eq(regions.id, id));
    return c.json({ ok: true as const }, 200);
  });
}
