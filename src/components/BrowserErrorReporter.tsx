// =============================================================
// BrowserErrorReporter — installs window.onerror +
// unhandledrejection handlers and forwards events to
// /api/v1/diag/log-error so a server-side Monitor (tail -F
// /tmp/jetson-browser-errors.log) can stream them in real time.
//
// Mounted once at App root. Renders nothing.
//
// Development aid only. The endpoint is on the public-path allowlist
// so window.onerror can fire before NextAuth resolves a session.
// =============================================================
'use client';

import { useEffect } from 'react';

interface ErrorEnvelope {
  type: 'error' | 'unhandledrejection' | 'fetch_failure';
  message: string;
  stack?: string;
  url?: string;
  lineno?: number;
  colno?: number;
  pageUrl?: string;
  userAgent?: string;
}

async function postError(env: ErrorEnvelope): Promise<void> {
  try {
    await fetch('/api/v1/diag/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive so beacons during page unload still flush
      keepalive: true,
      body: JSON.stringify({
        ...env,
        pageUrl: env.pageUrl ?? window.location.href,
        userAgent: env.userAgent ?? navigator.userAgent,
      }),
    });
  } catch {
    // Never let the reporter break the page.
  }
}

export function BrowserErrorReporter() {
  useEffect(() => {
    function onError(ev: ErrorEvent) {
      void postError({
        type: 'error',
        message: ev.message || 'Unknown error',
        stack: ev.error?.stack,
        url: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
      });
    }
    function onRejection(ev: PromiseRejectionEvent) {
      const reason = ev.reason;
      void postError({
        type: 'unhandledrejection',
        message:
          typeof reason === 'string'
            ? reason
            : reason?.message || JSON.stringify(reason)?.slice(0, 500) || 'Unknown rejection',
        stack: reason?.stack,
      });
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
