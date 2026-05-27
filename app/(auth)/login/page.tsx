'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export const dynamic = 'force-dynamic';

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const oauthError = params.get('error');

  // Auth.js error codes for SSO. Most common when a non-allow-listed
  // domain tries to sign in (AccessDenied via the signIn callback).
  const errorMessage = oauthError
    ? oauthError === 'AccessDenied'
      ? 'Your Google account is not on the allow-list for this app.'
      : 'Sign-in failed. Try again, or contact your administrator.'
    : null;

  return (
    <div
      style={{
        width: 'min(360px, 92vw)',
        padding: '32px 28px',
        background: '#1a1d24',
        border: '1px solid #2a2e38',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        color: '#e8eaf0',
      }}
    >
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          margin: 0,
          color: '#ffffff',
        }}
      >
        Jetson · Sign in
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: '#b4b8c0',
          lineHeight: 1.5,
        }}
      >
        Use your <strong style={{ color: '#e8eaf0' }}>@jetsonhome.com</strong>{' '}
        Google account.
      </p>
      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
          padding: '10px 14px',
          background: '#fff',
          color: '#1f1f1f',
          border: '1px solid #d0d3d8',
          borderRadius: 8,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.19 3.32v2.76h3.54c2.07-1.91 3.29-4.73 3.29-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.76c-.98.66-2.23 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.18v2.85A11 11 0 0 0 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.83 14.08A6.6 6.6 0 0 1 5.5 12c0-.73.12-1.43.33-2.08V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.65-2.85z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.05 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.65 2.85C6.7 7.31 9.13 5.38 12 5.38z"
          />
        </svg>
        Sign in with Google
      </button>
      {errorMessage ? (
        <div
          style={{
            color: '#ff7373',
            fontSize: 13,
            padding: '8px 10px',
            background: 'rgba(255, 115, 115, 0.08)',
            borderRadius: 6,
          }}
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

// SSR-safe placeholder for the Suspense boundary. The LoginForm body
// uses `useSearchParams` which forces client-side rendering, so without
// a fallback the user saw a dark blank page for ~200ms during hydration.
// This skeleton renders the exact same shell from the server so the
// "page didn't load" perception goes away.
function LoginFallback() {
  return (
    <div
      style={{
        width: 'min(360px, 92vw)',
        padding: '32px 28px',
        background: '#1a1d24',
        border: '1px solid #2a2e38',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        color: '#e8eaf0',
      }}
    >
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          margin: 0,
          color: '#ffffff',
        }}
      >
        Jetson · Sign in
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: '#b4b8c0',
          lineHeight: 1.5,
        }}
      >
        Use your <strong style={{ color: '#e8eaf0' }}>@jetsonhome.com</strong>{' '}
        Google account.
      </p>
      <div
        style={{
          marginTop: 4,
          padding: '10px 14px',
          background: '#f4f4f4',
          border: '1px solid #d0d3d8',
          borderRadius: 8,
          textAlign: 'center',
          color: '#888',
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0f1115',
        color: '#e8eaf0',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
