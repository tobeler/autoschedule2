// =============================================================
// /v1/jobs/{jobId}/slots/{slotId} — assign / unassign a person.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { jobSlots } from '@/db/schema';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import { JobSlotSchema, SlotAssignSchema } from '../schemas/slot';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';
import { jobSlotToDTO } from '../db/mappers';
import { publish } from '../db/outbox';

const SlotParams = z.object({
  jobId: z.string().openapi({ param: { name: 'jobId', in: 'path' } }),
  slotId: z.string().openapi({ param: { name: 'slotId', in: 'path' } }),
});

const patchRoute = createRoute({
  method: 'patch',
  path: '/jobs/{jobId}/slots/{slotId}',
  tags: ['jobs'],
  summary: 'Assign or unassign a person to a job slot',
  request: {
    params: SlotParams,
    body: jsonContent(SlotAssignSchema, 'New assignment'),
  },
  responses: { 200: jsonContent(JobSlotSchema, 'Updated slot'), ...ProblemResponses },
});

const listSlotsRoute = createRoute({
  method: 'get',
  path: '/jobs/{jobId}/slots',
  tags: ['jobs'],
  summary: 'List slots for a job',
  request: {
    params: z.object({
      jobId: z.string().openapi({ param: { name: 'jobId', in: 'path' } }),
    }),
  },
  responses: {
    200: jsonContent(z.array(JobSlotSchema), 'Slots'),
    ...ProblemResponses,
  },
});

export function registerSlotRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listSlotsRoute, async (c) => {
    const { jobId } = c.req.valid('param');
    const rows = await db
      .select()
      .from(jobSlots)
      .where(eq(jobSlots.jobId, jobId))
      .orderBy(asc(jobSlots.sortOrder));
    return c.json(rows.map(jobSlotToDTO), 200);
  });

  app.openapi(patchRoute, async (c) => {
    const { jobId, slotId } = c.req.valid('param');
    const { assignedTo } = c.req.valid('json');
    await db
      .update(jobSlots)
      .set({ assignedTo, suggested: false })
      .where(and(eq(jobSlots.id, slotId), eq(jobSlots.jobId, jobId)));
    const row = (
      await db
        .select()
        .from(jobSlots)
        .where(and(eq(jobSlots.id, slotId), eq(jobSlots.jobId, jobId)))
        .limit(1)
    )[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    await publish({
      topic: 'jobs.updated',
      payload: { id: jobId, reason: 'slot-assignment', slotId },
    });
    return c.json(jobSlotToDTO(row), 200);
  });
}
