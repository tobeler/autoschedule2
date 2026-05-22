// =============================================================
// Audit log (admin-only). Phase 14 makes this useful end-to-end;
// the surface lands here so the generated client is stable.
// =============================================================
import { z } from './common';

export const AuditLogRowSchema = z
  .object({
    id: z.string(),
    actorUserId: z.string().nullable(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    createdAt: z.string(),
  })
  .openapi('AuditLogRow');

export const AuditLogQuerySchema = z
  .object({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    actorUserId: z.string().optional(),
    /** Inclusive lower bound (ISO-8601). Alias for `from`. */
    since: z.string().optional(),
    /** Inclusive lower bound (ISO-8601). */
    from: z.string().optional(),
    /** Inclusive upper bound (ISO-8601). */
    to: z.string().optional(),
    /** Opaque cursor — the prior page's last `createdAt`. */
    cursor: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  })
  .openapi('AuditLogQuery');
