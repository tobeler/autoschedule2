// =============================================================
// Auth middleware for the Hono API.
//
// Resolves an actor from EITHER:
//  1. A NextAuth session cookie (calls `auth()` from /auth.ts).
//  2. An `Authorization: Bearer <api_key>` header — the key is
//     SHA-256 hashed and looked up against the `api_keys` table.
//
// Public paths (`/v1/openapi.json`, `/v1/health`, `/v1/docs`) skip
// the gate. Everything else without a valid actor returns 401.
//
// Demo mode (no NEXTAUTH_SECRET set) falls back to a built-in
// admin actor so the dispatcher app keeps working without a DB.
// =============================================================
import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';

import { auth } from '../../../auth';
import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';

import { ApiError } from './error';

export type ActorScope = 'read' | 'write' | 'admin';

export interface Actor {
  userId: string;
  role: string;
  scopes: ActorScope[];
  source: 'session' | 'api_key' | 'demo';
  apiKeyId?: string;
}

export interface ApiEnv {
  Variables: {
    actor: Actor;
  };
}

const PUBLIC_PATHS = new Set(['/v1/openapi.json', '/v1/health']);
const DEMO_BYPASS = !process.env.NEXTAUTH_SECRET || process.env.DEMO_MODE === 'true';

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function demoActor(): Actor {
  return {
    userId: 'demo-admin',
    role: 'admin',
    scopes: ['read', 'write', 'admin'],
    source: 'demo',
  };
}

async function tryApiKey(c: Context): Promise<Actor | null> {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const secret = header.slice(7).trim();
  if (!secret) return null;
  const hashed = hashApiKey(secret);
  const row = (
    await db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashed)).limit(1)
  )[0];
  if (!row) throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'Invalid API key' });
  if (row.revokedAt) {
    throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'API key revoked' });
  }
  // Best-effort lastUsedAt bump. Don't block the request if it fails.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {});
  const scopes = (row.scopes ?? []).filter((s): s is ActorScope =>
    s === 'read' || s === 'write' || s === 'admin',
  );
  return {
    userId: row.createdByUserId ?? `apikey:${row.id}`,
    role: scopes.includes('admin') ? 'admin' : scopes.includes('write') ? 'manager' : 'dispatcher',
    scopes,
    source: 'api_key',
    apiKeyId: row.id,
  };
}

async function trySession(): Promise<Actor | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    const role = (session.user as { role?: string }).role ?? 'dispatcher';
    const scopes: ActorScope[] =
      role === 'admin'
        ? ['read', 'write', 'admin']
        : role === 'manager'
          ? ['read', 'write']
          : ['read'];
    return {
      userId: session.user.id,
      role,
      scopes,
      source: 'session',
    };
  } catch {
    return null;
  }
}

export const authMiddleware: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const path = c.req.path;
  // Strip the Next.js basePath prefix when running under `/api`.
  const v1Path = path.replace(/^\/api/, '');
  if (PUBLIC_PATHS.has(v1Path) || PUBLIC_PATHS.has(path)) {
    return next();
  }

  // 1) API key first — explicit auth wins over implicit cookies.
  const fromKey = await tryApiKey(c);
  if (fromKey) {
    c.set('actor', fromKey);
    return next();
  }

  // 2) Session cookie.
  const fromSession = await trySession();
  if (fromSession) {
    c.set('actor', fromSession);
    return next();
  }

  // 3) Demo fallback for unconfigured environments.
  if (DEMO_BYPASS) {
    c.set('actor', demoActor());
    return next();
  }

  throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'Authentication required' });
};

export function requireScope(scope: ActorScope) {
  return async (c: Context<ApiEnv>, next: () => Promise<void>) => {
    const actor = c.get('actor');
    if (!actor || !actor.scopes.includes(scope)) {
      throw new ApiError({
        status: 403,
        title: 'Forbidden',
        detail: `Missing required scope: ${scope}`,
      });
    }
    return next();
  };
}

export function requireRole(...roles: string[]) {
  return async (c: Context<ApiEnv>, next: () => Promise<void>) => {
    const actor = c.get('actor');
    if (!actor || !roles.includes(actor.role)) {
      throw new ApiError({
        status: 403,
        title: 'Forbidden',
        detail: `Requires one of: ${roles.join(', ')}`,
      });
    }
    return next();
  };
}
