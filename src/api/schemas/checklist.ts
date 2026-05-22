// =============================================================
// Checklists used for completion forms. The list lives across
// the `checklists`, `checklist_sections`, `checklist_items`
// tables; the API flattens them into the JobType-keyed sections
// the prototype expects.
// =============================================================
import { z } from './common';

export const ChecklistItemTypeSchema = z
  .enum(['checkbox', 'photo', 'single', 'multi', 'number', 'text', 'longtext', 'signature', 'rating'])
  .openapi('ChecklistItemType');

export const ChecklistItemSchema = z
  .object({
    id: z.string(),
    type: ChecklistItemTypeSchema,
    label: z.string(),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    minPhotos: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional(),
    placeholder: z.string().optional(),
  })
  .openapi('ChecklistItem');

export const ChecklistSectionSchema = z
  .object({
    section: z.string(),
    items: z.array(ChecklistItemSchema),
  })
  .openapi('ChecklistSection');

export const ChecklistSchema = z
  .object({
    id: z.string(),
    jobType: z.string(),
    version: z.number().int().nonnegative(),
    sections: z.array(ChecklistSectionSchema),
  })
  .openapi('Checklist');

export const ChecklistResponseValueSchema = z
  .union([
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.string()),
    z.object({ name: z.string(), when: z.string() }),
    z.null(),
  ])
  .openapi('ChecklistResponseValue');

export const ChecklistResponseSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    itemId: z.string(),
    value: ChecklistResponseValueSchema,
    answeredAt: z.string(),
  })
  .openapi('ChecklistResponse');

export const ChecklistResponseUpsertSchema = z
  .object({
    itemId: z.string(),
    value: ChecklistResponseValueSchema,
  })
  .openapi('ChecklistResponseUpsert');

export type ChecklistDTO = z.infer<typeof ChecklistSchema>;
export type ChecklistResponseDTO = z.infer<typeof ChecklistResponseSchema>;
