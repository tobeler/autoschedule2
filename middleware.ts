// =============================================================
// Auth gate. Anything that isn't `/login`, the NextAuth API
// endpoints, or a Next.js / public asset path requires a session
// — otherwise we redirect to /login with the original URL kept
// in `callbackUrl` so the user lands back where they came from.
// =============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { auth } from './auth';

// `/api/cron` is public at the middleware layer because Vercel Cron's
// `Authorization: Bearer <CRON_SECRET>` header doesn't carry a NextAuth
// session — the route handlers under /api/cron/* validate CRON_SECRET
// themselves and 401 anything else.
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/cron'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// Demo bypass: when NEXTAUTH_SECRET is unset (auth not yet wired into
// a real Supabase project) OR DEMO_MODE === 'true', skip the auth gate.
// This lets us run a demo from a laptop without a real DB.
const DEMO_BYPASS =
  !process.env.NEXTAUTH_SECRET || process.env.DEMO_MODE === 'true';

// next-auth v5's `auth()` returns a wrapped request that includes
// `req.auth` when a valid session cookie is present.
export default auth((req: NextRequest & { auth: unknown }) => {
  if (DEMO_BYPASS) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (req.auth) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('callbackUrl', pathname + search);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  // Run on every path except Next.js internals + static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|logos/).*)'],
};
