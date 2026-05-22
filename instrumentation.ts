// Next.js instrumentation hook — registers Sentry per-runtime.
// Runs once on the server / edge at boot. The client SDK is initialized
// from `sentry.client.config.ts` via @sentry/nextjs.
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
