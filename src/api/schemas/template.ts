// =============================================================
// Job templates + their template slots.
// =============================================================
import { z } from './common';
import { LevelSchema, RoleKeySchema } from './person';

export const TemplateSlotSchema = z
  .object({
    role: RoleKeySchema,
    level: LevelSchema,
    hours: z.number(),
    start: z.number(),
    optional: z.boolean().optional(),
  })
  .openapi('TemplateSlot');

export const JobTemplateSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    slots: z.array(TemplateSlotSchema),
    truckCount: z.number().int().nonnegative(),
  })
  .openapi('JobTemplate');

export const JobTemplateCreateSchema = JobTemplateSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('JobTemplateCreate');

export const JobTemplateUpdateSchema = JobTemplateSchema.omit({ id: true })
  .partial()
  .openapi('JobTemplateUpdate');

export type JobTemplateDTO = z.infer<typeof JobTemplateSchema>;
