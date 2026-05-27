// =============================================================
// /v1/time-entries — real clock-in / clock-out punches.
//
// READ-ONLY view from the API today (Zuper sync + the seeded demo
// rows populate the table). The Timesheets view in the UI fetches
// these and computes daily totals + per-job breakdowns client-side.
//
// Query params:
//   ?personId=p1            — filter to one technician
//   ?from=2026-05-20        — clockIn >= start of that day (UTC)
//   ?to=2026-05-27          — clockIn <  start of that day + 1d
// =============================================================
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { and, asc, eq, gte, lt, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { timeEntries } from '@/db/schema';

import { ProblemResponses, jsonContent, paged, z } from '../schemas/common';
import { TimeEntrySchema } from '../schemas/timeEntry';
import type { ApiEnv } from '../middleware/auth';
import { timeEntryToDTO } from '../db/mappers';

const ListQuery = z.object({
  personId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const listRoute = createRoute({
  method: 'get',
  path: '/time-entries',
  tags: ['time-entries'],
  summary: 'List clock-in / clock-out entries',
  request: { query: ListQuery },
  responses: {
    200: jsonContent(paged(TimeEntrySchema), 'Time-entry page'),
    ...ProblemResponses,
  },
});

function parseDayBoundary(s: string | undefined): Date | null {
  if (!s) return null;
  // YYYY-MM-DD → UTC midnight. The Timesheets view fetches in local week
  // chunks; widening the upper bound by a day from the call site keeps the
  // logic here trivially correct.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export function registerTimeEntryRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(listRoute, async (c) => {
    const { personId, from, to, limit: lim, offset: off } = c.req.valid('query');
    const limit = lim ? Math.max(1, Math.min(2000, Number(lim))) : 1000;
    const offset = off ? Math.max(0, Number(off)) : 0;

    const conds: SQL[] = [];
    if (personId) conds.push(eq(timeEntries.personId, personId));
    const fromDt = parseDayBoundary(from);
    const toDt = parseDayBoundary(to);
    if (fromDt) conds.push(gte(timeEntries.clockIn, fromDt));
    if (toDt) conds.push(lt(timeEntries.clockIn, toDt));

    const query = db.select().from(timeEntries);
    const filtered = conds.length ? query.where(and(...conds)) : query;
    const rows = await filtered
      .orderBy(asc(timeEntries.personId), asc(timeEntries.clockIn))
      .limit(limit)
      .offset(offset);

    const data = rows.map(timeEntryToDTO);
    return c.json({ data, total: data.length, limit, offset }, 200);
  });
}
