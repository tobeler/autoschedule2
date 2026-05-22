// =============================================================
// Lightweight request logger. Structured pino lands in Phase 14;
// for now we emit a single console line per request with method,
// path, status, ms, and actor id (when present).
// =============================================================
import type { MiddlewareHandler } from 'hono';

import type { ApiEnv } from './auth';

export const requestLogger: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const actor = c.get('actor');
  const id = actor ? `${actor.source}:${actor.userId}` : 'anon';
  // eslint-disable-next-line no-console
  console.log(`[api] ${c.req.method} ${c.req.path} -> ${c.res.status} ${ms}ms actor=${id}`);
};
