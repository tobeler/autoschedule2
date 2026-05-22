// Sentry Node SDK init. Imported from `instrumentation.ts` when the
// Next.js node runtime starts. Safe to leave DSN empty pre-launch.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
