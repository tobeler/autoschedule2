// =============================================================
// API key admin: shapes used by /v1/admin/api-keys.
// The plaintext token is shown to the operator ONCE on create.
// =============================================================
import { z } from './common';

export const ApiKeyScopeSchema = z.enum(['read', 'write', 'admin']).openapi('ApiKeyScope');

export const ApiKeyRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    scopes: z.array(ApiKeyScopeSchema),
    createdByUserId: z.string().nullable(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
  })
  .openapi('ApiKeyRow');

export const ApiKeyCreateSchema = z
  .object({
    name: z.string().min(1),
    scopes: z.array(ApiKeyScopeSchema).min(1),
  })
  .openapi('ApiKeyCreate');

export const ApiKeyCreateResultSchema = z
  .object({
    apiKey: ApiKeyRowSchema,
    // ONLY returned on creation; never persisted in plaintext.
    secret: z.string(),
  })
  .openapi('ApiKeyCreateResult');
