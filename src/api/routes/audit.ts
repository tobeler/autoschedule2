// =============================================================
// /v1/audit-log — admin only. Phase 14 wires the audit middleware
// that populates the table; surface is here so we don't reshape
// it later.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, desc, eq, gte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { auditLog } from '@/db/schema';

import { ProblemResponses, jsonContent, paged } from '../schemas/common';
import { AuditLogQuerySchema, AuditLogRowSchema } from '../schemas/audit';
import { requireRole, type ApiEnv } from '../middleware/auth';

const listRoute = createRoute({
  method: 'get',
  path: '/audit-log',
  tags: ['audit'],
  summary: 'List audit entries (admin-only)',
  request: { query: AuditLogQuerySchema },
  middleware: requireRole('admin'),
  responses: {
    200: jsonContent(paged(AuditLogRowSchema), 'Audit page'),
    ...ProblemResponses,
  },
});

export function registerAuditRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const q = c.req.valid('query');
    const limit = q.limit ? Math.max(1, Math.min(500, Number(q.limit))) : 100;
    const offset = q.offset ? Math.max(0, Number(q.offset)) : 0;
    const conds: SQL[] = [];
    if (q.entityType) conds.push(eq(auditLog.entityType, q.entityType));
    if (q.entityId) conds.push(eq(auditLog.entityId, q.entityId));
    if (q.actorUserId) conds.push(eq(auditLog.actorUserId, q.actorUserId));
    if (q.since) conds.push(gte(auditLog.createdAt, new Date(q.since)));
    const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt));
    const rows = await (conds.length ? query.where(and(...conds)) : query)
      .limit(limit)
      .offset(offset);
    const data = rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before ?? null,
      after: r.after ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ data, total: data.length, limit, offset }, 200);
  });
}
