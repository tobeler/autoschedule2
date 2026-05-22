// =============================================================
// Crew roster overrides. These are date-scoped staffing moves that
// change who belongs to a crew for a day or partial day without
// mutating the default crew roster.
// =============================================================
import { z } from './common';

export const CrewRosterOverrideReasonSchema = z
  .enum(['loan', 'sick_cover', 'training', 'service_pair', 'manual'])
  .openapi('CrewRosterOverrideReason');

export const CrewRosterOverrideSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    personId: z.string(),
    sourceCrewId: z.string().nullable(),
    targetCrewId: z.string(),
    startHour: z.number().nullable(),
    endHour: z.number().nullable(),
    reason: CrewRosterOverrideReasonSchema,
    note: z.string().optional(),
  })
  .openapi('CrewRosterOverride');

export const CrewRosterOverrideCreateSchema = CrewRosterOverrideSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('CrewRosterOverrideCreate');

export const CrewRosterOverrideUpdateSchema = CrewRosterOverrideSchema.omit({ id: true })
  .partial()
  .openapi('CrewRosterOverrideUpdate');

export type CrewRosterOverrideDTO = z.infer<typeof CrewRosterOverrideSchema>;
