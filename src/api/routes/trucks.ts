// =============================================================
// /v1/trucks — fleet vehicles.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { trucks } from '@/db/schema';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import { TruckCreateSchema, TruckSchema, TruckUpdateSchema } from '../schemas/truck';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { truckToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

const listRoute = createRoute({
  method: 'get',
  path: '/trucks',
  tags: ['trucks'],
  summary: 'List trucks',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(TruckSchema), 'Trucks page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/trucks/{id}',
  tags: ['trucks'],
  summary: 'Get a truck',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(TruckSchema, 'Truck'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/trucks',
  tags: ['trucks'],
  summary: 'Create a truck',
  request: { body: jsonContent(TruckCreateSchema, 'Truck fields') },
  responses: { 201: jsonContent(TruckSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/trucks/{id}',
  tags: ['trucks'],
  summary: 'Update a truck',
  request: {
    params: IdParamSchema,
    body: jsonContent(TruckUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(TruckSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/trucks/{id}',
  tags: ['trucks'],
  summary: 'Delete a truck',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerTruckRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const rows = await db.select().from(trucks).limit(limit).offset(offset);
    const data = rows.map(truckToDTO);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (await db.select().from(trucks).where(eq(trucks.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(truckToDTO(row), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `T-${Date.now().toString(36)}`;
    await db.insert(trucks).values({
      id,
      name: body.name,
      plate: body.plate,
      kind: body.kind,
      capacity: body.capacity,
      assignedCrewId: body.assignedCrew ?? null,
      vin: body.vin,
      status: body.status ?? null,
    });
    const row = (await db.select().from(trucks).where(eq(trucks.id, id)).limit(1))[0]!;
    await publish({ topic: 'trucks.created', payload: { id } });
    return c.json(truckToDTO(row), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(trucks)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.plate !== undefined && { plate: body.plate }),
        ...(body.kind !== undefined && { kind: body.kind }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...(body.assignedCrew !== undefined && { assignedCrewId: body.assignedCrew }),
        ...(body.vin !== undefined && { vin: body.vin }),
        ...(body.status !== undefined && { status: body.status }),
        updatedAt: new Date(),
      })
      .where(eq(trucks.id, id));
    const row = (await db.select().from(trucks).where(eq(trucks.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'trucks.updated', payload: { id } });
    return c.json(truckToDTO(row), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(trucks).where(eq(trucks.id, id));
    await publish({ topic: 'trucks.deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });
}
