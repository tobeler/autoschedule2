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
}
