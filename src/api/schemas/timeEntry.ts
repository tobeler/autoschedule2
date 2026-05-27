// =============================================================
// Time entries — real clock-in / clock-out punches backing the
// Timesheets view. Distinct from job_slots.hours (planned duration).
// =============================================================
import { z } from './common';

export const TimeEntrySourceSchema = z
  .enum(['zuper', 'native'])
  .openapi('TimeEntrySource');

export const TimeEntrySchema = z
  .object({
    id: z.string(),
    personId: z.string(),
    /** Null when the punch isn't pinned to a specific job (shift-start). */
    jobId: z.string().nullable(),
    /** ISO-8601 UTC timestamp. */
    clockIn: z.string(),
    /** Null while the tech is still on the clock. */
    clockOut: z.string().nullable(),
    source: TimeEntrySourceSchema,
    zuperLogId: z.string().nullable().optional(),
  })
  .openapi('TimeEntry');

export const TimeEntryCreateSchema = TimeEntrySchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('TimeEntryCreate');

export type TimeEntryDTO = z.infer<typeof TimeEntrySchema>;
