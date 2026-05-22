// =============================================================
// Jetson FSM REST API — Hono + Zod-OpenAPI app.
//
// Single OpenAPIHono instance, mounted under /api/v1 by the
// Next.js catchall route at app/api/v1/[[...path]]/route.ts.
//
// Order of middleware matters:
//   1. Error handler (onError) — must wrap everything.
//   2. Auth — resolves an actor before any route runs.
//   3. Request logger — observes the resolved actor + status.
//
// Each routes/*.ts registers its endpoints by calling
// `app.openapi(route, handler)`. Schemas live in schemas/*.ts and
// double as the source of truth for the OpenAPI document.
// =============================================================
import { OpenAPIHono } from '@hono/zod-openapi';

import { authMiddleware, type ApiEnv } from './middleware/auth';
import { errorHandler, validationHook } from './middleware/error';
import { requestLogger } from './middleware/logger';
import { registerApiKeyRoutes } from './routes/apiKeys';
import { registerAuditRoutes } from './routes/audit';
import { registerChecklistRoutes } from './routes/checklists';
import { registerCrewRoutes } from './routes/crews';
import { registerCustomerRoutes } from './routes/customers';
import { registerHealthRoutes } from './routes/health';
import { registerHubspotRoutes } from './routes/hubspot';
import { registerJobRoutes } from './routes/jobs';
import { registerPeopleRoutes } from './routes/people';
import { registerProjectRoutes } from './routes/projects';
import { registerRegionRoutes } from './routes/regions';
import { registerSlotRoutes } from './routes/slots';
import { registerSuggestRoutes } from './routes/suggest';
import { registerTemplateRoutes } from './routes/templates';
import { registerTimeOffRoutes } from './routes/timeoff';
import { registerTruckRoutes } from './routes/trucks';

// `basePath('/api/v1')` lets the catchall route mount us under Next.js's
// /api/v1 prefix while the OpenAPI document still records the correct paths.
export const app = new OpenAPIHono<ApiEnv>({
  defaultHook: validationHook,
}).basePath('/api/v1');

// Global handlers.
app.onError(errorHandler);
app.use('*', authMiddleware);
app.use('*', requestLogger);

// Routes.
registerHealthRoutes(app);
registerJobRoutes(app);
registerSlotRoutes(app);
registerPeopleRoutes(app);
registerCrewRoutes(app);
registerTruckRoutes(app);
registerCustomerRoutes(app);
registerProjectRoutes(app);
registerTemplateRoutes(app);
registerChecklistRoutes(app);
registerTimeOffRoutes(app);
registerRegionRoutes(app);
registerSuggestRoutes(app);
registerHubspotRoutes(app);
registerAuditRoutes(app);
registerApiKeyRoutes(app);

// OpenAPI document. Bearer auth + cookie session both supported.
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Jetson FSM API',
    version: '1.0.0',
    description:
      'REST surface for the Jetson field-service-management app. Generated from Zod schemas at build time. Auth: NextAuth session cookie OR `Authorization: Bearer <api_key>`.',
  },
  servers: [{ url: '/' }],
});

export type App = typeof app;
