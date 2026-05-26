// =============================================================
// Jobs — the central scheduling entity.
//
// `slots` is denormalized for the API but stored in the job_slots
// table. Patches accept partial fields; creates require the bare
// minimum (type, durationHrs).
// =============================================================
import { z } from './common';
import { JobSlotSchema } from './slot';

export const JobTypeSchema = z.string().openapi('JobTypeKey');

export const JobStatusSchema = z
  .enum([
    'unscheduled',
    'scheduled',
    'enroute',
    'onsite',
    'complete',
    'callback',
    'cancelled',
  ])
  .openapi('JobStatus');

export const VehicleModeSchema = z.enum(['fleet', 'personal', 'none']).openapi('VehicleMode');

export const JobSchema = z
  .object({
    id: z.string(),
    type: JobTypeSchema,
    status: JobStatusSchema,
    customer: z.string().nullable(),
    date: z.string().nullable(),
    startHour: z.number().nullable(),
    durationHrs: z.number(),
    crewId: z.string().nullable(),
    extraCrewIds: z.array(z.string()).default([]),
    truckId: z.string().nullable(),
    slots: z.array(JobSlotSchema).default([]),
    notes: z.string().default(''),
    address: z.string().default(''),
    hubspotDealId: z.string().nullable(),
    driveTimeMin: z.number().default(0),
    price: z.number().optional(),
    multidayGroupId: z.string().nullable().optional(),
    multidayIndex: z.number().nullable().optional(),
    multidayTotal: z.number().nullable().optional(),
    continuationOf: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    vehicleMode: VehicleModeSchema.optional(),
    personalDriverId: z.string().nullable().optional(),
    endDate: z.string().optional(),
    endHour: z.number().optional(),
    daysSpanned: z.number().optional(),
    // Actuals — written by the transition endpoint.
    actualsEnRouteAt: z.string().nullable().optional(),
    actualsInProgressAt: z.string().nullable().optional(),
    actualsCompleteAt: z.string().nullable().optional(),
  })
  .openapi('Job');

export const JobCreateSchema = z
  .object({
    id: z.string().optional(),
    type: JobTypeSchema,
    status: JobStatusSchema.default('unscheduled'),
    customer: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    startHour: z.number().nullable().optional(),
    durationHrs: z.number().default(0),
    crewId: z.string().nullable().optional(),
    extraCrewIds: z.array(z.string()).optional(),
    truckId: z.string().nullable().optional(),
    slots: z.array(JobSlotSchema).optional(),
    notes: z.string().optional(),
    address: z.string().optional(),
    hubspotDealId: z.string().nullable().optional(),
    driveTimeMin: z.number().optional(),
    price: z.number().optional(),
    projectId: z.string().nullable().optional(),
    multidayGroupId: z.string().nullable().optional(),
    multidayIndex: z.number().nullable().optional(),
    multidayTotal: z.number().nullable().optional(),
    continuationOf: z.string().nullable().optional(),
    vehicleMode: VehicleModeSchema.optional(),
    personalDriverId: z.string().nullable().optional(),
    endDate: z.string().optional(),
    endHour: z.number().optional(),
    daysSpanned: z.number().optional(),
  })
  .openapi('JobCreate');

export const JobUpdateSchema = JobCreateSchema.partial().openapi('JobUpdate');

export const JobsListQuerySchema = z
  .object({
    date: z.string().optional().openapi({ example: '2026-05-22' }),
    crewId: z.string().optional(),
    status: JobStatusSchema.optional(),
    customer: z.string().optional(),
    projectId: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  })
  .openapi('JobsListQuery');

export const JobTransitionSchema = z
  .object({
    status: JobStatusSchema,
    at: z.string().optional().openapi({
      format: 'date-time',
      description: 'When the transition occurred. Defaults to server now().',
    }),
  })
  .openapi('JobTransition');

export type JobDTO = z.infer<typeof JobSchema>;
