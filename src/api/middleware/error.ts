// =============================================================
// Error → RFC 7807 problem-details translator.
//
// Captures uncaught errors raised inside route handlers and
// renders a uniform problem-details body. ZodErrors become 400s
// with a `errors` array carrying path + message per issue, which
// the Hono validator middleware also surfaces via `defaultHook`.
// =============================================================
import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

import type { ProblemDetails } from '@/api/schemas/common';

export class ApiError extends Error {
  status: number;
  title: string;
  detail?: string;
  type: string;

  constructor(opts: {
    status: number;
    title: string;
    detail?: string;
    type?: string;
    cause?: unknown;
  }) {
    super(opts.detail ?? opts.title);
    this.status = opts.status;
    this.title = opts.title;
    this.detail = opts.detail;
    this.type = opts.type ?? 'about:blank';
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }
}

function statusTitle(status: number): string {
  if (status === 400) return 'Bad Request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not Found';
  if (status === 409) return 'Conflict';
  if (status === 422) return 'Unprocessable Entity';
  if (status === 429) return 'Too Many Requests';
  if (status >= 500) return 'Internal Server Error';
  return 'Error';
}

export function problemFromZod(err: ZodError, instance: string): ProblemDetails {
  return {
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    detail: 'Request validation failed.',
    instance,
    errors: err.issues.map((iss) => ({
      path: iss.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
      message: iss.message,
      code: iss.code,
    })),
  };
}

export const errorHandler: ErrorHandler = (err, c: Context) => {
  const instance = c.req.path;

  if (err instanceof ZodError) {
    const body = problemFromZod(err, instance);
    return c.json(body, 400);
  }

  if (err instanceof ApiError) {
    const body: ProblemDetails = {
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance,
    };
    return c.json(body, err.status as 400 | 401 | 403 | 404 | 409 | 500);
  }

  if (err instanceof HTTPException) {
    const body: ProblemDetails = {
      type: 'about:blank',
      title: statusTitle(err.status),
      status: err.status,
      detail: err.message || statusTitle(err.status),
      instance,
    };
    return c.json(body, err.status);
  }

  console.error('[api] unhandled error', err);
  const body: ProblemDetails = {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: err instanceof Error ? err.message : String(err),
    instance,
  };
  return c.json(body, 500);
};

/**
 * `defaultHook` for OpenAPIHono — fires whenever the validator
 * middleware refuses a request. Re-uses the same problem-details
 * shape so validation errors and uncaught errors look identical
 * to API clients.
 */
export function validationHook(
  result: { success: true } | { success: false; error: ZodError },
  c: Context,
) {
  if (!result.success) {
    const body = problemFromZod(result.error, c.req.path);
    return c.json(body, 400);
  }
}
