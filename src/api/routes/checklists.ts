// =============================================================
// /v1/checklists — completion-form definitions + per-job answers.
//
// Definitions are read-mostly (admin tooling lives in /settings).
// Responses are keyed by jobId + itemId; the PUT upserts.
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  checklistItems,
  checklistResponses,
  checklistSections,
  checklists,
} from '@/db/schema';
import type { ChecklistResponseValue } from '@/types';

import {
  IdParamSchema,
  ProblemResponses,
  jsonContent,
  z,
} from '../schemas/common';
import {
  ChecklistResponseSchema,
  ChecklistResponseUpsertSchema,
  ChecklistResponseValueSchema,
  ChecklistSchema,
} from '../schemas/checklist';
import { ApiError } from '../middleware/error';
import type { ApiEnv } from '../middleware/auth';

interface ChecklistItemRow {
  id: string;
  sectionId: string;
  type: (typeof checklistItems.$inferSelect)['type'];
  label: string;
  required: boolean;
  optionsJson: string[] | null;
  minPhotos: number | null;
  minNumber: string | null;
  maxNumber: string | null;
  unit: string | null;
  placeholder: string | null;
  sortOrder: number;
}

function itemRowToDTO(r: ChecklistItemRow) {
  return {
    id: r.id,
    type: r.type,
    label: r.label,
    required: r.required,
    options: r.optionsJson ?? undefined,
    minPhotos: r.minPhotos ?? undefined,
    min: r.minNumber != null ? Number(r.minNumber) : undefined,
    max: r.maxNumber != null ? Number(r.maxNumber) : undefined,
    unit: r.unit ?? undefined,
    placeholder: r.placeholder ?? undefined,
  };
}

async function loadChecklist(id: string) {
  const row = (
    await db.select().from(checklists).where(eq(checklists.id, id)).limit(1)
  )[0];
  if (!row) return null;
  const sectionRows = await db
    .select()
    .from(checklistSections)
    .where(eq(checklistSections.checklistId, id))
    .orderBy(asc(checklistSections.sortOrder));
  const itemRows = sectionRows.length
    ? await db
        .select()
        .from(checklistItems)
        .where(
          inArray(
            checklistItems.sectionId,
            sectionRows.map((s) => s.id),
          ),
        )
        .orderBy(asc(checklistItems.sortOrder))
    : [];
  const itemsBySection = new Map<string, ChecklistItemRow[]>();
  for (const it of itemRows) {
    const arr = itemsBySection.get(it.sectionId) ?? [];
    arr.push(it as ChecklistItemRow);
    itemsBySection.set(it.sectionId, arr);
  }
  return {
    id: row.id,
    jobType: row.jobType,
    version: row.version,
    sections: sectionRows.map((s) => ({
      section: s.title,
      items: (itemsBySection.get(s.id) ?? []).map(itemRowToDTO),
    })),
  };
}

const listChecklists = createRoute({
  method: 'get',
  path: '/checklists',
  tags: ['checklists'],
  summary: 'List checklists',
  responses: {
    200: jsonContent(z.array(ChecklistSchema), 'Checklists'),
    ...ProblemResponses,
  },
});

const getChecklist = createRoute({
  method: 'get',
  path: '/checklists/{id}',
  tags: ['checklists'],
  summary: 'Get a checklist by id',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(ChecklistSchema, 'Checklist'),
    ...ProblemResponses,
  },
});

const listResponses = createRoute({
  method: 'get',
  path: '/jobs/{id}/checklist-responses',
  tags: ['checklists'],
  summary: 'List checklist responses for a job',
  request: { params: IdParamSchema },
  responses: {
    200: jsonContent(z.array(ChecklistResponseSchema), 'Responses'),
    ...ProblemResponses,
  },
});

const upsertResponse = createRoute({
  method: 'put',
  path: '/jobs/{id}/checklist-responses',
  tags: ['checklists'],
  summary: 'Upsert one checklist response for a job',
  request: {
    params: IdParamSchema,
    body: jsonContent(ChecklistResponseUpsertSchema, 'Response'),
  },
  responses: {
    200: jsonContent(ChecklistResponseSchema, 'Upserted'),
    ...ProblemResponses,
  },
});

export function registerChecklistRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listChecklists, async (c) => {
    const rows = await db.select().from(checklists);
    const out: Array<NonNullable<Awaited<ReturnType<typeof loadChecklist>>>> = [];
    for (const r of rows) {
      const dto = await loadChecklist(r.id);
      if (dto) out.push(dto);
    }
    return c.json(out, 200);
  });

  app.openapi(getChecklist, async (c) => {
    const { id } = c.req.valid('param');
    const dto = await loadChecklist(id);
    if (!dto) throw new ApiError({ status: 404, title: 'Not Found' });
    return c.json(dto, 200);
  });

  app.openapi(listResponses, async (c) => {
    const { id } = c.req.valid('param');
    const rows = await db
      .select()
      .from(checklistResponses)
      .where(eq(checklistResponses.jobId, id));
    return c.json(
      rows.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        itemId: r.itemId,
        value: (r.valueJson ?? null) as ChecklistResponseValue,
        answeredAt: r.answeredAt.toISOString(),
      })),
      200,
    );
  });

  app.openapi(upsertResponse, async (c) => {
    const { id: jobId } = c.req.valid('param');
    const { itemId, value } = c.req.valid('json');
    // Parse value with zod for safety even though the route validator
    // already accepts it — the union shape needs runtime narrowing.
    const parsed = ChecklistResponseValueSchema.parse(value);
    const existing = (
      await db
        .select()
        .from(checklistResponses)
        .where(
          and(
            eq(checklistResponses.jobId, jobId),
            eq(checklistResponses.itemId, itemId),
          ),
        )
        .limit(1)
    )[0];
    const now = new Date();
    let rowId: string;
    if (existing) {
      await db
        .update(checklistResponses)
        .set({ valueJson: parsed as Record<string, unknown> | null, answeredAt: now })
        .where(eq(checklistResponses.id, existing.id));
      rowId = existing.id;
    } else {
      rowId = `CR-${Date.now().toString(36)}`;
      await db.insert(checklistResponses).values({
        id: rowId,
        jobId,
        itemId,
        valueJson: parsed as Record<string, unknown> | null,
        answeredAt: now,
      });
    }
    return c.json(
      {
        id: rowId,
        jobId,
        itemId,
        value: parsed,
        answeredAt: now.toISOString(),
      },
      200,
    );
  });
}
