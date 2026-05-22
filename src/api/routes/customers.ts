// =============================================================
// /v1/customers — HubSpot-mirrored contacts.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { customers } from '@/db/schema';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  CustomerCreateSchema,
  CustomerSchema,
  CustomerUpdateSchema,
} from '../schemas/customer';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { customerToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

const listRoute = createRoute({
  method: 'get',
  path: '/customers',
  tags: ['customers'],
  summary: 'List customers',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(CustomerSchema), 'Customers page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/customers/{id}',
  tags: ['customers'],
  summary: 'Get a customer',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(CustomerSchema, 'Customer'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/customers',
  tags: ['customers'],
  summary: 'Create a customer',
  request: { body: jsonContent(CustomerCreateSchema, 'Customer fields') },
  responses: {
    201: jsonContent(CustomerSchema, 'Created'),
    ...ProblemResponses,
  },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/customers/{id}',
  tags: ['customers'],
  summary: 'Update a customer',
  request: {
    params: IdParamSchema,
    body: jsonContent(CustomerUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(CustomerSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/customers/{id}',
  tags: ['customers'],
  summary: 'Delete a customer',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerCustomerRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const rows = await db.select().from(customers).limit(limit).offset(offset);
    const data = rows.map(customerToDTO);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(customerToDTO(row), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `CUS-${Date.now().toString(36)}`;
    await db.insert(customers).values({
      id,
      name: body.name,
      address: body.address,
      phone: body.phone,
      hubspotId: body.hubspot ?? null,
    });
    const row = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0]!;
    await publish({ topic: 'customers.created', payload: { id } });
    return c.json(customerToDTO(row), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(customers)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.hubspot !== undefined && { hubspotId: body.hubspot }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id));
    const row = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({ topic: 'customers.updated', payload: { id } });
    return c.json(customerToDTO(row), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(customers).where(eq(customers.id, id));
    await publish({ topic: 'customers.deleted', payload: { id } });
    return c.json({ ok: true as const }, 200);
  });
}
