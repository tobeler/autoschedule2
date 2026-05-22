// =============================================================
// Projects — bound to a HubSpot Project (0-970, native) record
// when integrated. `source` flags legacy installation rows so
// the UI can render them differently.
// =============================================================
import { z } from './common';

export const ProjectStatusSchema = z
  .enum(['proposed', 'sold', 'in_progress', 'complete', 'warranty', 'cancelled'])
  .openapi('ProjectStatus');

export const ProjectSourceSchema = z
  .enum(['native_project', 'legacy_installation'])
  .openapi('ProjectSource');

export const ProjectSchema = z
  .object({
    id: z.string(),
    customer: z.string(),
    name: z.string(),
    type: z.string(),
    status: ProjectStatusSchema,
    soldDate: z.string().nullable(),
    targetCompletion: z.string().nullable(),
    value: z.number().nullable(),
    hubspotDealId: z.string().nullable(),
    hubspotProjectId: z.string().nullable(),
    primaryCrew: z.string().nullable(),
    description: z.string().optional(),
    designNotes: z.string().optional(),
    source: ProjectSourceSchema.default('native_project'),
  })
  .openapi('Project');

export const ProjectCreateSchema = ProjectSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('ProjectCreate');

export const ProjectUpdateSchema = ProjectSchema.omit({ id: true })
  .partial()
  .openapi('ProjectUpdate');

export type ProjectDTO = z.infer<typeof ProjectSchema>;
