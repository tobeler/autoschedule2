// =============================================================
// NextAuth v5 (Auth.js) setup.
//
// - Drizzle Postgres adapter writes session metadata to Supabase.
// - Credentials provider does an email + bcrypt-password lookup
//   against our `users` table.
// - Session strategy is 'jwt' so we don't hit the DB on every
//   request (the adapter still owns user CRUD + account linking).
// =============================================================

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import NextAuth, { type DefaultSession } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import { db } from '@/lib/db';
import { profiles, users } from '@/db/schema';

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
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string'
            ? credentials.email.trim().toLowerCase()
            : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        const row = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const user = row[0];
        if (!user?.hashedPassword) return null;

        const ok = await bcrypt.compare(password, user.hashedPassword);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && 'id' in user && typeof user.id === 'string') {
        token.uid = user.id;
        // Pull role from profiles table once at sign-in.
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
