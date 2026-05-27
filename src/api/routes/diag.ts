// =============================================================
// /v1/diag/* — diagnostics endpoints (dev-only).
//
// Routes:
//   POST /diag/log-error — accepts a JSON error envelope from the
//   browser and appends one JSONL line to /tmp/jetson-browser-errors.log
//   so a Monitor can tail it.
//
// Safety: this is local dev only. No PII concerns since the dispatcher
// app is internal. The route is unauthenticated through the public-
// path allowlist so the window.onerror handler can post even before
// auth resolves.
// =============================================================

import { promises as fs } from 'node:fs';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { ProblemResponses, jsonContent, z } from '../schemas/common';
import type { ApiEnv } from '../middleware/auth';

const LogErrorBody = z
  .object({
    type: z.enum(['error', 'unhandledrejection', 'fetch_failure']),
    message: z.string(),
    stack: z.string().optional(),
    url: z.string().optional(),
    lineno: z.number().optional(),
    colno: z.number().optional(),
    pageUrl: z.string().optional(),
    userAgent: z.string().optional(),
  })
  .openapi('DiagLogErrorBody');

const LogErrorResult = z.object({ ok: z.boolean() }).openapi('DiagLogErrorResult');

const logErrorRoute = createRoute({
  method: 'post',
  path: '/diag/log-error',
  tags: ['diag'],
  summary: 'Append a browser-side error event to /tmp/jetson-browser-errors.log',
  request: {
    body: {
      content: { 'application/json': { schema: LogErrorBody } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(LogErrorResult, 'Logged'),
    ...ProblemResponses,
  },
});

const LOG_FILE = '/tmp/jetson-browser-errors.log';

export function registerDiagRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.openapi(logErrorRoute, async (c) => {
    const body = c.req.valid('json') as {
      type: string;
      message: string;
      stack?: string;
      url?: string;
      lineno?: number;
      colno?: number;
      pageUrl?: string;
      userAgent?: string;
    };
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...body,
      // Truncate stack for the monitor — full message stays in the file.
      stackHead: body.stack ? body.stack.split('\n').slice(0, 4).join(' | ') : undefined,
    });
    try {
      await fs.appendFile(LOG_FILE, line + '\n', 'utf8');
    } catch {
      // Fail silent — diag must never break the page.
    }
    return c.json({ ok: true }, 200);
  });
}
