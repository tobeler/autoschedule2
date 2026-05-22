// =============================================================
// /v1/admin/api-keys — mint + list + revoke. Admin only.
//
// On create we generate a 32-byte hex token, store its SHA-256
// hash, and return the plaintext token EXACTLY ONCE.
// =============================================================
import { randomBytes } from 'node:crypto';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import {
  ApiKeyCreateResultSchema,
  ApiKeyCreateSchema,
  ApiKeyRowSchema,
  type ApiKeyScopeSchema,
} from '../schemas/apiKey';
import { ApiError } from '../middleware/error';
import { hashApiKey, requireRole, type ApiEnv } from '../middleware/auth';

function rowToDTO(r: typeof apiKeys.$inferSelect): z.infer<typeof ApiKeyRowSchema> {
  return {
    id: r.id,
    name: r.name,
    scopes: (r.scopes as z.infer<typeof ApiKeyScopeSchema>[]) ?? [],
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  };
}

const adminMw = requireRole('admin', 'manager');

const listRoute = createRoute({
  method: 'get',
  path: '/admin/api-keys',
  tags: ['admin'],
  summary: 'List API keys',
  middleware: adminMw,
  responses: {
    200: jsonContent(z.array(ApiKeyRowSchema), 'Keys'),
    ...ProblemResponses,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/admin/api-keys',
  tags: ['admin'],
  summary: 'Mint a new API key — plaintext returned ONCE',
  middleware: adminMw,
  request: { body: jsonContent(ApiKeyCreateSchema, 'Name + scopes') },
  responses: {
    201: jsonContent(ApiKeyCreateResultSchema, 'Created (with plaintext secret)'),
    ...ProblemResponses,
  },
});

const revokeRoute = createRoute({
  method: 'post',
  path: '/admin/api-keys/{id}/revoke',
  tags: ['admin'],
  summary: 'Revoke an API key',
  middleware: adminMw,
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: jsonContent(ApiKeyRowSchema, 'Revoked'),
    ...ProblemResponses,
  },
});

export function registerApiKeyRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
    return c.json(rows.map(rowToDTO), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const { name, scopes } = c.req.valid('json');
    const actor = c.get('actor');
    // 32 bytes hex => 64-char secret. Prefix to make leak-scanners obvious.
    const secret = `jt_${randomBytes(32).toString('hex')}`;
    const hashed = hashApiKey(secret);
    const inserted = await db
      .insert(apiKeys)
      .values({
        name,
        hashedKey: hashed,
        scopes,
        createdByUserId:
          actor && actor.source !== 'demo' && !actor.userId.startsWith('apikey:')
            ? actor.userId
            : null,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new ApiError({ status: 500, title: 'Server Error' });
    return c.json({ apiKey: rowToDTO(row), secret }, 201);
  });

  app.openapi(revokeRoute, async (c) => {
    const { id } = c.req.valid('param');
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
    const row = (await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(rowToDTO(row), 200);
  });
}
