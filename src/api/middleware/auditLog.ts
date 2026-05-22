// =============================================================
// Audit-log middleware for the Hono API.
//
// Phase 14: every successful mutating request (POST/PATCH/PUT/
// DELETE) lands a row in the `audit_log` table capturing actor,
// action, target entity, before-snapshot, after-snapshot, and a
// timestamp.
//
// Implementation notes
//  - GETs are skipped entirely (read-only).
//  - We try to peek the existing row BEFORE the handler runs so
//    we can record a `before` snapshot for PATCH/DELETE. We do
//    this with a small Drizzle select against the matching table
//    inferred from the URL shape (`/v1/{entityType}/{id}`).
//  - We hook the response AFTER the handler runs by cloning the
//    response body; if the handler returned JSON we use that as
//    `after`. Anything non-2xx skips the insert (failed mutations
//    aren't audit-worthy).
//  - Errors inside the audit logger are swallowed with a console
//    warn: a broken audit pipeline must NEVER break the main
//    request.
//  - Tables we don't recognize (e.g. `/v1/hubspot/sync` action
//    routes) still get a row — `before`/`after` left null and
//    `entityId` left as a synthetic value derived from the path.
// =============================================================
import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  auditLog,
  apiKeys,
  checklists,
  crews,
  customers,
  jobs,
  jobTemplates,
  people,
  projects,
  regions,
  timeOff,
  trucks,
} from '@/db/schema';

import type { ApiEnv } from './auth';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Map the entity slug embedded in `/v1/<slug>/...` to the Drizzle
 * table we should peek for a before-snapshot. Anything not in
 * this map records the audit row with `before`/`after` null —
 * still useful for "who hit this endpoint when".
 */
type Peekable = {
  table: Parameters<typeof db.select>[0] extends infer _ ? unknown : never;
};

// Use a typed lookup via a switch — Drizzle table types are
// awkward to express as a Record value, so we narrow at call
// time instead.
async function peekBefore(
  entityType: string,
  entityId: string,
): Promise<unknown | null> {
  try {
    switch (entityType) {
      case 'jobs': {
        const r = await db.select().from(jobs).where(eq(jobs.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'people': {
        const r = await db.select().from(people).where(eq(people.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'crews': {
        const r = await db.select().from(crews).where(eq(crews.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'trucks': {
        const r = await db.select().from(trucks).where(eq(trucks.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'customers': {
        const r = await db.select().from(customers).where(eq(customers.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'projects': {
        const r = await db.select().from(projects).where(eq(projects.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'templates': {
        const r = await db
          .select()
          .from(jobTemplates)
          .where(eq(jobTemplates.id, entityId))
          .limit(1);
        return r[0] ?? null;
      }
      case 'regions': {
        const r = await db.select().from(regions).where(eq(regions.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'time-off':
      case 'timeoff': {
        const r = await db.select().from(timeOff).where(eq(timeOff.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      case 'checklists': {
        const r = await db
          .select()
          .from(checklists)
          .where(eq(checklists.id, entityId))
          .limit(1);
        return r[0] ?? null;
      }
      case 'api-keys':
      case 'apiKeys': {
        const r = await db.select().from(apiKeys).where(eq(apiKeys.id, entityId)).limit(1);
        return r[0] ?? null;
      }
      default:
        return null;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit] before-snapshot failed', err);
    return null;
  }
}

/**
 * Parse `entityType` + `entityId` from a request path. Examples:
 *   /api/v1/jobs              -> jobs / <synthetic>
 *   /api/v1/jobs/J-100        -> jobs / J-100
 *   /api/v1/jobs/J-100/transition -> jobs / J-100 (action verb dropped)
 *   /api/v1/hubspot/sync      -> hubspot / sync
 */
function parseEntity(path: string, method: string): {
  entityType: string;
  entityId: string;
} {
  const stripped = path
    .replace(/^\/api/, '')
    .replace(/^\/v1\/?/, '')
    .replace(/^\//, '');
  if (!stripped) return { entityType: 'root', entityId: method };
  const parts = stripped.split('/').filter(Boolean);
  const entityType = parts[0] ?? 'unknown';
  // Common shapes: `<type>` (POST -> create), `<type>/<id>` (PATCH/DELETE),
  // `<type>/<id>/<verb>` (e.g. transition, auto-fill). For collection
  // POSTs we don't know the new id until the response — fill that in later.
  const entityId = parts[1] ?? `${entityType}:${method.toLowerCase()}`;
  return { entityType, entityId };
}

/**
 * Try to JSON-parse the response. If the body isn't JSON or
 * isn't text-decodable, return null.
 */
async function readJsonBody(res: Response): Promise<unknown | null> {
  try {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    // Clone so the caller's res stays consumable.
    const clone = res.clone();
    return await clone.json();
  } catch {
    return null;
  }
}

export const auditLogMiddleware: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) {
    return next();
  }

  const path = c.req.path;
  const { entityType, entityId: parsedId } = parseEntity(path, method);

  // before-snapshot only matters for PATCH/PUT/DELETE; POSTs create
  // new rows by definition.
  const before =
    method === 'POST' ? null : await peekBefore(entityType, parsedId);

  await next();

  // Only audit successful mutations.
  const status = c.res.status;
  if (status < 200 || status >= 300) return;

  const after = await readJsonBody(c.res);

  // For POSTs we may now know the created id from the response.
  let entityId = parsedId;
  if (
    method === 'POST' &&
    after &&
    typeof after === 'object' &&
    'id' in after &&
    typeof (after as { id: unknown }).id === 'string'
  ) {
    entityId = (after as { id: string }).id;
  }

  const actor = c.get('actor');
  const actorUserId =
    actor && actor.source !== 'demo' && actor.userId ? actor.userId : null;

  try {
    await db.insert(auditLog).values({
      actorUserId,
      action: `${method} ${path}`,
      entityType,
      entityId,
      before: (before ?? null) as Record<string, unknown> | null,
      after: (after ?? null) as Record<string, unknown> | null,
    });
  } catch (err) {
    // Never let an audit-log failure surface to the caller.
    // eslint-disable-next-line no-console
    console.warn('[audit] insert failed', err);
  }
};
