// =============================================================
// Trucks.
// =============================================================
import { z } from './common';

export const TruckStatusSchema = z.enum(['available', 'shop', 'assigned']).openapi('TruckStatus');

export const TruckSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    plate: z.string(),
    kind: z.string(),
    capacity: z.string(),
    assignedCrew: z.string().nullable(),
    vin: z.string(),
    status: TruckStatusSchema.optional(),
  })
  .openapi('Truck');

export const TruckCreateSchema = TruckSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('TruckCreate');

export const TruckUpdateSchema = TruckSchema.omit({ id: true })
  .partial()
  .openapi('TruckUpdate');

export type TruckDTO = z.infer<typeof TruckSchema>;
