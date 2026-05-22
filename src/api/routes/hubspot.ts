// =============================================================
// /v1/hubspot/* — sync + push surface. Phase 13 fleshes out the
// handler bodies; the OpenAPI surface lands here so the generated
// client + UI can target the final shape.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { hubspotMappings } from '@/db/schema';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import {
  HubspotEntityMappingSchema,
  HubspotEntityParamSchema,
  HubspotMappingPutSchema,
  HubspotPushResultSchema,
  HubspotSyncResultSchema,
} from '../schemas/hubspot';
import type { ApiEnv } from '../middleware/auth';

const syncRoute = createRoute({
  method: 'post',
  path: '/hubspot/sync',
  tags: ['hubspot'],
  summary: 'Pull HubSpot contacts/projects/deals into our DB (Phase 13)',
  responses: {
    200: jsonContent(HubspotSyncResultSchema, 'Sync result'),
    ...ProblemResponses,
  },
});

const pushJobRoute = createRoute({
  method: 'post',
  path: '/hubspot/push-job/{id}',
  tags: ['hubspot'],
  summary: 'Push one job to the HubSpot Job custom object (Phase 13)',
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: jsonContent(HubspotPushResultSchema, 'Push result'),
    ...ProblemResponses,
  },
});

const pushProjectRoute = createRoute({
  method: 'post',
  path: '/hubspot/push-project/{id}',
  tags: ['hubspot'],
  summary: 'Push one project lifecycle update to HubSpot (Phase 13)',
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: jsonContent(HubspotPushResultSchema, 'Push result'),
    ...ProblemResponses,
  },
});

const getMappingRoute = createRoute({
  method: 'get',
  path: '/hubspot/mapping',
  tags: ['hubspot'],
  summary: 'List all HubSpot field mappings, grouped by entity',
  responses: {
    200: jsonContent(z.array(HubspotEntityMappingSchema), 'Mappings'),
    ...ProblemResponses,
  },
});

const putMappingRoute = createRoute({
  method: 'put',
  path: '/hubspot/mapping/{entity}',
  tags: ['hubspot'],
  summary: 'Replace the mapping for a HubSpot entity',
  request: {
    params: HubspotEntityParamSchema,
    body: jsonContent(HubspotMappingPutSchema, 'Field map'),
  },
  responses: {
    200: jsonContent(HubspotEntityMappingSchema, 'Updated mapping'),
    ...ProblemResponses,
  },
});

export function registerHubspotRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(syncRoute, (c) => {
    // TODO Phase 13: actual sync flow.
    const now = new Date().toISOString();
    return c.json(
      {
        ok: true,
        contacts: 0,
        deals: 0,
        projects: 0,
        serviceAreas: 0,
        installations: 0,
        startedAt: now,
        finishedAt: now,
        errors: [],
      },
      200,
    );
  });

  app.openapi(pushJobRoute, (c) => {
    // TODO Phase 13: push to HubSpot Job custom object.
    const { id } = c.req.valid('param');
    return c.json({ ok: true, message: `stub: would push job ${id}` }, 200);
  });

  app.openapi(pushProjectRoute, (c) => {
    // TODO Phase 13: push project lifecycle update.
    const { id } = c.req.valid('param');
    return c.json({ ok: true, message: `stub: would push project ${id}` }, 200);
  });

  app.openapi(getMappingRoute, async (c) => {
    const rows = await db.select().from(hubspotMappings);
    const byEntity = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byEntity.get(r.entity) ?? [];
      arr.push(r);
      byEntity.set(r.entity, arr);
    }
    const out = Array.from(byEntity.entries()).map(([entity, fieldRows]) => ({
      entity: entity as (typeof rows)[number]['entity'],
      fields: fieldRows.map((r) => ({
        appField: r.appField,
        hsField: r.hsField,
        direction: r.direction,
      })),
    }));
    return c.json(out, 200);
  });

  app.openapi(putMappingRoute, async (c) => {
    const { entity } = c.req.valid('param');
    const { fields } = c.req.valid('json');
    // Replace strategy: delete-then-insert for this entity. Phase 13 may
    // promote this to an upsert with versioning if needed.
    await db.delete(hubspotMappings).where(eq(hubspotMappings.entity, entity));
    if (fields.length) {
      await db.insert(hubspotMappings).values(
        fields.map((f) => ({
          entity,
          appField: f.appField,
          hsField: f.hsField,
          direction: f.direction,
        })),
      );
    }
    return c.json({ entity, fields }, 200);
  });

  // suppress unused-imports lint
  void and;
}
