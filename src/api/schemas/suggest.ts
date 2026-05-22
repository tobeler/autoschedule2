// =============================================================
// Suggestion endpoints: rank crews for a job + propose time slots.
// =============================================================
import { z } from './common';
import { JobCreateSchema } from './job';
import { LevelSchema, RoleKeySchema } from './person';

export const CrewSuggestionSchema = z
  .object({
    crewId: z.string(),
    score: z.number(),
    reasons: z.array(z.string()),
  })
  .openapi('CrewSuggestion');

export const SuggestCrewRequestSchema = z
  .union([
    z.object({ jobId: z.string() }),
    z.object({ jobDraft: JobCreateSchema }),
  ])
  .openapi('SuggestCrewRequest');

export const SuggestCrewResponseSchema = z
  .object({
    suggestions: z.array(CrewSuggestionSchema),
  })
  .openapi('SuggestCrewResponse');

export const TimeSuggestionSchema = z
  .object({
    crewId: z.string(),
    date: z.string(),
    startHour: z.number(),
    endHour: z.number(),
    score: z.number(),
    reasons: z.array(z.string()),
  })
  .openapi('TimeSuggestion');

export const SuggestTimeRequestSchema = z
  .object({
    jobType: z.string(),
    durationHrs: z.number().positive(),
    requiredRoles: z
      .array(
        z.object({
          role: RoleKeySchema,
          level: LevelSchema.optional(),
        }),
      )
      .default([]),
    anchorDate: z.string().optional(),
    daysAhead: z.number().int().positive().max(60).default(14),
  })
  .openapi('SuggestTimeRequest');

export const SuggestTimeResponseSchema = z
  .object({
    suggestions: z.array(TimeSuggestionSchema),
  })
  .openapi('SuggestTimeResponse');
