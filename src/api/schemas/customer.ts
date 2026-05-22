// =============================================================
// Customers. `hubspot` is the HubSpot contact id mirror.
// =============================================================
import { z } from './common';

export const CustomerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    hubspot: z.string().nullable(),
  })
  .openapi('Customer');

export const CustomerCreateSchema = CustomerSchema.omit({ id: true })
  .extend({ id: z.string().optional() })
  .openapi('CustomerCreate');

export const CustomerUpdateSchema = CustomerSchema.omit({ id: true })
  .partial()
  .openapi('CustomerUpdate');

export type CustomerDTO = z.infer<typeof CustomerSchema>;
