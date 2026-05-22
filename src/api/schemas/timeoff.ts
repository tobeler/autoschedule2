// =============================================================
// Time-off records — one row per person per day off.
// =============================================================
import { z } from './common';

export const TimeOffTypeSchema = z
  .enum(['sick', 'vacation', 'training', 'pto'])
  .openapi('TimeOffType');

export const TimeOffSchema = z
  .object({
    id: z.string(),
    personId: z.string(),
    date: z.string(),
    type: TimeOffTypeSchema,
    label: z.string(),
  })
  .openapi('TimeOff');

export const TimeOffCreateSchema = TimeOffSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('TimeOffCreate');

export const TimeOffUpdateSchema = TimeOffSchema.omit({ id: true })
  .partial()
  .openapi('TimeOffUpdate');

export type TimeOffDTO = z.infer<typeof TimeOffSchema>;
