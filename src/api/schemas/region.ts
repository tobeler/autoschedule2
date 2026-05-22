// =============================================================
// Service areas / regions. Schema mirrors src/types.ts; the DB
// stores sub-regions via parentRegionId self-reference.
// =============================================================
import { z } from './common';

export const SubRegionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    headcount: z.number().int().nonnegative(),
    crews: z.number().int().nonnegative(),
  })
  .openapi('SubRegion');

export const RegionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    short: z.string(),
    subs: z.array(SubRegionSchema),
  })
  .openapi('Region');

export const RegionCreateSchema = RegionSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('RegionCreate');

export const RegionUpdateSchema = RegionSchema.omit({ id: true })
  .partial()
  .openapi('RegionUpdate');

export type RegionDTO = z.infer<typeof RegionSchema>;
