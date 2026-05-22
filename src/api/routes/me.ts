// =============================================================
// /v1/me — returns the resolved actor for the current request.
//
// The UI uses this in two places:
//  - Settings sub-nav: gate admin-only tabs (Integrations, API
//    Keys) based on `role`.
//  - Topbar avatar: display name + a tiny role chip.
//
// The route is auth-only — every authenticated actor (including
// API keys + the demo fallback) gets a response. It does NOT
// require a specific role.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/db/schema';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import type { ApiEnv } from '../middleware/auth';
import { ApiError } from '../middleware/error';

const MeSchema = z
  .object({
    userId: z.string(),
    role: z.string(),
    displayName: z.string().nullable(),
    source: z.enum(['session', 'api_key', 'demo']),
  })
  .openapi('Me');

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['auth'],
  summary: 'Identity + role for the current actor',
  responses: { 200: jsonContent(MeSchema, 'Me'), ...ProblemResponses },
});

export function registerMeRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(getMeRoute, async (c) => {
    const actor = c.get('actor');
    if (!actor) {
      throw new ApiError({ status: 401, title: 'Unauthorized' });
    }

    // Best-effort displayName lookup. For sessions + api keys with
    // a real userId we fetch the users row; demo + key-without-user
    // fall back to a synthesized label.
    let displayName: string | null = null;
    if (actor.source !== 'demo' && actor.userId && !actor.userId.startsWith('apikey:')) {
      try {
        const row = (
          await db.select().from(users).where(eq(users.id, actor.userId)).limit(1)
        )[0];
        displayName = row?.name ?? row?.email ?? null;
      } catch {
        // ignore — fall through with displayName=null
      }
    }
    if (!displayName) {
      displayName =
        actor.source === 'demo'
          ? 'Demo Admin'
          : actor.source === 'api_key'
            ? 'API key'
            : actor.userId;
    }

    return c.json(
      {
        userId: actor.userId,
        role: actor.role,
        displayName,
        source: actor.source,
      },
      200,
    );
  });
}
