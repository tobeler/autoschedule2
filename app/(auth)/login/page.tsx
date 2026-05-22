'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export const dynamic = 'force-dynamic';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setError('Invalid email or password.');
      } else {
        router.replace(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        width: 'min(360px, 92vw)',
        padding: '32px 28px',
        background: 'var(--panel, #1a1d24)',
        border: '1px solid var(--line, #2a2e38)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Jetson · Sign in</h1>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={inputStyle}
        />
      </label>
      {error ? <div style={{ color: '#ff7373', fontSize: 13 }}>{error}</div> : null}
      <button
        type="submit"
        disabled={submitting}
        style={{
          marginTop: 6,
          padding: '10px 14px',
          background: 'var(--accent, #58c089)',
          color: '#0b0e12',
          border: 0,
          borderRadius: 8,
          fontWeight: 600,
          cursor: submitting ? 'wait' : 'pointer',
        }}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg, #0f1115)',
        color: 'var(--fg, #e8eaf0)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: '#0d1015',
  border: '1px solid #2a2e38',
  borderRadius: 6,
  color: 'inherit',
  font: 'inherit',
};
