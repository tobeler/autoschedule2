// =============================================================
// /v1/templates — job templates + their slot blueprints.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { jobTemplates, templateSlots } from '@/db/schema';

import {
  IdParamSchema,
  PagingQuerySchema,
  ProblemResponses,
  jsonContent,
  paged,
  z,
} from '../schemas/common';
import {
  JobTemplateCreateSchema,
  JobTemplateSchema,
  JobTemplateUpdateSchema,
} from '../schemas/template';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';

type TemplateSlotRow = typeof templateSlots.$inferSelect;

function templateToDTO(
  row: typeof jobTemplates.$inferSelect,
  slots: TemplateSlotRow[],
) {
  return {
    id: row.id,
    label: row.label,
    truckCount: row.truckCount,
    defaultDurationHrs:
      row.defaultDurationHrs == null ? null : Number(row.defaultDurationHrs),
    slots: slots
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        role: s.role,
        level: s.level,
        hours: Number(s.hours),
        start: Number(s.startOffsetHours),
        optional: s.optional,
      })),
  };
}

const listRoute = createRoute({
  method: 'get',
  path: '/templates',
  tags: ['templates'],
  summary: 'List job templates',
  request: { query: PagingQuerySchema },
  responses: {
    200: jsonContent(paged(JobTemplateSchema), 'Templates page'),
    ...ProblemResponses,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/templates/{id}',
  tags: ['templates'],
  summary: 'Get a job template',
  request: { params: IdParamSchema },
  responses: { 200: jsonContent(JobTemplateSchema, 'Template'), ...ProblemResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/templates',
  tags: ['templates'],
  summary: 'Create a job template',
  request: { body: jsonContent(JobTemplateCreateSchema, 'Template fields') },
  responses: { 201: jsonContent(JobTemplateSchema, 'Created'), ...ProblemResponses },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/templates/{id}',
  tags: ['templates'],
  summary: 'Update a job template',
  request: {
    params: IdParamSchema,
    body: jsonContent(JobTemplateUpdateSchema, 'Patch fields'),
  },
  responses: { 200: jsonContent(JobTemplateSchema, 'Updated'), ...ProblemResponses },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/templates/{id}',
  tags: ['templates'],
  summary: 'Delete a job template',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.object({ ok: z.literal(true) }), 'Deleted'),
    ...ProblemResponses,
  },
});

export function registerTemplateRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { limit, offset } = c.req.valid('query');
    const rows = await db.select().from(jobTemplates).limit(limit).offset(offset);
    const slotRows = rows.length
      ? await db
          .select()
          .from(templateSlots)
          .where(
            inArray(
              templateSlots.templateId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(templateSlots.sortOrder))
      : [];
    const byTpl = new Map<string, typeof slotRows>();
    for (const s of slotRows) {
      const arr = byTpl.get(s.templateId) ?? [];
      arr.push(s);
      byTpl.set(s.templateId, arr);
    }
    const data = rows.map((r) => templateToDTO(r, byTpl.get(r.id) ?? []));
    return c.json({ data, total: data.length, limit, offset }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = (await db.select().from(jobTemplates).where(eq(jobTemplates.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    const slots = await db
      .select()
      .from(templateSlots)
      .where(eq(templateSlots.templateId, id))
      .orderBy(asc(templateSlots.sortOrder));
    return c.json(templateToDTO(row, slots), 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    const id = body.id ?? `TPL-${Date.now().toString(36)}`;
    await db.insert(jobTemplates).values({
      id,
      label: body.label,
      truckCount: body.truckCount,
      defaultDurationHrs:
        body.defaultDurationHrs == null ? null : String(body.defaultDurationHrs),
    });
    if (body.slots?.length) {
      await db.insert(templateSlots).values(
        body.slots.map((s, i) => ({
          id: `${id}-S${i}`,
          templateId: id,
          role: s.role,
          level: s.level,
          hours: String(s.hours),
          startOffsetHours: String(s.start),
          optional: s.optional ?? false,
          sortOrder: i,
        })),
      );
    }
    const row = (await db.select().from(jobTemplates).where(eq(jobTemplates.id, id)).limit(1))[0]!;
    const slots = await db
      .select()
      .from(templateSlots)
      .where(eq(templateSlots.templateId, id))
      .orderBy(asc(templateSlots.sortOrder));
    return c.json(templateToDTO(row, slots), 201);
  });

  app.openapi(updateRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db
      .update(jobTemplates)
      .set({
        ...(body.label !== undefined && { label: body.label }),
        ...(body.truckCount !== undefined && { truckCount: body.truckCount }),
        ...(body.defaultDurationHrs !== undefined && {
          defaultDurationHrs:
            body.defaultDurationHrs == null
              ? null
              : String(body.defaultDurationHrs),
        }),
        updatedAt: new Date(),
      })
      .where(eq(jobTemplates.id, id));
    if (body.slots) {
      await db.delete(templateSlots).where(eq(templateSlots.templateId, id));
      if (body.slots.length) {
        await db.insert(templateSlots).values(
          body.slots.map((s, i) => ({
            id: `${id}-S${i}`,
            templateId: id,
            role: s.role,
            level: s.level,
            hours: String(s.hours),
            startOffsetHours: String(s.start),
            optional: s.optional ?? false,
            sortOrder: i,
          })),
        );
      }
    }
    const row = (await db.select().from(jobTemplates).where(eq(jobTemplates.id, id)).limit(1))[0];
    if (!row) throw new ApiError({ status: 404, title: 'Not Found' });
    const slots = await db
      .select()
      .from(templateSlots)
      .where(eq(templateSlots.templateId, id))
      .orderBy(asc(templateSlots.sortOrder));
    return c.json(templateToDTO(row, slots), 200);
  });

  app.openapi(deleteRouteDef, async (c) => {
    const { id } = c.req.valid('param');
    await db.delete(jobTemplates).where(eq(jobTemplates.id, id));
    return c.json({ ok: true as const }, 200);
  });
}
