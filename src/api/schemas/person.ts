// =============================================================
// People + their role joins.
// =============================================================
import { z } from './common';

export const RoleKeySchema = z
  .enum([
    'hvac_lead',
    'hvac_installer',
    'apprentice',
    'service_tech',
    'electrician',
    'plumber',
    'fsm',
  ])
  .openapi('RoleKey');

export const LevelSchema = z.enum(['L1', 'L2', 'L3']).openapi('Level');

export const PersonSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    initials: z.string(),
    roles: z.array(RoleKeySchema),
    level: LevelSchema,
    defaultCrew: z.string().nullable(),
    certs: z.array(z.string()).optional(),
  })
  .openapi('Person');

export const PersonCreateSchema = PersonSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('PersonCreate');

export const PersonUpdateSchema = PersonSchema.omit({ id: true })
  .partial()
  .openapi('PersonUpdate');

export type PersonDTO = z.infer<typeof PersonSchema>;
