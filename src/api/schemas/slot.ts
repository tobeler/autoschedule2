// =============================================================
// Job slots: the per-role rows attached to a job.
// =============================================================
import { z } from './common';
import { LevelSchema, RoleKeySchema } from './person';

export const JobSlotSchema = z
  .object({
    id: z.string(),
    role: RoleKeySchema,
    level: LevelSchema,
    hours: z.number(),
    start: z.number(),
    optional: z.boolean().optional(),
    assignedTo: z.string().nullable(),
    suggested: z.boolean().optional(),
  })
  .openapi('JobSlot');

export const SlotAssignSchema = z
  .object({
    assignedTo: z.string().nullable(),
  })
  .openapi('SlotAssign');

export type JobSlotDTO = z.infer<typeof JobSlotSchema>;
