// =============================================================
// Crews. Members come from the crew_members join.
// =============================================================
import { z } from './common';

export const CrewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    lead: z.string().nullable(),
    members: z.array(z.string()),
    truck: z.string().nullable(),
    color: z.string(),
  })
  .openapi('Crew');

export const CrewCreateSchema = CrewSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('CrewCreate');

export const CrewUpdateSchema = CrewSchema.omit({ id: true })
  .partial()
  .openapi('CrewUpdate');

export type CrewDTO = z.infer<typeof CrewSchema>;
