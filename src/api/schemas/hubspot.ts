// =============================================================
// HubSpot mapping + sync request/response shapes. Phase 13 owns
// the actual handler bodies; we publish the surface here so the
// generated client + UI can target it now.
// =============================================================
import { z } from './common';

export const HubspotEntitySchema = z
  .enum(['contact', 'deal', 'project', 'job', 'service_area', 'installation'])
  .openapi('HubspotEntity');

export const HubspotDirectionSchema = z.enum(['push', 'pull', 'both']).openapi('HubspotDirection');

export const HubspotFieldMapSchema = z
  .object({
    appField: z.string(),
    hsField: z.string(),
    direction: HubspotDirectionSchema,
  })
  .openapi('HubspotFieldMap');

export const HubspotEntityMappingSchema = z
  .object({
    entity: HubspotEntitySchema,
    fields: z.array(HubspotFieldMapSchema),
  })
  .openapi('HubspotEntityMapping');

export const HubspotMappingPutSchema = z
  .object({
    fields: z.array(HubspotFieldMapSchema),
  })
  .openapi('HubspotMappingPut');

export const HubspotEntityParamSchema = z
  .object({
    entity: HubspotEntitySchema.openapi({
      param: { name: 'entity', in: 'path' },
    }),
  })
  .openapi('HubspotEntityParam');

export const HubspotSyncResultSchema = z
  .object({
    ok: z.boolean(),
    contacts: z.number().int().nonnegative(),
    deals: z.number().int().nonnegative(),
    projects: z.number().int().nonnegative(),
    serviceAreas: z.number().int().nonnegative(),
    installations: z.number().int().nonnegative(),
    startedAt: z.string(),
    finishedAt: z.string(),
    errors: z.array(z.string()),
  })
  .openapi('HubspotSyncResult');

export const HubspotPushResultSchema = z
  .object({
    ok: z.boolean(),
    message: z.string(),
    hubspotObjectId: z.string().optional(),
  })
  .openapi('HubspotPushResult');
