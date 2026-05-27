// =============================================================
// NextAuth v5 (Auth.js) setup — Google SSO only.
//
// - Drizzle Postgres adapter writes session metadata to Supabase.
// - Google is the single sign-in path. Sign-in is gated by the
//   AUTH_GOOGLE_ALLOWED_DOMAINS allow-list (defaults to jetsonhome.com).
// - Session strategy is 'jwt' so we don't hit the DB on every request
//   (the adapter still owns user CRUD + account linking).
// =============================================================

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import NextAuth, { type DefaultSession } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';

import { db } from '@/lib/db';
import { profiles } from '@/db/schema';

// Optional allow-list for Google sign-ins. Defaults to Jetson's domain;
// override via AUTH_GOOGLE_ALLOWED_DOMAINS (comma-separated). Pass an empty
// string to permit any verified Google account.
const ALLOWED_GOOGLE_DOMAINS = (
  process.env.AUTH_GOOGLE_ALLOWED_DOMAINS ?? 'jetsonhome.com'
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    role?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    // Google OAuth — the only sign-in path. NextAuth v5 reads
    // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET automatically; passing them
    // explicitly here so a missing env raises a clear failure rather
    // than silently rendering a broken button.
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Lets an existing email-based user account (e.g. erik@jetsonhome.com
      // bcrypt-hashed) seamlessly link to its Google identity on first SSO,
      // instead of creating a duplicate user row.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    // Domain gate for Google sign-ins. Credentials flow doesn't hit signIn
    // (only authorize), so this check is Google-specific.
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      if (ALLOWED_GOOGLE_DOMAINS.length === 0) return true;
      const email = (profile?.email ?? '').toLowerCase();
      const domain = email.split('@')[1] ?? '';
      return ALLOWED_GOOGLE_DOMAINS.includes(domain);
    },
    async jwt({ token, user }) {
      if (user && 'id' in user && typeof user.id === 'string') {
        token.uid = user.id;
        // Pull role from profiles table once at sign-in. New Google sign-ins
        // won't have a profile yet — they get the default 'dispatcher' role
        // and can be elevated via Settings → Permissions.
        const prof = await db
          .select({ role: profiles.role })
          .from(profiles)
          .where(eq(profiles.userId, user.id))
          .limit(1);
        token.role = prof[0]?.role ?? 'dispatcher';
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
