// Sentry edge runtime init (middleware, edge routes). Imported from
// `instrumentation.ts` when NEXT_RUNTIME === 'edge'.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
