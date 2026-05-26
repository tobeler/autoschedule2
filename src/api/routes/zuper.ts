// =============================================================
// /v1/zuper/* — Zuper integration route surface.
//
//   POST /zuper/ping   — verify ZUPER_API_KEY by hitting /team?count=1
//
// Per the integration plan and Erik's clarification on 2026-05-26:
// Zuper is a WRITE TARGET, not a read source. AutoSchedule owns the
// dispatcher's job/crew/region taxonomy. When a dispatcher creates,
// reschedules, or cancels a job here, that mutation will eventually
// be pushed to Zuper (deferred — feature flag is OFF).
//
// We deliberately do NOT expose a /zuper/sync read pipeline.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import {
  ZuperApiError,
  ZuperConfigError,
  isZuperConfigured,
  pingAccount,
} from '@/integrations/zuper/client';
import { bootstrapActiveJobsFromZuper } from '@/integrations/zuper/bootstrap';
import { bootstrapTechniciansFromZuper } from '@/integrations/zuper/bootstrap-technicians';
import { enrichZuperJobs } from '@/integrations/zuper/enrich';

import { ApiError } from '../middleware/error';
import { ProblemResponses, jsonContent, z } from '../schemas/common';
import type { ApiEnv } from '../middleware/auth';

const ZuperPingResultSchema = z
  .object({
    ok: z.boolean(),
    configured: z.boolean(),
    baseUrl: z.string(),
    teamCount: z.number().optional(),
  })
  .openapi('ZuperPingResult');

const ZuperBootstrapResultSchema = z
  .object({
    ok: z.boolean(),
    startedAt: z.string(),
    finishedAt: z.string(),
    pulled: z.number(),
    activeKept: z.number(),
    upserted: z.number(),
    withProject: z.number(),
    withCustomer: z.number(),
    errors: z.array(z.string()),
  })
  .openapi('ZuperBootstrapResult');

const ZuperEnrichResultSchema = z
  .object({
    ok: z.boolean(),
    startedAt: z.string(),
    finishedAt: z.string(),
    candidates: z.number(),
    fetched: z.number(),
    addressUpdated: z.number(),
    customerLinked: z.number(),
    customersUpserted: z.number(),
    errors: z.array(z.string()),
  })
  .openapi('ZuperEnrichResult');

const ZuperBootstrapTechniciansResultSchema = z
  .object({
    ok: z.boolean(),
    startedAt: z.string(),
    finishedAt: z.string(),
    pulledTeams: z.number(),
    pulled: z.number(),
    activeKept: z.number(),
    upserted: z.number(),
    byRole: z.object({
      hvac_lead: z.number(),
      hvac_installer: z.number(),
      apprentice: z.number(),
      electrician: z.number(),
      plumber: z.number(),
      fsm: z.number(),
    }),
    keptTeams: z.array(z.string()),
    errors: z.array(z.string()),
  })
  .openapi('ZuperBootstrapTechniciansResult');

const pingRoute = createRoute({
  method: 'post',
  path: '/zuper/ping',
  tags: ['zuper'],
  summary: 'Verify the configured ZUPER_API_KEY by hitting /team?count=1.',
  responses: {
    200: jsonContent(ZuperPingResultSchema, 'Ping ok'),
    ...ProblemResponses,
  },
});

const bootstrapRoute = createRoute({
  method: 'post',
  path: '/zuper/bootstrap',
  tags: ['zuper'],
  summary: 'One-time pull of ACTIVE Zuper jobs to seed the dispatcher. Not a recurring sync.',
  responses: {
    200: jsonContent(ZuperBootstrapResultSchema, 'Bootstrap result'),
    ...ProblemResponses,
  },
});

const enrichRoute = createRoute({
  method: 'post',
  path: '/zuper/enrich',
  tags: ['zuper'],
  summary:
    'One-time enrichment: fill in real addresses + customer names on Zuper-sourced jobs by calling Zuper /jobs/{uid}. Read-only against Zuper.',
  responses: {
    200: jsonContent(ZuperEnrichResultSchema, 'Enrichment result'),
    ...ProblemResponses,
  },
});

const bootstrapTechniciansRoute = createRoute({
  method: 'post',
  path: '/zuper/bootstrap-technicians',
  tags: ['zuper'],
  summary:
    'One-time pull of ACTIVE Zuper users into the people table. Not a recurring sync.',
  responses: {
    200: jsonContent(
      ZuperBootstrapTechniciansResultSchema,
      'Technician bootstrap result',
    ),
    ...ProblemResponses,
  },
});

function translateZuperError(err: unknown): never {
  if (err instanceof ZuperConfigError) {
    throw new ApiError({
      status: 503,
      title: 'Zuper not configured',
      detail: err.message,
    });
  }
  if (err instanceof ZuperApiError) {
    throw new ApiError({
      status: 502,
      title: 'Zuper upstream error',
      detail: `Zuper ${err.status}: ${err.message}`,
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

export function registerZuperRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(pingRoute, async (c) => {
    if (!isZuperConfigured()) {
      throw new ApiError({
        status: 503,
        title: 'Zuper not configured',
        detail: 'Set ZUPER_API_KEY in the server environment.',
      });
    }
    try {
      const result = await pingAccount();
      return c.json(
        {
          ok: true,
          configured: true,
          baseUrl: process.env.ZUPER_BASE_URL ?? 'https://us-east-1.zuperpro.com',
          teamCount: result.teamCount,
        },
        200,
      );
    } catch (err) {
      translateZuperError(err);
    }
  });

  app.openapi(bootstrapRoute, async (c) => {
    if (!isZuperConfigured()) {
      throw new ApiError({
        status: 503,
        title: 'Zuper not configured',
        detail: 'Set ZUPER_API_KEY in the server environment.',
      });
    }
    try {
      const result = await bootstrapActiveJobsFromZuper();
      return c.json(result, 200);
    } catch (err) {
      translateZuperError(err);
    }
  });

  app.openapi(enrichRoute, async (c) => {
    if (!isZuperConfigured()) {
      throw new ApiError({
        status: 503,
        title: 'Zuper not configured',
        detail: 'Set ZUPER_API_KEY in the server environment.',
      });
    }
    try {
      const result = await enrichZuperJobs();
      return c.json(result, 200);
    } catch (err) {
      translateZuperError(err);
    }
  });

  app.openapi(bootstrapTechniciansRoute, async (c) => {
    if (!isZuperConfigured()) {
      throw new ApiError({
        status: 503,
        title: 'Zuper not configured',
        detail: 'Set ZUPER_API_KEY in the server environment.',
      });
    }
    try {
      const result = await bootstrapTechniciansFromZuper();
      return c.json(result, 200);
    } catch (err) {
      translateZuperError(err);
    }
  });
}
