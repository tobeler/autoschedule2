// =============================================================
// /v1/hubspot/* — sync + push surface (Phase 13).
//
// Routes:
//   POST /hubspot/sync                  — full pull from HubSpot
//   POST /hubspot/push-job/{id}         — push one FSM job
//   POST /hubspot/push-project/{id}     — push one FSM project lifecycle
//   GET  /hubspot/mapping               — read field maps
//   PUT  /hubspot/mapping/{entity}      — replace field map for an entity
//
// All HubSpot errors are caught and converted to RFC 7807 via
// the global error handler. A missing HUBSPOT_TOKEN surfaces as
// HTTP 503 with a clear hint.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { hubspotMappings } from '@/db/schema';
import {
  HubspotApiError,
  HubspotConfigError,
  getAccountDetails,
  isHubspotConfigured,
} from '@/integrations/hubspot/client';
import {
  pullHubspotForDemo,
  pushJobToHubspot,
  pushProjectToHubspot,
  syncFromHubspot,
} from '@/integrations/hubspot/sync';

import { ApiError } from '../middleware/error';
import { ProblemResponses, jsonContent, z } from '../schemas/common';
import {
  HubspotEntityMappingSchema,
  HubspotEntityParamSchema,
  HubspotMappingPutSchema,
  HubspotPingResultSchema,
  HubspotPushResultSchema,
  HubspotSyncDemoResultSchema,
  HubspotSyncResultSchema,
} from '../schemas/hubspot';
import type { ApiEnv } from '../middleware/auth';

const syncRoute = createRoute({
  method: 'post',
  path: '/hubspot/sync',
  tags: ['hubspot'],
  summary: 'Pull HubSpot service areas, contacts, projects, deals, and legacy installations into our DB.',
  responses: {
    200: {
      description: 'Sync result. Shape depends on DATABASE_URL: DB mode returns row counts, demo mode returns parsed entities.',
      content: {
        'application/json': {
          schema: z.union([HubspotSyncResultSchema, HubspotSyncDemoResultSchema]),
        },
      },
    },
    ...ProblemResponses,
  },
});

const pingRoute = createRoute({
  method: 'post',
  path: '/hubspot/ping',
  tags: ['hubspot'],
  summary: 'Verify the configured HUBSPOT_TOKEN by hitting /account-info/v3/details.',
  responses: {
    200: jsonContent(HubspotPingResultSchema, 'Ping ok'),
    ...ProblemResponses,
  },
});

const pushJobRoute = createRoute({
  method: 'post',
  path: '/hubspot/push-job/{id}',
  tags: ['hubspot'],
  summary: 'Push one job to the HubSpot Job custom object.',
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
  summary: 'Push one project lifecycle update to the HubSpot Project record.',
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

function translateHubspotError(err: unknown): never {
  if (err instanceof HubspotConfigError) {
    throw new ApiError({
      status: 503,
      title: 'HubSpot not configured',
      detail: err.message,
      type: 'about:blank',
    });
  }
  if (err instanceof HubspotApiError) {
    // 401 from HubSpot → 502; 4xx from upstream → 502; 5xx → 502.
    throw new ApiError({
      status: 502,
      title: 'HubSpot upstream error',
      detail: 'HubSpot ' + err.status + ': ' + err.message,
      type: 'about:blank',
    });
  }
  if (err instanceof Error) {
    throw new ApiError({
      status: 500,
      title: 'Internal Server Error',
      detail: err.message,
    });
  }
  throw new ApiError({ status: 500, title: 'Internal Server Error', detail: 'Unknown error' });
}

export function registerHubspotRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(syncRoute, async (c) => {
    if (!isHubspotConfigured()) {
      // Surface a 503 so the UI can render "Disconnected".
      throw new ApiError({
        status: 503,
        title: 'HubSpot not configured',
        detail: 'Set HUBSPOT_TOKEN in the server environment to enable sync.',
      });
    }
    // Demo mode: no DATABASE_URL → return parsed entities directly so the
    // browser store can hydrate without a Postgres write path.
    if (!process.env.DATABASE_URL) {
      try {
        const demo = await pullHubspotForDemo();
        return c.json(
          {
            ok: demo.ok,
            demo: true as const,
            customers: demo.customers,
            projects: demo.projects,
            regions: demo.regions,
            lastSyncedAt: demo.finishedAt,
            errors: [...demo.errors, ...demo.notes],
          },
          200,
        );
      } catch (err) {
        translateHubspotError(err);
      }
    }
    try {
      const result = await syncFromHubspot();
      // Map our richer SyncResult onto the published OpenAPI shape.
      return c.json(
        {
          ok: result.ok,
          contacts: result.counts.customers,
          deals: result.counts.deals,
          projects: result.counts.projects,
          serviceAreas: result.counts.serviceAreas,
          installations: result.counts.legacyInstallations,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          errors: [...result.errors, ...result.notes],
        },
        200,
      );
    } catch (err) {
      translateHubspotError(err);
    }
  });

  app.openapi(pingRoute, async (c) => {
    if (!isHubspotConfigured()) {
      throw new ApiError({
        status: 503,
        title: 'HubSpot not configured',
        detail: 'Set HUBSPOT_TOKEN in the server environment to enable ping.',
      });
    }
    try {
      const details = await getAccountDetails();
      return c.json(
        {
          ok: true,
          portalId: details.portalId,
          accountType: details.accountType,
          timeZone: details.timeZone,
          currency: details.companyCurrency,
        },
        200,
      );
    } catch (err) {
      if (err instanceof HubspotApiError && err.status === 401) {
        throw new ApiError({
          status: 401,
          title: 'Unauthorized',
          detail: 'HubSpot rejected the token: ' + err.message,
        });
      }
      translateHubspotError(err);
    }
  });

  app.openapi(pushJobRoute, async (c) => {
    const { id } = c.req.valid('param');
    try {
      const result = await pushJobToHubspot(id);
      if (!result.ok) {
        throw new ApiError({
          status: result.message.includes('not found') ? 404 : 502,
          title: 'HubSpot push failed',
          detail: result.message,
        });
      }
      return c.json(
        {
          ok: true,
          message: result.message,
          hubspotObjectId: result.hubspotObjectId,
        },
        200,
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      translateHubspotError(err);
    }
  });

  app.openapi(pushProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    try {
      const result = await pushProjectToHubspot(id);
      if (!result.ok) {
        throw new ApiError({
          status: result.message.includes('not found') ? 404 : 502,
          title: 'HubSpot push failed',
          detail: result.message,
        });
      }
      return c.json(
        {
          ok: true,
          message: result.message,
          hubspotObjectId: result.hubspotObjectId,
        },
        200,
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      translateHubspotError(err);
    }
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
    // Replace strategy: delete-then-insert for this entity.
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
}
