// =============================================================
// Liveness probe. No auth, no DB.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { jsonContent, z } from '../schemas/common';
import type { ApiEnv } from '../middleware/auth';

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Liveness probe',
  security: [],
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'OK'),
  },
});

export function registerHealthRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(healthRoute, (c) => c.json({ ok: true as const }, 200));
}
