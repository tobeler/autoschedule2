// =============================================================
// /v1/settings/integrations — read/update integration feature flags.
//
//   GET  /settings/integrations  → current values
//   PUT  /settings/integrations  → updates any subset of flags
//
// Backed by the settings_kv table via src/lib/settings.ts. Only
// admin actors should mutate; the existing role-check middleware
// upstream handles that.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import {
  INTEGRATION_FLAGS,
  getAllIntegrationFlags,
  setBooleanFlag,
} from '@/lib/settings';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import type { ApiEnv } from '../middleware/auth';

const FlagsSchema = z
  .object({
    hubspotV1: z.boolean(),
    hubspotV2: z.boolean(),
    zuperWriteback: z.boolean(),
  })
  .openapi('IntegrationFlags');

const FlagsPatchSchema = z
  .object({
    hubspotV1: z.boolean().optional(),
    hubspotV2: z.boolean().optional(),
    zuperWriteback: z.boolean().optional(),
  })
  .openapi('IntegrationFlagsPatch');

const getFlags = createRoute({
  method: 'get',
  path: '/settings/integrations',
  tags: ['settings'],
  summary: 'Current integration feature flags (HubSpot V1/V2 sync, Zuper writeback).',
  responses: {
    200: jsonContent(FlagsSchema, 'Current flags'),
    ...ProblemResponses,
  },
});

const putFlags = createRoute({
  method: 'put',
  path: '/settings/integrations',
  tags: ['settings'],
  summary: 'Update one or more integration feature flags. Returns the new full state.',
  request: { body: jsonContent(FlagsPatchSchema, 'Flag changes') },
  responses: {
    200: jsonContent(FlagsSchema, 'Updated flags'),
    ...ProblemResponses,
  },
});

export function registerSettingsRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(getFlags, async (c) => {
    const flags = await getAllIntegrationFlags();
    return c.json(flags, 200);
  });

  app.openapi(putFlags, async (c) => {
    const patch = c.req.valid('json');
    const updates: Array<Promise<void>> = [];
    if (patch.hubspotV1 !== undefined) {
      updates.push(setBooleanFlag(INTEGRATION_FLAGS.hubspotV1, patch.hubspotV1));
    }
    if (patch.hubspotV2 !== undefined) {
      updates.push(setBooleanFlag(INTEGRATION_FLAGS.hubspotV2, patch.hubspotV2));
    }
    if (patch.zuperWriteback !== undefined) {
      updates.push(setBooleanFlag(INTEGRATION_FLAGS.zuperWriteback, patch.zuperWriteback));
    }
    await Promise.all(updates);
    const flags = await getAllIntegrationFlags();
    return c.json(flags, 200);
  });
}
